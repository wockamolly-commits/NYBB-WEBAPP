import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { safeStaffNextPath } from "@/lib/auth/redirect";
import { isCrossSiteRequest } from "@/lib/auth/request-origin";
import {
  provisionConfiguredSuperAdmin,
  resolveStaffEmailAccess,
} from "@/lib/staff/access";
import { getStaffProfile } from "@/lib/staff/session";
import { customerAuthCookieName, STAFF_AUTH_COOKIE } from "@/lib/supabase/constants";
import { createCustomerClient, createStaffClient } from "@/lib/supabase/server";

async function clearCookieFamily(name: string | null): Promise<void> {
  if (!name) return;
  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name === name || cookie.name.startsWith(`${name}.`)) {
      cookieStore.set(cookie.name, "", { maxAge: 0, path: "/" });
    }
  }
}

function loginUrl(request: NextRequest, destination: string): URL {
  const url = new URL("/login", request.url);
  url.searchParams.set("next", destination);
  return url;
}

export async function GET(request: NextRequest) {
  if (isCrossSiteRequest({ headers: request.headers, origin: request.nextUrl.origin })) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const destination = safeStaffNextPath(request.nextUrl.searchParams.get("next"));

  if (await getStaffProfile()) {
    return NextResponse.redirect(new URL(destination, request.url), 303);
  }

  const customer = await createCustomerClient();
  const userResult = await customer.auth.getUser();
  const user = userResult.data.user;
  if (!user || !user.email) {
    return NextResponse.redirect(loginUrl(request, destination), 303);
  }

  // getUser validates and refreshes first. getSession is used only after that
  // trusted check so its tokens can be moved into the isolated staff family.
  const sessionResult = await customer.auth.getSession();
  const session = sessionResult.data.session;

  if (!session) {
    return NextResponse.redirect(loginUrl(request, destination), 303);
  }

  let access;
  try {
    access = await resolveStaffEmailAccess(user.email);
    if (access?.kind === "super_admin") {
      await provisionConfiguredSuperAdmin(user);
    } else if (access?.kind === "staff" && access.profileId !== user.id) {
      access = null;
    }
  } catch (error) {
    console.error("[staff-auth] workspace transfer lookup failed:", error);
    return NextResponse.redirect(loginUrl(request, destination), 303);
  }

  if (!access) {
    await clearCookieFamily(STAFF_AUTH_COOKIE);
    return NextResponse.redirect(new URL("/account?workspace=denied", request.url), 303);
  }

  const staff = await createStaffClient();
  const { error } = await staff.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (error) {
    console.error("[staff-auth] workspace session transfer failed:", error.message);
    return NextResponse.redirect(loginUrl(request, destination), 303);
  }

  await clearCookieFamily(customerAuthCookieName());
  return NextResponse.redirect(new URL(destination, request.url), 303);
}
