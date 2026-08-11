"use client";

import { LoaderCircle, Save } from "lucide-react";
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
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  label: string;
  placeholder: string;
  defaultMeridiem: "AM" | "PM";
}) {
  return <WorkspaceInput name={name} type="text" inputMode="text" autoComplete="off" placeholder={placeholder} pattern="(0?[1-9]|1[0-2]):[0-5][0-9] [AP]M" title="Enter a time such as 11:00 AM." maxLength={8} value={value} onChange={(event) => onChange(formatTime12Input(event.target.value))} onBlur={(event) => onChange(formatTime12Input(event.currentTarget.value, defaultMeridiem))} disabled={disabled} required aria-label={label} />;
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
      <div className="mt-5 space-y-2.5">
        {WEEK_ORDER.map((weekday) => {
          const isClosed = closed[weekday];
          return <div key={weekday} className="border-nybb-bone/15 grid grid-cols-[5.25rem_1fr_1fr_auto] items-center gap-2 rounded-md border p-2.5"><span className="text-sm">{WEEKDAY_LABELS[weekday]}</span><TimeInput name={`opens-${weekday}`} value={times[weekday].opens} onChange={(value) => setTimes((current) => ({ ...current, [weekday]: { ...current[weekday], opens: value } }))} disabled={pending || isClosed} label={`${WEEKDAY_LABELS[weekday]} opening time`} placeholder="11:00 AM" defaultMeridiem="AM" /><TimeInput name={`closes-${weekday}`} value={times[weekday].closes} onChange={(value) => setTimes((current) => ({ ...current, [weekday]: { ...current[weekday], closes: value } }))} disabled={pending || isClosed} label={`${WEEKDAY_LABELS[weekday]} closing time`} placeholder="10:00 PM" defaultMeridiem="PM" />{isClosed ? <><input type="hidden" name={`opens-${weekday}`} value={times[weekday].opens} /><input type="hidden" name={`closes-${weekday}`} value={times[weekday].closes} /></> : null}<input type="hidden" name={`closed-${weekday}`} value={isClosed ? "true" : "false"} /><label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs"><input type="checkbox" checked={!isClosed} onChange={(event) => setClosed((current) => ({ ...current, [weekday]: !event.target.checked }))} disabled={pending} /><span>Open</span></label></div>;
        })}
      </div>
      <p className="text-nybb-bone/45 mt-3 text-xs">Currently: {week.filter((day) => !day.isClosed).map(formatWindow).join(", ") || "No published hours"}</p>
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

function BranchConfiguration({ branch }: { branch: BranchAvailability }) {
  const [branchState, branchAction, branchPending] = useActionState(saveBranchSettings, initialState);

  return (
    <details className="bg-nybb-charcoal group rounded-md">
      <summary className="cursor-pointer list-none p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="type-caps text-nybb-yellow">{branch.shortName}</p><h2 className="font-display heading-minor mt-1">{branch.name}</h2></div>
          <span className="text-nybb-bone/55 text-sm group-open:hidden">Open settings</span>
          <span className="text-nybb-bone/55 hidden text-sm group-open:inline">Close settings</span>
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

function IntakeSettings({ intake }: { intake: OrderIntakeSettings }) {
  const [state, action, pending] = useActionState(saveOrderIntake, initialState);
  return <section className="bg-nybb-charcoal mt-7 rounded-md p-5 sm:p-6"><h2 className="font-display heading-minor">Business-wide intake</h2><p className="text-nybb-bone/55 mt-2 max-w-2xl text-sm leading-relaxed">This stops checkout everywhere. It does not replace a counter pause, which belongs to the shift running that branch.</p><form action={action} className="mt-5 flex flex-wrap items-end gap-4"><label className="border-nybb-bone/15 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3.5"><input type="checkbox" name="acceptingOrders" value="true" defaultChecked={intake.acceptingOrders} disabled={pending} /><span className="text-sm">Accept orders business-wide</span></label><div className="w-full sm:w-52"><WorkspaceFieldLabel htmlFor="slot-horizon">Booking horizon, hours</WorkspaceFieldLabel><WorkspaceInput id="slot-horizon" name="slotHorizonHours" type="number" min="1" max="168" defaultValue={intake.slotHorizonHours} disabled={pending} required /></div><Button type="submit" tone="dark" variant="secondary" disabled={pending}>{pending ? <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : <Save aria-hidden className="size-4" />}Save intake</Button></form><Message state={state} /></section>;
}

export function SettingsManager({ branches, intake, canManageBusinessWide }: { branches: BranchAvailability[]; intake: OrderIntakeSettings | null; canManageBusinessWide: boolean }) {
  return <><div className="mt-7 space-y-5">{branches.map((branch) => <BranchConfiguration key={branch.branchId} branch={branch} />)}</div>{canManageBusinessWide && intake ? <IntakeSettings intake={intake} /> : null}</>;
}
