"use client";

import { ExternalLink, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import type { ContentActionState } from "@/lib/content/action-state";
import { CONTENT_DEFAULTS } from "@/lib/content/defaults";
import {
  CONTENT_PAGE_INFO,
  type AboutContent,
  type ContentFieldErrors,
  type ContentFor,
  type ContentPage,
  type HomeContent,
  type LegalContent,
} from "@/lib/content/schema";
import { cn } from "@/lib/utils";
import {
  discardContentDraft,
  publishContent,
  restoreOriginalContent,
  saveContentDraft,
} from "../actions";
import { FormattingHelp } from "./fields";
import { AboutForm, HomeForm, LegalForm } from "./forms";

export type EditorMeta = {
  customised: boolean;
  publishedAt: string | null;
  publishedBy: string | null;
  hasDraft: boolean;
  draftSavedAt: string | null;
  draftSavedBy: string | null;
};

function manilaDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  });
}

type Confirm = "publish" | "discard" | "restore" | null;

/**
 * One page's editor: the form, and the four things that can be done with it.
 *
 *   Save draft         keeps the edit privately; visitors see no change.
 *   Preview draft      the saved draft on the real page, in a new tab.
 *   Publish            puts what is in the form live, straight away.
 *   Discard / Restore  throw the draft away, or go back to the built-in text.
 *
 * Publish, discard and restore ask first, because each one either changes
 * the public site or throws work away. Preview needs the draft saved, since
 * the preview page reads the saved draft and not this form.
 */
export function ContentEditor<P extends ContentPage>({
  page,
  live,
  draft,
  meta,
}: {
  page: P;
  live: ContentFor[P];
  draft: ContentFor[P] | null;
  meta: EditorMeta;
}) {
  const router = useRouter();
  const info = CONTENT_PAGE_INFO[page];
  const [value, setValue] = useState<ContentFor[P]>(draft ?? live);
  const [baseline, setBaseline] = useState<ContentFor[P]>(draft ?? live);
  const [liveValue, setLiveValue] = useState<ContentFor[P]>(live);
  const [state, setState] = useState(meta);
  const [errors, setErrors] = useState<ContentFieldErrors>({});
  const [message, setMessage] = useState<ContentActionState | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [pending, start] = useTransition();

  const dirty = JSON.stringify(value) !== JSON.stringify(baseline);

  // A browser warning before leaving with unsaved edits. In-app links are not
  // covered by this event; the unsaved marker in the bar is the cue for those.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function run(
    action: () => Promise<ContentActionState>,
    onSuccess: () => void,
  ) {
    setConfirm(null);
    start(async () => {
      const result = await action();
      setMessage(result);
      if (result.ok) {
        setErrors({});
        onSuccess();
        router.refresh();
      } else {
        setErrors(result.fieldErrors ?? {});
        // Take the person to the first field that needs them. On a long legal
        // page most fields are off screen and the bar only says "needs another
        // look". A frame's wait lets a folded section open first.
        if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
          requestAnimationFrame(() => {
            const field = document.querySelector<HTMLElement>('[aria-invalid="true"]');
            field?.scrollIntoView({ block: "center", behavior: "smooth" });
            field?.focus({ preventScroll: true });
          });
        }
      }
    });
  }

  const save = () =>
    run(
      () => saveContentDraft(page, value),
      () => {
        setBaseline(value);
        setState((s) => ({ ...s, hasDraft: true, draftSavedAt: new Date().toISOString(), draftSavedBy: null }));
      },
    );

  const publish = () =>
    run(
      () => publishContent(page, value),
      () => {
        setBaseline(value);
        setLiveValue(value);
        setState((s) => ({
          ...s,
          customised: true,
          publishedAt: new Date().toISOString(),
          publishedBy: null,
          hasDraft: false,
          draftSavedAt: null,
          draftSavedBy: null,
        }));
      },
    );

  const discard = () =>
    run(
      () => discardContentDraft(page),
      () => {
        setValue(liveValue);
        setBaseline(liveValue);
        setState((s) => ({ ...s, hasDraft: false, draftSavedAt: null, draftSavedBy: null }));
      },
    );

  const restore = () =>
    run(
      () => restoreOriginalContent(page),
      () => {
        const original = CONTENT_DEFAULTS[page];
        setValue(original);
        setBaseline(original);
        setLiveValue(original);
        setState((s) => ({
          ...s,
          customised: false,
          publishedAt: new Date().toISOString(),
          publishedBy: null,
          hasDraft: false,
          draftSavedAt: null,
          draftSavedBy: null,
        }));
      },
    );

  const canPreview = state.hasDraft && !dirty;
  const legal = page === "privacy" || page === "terms";

  return (
    <>
      <StatusCard state={state} />

      {legal || page === "about" ? (
        <div className="mt-6">
          <FormattingHelp legal={legal} />
        </div>
      ) : null}

      <div className="mt-6">
        {page === "home" ? (
          <HomeForm
            value={value as HomeContent}
            onChange={(next) => setValue(next as ContentFor[P])}
            errors={errors}
          />
        ) : page === "about" ? (
          <AboutForm
            value={value as AboutContent}
            onChange={(next) => setValue(next as ContentFor[P])}
            errors={errors}
          />
        ) : (
          <LegalForm
            value={value as LegalContent}
            onChange={(next) => setValue(next as ContentFor[P])}
            errors={errors}
            path={info.path}
            allowSeal={page === "privacy"}
          />
        )}
      </div>

      {/* The bar stays in reach at the foot of the screen, because the
          forms are long and the save button should never be a scroll away. */}
      <div className="bg-nybb-charcoal border-nybb-bone/15 sticky bottom-0 z-20 -mx-4 mt-8 border-t px-4 py-3 sm:mx-0 sm:rounded-t-md sm:border-x">
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="min-w-0 flex-1 basis-full text-sm sm:basis-auto">
            {pending ? (
              <span className="text-nybb-bone/70">Working…</span>
            ) : message ? (
              <span className={message.ok ? "text-nybb-bone" : "text-nybb-red"}>
                {message.ok ? message.message : message.error}
              </span>
            ) : dirty ? (
              <span className="text-nybb-yellow">Unsaved changes</span>
            ) : canPreview ? (
              <span className="text-nybb-bone/70">Draft saved and ready to preview.</span>
            ) : (
              <span className="text-nybb-bone/70">No unsaved changes.</span>
            )}
          </p>

          <Button type="button" tone="dark" variant="secondary" onClick={save} disabled={pending || !dirty} className="min-h-11">
            {pending ? <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : null}
            Save draft
          </Button>

          {canPreview ? (
            <Link
              href={`/preview/content/${page}`}
              target="_blank"
              rel="noopener"
              className="text-nybb-bone hover:bg-nybb-bone/10 border-nybb-bone/40 inline-flex min-h-11 items-center gap-2 rounded-md border px-4 text-sm font-medium transition-colors"
            >
              Preview draft
              <ExternalLink aria-hidden className="size-4" />
              <span className="sr-only">(opens in a new tab)</span>
            </Link>
          ) : (
            <span
              className="text-nybb-bone/55 border-nybb-bone/20 inline-flex min-h-11 items-center gap-2 rounded-md border border-dashed px-4 text-sm"
              title="Save a draft to preview it on the real page."
            >
              Preview draft
            </span>
          )}

          <Button type="button" tone="dark" variant="primary" onClick={() => setConfirm("publish")} disabled={pending} className="min-h-11">
            Publish
          </Button>
        </div>

        {dirty || state.hasDraft || state.customised ? (
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {dirty ? (
              <button
                type="button"
                onClick={() => {
                  setValue(baseline);
                  setErrors({});
                  setMessage(null);
                }}
                disabled={pending}
                className="text-nybb-bone/70 hover:text-nybb-bone min-h-11 underline underline-offset-4"
              >
                Undo unsaved changes
              </button>
            ) : null}
            {state.hasDraft ? (
              <button
                type="button"
                onClick={() => setConfirm("discard")}
                disabled={pending}
                className="text-nybb-bone/70 hover:text-nybb-bone min-h-11 underline underline-offset-4"
              >
                Discard draft
              </button>
            ) : null}
            {state.customised ? (
              <button
                type="button"
                onClick={() => setConfirm("restore")}
                disabled={pending}
                className="text-nybb-bone/70 hover:text-nybb-bone min-h-11 underline underline-offset-4"
              >
                Restore the original text
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirm === "publish"}
        kicker="Publish"
        title={`Publish ${info.name}?`}
        body={`Every visitor to ${info.path} sees this text straight away. If you have not previewed it, save the draft and preview it first.`}
        confirmLabel="Publish now"
        onConfirm={publish}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "discard"}
        kicker="Discard draft"
        title="Throw this draft away?"
        body="The saved draft and any unsaved changes are deleted. The published page does not change."
        confirmLabel="Discard draft"
        onConfirm={discard}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "restore"}
        kicker="Restore"
        title="Go back to the original text?"
        body={`${info.name} goes back to the text it had before anyone edited it, live and straight away. Earlier published versions stay in the history.`}
        confirmLabel="Restore original"
        onConfirm={restore}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}

function StatusCard({ state }: { state: EditorMeta }) {
  return (
    <section aria-label="Status" className="bg-nybb-charcoal mt-8 grid gap-4 rounded-md p-5 sm:grid-cols-2 sm:p-6">
      <div>
        <p className="type-caps text-nybb-yellow">Live on the website</p>
        <p className="text-nybb-bone mt-1.5 text-sm">
          {state.customised && state.publishedAt
            ? `Published ${manilaDateTime(state.publishedAt)}${state.publishedBy ? ` by ${state.publishedBy}` : ""}`
            : "The original text. Nothing has been published from here yet."}
        </p>
      </div>
      <div>
        <p className={cn("type-caps", state.hasDraft ? "text-nybb-yellow" : "text-nybb-bone/65")}>Draft</p>
        <p className="text-nybb-bone mt-1.5 text-sm">
          {state.hasDraft && state.draftSavedAt
            ? `Saved ${manilaDateTime(state.draftSavedAt)}${state.draftSavedBy ? ` by ${state.draftSavedBy}` : ""}. Not live yet.`
            : "No draft. The form starts from what is live."}
        </p>
      </div>
    </section>
  );
}

function ConfirmDialog({
  open,
  kicker,
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean;
  kicker: string;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className="confirm-dialog"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) ref.current?.close();
      }}
    >
      <div className="p-5 sm:p-6">
        <p className="type-caps text-nybb-yellow">{kicker}</p>
        <h2 id={titleId} className="font-display heading-minor mt-3">
          {title}
        </h2>
        <p id={bodyId} className="text-nybb-bone/70 mt-4 text-sm">
          {body}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" tone="dark" variant="secondary" onClick={() => ref.current?.close()} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button type="button" tone="dark" variant="primary" onClick={onConfirm} className="w-full sm:w-auto">
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
