const BLOCKED_PREFIXES = ["/api", "/auth", "/workspace"];

/**
 * Whether a path stays on this site once a browser has parsed it.
 *
 * Checking the raw string for "//" is not enough on its own, because the URL
 * parser deletes tabs and newlines before it reads anything: "/\t/evil.com"
 * passes a "//" test and is then followed to evil.com. So every control
 * character is refused outright, not only the three the parser strips today.
 */
function isSameSitePath(path: string): boolean {
  return (
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("\\") &&
    !/[\u0000-\u001f\u007f]/.test(path)
  );
}

/** A same-origin storefront destination, never an external or staff URL. */
export function safeCustomerNextPath(value: unknown, fallback = "/account"): string {
  if (typeof value !== "string") return fallback;
  const path = value.trim();
  if (!isSameSitePath(path)) return fallback;
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
  if (!isSameSitePath(path)) return null;
  const pathname = path.split(/[?#]/, 1)[0];
  if (pathname !== "/workspace" && !pathname.startsWith("/workspace/")) return null;
  if (pathname === "/workspace/login" || pathname.startsWith("/workspace/login/")) {
    return null;
  }
  return path.slice(0, 240);
}
