"use client";

import { Eye, LoaderCircle, Pencil, Upload as UploadIcon } from "lucide-react";
import Image from "next/image";
import {
  startTransition,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
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
import type { ManagedImage, MenuActionState } from "@/lib/staff/menu-types";
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

/**
 * The crop as one comparable value, for telling "this is what was saved" from
 * "this has been adjusted since". Two floats, so a string is enough and
 * cheaper to reason about than remembering a pair.
 */
function cropSignature(zoom: number, offsetY: number): string {
  return `${zoom}|${offsetY}`;
}

/**
 * The file being cropped, the object URL the browser draws it from, and where
 * it came from: picked off this machine, or reopened from the row's own
 * photograph.
 */
type ChosenPhoto = { file: File; objectUrl: string; from: "disk" | "saved" };

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
 * component held no pixels of the chosen file at all: the tile showed the
 * server preview or the saved photograph, the preview was null until
 * somebody pressed the
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
  image,
}: {
  target: ImageFieldTarget;
  /**
   * The photograph this row is showing today, uploaded or from the archive,
   * resolved by lib/menu/resolve-image.ts. Not the image_url column: most
   * rows have none and are showing an archive photograph regardless, and a
   * field that read the column alone told the owner they had no picture on
   * the very rows a customer was looking at one.
   */
  image: ManagedImage | null;
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
  const [reopenPending, startReopen] = useTransition();

  const pending = uploadPending || previewPending || reopenPending;
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
      : image
        ? "saved"
        : "empty";

  const tileCaption =
    shownKind === "render"
      ? "The exact file that will be uploaded."
      : shownKind === "live"
        ? chosen?.from === "saved"
          ? "Live crop of this row's own photograph."
          : "Live crop of the chosen photograph."
        : shownKind === "saved"
          ? image?.origin === "archive"
            ? "The archive photograph this row shows now. Uploading replaces it."
            : "The photograph uploaded for this row."
          : // "No photo yet" is now a claim about the menu, not just about
            // this field, so it says so. It used to appear on rows the
            // storefront was drawing an archive photograph for.
            "Nothing here and nothing on the menu page either.";

  /**
   * Remembers the crop that was committed, and changes nothing else.
   *
   * THE FIELD DOES NOT TEAR ITSELF DOWN WHEN A SAVE LANDS.
   *
   * It used to. A successful upload dropped the chosen file and an effect
   * emptied the file input, and since both sliders, the preview and Upload
   * are all gated on having a file, every control went dead the instant the
   * photograph saved. Editing the same picture a second time meant finding
   * it on disk and choosing it again, which read, correctly, as being able
   * to edit a menu photograph exactly once.
   *
   * The reset was there for a real reason, which it addressed backwards: the
   * buttons must not stay enabled against an input that no longer holds a
   * file. That is now true because nothing empties the input, so the file,
   * the crop and the controls all survive the save and the next adjustment
   * is one drag away.
   *
   * This is the same "adjust state when something external changes" shape
   * ItemEditor.tsx uses for re-seeding its size rows: a setState call made
   * directly in the render body, guarded by comparing against the last
   * uploadState object this component has already reacted to. useActionState
   * hands back a new object on every action call, including a second success
   * in a row, so the object identity itself is what marks "this is a result
   * I have not handled yet". Which is exactly what repeated editing needs.
   */
  const [settledUploadState, setSettledUploadState] = useState(uploadState);
  const [savedCrop, setSavedCrop] = useState<string | null>(null);
  if (uploadState !== settledUploadState && uploadState.status === "success") {
    setSettledUploadState(uploadState);
    setSavedCrop(cropSignature(zoom, offsetY));
    setAnnouncement("Photograph saved. Adjust the crop and upload again to replace it.");
  }

  /**
   * Whether the crop has moved since the last save, which decides whether the
   * success line under the form is still telling the truth. Leaving "saved"
   * standing over a tile that now shows a different crop is how somebody
   * closes the page believing they saved an adjustment they did not.
   */
  const adjustedSinceSave =
    savedCrop !== null && savedCrop !== cropSignature(zoom, offsetY);

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

  /**
   * Back to having no photograph in hand. savedCrop goes with it: it only
   * means anything relative to a file that is still loaded, and leaving it
   * behind would keep the "adjusted since the last upload" line standing
   * over a field holding nothing.
   */
  function clearChoice() {
    setChosen(null);
    setSourceSize(null);
    setUndrawable(false);
    setSavedCrop(null);
  }

  /**
   * Takes a photograph into the editor, from wherever it came.
   *
   * Split out from the change handler because the input can already be
   * holding a file the first time this component runs, and that file has to
   * go through the same checks and the same crop reset as one chosen while
   * somebody was watching.
   */
  function takeFile(file: File | null) {
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
    setSavedCrop(null);
    setChosen({ file, objectUrl: URL.createObjectURL(file), from: "disk" });
    setAnnouncement("Photograph chosen. The tile now shows its crop.");
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    takeFile(event.target.files?.[0] ?? null);
  }

  /**
   * Adopts a photograph chosen before this component was listening.
   *
   * The field is server-rendered whole, so its file input is on screen and
   * usable a moment before React attaches anything to it. A photograph picked
   * in that gap fires a change event at nobody. The input keeps the file
   * either way, which is what makes the failure so quiet: the filename sits
   * there in plain sight while every control stays dead, and picking the same
   * file again fires no second change to recover from. So take whatever is
   * already in there on the first frame this component owns.
   */
  useEffect(() => {
    const waiting = fileInputRef.current?.files?.[0];
    if (waiting) takeFile(waiting);
    // Mount only. This is about the window before the listener existed, and
    // every choice made after it arrives through handleFileChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  /**
   * What to send, built from this component's own state.
   *
   * NOT read back out of the form. React 19 resets an uncontrolled form as
   * part of every form action it runs (react-dom calls requestFormReset on
   * the form fiber and then the action), which empties the file input the
   * moment an upload lands. A second Upload then posted a form with no file
   * in it and came back "Choose a photograph first", which is why a menu
   * photograph could be edited exactly once: the framework was clearing the
   * only copy of the file. Holding the File in state and posting it directly
   * is what makes the second, third and tenth adjustment work the same as
   * the first.
   */
  function uploadPayload(file: File): FormData {
    const formData = new FormData();
    if (target.kind === "item") formData.set("itemId", target.itemId);
    else formData.set("optionId", target.optionId);
    formData.set("file", file);
    formData.set("zoom", String(zoom));
    formData.set("offsetY", String(offsetY));
    return formData;
  }

  /**
   * Sends the upload itself, from a button rather than a form submission.
   *
   * The trade is deliberate: a Server Action driven by <form action> keeps
   * working with JavaScript switched off, and this does not. Nothing else on
   * this screen does either, because the crop it uploads is chosen with two
   * range controls against a preview the browser draws, so there was no
   * working no-JavaScript path here to give up.
   */
  function handleUpload() {
    const file = chosen?.file;
    if (!file) {
      setPreviewError("Choose a photograph first.");
      return;
    }
    setPreviewError(null);
    // Inside a transition, which useActionState requires of a caller that is
    // not a form's action prop. Without it React warns and uploadPending
    // stops tracking the action, so the button would neither spin nor
    // disable while the photograph is on its way.
    startTransition(() => {
      formAction(uploadPayload(file));
    });
  }

  /**
   * Loads the row's own photograph back into the editor.
   *
   * This is what makes a menu photograph editable more than once. Without it
   * the sliders are dead on every visit until somebody finds the original
   * file on their machine again, because the crop lives in this component's
   * state and a page load starts with none.
   *
   * It fetches the uncropped original, not the tile on display. The two are
   * different files, and cropping the tile again could only tighten it.
   */
  function handleReopen() {
    const source = image?.editableSrc;
    if (!source) return;
    setPreviewError(null);
    setRenderedUrl(null);
    startReopen(async () => {
      try {
        const response = await fetch(source, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const file = new File([blob], "current-photograph.webp", {
          type: blob.type || "image/webp",
        });
        setMagnification(MIN_MAGNIFICATION);
        setOffsetY(0);
        setSourceSize(null);
        setUndrawable(false);
        setSavedCrop(null);
        setFileError(null);
        setChosen({ file, objectUrl: URL.createObjectURL(file), from: "saved" });
        setAnnouncement("The saved photograph is open for editing.");
      } catch (cause) {
        console.error("[workspace] reopening the saved photograph failed:", cause);
        // The likeliest cause by far, and the one worth naming: every
        // photograph uploaded before originals were kept has a tile in the
        // bucket and nothing beside it.
        setPreviewError(
          "The uncropped original for this photograph is not stored, so it cannot be reframed. Choose the file again to replace it.",
        );
      }
    });
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
      const formData = uploadPayload(file);
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
              src={renderedUrl ?? image?.src ?? ""}
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
        <div>
          {image && !chosen ? (
            <div className="mb-4">
              <Button
                type="button"
                tone="dark"
                variant="secondary"
                onClick={handleReopen}
                disabled={pending || !image.editableSrc}
                className="min-h-11"
              >
                {reopenPending ? (
                  <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Pencil aria-hidden className="size-4" />
                )}
                Reframe this photograph
              </Button>
              <p className="text-nybb-bone/55 mt-2 text-xs">
                {image.editableSrc
                  ? "Opens the uncropped photograph so the crop can be moved, then uploaded again."
                  : "This photograph was uploaded before originals were kept, so it cannot be reframed. Choose the file again to replace it."}
              </p>
            </div>
          ) : null}

          <div>
            <WorkspaceFieldLabel htmlFor={`${uid}-file`}>
              {image ? "Or choose a different photograph" : "Choose a photograph"}
            </WorkspaceFieldLabel>
            <input
              id={`${uid}-file`}
              ref={fileInputRef}
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
              type="button"
              onClick={handleUpload}
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
          {adjustedSinceSave && uploadState.status === "success" ? (
            <p role="status" className="text-nybb-bone/55 mt-3 text-sm">
              Adjusted since the last upload. Press Upload to replace the saved photograph.
            </p>
          ) : (
            <MenuStatusMessage state={uploadState} />
          )}
        </div>
      </div>
    </div>
  );
}
