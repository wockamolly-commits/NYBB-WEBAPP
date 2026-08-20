"use client";

import { LoaderCircle, PauseCircle, PlayCircle, Store } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import {
  AVAILABILITY_REASON_COPY,
  availabilityReason,
  formatWindow,
  WEEK_ORDER,
  WEEKDAY_SHORT_LABELS,
  type AvailabilityActionState,
  type BranchAvailability,
  type OrderIntakeSettings,
} from "@/lib/staff/availability-types";
import { setBranchOrderIntake } from "./actions";

const initialState: AvailabilityActionState = { status: "idle" };

function StatusMessage({ state }: { state: AvailabilityActionState }) {
  if (!state.message) return null;
  return (
    <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-nybb-orange mt-3 text-sm" : "text-nybb-yellow mt-3 text-sm"}>
      {state.message}
    </p>
  );
}

function BranchCard({ branch, intake }: { branch: BranchAvailability; intake: OrderIntakeSettings }) {
  const [state, action, pending] = useActionState(setBranchOrderIntake, initialState);
  const reason = availabilityReason(branch, intake);
  const canToggle = intake.acceptingOrders && branch.isActive && branch.hasPublishedHours;
  const willAccept = !branch.isAcceptingOrders;
  const blockedId = `availability-blocked-${branch.branchId}`;

  return (
    <article className="bg-nybb-charcoal rounded-md p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display heading-minor">{branch.name}</h2>
            <span className={branch.acceptsOrdersNow ? "bg-nybb-yellow/15 text-nybb-yellow rounded px-2 py-1 text-xs font-semibold uppercase tracking-wider" : "bg-nybb-bone/10 text-nybb-bone/55 rounded px-2 py-1 text-xs font-semibold uppercase tracking-wider"}>
              {branch.acceptsOrdersNow ? "Taking orders" : "Not taking orders"}
            </span>
          </div>
          <p className="text-nybb-bone/55 mt-2 text-sm">{branch.timezone} · {branch.prepMinutes} min prep · {branch.slotMinutes}-min slots · {branch.slotCapacity} orders per slot</p>
        </div>
        <span className="bg-nybb-graphite text-nybb-orange grid size-11 place-items-center rounded-md"><Store aria-hidden className="size-5" /></span>
      </div>

      <div className="border-nybb-bone/15 mt-5 grid gap-4 border-t pt-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="font-display heading-panel">Current status</p>
          <p className="text-nybb-bone/70 mt-2 text-sm leading-relaxed">{AVAILABILITY_REASON_COPY[reason]}</p>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <span className="text-nybb-bone/60">Platform: <strong className="text-nybb-bone font-medium">{branch.isActive ? "Live" : "Not live"}</strong></span>
            <span className="text-nybb-bone/60">Counter: <strong className="text-nybb-bone font-medium">{branch.isAcceptingOrders ? "Open" : "Paused"}</strong></span>
            <span className="text-nybb-bone/60">Hours: <strong className="text-nybb-bone font-medium">{branch.hasPublishedHours ? "Published" : "Missing"}</strong></span>
            <span className="text-nybb-bone/60">Now: <strong className="text-nybb-bone font-medium">{branch.isOpenNow ? "Within hours" : "Outside hours"}</strong></span>
          </div>
        </div>
        <form action={action}>
          <input type="hidden" name="branchId" value={branch.branchId} />
          <input type="hidden" name="accepting" value={willAccept ? "true" : "false"} />
          <Button
            type="submit"
            tone="dark"
            variant={willAccept ? "primary" : "danger"}
            disabled={pending || !canToggle}
            aria-describedby={canToggle ? undefined : blockedId}
          >
            {pending ? <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : willAccept ? <PlayCircle aria-hidden className="size-4" /> : <PauseCircle aria-hidden className="size-4" />}
            {willAccept ? "Resume orders" : "Pause orders"}
          </Button>
        </form>
      </div>
      {/*
        The reason sits above the dead button rather than below it, and carries
        an id the button points at. A disabled control is skipped by the Tab
        key, so an explanation placed after it was reachable only by somebody
        who already knew to go looking for it.
      */}
      {!canToggle ? (
        <p id={blockedId} className="text-nybb-bone/55 mt-3 text-xs">{!intake.acceptingOrders ? "Business-wide ordering is paused. A settings manager must resume it first." : !branch.isActive ? "Make this branch live in Settings before opening the counter." : "Publish its hours in Settings before opening the counter."}</p>
      ) : null}
      <StatusMessage state={state} />

      <div className="border-nybb-bone/15 mt-5 overflow-x-auto border-t pt-4">
        <div className="grid min-w-[36rem] grid-cols-7 gap-2">
          {WEEK_ORDER.map((weekday) => {
            const day = branch.week[weekday];
            return <div key={weekday} className="bg-nybb-graphite rounded p-2.5"><p className="type-caps text-nybb-bone/60">{WEEKDAY_SHORT_LABELS[weekday]}</p><p className="text-nybb-bone/75 mt-1 text-xs leading-snug">{formatWindow(day)}</p></div>;
          })}
        </div>
      </div>
    </article>
  );
}

export function AvailabilityManager({ branches, intake }: { branches: BranchAvailability[]; intake: OrderIntakeSettings }) {
  return <div className="mt-7 space-y-5">{branches.map((branch) => <BranchCard key={branch.branchId} branch={branch} intake={intake} />)}</div>;
}
