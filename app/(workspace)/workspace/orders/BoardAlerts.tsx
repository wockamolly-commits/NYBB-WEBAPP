"use client";

import { BellRing, Footprints, Store } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HeatRule } from "@/components/site/HeatRule";
import { Button } from "@/components/ui/Button";
import {
  COUNTER_NOTICE,
  NEW_ORDER_INTERVAL_MS,
  audioContextConstructor,
  playNewOrderAlarm,
  playPhrase,
} from "@/lib/orders/alert-sounds";
import { cn } from "@/lib/utils";

/**
 * The sound and the banner for whoever is looking at the board (spec section
 * 15, channel 2).
 *
 * Push is the channel for a closed browser. This one is for the open board,
 * which is where the counter tablet spends its shift, often with its
 * notifications muted or swiped away. The board already redraws itself when an
 * order changes; this is what makes the redraw audible.
 *
 * THE REPLAY GUARD. Every key this has announced is remembered for the tab in
 * sessionStorage, so the 20 second poll, a realtime redraw and a reload do not
 * chime again for the same order. The first time a tab sees the board it
 * learns what is already there without chiming: an order that has been waiting
 * since before the tab opened is already on screen, and a burst of chimes for
 * it would teach the counter to ignore the sound.
 *
 * A NEW ORDER RINGS UNTIL SOMEBODY ANSWERS IT. One chime was easy to lose
 * under a fryer, so a new order loops a loud alarm until it is answered: "Got
 * it" on the banner, or Start on the card, which takes the order out of the
 * New column and so out of what this rings for. A customer on the way or at
 * the counter is news rather than work, and plays once.
 *
 * WHY A BUTTON FOR THE SOUND. Browsers refuse to play audio until the page has
 * been touched. The tablet is touched constantly, so the first tap anywhere
 * unlocks it, and the button is there so the state is visible rather than a
 * chime that silently never happens.
 */

export type BoardAlert = {
  /**
   * Stable per event: "new:<order id>", "arrived:<order id>", or
   * "coming:<order id>:<when they tapped>", so a second "I'm coming" after a
   * ring from the counter is a new event.
   */
  key: string;
  shortCode: string;
  kind: "new" | "arrived" | "coming";
  /**
   * What the counter needs to decide on a new order without looking away from
   * the ticket. Formatted on the server, like the rest of the board's times.
   */
  ticket?: {
    customerName: string;
    itemCount: number;
    total: string;
    /** The promised pickup time, or null when the order has none. */
    pickupAt: string | null;
    isTest: boolean;
  };
};

const SEEN_KEY = "nybb-board-alerts-seen";
const SOUND_KEY = "nybb-board-sound";
/** Enough for a busy shift; older keys belong to orders long since collected. */
const SEEN_LIMIT = 400;

function readSeen(): Set<string> | null {
  try {
    const raw = window.sessionStorage.getItem(SEEN_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((v) => typeof v === "string")) : null;
  } catch {
    return null;
  }
}

function writeSeen(seen: Set<string>): void {
  try {
    window.sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-SEEN_LIMIT)));
  } catch {
    // Private mode or storage blocked. The worst case is a repeat chime.
  }
}

function readSoundPreference(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

function writeSoundPreference(on: boolean): void {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // Falls back to the default next load, which is on.
  }
}

export function BoardAlerts({ alerts }: { alerts: BoardAlert[] }) {
  const [banner, setBanner] = useState<BoardAlert[]>([]);
  const [soundOn, setSoundOn] = useState(true);
  const [audioReady, setAudioReady] = useState(false);
  // New orders this tab has not answered. Checked against the current alerts
  // below, so an order started on another device stops ringing here too.
  const [unanswered, setUnanswered] = useState<string[]>([]);
  const context = useRef<AudioContext | null>(null);
  const sounding = useRef<Set<AudioScheduledSourceNode>>(new Set());

  // The preference and the audio unlock. The context is made on the first
  // touch, because one made before it starts suspended in every browser.
  useEffect(() => {
    // Read after mount rather than in useState, so the server render and the
    // first client render agree on the label.
    const read = window.setTimeout(() => setSoundOn(readSoundPreference()), 0);
    const unlock = () => {
      if (!context.current) {
        const Ctor = audioContextConstructor();
        if (!Ctor) return;
        context.current = new Ctor();
      }
      void context.current
        .resume()
        .then(() => setAudioReady(context.current?.state === "running"))
        .catch(() => setAudioReady(false));
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.clearTimeout(read);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Read at the moment of an event, so toggling the sound never replays one.
  const soundOnRef = useRef(soundOn);
  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  useEffect(() => {
    const seen = readSeen();
    if (seen === null) {
      writeSeen(new Set(alerts.map((alert) => alert.key)));
      return;
    }
    const fresh = alerts.filter((alert) => !seen.has(alert.key));
    if (fresh.length === 0) return;
    fresh.forEach((alert) => seen.add(alert.key));
    writeSeen(seen);

    const audio = context.current;
    if (
      soundOnRef.current &&
      audio &&
      audio.state === "running" &&
      fresh.some((alert) => alert.kind !== "new")
    ) {
      // One notice per redraw. Two customers landing in the same refresh are
      // one event to the person at the counter.
      playPhrase(audio, COUNTER_NOTICE, "alarm");
    }
    // The storage above is the external system; the banner and the alarm
    // follow it on the next tick rather than inside this effect's own render.
    const show = window.setTimeout(() => {
      setBanner((current) => [...fresh, ...current].slice(0, 5));
      const newOrders = fresh.filter((alert) => alert.kind === "new").map((alert) => alert.key);
      if (newOrders.length > 0) {
        setUnanswered((current) => [...new Set([...current, ...newOrders])]);
      }
    }, 0);
    return () => window.clearTimeout(show);
  }, [alerts]);

  const liveKeys = useMemo(() => new Set(alerts.map((alert) => alert.key)), [alerts]);
  const ringing = unanswered.some((key) => liveKeys.has(key));

  const silence = useCallback(() => {
    for (const osc of sounding.current) {
      try {
        osc.stop();
      } catch {
        // Already stopped.
      }
    }
    sounding.current.clear();
  }, []);

  // The new order alarm, looping until it is answered.
  useEffect(() => {
    const audio = context.current;
    if (!ringing || !soundOn || !audioReady || !audio) return;
    const burst = () =>
      playNewOrderAlarm(audio, (source) => {
        sounding.current.add(source);
        source.onended = () => sounding.current.delete(source);
      });
    burst();
    const timer = window.setInterval(burst, NEW_ORDER_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
      silence();
    };
  }, [ringing, soundOn, audioReady, silence]);

  function answer() {
    setBanner([]);
    setUnanswered([]);
    silence();
  }

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    writeSoundPreference(next);
    if (next && context.current?.state === "running") {
      playPhrase(context.current, COUNTER_NOTICE, "notice");
    }
  }

  const soundLabel = !soundOn
    ? "Sound off"
    : audioReady
      ? "Sound on"
      : "Tap anywhere to allow sound";

  return (
    <>
      <Button type="button" tone="dark" variant="secondary" onClick={toggleSound} aria-pressed={soundOn}>
        {soundLabel}
      </Button>
      {banner.length > 0 ? <AlertTicket banner={banner} ringing={ringing} onAnswer={answer} /> : null}
    </>
  );
}

/**
 * The banner, drawn as the ticket that just came off the rail.
 *
 * It replaced a yellow box of one-line sentences with a generic drop shadow,
 * which read as a browser notification that had wandered onto the board. The
 * board is glanced at from across a counter, so what this has to do is say
 * which kind of news it is from three metres, and then put the one thing
 * somebody will say out loud, the pickup code, in the largest type on it.
 *
 * - The heat rule along the top edge is the navbar's own brand edge, so the
 *   ticket reads as this restaurant's chrome rather than as the browser's.
 * - The head band carries the kind of news in its colour as well as its words.
 *   Orange is work: a new order nobody has started. Signage yellow is news: a
 *   customer on the way or at the counter. Ink type on both, at 5.4:1 on the
 *   orange and far above that on the yellow.
 * - The body is charcoal with a 40% bone edge, the delete confirmation's
 *   material, for the same measured reason: charcoal on the ink board is
 *   1.1:1, and a shadow on a near-black page darkens nothing.
 * - The bell swings while the alarm is sounding and is still when it is not,
 *   so a muted tablet still shows which state it is in.
 */
function AlertTicket({
  banner,
  ringing,
  onAnswer,
}: {
  banner: BoardAlert[];
  ringing: boolean;
  onAnswer: () => void;
}) {
  const newCount = banner.filter((alert) => alert.kind === "new").length;
  const isWork = newCount > 0;
  const heading = isWork
    ? newCount === 1
      ? "New order"
      : `${newCount} new orders`
    : banner.some((alert) => alert.kind === "arrived")
      ? "Customer at the counter"
      : "Customer on the way";

  return (
    <div
      role="alert"
      className="board-ticket border-nybb-bone/40 bg-nybb-charcoal text-nybb-bone fixed inset-x-4 top-4 z-50 mx-auto max-w-lg overflow-hidden rounded-md border"
    >
      <HeatRule className="h-1.5" />
      <div
        className={cn(
          "text-nybb-ink flex items-center gap-3 px-4 py-3 sm:px-5",
          isWork ? "bg-nybb-orange" : "bg-nybb-yellow",
        )}
      >
        <BellRing
          aria-hidden
          data-ringing={ringing}
          className="board-ticket__bell size-7 shrink-0"
          strokeWidth={2.25}
        />
        <p className="font-display min-w-0 flex-1 truncate text-[1.75rem] leading-none tracking-[0.02em] uppercase">
          {heading}
        </p>
      </div>

      <ul className="divide-nybb-bone/15 divide-y px-4 sm:px-5">
        {banner.map((alert) => (
          <li key={alert.key} className="py-3.5">
            {alert.kind === "new" ? <NewOrderLine alert={alert} /> : <CounterLine alert={alert} />}
          </li>
        ))}
      </ul>

      <div className="px-4 pt-1 pb-4 sm:px-5 sm:pb-5">
        <Button type="button" tone="dark" size="lg" className="min-h-14 w-full text-base" onClick={onAnswer}>
          {ringing ? "Got it, stop the alarm" : "Got it"}
        </Button>
      </div>
    </div>
  );
}

function NewOrderLine({ alert }: { alert: BoardAlert }) {
  const ticket = alert.ticket;
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <span className="sr-only">New order </span>
          <span className="font-mono text-[2.5rem] leading-none font-bold tracking-tight">{alert.shortCode}</span>
          {ticket?.isTest ? (
            <span className="border-nybb-yellow/60 text-nybb-yellow rounded border px-1.5 py-0.5 text-xs font-bold tracking-wider uppercase">
              Test
            </span>
          ) : null}
        </p>
        {ticket ? (
          <p className="text-nybb-bone/70 mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
            <span className="text-nybb-bone min-w-0 truncate">{ticket.customerName}</span>
            <span className="font-mono">
              {ticket.itemCount} {ticket.itemCount === 1 ? "item" : "items"}
            </span>
            <span className="font-mono">{ticket.total}</span>
          </p>
        ) : null}
      </div>
      {ticket?.pickupAt ? (
        <p className="shrink-0 text-right">
          <span className="text-nybb-bone/60 block text-xs tracking-[0.14em] uppercase">Pickup</span>
          <span className="text-nybb-orange mt-1 block font-mono text-xl font-bold">{ticket.pickupAt}</span>
        </p>
      ) : null}
    </div>
  );
}

function CounterLine({ alert }: { alert: BoardAlert }) {
  const arrived = alert.kind === "arrived";
  const Icon = arrived ? Store : Footprints;
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-nybb-yellow flex items-center gap-2 text-sm font-semibold">
        <Icon aria-hidden className="size-4 shrink-0" />
        {arrived ? "Customer is here for" : "Customer is on the way for"}
      </p>
      <span className="font-mono text-2xl leading-none font-bold tracking-tight">{alert.shortCode}</span>
    </div>
  );
}
