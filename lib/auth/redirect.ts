const BLOCKED_PREFIXES = ["/api", "/auth", "/workspace"];

/** A same-origin storefront destination, never an external or staff URL. */
export function safeCustomerNextPath(value: unknown, fallback = "/account"): string {
  if (typeof value !== "string") return fallback;
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return fallback;
  const pathname = path.split(/[?#]/, 1)[0];
  if (
    BLOCKED_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return fallback;
  }
  return path.slice(0, 240);
}

/** A same-origin workspace destination, never the login page or a public URL. */
export function safeStaffNextPath(value: unknown, fallback = "/workspace"): string {
  return requestedStaffNextPath(value) ?? fallback;
}

/** A requested workspace destination, or null when the input is not one. */
export function requestedStaffNextPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return null;
  const pathname = path.split(/[?#]/, 1)[0];
  if (pathname !== "/workspace" && !pathname.startsWith("/workspace/")) return null;
  if (pathname === "/workspace/login" || pathname.startsWith("/workspace/login/")) {
    return null;
  }
  return path.slice(0, 240);
}
