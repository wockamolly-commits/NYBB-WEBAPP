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
