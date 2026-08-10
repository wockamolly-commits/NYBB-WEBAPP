import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  customerAuthCookieName,
  STAFF_AUTH_COOKIE,
  STAFF_COOKIE_ENCODING,
} from "./constants";

export async function updateSessions(
  request: NextRequest,
  requestHeaders: Headers,
  responseHeaders: Record<string, string>,
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const customerCookieName = customerAuthCookieName();

  if (!url || !anonKey) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    Object.entries(responseHeaders).forEach(([name, value]) => response.headers.set(name, value));
    return response;
  }
  const configured = { url, anonKey };

  const requestCookies = request.cookies.getAll();
  const pending = new Map<string, { name: string; value: string; options: CookieOptions }>();
  const pendingHeaders = new Map<string, string>();

  function hasCookieFamily(cookieName: string | null): boolean {
    return Boolean(
      cookieName &&
        requestCookies.some(
          ({ name }) => name === cookieName || name.startsWith(`${cookieName}.`),
        ),
    );
  }

  function sessionClient(options: { staff?: boolean } = {}) {
    return createServerClient(configured.url, configured.anonKey, {
      ...(options.staff ? { cookieOptions: { name: STAFF_AUTH_COOKIE } } : {}),
      cookies: {
        ...(options.staff ? { encode: STAFF_COOKIE_ENCODING } : {}),
        getAll: () => requestCookies,
        setAll(cookiesToSet, headersToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            pending.set(name, { name, value, options });
          });
          Object.entries(headersToSet).forEach(([name, value]) =>
            pendingHeaders.set(name, value),
          );
        },
      },
    });
  }

  const refreshes: Promise<unknown>[] = [];
  if (hasCookieFamily(customerCookieName)) {
    refreshes.push(sessionClient().auth.getUser());
  }
  if (hasCookieFamily(STAFF_AUTH_COOKIE)) {
    refreshes.push(sessionClient({ staff: true }).auth.getUser());
  }
  // A transient auth outage must not take either application surface down.
  await Promise.all(refreshes).catch(() => null);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  pending.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  pendingHeaders.forEach((value, name) => response.headers.set(name, value));
  Object.entries(responseHeaders).forEach(([name, value]) => response.headers.set(name, value));
  return response;
}
