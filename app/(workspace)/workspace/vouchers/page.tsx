import type { Metadata } from "next";
import { Button, ButtonLink } from "@/components/ui/Button";
import { WorkspaceFieldLabel, WorkspaceInput } from "@/components/ui/WorkspaceField";
import { WorkspaceSelect } from "@/components/ui/WorkspaceSelect";
import { formatPeso } from "@/lib/format";
import { requireStaffPermission } from "@/lib/staff/session";
import { getVouchersEnabled, listVouchers, type VoucherListRow } from "@/lib/staff/vouchers";
import { EngineSwitch } from "./EngineSwitch";
import {
  usageLabel,
  VOUCHER_STATUS_LABELS,
  type VoucherStatus,
} from "@/lib/vouchers/status";

export const metadata: Metadata = { title: "Promo codes" };

/**
 * Every promo code, gated on vouchers:manage.
 *
 * Modelled on /workspace/audit and /workspace/analytics, which are the closest
 * screens in shape: permission gated, filters in a plain GET form so a view is
 * a URL somebody can send to the owner, and nothing here is a client component
 * except the two controls that have to be.
 *
 * WHY THE STATUS COLUMN IS A DERIVED WORD RATHER THAN is_active.
 *
 * A voucher can be switched on and still refuse every customer, because it
 * expired, because it has not opened yet, or because it has been fully claimed.
 * Printing the boolean would put "Live" beside a code nobody can use, which is
 * exactly the question this screen exists to answer at a glance.
 * lib/vouchers/status.ts decides the word and documents the precedence.
 */

const STATUS_FILTERS = [
  { value: "all", label: "Any status" },
  { value: "active", label: "Live" },
  { value: "scheduled", label: "Scheduled" },
  { value: "expired", label: "Expired" },
  { value: "exhausted", label: "Used up" },
  { value: "disabled", label: "Off" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

function isStatusFilter(value: string): value is StatusFilter {
  return STATUS_FILTERS.some((option) => option.value === value);
}

/** The discount, as the column shows it. */
function discountLabel(voucher: VoucherListRow): string {
  // Null on both would be a row the database cannot hold
  // (vouchers_one_discount_kind), so the fallback is defensive rather than a
  // state anybody will see.
  if (voucher.percentOff !== null) {
    return voucher.maxDiscountCents !== null
      ? `${voucher.percentOff}% up to ${formatPeso(voucher.maxDiscountCents)}`
      : `${voucher.percentOff}%`;
  }
  return voucher.amountCents !== null ? formatPeso(voucher.amountCents) : "Not set";
}

/**
 * Where a code works, in the width a column has.
 *
 * Counts rather than names, because two branch names do not fit and "2
 * branches" answers the question somebody is scanning for, which is whether
 * this code is restricted at all. The editor names them.
 */
function scopeLabel(voucher: VoucherListRow): string {
  const parts: string[] = [];
  if (voucher.branchCount > 0) {
    parts.push(voucher.branchCount === 1 ? "1 branch" : `${voucher.branchCount} branches`);
  }
  if (voucher.itemCount > 0) {
    parts.push(voucher.itemCount === 1 ? "1 item" : `${voucher.itemCount} items`);
  }
  if (voucher.categoryCount > 0) {
    parts.push(
      voucher.categoryCount === 1 ? "1 category" : `${voucher.categoryCount} categories`,
    );
  }
  if (voucher.customerCount > 0) {
    parts.push(
      voucher.customerCount === 1 ? "1 customer" : `${voucher.customerCount} customers`,
    );
  }
  if (voucher.minOrderCents > 0) parts.push(`min ${formatPeso(voucher.minOrderCents)}`);
  return parts.length === 0 ? "Anywhere" : parts.join(", ");
}

/** A Manila date, or a dash when the column genuinely has no date to show. */
function shortDate(iso: string | null): string {
  if (iso === null) return "Never";
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(iso));
}

/**
 * The status chip.
 *
 * One tone per status, and only "Live" gets a fill, because a list where every
 * row carries a coloured plate is a list with no signal in it. The rest are
 * quiet text on the row's own ground, which is The One Loud Thing Rule applied
 * down a column rather than across a card.
 */
function StatusChip({ status }: { status: VoucherStatus }) {
  const tone =
    status === "active"
      ? "bg-nybb-orange text-nybb-ink"
      : status === "scheduled"
        ? "text-nybb-yellow border-nybb-yellow/40 border"
        : status === "disabled"
          ? "text-nybb-bone/55 border-nybb-bone/25 border"
          : "text-nybb-bone/70 border-nybb-bone/25 border";

  return (
    <span
      className={`type-caps inline-block rounded px-2 py-1 ${tone}`}
    >
      {VOUCHER_STATUS_LABELS[status]}
    </span>
  );
}

export default async function WorkspaceVouchersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireStaffPermission("vouchers:manage");

  const params = await searchParams;
  const rawQuery = typeof params.q === "string" ? params.q : "";
  const rawStatus = typeof params.status === "string" ? params.status : "all";
  const query = rawQuery.trim().slice(0, 80);
  const status: StatusFilter = isStatusFilter(rawStatus) ? rawStatus : "all";

  const [all, enginesOn] = await Promise.all([listVouchers(), getVouchersEnabled()]);

  // Filtered here rather than in SQL. The whole table is a few dozen rows for
  // the foreseeable life of this business, and the status is derived in
  // TypeScript from four columns, so a WHERE clause would have to reimplement
  // voucherStatus in SQL and then agree with it forever.
  const needle = query.toLowerCase();
  const vouchers = all.filter((voucher) => {
    if (status !== "all" && voucher.status !== status) return false;
    if (needle === "") return true;
    return (
      voucher.code.toLowerCase().includes(needle) ||
      (voucher.description ?? "").toLowerCase().includes(needle) ||
      (voucher.note ?? "").toLowerCase().includes(needle)
    );
  });

  const filtered = query !== "" || status !== "all";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="type-caps text-nybb-yellow">Promotions</p>
          <h1 className="font-display heading-major mt-2">Promo codes</h1>
          <p className="text-nybb-bone/55 mt-2 max-w-2xl text-sm leading-relaxed">
            Codes a customer can type at checkout. One code per order, and the
            discount is worked out on our side from the code alone, never from
            anything the customer&rsquo;s browser sends.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/workspace" tone="dark" variant="secondary">
            Back to dashboard
          </ButtonLink>
          <ButtonLink href="/workspace/vouchers/new" tone="dark">
            New code
          </ButtonLink>
        </div>
      </div>

      <EngineSwitch enabled={enginesOn} />

      <form role="search" className="bg-nybb-charcoal mt-4 grid gap-4 rounded-md p-4 md:grid-cols-3">
        <div>
          <WorkspaceFieldLabel htmlFor="voucher-query">Search</WorkspaceFieldLabel>
          <WorkspaceInput
            id="voucher-query"
            name="q"
            defaultValue={query}
            maxLength={80}
            placeholder="Code, description or note"
          />
        </div>
        <WorkspaceSelect
          id="voucher-status"
          name="status"
          label="Status"
          options={STATUS_FILTERS}
          defaultValue={status}
        />
        <div className="flex items-end gap-2">
          <Button type="submit" tone="dark" className="flex-1">
            Filter
          </Button>
          <ButtonLink href="/workspace/vouchers" tone="dark" variant="ghost">
            Reset
          </ButtonLink>
        </div>
      </form>

      {vouchers.length === 0 ? (
        <p className="text-nybb-bone/55 mt-7 text-sm leading-relaxed">
          {filtered
            ? "No promo code matches that. Try a different search, or reset the filters."
            : "No promo codes yet. The New code button above starts one."}
        </p>
      ) : (
        // Two layouts, one DOM, per DESIGN.md's workspace table: the cells stack
        // into a readable block below lg and become grid items in header order
        // from lg up. Seven columns inside 390px is a horizontal scrollbar, not
        // a table.
        <div className="mt-7">
          <div className="border-nybb-bone/15 hidden border-b pb-3 lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_auto] lg:gap-4">
            {["Code", "Discount", "Where it applies", "Expires", "Used", "Status"].map((head) => (
              <span key={head} className="type-caps text-nybb-bone/55">
                {head}
              </span>
            ))}
          </div>

          <ul>
            {vouchers.map((voucher) => (
              <li
                key={voucher.id}
                className="border-nybb-bone/15 border-b py-4 lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_auto] lg:items-baseline lg:gap-4"
              >
                <div className="min-w-0">
                  {/* The whole row's target is the code, because editing is the
                      only thing anybody comes to this list to do. */}
                  <a
                    href={`/workspace/vouchers/${voucher.id}`}
                    className="font-display text-nybb-bone hover:text-nybb-orange focus-visible:text-nybb-orange break-words underline-offset-4 hover:underline focus-visible:underline"
                  >
                    {voucher.code}
                  </a>
                  {voucher.description ? (
                    <p className="text-nybb-bone/55 mt-1 text-xs leading-relaxed">
                      {voucher.description}
                    </p>
                  ) : null}
                </div>

                <div className="mt-2 lg:mt-0">
                  <span className="type-caps text-nybb-bone/55 lg:sr-only">Discount</span>
                  <p className="font-mono-tabular text-nybb-bone text-sm">
                    {discountLabel(voucher)}
                  </p>
                </div>

                <div className="mt-2 min-w-0 lg:mt-0">
                  <span className="type-caps text-nybb-bone/55 lg:sr-only">Where it applies</span>
                  <p className="text-nybb-bone/70 text-sm leading-relaxed">
                    {scopeLabel(voucher)}
                  </p>
                </div>

                <div className="mt-2 lg:mt-0">
                  <span className="type-caps text-nybb-bone/55 lg:sr-only">Expires</span>
                  <p className="text-nybb-bone/70 text-sm">{shortDate(voucher.expiresAt)}</p>
                </div>

                <div className="mt-2 lg:mt-0">
                  <span className="type-caps text-nybb-bone/55 lg:sr-only">Used</span>
                  <p className="font-mono-tabular text-nybb-bone/70 text-sm">
                    {usageLabel(voucher.usesCount, voucher.maxUses)}
                  </p>
                </div>

                <div className="mt-3 lg:mt-0">
                  <StatusChip status={voucher.status} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
