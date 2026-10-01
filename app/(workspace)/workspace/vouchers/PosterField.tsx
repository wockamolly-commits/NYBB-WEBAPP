"use client";

import Image from "next/image";
import { startTransition, useActionState, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { WorkspaceFieldLabel } from "@/components/ui/WorkspaceField";
import {
  VOUCHER_POSTER_ACCEPT,
  VOUCHER_POSTER_MAX_BYTES,
  VOUCHER_POSTER_SIZE_MESSAGE,
  VOUCHER_POSTER_TYPE_MESSAGE,
  isAcceptablePosterFile,
} from "@/lib/staff/voucher-poster-limits";
import type { VoucherActionState } from "@/lib/vouchers/schema";
import { removeVoucherPoster, uploadVoucherPoster } from "./actions";

/**
 * The poster a promo code is advertised with.
 *
 * Two modes, one look. On a new code there is no id to key an upload to yet,
 * so the chosen file is handed up to the form and saveVoucher attaches it once
 * the code exists. On a saved code the field has its own Upload and Remove,
 * posting to their own actions, because a poster is not a term and has to stay
 * changeable after the code is locked (0077).
 *
 * The file is held in state rather than read off the input at submit, for the
 * reason ImageField gives: React 19 resets a form after its action runs, which
 * empties a file input, and a refused save would otherwise silently drop the
 * poster the person had chosen.
 */

const INITIAL: VoucherActionState = { ok: false };

type SavedPoster = { url: string; width: number; height: number };

type Chosen = { file: File; objectUrl: string };

function usePosterChoice() {
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Each object URL is released when it is replaced or the field unmounts.
  useEffect(() => {
    if (!chosen) return;
    const { objectUrl } = chosen;
    return () => URL.revokeObjectURL(objectUrl);
  }, [chosen]);

  function take(file: File | null): File | null {
    if (!file) {
      setChosen(null);
      setFileError(null);
      return null;
    }
    // A courtesy for a fast message. The action checks both again, and
    // processPosterImage checks the real bytes after that.
    if (!isAcceptablePosterFile(file.name, file.type)) {
      setChosen(null);
      setFileError(VOUCHER_POSTER_TYPE_MESSAGE);
      return null;
    }
    if (file.size > VOUCHER_POSTER_MAX_BYTES) {
      setChosen(null);
      setFileError(VOUCHER_POSTER_SIZE_MESSAGE);
      return null;
    }
    setFileError(null);
    setChosen({ file, objectUrl: URL.createObjectURL(file) });
    return file;
  }

  return { chosen, fileError, take, clear: () => setChosen(null) };
}

/** The frame both modes draw: the poster at its own shape, never cropped. */
function PosterPreview({ chosen, saved }: { chosen: Chosen | null; saved: SavedPoster | null }) {
  return (
    <div className="border-nybb-bone/15 bg-nybb-ink flex h-64 w-48 shrink-0 items-center justify-center overflow-hidden rounded-md border sm:h-72 sm:w-56">
      {chosen ? (
        // next/image cannot draw a blob: URL through the optimizer, and this
        // is the local file before it has been uploaded anywhere.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={chosen.objectUrl}
          src={chosen.objectUrl}
          alt="The poster about to be uploaded"
          className="max-h-full max-w-full object-contain"
        />
      ) : saved ? (
        <Image
          src={saved.url}
          alt="This code's poster"
          width={saved.width}
          height={saved.height}
          sizes="224px"
          className="max-h-full w-auto max-w-full object-contain"
        />
      ) : (
        <p className="text-nybb-bone/55 px-3 text-center text-xs">No poster yet</p>
      )}
    </div>
  );
}

function FileInput({
  id,
  label,
  disabled,
  onFile,
  inputRef,
}: {
  id: string;
  label: string;
  disabled?: boolean;
  onFile: (file: File | null) => void;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <div>
      <WorkspaceFieldLabel htmlFor={id}>{label}</WorkspaceFieldLabel>
      {/* No name. The file travels from state, never from this input, so a
          reset form cannot lose it and a disabled fieldset cannot drop it. */}
      <input
        id={id}
        ref={inputRef}
        type="file"
        accept={VOUCHER_POSTER_ACCEPT}
        disabled={disabled}
        onChange={(event) => onFile(event.target.files?.[0] ?? null)}
        className="text-nybb-bone/55 mt-2 flex min-h-11 w-full items-center text-xs file:mr-3 file:rounded-md file:border-0 file:bg-nybb-bone/10 file:px-3.5 file:py-2 file:text-sm file:text-nybb-bone disabled:opacity-60"
      />
    </div>
  );
}

function Message({ kind, children }: { kind: "error" | "status"; children: React.ReactNode }) {
  return kind === "error" ? (
    <p role="alert" className="border-nybb-red text-nybb-bone border-l-2 pl-3 text-sm leading-relaxed">
      {children}
    </p>
  ) : (
    <p role="status" className="text-nybb-bone/65 text-sm">
      {children}
    </p>
  );
}

/** The create form's poster: chosen here, uploaded by saveVoucher. */
export function NewPosterField({ onChange }: { onChange: (file: File | null) => void }) {
  const uid = useId();
  const { chosen, fileError, take } = usePosterChoice();

  return (
    <div className="flex flex-wrap items-start gap-5">
      <PosterPreview chosen={chosen} saved={null} />
      <div className="min-w-56 flex-1 space-y-3">
        <FileInput
          id={`${uid}-poster`}
          label="Choose a poster"
          onFile={(file) => onChange(take(file))}
        />
        {fileError ? <Message kind="error">{fileError}</Message> : null}
        <p className="text-nybb-bone/55 text-xs leading-relaxed">
          Optional. It is uploaded when the code is created.
        </p>
      </div>
    </div>
  );
}

/** A saved code's poster, with its own Upload and Remove. */
export function SavedPosterField({
  voucherId,
  poster,
  publicise,
  failedOnCreate,
}: {
  voucherId: string;
  poster: SavedPoster | null;
  publicise: boolean;
  /** The code was just created but its poster did not go up with it. */
  failedOnCreate?: boolean;
}) {
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const { chosen, fileError, take, clear } = usePosterChoice();
  const [uploadState, uploadAction, uploadPending] = useActionState(uploadVoucherPoster, INITIAL);
  const [removeState, removeAction, removePending] = useActionState(removeVoucherPoster, INITIAL);
  const pending = uploadPending || removePending;

  // A finished upload is now the saved poster the server re-rendered, so the
  // local copy is dropped and the input emptied. Compared against the state
  // object already handled, so it runs once per result and never in a loop.
  const [handled, setHandled] = useState(uploadState);
  if (uploadState !== handled) {
    setHandled(uploadState);
    if (uploadState.ok) clear();
  }
  useEffect(() => {
    if (uploadState.ok && inputRef.current) inputRef.current.value = "";
  }, [uploadState]);

  function upload() {
    if (!chosen) return;
    const formData = new FormData();
    formData.set("id", voucherId);
    formData.set("poster", chosen.file);
    startTransition(() => uploadAction(formData));
  }

  function remove() {
    const formData = new FormData();
    formData.set("id", voucherId);
    startTransition(() => removeAction(formData));
  }

  const error = fileError ?? uploadState.error ?? removeState.error ?? null;

  return (
    <div className="flex flex-wrap items-start gap-5">
      <PosterPreview chosen={chosen} saved={poster} />
      <div className="min-w-56 flex-1 space-y-3">
        {failedOnCreate && !poster ? (
          <Message kind="error">
            The code was created, but its poster could not be uploaded. Choose it again here.
          </Message>
        ) : null}
        <FileInput
          id={`${uid}-poster`}
          label={poster ? "Choose a different poster" : "Choose a poster"}
          disabled={pending}
          onFile={take}
          inputRef={inputRef}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            tone="dark"
            onClick={upload}
            disabled={pending || !chosen}
            className="min-h-11"
          >
            {uploadPending ? "Uploading" : poster ? "Replace poster" : "Upload poster"}
          </Button>
          {poster && !chosen ? (
            <Button
              type="button"
              tone="dark"
              variant="ghost"
              onClick={remove}
              disabled={pending}
              className="min-h-11"
            >
              {removePending ? "Removing" : "Remove poster"}
            </Button>
          ) : null}
          {chosen ? (
            <Button
              type="button"
              tone="dark"
              variant="ghost"
              onClick={() => {
                clear();
                if (inputRef.current) inputRef.current.value = "";
              }}
              disabled={pending}
              className="min-h-11"
            >
              {poster ? "Keep the current one" : "Clear"}
            </Button>
          ) : null}
        </div>
        {error ? <Message kind="error">{error}</Message> : null}
        {poster && !publicise ? (
          <p className="text-nybb-bone/55 text-xs leading-relaxed">
            This code is not shown on the storefront, so its poster only appears
            to the customers the code is set aside for. Switch on Show it on the
            storefront for everybody to see it.
          </p>
        ) : null}
      </div>
    </div>
  );
}
