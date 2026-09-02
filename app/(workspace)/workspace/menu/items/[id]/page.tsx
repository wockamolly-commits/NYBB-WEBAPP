import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/Button";
import { getManagedMenu } from "@/lib/staff/menu";
import { hasStaffPermission, requireStaffPermission } from "@/lib/staff/session";
import { ItemEditor } from "../ItemEditor";
import { MenuUnavailable } from "../../MenuUnavailable";

export const metadata: Metadata = { title: "Edit item" };

export default async function EditMenuItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile } = await requireStaffPermission("menu:configure", `/workspace/menu/items/${id}`);
  const menu = await getManagedMenu();

  // A failed read and a missing item are two different answers. notFound()
  // for both would tell somebody whose network blinked that their item is
  // gone, so the unavailable state is kept separate here the way the sibling
  // menu screens keep it.
  if (!menu) {
    return (
      <div>
        <h1 className="font-display heading-major">Edit item</h1>
        <MenuUnavailable />
      </div>
    );
  }

  const item = menu.categories
    .flatMap((category) => category.items)
    .find((candidate) => candidate.id === id);
  if (!item) notFound();

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="type-caps text-nybb-yellow">Owner tools</p>
          <h1 className="font-display heading-major mt-2">{item.name}</h1>
          <p className="text-nybb-bone/60 mt-2 max-w-2xl text-sm">
            The item, its sizes and the option groups it offers are saved together, in one
            audited change. Renaming it never changes its web address.
          </p>
        </div>
        <ButtonLink href="/workspace/menu" tone="dark" variant="secondary">
          Back to menu
        </ButtonLink>
      </div>

      <ItemEditor
        item={item}
        categories={menu.categories}
        optionGroups={menu.optionGroups}
        branches={menu.branches}
        canSetAvailability={hasStaffPermission(profile, "menu:availability")}
      />
    </div>
  );
}
