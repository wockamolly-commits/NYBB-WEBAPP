"use client";

import { ChevronDown, LoaderCircle, MapPin, Plus, Save, Search, TriangleAlert } from "lucide-react";
import dynamic from "next/dynamic";
import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { WorkspaceFieldLabel, WorkspaceInput } from "@/components/ui/WorkspaceField";
import { WorkspaceNumberInput } from "@/components/ui/WorkspaceNumberInput";
import { WorkspaceSelect } from "@/components/ui/WorkspaceSelect";
import { branchFormatLabel } from "@/lib/catalog/branches";
import {
  formatWindow,
  formatTime12,
  formatTime12Input,
  WEEK_ORDER,
  WEEKDAY_LABELS,
  type AvailabilityActionState,
  type BranchAvailability,
  type BranchDetails,
  type OrderIntakeSettings,
  type PriceListOption,
} from "@/lib/staff/availability-types";
import { BRANCH_FORMATS } from "@/lib/staff/branch-create-schema";
import {
  formatCoordinates,
  parseCoordinates,
  type LatLngPoint,
} from "@/lib/staff/branch-location-schema";
import { CEBU_CENTER, parsePlaceResults, placeSearchUrl, type PlaceResult } from "@/lib/staff/location-search";
import {
  createBranch,
  deleteBranch,
  saveBranchDetails,
  saveBranchLocation,
  saveBranchSettings,
  saveOrderIntake,
  saveStoreHours,
} from "./actions";

const LocationPickerMap = dynamic(() => import("./LocationPickerMap"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center">
      <LoaderCircle aria-hidden className="text-nybb-bone/70 size-5 animate-spin motion-reduce:animate-none" />
    </div>
  ),
});
const MAPS_ENABLED = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim());

/**
 * Where a branch's map pin comes from today. `workspace` was set on this
 * screen; `catalog` is the confirmed pin shipped with the site, used until
 * somebody sets one here; with neither, the map searches the street address.
 */
export type BranchLocation = {
  pin: LatLngPoint | null;
  catalogPin: LatLngPoint | null;
  source: "workspace" | "catalog" | null;
};

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

/**
 * Finding the place by name, so nobody has to hunt for it by panning. A
 * result moves the pin and the map to it; dragging the pin then puts it on
 * the exact door, since a search lands on the place, not on the counter in it.
 *
 * Not a form of its own: it sits inside the location form, so Enter in the
 * box is caught here and runs the search instead of saving the location.
 */
function PlaceSearch({ near, onPick, disabled }: { near: LatLngPoint | null; onPick: (point: LatLngPoint) => void; disabled: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputId = useId();

  async function search() {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token || query.trim().length < 2) return;
    setSearching(true);
    setFailed(false);
    try {
      const response = await fetch(placeSearchUrl(query, token, near ?? CEBU_CENTER));
      setResults(response.ok ? parsePlaceResults(await response.json()) : []);
      setFailed(!response.ok);
    } catch {
      setResults([]);
      setFailed(true);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="mt-4">
      <WorkspaceFieldLabel htmlFor={inputId}>Search location</WorkspaceFieldLabel>
      <div className="mt-2 flex flex-wrap gap-2">
        <WorkspaceInput
          id={inputId}
          type="search"
          className="mt-0 min-w-0 flex-1 basis-60"
          placeholder="Ayala Center Cebu, or a street address"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void search();
            }
          }}
          disabled={disabled}
        />
        <Button type="button" tone="dark" variant="secondary" onClick={() => void search()} disabled={disabled || searching || query.trim().length < 2}>
          {searching ? <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : <Search aria-hidden className="size-4" />}
          Search
        </Button>
      </div>
      <div aria-live="polite">
        {results && results.length > 0 ? (
          <ul className="border-nybb-bone/15 mt-2 divide-y divide-nybb-bone/10 rounded-md border">
            {results.map((result) => (
              <li key={result.id}>
                <button
                  type="button"
                  className="hover:bg-nybb-bone/5 focus-visible:outline-nybb-orange flex min-h-11 w-full flex-col items-start px-3.5 py-2 text-left focus-visible:outline-2"
                  onClick={() => {
                    onPick(result.point);
                    setResults(null);
                  }}
                >
                  <span className="text-sm">{result.name}</span>
                  {result.detail ? <span className="text-nybb-bone/55 text-xs">{result.detail}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : results ? (
          <p className="text-nybb-bone/70 mt-2 text-sm">
            {failed ? "The search could not be reached. Try again, or place the pin by hand." : "Nothing found. Try the mall or street name with the city."}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Search, map and coordinates, the three ways to place a pin, shared by Add a
 * branch and Edit branch. The point and the text are owned by the caller,
 * because each form decides what saving means. Every route writes the same
 * text field, named `coordinates`, so what is saved is what the field shows.
 * `children` sits beside the coordinates, for the caller's buttons.
 */
function PinPicker({
  idPrefix,
  label,
  point,
  text,
  onPoint,
  onText,
  pending,
  children,
}: {
  idPrefix: string;
  label: string;
  point: LatLngPoint | null;
  text: string;
  onPoint: (point: LatLngPoint | null) => void;
  onText: (text: string) => void;
  pending: boolean;
  children?: React.ReactNode;
}) {
  function place(next: LatLngPoint) {
    onPoint(next);
    onText(formatCoordinates(next));
  }

  return (
    <>
      {MAPS_ENABLED ? <PlaceSearch near={point} onPick={place} disabled={pending} /> : null}

      {MAPS_ENABLED ? (
        <div className="border-nybb-bone/15 mt-4 h-72 overflow-hidden rounded-md border sm:h-80">
          <LocationPickerMap point={point} onChange={place} label={label} />
        </div>
      ) : (
        <p className="text-nybb-bone/70 mt-4 text-sm">
          The map picker needs a Mapbox token on this deployment. Paste coordinates below instead.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-80">
          <WorkspaceFieldLabel htmlFor={`${idPrefix}-coords`}>Coordinates</WorkspaceFieldLabel>
          <WorkspaceInput
            id={`${idPrefix}-coords`}
            name="coordinates"
            inputMode="decimal"
            autoComplete="off"
            placeholder="10.3107153, 123.8962067"
            value={text}
            onChange={(event) => {
              onText(event.target.value);
              // Emptied by hand means no pin, not a pin left where it was.
              if (!event.target.value.trim()) onPoint(null);
            }}
            onBlur={(event) => {
              const parsed = parseCoordinates(event.currentTarget.value);
              if (parsed) onPoint(parsed);
            }}
            disabled={pending}
          />
        </div>
        {children}
      </div>
    </>
  );
}

/**
 * The pin the Branches page map and the route map point at. Drop it on the
 * map, drag it to the door, or paste the pair Google Maps copies when the
 * counter is right-clicked there. Both routes write the same text field, so
 * what is saved is always what the field shows.
 */
function LocationEditor({ branch, location }: { branch: BranchAvailability; location: BranchLocation }) {
  const [state, action, pending] = useActionState(saveBranchLocation, initialState);
  const [point, setPoint] = useState<LatLngPoint | null>(location.pin);
  const [text, setText] = useState(location.pin ? formatCoordinates(location.pin) : "");
  const [source, setSource] = useState(location.source);

  const sourceNote =
    source === "workspace"
      ? "Set from this screen."
      : source === "catalog"
        ? "Using the pin from the branch's original listing. Saving here replaces it."
        : "No pin yet, so the Branches page map searches the street address instead.";

  return (
    <form
      action={action}
      className="min-w-0 xl:col-span-2"
      onSubmit={(event) => {
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (submitter?.value === "clear") {
          // Back to whatever the page will fall back to, without waiting.
          setPoint(location.catalogPin);
          setText(location.catalogPin ? formatCoordinates(location.catalogPin) : "");
          setSource(location.catalogPin ? "catalog" : null);
        } else if (point) {
          setSource("workspace");
        }
      }}
    >
      <input type="hidden" name="branchId" value={branch.branchId} />
      <h3 className="font-display heading-panel">Map location</h3>
      <p className="text-nybb-bone/70 mt-2 max-w-2xl text-sm leading-relaxed">
        Where the pin sits in the branch map customers open on the Branches page. Search for the
        place, or click the map to drop the pin, then drag it onto the counter. You can also paste
        coordinates from Google Maps (right-click the spot there and click the numbers to copy
        them).
      </p>
      <p className="text-nybb-bone/55 mt-2 text-xs">{sourceNote}</p>

      <PinPicker
        idPrefix={`pin-${branch.branchId}`}
        label={`Map for placing the ${branch.shortName} pin`}
        point={point}
        text={text}
        onPoint={setPoint}
        onText={setText}
        pending={pending}
      >
        <Button type="submit" name="intent" value="save" tone="dark" variant="secondary" disabled={pending || !text.trim()}>
          {pending ? <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : <MapPin aria-hidden className="size-4" />}
          Save location
        </Button>
        {source === "workspace" ? (
          <Button type="submit" name="intent" value="clear" tone="dark" variant="ghost" disabled={pending}>
            Remove pin
          </Button>
        ) : null}
      </PinPicker>
      <Message state={state} />
    </form>
  );
}

/**
 * Removing a branch for good, behind the workspace's own confirmation dialog.
 *
 * The database decides whether it is safe (staff_delete_branch, 0084) and
 * this says why when it is not. The one rule checked here as well is the
 * switch, because it is visible on this very drawer: a live branch shows a
 * disabled button and the reason, rather than a dialog that is going to fail.
 */
function DeleteBranch({ branch }: { branch: BranchAvailability }) {
  const [state, action, pending] = useActionState(deleteBranch, initialState);

  return (
    <form action={action} className="border-nybb-bone/15 min-w-0 border-t pt-6 xl:col-span-2">
      <input type="hidden" name="branchId" value={branch.branchId} />
      <h3 className="font-display heading-panel">Delete branch</h3>
      <p className="text-nybb-bone/70 mt-2 max-w-2xl text-sm leading-relaxed">
        Removes the branch, its hours and its map pin for good. Only a branch that is switched off
        and has never taken an order can be deleted, and only once no staff or promo codes are tied
        to it. To stop using a branch that has history, switch it off instead.
      </p>
      {branch.isActive ? (
        <p className="text-nybb-bone/70 mt-3 text-sm">
          This branch is live. Untick Live on the ordering platform above and save before deleting
          it.
        </p>
      ) : null}
      <div className="mt-4">
        <ConfirmDeleteButton
          label="Delete branch"
          name={branch.name}
          meta={branch.shortName}
          consequence="The branch disappears from the Branches page and from this screen, with its hours and map pin. Its audit history is kept."
          disabled={branch.isActive}
          pending={pending}
        />
      </div>
      <Message state={state} />
    </form>
  );
}

function BranchConfiguration({
  branch,
  details,
  location,
  canDelete,
  defaultOpen,
}: {
  branch: BranchAvailability;
  details: BranchDetails | null;
  location: BranchLocation;
  /** Business wide only, the same as adding a branch. */
  canDelete: boolean;
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
            <span className="group-open:hidden">Edit branch</span>
            <span className="hidden group-open:inline">Close</span>
            {/* The only disclosure in the workspace without an arrow on it. */}
            <ChevronDown
              aria-hidden
              className="text-nybb-orange size-4 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
            />
          </span>
        </div>
      </summary>
      <div className="border-nybb-bone/15 grid gap-6 border-t p-5 sm:p-6 xl:grid-cols-2">
        <DetailsEditor details={details} />
        <form action={branchAction} className="min-w-0">
          <input type="hidden" name="branchId" value={branch.branchId} />
          <h3 className="font-display heading-panel">Pickup configuration</h3>
          <p className="text-nybb-bone/55 mt-2 text-sm leading-relaxed">These are planning values. Use Store availability to pause a counter during a shift.</p>
          <label className="border-nybb-bone/15 mt-5 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3.5">
            <input type="checkbox" name="isActive" value="true" defaultChecked={branch.isActive} disabled={branchPending} />
            <span className="text-sm">Live on the ordering platform</span>
          </label>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div><WorkspaceFieldLabel htmlFor={`prep-${branch.branchId}`}>Prep minutes</WorkspaceFieldLabel><WorkspaceNumberInput id={`prep-${branch.branchId}`} name="prepMinutes" shape="integer" defaultValue={branch.prepMinutes} disabled={branchPending} required /></div>
            <div><WorkspaceFieldLabel htmlFor={`slot-${branch.branchId}`}>Slot minutes</WorkspaceFieldLabel><WorkspaceNumberInput id={`slot-${branch.branchId}`} name="slotMinutes" shape="integer" defaultValue={branch.slotMinutes} disabled={branchPending} required /></div>
            <div><WorkspaceFieldLabel htmlFor={`capacity-${branch.branchId}`}>Orders per slot</WorkspaceFieldLabel><WorkspaceNumberInput id={`capacity-${branch.branchId}`} name="slotCapacity" shape="integer" defaultValue={branch.slotCapacity} disabled={branchPending} required /></div>
          </div>
          <Button type="submit" tone="dark" variant="secondary" className="mt-5" disabled={branchPending}>{branchPending ? <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : <Save aria-hidden className="size-4" />}Save branch</Button>
          <Message state={branchState} />
        </form>

        <HoursForm branch={branch} />
        <LocationEditor branch={branch} location={location} />
        {canDelete ? <DeleteBranch branch={branch} /> : null}
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
          <WorkspaceNumberInput
            id="slot-horizon"
            name="slotHorizonHours"
            shape="integer"
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


const FORMAT_OPTIONS = BRANCH_FORMATS.map((format) => ({ value: format, label: branchFormatLabel[format] }));

/**
 * The details a branch publishes, shared by Add a branch and Edit branch so
 * the two forms cannot drift. `idPrefix` keeps the ids unique when several
 * drawers are on the page at once.
 */
function BranchDetailsFields({
  idPrefix,
  initial,
  pending,
  children,
}: {
  idPrefix: string;
  initial?: BranchDetails;
  pending: boolean;
  /** Extra fields that belong beside the type of site, such as the price list. */
  children?: React.ReactNode;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <WorkspaceFieldLabel htmlFor={`${idPrefix}-name`}>Full name</WorkspaceFieldLabel>
        <WorkspaceInput id={`${idPrefix}-name`} name="name" maxLength={120} placeholder="NYBB Hot Wings, Ayala Center" defaultValue={initial?.name} disabled={pending} required />
      </div>
      <div>
        <WorkspaceFieldLabel htmlFor={`${idPrefix}-short`}>Short name</WorkspaceFieldLabel>
        <WorkspaceInput id={`${idPrefix}-short`} name="shortName" maxLength={40} placeholder="Ayala Center" defaultValue={initial?.shortName} disabled={pending} required aria-describedby={`${idPrefix}-short-hint`} />
        <p id={`${idPrefix}-short-hint`} className="text-nybb-bone/55 mt-2 text-xs leading-snug">
          Shown on tickets, the orders board and the counter picker.
        </p>
      </div>
      <WorkspaceSelect id={`${idPrefix}-format`} name="format" label="Type of site" options={FORMAT_OPTIONS} defaultValue={initial?.format ?? "street"} disabled={pending} />
      {children}
      <div className="sm:col-span-2">
        <WorkspaceFieldLabel htmlFor={`${idPrefix}-address`}>Address</WorkspaceFieldLabel>
        <WorkspaceInput id={`${idPrefix}-address`} name="addressLine" maxLength={200} placeholder="Level 2, Ayala Center Cebu" defaultValue={initial?.addressLine} disabled={pending} required />
      </div>
      <div>
        <WorkspaceFieldLabel htmlFor={`${idPrefix}-barangay`}>Barangay (optional)</WorkspaceFieldLabel>
        <WorkspaceInput id={`${idPrefix}-barangay`} name="barangay" maxLength={80} defaultValue={initial?.barangay ?? ""} disabled={pending} />
      </div>
      <div>
        <WorkspaceFieldLabel htmlFor={`${idPrefix}-city`}>City</WorkspaceFieldLabel>
        <WorkspaceInput id={`${idPrefix}-city`} name="city" maxLength={80} placeholder="Cebu City" defaultValue={initial?.city} disabled={pending} required />
      </div>
      <div className="sm:col-span-2">
        <WorkspaceFieldLabel htmlFor={`${idPrefix}-phones`}>Phone numbers (optional)</WorkspaceFieldLabel>
        <WorkspaceInput id={`${idPrefix}-phones`} name="phones" type="text" inputMode="tel" maxLength={140} defaultValue={initial?.phones.join(", ")} disabled={pending} aria-describedby={`${idPrefix}-phones-hint`} />
        <p id={`${idPrefix}-phones-hint`} className="text-nybb-bone/55 mt-2 text-xs leading-snug">
          Up to four, separated by commas.
        </p>
      </div>
    </div>
  );
}

/**
 * What a customer reads about the branch: its names, address and the numbers
 * to call. The slug behind its links does not change when it is renamed, so
 * nobody's saved store or bookmark breaks.
 */
function DetailsEditor({ details }: { details: BranchDetails | null }) {
  const [state, action, pending] = useActionState(saveBranchDetails, initialState);

  if (!details) {
    return (
      <div className="xl:col-span-2">
        <h3 className="font-display heading-panel">Branch details</h3>
        <p className="text-nybb-bone/70 mt-2 text-sm">
          The branch details could not be loaded, so they cannot be edited right now. Reload the
          page to try again.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="border-nybb-bone/15 min-w-0 border-b pb-6 xl:col-span-2">
      <input type="hidden" name="branchId" value={details.branchId} />
      <h3 className="font-display heading-panel">Branch details</h3>
      <p className="text-nybb-bone/70 mt-2 mb-5 max-w-2xl text-sm leading-relaxed">
        The name, address and phone numbers customers see on the Branches page, the store picker
        and their order.
      </p>
      <BranchDetailsFields idPrefix={`edit-${details.branchId}`} initial={details} pending={pending} />
      <Button type="submit" tone="dark" variant="secondary" className="mt-5" disabled={pending}>
        {pending ? <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : <Save aria-hidden className="size-4" />}
        Save details
      </Button>
      <Message state={state} />
    </form>
  );
}

/**
 * Adding a counter. The new branch is created switched off with no hours, so
 * it is safe to add one before anything about it is settled: it appears in the
 * list above, closed, and stays off the storefront until somebody configures
 * it and turns it on. The price list is only asked for when there is a choice.
 */
function AddBranch({ priceLists }: { priceLists: PriceListOption[] | null }) {
  const [state, action, pending] = useActionState(createBranch, initialState);
  const choosePriceList = priceLists !== null && priceLists.length > 1;
  const [point, setPoint] = useState<LatLngPoint | null>(null);
  const [text, setText] = useState("");

  // The form's own fields reset after a successful action; the pin is state,
  // so it is reset here, during render, when a new success arrives. An effect
  // would draw the old pin for a frame first.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.status === "success") {
      setPoint(null);
      setText("");
    }
  }

  return (
    <details className="bg-nybb-charcoal group rounded-md">
      <summary className="cursor-pointer list-none p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="type-caps text-nybb-yellow">New counter</p>
            <h2 className="font-display heading-minor mt-1">Add a branch</h2>
          </div>
          <span className="text-nybb-bone/70 inline-flex items-center gap-2 text-sm">
            <span className="group-open:hidden">Open form</span>
            <span className="hidden group-open:inline">Close form</span>
            <ChevronDown
              aria-hidden
              className="text-nybb-orange size-4 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
            />
          </span>
        </div>
      </summary>
      <form action={action} className="border-nybb-bone/15 border-t p-5 sm:p-6">
        <p className="text-nybb-bone/70 max-w-2xl text-sm leading-relaxed">
          The branch is added switched off and with no opening hours. It is listed on the Branches
          page straight away, with its address and phone numbers, but customers cannot order from
          it yet. Afterwards, open it in the list above to set its hours and map location, tick
          Live on the ordering platform, then resume it in Store availability.
        </p>
        <div className="mt-5">
        <BranchDetailsFields idPrefix="new-branch" pending={pending}>
          {choosePriceList ? (
            <WorkspaceSelect
              id="new-branch-price-list"
              name="priceListId"
              label="Price list"
              options={priceLists.map((list) => ({ value: list.id, label: list.name }))}
              placeholder="Choose a price list"
              disabled={pending}
            />
          ) : (
            <input type="hidden" name="priceListId" value="" />
          )}
        </BranchDetailsFields>
        </div>
        <div className="border-nybb-bone/15 mt-6 border-t pt-6">
          <h3 className="font-display heading-panel">Map location (optional)</h3>
          <p className="text-nybb-bone/70 mt-2 max-w-2xl text-sm leading-relaxed">
            Where the pin sits in the branch map customers open on the Branches page. Search for
            the place, or click the map to drop the pin, then drag it onto the counter. Leave it
            empty to set it later from Edit branch.
          </p>
          <PinPicker
            idPrefix="new-branch-pin"
            label="Map for placing the new branch's pin"
            point={point}
            text={text}
            onPoint={setPoint}
            onText={setText}
            pending={pending}
          />
        </div>
        {priceLists === null ? (
          <p className="text-nybb-bone/70 mt-4 text-sm">
            The price lists could not be read. If the business has only one, the branch uses it.
          </p>
        ) : null}
        <Button type="submit" tone="dark" variant="secondary" className="mt-5" disabled={pending}>
          {pending ? <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : <Plus aria-hidden className="size-4" />}
          Add branch
        </Button>
        <Message state={state} />
      </form>
    </details>
  );
}

export function SettingsManager({
  branches,
  intake,
  priceLists,
  locations,
  details,
  canManageBusinessWide,
}: {
  branches: BranchAvailability[];
  intake: OrderIntakeSettings | null;
  priceLists: PriceListOption[] | null;
  locations: Record<string, BranchLocation>;
  /** Keyed by branch id. Null when the read failed. */
  details: Record<string, BranchDetails> | null;
  canManageBusinessWide: boolean;
}) {
  return (
    <>
      <div className="mt-7 space-y-5">
        {branches.map((branch) => (
          <BranchConfiguration
            key={branch.branchId}
            branch={branch}
            details={details?.[branch.branchId] ?? null}
            canDelete={canManageBusinessWide}
            location={locations[branch.slug] ?? { pin: null, catalogPin: null, source: null }}
            defaultOpen={branches.length === 1}
          />
        ))}
        {/* A manager tied to one counter cannot see a branch they do not
            work, so adding one is a business-wide job, as in the database. */}
        {canManageBusinessWide ? <AddBranch priceLists={priceLists} /> : null}
      </div>
      {canManageBusinessWide && intake ? <IntakeSettings intake={intake} /> : null}
    </>
  );
}
