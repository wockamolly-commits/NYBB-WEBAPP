import { LegalPage, LegalSection } from "@/components/legal/LegalDocument";
import { hasPending } from "@/lib/content/markup";
import type { LegalContent } from "@/lib/content/schema";
import { RichText, type RichTextStyles } from "./RichText";

/**
 * The Privacy Policy or the Terms of Service, from its stored content.
 *
 * The same component renders the live page, the Workspace preview of a draft,
 * and nothing else, so what an editor previews is the page visitors get.
 *
 * Subheadings take the weight the hand-built LegalSubsection gave them, and
 * links take the ink underline both pages used before the editor existed.
 */
const STYLES: RichTextStyles = {
  heading: "text-nybb-ink pt-2 text-lg font-semibold",
  strong: "text-nybb-ink",
  link: "text-nybb-ink decoration-nybb-ink/40 hover:decoration-nybb-ink",
  orderedList: "list-decimal pl-5",
};

export function LegalContentView({
  content,
  sibling,
}: {
  content: LegalContent;
  sibling: { href: string; label: string };
}) {
  const draft =
    content.date === "" ||
    hasPending(content.intro) ||
    content.sections.some((section) => hasPending(section.body));

  return (
    <LegalPage
      title={content.title}
      sibling={sibling}
      dateLabel={content.dateLabel}
      date={content.date}
      draft={draft}
      intro={content.intro ? <RichText source={content.intro} styles={STYLES} /> : null}
    >
      {content.sections.map((section) => (
        <LegalSection key={section.id} id={section.id} title={section.title}>
          <RichText source={section.body} styles={STYLES} />
        </LegalSection>
      ))}
    </LegalPage>
  );
}
