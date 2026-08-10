// proxy.ts
//
// Next 16 renamed Middleware to Proxy. Same execution model, same file
// position (project root, alongside `app`), different filename and export.
//
// This mints the per-request nonce and refreshes both Supabase cookie families.
// Customer and staff tokens stay isolated, and refresh happens here because a
// rotated token written inside a Server Component cannot be persisted to the
// browser and silently signs the user out.
import type { NextRequest } from "next/server";
import { contentSecurityPolicy } from "@/lib/content-security-policy";
import { updateSessions } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  // Next reads x-nonce off the request and stamps it onto the script tags it
  // emits. The browser then receives the matching policy on the response, so
  // both halves have to be set or nothing executes.
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  return updateSessions(request, requestHeaders, {
    "Content-Security-Policy": csp,
  });
}

export const config = {
  // Everything except static assets and images. Those are served straight from
  // the CDN and gain nothing from a per-request nonce.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|avif)$).*)",
  ],
};
