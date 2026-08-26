"use client";

import { LoaderCircle, Plus, Save, Settings2, Trash2 } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { WorkspaceFieldLabel, WorkspaceInput } from "@/components/ui/WorkspaceField";
import { WorkspaceSelect, type WorkspaceSelectOption } from "@/components/ui/WorkspaceSelect";
import { formatPeso } from "@/lib/format";
import type {
  ManagedCategory,
  ManagedOption,
  ManagedOptionGroup,
  MenuActionState,
} from "@/lib/staff/menu-types";
import { deleteMenuEntity, saveMenuOption, saveMenuOptionGroup } from "../actions";
import { MenuStatusMessage } from "../MenuStatusMessage";

const initialState: MenuActionState = { status: "idle" };

/**
 * The three states a price can be in. Never a plain number, because a plain
 * number cannot tell "free" apart from "priced by size": both would have to
 * render as some kind of empty or zero, and they mean opposite things.
 */
type PricingMode = "free" | "flat" | "bySize";

const pricingOptions: readonly WorkspaceSelectOption<PricingMode>[] = [
  { value: "free", label: "Free" },
  { value: "flat", label: "Adds an amount" },
  { value: "bySize", label: "Priced by size" },
];

/**
 * Reads an option's saved price_cents back into the three way choice. Null
 * is "priced by size", never "free": nothing here or downstream may coalesce
 * null to 0. See the comment on ManagedOption.priceCents and on
 * menu_options.price_cents itself.
 */
function pricingModeFor(priceCents: number | null): PricingMode {
  if (priceCents === null) return "bySize";
  if (priceCents === 0) return "free";
  return "flat";
}

/** cents -> the string a pesos input should show. Empty for anything non-positive. */
function centsToPesosInput(cents: number | null): string {
  if (!cents || cents <= 0) return "";
  const pesos = cents / 100;
  return Number.isInteger(pesos) ? String(pesos) : pesos.toFixed(2);
}

/**
 * The one place pesos, what the owner types, becomes centavos, what the
 * database stores. A blank or unparsable input is 0 pesos, not an error: the
 * field is only ever rendered when pricing is "flat", so an empty flat
 * amount should save as a flat 0 rather than crash the form.
 */
function pesosToCents(pesos: string): number {
  const value = Number.parseFloat(pesos);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100);
}

function usedByLabel(linkedItemIds: string[], itemNameById: Map<string, string>): string {
  if (linkedItemIds.length === 0) return "Not used by any item yet.";
  const names = linkedItemIds.map((id) => itemNameById.get(id) ?? "an item");
  return `Used by ${names.join(", ")}.`;
}

/**
 * One existing option: an inline save form and a guarded delete form, each
 * its own useActionState, matching CategoryRow's established pattern so a
 * failure on one never clears the other.
 *
 * showHeat is a group level decision (does any option here carry a heat
 * percent, or did the person open "Advanced"), passed down so every row in a
 * group agrees on whether the heat field is worth showing.
 */
function OptionRow({
  option,
  groupId,
  showHeat,
}: {
  option: ManagedOption;
  groupId: string;
  showHeat: boolean;
}) {
  const [saveState, saveAction, savePending] = useActionState(saveMenuOption, initialState);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteMenuEntity, initialState);
  const [pricing, setPricing] = useState<PricingMode>(() => pricingModeFor(option.priceCents));
  const [amount, setAmount] = useState(() => centsToPesosInput(option.priceCents));
  const [heatPercent, setHeatPercent] = useState(option.heatPercent !== null ? String(option.heatPercent) : "");
  const [isActive, setIsActive] = useState(option.isActive);
  const pending = savePending || deletePending;

  // Whatever the amount field holds is only meaningful when pricing is
  // "flat". Free and priced-by-size both send a fixed value here instead of
  // whatever the (possibly hidden, possibly stale) amount input contains,
  // and the server transform ignores this field for both cases anyway,
  // deriving resolvedPriceCents from pricing alone. Two independent guards
  // against the same mistake.
  const priceCentsToSend = pricing === "flat" ? String(pesosToCents(amount)) : "0";

  return (
    <div className="border-nybb-bone/10 first:border-t-0 first:pt-0 border-t pt-4">
      <form action={saveAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="id" value={option.id} />
        <input type="hidden" name="groupId" value={groupId} />
        <div className="min-w-40 flex-1">
          <WorkspaceFieldLabel htmlFor={`option-name-${option.id}`}>Name</WorkspaceFieldLabel>
          <WorkspaceInput
            id={`option-name-${option.id}`}
            name="name"
            defaultValue={option.name}
            maxLength={100}
            required
            disabled={pending}
          />
        </div>
        <div className="min-w-48 flex-1">
          <WorkspaceFieldLabel htmlFor={`option-description-${option.id}`}>Description</WorkspaceFieldLabel>
          <WorkspaceInput
            id={`option-description-${option.id}`}
            name="description"
            defaultValue={option.description ?? ""}
            maxLength={300}
            disabled={pending}
          />
        </div>
        <WorkspaceSelect
          id={`option-pricing-${option.id}`}
          name="pricing"
          label="Pricing"
          options={pricingOptions}
          defaultValue={pricing}
          onValueChange={(value) => {
            if (value) setPricing(value);
          }}
          disabled={pending}
          className="min-w-44"
        />
        {pricing === "flat" ? (
          <div className="w-32">
            <WorkspaceFieldLabel htmlFor={`option-amount-${option.id}`}>Amount (PHP)</WorkspaceFieldLabel>
            <WorkspaceInput
              id={`option-amount-${option.id}`}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={pending}
            />
          </div>
        ) : null}
        <input type="hidden" name="priceCents" value={priceCentsToSend} />
        {showHeat ? (
          <div className="w-28">
            <WorkspaceFieldLabel htmlFor={`option-heat-${option.id}`}>Heat %</WorkspaceFieldLabel>
            <WorkspaceInput
              id={`option-heat-${option.id}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step="1"
              value={heatPercent}
              onChange={(event) => setHeatPercent(event.target.value)}
              disabled={pending}
            />
          </div>
        ) : (
          <input type="hidden" name="heatPercent" value={heatPercent} />
        )}
        <label className="border-nybb-bone/15 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3.5">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            disabled={pending}
          />
          <span className="text-sm">Offered</span>
        </label>
        <input type="hidden" name="isActive" value={isActive ? "true" : "false"} />
        <Button type="submit" tone="dark" variant="primary" disabled={pending} className="min-h-11">
          {savePending ? (
            <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Save aria-hidden className="size-4" />
          )}
          Save
        </Button>
      </form>
      {pricing === "flat" && amount ? (
        <p className="text-nybb-bone/55 mt-2 text-xs">Adds {formatPeso(pesosToCents(amount))}.</p>
      ) : null}
      {pricing === "bySize" ? (
        <p className="text-nybb-bone/55 mt-2 text-xs">
          Amounts are set on each item that uses this group, not here.
        </p>
      ) : null}
      {/* Option photography is Task 11's work (staff_set_menu_option_image), not this
          screen's. Nothing renders here yet; leaving this comment as the marker. */}
      <MenuStatusMessage state={saveState} />

      <form
        action={deleteAction}
        className="mt-3"
        onSubmit={(event) => {
          if (!window.confirm(`Delete "${option.name}"? This cannot be undone.`)) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="entity" value="option" />
        <input type="hidden" name="id" value={option.id} />
        <Button type="submit" tone="dark" variant="danger" disabled={pending} className="min-h-11">
          {deletePending ? (
            <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Trash2 aria-hidden className="size-4" />
          )}
          Delete option
        </Button>
      </form>
      <MenuStatusMessage state={deleteState} />
    </div>
  );
}

/** A blank row at the end of a group that adds a new option to it. */
function NewOptionRow({ groupId, showHeat }: { groupId: string; showHeat: boolean }) {
  const [state, action, pending] = useActionState(saveMenuOption, initialState);
  const [pricing, setPricing] = useState<PricingMode>("free");
  const [amount, setAmount] = useState("");
  const [heatPercent, setHeatPercent] = useState("");
  const [isActive, setIsActive] = useState(true);
  const priceCentsToSend = pricing === "flat" ? String(pesosToCents(amount)) : "0";

  return (
    <div className="border-nybb-bone/10 first:border-t-0 first:pt-0 border-t pt-4">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="groupId" value={groupId} />
        <div className="min-w-40 flex-1">
          <WorkspaceFieldLabel htmlFor={`new-option-name-${groupId}`}>New option</WorkspaceFieldLabel>
          <WorkspaceInput id={`new-option-name-${groupId}`} name="name" maxLength={100} required disabled={pending} />
        </div>
        <div className="min-w-48 flex-1">
          <WorkspaceFieldLabel htmlFor={`new-option-description-${groupId}`}>Description</WorkspaceFieldLabel>
          <WorkspaceInput id={`new-option-description-${groupId}`} name="description" maxLength={300} disabled={pending} />
        </div>
        <WorkspaceSelect
          id={`new-option-pricing-${groupId}`}
          name="pricing"
          label="Pricing"
          options={pricingOptions}
          defaultValue={pricing}
          onValueChange={(value) => {
            if (value) setPricing(value);
          }}
          disabled={pending}
          className="min-w-44"
        />
        {pricing === "flat" ? (
          <div className="w-32">
            <WorkspaceFieldLabel htmlFor={`new-option-amount-${groupId}`}>Amount (PHP)</WorkspaceFieldLabel>
            <WorkspaceInput
              id={`new-option-amount-${groupId}`}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={pending}
            />
          </div>
        ) : null}
        <input type="hidden" name="priceCents" value={priceCentsToSend} />
        {showHeat ? (
          <div className="w-28">
            <WorkspaceFieldLabel htmlFor={`new-option-heat-${groupId}`}>Heat %</WorkspaceFieldLabel>
            <WorkspaceInput
              id={`new-option-heat-${groupId}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step="1"
              value={heatPercent}
              onChange={(event) => setHeatPercent(event.target.value)}
              disabled={pending}
            />
          </div>
        ) : (
          <input type="hidden" name="heatPercent" value={heatPercent} />
        )}
        <label className="border-nybb-bone/15 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3.5">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            disabled={pending}
          />
          <span className="text-sm">Offered</span>
        </label>
        <input type="hidden" name="isActive" value={isActive ? "true" : "false"} />
        <Button type="submit" tone="dark" variant="primary" disabled={pending} className="min-h-11">
          {pending ? (
            <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Plus aria-hidden className="size-4" />
          )}
          Add option
        </Button>
      </form>
      <MenuStatusMessage state={state} />
    </div>
  );
}

/**
 * One existing option group: its own save and delete forms, the "used by"
 * line, an "Advanced" disclosure that reveals the heat field across every
 * option row in the group, then the group's options.
 */
function OptionGroupCard({
  group,
  itemNameById,
}: {
  group: ManagedOptionGroup;
  itemNameById: Map<string, string>;
}) {
  const [saveState, saveAction, savePending] = useActionState(saveMenuOptionGroup, initialState);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteMenuEntity, initialState);
  const [isActive, setIsActive] = useState(group.isActive);
  // Nine wing flavours carry no heat and a heat input on each of them is
  // noise, so it stays hidden unless this group already has one, or the
  // person deliberately asks for it.
  const [showHeat, setShowHeat] = useState(() => group.options.some((option) => option.heatPercent !== null));
  const pending = savePending || deletePending;
  const linkedCount = group.linkedItemIds.length;

  return (
    <article className="bg-nybb-charcoal rounded-md p-5">
      <form action={saveAction} className="flex flex-wrap items-end gap-4">
        <input type="hidden" name="id" value={group.id} />
        <div className="min-w-48 flex-1">
          <WorkspaceFieldLabel htmlFor={`group-name-${group.id}`}>Name</WorkspaceFieldLabel>
          <WorkspaceInput
            id={`group-name-${group.id}`}
            name="name"
            defaultValue={group.name}
            minLength={2}
            maxLength={100}
            required
            disabled={pending}
          />
        </div>
        <div className="min-w-64 flex-[2]">
          <WorkspaceFieldLabel htmlFor={`group-description-${group.id}`}>Description</WorkspaceFieldLabel>
          <WorkspaceInput
            id={`group-description-${group.id}`}
            name="description"
            defaultValue={group.description ?? ""}
            maxLength={300}
            disabled={pending}
          />
        </div>
        <label className="border-nybb-bone/15 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3.5">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            disabled={pending}
          />
          <span className="text-sm">On the menu</span>
        </label>
        <input type="hidden" name="isActive" value={isActive ? "true" : "false"} />
        <Button type="submit" tone="dark" variant="primary" disabled={pending} className="min-h-11">
          {savePending ? (
            <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Save aria-hidden className="size-4" />
          )}
          Save
        </Button>
      </form>
      <p className="text-nybb-bone/55 mt-2 text-xs">{usedByLabel(group.linkedItemIds, itemNameById)}</p>
      <MenuStatusMessage state={saveState} />

      <form
        action={deleteAction}
        className="border-nybb-bone/15 mt-4 border-t pt-4"
        onSubmit={(event) => {
          if (!window.confirm(`Delete "${group.name}"? This cannot be undone.`)) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="entity" value="optionGroup" />
        <input type="hidden" name="id" value={group.id} />
        <Button type="submit" tone="dark" variant="danger" disabled={pending} className="min-h-11">
          {deletePending ? (
            <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Trash2 aria-hidden className="size-4" />
          )}
          Delete group
        </Button>
        {linkedCount > 0 ? (
          <span className="text-nybb-bone/55 ml-3 text-xs">
            Linked to {linkedCount} item{linkedCount === 1 ? "" : "s"}. Unlink them first.
          </span>
        ) : null}
      </form>
      <MenuStatusMessage state={deleteState} />

      <div className="border-nybb-bone/15 mt-5 space-y-4 border-t pt-5">
        <div className="flex items-center justify-between gap-3">
          <p className="type-caps text-nybb-bone/55">Options</p>
          {!showHeat ? (
            <Button
              type="button"
              tone="dark"
              variant="ghost"
              onClick={() => setShowHeat(true)}
              className="min-h-11"
            >
              <Settings2 aria-hidden className="size-4" />
              Advanced: heat level
            </Button>
          ) : null}
        </div>
        {group.options.map((option) => (
          <OptionRow key={option.id} option={option} groupId={group.id} showHeat={showHeat} />
        ))}
        <NewOptionRow groupId={group.id} showHeat={showHeat} />
      </div>
    </article>
  );
}

/** A blank card at the end that adds a new option group. No delete, no options yet. */
function NewOptionGroupCard() {
  const [state, action, pending] = useActionState(saveMenuOptionGroup, initialState);
  const [isActive, setIsActive] = useState(true);

  return (
    <article className="border-nybb-bone/30 rounded-md border border-dashed p-5">
      <p className="type-caps text-nybb-bone/55">New option group</p>
      <form action={action} className="mt-3 flex flex-wrap items-end gap-4">
        <div className="min-w-48 flex-1">
          <WorkspaceFieldLabel htmlFor="new-group-name">Name</WorkspaceFieldLabel>
          <WorkspaceInput id="new-group-name" name="name" minLength={2} maxLength={100} required disabled={pending} />
        </div>
        <div className="min-w-64 flex-[2]">
          <WorkspaceFieldLabel htmlFor="new-group-description">Description</WorkspaceFieldLabel>
          <WorkspaceInput id="new-group-description" name="description" maxLength={300} disabled={pending} />
        </div>
        <label className="border-nybb-bone/15 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3.5">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            disabled={pending}
          />
          <span className="text-sm">On the menu</span>
        </label>
        <input type="hidden" name="isActive" value={isActive ? "true" : "false"} />
        <Button type="submit" tone="dark" variant="primary" disabled={pending} className="min-h-11">
          {pending ? (
            <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Plus aria-hidden className="size-4" />
          )}
          Add group
        </Button>
      </form>
      <p className="text-nybb-bone/55 mt-2 text-xs">
        Add its options once the group itself is saved.
      </p>
      <MenuStatusMessage state={state} />
    </article>
  );
}

export function OptionGroupEditor({
  optionGroups,
  categories,
}: {
  optionGroups: ManagedOptionGroup[];
  categories: ManagedCategory[];
}) {
  // So the "used by" line can name items rather than print ids: flattened
  // once per render of the whole list, not once per group.
  const itemNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of categories) {
      for (const item of category.items) {
        map.set(item.id, item.name);
      }
    }
    return map;
  }, [categories]);

  return (
    <div className="mt-7 space-y-4">
      {optionGroups.map((group) => (
        <OptionGroupCard key={group.id} group={group} itemNameById={itemNameById} />
      ))}
      <NewOptionGroupCard />
    </div>
  );
}
