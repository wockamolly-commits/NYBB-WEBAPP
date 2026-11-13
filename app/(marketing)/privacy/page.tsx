import type { Metadata } from "next";
import { LegalContentView } from "@/components/content/LegalContentView";
import { getPageContent } from "@/lib/content/read";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How 5 Brad's Dragon Food Corporation collects, uses, shares and protects your personal data under the Data Privacy Act of 2012.",
};

/**
 * The Privacy Policy.
 *
 * The text is edited from /workspace/content by anybody holding
 * content:manage. Until something is published there, and whenever the
 * published copy cannot be read, the page shows DEFAULT_PRIVACY in
 * lib/content/defaults.ts: the company's own Privacy Notice, supplied by the
 * owner as "NY Privacy Policy.pdf" (Last Updated February 18, 2026), copied as
 * written with two edits (the one em dash in section 1 became a comma, and the
 * second of two subsections both numbered "2.2" is numbered 2.3).
 *
 * The NPC seal in section 11 is placed by the {{npc-seal}} line in the text.
 */
export default async function PrivacyPage() {
  const content = await getPageContent("privacy");
  return <LegalContentView content={content} sibling={{ href: "/terms", label: "Terms of Service" }} />;
}
