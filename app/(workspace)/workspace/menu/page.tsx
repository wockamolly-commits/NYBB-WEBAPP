import type { Metadata } from "next";
import { Layers, ListPlus, Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { getManagedMenu } from "@/lib/staff/menu";
import { hasStaffPermission, requireStaffPermission } from "@/lib/staff/session";
import { MenuList } from "./MenuList";
import { MenuUnavailable } from "./MenuUnavailable";

export const metadata: Metadata = { title: "Menu" };

export default async function WorkspaceMenuPage() {
  const { profile } = await requireStaffPermission("menu:view", "/workspace/menu");
  const menu = await getManagedMenu();
  const can = {
    configure: hasStaffPermission(profile, "menu:configure"),
    availability: hasStaffPermission(profile, "menu:availability"),
  };

  if (!menu) {
    return <MenuUnavailable />;
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="type-caps text-nybb-yellow">Owner tools</p>
          <h1 className="font-display heading-major mt-2">Menu</h1>
          <p className="text-nybb-bone/60 mt-2 max-w-2xl text-sm">
            {can.configure
              ? "Everything the storefront sells. Search for an item, open Availability to mark it sold out at a counter, or Edit to change its details. Changes reach the site immediately."
              : "Everything the storefront sells. Search for an item and open Availability to mark it sold out at your counter. It stops being offered there straight away."}
          </p>
        </div>
        {can.configure ? (
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/workspace/menu/items/new" tone="dark" variant="primary">
              <Plus aria-hidden className="size-4" />
              New item
            </ButtonLink>
            <ButtonLink href="/workspace/menu/categories" tone="dark" variant="secondary">
              <Layers aria-hidden className="size-4" />
              Categories
            </ButtonLink>
            <ButtonLink href="/workspace/menu/options" tone="dark" variant="secondary">
              <ListPlus aria-hidden className="size-4" />
              Options
            </ButtonLink>
          </div>
        ) : null}
      </div>
      <MenuList menu={menu} can={can} actingBranchId={profile.branchId} />
    </div>
  );
}
