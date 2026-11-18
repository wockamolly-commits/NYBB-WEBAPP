import { siteUrl } from "@/lib/site-url";
import type { FranchiseInquiry } from "@/lib/franchise/inquiry";

/**
 * The franchise lead alert, as a subject, a plain text body and an HTML body.
 *
 * Kept apart from the sending code so the layout can be read, tested and
 * previewed without a mail provider or a database in the way.
 *
 * WHY IT LOOKS THE WAY IT DOES.
 * ================================================================
 * The reader is the owner on a phone, deciding whether to call somebody back.
 * So the order is: who (the name, large), where (the city), then the two things
 * they are most likely to do next (reply, call) as buttons big enough for a
 * thumb, then the details, then the message. The workspace link sits last
 * because the email already carries everything the row does.
 *
 * WHY IT IS BUILT LIKE A WEBSITE FROM 2005.
 * Mail clients are not browsers. Gmail strips `<style>` blocks in some views,
 * Outlook on Windows renders with Word's engine, and none of them run the CSS a
 * page would. Tables for layout, every style inline, and no images: a lock
 * screen preview and a client that blocks images both still read correctly,
 * and there is nothing to host or to go missing later.
 */

/** Written out rather than left blank, so an empty line reads as an answer. */
const NOT_GIVEN = "Not given";

/** Brand colours, copied from `app/globals.css` because mail cannot read it. */
const INK = "#0b0b0c";
const ORANGE = "#ef6212";
const BONE = "#f5f1ea";
const CREAM = "#faf3e3";
const PARCHMENT = "#f2e4c6";
const MUTED = "#6b6258";
const RULE = "#e8dcc3";
const HEAT = ["#f9ee18", "#f7c115", "#f47621", "#ef4a17", "#ee2329"];

const SANS = "Helvetica, Arial, sans-serif";
const DISPLAY = "'Arial Black', 'Helvetica Neue', Arial, sans-serif";

/** Escapes the characters that would otherwise let a lead write markup. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A dialable `tel:` target, or null when the field holds nothing to dial.
 *
 * The phone field is free text on purpose (see `lib/franchise/inquiry.ts`), so
 * this keeps the digits and a leading plus and drops everything else. Fewer
 * than seven digits is not a number anybody can call, and a Call button that
 * does nothing is worse than no button.
 */
export function telHref(phone: string): string | null {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}

/** When the lead arrived, in the business's own time zone. */
function manilaTime(at: Date): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(at);
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** One label and value pair in the details card. */
function detailRow(label: string, valueHtml: string, last = false): string {
  const border = last ? "" : `border-bottom:1px solid ${RULE};`;
  return [
    "<tr>",
    `<td style="padding:12px 0;${border}font-family:${SANS};">`,
    `<div style="font-size:11px;line-height:16px;letter-spacing:1.2px;text-transform:uppercase;color:${MUTED};font-weight:bold;">${label}</div>`,
    `<div style="font-size:16px;line-height:24px;color:${INK};">${valueHtml}</div>`,
    "</td>",
    "</tr>",
  ].join("");
}

/** A tappable button. Solid for the main action, outlined for the rest. */
function button(label: string, href: string, solid: boolean): string {
  const background = solid ? ORANGE : "#ffffff";
  const border = solid ? ORANGE : INK;
  return [
    `<td style="padding:0 8px 8px 0;">`,
    `<a href="${href}" style="display:inline-block;padding:13px 22px;border-radius:999px;`,
    `background:${background};border:2px solid ${border};color:${INK};`,
    `font-family:${SANS};font-size:15px;line-height:18px;font-weight:bold;text-decoration:none;">`,
    `${label}</a>`,
    "</td>",
  ].join("");
}

/**
 * The message itself.
 *
 * The subject carries the name and the city because that is what a phone shows
 * on a lock screen, and it is enough to tell a real enquiry in Cebu from an
 * obvious test without opening anything. `receivedAt` is a parameter only so a
 * test can pin it.
 */
export function franchiseAlertMessage(inquiry: FranchiseInquiry, receivedAt: Date = new Date()) {
  const city = inquiry.city?.trim() || NOT_GIVEN;
  const message = inquiry.message?.trim() || NOT_GIVEN;
  const hasCity = city !== NOT_GIVEN;
  const hasMessage = message !== NOT_GIVEN;
  const leadsUrl = `${siteUrl()}/workspace/franchise`;
  const when = manilaTime(receivedAt);
  const tel = telHref(inquiry.phone);
  const first = firstName(inquiry.name);

  const subject = `Franchise inquiry: ${inquiry.name} (${city})`;

  const text = [
    "NY BUFFALO BRAD'S | NEW FRANCHISE LEAD",
    when,
    "",
    `Name:    ${inquiry.name}`,
    `Email:   ${inquiry.email}`,
    `Phone:   ${inquiry.phone}`,
    `City:    ${city}`,
    "",
    "Message:",
    message,
    "",
    `Reply to this email and it goes straight to ${first}.`,
    "",
    `All leads: ${leadsUrl}`,
  ].join("\n");

  // Shown by most inboxes beside the subject, before the mail is opened.
  const preheader = hasMessage
    ? `${inquiry.name}${hasCity ? ` from ${city}` : ""}: ${message.slice(0, 90)}`
    : `${inquiry.name}${hasCity ? ` from ${city}` : ""} wants to talk about a franchise.`;

  const replySubject = encodeURIComponent("Your NY Buffalo Brad's franchise inquiry");
  const mailto = `mailto:${escapeHtml(inquiry.email)}?subject=${replySubject}`;

  const buttons = [
    button(`Reply to ${escapeHtml(first)}`, mailto, true),
    tel ? button("Call", tel, false) : "",
  ].join("");

  const messageHtml = hasMessage
    ? escapeHtml(message).replace(/\r?\n/g, "<br>")
    : `<span style="color:${MUTED};font-style:italic;">They did not leave a message.</span>`;

  const heatStripe = HEAT.map(
    (colour) =>
      `<td height="6" style="height:6px;line-height:6px;font-size:0;background:${colour};">&nbsp;</td>`,
  ).join("");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PARCHMENT};">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:${PARCHMENT};font-size:1px;line-height:1px;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PARCHMENT};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;">

<tr><td style="background:${INK};padding:18px 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="font-family:${DISPLAY};font-size:15px;line-height:20px;font-weight:900;letter-spacing:0.8px;color:${BONE};text-transform:uppercase;white-space:nowrap;">NY Buffalo Brad's</td>
<td align="right"><span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${ORANGE};color:${INK};font-family:${SANS};font-size:10px;line-height:14px;font-weight:bold;letter-spacing:1px;white-space:nowrap;text-transform:uppercase;">Franchise lead</span></td>
</tr></table>
</td></tr>

<tr><td style="padding:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${heatStripe}</tr></table></td></tr>

<tr><td style="padding:26px 24px 8px;font-family:${SANS};">
<div style="font-size:13px;line-height:18px;color:${MUTED};">New inquiry &middot; ${escapeHtml(when)}</div>
<div style="padding-top:8px;font-family:${DISPLAY};font-size:28px;line-height:34px;font-weight:900;color:${INK};">${escapeHtml(inquiry.name)}</div>
<div style="padding-top:4px;font-size:16px;line-height:22px;color:${hasCity ? INK : MUTED};">${hasCity ? `Wants a franchise in <strong>${escapeHtml(city)}</strong>` : "No location given"}</div>
</td></tr>

<tr><td style="padding:16px 24px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${buttons}</tr></table>
</td></tr>

<tr><td style="padding:0 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};border-radius:10px;">
<tr><td style="padding:6px 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${detailRow("Email", `<a href="${mailto}" style="color:${INK};text-decoration:underline;">${escapeHtml(inquiry.email)}</a>`)}
${detailRow("Phone", tel ? `<a href="${tel}" style="color:${INK};text-decoration:underline;">${escapeHtml(inquiry.phone)}</a>` : escapeHtml(inquiry.phone))}
${detailRow("Location", hasCity ? escapeHtml(city) : `<span style="color:${MUTED};">${NOT_GIVEN}</span>`, true)}
</table>
</td></tr>
</table>
</td></tr>

<tr><td style="padding:24px 24px 0;font-family:${SANS};">
<div style="font-size:11px;line-height:16px;letter-spacing:1.2px;text-transform:uppercase;color:${MUTED};font-weight:bold;">Their message</div>
<div style="margin-top:8px;padding:16px 20px;background:${CREAM};border-radius:10px;font-size:16px;line-height:24px;color:${INK};">${messageHtml}</div>
</td></tr>

<tr><td style="padding:28px 24px 26px;font-family:${SANS};">
<div style="border-top:1px solid ${RULE};padding-top:18px;font-size:14px;line-height:21px;color:${INK};">
Hit reply and your answer goes straight to ${escapeHtml(first)}.<br>
<a href="${leadsUrl}" style="color:${INK};font-weight:bold;text-decoration:underline;">See every lead in the workspace</a>
</div>
</td></tr>

</table>
<div style="max-width:600px;padding:14px 12px 0;font-family:${SANS};font-size:12px;line-height:18px;color:${MUTED};text-align:center;">
Sent automatically when somebody submits the franchise form. The lead is saved in the workspace whether or not this email arrives.
</div>
</td></tr>
</table>
</body>
</html>`;

  return { subject, text, html };
}
