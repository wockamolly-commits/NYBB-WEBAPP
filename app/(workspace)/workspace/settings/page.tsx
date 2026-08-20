import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { getOrderIntakeSettings, getStoreAvailability } from "@/lib/staff/availability";
import { requireStaffPermission } from "@/lib/staff/session";
import { SettingsManager } from "./SettingsManager";

export const metadata: Metadata = { title: "Store settings" };

export default async function WorkspaceSettingsPage() {
  const { profile } = await requireStaffPermission("settings:manage", "/workspace/settings");
  const [branches, intake] = await Promise.all([getStoreAvailability(), getOrderIntakeSettings()]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="type-caps text-nybb-yellow">Owner tools</p>
          <h1 className="font-display heading-major mt-2">Store settings</h1>
          <p className="text-nybb-bone/70 mt-2 max-w-2xl text-sm">
            Hours, prep time and pickup capacity. These are the planned figures the storefront
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
          canManageBusinessWide={profile.branchId === null}
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
