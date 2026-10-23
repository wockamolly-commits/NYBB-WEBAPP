import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { getBranchDirectory } from "@/lib/branches/reader";
import { branches as catalogBranches } from "@/lib/catalog/branches";
import { getBranchDetails, getOrderIntakeSettings, getPriceLists, getStoreAvailability } from "@/lib/staff/availability";
import { requireStaffPermission } from "@/lib/staff/session";
import { SettingsManager, type BranchLocation } from "./SettingsManager";

export const metadata: Metadata = { title: "Store settings" };

export default async function WorkspaceSettingsPage() {
  const { profile } = await requireStaffPermission("settings:manage", "/workspace/settings");
  const businessWide = profile.branchId === null;
  const [branches, intake, priceLists, directory, details] = await Promise.all([
    getStoreAvailability(),
    getOrderIntakeSettings(),
    businessWide ? getPriceLists() : Promise.resolve(null),
    getBranchDirectory(),
    getBranchDetails(),
  ]);

  // The same precedence the storefront applies (lib/branches/directory.ts):
  // a pin set here, then the catalog's confirmed pin, then none.
  const locations: Record<string, BranchLocation> = {};
  for (const branch of branches ?? []) {
    const workspacePin = directory.find((row) => row.slug === branch.slug)?.pin ?? null;
    const catalogPin = catalogBranches.find((entry) => entry.slug === branch.slug)?.pin ?? null;
    locations[branch.slug] = {
      pin: workspacePin ?? catalogPin,
      catalogPin,
      source: workspacePin ? "workspace" : catalogPin ? "catalog" : null,
    };
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="type-caps text-nybb-yellow">Owner tools</p>
          <h1 className="font-display heading-major mt-2">Store settings</h1>
          <p className="text-nybb-bone/70 mt-2 max-w-2xl text-sm">
            Branch details, hours, map locations, prep time and pickup capacity. These are the planned figures the storefront
            books against, so a change here changes what a customer can choose. To stop orders
            for the rest of a shift, use Store availability instead.
          </p>
        </div>
        <ButtonLink href="/workspace" tone="dark" variant="secondary">
          Back to dashboard
        </ButtonLink>
      </div>

      {branches ? (
        <SettingsManager
          branches={branches}
          intake={intake}
          priceLists={priceLists}
          locations={locations}
          details={details}
          canManageBusinessWide={businessWide}
        />
      ) : (
        <div role="alert" className="border-nybb-bone/30 mt-7 rounded-md border border-dashed p-5">
          <p className="font-display heading-panel">Settings are unavailable</p>
          <p className="text-nybb-bone/60 mt-2 text-sm">
            The workspace could not read the store configuration. Your session is still valid, so
            try again.
          </p>
        </div>
      )}
    </div>
  );
}
