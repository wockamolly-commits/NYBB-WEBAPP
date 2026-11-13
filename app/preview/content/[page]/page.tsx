import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AboutView } from "@/app/(marketing)/about/AboutView";
import { HomeView } from "@/app/(marketing)/HomeView";
import { LegalContentView } from "@/components/content/LegalContentView";
import { StorefrontChrome } from "@/components/site/StorefrontChrome";
import { getPageState } from "@/lib/content/admin";
import { CONTENT_PAGE_INFO, isContentPage, type ContentFor, type ContentPage } from "@/lib/content/schema";
import { requireStaffPermission } from "@/lib/staff/session";
import { getTheme } from "@/lib/themes/read";

export const metadata: Metadata = {
  title: "Content preview",
  robots: { index: false, follow: false },
};

/**
 * The real page, wearing the saved draft instead of the published text.
 *
 * Staff with content:manage only. It renders the same view component the
 * public route does, inside the same chrome and the live seasonal theme, so
 * the only difference between this and what visitors will see after
 * publishing is the strip across the top.
 *
 * It reads the SAVED draft, not the form, which is why the editor asks for a
 * save before it offers this link. With no draft it shows what is live.
 */
export default async function ContentPreviewPage({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  await requireStaffPermission("content:manage", `/workspace/content/${page}`);
  if (!isContentPage(page)) notFound();

  const [result, theme] = await Promise.all([getPageState(page), getTheme()]);
  if (!result.ok) notFound();
  const { draft, live } = result.state;

  return (
    <StorefrontChrome
      theme={theme}
      notice={<PreviewNotice page={page} isDraft={draft !== null} />}
    >
      <View page={page} content={draft ?? live} />
    </StorefrontChrome>
  );
}

function View<P extends ContentPage>({ page, content }: { page: P; content: ContentFor[P] }) {
  switch (page) {
    case "home":
      return <HomeView content={content as ContentFor["home"]} />;
    case "about":
      return <AboutView content={content as ContentFor["about"]} />;
    case "privacy":
      return (
        <LegalContentView
          content={content as ContentFor["privacy"]}
          sibling={{ href: "/terms", label: "Terms of Service" }}
        />
      );
    default:
      return (
        <LegalContentView
          content={content as ContentFor["terms"]}
          sibling={{ href: "/privacy", label: "Privacy Policy" }}
        />
      );
  }
}

function PreviewNotice({ page, isDraft }: { page: ContentPage; isDraft: boolean }) {
  const info = CONTENT_PAGE_INFO[page];
  return (
    <div className="bg-nybb-yellow text-nybb-ink border-nybb-ink sticky top-0 z-[55] border-b-2">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 text-sm sm:px-6">
        <p className="font-medium">
          {isDraft
            ? `Draft preview: ${info.name}. Visitors do not see this until it is published.`
            : `${info.name} has no saved draft, so this is the live text.`}
        </p>
        <Link href={`/workspace/content/${page}`} className="font-medium underline underline-offset-2">
          Back to the editor
        </Link>
      </div>
    </div>
  );
}
