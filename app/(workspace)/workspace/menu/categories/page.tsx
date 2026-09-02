import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { getManagedMenu } from "@/lib/staff/menu";
import { requireStaffPermission } from "@/lib/staff/session";
import { MenuUnavailable } from "../MenuUnavailable";
import { CategoryEditor } from "./CategoryEditor";

export const metadata: Metadata = { title: "Categories" };

export default async function WorkspaceMenuCategoriesPage() {
  await requireStaffPermission("menu:configure", "/workspace/menu/categories");
  const menu = await getManagedMenu();

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="type-caps text-nybb-yellow">Owner tools</p>
          <h1 className="font-display heading-major mt-2">Categories</h1>
          <p className="text-nybb-bone/60 mt-2 max-w-2xl text-sm">
            The sections the storefront groups items under. Changes are saved through audited
            database controls and reach the site immediately.
          </p>
        </div>
        <ButtonLink href="/workspace/menu" tone="dark" variant="secondary">
          Back to menu
        </ButtonLink>
      </div>

      {menu ? (
        <CategoryEditor categories={menu.categories} />
      ) : (
        <MenuUnavailable />
      )}
    </div>
  );
}
