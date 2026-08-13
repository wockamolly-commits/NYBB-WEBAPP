import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyCustomer } from "./dispatch";
import {
  adminConfigured,
  createAdminClient,
} from "@/lib/supabase/admin-client";

/**
 * Sends whatever `expire_unpaid_online_orders` (0039) left queued.
 *
 * That sweep cancels an order from inside a pg_cron job, deliberately,
 * because cancellation cannot depend on Vercel or an HTTP round trip. It
 * cannot call `notifyCustomer` directly for the same reason, so it inserts a
 * `notifications` row instead. This function is what turns that row into an
 * actual push, called from the cron route below and from anywhere else that
 * wants to drain by hand.
 *
 * Claiming has to be atomic. The cron route runs every five minutes and is
 * also manually triggerable, so two drains can overlap in time. supabase-js
 * has no way to express "update the oldest N queued rows, and skip whatever
 * another transaction already has locked" through PostgREST: a plain
 * `.update().eq("status", "queued")` can only be bounded (an unbounded claim
 * hands one slow drain the entire backlog) by a racy read-then-write, which
 * is exactly the double-send this exists to prevent. `claim_queued_push_notifications`
 * (0041) does the claim inside Postgres instead, with `for update skip
 * locked`, so the row selection and the status flip from 'queued' to
 * 'sending' happen as one statement that a second concurrent caller cannot
 * see the same row inside of.
 */

interface ClaimedNotification {
  id: number;
  payload: unknown;
}

function orderIdFromPayload(payload: unknown): string | null {
  if (payload === null || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>).order_id;
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function markSent(admin: SupabaseClient, id: number): Promise<void> {
  const { error } = await admin
    .from("notifications")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[push] drainPushQueue mark sent failed", error.message);
  }
}

async function markFailed(
  admin: SupabaseClient,
  id: number,
  lastError: string,
): Promise<void> {
  const { error } = await admin
    .from("notifications")
    .update({ status: "failed", last_error: lastError })
    .eq("id", id);
  if (error) {
    console.error("[push] drainPushQueue mark failed failed", error.message);
  }
}

export async function drainPushQueue(
  limit = 50,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  try {
    if (!adminConfigured()) return { sent, failed };
    const admin = createAdminClient();

    const { data, error } = await admin.rpc(
      "claim_queued_push_notifications",
      { p_limit: limit },
    );

    if (error) {
      console.error("[push] drainPushQueue claim failed", error.message);
      return { sent, failed };
    }

    const rows = (data ?? []) as ClaimedNotification[];

    // If markSent or markFailed itself throws (a DB write failing, not just
    // returning an error), the outer catch below ends this loop for the
    // whole batch: any row after the one that threw stays 'sending' with no
    // reclaim path in this function. That is deliberate, not an oversight.
    // It cannot double-send (a 'sending' row is never reclaimed by
    // claim_queued_push_notifications) and it cannot make this promise
    // reject, so it does not violate this function's contract. Recovering a
    // row stranded in 'sending' is deferred: 0007's own comment on
    // `sending_started_at` says that column exists so a later sweep can
    // tell "in flight" from "stuck" without a second table, and that sweep,
    // not this loop, is where retry-with-backoff belongs.
    for (const row of rows) {
      const orderId = orderIdFromPayload(row.payload);
      if (!orderId) {
        failed += 1;
        await markFailed(admin, row.id, "queued row missing order_id");
        continue;
      }

      try {
        // notifyCustomer never rejects in production (Task 6's contract):
        // it catches everything itself and only ever resolves. This catch
        // exists only so a future break of that contract cannot take the
        // rest of this loop, and this function's promise, down with it.
        await notifyCustomer(orderId);
        sent += 1;
        await markSent(admin, row.id);
      } catch (sendError) {
        failed += 1;
        await markFailed(
          admin,
          row.id,
          sendError instanceof Error ? sendError.message : "unknown error",
        );
      }
    }
  } catch (error) {
    // Deliberately just an error message, the same reason dispatch.ts's own
    // outer catches are: nothing here should ever carry a payload or a
    // tracking token into a log line.
    console.error(
      "[push] drainPushQueue failed",
      error instanceof Error ? error.message : "unknown",
    );
  }
  return { sent, failed };
}
