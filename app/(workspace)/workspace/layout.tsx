import type { Metadata } from "next";
import { ClipboardList, ExternalLink, Handshake, History, LayoutDashboard, LogOut, ScrollText, Settings, ShieldCheck, Store, UserRound, Users } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { HeatRule } from "@/components/site/HeatRule";
import { STAFF_ROLES } from "@/lib/staff/roles";
import { hasStaffPermission, requireStaff } from "@/lib/staff/session";

export const metadata: Metadata = {
  title: { default: "Workspace", template: "%s · NYBB Workspace" },
  robots: { index: false, follow: false },
  // The counter tablet's own manifest. The root app/manifest.ts describes the
  // customer site, because a manifest is per origin and iOS delivers Web Push
  // only to a site installed to the Home Screen. Without this split, a customer
  // installing to receive alerts would land on the orders board in landscape.
  manifest: "/workspace.webmanifest",
};

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireStaff();
  const roleLabel =
    profile.role === "admin"
      ? "Super Admin"
      : profile.staffRole
        ? STAFF_ROLES[profile.staffRole].label
        : "Staff";

  return (
    <div className="workspace-shell bg-nybb-ink text-nybb-bone min-h-dvh">
      <a
        href="#workspace-main"
        className="focus:bg-nybb-orange focus:text-nybb-ink sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[60] focus:rounded focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
      >
        Skip to workspace
      </a>
      <header className="workspace-header bg-nybb-charcoal sticky top-0 z-40">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="bg-nybb-orange text-nybb-ink grid size-10 shrink-0 place-items-center rounded-md">
              <ShieldCheck aria-hidden className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-lg leading-none tracking-[0.06em]">NYBB WORKSPACE</p>
              <p className="text-nybb-bone/55 mt-1 truncate text-xs">
                {profile.displayName} · {roleLabel}
              </p>
            </div>
          </div>
          <form action="/auth/signout?scope=staff" method="post">
            <Button type="submit" tone="dark" variant="ghost" size="icon" className="size-11" aria-label="Sign out of staff workspace">
              <LogOut aria-hidden className="size-4" />
            </Button>
          </form>
        </div>
        <nav aria-label="Workspace" className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-4 pb-2 sm:px-6 lg:px-8">
          {hasStaffPermission(profile, "dashboard:view") ? (
            <ButtonLink href="/workspace" tone="dark" variant="ghost" className="px-3">
              <LayoutDashboard aria-hidden className="size-4" />
              Dashboard
            </ButtonLink>
          ) : null}
          {hasStaffPermission(profile, "orders:view") ? (
            <>
              <ButtonLink href="/workspace/orders" tone="dark" variant="ghost" className="px-3">
                <ClipboardList aria-hidden className="size-4" />
                Orders
              </ButtonLink>
              <ButtonLink href="/workspace/orders/history" tone="dark" variant="ghost" className="px-3">
                <History aria-hidden className="size-4" />
                History
              </ButtonLink>
            </>
          ) : null}
          {hasStaffPermission(profile, "store:availability") ? (
            <ButtonLink href="/workspace/availability" tone="dark" variant="ghost" className="px-3">
              <Store aria-hidden className="size-4" />
              Availability
            </ButtonLink>
          ) : null}
          {hasStaffPermission(profile, "settings:manage") ? (
            <ButtonLink href="/workspace/settings" tone="dark" variant="ghost" className="px-3">
              <Settings aria-hidden className="size-4" />
              Settings
            </ButtonLink>
          ) : null}
          {hasStaffPermission(profile, "audit:view") ? (
            <ButtonLink href="/workspace/audit" tone="dark" variant="ghost" className="px-3">
              <ScrollText aria-hidden className="size-4" />
              Audit
            </ButtonLink>
          ) : null}
          {profile.role === "admin" ? (
            <>
              <ButtonLink href="/workspace/team" tone="dark" variant="ghost" className="px-3">
                <Users aria-hidden className="size-4" />
                Team
              </ButtonLink>
              {/* Admin rather than a permission, because RLS on
                  franchise_inquiries is is_admin(). A staff member offered this
                  link would open a page that tells them there are no leads. */}
              <ButtonLink href="/workspace/franchise" tone="dark" variant="ghost" className="px-3">
                <Handshake aria-hidden className="size-4" />
                Leads
              </ButtonLink>
            </>
          ) : null}
          <ButtonLink href="/workspace/profile" tone="dark" variant="ghost" className="px-3">
            <UserRound aria-hidden className="size-4" />
            Profile
          </ButtonLink>
          <ButtonLink href="/" tone="dark" variant="ghost" className="ml-auto px-3" target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden className="size-4" />
            Storefront
          </ButtonLink>
        </nav>
        <HeatRule className="h-1" />
      </header>
      <main id="workspace-main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {children}
      </main>
    </div>
  );
}
