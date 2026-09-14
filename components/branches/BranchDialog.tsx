"use client";

import { LoaderCircle, Navigation, Phone, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { buttonStyles } from "@/components/ui/Button";
import type { BranchEntry } from "@/lib/branches/entries";
import type { DayHours } from "@/lib/branches/hours";
import { telHref } from "@/lib/phone";
import { cn } from "@/lib/utils";

/**
 * A counter's detail sheet: its map, address, phones and week.
 *
 * Opened from two places, and the same sheet in both. The Branches directory
 * opens it from any card; the counter picker opens it from the nearest-counter
 * suggestion, so somebody can see where that counter actually is before they
 * collect from it. What changes between them is only the foot of the sheet
 * (`actions`), and a line under the name (`detail`) where the picker has a
 * distance to add.
 *
 * WHY A DIALOG, WHEN THE CARD COULD JUST GROW.
 * ================================================================
 * The detail is a map, a week of hours and the two things somebody does next,
 * which is a different density from a directory card. Expanding the card in
 * place would reflow a three column grid under the person's thumb, and a map
 * inside a 360px card is too small to find a forecourt on. A route per branch
 * would work, but the question here is "which of these is nearest", answered
 * by opening several in a row, and a page load between each is the wrong cost
 * for that. So it is the one surface that holds focus while it is open, drawn
 * from the same native <dialog> as the workspace's delete confirmation: the
 * browser owns the top layer, the focus trap, Escape and the inert page, and
 * hands focus back to whatever opened it when it closes.
 *
 * WHAT IT PUTS FIRST.
 * ================================================================
 * The map, because it is the one thing on the card that was not already on
 * the card. On a phone it takes the top of the sheet and the details scroll
 * beneath it; from `md` it takes the left half at full height, so the shape of
 * the street is never cropped to a letterbox beside a column of text.
 *
 * The actions sit at the foot of the details and stick there, so on a phone
 * they stay in thumb reach however far the hours ran.
 *
 * THE MAP LOADS ONLY WHEN ASKED FOR.
 * ================================================================
 * The frame mounts when the dialog opens and not before, so a visitor who
 * never opens a branch sends Google nothing. Until it paints, the panel shows
 * a quiet placeholder in the same graphite as the unfilled heat segments,
 * rather than a white rectangle flashing onto a charcoal sheet.
 */
export function BranchDialog({
  branch,
  open,
  onClose,
  detail,
  actions,
}: {
  /**
   * Kept by the caller after closing, so the sheet does not empty itself
   * during the closing fade. Look it up by slug on each render rather than
   * holding the entry from the click: the Branches page refreshes its entries
   * when hours are saved, and an open sheet should move with them.
   */
  branch: BranchEntry | null;
  open: boolean;
  /** Called however the sheet was closed: the button, Escape or the backdrop. */
  onClose: () => void;
  /** A line under the name. */
  detail?: React.ReactNode;
  /** Replaces the directory's Directions and Call at the foot of the sheet. */
  actions?: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Opened after the render that puts the branch into the panel, so the sheet
  // never rises showing the previous branch for a frame.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }
    if (dialog.open) return;
    dialog.showModal();
    // Named rather than left to showModal's own choice. The sheet scrolls, and
    // Chrome counts a scrollable box as focusable, so on a phone the dialog's
    // first focusable thing was the scroll container and not the way out.
    dialog.querySelector<HTMLButtonElement>("[data-dialog-close]")?.focus();
  }, [open, branch?.slug]);

  return (
    <dialog
      ref={dialogRef}
      className="branch-dialog"
      aria-labelledby={branch ? `branch-${branch.slug}-title` : undefined}
      onClose={onClose}
      // The panel fills the dialog edge to edge, so a click that lands on
      // the dialog element itself landed on the backdrop.
      onClick={(event) => {
        if (event.target === dialogRef.current) dialogRef.current?.close();
      }}
    >
      {branch ? (
        <BranchDetail
          key={branch.slug}
          branch={branch}
          showMap={open}
          onClose={() => dialogRef.current?.close()}
          detail={detail}
          actions={actions}
        />
      ) : null}
    </dialog>
  );
}

/**
 * Open or shut, told by shape as well as colour: a filled orange dot for open,
 * a ring for shut. Orange on charcoal is 5.4:1, and the words carry it anyway.
 */
export function OpenState({ open }: { open: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", open ? "text-nybb-orange" : "text-nybb-bone/70")}>
      <span
        aria-hidden
        className={cn(
          "size-2 rounded-full",
          open ? "bg-nybb-orange" : "border-nybb-bone/70 border",
        )}
      />
      {open ? "Open now" : "Closed now"}
    </span>
  );
}

function BranchDetail({
  branch,
  showMap,
  onClose,
  detail,
  actions,
}: {
  branch: BranchEntry;
  showMap: boolean;
  onClose: () => void;
  detail?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const [mapLoaded, setMapLoaded] = useState(false);
  const hoursId = useId();

  return (
    <div className="bg-nybb-charcoal text-nybb-bone relative grid max-h-[inherit] overflow-y-auto overscroll-contain md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:overflow-hidden">
      {/* Focused on open (see the effect above): the way out is the control
          already selected, and nothing irreversible is on this sheet. Ink
          rather than charcoal, because it sits over the map on a phone and the
          map is light. */}
      <button
        type="button"
        data-dialog-close
        onClick={onClose}
        aria-label="Close"
        className={buttonStyles({
          tone: "dark",
          variant: "primary",
          size: "icon",
          className:
            "bg-nybb-ink text-nybb-bone hover:bg-nybb-graphite active:bg-nybb-graphite absolute top-3 right-3 z-20",
        })}
      >
        <X aria-hidden className="size-5" />
      </button>

      <div className="bg-nybb-graphite relative aspect-[4/3] w-full sm:aspect-[16/10] md:aspect-auto md:h-full md:min-h-[min(34rem,calc(100dvh-3rem))]">
        {!mapLoaded ? (
          <div className="text-nybb-bone/60 absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm">
            <LoaderCircle aria-hidden className="size-5 animate-spin motion-reduce:animate-none" />
            Loading map
          </div>
        ) : null}
        {showMap ? (
          <iframe
            src={branch.mapUrl}
            title={`Map showing NYBB Hot Wings, ${branch.shortName}`}
            onLoad={() => setMapLoaded(true)}
            referrerPolicy="strict-origin-when-cross-origin"
            className={cn(
              "absolute inset-0 size-full border-0 transition-opacity duration-300 ease-out",
              mapLoaded ? "opacity-100" : "opacity-0",
            )}
          />
        ) : null}
      </div>

      <div className="flex min-h-0 flex-col md:max-h-[inherit] md:overflow-y-auto md:overscroll-contain">
        <div className="px-5 pt-6 pb-2 sm:px-7 sm:pt-7">
          <p className="font-display type-caps text-nybb-yellow">{branch.formatLabel}</p>
          {/* The right padding clears the close button, and only the heading
              needs it: rules and rows below run the column's full width. */}
          <h2 id={`branch-${branch.slug}-title`} className="font-display heading-minor mt-3 md:pr-12">
            {branch.shortName}
          </h2>
          {branch.openNow !== null ? (
            <p className="mt-3 text-sm">
              <OpenState open={branch.openNow} />
            </p>
          ) : null}
          {detail ? <p className="text-nybb-bone/80 mt-2 text-sm">{detail}</p> : null}

          <dl className="mt-6">
            <DetailRow label="Address">
              <p className="leading-relaxed">
                {branch.addressLine}
                <br />
                {branch.city}
              </p>
              {!branch.pinned ? (
                <p className="text-nybb-bone/65 mt-1.5 text-sm">
                  The map shows the street, not the exact counter.
                </p>
              ) : null}
            </DetailRow>

            <DetailRow label={branch.phones.length > 1 ? "Phone numbers" : "Phone"}>
              <ul>
                {branch.phones.map((phone) => (
                  <li key={phone}>
                    <a
                      href={telHref(phone)}
                      className="font-mono-tabular text-nybb-orange hover:text-nybb-orange-lit inline-flex min-h-11 items-center transition-colors"
                    >
                      {phone}
                    </a>
                  </li>
                ))}
              </ul>
            </DetailRow>

            <DetailRow label="Opening hours" labelId={hoursId}>
              {branch.week ? (
                <HoursTable week={branch.week} today={branch.today} labelledBy={hoursId} />
              ) : branch.hoursUnavailable ? (
                <p className="border-nybb-bone/40 text-nybb-bone/80 rounded-md border border-dashed px-4 py-3 text-sm leading-relaxed">
                  Hours could not be loaded just now. Call before you travel.
                </p>
              ) : (
                <p className="border-nybb-bone/40 text-nybb-bone/80 rounded-md border border-dashed px-4 py-3 text-sm leading-relaxed">
                  Not published for this counter yet. Call before you travel.
                </p>
              )}
            </DetailRow>
          </dl>
        </div>

        {/* Sticky to the foot of whichever box is scrolling: the whole sheet
            on a phone, the details column from md. The charcoal fill is what
            lets rows scroll under it without showing through. */}
        <div className="bg-nybb-charcoal border-nybb-bone/15 sticky bottom-0 mt-auto flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:px-7">
          {actions ?? <DirectoryActions branch={branch} />}
        </div>
      </div>
    </div>
  );
}

/**
 * What the Branches page offers at the foot of the sheet.
 *
 * Directions is the primary fill because somebody who opened a map is asking
 * how to get there. Call is secondary, and the numbers are also listed in full
 * above it for the branches that publish two.
 */
function DirectoryActions({ branch }: { branch: BranchEntry }) {
  const primaryPhone = branch.phones[0];

  return (
    <>
      <a
        href={branch.directionsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonStyles({ tone: "dark", variant: "primary", size: "lg", className: "sm:flex-1" })}
      >
        <Navigation aria-hidden className="size-4" />
        Get directions
        <span className="sr-only"> (opens Google Maps)</span>
      </a>
      {primaryPhone ? (
        <a
          href={telHref(primaryPhone)}
          className={buttonStyles({ tone: "dark", variant: "secondary", size: "lg", className: "sm:flex-1" })}
        >
          <Phone aria-hidden className="size-4" />
          Call
          <span className="sr-only"> {branch.shortName}</span>
        </a>
      ) : null}
    </>
  );
}

function DetailRow({
  label,
  labelId,
  children,
}: {
  label: string;
  labelId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-nybb-bone/15 border-t py-4 first:border-t-0 first:pt-0">
      <dt id={labelId} className="type-caps text-nybb-bone/60 font-display">
        {label}
      </dt>
      <dd className="mt-2">{children}</dd>
    </div>
  );
}

/**
 * The week, one row a day, Monday first, today marked.
 *
 * Today is marked twice, by a tint across the row and by the word, because a
 * tint alone is a colour carrying a meaning. The times are mono so the "to"
 * lines up down the column and a 10 PM beside an 11 PM does not jog.
 */
function HoursTable({
  week,
  today,
  labelledBy,
}: {
  week: DayHours[];
  today: number;
  labelledBy: string;
}) {
  return (
    <table aria-labelledby={labelledBy} className="-mx-3 w-[calc(100%+1.5rem)] border-separate border-spacing-0 text-sm">
      <tbody>
        {week.map((day) => {
          const isToday = day.weekday === today;
          return (
            <tr key={day.weekday} className={cn(isToday && "bg-nybb-bone/[0.07]")}>
              <th
                scope="row"
                className={cn(
                  "rounded-l-md py-2 pl-3 text-left font-normal",
                  isToday ? "text-nybb-bone" : "text-nybb-bone/70",
                )}
              >
                {day.day}
                {isToday ? (
                  <span className="font-display type-caps text-nybb-yellow ml-2 align-[0.1em]">Today</span>
                ) : null}
              </th>
              <td
                className={cn(
                  "font-mono-tabular rounded-r-md py-2 pr-3 text-right whitespace-nowrap",
                  isToday ? "text-nybb-bone" : "text-nybb-bone/80",
                  day.kind === "unset" && "text-nybb-bone/60",
                )}
              >
                {day.text}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
