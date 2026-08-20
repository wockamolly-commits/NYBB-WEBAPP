"use client";

import { ChevronDown, LoaderCircle, Save, TriangleAlert } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { WorkspaceFieldLabel, WorkspaceInput } from "@/components/ui/WorkspaceField";
import {
  formatWindow,
  formatTime12,
  formatTime12Input,
  WEEK_ORDER,
  WEEKDAY_LABELS,
  type AvailabilityActionState,
  type BranchAvailability,
  type OrderIntakeSettings,
} from "@/lib/staff/availability-types";
import { saveBranchSettings, saveOrderIntake, saveStoreHours } from "./actions";

const initialState: AvailabilityActionState = { status: "idle" };

function Message({ state }: { state: AvailabilityActionState }) {
  if (!state.message) return null;
  return <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-nybb-orange mt-3 text-sm" : "text-nybb-yellow mt-3 text-sm"}>{state.message}</p>;
}

function TimeInput({
  name,
  value,
  onChange,
  disabled,
  label,
  placeholder,
  defaultMeridiem,
  className,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  label: string;
  placeholder: string;
  defaultMeridiem: "AM" | "PM";
  className?: string;
}) {
  return <WorkspaceInput className={className} name={name} type="text" inputMode="text" autoComplete="off" placeholder={placeholder} pattern="(0?[1-9]|1[0-2]):[0-5][0-9] [AP]M" title="Enter a time such as 11:00 AM." maxLength={8} value={value} onChange={(event) => onChange(formatTime12Input(event.target.value))} onBlur={(event) => onChange(formatTime12Input(event.currentTarget.value, defaultMeridiem))} disabled={disabled} required aria-label={label} />;
}

function HoursEditor({
  branch,
  week,
  state,
  action,
  pending,
}: {
  branch: BranchAvailability;
  week: BranchAvailability["week"];
  state: AvailabilityActionState;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  const [closed, setClosed] = useState(() =>
    Object.fromEntries(week.map((day) => [day.weekday, day.isClosed])) as Record<number, boolean>,
  );
  const [times, setTimes] = useState(() => Object.fromEntries(week.map((day) => [day.weekday, {
    opens: day.opensAt ? formatTime12(day.opensAt) : "",
    closes: day.closesAt ? formatTime12(day.closesAt) : "",
  }])) as Record<number, { opens: string; closes: string }>);

  return (
    <form action={action} className="min-w-0">
      <input type="hidden" name="branchId" value={branch.branchId} />
      <h3 className="font-display heading-panel">Opening hours</h3>
      <p className="text-nybb-bone/55 mt-2 text-sm leading-relaxed">The real weekly schedule. Use 12-hour time with AM or PM. Keep every day closed until a manager confirms it. Overnight windows are supported.</p>
      {/*
        Column headers, because the grid below is two identical time boxes per
        row. The placeholders said "11:00 AM" and "10:00 PM", which is a hint
        that disappears the moment a manager types, and after that the only
        thing distinguishing opening from closing was which one came first.
        The row heading is the weekday, so these are the column headings.
      */}
      <div
        aria-hidden
        // Same border and padding as the rows, in a transparent border, so the
        // headings land on the columns rather than one pixel to their left.
        // Hidden below sm, where the row stacks and each field carries its own
        // visible label instead.
        className="type-caps text-nybb-bone/55 mt-5 hidden grid-cols-[5.25rem_1fr_1fr_auto] gap-2 border border-transparent p-2.5 pb-0 sm:grid"
      >
        <span>Day</span>
        <span>Opens</span>
        <span>Closes</span>
        <span className="w-[4.5rem]" />
      </div>
      {/*
        WHY THIS ROW STACKS.
        ================================================================
        It was a fixed four-column grid at every width. On a 375px phone that
        left roughly 60px per time box, about 33px of it inside the padding,
        for a value that reads "11:00 AM". The two fields a manager has to
        tell apart were the two that got crushed. Below sm the row becomes
        day and toggle on one line with the two times beneath, each carrying
        the visible label the hidden column headers were providing.
      */}
      <div className="mt-2 space-y-2.5">
        {WEEK_ORDER.map((weekday) => {
          const isClosed = closed[weekday];
          const setTime = (field: "opens" | "closes") => (value: string) =>
            setTimes((current) => ({
              ...current,
              [weekday]: { ...current[weekday], [field]: value },
            }));

          return (
            <div
              key={weekday}
              className="border-nybb-bone/15 grid grid-cols-[1fr_auto] items-center gap-2 rounded-md border p-2.5 sm:grid-cols-[5.25rem_1fr_1fr_auto]"
            >
              <span className="text-sm sm:order-1">{WEEKDAY_LABELS[weekday]}</span>

              {/* Ordered last on sm so the toggle keeps its column on the
                  right, while sitting beside the weekday on a phone. */}
              <label className="order-2 flex min-h-11 w-[4.5rem] cursor-pointer items-center justify-end gap-2 text-xs sm:order-4 sm:justify-start">
                <input
                  type="checkbox"
                  checked={!isClosed}
                  onChange={(event) =>
                    setClosed((current) => ({ ...current, [weekday]: !event.target.checked }))
                  }
                  disabled={pending}
                />
                <span>Open</span>
              </label>

              <div className="col-span-2 order-3 min-w-0 sm:order-2 sm:col-span-1">
                <span aria-hidden className="type-caps text-nybb-bone/55 mb-1.5 block sm:hidden">
                  Opens
                </span>
                <TimeInput
                  name={`opens-${weekday}`}
                  value={times[weekday].opens}
                  onChange={setTime("opens")}
                  disabled={pending || isClosed}
                  label={`${WEEKDAY_LABELS[weekday]} opening time`}
                  placeholder="11:00 AM"
                  defaultMeridiem="AM"
                  className="mt-0"
                />
              </div>

              <div className="col-span-2 order-4 min-w-0 sm:order-3 sm:col-span-1">
                <span aria-hidden className="type-caps text-nybb-bone/55 mb-1.5 block sm:hidden">
                  Closes
                </span>
                <TimeInput
                  name={`closes-${weekday}`}
                  value={times[weekday].closes}
                  onChange={setTime("closes")}
                  disabled={pending || isClosed}
                  label={`${WEEKDAY_LABELS[weekday]} closing time`}
                  placeholder="10:00 PM"
                  defaultMeridiem="PM"
                  className="mt-0"
                />
              </div>

              {/* A disabled input is not submitted, so a closed day would post
                  no times at all and lose the schedule it had. */}
              {isClosed ? (
                <>
                  <input type="hidden" name={`opens-${weekday}`} value={times[weekday].opens} />
                  <input type="hidden" name={`closes-${weekday}`} value={times[weekday].closes} />
                </>
              ) : null}
              <input type="hidden" name={`closed-${weekday}`} value={isClosed ? "true" : "false"} />
            </div>
          );
        })}
      </div>
      <p className="text-nybb-bone/55 mt-3 text-xs">Saved as: {week.filter((day) => !day.isClosed).map(formatWindow).join(", ") || "No published hours"}</p>
      <Button type="submit" tone="dark" variant="secondary" className="mt-5" disabled={pending}>{pending ? <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : <Save aria-hidden className="size-4" />}Save hours</Button>
      <Message state={state} />
    </form>
  );
}

function HoursForm({ branch }: { branch: BranchAvailability }) {
  const [state, action, pending] = useActionState(saveStoreHours, initialState);
  const week = state.savedHours ?? branch.week;
  const weekKey = week.map((day) => `${day.weekday}:${day.isClosed}:${day.opensAt}:${day.closesAt}`).join("|");
  return <HoursEditor key={weekKey} branch={branch} week={week} state={state} action={action} pending={pending} />;
}

function BranchConfiguration({
  branch,
  defaultOpen,
}: {
  branch: BranchAvailability;
  defaultOpen: boolean;
}) {
  const [branchState, branchAction, branchPending] = useActionState(saveBranchSettings, initialState);

  return (
    // Open on arrival when it is the only branch. A single collapsed drawer is
    // a click with exactly one possible outcome, charged on every visit.
    <details className="bg-nybb-charcoal group rounded-md" open={defaultOpen}>
      <summary className="cursor-pointer list-none p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="type-caps text-nybb-yellow">{branch.shortName}</p><h2 className="font-display heading-minor mt-1">{branch.name}</h2></div>
          <span className="text-nybb-bone/70 inline-flex items-center gap-2 text-sm">
            <span className="group-open:hidden">Open settings</span>
            <span className="hidden group-open:inline">Close settings</span>
            {/* The only disclosure in the workspace without an arrow on it. */}
            <ChevronDown
              aria-hidden
              className="text-nybb-orange size-4 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
            />
          </span>
        </div>
      </summary>
      <div className="border-nybb-bone/15 grid gap-6 border-t p-5 sm:p-6 xl:grid-cols-2">
        <form action={branchAction} className="min-w-0">
          <input type="hidden" name="branchId" value={branch.branchId} />
          <h3 className="font-display heading-panel">Pickup configuration</h3>
          <p className="text-nybb-bone/55 mt-2 text-sm leading-relaxed">These are planning values. Use Store availability to pause a counter during a shift.</p>
          <label className="border-nybb-bone/15 mt-5 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3.5">
            <input type="checkbox" name="isActive" value="true" defaultChecked={branch.isActive} disabled={branchPending} />
            <span className="text-sm">Live on the ordering platform</span>
          </label>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div><WorkspaceFieldLabel htmlFor={`prep-${branch.branchId}`}>Prep minutes</WorkspaceFieldLabel><WorkspaceInput id={`prep-${branch.branchId}`} name="prepMinutes" type="number" min="1" max="240" defaultValue={branch.prepMinutes} disabled={branchPending} required /></div>
            <div><WorkspaceFieldLabel htmlFor={`slot-${branch.branchId}`}>Slot minutes</WorkspaceFieldLabel><WorkspaceInput id={`slot-${branch.branchId}`} name="slotMinutes" type="number" min="5" max="120" defaultValue={branch.slotMinutes} disabled={branchPending} required /></div>
            <div><WorkspaceFieldLabel htmlFor={`capacity-${branch.branchId}`}>Orders per slot</WorkspaceFieldLabel><WorkspaceInput id={`capacity-${branch.branchId}`} name="slotCapacity" type="number" min="1" max="200" defaultValue={branch.slotCapacity} disabled={branchPending} required /></div>
          </div>
          <Button type="submit" tone="dark" variant="secondary" className="mt-5" disabled={branchPending}>{branchPending ? <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : <Save aria-hidden className="size-4" />}Save branch</Button>
          <Message state={branchState} />
        </form>

        <HoursForm branch={branch} />
      </div>
    </details>
  );
}

/**
 * The one control on this screen that closes the shop.
 *
 * WHY THIS ONE ASKS AND THE REST DO NOT.
 * ================================================================
 * Every other field here is a number a manager can be wrong about for an
 * afternoon: a prep time three minutes short, a capacity one order low. This
 * checkbox stops checkout for the whole business, on every branch, for every
 * customer, and it did it on one click of a small box with a Save button
 * beside it. Nothing on the screen told it apart from "Slot minutes".
 *
 * The question only appears on the way down. Turning ordering back on is the
 * recovery, and putting a question in front of a recovery is how a shop stays
 * shut for longer than anybody meant.
 */
function IntakeSettings({ intake }: { intake: OrderIntakeSettings }) {
  const [state, action, pending] = useActionState(saveOrderIntake, initialState);
  const [accepting, setAccepting] = useState(intake.acceptingOrders);
  const closing = intake.acceptingOrders && !accepting;

  return (
    <section className="bg-nybb-charcoal mt-7 rounded-md p-5 sm:p-6">
      <h2 className="font-display heading-minor">Business-wide intake</h2>
      <p className="text-nybb-bone/70 mt-2 max-w-2xl text-sm leading-relaxed">
        This stops checkout everywhere. It does not replace a counter pause, which belongs to the
        shift running that branch.
      </p>
      <form action={action} className="mt-5 flex flex-wrap items-end gap-4">
        <label className="border-nybb-bone/15 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3.5">
          <input
            type="checkbox"
            name="acceptingOrders"
            value="true"
            checked={accepting}
            onChange={(event) => setAccepting(event.target.checked)}
            disabled={pending}
          />
          <span className="text-sm">Accept orders business-wide</span>
        </label>
        <div className="w-full sm:w-52">
          <WorkspaceFieldLabel htmlFor="slot-horizon">Booking horizon, hours</WorkspaceFieldLabel>
          <WorkspaceInput
            id="slot-horizon"
            name="slotHorizonHours"
            type="number"
            min="1"
            max="168"
            defaultValue={intake.slotHorizonHours}
            disabled={pending}
            required
            aria-describedby="slot-horizon-hint"
          />
          {/* "Booking horizon" is a phrase from the schema, not from a shop. */}
          <p id="slot-horizon-hint" className="text-nybb-bone/55 mt-2 text-xs leading-snug">
            How far ahead a customer may book a pickup time. 24 means tomorrow at this hour.
          </p>
        </div>
        {closing ? (
          <div
            role="group"
            aria-labelledby="intake-close-warning"
            className="border-nybb-orange/60 bg-nybb-orange/10 w-full rounded-md border p-4"
          >
            <p id="intake-close-warning" className="flex items-start gap-2 text-sm leading-relaxed">
              <TriangleAlert aria-hidden className="text-nybb-orange mt-0.5 size-4 shrink-0" />
              Saving this stops checkout at every branch. Customers cannot place an order until
              somebody turns it back on here.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="submit" tone="dark" variant="danger" disabled={pending}>
                {pending ? (
                  <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Save aria-hidden className="size-4" />
                )}
                Stop orders everywhere
              </Button>
              <Button
                type="button"
                tone="dark"
                variant="ghost"
                disabled={pending}
                onClick={() => setAccepting(true)}
              >
                Keep taking orders
              </Button>
            </div>
          </div>
        ) : (
          <Button type="submit" tone="dark" variant="secondary" disabled={pending}>
            {pending ? (
              <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Save aria-hidden className="size-4" />
            )}
            Save intake
          </Button>
        )}
      </form>
      <Message state={state} />
    </section>
  );
}

export function SettingsManager({
  branches,
  intake,
  canManageBusinessWide,
}: {
  branches: BranchAvailability[];
  intake: OrderIntakeSettings | null;
  canManageBusinessWide: boolean;
}) {
  return (
    <>
      <div className="mt-7 space-y-5">
        {branches.map((branch) => (
          <BranchConfiguration
            key={branch.branchId}
            branch={branch}
            defaultOpen={branches.length === 1}
          />
        ))}
      </div>
      {canManageBusinessWide && intake ? <IntakeSettings intake={intake} /> : null}
    </>
  );
}
