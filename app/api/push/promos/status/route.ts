import { promoPushStatus } from "@/lib/customer/promo-push";
import { cookieCaller } from "@/lib/customer/cookie-caller";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Whether this browser is opted in to promo alerts.
 *
 * A POST for the reason its neighbours give: a push endpoint is a device
 * credential and does not belong in a URL or an access log.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ optedIn: false }, { status: 400 });
  }

  return Response.json(await promoPushStatus(body, await cookieCaller()));
}
