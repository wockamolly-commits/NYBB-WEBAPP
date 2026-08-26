"use client";

import { Eye, LoaderCircle, Upload as UploadIcon } from "lucide-react";
import Image from "next/image";
import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { WorkspaceFieldLabel } from "@/components/ui/WorkspaceField";
import {
  MENU_IMAGE_ACCEPT,
  MENU_IMAGE_MAX_BYTES,
  MENU_IMAGE_SIZE_MESSAGE,
  MENU_IMAGE_TYPE_MESSAGE,
  isDecodableImageType,
} from "@/lib/staff/menu-image-limits";
import type { MenuActionState } from "@/lib/staff/menu-types";
import { previewMenuImage, uploadMenuItemImage, uploadMenuOptionImage } from "../actions";
import { MenuStatusMessage } from "../MenuStatusMessage";

const initialState: MenuActionState = { status: "idle" };

/**
 * Which menu row a photograph belongs to, and therefore which Server Action
 * saves it. One component, not a fork, per Task 11's brief: staff_set_menu_item_image
 * and staff_set_menu_option_image differ only in argument count (an option
 * has no image_treatment), and that is a detail for actions.ts, not a reason
 * to duplicate this screen.
 */
export type ImageFieldTarget =
  | { kind: "item"; itemId: string }
  | { kind: "option"; optionId: string };

/**
 * Mirrors MIN_ZOOM (0.25) and MAX_ZOOM (1) in lib/staff/menu-image.ts's
 * cropWindow. That module keeps the primitive as a window multiplier, where
 * smaller is a closer crop, because the clamp there is a statement about a
 * window's side length. A person does not think in window multipliers; they
 * think in magnification, so this control runs 1x to 4x and sends 1 / value
 * as the "zoom" field the server reads. Drifting from 0.25 here only widens
 * or narrows the slider, because processMenuImage clamps independently.
 */
const MIN_MAGNIFICATION = 1;
const MAX_MAGNIFICATION = 4;

/**
 * Announces the actual magnification, not a position on the slider.
 *
 * An earlier version normalised 1x-4x onto 0-100 and read that out as
 * "zoomed in N percent", which satisfied the rule that a range needs an
 * aria-valuetext in words without saying anything true: at 2.5x it announced
 * "zoomed in 50 percent", a number with no relationship to how much closer
 * the crop actually is. Rounded to one decimal place because sighted people
 * read the same slider to a tenth of a step; a screen reader user should not
 * get coarser information than that.
 */
function zoomLabel(magnification: number): string {
  const rounded = Math.round(magnification * 10) / 10;
  return rounded === MIN_MAGNIFICATION ? "no zoom" : `zoomed to ${rounded} times`;
}

function offsetLabel(offsetY: number): string {
  const percent = Math.round(Math.abs(offsetY) * 100);
  if (percent === 0) return "crop centered vertically";
  return offsetY < 0
    ? `crop shifted ${percent} percent toward the top`
    : `crop shifted ${percent} percent toward the bottom`;
}

/**
 * One photograph: the saved tile, a file picker, zoom and vertical position
 * controls, a Preview button that shows the real server crop, and an Upload
 * button that commits it.
 *
 * THE PREVIEW IS A REAL CROP, NOT A CSS APPROXIMATION.
 *
 * Preview calls previewMenuImage, which runs the same processMenuImage the
 * upload itself runs, and shows the resulting WebP as a data URL. A CSS
 * transform standing in for that would round differently than sharp's
 * extract, and the person would upload three times before the photo looked
 * the way the preview promised.
 */
export function ImageField({
  target,
  imageUrl,
}: {
  target: ImageFieldTarget;
  imageUrl: string | null;
}) {
  const uid = useId();
  const uploadAction = target.kind === "item" ? uploadMenuItemImage : uploadMenuOptionImage;
  const [uploadState, formAction, uploadPending] = useActionState(uploadAction, initialState);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hasFile, setHasFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [magnification, setMagnification] = useState(MIN_MAGNIFICATION);
  const [offsetY, setOffsetY] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewAnnouncement, setPreviewAnnouncement] = useState("");
  const [previewPending, startPreview] = useTransition();

  const pending = uploadPending || previewPending;
  // zoom, the field the server reads, is the window multiplier: the inverse
  // of the magnification this control shows. See the comment above
  // MIN_MAGNIFICATION.
  const zoom = 1 / magnification;
  const shownUrl = previewUrl ?? imageUrl;

  /**
   * Puts the field back to "nothing chosen" once an upload actually lands.
   *
   * hasFile and previewUrl are this component's own state and do not follow
   * a successful submission on their own: without this, Upload and Preview
   * stayed enabled against a file input that now held nothing, and pressing
   * either printed "Choose a photograph first" against a screen that still
   * showed the old preview.
   *
   * This is the same "adjust state when something external changes" shape
   * ItemEditor.tsx uses for re-seeding its size rows: a setState call made
   * directly in the render body, guarded by comparing against the last
   * uploadState object this component has already reacted to, rather than
   * in an effect. useActionState hands back a new object on every action
   * call, including a second success in a row, so the object identity
   * itself is what marks "this is a result I have not handled yet".
   */
  const [settledUploadState, setSettledUploadState] = useState(uploadState);
  if (uploadState !== settledUploadState && uploadState.status === "success") {
    setSettledUploadState(uploadState);
    setHasFile(false);
    setPreviewUrl(null);
    setPreviewAnnouncement("");
  }

  // The DOM node's own value is imperative state React does not track, so
  // clearing it belongs in an effect rather than the render body above: it
  // is a synchronization with an external system, not a derived value.
  useEffect(() => {
    if (uploadState.status !== "success") return;
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [uploadState]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setPreviewUrl(null);
    setPreviewError(null);
    setPreviewAnnouncement("");

    if (!file) {
      setHasFile(false);
      setFileError(null);
      return;
    }
    // A courtesy for a fast message. actions.ts checks both again: a client
    // check is never the boundary.
    if (!isDecodableImageType(file.type)) {
      setHasFile(false);
      setFileError(MENU_IMAGE_TYPE_MESSAGE);
      return;
    }
    if (file.size > MENU_IMAGE_MAX_BYTES) {
      setHasFile(false);
      setFileError(MENU_IMAGE_SIZE_MESSAGE);
      return;
    }
    setHasFile(true);
    setFileError(null);
  }

  function handlePreview() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setPreviewError("Choose a photograph first.");
      return;
    }
    setPreviewError(null);
    setPreviewAnnouncement("");
    startPreview(async () => {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("zoom", String(zoom));
      formData.set("offsetY", String(offsetY));
      // previewMenuImage's own failures come back as { ok: false }, printed
      // in place like every other failure in this component. A transport
      // failure (offline, a 413, a 500) instead throws inside this
      // transition and, unwrapped, would reach the nearest error boundary
      // and take the whole screen down over what is only a preview.
      try {
        const result = await previewMenuImage(formData);
        if (result.ok) {
          setPreviewUrl(result.dataUrl);
          setPreviewAnnouncement("Preview updated to match the crop.");
        } else {
          setPreviewError(result.error);
        }
      } catch (cause) {
        console.error("[workspace] menu image preview request failed:", cause);
        setPreviewError("The preview could not be generated. Try again.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-start gap-5">
      <div className="border-nybb-bone/15 bg-nybb-ink relative size-32 shrink-0 overflow-hidden rounded-md border">
        {shownUrl ? (
          <Image
            src={shownUrl}
            alt=""
            fill
            unoptimized={shownUrl === previewUrl}
            sizes="128px"
            className="object-cover"
          />
        ) : (
          <p className="text-nybb-bone/55 flex h-full items-center justify-center px-2 text-center text-xs">
            No photo yet
          </p>
        )}
      </div>

      <div className="min-w-56 flex-1 space-y-3">
        <form action={formAction}>
          {target.kind === "item" ? (
            <input type="hidden" name="itemId" value={target.itemId} />
          ) : (
            <input type="hidden" name="optionId" value={target.optionId} />
          )}
          <input type="hidden" name="zoom" value={String(zoom)} />
          <input type="hidden" name="offsetY" value={String(offsetY)} />

          <div>
            <WorkspaceFieldLabel htmlFor={`${uid}-file`}>Choose a photograph</WorkspaceFieldLabel>
            <input
              ref={fileInputRef}
              id={`${uid}-file`}
              type="file"
              name="file"
              accept={MENU_IMAGE_ACCEPT}
              onChange={handleFileChange}
              disabled={pending}
              className="text-nybb-bone/55 mt-2 flex min-h-11 w-full items-center text-xs file:mr-3 file:rounded-md file:border-0 file:bg-nybb-bone/10 file:px-3.5 file:py-2 file:text-sm file:text-nybb-bone disabled:opacity-60"
            />
            {fileError ? (
              <p role="alert" className="text-nybb-orange mt-2 text-xs">
                {fileError}
              </p>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-4">
            <div className="min-w-40 flex-1">
              <WorkspaceFieldLabel htmlFor={`${uid}-zoom`}>Zoom</WorkspaceFieldLabel>
              <input
                id={`${uid}-zoom`}
                type="range"
                min={MIN_MAGNIFICATION}
                max={MAX_MAGNIFICATION}
                step={0.1}
                value={magnification}
                onChange={(event) => {
                  setMagnification(Number(event.target.value));
                  setPreviewUrl(null);
                }}
                aria-valuetext={zoomLabel(magnification)}
                disabled={pending || !hasFile}
                className="mt-3 min-h-11 w-full"
              />
            </div>
            <div className="min-w-40 flex-1">
              <WorkspaceFieldLabel htmlFor={`${uid}-offset`}>Vertical position</WorkspaceFieldLabel>
              <input
                id={`${uid}-offset`}
                type="range"
                min={-1}
                max={1}
                step={0.05}
                value={offsetY}
                onChange={(event) => {
                  setOffsetY(Number(event.target.value));
                  setPreviewUrl(null);
                }}
                aria-valuetext={offsetLabel(offsetY)}
                disabled={pending || !hasFile}
                className="mt-3 min-h-11 w-full"
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              tone="dark"
              variant="secondary"
              onClick={handlePreview}
              disabled={pending || !hasFile}
              className="min-h-11"
            >
              {previewPending ? (
                <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <Eye aria-hidden className="size-4" />
              )}
              Preview crop
            </Button>
            <Button
              type="submit"
              tone="dark"
              variant="primary"
              disabled={pending || !hasFile}
              className="min-h-11"
            >
              {uploadPending ? (
                <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <UploadIcon aria-hidden className="size-4" />
              )}
              Upload
            </Button>
          </div>
          {previewError ? (
            <p role="alert" className="text-nybb-orange mt-2 text-xs">
              {previewError}
            </p>
          ) : null}
          {/* The image swap itself is silent to a screen reader (the tile is
              alt=""), and this is the one interaction whose entire purpose is
              to show a result. Without this, choosing Preview crop and
              having it actually work told a non-sighted person nothing
              happened at all. */}
          <p aria-live="polite" aria-atomic="true" className="sr-only">
            {previewAnnouncement}
          </p>
          <MenuStatusMessage state={uploadState} />
        </form>
      </div>
    </div>
  );
}
