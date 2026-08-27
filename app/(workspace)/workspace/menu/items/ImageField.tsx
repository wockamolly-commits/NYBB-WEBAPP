"use client";

import { Eye, LoaderCircle, Upload as UploadIcon } from "lucide-react";
import Image from "next/image";
import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { WorkspaceFieldLabel } from "@/components/ui/WorkspaceField";
import { MENU_IMAGE_FLATTEN_BACKGROUND, cropPreviewLayout } from "@/lib/staff/menu-image-crop";
import {
  MENU_IMAGE_ACCEPT,
  MENU_IMAGE_MAX_BYTES,
  MENU_IMAGE_SIZE_MESSAGE,
  MENU_IMAGE_TYPE_MESSAGE,
  isDecodableImageFile,
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
 * Mirrors MIN_ZOOM (0.25) and MAX_ZOOM (1) in lib/staff/menu-image-crop.ts's
 * cropWindow. That module keeps the primitive as a window multiplier, where
 * smaller is a closer crop, because the clamp there is a statement about a
 * window's side length. A person does not think in window multipliers; they
 * think in magnification, so this control runs 1x to 4x and sends 1 / value
 * as the "zoom" field the server reads. Drifting from 0.25 here only widens
 * or narrows the slider, because cropWindow clamps independently.
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

/** The chosen file and the object URL the browser draws it from. */
type ChosenPhoto = { file: File; objectUrl: string };

/** How big the browser found the chosen photograph to be, once decoded. */
type SourceSize = { width: number; height: number };

/**
 * One photograph: the crop being composed, a file picker, zoom and vertical
 * position controls, a button that renders the exact upload, and an Upload
 * button that commits it.
 *
 * THE CROP IS VISIBLE FROM THE MOMENT A FILE IS CHOSEN.
 *
 * The tile draws the chosen file straight from an object URL, positioned by
 * cropPreviewLayout, which is lib/staff/menu-image-crop.ts's cropWindow (the
 * very window sharp extracts) expressed as CSS percentages. Zoom and vertical
 * position move it as they are dragged, with no round trip.
 *
 * That is not a decorative nicety, it is the feature. Before it, this
 * component held no pixels of the chosen file at all: the tile showed
 * previewUrl ?? imageUrl, previewUrl was null until somebody pressed the
 * preview button, and every slider move set it back to null. Choosing a photo
 * appeared to do nothing, adjusting the crop was done blind, and the only
 * reliable way to see the result was to upload it and look at what landed.
 *
 * THE PREVIEW BUTTON IS STILL A REAL CROP, NOT A CSS APPROXIMATION.
 *
 * The live crop is exact about geometry and can be nothing else, because the
 * browser is drawing the original file. It is not the uploaded file: that one
 * is resized to 900px, flattened and encoded as WebP at quality 80. "Check
 * final render" calls previewMenuImage, which runs the same processMenuImage
 * the upload runs, and shows the actual bytes. Keeping both is the point.
 * Geometry answers "is the crop right", which is wanted on every drag; the
 * render answers "does it still look right once encoded", which is wanted
 * once, at the end.
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
  const [chosen, setChosen] = useState<ChosenPhoto | null>(null);
  const [sourceSize, setSourceSize] = useState<SourceSize | null>(null);
  const [undrawable, setUndrawable] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [magnification, setMagnification] = useState(MIN_MAGNIFICATION);
  const [offsetY, setOffsetY] = useState(0);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [previewPending, startPreview] = useTransition();

  const pending = uploadPending || previewPending;
  // zoom, the field the server reads, is the window multiplier: the inverse
  // of the magnification this control shows. See the comment above
  // MIN_MAGNIFICATION.
  const zoom = 1 / magnification;

  /**
   * The live crop, or null when there is nothing to draw one from.
   *
   * sourceSize arrives on the image's load event, one frame after the file is
   * chosen, so the very first paint falls through to the plain cover fill
   * below. undrawable is the other gap: a browser too old for the format
   * holds a decodable file it cannot display, and guessing a layout for an
   * image with no dimensions would put the crop somewhere arbitrary.
   */
  const liveLayout =
    chosen && sourceSize && !undrawable
      ? cropPreviewLayout(sourceSize.width, sourceSize.height, { zoom, offsetY })
      : null;

  /**
   * Whether the live layer is drawing anything. A chosen file this browser
   * cannot decode is not showing, whatever else is true, and the tile has to
   * fall back to the saved photograph rather than to nothing.
   */
  const showsLive = Boolean(chosen) && !undrawable;

  /**
   * What the tile is showing, in the order of how closely it matches what an
   * upload would produce right now.
   */
  const shownKind: "render" | "live" | "saved" | "empty" = renderedUrl
    ? "render"
    : showsLive
      ? "live"
      : imageUrl
        ? "saved"
        : "empty";

  const tileCaption =
    shownKind === "render"
      ? "The exact file that will be uploaded."
      : shownKind === "live"
        ? "Live crop of the chosen photograph."
        : shownKind === "saved"
          ? "The photograph saved for this row."
          : null;

  /**
   * Puts the field back to "nothing chosen" once an upload actually lands.
   *
   * The chosen file and the rendered preview are this component's own state
   * and do not follow a successful submission on their own: without this,
   * Upload and the preview button stayed enabled against a file input that
   * now held nothing, and pressing either printed "Choose a photograph first"
   * against a screen that still showed the old preview.
   *
   * This is the same "adjust state when something external changes" shape
   * ItemEditor.tsx uses for re-seeding its size rows: a setState call made
   * directly in the render body, guarded by comparing against the last
   * uploadState object this component has already reacted to, rather than
   * in an effect. useActionState hands back a new object on every action
   * call, including a second success in a row, so the object identity
   * itself is what marks "this is a result I have not handled yet".
   *
   * Nothing here revokes the object URL. That is the job of the effect below,
   * which is keyed on the URL itself, because revoking is a side effect and
   * the render body is not where side effects belong.
   */
  const [settledUploadState, setSettledUploadState] = useState(uploadState);
  if (uploadState !== settledUploadState && uploadState.status === "success") {
    setSettledUploadState(uploadState);
    setChosen(null);
    setSourceSize(null);
    setUndrawable(false);
    setRenderedUrl(null);
    setAnnouncement("");
  }

  /**
   * Hands every object URL back when it stops being shown.
   *
   * Keyed on the chosen photograph rather than on unmount alone, so picking a
   * second file frees the first one's blob straight away. Without this the
   * page holds on to every file the person has looked at until the tab
   * closes, which on a screen where each one may be 5 MB is worth avoiding.
   */
  useEffect(() => {
    const objectUrl = chosen?.objectUrl;
    if (!objectUrl) return;
    return () => URL.revokeObjectURL(objectUrl);
  }, [chosen]);

  // The DOM node's own value is imperative state React does not track, so
  // clearing it belongs in an effect rather than the render body above: it
  // is a synchronization with an external system, not a derived value.
  useEffect(() => {
    if (uploadState.status !== "success") return;
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [uploadState]);

  function clearChoice() {
    setChosen(null);
    setSourceSize(null);
    setUndrawable(false);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setRenderedUrl(null);
    setPreviewError(null);
    setAnnouncement("");

    if (!file) {
      clearChoice();
      setFileError(null);
      return;
    }
    // A courtesy for a fast message. actions.ts checks both again, and
    // processMenuImage checks the real bytes after that: a client check is
    // never the boundary.
    if (!isDecodableImageFile(file.name, file.type)) {
      clearChoice();
      setFileError(MENU_IMAGE_TYPE_MESSAGE);
      return;
    }
    if (file.size > MENU_IMAGE_MAX_BYTES) {
      clearChoice();
      setFileError(MENU_IMAGE_SIZE_MESSAGE);
      return;
    }
    setFileError(null);
    // A fresh photograph starts uncropped. Carrying the last one's 3.2x and
    // its vertical nudge over to a differently shaped image gives a crop
    // nobody asked for, on a tile that is now showing it immediately.
    setMagnification(MIN_MAGNIFICATION);
    setOffsetY(0);
    setSourceSize(null);
    setUndrawable(false);
    setChosen({ file, objectUrl: URL.createObjectURL(file) });
    setAnnouncement("Photograph chosen. The tile now shows its crop.");
  }

  /**
   * Records the decoded size, which is what turns the cover fill into the
   * real crop.
   *
   * naturalWidth and naturalHeight are the oriented dimensions: a browser
   * applies a photograph's EXIF orientation by default, so a portrait shot
   * stored sideways reports the way it is drawn. processMenuImage measures
   * after its own rotate() for the same reason, and that is what keeps this
   * layout and that crop describing the same rectangle.
   */
  function handleImageLoad(event: React.SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget;
    if (!image.naturalWidth || !image.naturalHeight) {
      setUndrawable(true);
      return;
    }
    setUndrawable(false);
    setSourceSize({ width: image.naturalWidth, height: image.naturalHeight });
  }

  /**
   * The file is decodable by the server and not by this browser.
   *
   * AVIF is the realistic case: sharp reads it everywhere, browsers older
   * than Chrome 85, Firefox 93 or Safari 16.4 do not. Nothing is broken and
   * nothing needs blocking, because the upload path never involved this
   * browser's decoder. The person loses the live crop and keeps everything
   * else, and the note under the tile says so.
   */
  function handleImageError() {
    setUndrawable(true);
    setSourceSize(null);
  }

  function handlePreview() {
    const file = chosen?.file;
    if (!file) {
      setPreviewError("Choose a photograph first.");
      return;
    }
    setPreviewError(null);
    setAnnouncement("");
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
          setRenderedUrl(result.dataUrl);
          setAnnouncement("The tile now shows the exact file that will be uploaded.");
        } else {
          setPreviewError(result.error);
        }
      } catch (cause) {
        console.error("[workspace] menu image preview request failed:", cause);
        setPreviewError("The preview could not be generated. Try again.");
      }
    });
  }

  /**
   * Drops the rendered preview, because it is now a picture of an older crop.
   *
   * Falling back to the live layer rather than to the saved photograph is the
   * whole difference: this same call used to leave the tile showing whatever
   * was already on the row, so moving a slider looked like an undo.
   */
  function cropChanged() {
    setRenderedUrl(null);
    setPreviewError(null);
  }

  return (
    <div className="flex flex-wrap items-start gap-5">
      <div className="shrink-0">
        <div
          className="border-nybb-bone/15 bg-nybb-ink relative size-40 overflow-hidden rounded-md border sm:size-48"
          style={{
            // The ground sharp flattens onto, so a transparent PNG previews
            // the way it will be stored rather than over the panel.
            background: showsLive ? MENU_IMAGE_FLATTEN_BACKGROUND : undefined,
          }}
        >
          {shownKind === "render" || shownKind === "saved" ? (
            <Image
              src={renderedUrl ?? imageUrl ?? ""}
              alt=""
              fill
              unoptimized={Boolean(renderedUrl)}
              sizes="(min-width: 640px) 192px, 160px"
              className="object-cover"
            />
          ) : null}

          {/* Kept mounted underneath the rendered preview rather than swapped
              out for it: unmounting would drop sourceSize and re-decode the
              file every time somebody pressed the button and then moved a
              slider. The eslint exception is because next/image cannot do
              this. It owns the element's sizing, and this one is placed by
              the crop window, at percentages of the tile that no `sizes`
              string can express. */}
          {chosen ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={chosen.objectUrl}
              src={chosen.objectUrl}
              alt=""
              onLoad={handleImageLoad}
              onError={handleImageError}
              // max-w-none because Preflight caps every img at the width of
              // its container, which is exactly what a crop above 1x is not.
              className={
                liveLayout ? "absolute max-w-none" : "absolute inset-0 size-full object-cover"
              }
              style={
                liveLayout
                  ? {
                      width: `${liveLayout.widthPercent}%`,
                      height: `${liveLayout.heightPercent}%`,
                      left: `${liveLayout.leftPercent}%`,
                      top: `${liveLayout.topPercent}%`,
                      visibility: renderedUrl ? "hidden" : undefined,
                    }
                  : { visibility: renderedUrl || undrawable ? "hidden" : undefined }
              }
            />
          ) : null}

          {shownKind === "empty" ? (
            <p className="text-nybb-bone/55 flex h-full items-center justify-center px-2 text-center text-xs">
              No photo yet
            </p>
          ) : null}
        </div>
        {tileCaption ? (
          <p className="text-nybb-bone/55 mt-2 max-w-40 text-xs sm:max-w-48">{tileCaption}</p>
        ) : null}
        {undrawable ? (
          <p className="text-nybb-bone/55 mt-2 max-w-40 text-xs sm:max-w-48">
            This browser cannot draw that format, so the crop cannot be shown live. Check final
            render still works, and so does uploading.
          </p>
        ) : null}
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
                  cropChanged();
                }}
                aria-valuetext={zoomLabel(magnification)}
                disabled={pending || !chosen}
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
                  cropChanged();
                }}
                aria-valuetext={offsetLabel(offsetY)}
                disabled={pending || !chosen}
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
              disabled={pending || !chosen}
              className="min-h-11"
            >
              {previewPending ? (
                <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <Eye aria-hidden className="size-4" />
              )}
              Check final render
            </Button>
            <Button
              type="submit"
              tone="dark"
              variant="primary"
              disabled={pending || !chosen}
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
          {/* Every change to the tile is silent to a screen reader: the tile
              is alt="" and the caption beneath it is not a live region, so
              that dragging a slider does not read a sentence out on every
              step. This says the things that happen once, when a photograph
              is chosen and when the final render arrives. */}
          <p aria-live="polite" aria-atomic="true" className="sr-only">
            {announcement}
          </p>
          <MenuStatusMessage state={uploadState} />
        </form>
      </div>
    </div>
  );
}
