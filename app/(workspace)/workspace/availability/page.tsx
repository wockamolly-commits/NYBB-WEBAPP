import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { getOrderIntakeSettings, getStoreAvailability } from "@/lib/staff/availability";
import { requireStaffPermission } from "@/lib/staff/session";
import { AvailabilityManager } from "./AvailabilityManager";

export const metadata: Metadata = { title: "Store availability" };

export default async function WorkspaceAvailabilityPage() {
  const [, branches, intake] = await Promise.all([
    requireStaffPermission("store:availability", "/workspace/availability"),
    getStoreAvailability(),
    getOrderIntakeSettings(),
  ]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="type-caps text-nybb-yellow">Shift control</p>
          <h1 className="font-display heading-major mt-2">Store availability</h1>
          <p className="text-nybb-bone/55 mt-2 max-w-2xl text-sm">Pause a counter when its kitchen needs a breath. Opening hours and capacity stay in Settings because they are planned configuration, not a mid-shift control.</p>
        </div>
        <ButtonLink href="/workspace" tone="dark" variant="secondary">Back to dashboard</ButtonLink>
      </div>

      {branches && intake ? <AvailabilityManager branches={branches} intake={intake} /> : (
        <div role="alert" className="border-nybb-bone/30 mt-7 rounded-md border border-dashed p-5">
          <p className="font-display heading-panel">Availability is unavailable</p>
          <p className="text-nybb-bone/60 mt-2 text-sm">The workspace could not read the current store configuration. Your session is still valid, so try again.</p>
        </div>
      )}
    </div>
  );
}
