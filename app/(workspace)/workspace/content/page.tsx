import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { listPageStates } from "@/lib/content/admin";
import { CONTENT_PAGE_INFO } from "@/lib/content/schema";
import { requireStaffPermission } from "@/lib/staff/session";
import { manilaDateTime, readErrorMessage } from "./format";

export const metadata: Metadata = { title: "Website content" };

/**
 * The four pages whose words can be edited, gated on content:manage.
 *
 * Each row says what visitors see now and whether a draft is waiting. The
 * editing itself happens one page at a time, behind the row.
 */
export default async function WorkspaceContentPage() {
  await requireStaffPermission("content:manage", "/workspace/content");
  const result = await listPageStates();

  return (
    <div className="mx-auto max-w-4xl">
      <p className="type-caps text-nybb-yellow">Website</p>
      <h1 className="font-display heading-major mt-2">Website content</h1>
      <p className="text-nybb-bone/70 mt-3 max-w-2xl leading-relaxed">
        Change what these pages say. Edits are saved as a private draft first, so you can preview
        them on the real page before publishing. Publishing puts the new text live for every
        visitor straight away, and every publish is recorded in the audit log.
      </p>

      {result.ok ? (
        <ul className="mt-8 space-y-3">
          {result.states.map((state) => {
            const info = CONTENT_PAGE_INFO[state.page];
            return (
              <li key={state.page}>
                <Link
                  href={`/workspace/content/${state.page}`}
                  className="bg-nybb-charcoal hover:bg-nybb-graphite group flex items-center gap-4 rounded-md p-5 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h2 className="font-display heading-panel text-nybb-bone uppercase">{info.name}</h2>
                      <span className="text-nybb-bone/55 font-mono text-xs">{info.path}</span>
                    </div>
                    <p className="text-nybb-bone/70 mt-1.5 text-sm">{info.summary}</p>
                    <p className="text-nybb-bone/65 mt-2 text-xs">
                      {state.customised && state.publishedAt
                        ? `Published ${manilaDateTime(state.publishedAt)}${state.publishedBy ? ` by ${state.publishedBy}` : ""}`
                        : "Showing the original text"}
                      {state.draft ? (
                        <span className="text-nybb-yellow">
                          {" "}
                          · Unpublished draft
                          {state.draftSavedBy ? ` by ${state.draftSavedBy}` : ""}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <ChevronRight
                    aria-hidden
                    className="text-nybb-bone/55 group-hover:text-nybb-bone size-5 shrink-0 transition-colors"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p role="alert" className="text-nybb-red mt-8 text-sm">
          {readErrorMessage(result.error)}
        </p>
      )}
    </div>
  );
}
