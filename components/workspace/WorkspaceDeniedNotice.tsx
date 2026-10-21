"use client";

import { useSearchParams } from "next/navigation";

/**
 * Said once, on the screen a person was sent to after asking for a page their
 * role does not open. requireStaffPermission and the two admin-only pages
 * redirect with ?denied=1 (lib/staff/session.ts WORKSPACE_DENIED).
 */
export function WorkspaceDeniedNotice() {
  const params = useSearchParams();
  if (params.get("denied") !== "1") return null;
  return (
    <p
      role="status"
      className="border-nybb-yellow/60 text-nybb-bone mb-6 rounded-md border px-4 py-3 text-sm"
    >
      That page is not part of your role, so you have been brought here instead. Ask the Super
      Admin if you need it.
    </p>
  );
}
