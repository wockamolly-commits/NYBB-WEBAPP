"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { sendFranchiseAlert } from "@/lib/email/franchise-alert";
import {
  franchiseInquirySchema,
  firstIssue,
  looksAutomated,
  HONEYPOT_FIELD,
  type FranchiseInquiryState,
} from "@/lib/franchise/inquiry";
import { storeFranchiseInquiry } from "@/lib/franchise/submit";
import { clientAddress } from "@/lib/rate-limit/address";

/**
 * The franchise form's only mutation.
 *
 * This file exports one async function and nothing else. A `"use server"` file
 * may only export async functions, and exporting the schema or the honeypot
 * name from here would type-check, pass unit tests, and then fail `npm run
 * build` on the React Server Component boundary. They live in
 * `lib/franchise/inquiry.ts`, which both this and the form import.
 */
export async function submitFranchiseInquiry(
  _previous: FranchiseInquiryState,
  formData: FormData,
): Promise<FranchiseInquiryState> {
  // Answered honeypot: tell it the same thing a person is told and write
  // nothing. Saying "you are a bot" only teaches the author which field to
  // leave alone next time.
  if (looksAutomated(formData.get(HONEYPOT_FIELD))) {
    return { status: "sent" };
  }

  const raw = {
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    city: formData.get("city") || undefined,
    message: formData.get("message") || undefined,
  };

  const parsed = franchiseInquirySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: "error",
      message: firstIssue(parsed.error),
      // Handing the typed values back so a refusal over one field does not
      // empty the other four. A franchise inquiry is a long form to retype and
      // somebody who has to do it twice does not.
      values: {
        name: typeof raw.name === "string" ? raw.name : undefined,
        email: typeof raw.email === "string" ? raw.email : undefined,
        phone: typeof raw.phone === "string" ? raw.phone : undefined,
        city: typeof raw.city === "string" ? raw.city : undefined,
        message: typeof raw.message === "string" ? raw.message : undefined,
      },
    };
  }

  const result = await storeFranchiseInquiry(parsed.data, clientAddress(await headers()));
  if (!result.ok) {
    return { status: "error", message: result.message, values: parsed.data };
  }

  // AFTER the store, and only on success. The row is the system of record and
  // the mail is a nudge toward it, so a lead is never traded for an alert.
  //
  // Handed to `after()` rather than awaited, for two reasons. The person who
  // filled the form should see their confirmation without waiting on a mail
  // provider, and a detached promise is killed mid-flight on Vercel, surfacing
  // its ECONNRESET on somebody else's later request. `sendFranchiseAlert`
  // resolves in every case, so nothing here can reject.
  //
  // The service stays free of Next imports and the adapter owns `after()`,
  // which is the same split `app/actions/payment.ts` uses for the counter's
  // new-order push.
  after(sendFranchiseAlert(parsed.data));

  return { status: "sent" };
}
