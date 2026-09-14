"use client";

import { ArrowUpRight, MapPin } from "lucide-react";
import { useState } from "react";
import type { BranchEntry } from "@/lib/branches/entries";
import { telHref } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { BranchDialog, OpenState } from "./BranchDialog";

/**
 * The branches page's nine cards, each opening its counter's detail sheet.
 *
 * The sheet, and why it is a dialog, is in `BranchDialog.tsx`. It is shared
 * with the counter picker, which opens it from the nearest-counter suggestion.
 */

export type { BranchEntry } from "@/lib/branches/entries";

export function BranchDirectory({ branches }: { branches: BranchEntry[] }) {
  // The slug, not the entry. The page refreshes itself when hours are saved
  // (see BranchesLiveRefresh), which hands this component new entries; holding
  // the entry object would keep an open sheet showing the week it was opened
  // with while the cards behind it moved on.
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const selected = branches.find((branch) => branch.slug === selectedSlug) ?? null;

  function show(branch: BranchEntry) {
    setSelectedSlug(branch.slug);
    setOpen(true);
  }

  return (
    <>
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {branches.map((branch) => (
          <BranchCard key={branch.slug} branch={branch} onOpen={() => show(branch)} />
        ))}
      </ul>

      <BranchDialog branch={selected} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function BranchCard({ branch, onOpen }: { branch: BranchEntry; onOpen: () => void }) {
  return (
    <li
      className={cn(
        "bg-nybb-charcoal text-nybb-bone group relative flex flex-col rounded-md p-5",
        "transition-colors duration-200 ease-out",
        "has-[[data-card-trigger]:hover]:bg-nybb-graphite",
        // The ring belongs to the card, not to the words inside it: the whole
        // card is the target, and a ring around the name alone would say the
        // name is. Ink, because the offset puts it on the amber ground.
        "has-[[data-card-trigger]:focus-visible]:outline-nybb-ink has-[[data-card-trigger]:focus-visible]:outline-[3px] has-[[data-card-trigger]:focus-visible]:outline-offset-2",
      )}
    >
      {/* Anton at label size, the site's own label voice. See the note this
          replaced in git history: mono was doing the job of looking technical. */}
      <p className="font-display type-caps text-nybb-bone/60">{branch.formatLabel}</p>

      <h2 className="font-display mt-2 text-xl leading-tight">
        {/* The stretched trigger. Its ::after covers the card, so the whole
            plate opens the branch while the phone links below sit above that
            layer and still dial. */}
        <button
          type="button"
          data-card-trigger
          onClick={onOpen}
          aria-haspopup="dialog"
          // Case inherited, because the browser's own button style resets it
          // and the display face is uppercase by definition.
          className="text-left [text-transform:inherit] after:absolute after:inset-0 after:rounded-md after:content-[''] focus-visible:outline-none"
        >
          {branch.shortName}
        </button>
      </h2>

      <p className="text-nybb-bone/65 mt-2 text-sm leading-relaxed">
        {branch.addressLine}
        <br />
        {branch.city}
      </p>

      {branch.summary || branch.openNow !== null ? (
        <p className="text-nybb-bone/80 mt-3 flex flex-wrap items-center gap-x-2 text-sm">
          {branch.openNow !== null ? <OpenState open={branch.openNow} /> : null}
          {branch.openNow !== null && branch.summary ? (
            <span aria-hidden className="text-nybb-bone/40">
              ·
            </span>
          ) : null}
          {branch.summary ? <span>{branch.summary}</span> : null}
        </p>
      ) : null}

      <ul className="relative z-10 mt-2 w-fit">
        {branch.phones.map((phone) => (
          <li key={phone}>
            <a
              href={telHref(phone)}
              className="font-mono-tabular text-nybb-orange hover:text-nybb-orange-lit inline-flex min-h-11 items-center text-sm transition-colors"
            >
              {phone}
            </a>
          </li>
        ))}
      </ul>

      {/* The affordance, drawn rather than announced. It is not a second
          control: the trigger above already covers this corner. */}
      <p
        aria-hidden
        className="font-display text-nybb-orange mt-auto flex items-center gap-1.5 pt-4 text-sm tracking-[0.06em] uppercase"
      >
        <MapPin className="size-4" />
        Map and hours
        <ArrowUpRight className="size-4 transition-transform duration-200 ease-out group-has-[[data-card-trigger]:hover]:translate-x-0.5 group-has-[[data-card-trigger]:hover]:-translate-y-0.5 motion-reduce:transform-none" />
      </p>
    </li>
  );
}
