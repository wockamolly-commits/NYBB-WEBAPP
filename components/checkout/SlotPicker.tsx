"use client";

import { PRESSABLE } from "@/components/ui/Button";
import {
  capacityNote,
  formatSlotRange,
  groupSlotsByDay,
  isSlotOpen,
  unavailableMessage,
} from "@/lib/slots/format";
import type { PickupSlots } from "@/lib/slots/types";
import { cn } from "@/lib/utils";

/**
 * Choosing when to collect. Spec section 10, N1.
 *
 * The first field on the checkout screen, not the last, because it is the one
 * constraint that can invalidate the whole order. Finding out that nothing is
 * available after typing a name and a phone number is the worst order of
 * events, so the question that can fail comes first.
 *
 * A full window stays on screen and goes flat rather than disappearing. The
 * spec is specific about this: "Fully booked, try 7:15pm". A window that
 * vanishes reads as a bug in the page; a window that is visibly taken reads as
 * a busy shop, which is the truth and also happens to sell the next one.
 *
 * Nothing here computes a window. The grid comes from `get_pickup_slots()`,
 * the same one `place_order` will book against, so the picker cannot offer a
 * minute the database would then refuse.
 */
export function SlotPicker({
  slots,
  selected,
  onSelect,
  disabled = false,
}: {
  slots: PickupSlots;
  /**
   * Controlled by the checkout screen rather than held here, because the
   * selection can be invalidated by something this component never sees: a
   * window that filled between page load and Place order. The screen reloads
   * the grid and clears the choice in one move, and a copy kept in here would
   * survive that and point at a minute that is gone.
   */
  selected: string | null;
  onSelect: (startsAt: string | null) => void;
  disabled?: boolean;
}) {
  const days = groupSlotsByDay(slots);
  const unavailable = unavailableMessage(slots);

  function choose(startsAt: string) {
    onSelect(selected === startsAt ? null : startsAt);
  }

  return (
    <section aria-labelledby="pickup-time">
      <h2 id="pickup-time" className="font-display heading-panel">
        Pickup time
        <span className="text-nybb-bone/50 ml-2 font-sans text-xs tracking-[0.08em]">
          Required
        </span>
      </h2>

      {unavailable ? (
        // Not an error state. Two of the five reasons are simply "the owner
        // has not answered that yet", and the copy says which rather than
        // leaving a blank panel that reads as a fault.
        <div
          role="status"
          className="border-nybb-bone/25 mt-4 rounded-md border border-dashed p-4"
        >
          <p className="font-display heading-panel text-nybb-bone">
            {unavailable.title}
          </p>
          {/* This paragraph is the entire answer to "why can I not pick a
              time", and two of the five reasons are administrative rather
              than a fault. It reads at body size. */}
          <p className="text-nybb-bone/65 mt-2 text-sm leading-relaxed">
            {unavailable.body}
          </p>
        </div>
      ) : null}

      {days.map((day) => (
        <div key={day.key} className="mt-5">
          <h3 className="type-caps text-nybb-bone/55">{day.label}</h3>

          <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {day.slots.map((slot) => {
              const open = isSlotOpen(slot);
              const note = capacityNote(slot);
              const active = selected === slot.startsAt;

              return (
                <li key={slot.startsAt}>
                  <button
                    type="button"
                    aria-pressed={active}
                    disabled={!open || disabled}
                    onClick={() => choose(slot.startsAt)}
                    className={cn(
                      // h-full, so a window carrying "2 left" does not stand
                      // 4px taller than the one beside it. Same lesson as the
                      // menu tiles: a grid row is only as tidy as its tallest
                      // card, and the fix is to let the row equalise them
                      // rather than to hope the content matches.
                      PRESSABLE,
                      "flex h-full min-h-16 w-full flex-col items-start justify-center rounded-md px-3 py-2.5 text-left",
                      active
                        ? "bg-nybb-orange text-nybb-ink"
                        : open
                          ? "border-nybb-bone/25 hover:border-nybb-bone/60 hover:bg-nybb-bone/5 border"
                          : // Flat, not hidden. The window is real and taken.
                            "border-nybb-bone/10 text-nybb-bone/35 cursor-not-allowed border disabled:active:scale-100",
                    )}
                  >
                    <span className="font-mono-tabular text-sm leading-none">
                      {formatSlotRange(slot, slots.branch?.timezone ?? "Asia/Manila")}
                    </span>
                    {note ? (
                      <span
                        className={cn(
                          "mt-1.5 text-xs leading-none",
                          active
                            ? "text-nybb-ink/75"
                            : open
                              ? "text-nybb-orange"
                              : "text-nybb-bone/35",
                        )}
                      >
                        {note}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {slots.branch && days.length > 0 ? (
        <p className="text-nybb-bone/65 mt-4 max-w-[62ch] text-sm leading-relaxed">
          Collect at {slots.branch.name}. Windows are {slots.branch.slotMinutes} minutes
          long, and the earliest is {slots.branch.prepMinutes} minutes from now because
          that is how long the kitchen needs.
        </p>
      ) : null}
    </section>
  );
}
