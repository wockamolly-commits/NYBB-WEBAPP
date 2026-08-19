import "server-only";
import { createPublicClient, supabaseConfigured } from "@/lib/supabase/public-client";
import { withinAddressLimit } from "@/lib/rate-limit/limiter";
import type { FranchiseInquiry } from "./inquiry";

/**
 * Storing a franchise lead.
 *
 * The write goes through `submit_franchise_inquiry`, a SECURITY DEFINER
 * function, because the public has no insert grant on `franchise_inquiries` and
 * should not get one. That is the same shape every other public write in this
 * schema uses.
 *
 * THE MAIL IS SENT ELSEWHERE, AND DELIBERATELY NOT FROM HERE.
 * ================================================================
 * Spec N9 asks for a mail to franchise@5bdf.ph alongside the row, and since
 * 2026-08-18 there is one: `lib/email/franchise-alert.ts` composes it and
 * `app/(marketing)/franchise/actions.ts` hands it to `after()` once this
 * function has returned ok.
 *
 * It is not called from here, for the same reason `lib/customer/payment.ts`
 * does not call `notifyStaffOfNewOrder`: this file is framework-neutral and
 * `after()` belongs to the adapter that has a request in flight. Keeping the
 * split means these rules stay testable without a Next request.
 *
 * The ordering is the part worth protecting. The row is the system of record
 * and the mail is a convenience on top of it: a lead that is emailed and not
 * stored is lost the moment somebody deletes the mail, and a lead that is
 * stored and not emailed is merely waiting to be looked at. So the mail is
 * attempted only after a successful store, and its failure is logged rather
 * than raised.
 */

/**
 * Twelve submissions per hour from one address.
 *
 * Higher than it sounds because of what the address means here. Philippine
 * carrier-grade NAT and office networks put many unrelated people behind one
 * address, and `lib/rate-limit/limiter.ts` explains why the project biases
 * toward letting a real person through. A franchise inquiry is rarer than an
 * order, so this sits well above any plausible human rate while still making a
 * scripted flood pointless.
 */
const INQUIRY_LIMIT = 12;
const INQUIRY_WINDOW_SECONDS = 3600;

export type FranchiseSubmitResult = { ok: true } | { ok: false; message: string };

const unavailable =
  "We could not send your inquiry. Please try again, or email franchise@5bdf.ph directly.";

const throttled =
  "That is a lot of inquiries from one connection. Wait a little and try again, or email franchise@5bdf.ph.";

export async function storeFranchiseInquiry(
  inquiry: FranchiseInquiry,
  address: string | null,
): Promise<FranchiseSubmitResult> {
  const allowed = await withinAddressLimit({
    action: "franchise_inquiry",
    address,
    limit: INQUIRY_LIMIT,
    windowSeconds: INQUIRY_WINDOW_SECONDS,
  });
  if (!allowed) return { ok: false, message: throttled };

  if (!supabaseConfigured()) return { ok: false, message: unavailable };

  const { data, error } = await createPublicClient().rpc("submit_franchise_inquiry", {
    p_name: inquiry.name,
    p_email: inquiry.email,
    p_phone: inquiry.phone,
    p_city: inquiry.city ?? null,
    p_message: inquiry.message ?? null,
  });

  if (error) {
    // The lead's own contents are not logged. This is a stranger's name, email
    // and phone number, and a log line is a second copy of it in a place with
    // different access rules to the table it was refused from.
    console.error("[franchise] submit_franchise_inquiry failed:", error.message);
    return { ok: false, message: unavailable };
  }

  // The function returns false for input it will not store. The app validated
  // first, so reaching this means the two disagree, which is worth a log.
  if (data !== true) {
    console.error("[franchise] submit_franchise_inquiry refused a validated inquiry");
    return { ok: false, message: unavailable };
  }

  return { ok: true };
}
