import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/Button";
import { formatPeso } from "@/lib/format";
import { getAccountOrders, getCurrentCustomer, getCustomerProfile } from "@/lib/auth/session";
import { AccountProfileForm } from "./AccountProfileForm";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

const statusLabel = {
  pending: "Received",
  accepted: "Accepted",
  preparing: "Cooking",
  ready: "Ready",
  claimed: "Collected",
  rejected: "Stopped",
  cancelled: "Cancelled",
  no_show: "Not collected",
} as const;

const orderDate = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentCustomer();
  if (!user) redirect("/login?next=/account");

  const params = await searchParams;
  const [profile, orders] = await Promise.all([getCustomerProfile(), getAccountOrders()]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="font-display heading-page">Your account</h1>
          <p className="text-nybb-ink/70 mt-4 max-w-xl leading-relaxed">
            Your pickup details, saved cart, and every order placed while signed in.
          </p>
        </div>
        <form action="/auth/signout" method="post">
          <Button type="submit" tone="light" variant="ghost">
            Sign out
          </Button>
        </form>
      </div>

      {params.workspace === "denied" ? (
        <p
          role="alert"
          className="border-nybb-red-deep bg-nybb-red-deep/10 mt-6 rounded-md border px-4 py-3 text-sm"
        >
          This account does not have Workspace access. You can continue using your customer
          account here.
        </p>
      ) : null}

      <div className="mt-10 grid gap-8 lg:grid-cols-[22rem_1fr]">
        <section className="bg-nybb-charcoal text-nybb-bone rounded-md p-5 sm:p-6" aria-labelledby="pickup-details">
          <h2 id="pickup-details" className="font-display heading-minor">Pickup details</h2>
          <p className="text-nybb-bone/60 mt-3 text-sm leading-relaxed">
            These fill checkout automatically. You can still change them on any order.
          </p>
          <AccountProfileForm profile={profile ?? { displayName: "", phone: "" }} />
          <p className="border-nybb-bone/15 text-nybb-bone/50 mt-5 border-t pt-4 text-xs leading-relaxed">
            Signed in as {user.email ?? "your verified email"}.
          </p>
        </section>

        <section aria-labelledby="order-history">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="order-history" className="font-display heading-minor">Order history</h2>
              <p className="text-nybb-ink/65 mt-3 text-sm leading-relaxed">
                Open an order to see its pickup code and latest status.
              </p>
            </div>
            <ButtonLink href="/menu" tone="light" variant="secondary">Order again</ButtonLink>
          </div>

          {orders.length > 0 ? (
            <ol className="mt-6 divide-y divide-nybb-ink/15">
              {orders.map((order) => (
                <li key={order.shortCode}>
                  <Link
                    href={`/order/${encodeURIComponent(order.shortCode)}`}
                    className="hover:bg-nybb-ink/5 focus-visible:bg-nybb-ink/5 grid min-h-20 grid-cols-[1fr_auto] items-center gap-4 rounded-md px-3 py-4 transition-colors sm:grid-cols-[9rem_1fr_auto]"
                  >
                    <span className="font-mono-tabular text-sm font-semibold">{order.shortCode}</span>
                    <span className="text-nybb-ink/60 col-start-1 text-sm sm:col-start-2">
                      {orderDate.format(new Date(order.placedAt))}
                    </span>
                    <span className="row-span-2 text-right sm:row-span-1">
                      <span className="font-display block text-sm">{statusLabel[order.status]}</span>
                      <span className="font-mono-tabular text-nybb-ink/60 mt-1 block text-xs">
                        {formatPeso(order.totalCents)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <div className="border-nybb-ink/20 mt-6 rounded-md border p-6 sm:p-8">
              <p className="font-display text-xl">No signed-in orders yet</p>
              <p className="text-nybb-ink/65 mt-3 max-w-prose text-sm leading-relaxed">
                Orders placed before this account was created stay on their private tracking links.
                New ones appear here automatically.
              </p>
              <div className="mt-5">
                <ButtonLink href="/menu" tone="light">Browse the menu</ButtonLink>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
