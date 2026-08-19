import "server-only";
import { siteUrl } from "@/lib/site-url";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin-client";
import type { FranchiseInquiry } from "@/lib/franchise/inquiry";
import { emailConfigured, sendEmail, type EmailResult } from "./client";

/**
 * Telling somebody a franchise lead arrived.
 *
 * WHY THIS EXISTS WHEN THE ROW ALREADY DOES.
 * ================================================================
 * `lib/franchise/submit.ts` stores the lead and says, correctly, that a lead
 * stored and not emailed is merely waiting to be looked at. The gap it leaves
 * is that somebody has to think to look. A franchise inquiry is worth
 * PHP 1,000,000 of fee to this business and arrives a few times a week, which
 * is exactly the rate at which a screen stops being checked. So the row stays
 * the system of record and this is the nudge.
 *
 * TWO SWITCHES, DOING DIFFERENT JOBS.
 * `RESEND_API_KEY` and `RESEND_FROM` decide whether sending is POSSIBLE. Absent,
 * this is dark and the form behaves exactly as it did before any of this
 * existed. `app_settings.email_enabled` decides whether it is WANTED, and lives
 * in the database precisely so the owner can silence it without a deployment,
 * the same way `paymongo_enabled` gates payments in `lib/customer/payment.ts`.
 *
 * THE LEAD'S DETAILS ARE IN THE MESSAGE AND NEVER IN A LOG.
 * The owner chose the full inquiry in the body so a reply can be written from a
 * phone without opening the workspace. That is a reasonable trade and it is
 * theirs to make. What it does not license is a second copy in the logs, which
 * have different access rules to both the table and the mailbox, so every
 * failure path here logs a reason and nothing else.
 */

export type FranchiseAlertResult =
  | { ok: true }
  | { ok: false; reason: "unconfigured" | "disabled" | "send_failed" };

/** Written out rather than left blank, so an empty line reads as an answer. */
const NOT_GIVEN = "Not given";

/**
 * The owner's inbox. Falls back to the address the site publishes for franchise
 * enquiries, which is the right default: it is already the place a customer is
 * told to write to.
 */
function alertRecipient(): string {
  return process.env.FRANCHISE_ALERT_TO?.trim() || "franchise@5bdf.ph";
}

/**
 * Is email switched on by the owner?
 *
 * A failed read returns false rather than true. The alternative, treating an
 * unreadable settings row as permission to send, would mean a database wobble
 * starts mailing a stranger's contact details around. Silence is the safer
 * failure here, and the lead is still in the table either way.
 */
async function emailEnabled(): Promise<boolean> {
  if (!adminConfigured()) return false;

  const { data, error } = await createAdminClient()
    .from("app_settings")
    .select("email_enabled")
    .eq("id", 1)
    .single();

  if (error || !data) {
    console.error("[email] could not read app_settings.email_enabled:", error?.message);
    return false;
  }

  return data.email_enabled === true;
}

/** Escapes the four characters that would otherwise let a lead write markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The message itself.
 *
 * The subject carries the name and the city because that is what a phone shows
 * on a lock screen, and it is enough to tell a real enquiry in Cebu from an
 * obvious test without opening anything.
 */
export function franchiseAlertMessage(inquiry: FranchiseInquiry) {
  const city = inquiry.city?.trim() || NOT_GIVEN;
  const message = inquiry.message?.trim() || NOT_GIVEN;
  const leadsUrl = `${siteUrl()}/workspace/franchise`;

  const subject = `Franchise inquiry: ${inquiry.name} (${city})`;

  const text = [
    "A new franchise inquiry arrived.",
    "",
    `Name:    ${inquiry.name}`,
    `Email:   ${inquiry.email}`,
    `Phone:   ${inquiry.phone}`,
    `City:    ${city}`,
    "",
    "Message:",
    message,
    "",
    "Reply to this email and it goes straight to them.",
    "",
    `All leads: ${leadsUrl}`,
  ].join("\n");

  const html = [
    "<p>A new franchise inquiry arrived.</p>",
    "<table cellpadding=\"4\">",
    `<tr><td><strong>Name</strong></td><td>${escapeHtml(inquiry.name)}</td></tr>`,
    `<tr><td><strong>Email</strong></td><td>${escapeHtml(inquiry.email)}</td></tr>`,
    `<tr><td><strong>Phone</strong></td><td>${escapeHtml(inquiry.phone)}</td></tr>`,
    `<tr><td><strong>City</strong></td><td>${escapeHtml(city)}</td></tr>`,
    "</table>",
    `<p><strong>Message</strong><br>${escapeHtml(message)}</p>`,
    "<p>Reply to this email and it goes straight to them.</p>",
    `<p><a href="${leadsUrl}">All leads</a></p>`,
  ].join("");

  return { subject, text, html };
}

/**
 * Composes and sends the alert. Resolves in every case, rejects in none.
 *
 * `replyTo` is the inquirer, which is the single detail that makes replying
 * from an inbox actually work. Without it a reply goes to the sending address,
 * which nobody reads, and the owner copies an address out of the body by hand
 * on every lead until they stop bothering.
 */
export async function sendFranchiseAlert(
  inquiry: FranchiseInquiry,
): Promise<FranchiseAlertResult> {
  try {
    if (!emailConfigured()) return { ok: false, reason: "unconfigured" };
    if (!(await emailEnabled())) return { ok: false, reason: "disabled" };

    const { subject, text, html } = franchiseAlertMessage(inquiry);
    const result: EmailResult = await sendEmail({
      to: [alertRecipient()],
      subject,
      text,
      html,
      replyTo: inquiry.email,
    });

    return result.ok ? { ok: true } : { ok: false, reason: result.reason };
  } catch (error) {
    // Belt and braces over `sendEmail`'s own promise never to throw. This runs
    // under `after()`, where an escaping rejection is an unhandled one.
    console.error(
      "[email] franchise alert failed:",
      error instanceof Error ? error.message : "unknown",
    );
    return { ok: false, reason: "send_failed" };
  }
}
