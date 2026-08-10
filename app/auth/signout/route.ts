import { type NextRequest, NextResponse } from "next/server";
import { isCrossSiteRequest } from "@/lib/auth/request-origin";
import { getStorefrontSession } from "@/lib/auth/session";
import { createCustomerClient, createStaffClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  if (isCrossSiteRequest({ headers: request.headers, origin: request.nextUrl.origin })) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const staffScope = request.nextUrl.searchParams.get("scope") === "staff";
  const storefrontSession = staffScope ? null : await getStorefrontSession();
  const supabase =
    staffScope || storefrontSession?.source === "staff"
      ? await createStaffClient()
      : await createCustomerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(
    new URL(staffScope ? "/login?next=/workspace" : "/", request.url),
    303,
  );
}
