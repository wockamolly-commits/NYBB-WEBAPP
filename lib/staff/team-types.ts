import type { StaffJobRole } from "./roles";

export type WorkspaceMember = {
  profileId: string;
  email: string;
  displayName: string;
  role: "admin" | "staff";
  staffRole: StaffJobRole | null;
  branchId: string | null;
  isActive: boolean;
  createdAt: string;
};

/** A branch the Super Admin may assign somebody to. */
export type AssignableBranch = {
  id: string;
  shortName: string;
  isActive: boolean;
};

export type WorkspaceAccessActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

/**
 * What one press of Save gets back.
 *
 * savedCount is what the database actually changed, which is not always the
 * number of switches that moved: a set can name a permission that is already
 * where it is being put, and the function skips those rather than writing a
 * row and an audit line for nothing. The panel says what happened rather than
 * what was asked for.
 */
export type PermissionActionState = WorkspaceAccessActionState & {
  savedCount?: number;
};
