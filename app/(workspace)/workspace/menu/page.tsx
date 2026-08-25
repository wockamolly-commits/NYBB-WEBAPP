import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { getManagedMenu } from "@/lib/staff/menu";
import { hasStaffPermission, requireStaffPermission } from "@/lib/staff/session";
import { MenuList } from "./MenuList";

export const metadata: Metadata = { title: "Menu" };

export default async function WorkspaceMenuPage() {
  const { profile } = await requireStaffPermission("menu:view", "/workspace/menu");
  const menu = await getManagedMenu();
  const can = {
    configure: hasStaffPermission(profile, "menu:configure"),
    availability: hasStaffPermission(profile, "menu:availability"),
  };

  if (!menu) {
    return (
      <div role="alert" className="border-nybb-bone/30 mt-7 rounded-md border border-dashed p-5">
        <p className="font-display heading-panel">The menu is unavailable</p>
        <p className="text-nybb-bone/60 mt-2 text-sm">
          Your session is still valid. The workspace could not read the catalog, so try again.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="type-caps text-nybb-yellow">Owner tools</p>
          <h1 className="font-display heading-major mt-2">Menu</h1>
          <p className="text-nybb-bone/60 mt-2 max-w-2xl text-sm">
            {can.configure
              ? "Everything the storefront sells. Changes are saved through audited database controls and reach the site immediately."
              : "Everything the storefront sells. Mark an item sold out at your counter and it stops being offered there straight away."}
          </p>
        </div>
        {can.configure ? (
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/workspace/menu/items/new" tone="dark" variant="primary">New item</ButtonLink>
            <ButtonLink href="/workspace/menu/categories" tone="dark" variant="secondary">Categories</ButtonLink>
            <ButtonLink href="/workspace/menu/options" tone="dark" variant="secondary">Options</ButtonLink>
          </div>
        ) : null}
      </div>
      <MenuList menu={menu} can={can} actingBranchId={profile.branchId} />
    </div>
  );
}
