"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { WorkspaceCheckbox, WorkspaceRadio } from "@/components/ui/WorkspaceCheckbox";
import { WorkspaceFieldLabel, WorkspaceInput } from "@/components/ui/WorkspaceField";
import { WorkspaceNumberInput } from "@/components/ui/WorkspaceNumberInput";
import { WorkspaceSection } from "@/components/ui/WorkspaceSection";
import { WorkspaceToggle } from "@/components/ui/WorkspaceToggle";
import type { ScopeChoices, VoucherDetail } from "@/lib/staff/vouchers";
import type { VoucherActionState } from "@/lib/vouchers/schema";
import { voucherSummary } from "@/lib/vouchers/status";
import { saveVoucher, setVoucherActive } from "./actions";

/**
 * The promo code form.
 *
 * Five sections, one per question the owner is actually asking: what it is,
 * what it takes off, when it runs, where it applies, and how often it can be
 * used. The rail carries every explanation, per The Prose Leaves The Control
 * Flow Rule, and the Save sits at the foot of the last section rather than on a
 * plate of its own, per The Commit Is The Foot Of The Form.
 *
 * THE SENTENCE AT THE TOP IS THE POINT OF THIS SCREEN.
 *
 * Scope is the part an admin gets wrong, and six controls spread down a form do
 * not tell anybody what they add up to. "10% off Chicken Wings, at Mango
 * Avenue, once that reaches PHP 500.00" can be checked against what the
 * promotion was supposed to be in about a second, and it moves as the controls
 * move. voucherSummary is pure and unit tested, so the sentence cannot quietly
 * stop matching the fields.
 *
 * NOTHING HERE DECIDES ANYTHING. The peso arithmetic, the null handling and
 * every refusal live in lib/vouchers/schema.ts and migration 0066. This holds
 * form state and draws it.
 */

const INITIAL: VoucherActionState = { ok: false };

/** A datetime-local value, from a stored instant, on the counter's clock. */
function toLocalInput(iso: string | null): string {
  if (iso === null) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Centavos to the string a pesos input should show. Empty for "not set". */
function toPesosInput(cents: number | null): string {
  if (cents === null) return "";
  const pesos = cents / 100;
  return Number.isInteger(pesos) ? String(pesos) : pesos.toFixed(2);
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="border-nybb-red text-nybb-bone mt-2 border-l-2 pl-3 text-xs leading-relaxed">
      {message}
    </p>
  );
}

/**
 * A tick list of things a voucher can be limited to.
 *
 * Empty means everywhere, and the label says so rather than leaving somebody to
 * infer it from an empty box. That reading is the whole scope model: the common
 * promo code is the one that ticks nothing.
 */
function ScopeList({
  legend,
  name,
  choices,
  selected,
  onToggle,
  emptyMeans,
}: {
  legend: string;
  name: string;
  choices: readonly { id: string; name: string }[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  emptyMeans: string;
}) {
  return (
    <fieldset>
      <legend className="type-caps text-nybb-bone/65">{legend}</legend>
      <p className="text-nybb-bone/55 mt-1 text-xs leading-relaxed">
        {selected.size === 0 ? emptyMeans : `Limited to ${selected.size}.`}
      </p>
      {choices.length === 0 ? (
        <p className="text-nybb-bone/55 mt-2 text-xs">Nothing to choose from yet.</p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {choices.map((choice) => (
            <label
              key={choice.id}
              className="text-nybb-bone flex cursor-pointer items-center gap-2.5 text-sm"
            >
              <WorkspaceCheckbox
                name={name}
                value={choice.id}
                checked={selected.has(choice.id)}
                onChange={() => onToggle(choice.id)}
              />
              <span className="min-w-0 break-words">{choice.name}</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

/**
 * What a used code offers instead of an edit.
 *
 * Migration 0067 freezes the terms once any order has named the code, so the
 * form below is drawn read-only and this says why. It carries the one control
 * that still works, because switching a code off is not a change to its terms:
 * it stops the code being accepted from now on and says nothing about what it
 * was worth to anybody who already used it. That control has to stay reachable,
 * since it is the only way to stop a live code that is losing money.
 *
 * It posts to setVoucherActive rather than to the form's own Save, which is the
 * whole reason admin_set_voucher_active is a separate function from the upsert.
 */
function LockedNotice({ voucher }: { voucher: VoucherDetail }) {
  const [state, action, pending] = useActionState(setVoucherActive, INITIAL);

  return (
    <section className="border-nybb-orange/60 bg-nybb-orange/10 mt-7 rounded-md border p-4 sm:p-5">
      <h2 className="font-display heading-panel text-nybb-bone uppercase">Its terms are fixed</h2>
      <p className="text-nybb-bone/70 mt-2 max-w-2xl text-sm leading-relaxed">
        This code has been used on an order, so what it takes off, where it
        applies and how long it runs can no longer be changed. Those orders were
        placed under the terms below, and rewriting them now would leave every
        receipt saying one thing and this screen another. To run something
        different, make a new code.
      </p>
      <form action={action} className="mt-4 flex flex-wrap items-center gap-3">
        <input type="hidden" name="id" value={voucher.id} />
        <input type="hidden" name="isActive" value={voucher.isActive ? "false" : "true"} />
        <Button type="submit" tone="dark" disabled={pending}>
          {pending
            ? voucher.isActive
              ? "Stopping"
              : "Starting"
            : voucher.isActive
              ? "Stop accepting this code"
              : "Start accepting it again"}
        </Button>
        <p className="text-nybb-bone/55 text-sm leading-relaxed">
          {voucher.isActive
            ? "It is being accepted at checkout. Switching it off leaves the orders that used it alone."
            : "It is switched off, so checkout refuses it."}
        </p>
        {state.error ? (
          <p role="alert" className="border-nybb-red text-nybb-bone border-l-2 pl-3 text-sm">
            {state.error}
          </p>
        ) : null}
      </form>
    </section>
  );
}

export function VoucherEditor({
  voucher,
  choices,
}: {
  /** Null when this is a new code. */
  voucher: VoucherDetail | null;
  choices: ScopeChoices;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveVoucher, INITIAL);

  // Read straight off the record rather than passed in beside it, so the
  // screen and migration 0067 cannot come to disagree about which codes are
  // editable. A new code is never frozen.
  const frozen = voucher?.locked === true;

  const [discountKind, setDiscountKind] = useState<"fixed" | "percent">(
    voucher?.percentOff !== null && voucher !== null ? "percent" : "fixed",
  );
  const [amountPesos, setAmountPesos] = useState(toPesosInput(voucher?.amountCents ?? null));
  const [percentOff, setPercentOff] = useState(
    voucher?.percentOff === null || voucher === undefined ? "" : String(voucher?.percentOff ?? ""),
  );
  const [maxDiscountPesos, setMaxDiscountPesos] = useState(
    toPesosInput(voucher?.maxDiscountCents ?? null),
  );
  const [minOrderPesos, setMinOrderPesos] = useState(
    voucher && voucher.minOrderCents > 0 ? toPesosInput(voucher.minOrderCents) : "",
  );
  const [maxUses, setMaxUses] = useState(
    voucher && voucher.maxUses !== null ? String(voucher.maxUses) : "",
  );
  const [maxUsesPerCustomer, setMaxUsesPerCustomer] = useState(
    String(voucher?.maxUsesPerCustomer ?? 1),
  );
  const [isActive, setIsActive] = useState(voucher?.isActive ?? true);

  const [branchIds, setBranchIds] = useState<Set<string>>(
    new Set(voucher?.scope.branchIds ?? []),
  );
  const [itemIds, setItemIds] = useState<Set<string>>(new Set(voucher?.scope.itemIds ?? []));
  const [categoryIds, setCategoryIds] = useState<Set<string>>(
    new Set(voucher?.scope.categoryIds ?? []),
  );
  const [customerPhones, setCustomerPhones] = useState(
    (voucher?.scope.customerPhones ?? []).join("\n"),
  );

  // A create returns the new id, and the editor for it lives at another URL.
  // Pushing rather than replacing, so Back still goes to the list.
  useEffect(() => {
    if (state.ok && state.savedId && voucher === null) {
      router.push(`/workspace/vouchers/${state.savedId}`);
    }
  }, [state.ok, state.savedId, voucher, router]);

  function toggle(set: Set<string>, apply: (next: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    apply(next);
  }

  const summary = voucherSummary({
    amountCents:
      discountKind === "fixed" && amountPesos.trim() !== ""
        ? Math.round(Number(amountPesos) * 100)
        : null,
    percentOff:
      discountKind === "percent" && percentOff.trim() !== "" ? Number(percentOff) : null,
    maxDiscountCents:
      discountKind === "percent" && maxDiscountPesos.trim() !== ""
        ? Math.round(Number(maxDiscountPesos) * 100)
        : null,
    minOrderCents: minOrderPesos.trim() === "" ? 0 : Math.round(Number(minOrderPesos) * 100),
    branchNames: choices.branches.filter((b) => branchIds.has(b.id)).map((b) => b.name),
    itemNames: choices.items.filter((i) => itemIds.has(i.id)).map((i) => i.name),
    categoryNames: choices.categories.filter((c) => categoryIds.has(c.id)).map((c) => c.name),
    customerCount: customerPhones.split(/[\n,;]+/).filter((v) => v.trim() !== "").length,
  });

  const fieldErrors = state.fieldErrors ?? {};

  return (
    <>
      {frozen && voucher ? <LockedNotice voucher={voucher} /> : null}
      <form action={formAction} className="mt-7">
        {/* One attribute freezes the whole form. A disabled fieldset
            disables every control inside it, so no field has to know the
            rule, and the workspace CSS already draws the disabled state for
            inputs, checkboxes, radios and the toggle. The controls that
            still work when frozen are in LockedNotice, outside this. */}
        <fieldset disabled={frozen} className="space-y-4">
          {voucher ? <input type="hidden" name="id" value={voucher.id} /> : null}
          <input type="hidden" name="isActive" value={isActive ? "true" : "false"} />
          <input type="hidden" name="discountKind" value={discountKind} />

          {/* The sentence, above everything, because it is the thing being checked
              and the controls are only how it is changed. */}
          <p className="bg-nybb-charcoal text-nybb-bone rounded-md px-4 py-3 text-sm leading-relaxed sm:px-5">
            {summary}
          </p>

          <WorkspaceSection
            title="The code"
            description={
              <>
                <p>What the customer types at checkout. It is matched without regard to case, so LAUNCH50 and launch50 are the same code.</p>
                <p>The description is shown to the customer once the code is accepted. The note is only ever seen here.</p>
              </>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <WorkspaceFieldLabel htmlFor="voucher-code">Code</WorkspaceFieldLabel>
                <WorkspaceInput
                  id="voucher-code"
                  name="code"
                  defaultValue={voucher?.code ?? ""}
                  maxLength={40}
                  required
                  autoCapitalize="characters"
                  spellCheck={false}
                  className="uppercase"
                  placeholder="LAUNCH50"
                  aria-describedby={fieldErrors.code ? "voucher-code-error" : undefined}
                />
                <div id="voucher-code-error">
                  <FieldError message={fieldErrors.code} />
                </div>
              </div>
              <div>
                <WorkspaceFieldLabel htmlFor="voucher-description">
                  Description, shown to the customer
                </WorkspaceFieldLabel>
                <WorkspaceInput
                  id="voucher-description"
                  name="description"
                  defaultValue={voucher?.description ?? ""}
                  maxLength={200}
                  placeholder="Fifty off launch week"
                />
              </div>
            </div>
            <div className="mt-4">
              <WorkspaceFieldLabel htmlFor="voucher-note">Note, for the workspace only</WorkspaceFieldLabel>
              <WorkspaceInput
                id="voucher-note"
                name="note"
                defaultValue={voucher?.note ?? ""}
                maxLength={300}
                placeholder="Printed on the launch flyers"
              />
            </div>
          </WorkspaceSection>

          <WorkspaceSection
            title="What comes off"
            description={
              <>
                <p>A fixed amount, or a percentage of the qualifying items.</p>
                <p>
                  A ceiling is only offered on a percentage, because a ceiling on a
                  fixed amount is the fixed amount. Leave it blank for no ceiling.
                </p>
              </>
            }
          >
            <fieldset>
              <legend className="type-caps text-nybb-bone/65">Kind</legend>
              <div className="mt-3 flex flex-wrap gap-4">
                {(
                  [
                    ["fixed", "A fixed amount"],
                    ["percent", "A percentage"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="text-nybb-bone flex cursor-pointer items-center gap-2.5 text-sm">
                    <WorkspaceRadio
                      name="discountKindChoice"
                      value={value}
                      checked={discountKind === value}
                      onChange={() => setDiscountKind(value)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {discountKind === "fixed" ? (
                <div>
                  <WorkspaceFieldLabel htmlFor="voucher-amount">Amount off, in pesos</WorkspaceFieldLabel>
                  <WorkspaceNumberInput
                    id="voucher-amount"
                    name="amountPesos"
                    shape="pesos"
                    value={amountPesos}
                    onValueChange={setAmountPesos}
                    placeholder="50"
                  />
                  <FieldError message={fieldErrors.amountPesos} />
                </div>
              ) : (
                <>
                  <div>
                    <WorkspaceFieldLabel htmlFor="voucher-percent">Percentage off</WorkspaceFieldLabel>
                    <WorkspaceNumberInput
                      id="voucher-percent"
                      name="percentOff"
                      shape="integer"
                      value={percentOff}
                      onValueChange={setPercentOff}
                      placeholder="10"
                    />
                    <FieldError message={fieldErrors.percentOff} />
                  </div>
                  <div>
                    <WorkspaceFieldLabel htmlFor="voucher-max-discount">
                      Most it can take off, in pesos
                    </WorkspaceFieldLabel>
                    <WorkspaceNumberInput
                      id="voucher-max-discount"
                      name="maxDiscountPesos"
                      shape="pesos"
                      value={maxDiscountPesos}
                      onValueChange={setMaxDiscountPesos}
                      placeholder="No ceiling"
                    />
                  </div>
                </>
              )}
            </div>
          </WorkspaceSection>

          <WorkspaceSection
            title="When it runs"
            description={
              <>
                <p>Both are on the counter&rsquo;s own clock, in Cebu.</p>
                <p>
                  Leave the start blank and it works from the moment it is saved.
                  Leave the end blank and it never expires, which is worth thinking
                  twice about on a code that goes on a flyer.
                </p>
              </>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <WorkspaceFieldLabel htmlFor="voucher-starts">Starts</WorkspaceFieldLabel>
                <WorkspaceInput
                  id="voucher-starts"
                  name="startsAt"
                  type="datetime-local"
                  defaultValue={toLocalInput(voucher?.startsAt ?? null)}
                />
                <FieldError message={fieldErrors.startsAt} />
              </div>
              <div>
                <WorkspaceFieldLabel htmlFor="voucher-expires">Expires</WorkspaceFieldLabel>
                <WorkspaceInput
                  id="voucher-expires"
                  name="expiresAt"
                  type="datetime-local"
                  defaultValue={toLocalInput(voucher?.expiresAt ?? null)}
                />
                <FieldError message={fieldErrors.expiresAt} />
              </div>
            </div>
          </WorkspaceSection>

          <WorkspaceSection
            title="Where it applies"
            description={
              <>
                <p>
                  Every list here is a limit, and ticking nothing is the ordinary
                  case: an untouched section means the code works everywhere, on
                  everything, for anybody.
                </p>
                <p>
                  Items and categories narrow each other rather than adding up. A
                  code naming an item outside its named categories covers nothing.
                </p>
              </>
            }
            bodyClassName="space-y-6"
          >
            <ScopeList
              legend="Branches"
              name="branchIds"
              choices={choices.branches}
              selected={branchIds}
              onToggle={(id) => toggle(branchIds, setBranchIds, id)}
              emptyMeans="Works at every counter."
            />
            <ScopeList
              legend="Categories"
              name="categoryIds"
              choices={choices.categories}
              selected={categoryIds}
              onToggle={(id) => toggle(categoryIds, setCategoryIds, id)}
              emptyMeans="Covers every category."
            />
            <ScopeList
              legend="Items"
              name="itemIds"
              choices={choices.items}
              selected={itemIds}
              onToggle={(id) => toggle(itemIds, setItemIds, id)}
              emptyMeans="Covers every item."
            />
            <div>
              <WorkspaceFieldLabel htmlFor="voucher-customers">Customers</WorkspaceFieldLabel>
              <p className="text-nybb-bone/55 mt-1 text-xs leading-relaxed">
                Phone numbers, one per line. Leave it blank and anybody can use the
                code. Numbers are matched on their digits, so spaces and +63 make no
                difference.
              </p>
              <textarea
                id="voucher-customers"
                name="customerPhones"
                value={customerPhones}
                onChange={(event) => setCustomerPhones(event.target.value)}
                rows={3}
                className="mt-2 w-full px-3.5 py-2.5 text-base sm:text-sm"
                placeholder="0917 000 1234"
              />
            </div>
          </WorkspaceSection>

          <WorkspaceSection
            title="How often"
            description={
              <>
                <p>
                  A blank total means unlimited. A blank minimum means there is no
                  minimum. Neither of them means zero.
                </p>
                <p>
                  The minimum is measured against the items the code actually
                  covers, not the whole basket, so a code for wings needs that much
                  in wings.
                </p>
              </>
            }
            aside={
              voucher ? (
                <>
                  Used {voucher.usesCount}{" "}
                  {voucher.usesCount === 1 ? "time" : "times"} so far.
                </>
              ) : null
            }
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <WorkspaceFieldLabel htmlFor="voucher-max-uses">Total uses</WorkspaceFieldLabel>
                <WorkspaceNumberInput
                  id="voucher-max-uses"
                  name="maxUses"
                  shape="integer"
                  value={maxUses}
                  onValueChange={setMaxUses}
                  placeholder="Unlimited"
                />
                <FieldError message={fieldErrors.maxUses} />
              </div>
              <div>
                <WorkspaceFieldLabel htmlFor="voucher-per-customer">Uses per customer</WorkspaceFieldLabel>
                <WorkspaceNumberInput
                  id="voucher-per-customer"
                  name="maxUsesPerCustomer"
                  shape="integer"
                  value={maxUsesPerCustomer}
                  onValueChange={setMaxUsesPerCustomer}
                  required
                />
                <FieldError message={fieldErrors.maxUsesPerCustomer} />
              </div>
              <div>
                <WorkspaceFieldLabel htmlFor="voucher-min-order">
                  Minimum qualifying order, in pesos
                </WorkspaceFieldLabel>
                <WorkspaceNumberInput
                  id="voucher-min-order"
                  name="minOrderPesos"
                  shape="pesos"
                  value={minOrderPesos}
                  onValueChange={setMinOrderPesos}
                  placeholder="No minimum"
                />
              </div>
            </div>

            {/* The switch, and then the commit, inside this last section's own
                plate. The Commit Is The Foot Of The Form, Not A Card After It. */}
            {frozen ? null : (
            <div className="border-nybb-bone/15 mt-6 border-t pt-5">
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <span>
                  <span className="type-caps text-nybb-bone/65 block">Switched on</span>
                  <span className="text-nybb-bone/55 mt-1 block text-xs leading-relaxed">
                    Off means the code is refused at checkout, whatever else it says.
                    It is the reversible way to stop a code.
                  </span>
                </span>
                <WorkspaceToggle
                  on={isActive}
                  onClick={() => setIsActive((value) => !value)}
                  aria-label="Switched on"
                />
              </label>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button type="submit" tone="dark" disabled={pending}>
                  {pending ? "Saving" : voucher ? "Save changes" : "Create code"}
                </Button>
                <ButtonLink href="/workspace/vouchers" tone="dark" variant="ghost">
                  Cancel
                </ButtonLink>
                {/* Whatever blocks or refused the button is stated beside it, at
                    the weight of body copy rather than as the quietest text here. */}
                {state.error ? (
                  <p role="alert" className="border-nybb-red text-nybb-bone border-l-2 pl-3 text-sm leading-relaxed">
                    {state.error}
                  </p>
                ) : state.ok && voucher ? (
                  <p role="status" className="text-nybb-bone/65 text-sm">
                    Saved.
                  </p>
                ) : null}
              </div>
            </div>
            )}
          </WorkspaceSection>
        </fieldset>
      </form>
    </>
  );
}
