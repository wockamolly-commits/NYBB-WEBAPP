// proxy.ts
//
// Next 16 renamed Middleware to Proxy. Same execution model, same file
// position (project root, alongside `app`), different filename and export.
//
// Today this does one job: mint a per-request nonce and attach the CSP.
// Supabase session refresh hooks in here in Phase 2, when auth lands. That
// ordering is deliberate: the refresh must happen in the proxy and nowhere
// else, because a rotated refresh token written inside a Server Component
// cannot be persisted to the browser and silently signs the user out.
import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy } from "@/lib/content-security-policy";

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  // Next reads x-nonce off the request and stamps it onto the script tags it
  // emits. The browser then receives the matching policy on the response, so
  // both halves have to be set or nothing executes.
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Everything except static assets and images. Those are served straight from
  // the CDN and gain nothing from a per-request nonce.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|avif)$).*)",
  ],
};
