import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getPageState } from "@/lib/content/admin";
import { CONTENT_PAGE_INFO, isContentPage } from "@/lib/content/schema";
import { requireStaffPermission } from "@/lib/staff/session";
import { readErrorMessage } from "../format";
import { ContentEditor } from "./ContentEditor";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ page: string }>;
}): Promise<Metadata> {
  const { page } = await params;
  return { title: isContentPage(page) ? `Edit ${CONTENT_PAGE_INFO[page].name}` : "Website content" };
}

/** One page's editor, gated on content:manage like the list it opens from. */
export default async function WorkspaceContentEditorPage({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  await requireStaffPermission("content:manage", `/workspace/content/${page}`);
  if (!isContentPage(page)) notFound();

  const info = CONTENT_PAGE_INFO[page];
  const result = await getPageState(page);

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/workspace/content"
        className="text-nybb-bone/70 hover:text-nybb-bone inline-flex min-h-11 items-center gap-1.5 text-sm"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Website content
      </Link>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h1 className="font-display heading-major">{info.name}</h1>
        <a
          href={info.path}
          target="_blank"
          rel="noopener"
          className="text-nybb-bone/70 hover:text-nybb-bone text-sm underline underline-offset-4"
        >
          Open the live page<span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
      <p className="text-nybb-bone/70 mt-3 max-w-2xl leading-relaxed">{info.summary}</p>

      {result.ok ? (
        <>
          {result.state.unreadable ? (
            <p role="alert" className="text-nybb-red mt-6 text-sm">
              A saved version of this page could not be read, so the form starts from the original
              text. Publishing will replace it.
            </p>
          ) : null}
          <ContentEditor
            page={page}
            live={result.state.live}
            draft={result.state.draft}
            meta={{
              customised: result.state.customised,
              publishedAt: result.state.publishedAt,
              publishedBy: result.state.publishedBy,
              hasDraft: result.state.draft !== null,
              draftSavedAt: result.state.draftSavedAt,
              draftSavedBy: result.state.draftSavedBy,
            }}
          />
        </>
      ) : (
        <p role="alert" className="text-nybb-red mt-8 text-sm">
          {readErrorMessage(result.error)}
        </p>
      )}
    </div>
  );
}
