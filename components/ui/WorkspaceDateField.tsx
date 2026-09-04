"use client";

import { Popover } from "@base-ui/react/popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PRESSABLE } from "@/components/ui/Button";
import { WorkspaceFieldLabel } from "@/components/ui/WorkspaceField";
import {
  type CalendarMonth,
  dayLabel,
  monthGrid,
  monthLabel,
  monthOf,
  shiftDateByMonths,
  shiftMonth,
  WEEKDAY_INITIALS,
  WEEKDAY_NAMES,
} from "@/lib/staff/calendar-grid";
import { isValidWorkspaceDate, manilaDateShift, manilaToday } from "@/lib/staff/manila-dates";
import { cn } from "@/lib/utils";

/**
 * A workspace date field, with a calendar this project places itself.
 *
 * WHY THE BROWSER'S OWN PICKER IS NOT USED.
 * ================================================================
 * `<input type="date">` opens a panel that is not part of the page. Chrome
 * draws it flush against the bottom edge of the control, in its own widget
 * layer, and nothing in CSS reaches it: not a margin, not a radius, not the
 * charcoal the rest of the workspace is made of. On the analytics filter card
 * that produced a panel welded to the field with the card's own edge running
 * behind it, reading as a rendering fault rather than as a menu.
 *
 * Owning the popup is the only way to give it a gap, an alignment and the
 * workspace's material, so this renders the calendar itself with the same
 * Base UI positioner WorkspaceSelect uses. The two controls therefore open the
 * same distance from their field, snap to the same edge, and flip on the same
 * rules near the bottom of the window.
 *
 * THE INPUT IS STILL A DATE INPUT.
 * ================================================================
 * Only the browser's own little calendar button is hidden. The field keeps its
 * segmented mm/dd/yyyy editing, its keyboard entry and its "YYYY-MM-DD" value,
 * so the surrounding form submits exactly what it submitted before and anybody
 * who would rather type a date can still type it. The calendar writes into the
 * same value. Alt+Down, which Chrome maps to its own panel, is intercepted and
 * opens this one instead, so the browser's cannot reappear.
 *
 * Nothing here reads the clock during render. "Today" is resolved when the
 * popup opens, which keeps the server's HTML and the client's first render
 * identical across a midnight boundary, and it is Manila's today rather than
 * the device's, because that is the day the counter is having.
 */
export function WorkspaceDateField({
  id,
  name,
  label,
  defaultValue = "",
  className,
}: {
  id: string;
  name: string;
  label: string;
  /** A "YYYY-MM-DD" value, or "" for a field that starts empty. */
  defaultValue?: string;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  // Null until the first open, which is what keeps the clock out of render.
  const [view, setView] = useState<CalendarMonth | null>(null);
  const [focusedDay, setFocusedDay] = useState("");

  const anchorRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const focusedDayRef = useRef<HTMLButtonElement | null>(null);
  // Set by the arrow keys only. Without it, every re-render of an open
  // calendar would pull focus back into the grid, including the one caused by
  // pressing the month arrows.
  const moveFocusRef = useRef(false);

  useEffect(() => {
    if (!moveFocusRef.current) return;
    moveFocusRef.current = false;
    focusedDayRef.current?.focus();
  }, [focusedDay]);

  function handleOpenChange(next: boolean) {
    if (next) {
      const anchorDay = isValidWorkspaceDate(value) ? value : manilaToday();
      setView(monthOf(anchorDay));
      setFocusedDay(anchorDay);
    }
    setOpen(next);
  }

  function commit(day: string) {
    setValue(day);
    setOpen(false);
    // Focus belongs on the field once the panel is gone, not on the button
    // that opened it, so the next Tab carries on through the form.
    inputRef.current?.focus();
  }

  function moveFocus(day: string) {
    moveFocusRef.current = true;
    setFocusedDay(day);
    const month = monthOf(day);
    if (month && (month.year !== view?.year || month.month !== view?.month)) setView(month);
  }

  function handleGridKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const weekday = new Date(`${focusedDay}T00:00:00Z`).getUTCDay();
    const byDays: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -weekday,
      End: 6 - weekday,
    };

    if (event.key in byDays) {
      event.preventDefault();
      moveFocus(manilaDateShift(focusedDay, byDays[event.key]));
      return;
    }
    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      const step = event.key === "PageUp" ? -1 : 1;
      moveFocus(shiftDateByMonths(focusedDay, event.shiftKey ? step * 12 : step));
    }
  }

  function page(by: number) {
    if (!view) return;
    setView(shiftMonth(view, by));
    // The month arrows keep their own focus, so the grid's one reachable
    // square moves with the view rather than pulling focus away from them.
    setFocusedDay(shiftDateByMonths(focusedDay, by));
  }

  const today = open ? manilaToday() : "";
  const cells = view ? monthGrid(view) : [];

  return (
    <div className={cn("min-w-0", className)}>
      <WorkspaceFieldLabel htmlFor={id}>{label}</WorkspaceFieldLabel>

      <Popover.Root open={open} onOpenChange={handleOpenChange}>
        <div ref={anchorRef} className="relative mt-2">
          <input
            ref={inputRef}
            id={id}
            name={name}
            type="date"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              // Chrome puts its own panel on Alt+Down. Left alone it would
              // open behind this one, in the corner this component exists to
              // fix.
              if (event.altKey && event.key === "ArrowDown") {
                event.preventDefault();
                handleOpenChange(true);
              }
            }}
            className="w-full py-2.5 pr-12 pl-3.5 text-base sm:text-sm [&::-webkit-calendar-picker-indicator]:hidden"
          />
          <Popover.Trigger
            aria-label={`Choose the ${label.toLowerCase()} date`}
            className={cn(
              PRESSABLE,
              "border-nybb-bone/15 text-nybb-orange absolute top-px right-px bottom-px grid w-11 place-items-center rounded-r-[0.35rem] border-l outline-none",
              "hover:bg-nybb-bone/8 data-popup-open:bg-nybb-bone/8",
            )}
          >
            <CalendarDays aria-hidden className="size-4" />
          </Popover.Trigger>
        </div>

        <Popover.Portal>
          <Popover.Positioner
            anchor={anchorRef}
            /* The gap the browser's panel could not be given. `align="start"`
               sets the calendar's left edge on the field's left edge rather
               than on the small button that opened it, which is what makes it
               read as belonging to the field. */
            align="start"
            className="z-[100] outline-none"
            collisionPadding={12}
            side="bottom"
            sideOffset={10}
          >
            <Popover.Popup
              initialFocus={focusedDayRef}
              className={cn(
                "border-nybb-bone/40 bg-nybb-charcoal text-nybb-bone min-w-[max(var(--anchor-width),17rem)] max-w-[var(--available-width)] origin-[var(--transform-origin)] rounded-md border p-3 shadow-lg shadow-black/50 outline-none",
                "transition-[transform,opacity] duration-100 ease-out data-starting-style:scale-[0.98] data-starting-style:opacity-0 data-ending-style:scale-[0.98] data-ending-style:opacity-0 motion-reduce:transition-none",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p aria-live="polite" className="font-display text-sm tracking-[0.04em]">
                  {view ? monthLabel(view) : ""}
                </p>
                <div className="flex items-center gap-1">
                  <PagingButton label="Previous month" onClick={() => page(-1)}>
                    <ChevronLeft aria-hidden className="size-4" />
                  </PagingButton>
                  <PagingButton label="Next month" onClick={() => page(1)}>
                    <ChevronRight aria-hidden className="size-4" />
                  </PagingButton>
                </div>
              </div>

              <div
                role="grid"
                aria-label={view ? monthLabel(view) : label}
                className="mt-3"
                onKeyDown={handleGridKeyDown}
              >
                <div role="row" className="grid grid-cols-7">
                  {WEEKDAY_INITIALS.map((initial, index) => (
                    <abbr
                      key={initial}
                      role="columnheader"
                      title={WEEKDAY_NAMES[index]}
                      className="text-nybb-bone/55 grid h-7 place-items-center text-xs no-underline"
                    >
                      {initial}
                    </abbr>
                  ))}
                </div>

                {Array.from({ length: cells.length / 7 }, (_, row) => (
                  <div key={row} role="row" className="grid grid-cols-7">
                    {cells.slice(row * 7, row * 7 + 7).map((cell) => {
                      const selected = cell.value === value;
                      const focused = cell.value === focusedDay;
                      return (
                        <div
                          key={cell.value}
                          role="gridcell"
                          /* The selected state rides the cell rather than the
                             button inside it, because a button is already a
                             pressable thing and aria-selected means nothing on
                             one. This is the pair the grid pattern expects. */
                          aria-selected={selected}
                          className="grid place-items-center"
                        >
                          <button
                            type="button"
                            ref={focused ? focusedDayRef : undefined}
                            /* One square at a time is reachable by Tab, and the
                               arrow keys move which one that is. Six rows of tab
                               stops would put the two buttons underneath the
                               grid forty two presses away. */
                            tabIndex={focused ? 0 : -1}
                            aria-label={dayLabel(cell.value)}
                            aria-current={cell.value === today ? "date" : undefined}
                            onClick={() => commit(cell.value)}
                            className={cn(
                              PRESSABLE,
                              "grid size-9 place-items-center rounded-sm text-sm outline-none",
                              /* The borrowed days are quieter than the month's
                                 own, but not below the workspace's contrast
                                 floor: bone/55 is the last step that still
                                 passes AA on charcoal, and these carry a date
                                 you can click. */
                              cell.inMonth ? "text-nybb-bone/85" : "text-nybb-bone/55",
                              "hover:bg-nybb-bone/10 hover:text-nybb-bone",
                              cell.value === today && !selected && "text-nybb-yellow font-semibold",
                              selected
                                && "bg-nybb-orange text-nybb-ink hover:bg-nybb-orange-lit hover:text-nybb-ink font-semibold",
                            )}
                          >
                            {cell.day}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="border-nybb-bone/15 mt-3 flex items-center justify-between border-t pt-2">
                <FooterButton onClick={() => commit("")}>Clear</FooterButton>
                <FooterButton onClick={() => commit(manilaToday())}>Today</FooterButton>
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

function PagingButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        PRESSABLE,
        "text-nybb-bone/70 hover:bg-nybb-bone/10 hover:text-nybb-bone grid size-8 place-items-center rounded-sm outline-none",
      )}
    >
      {children}
    </button>
  );
}

function FooterButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        PRESSABLE,
        "type-caps text-nybb-orange hover:bg-nybb-bone/10 rounded-sm px-2 py-1.5 outline-none",
      )}
    >
      {children}
    </button>
  );
}
