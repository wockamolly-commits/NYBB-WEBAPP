"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  ALARM_INTERVAL_MS,
  COUNTER_NOTICE,
  NEW_ORDER_ALARM,
  audioContextConstructor,
  playPhrase,
} from "@/lib/orders/alert-sounds";

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
  const sounding = useRef<Set<OscillatorNode>>(new Set());

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
      playPhrase(audio, NEW_ORDER_ALARM, "alarm", (osc) => {
        sounding.current.add(osc);
        osc.onended = () => sounding.current.delete(osc);
      });
    burst();
    const timer = window.setInterval(burst, ALARM_INTERVAL_MS);
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
      {banner.length > 0 ? (
        <div
          role="alert"
          className="bg-nybb-yellow text-nybb-charcoal fixed inset-x-4 top-4 z-50 mx-auto max-w-xl rounded-md p-4 shadow-lg"
        >
          <ul className="space-y-1">
            {banner.map((alert) => (
              <li key={alert.key} className="font-display text-lg">
                {alert.kind === "arrived"
                  ? `Customer is here for ${alert.shortCode}`
                  : alert.kind === "coming"
                    ? `Customer is on the way for ${alert.shortCode}`
                    : `New order ${alert.shortCode}`}
              </li>
            ))}
          </ul>
          <Button type="button" tone="light" className="mt-3" onClick={answer}>
            {ringing ? "Got it, stop the alarm" : "Got it"}
          </Button>
        </div>
      ) : null}
    </>
  );
}
