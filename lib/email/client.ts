import "server-only";
import { Resend } from "resend";

/**
 * The mail provider, wrapped so nothing above it has to know there is one.
 *
 * IT NEVER THROWS, AND THAT IS THE WHOLE JOB.
 * ================================================================
 * Every caller is downstream of something that already succeeded: a franchise
 * lead is in the database before a word of mail is composed. So a mail failure
 * must be a logged non-event, never an exception travelling back up into a
 * Server Action that has already told somebody their inquiry was sent. This
 * mirrors `lib/push/web.ts`, which makes the same promise for the same reason.
 *
 * WHY THE CLIENT IS BUILT PER CALL RATHER THAN ONCE AT MODULE SCOPE.
 * A module-scope client reads the API key when the module first loads, which on
 * a serverless platform can be a cold start in a different environment to the
 * one serving the request. Building it here keeps the key read next to its use,
 * and a franchise inquiry arrives rarely enough that the allocation is free.
 */

export type EmailResult =
  | { ok: true }
  /** No API key or no from address. Not a failure, a feature that is off. */
  | { ok: false; reason: "unconfigured" }
  | { ok: false; reason: "send_failed" };

/** Both halves are required. A key with no from address cannot send anything. */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM?.trim());
}

export type OutgoingEmail = {
  to: string[];
  subject: string;
  text: string;
  html: string;
  /** Where a reply goes, which is rarely the address it was sent from. */
  replyTo?: string;
};

/**
 * Sends one message, or explains why it did not.
 *
 * Nothing about the message is logged on failure: `subject`, `text` and `html`
 * carry whatever the caller put in them, and for the one caller that exists
 * today that is a stranger's name, email address and phone number. The provider
 * error message is logged alone, which is the part that says what to fix.
 */
export async function sendEmail(message: OutgoingEmail): Promise<EmailResult> {
  if (!emailConfigured()) return { ok: false, reason: "unconfigured" };

  try {
    const resend = new Resend(process.env.RESEND_API_KEY as string);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM as string,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    });

    if (error) {
      console.error("[email] send refused by provider:", error.message);
      return { ok: false, reason: "send_failed" };
    }

    return { ok: true };
  } catch (error) {
    console.error(
      "[email] send threw:",
      error instanceof Error ? error.message : "unknown",
    );
    return { ok: false, reason: "send_failed" };
  }
}
