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

/**
 * `delivered` is not `sent` with a different name.
 *
 * `sent` counts queued rows this drain finished with. `delivered` counts the
 * devices those rows actually reached. They come apart in the case that matters:
 * a customer who never registered a phone produces `sent: 1, delivered: 0`, and
 * so does one whose registration is stale. Reporting only `sent` was the thing
 * that let "failed: 0" in the cron response look like proof somebody had been
 * told.
 */
export async function drainPushQueue(
  limit = 50,
): Promise<{ sent: number; failed: number; delivered: number }> {
  let sent = 0;
  let failed = 0;
  let delivered = 0;
  try {
    if (!adminConfigured()) return { sent, failed, delivered };
    const admin = createAdminClient();

    const { data, error } = await admin.rpc(
      "claim_queued_push_notifications",
      { p_limit: limit },
    );

    if (error) {
      console.error("[push] drainPushQueue claim failed", error.message);
      return { sent, failed, delivered };
    }

    const rows = (data ?? []) as ClaimedNotification[];

    // If markFailed itself throws (a DB write failing, not just returning an
    // error), at either call site below, it propagates past this loop to the
    // outer catch and ends the batch there: any row claimed after the one
    // that threw stays 'sending' with no reclaim path in this function. That
    // is deliberate, not an oversight. It cannot double-send (a 'sending'
    // row is never reclaimed by claim_queued_push_notifications) and it
    // cannot make this promise reject, so it does not violate this
    // function's contract. Recovering a row stranded in 'sending' is
    // deferred: 0007's own comment on `sending_started_at` says that column
    // exists so a later sweep can tell "in flight" from "stuck" without a
    // second table, and that sweep, not this loop, is where
    // retry-with-backoff belongs.
    //
    // A throw from markSent does not end the batch: it is caught by the same
    // catch that handles a send failure, which marks that row 'failed' and
    // lets the loop continue. That case is worth a second look rather than a
    // shrug: if notifyCustomer already delivered the notification and only
    // the bookkeeping write failed afterward, the row still ends up
    // 'failed', not 'sent'. A future stuck-row sweep that retries 'failed'
    // rows would then tell that customer the same thing twice. A 'failed'
    // row here is not proof the customer was never told.
    //
    // ALL OF THE ABOVE IS ABOUT markSent AND markFailed *THROWING*, WHICH IS
    // THE RARE CASE. The common one is them RETURNING a Supabase error object,
    // which both of them log and swallow. A row whose markSent returned an
    // error is counted `sent` here and stays `sending` in the table forever:
    // the claim's `status = 'queued'` predicate never selects it again, and
    // nothing else reads `sending`. The same is true if the process dies
    // between the claim and the mark.
    //
    // THAT IS DELIBERATE, AND IT IS THE DECISION, NOT AN OPEN QUESTION.
    // `sending` is terminal in practice today. There is no sweep, no retry and
    // no reclaim, and `0007`'s `sending_started_at` (written by `0041`) is read
    // by nothing in this repository. The alternative, reclaiming a stale
    // `sending` row, cannot be built safely until the double-notify hazard two
    // paragraphs up is solved, because the row that most needs reclaiming is
    // exactly the one whose customer may already have been told.
    //
    // What makes this survivable rather than silent: the count `drainPushQueue`
    // returns now separates rows finished from devices reached, and every
    // swallowed error above is logged. What makes it visible if it ever stops
    // being rare: a `sending` row older than a few minutes is a stuck row, and
    // `sending_started_at` is already recorded for whoever writes that alert.
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
        // What it DOES do is answer, and this is where the answer is used.
        const result = await notifyCustomer(orderId);

        if (!result.ok) {
          failed += 1;
          await markFailed(admin, row.id, result.reason);
          continue;
        }

        // Incremented after the mark, not before. The other order lets one row
        // count as sent here and then, if markSent throws, count as failed in
        // the catch below, so the cron response over-reports on exactly the
        // occasion something went wrong.
        await markSent(admin, row.id);
        sent += 1;
        delivered += result.delivered;
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
  return { sent, failed, delivered };
}
