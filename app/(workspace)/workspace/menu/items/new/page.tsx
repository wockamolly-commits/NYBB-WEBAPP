import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { getManagedMenu } from "@/lib/staff/menu";
import { requireStaffPermission } from "@/lib/staff/session";
import { ItemEditor } from "../ItemEditor";
import { MenuUnavailable } from "../../MenuUnavailable";

export const metadata: Metadata = { title: "New item" };

export default async function NewMenuItemPage() {
  await requireStaffPermission("menu:configure", "/workspace/menu/items/new");
  const menu = await getManagedMenu();

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="type-caps text-nybb-yellow">Owner tools</p>
          <h1 className="font-display heading-major mt-2">New item</h1>
          <p className="text-nybb-bone/60 mt-2 max-w-2xl text-sm">
            The item, its sizes and the option groups it offers are saved together, in one
            audited change.
          </p>
        </div>
        <ButtonLink href="/workspace/menu" tone="dark" variant="secondary">
          Back to menu
        </ButtonLink>
      </div>

      {menu ? (
        <ItemEditor item={null} categories={menu.categories} optionGroups={menu.optionGroups} />
      ) : (
        <MenuUnavailable />
      )}
    </div>
  );
}
