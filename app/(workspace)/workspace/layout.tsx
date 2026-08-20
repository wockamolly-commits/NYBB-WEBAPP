import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { HeatRule } from "@/components/site/HeatRule";
import { WorkspaceNav, type WorkspaceNavItem } from "@/components/workspace/WorkspaceNav";
import { WorkspaceSignOut } from "@/components/workspace/WorkspaceSignOut";
import { STAFF_ROLES } from "@/lib/staff/roles";
import { hasStaffPermission, requireStaff } from "@/lib/staff/session";
import type { StaffProfile } from "@/lib/staff/session";

export const metadata: Metadata = {
  title: { default: "Workspace", template: "%s · NYBB Workspace" },
  robots: { index: false, follow: false },
  // The counter tablet's own manifest. The root app/manifest.ts describes the
  // customer site, because a manifest is per origin and iOS delivers Web Push
  // only to a site installed to the Home Screen. Without this split, a customer
  // installing to receive alerts would land on the orders board in landscape.
  manifest: "/workspace.webmanifest",
};

/**
 * The bar this person is allowed to see.
 *
 * Kept on the server, where the permission answer is authoritative, and handed
 * to the client component as a plain list. The client decides which item is
 * current; it never decides which items exist.
 */
function navItems(profile: StaffProfile): WorkspaceNavItem[] {
  const items: WorkspaceNavItem[] = [];

  if (hasStaffPermission(profile, "dashboard:view")) {
    items.push({ href: "/workspace", label: "Dashboard", icon: "dashboard" });
  }
  if (hasStaffPermission(profile, "orders:view")) {
    items.push({ href: "/workspace/orders", label: "Orders", icon: "orders" });
    items.push({ href: "/workspace/orders/history", label: "History", icon: "history" });
  }
  if (hasStaffPermission(profile, "store:availability")) {
    items.push({ href: "/workspace/availability", label: "Availability", icon: "availability" });
  }
  if (hasStaffPermission(profile, "settings:manage")) {
    items.push({ href: "/workspace/settings", label: "Settings", icon: "settings" });
  }
  if (hasStaffPermission(profile, "audit:view")) {
    items.push({ href: "/workspace/audit", label: "Audit", icon: "audit" });
  }
  if (profile.role === "admin") {
    items.push({ href: "/workspace/team", label: "Team", icon: "team" });
    // Admin rather than a permission, because RLS on franchise_inquiries is
    // is_admin(). A staff member offered this link would open a page that
    // tells them there are no leads.
    items.push({ href: "/workspace/franchise", label: "Leads", icon: "leads" });
  }
  items.push({ href: "/workspace/profile", label: "Profile", icon: "profile" });

  return items;
}

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
              <p className="text-nybb-bone/60 mt-1 truncate text-xs">
                {profile.displayName} · {roleLabel}
              </p>
            </div>
          </div>
          <WorkspaceSignOut />
        </div>
        <WorkspaceNav items={navItems(profile)} />
        <HeatRule className="h-1" />
      </header>
      <main id="workspace-main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {children}
      </main>
    </div>
  );
}
