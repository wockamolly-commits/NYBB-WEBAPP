export type StorefrontIdentityLink = {
  href: "/workspace" | "/account" | "/login";
  label: "Workspace" | "Account" | "Sign in";
  accessibleLabel: "Open Workspace" | "Your account" | "Sign in";
};

export function storefrontIdentityLink({
  signedIn,
  hasWorkspaceAccess,
}: {
  signedIn: boolean;
  hasWorkspaceAccess: boolean;
}): StorefrontIdentityLink {
  if (hasWorkspaceAccess) {
    return {
      href: "/workspace",
      label: "Workspace",
      accessibleLabel: "Open Workspace",
    };
  }
  if (signedIn) {
    return { href: "/account", label: "Account", accessibleLabel: "Your account" };
  }
  return { href: "/login", label: "Sign in", accessibleLabel: "Sign in" };
}
