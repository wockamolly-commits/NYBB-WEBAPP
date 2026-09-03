import type { StaffJobRole, StaffPermission } from "./roles";

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
 * What a permission switch gets back.
 *
 * It carries the permission and the state the database settled on, because the
 * panel moves the switch optimistically the moment it is pressed and has to be
 * able to put it back if the answer is no. Without the key it would know only
 * that something failed, and would have to reset all thirteen.
 */
export type PermissionActionState = WorkspaceAccessActionState & {
  permission?: StaffPermission;
  granted?: boolean;
};
