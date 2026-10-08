"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

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
 * WHY A BUTTON FOR THE SOUND. Browsers refuse to play audio until the page has
 * been touched. The tablet is touched constantly, so the first tap anywhere
 * unlocks it, and the button is there so the state is visible rather than a
 * chime that silently never happens.
 */

export type BoardAlert = {
  /** Stable per event: "new:<order id>" or "arrived:<order id>". */
  key: string;
  shortCode: string;
  kind: "new" | "arrived";
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

/**
 * Two short rising tones for a new order, three for a customer at the counter.
 * Made in the browser rather than shipped as a file, so there is nothing to
 * load and nothing to go missing.
 */
function chime(context: AudioContext, kind: BoardAlert["kind"]): void {
  const notes = kind === "arrived" ? [660, 880, 660] : [660, 990];
  const start = context.currentTime + 0.02;
  notes.forEach((frequency, index) => {
    const at = start + index * 0.22;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.5, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.21);
  });
}

export function BoardAlerts({ alerts }: { alerts: BoardAlert[] }) {
  const [banner, setBanner] = useState<BoardAlert[]>([]);
  const [soundOn, setSoundOn] = useState(true);
  const [audioReady, setAudioReady] = useState(false);
  const context = useRef<AudioContext | null>(null);

  // The preference and the audio unlock. The context is made on the first
  // touch, because one made before it starts suspended in every browser.
  useEffect(() => {
    // Read after mount rather than in useState, so the server render and the
    // first client render agree on the label.
    const read = window.setTimeout(() => setSoundOn(readSoundPreference()), 0);
    const unlock = () => {
      if (!context.current) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        context.current = new Ctor();
      }
      void context.current.resume().then(() => setAudioReady(context.current?.state === "running"));
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
    if (soundOnRef.current && audio && audio.state === "running") {
      // One chime per redraw, of the more urgent kind. Two orders landing in
      // the same refresh are one event to the person at the counter.
      chime(audio, fresh.some((alert) => alert.kind === "arrived") ? "arrived" : "new");
    }
    // The storage above is the external system; the banner follows it on the
    // next tick rather than inside this effect's own render pass.
    const show = window.setTimeout(() => {
      setBanner((current) => [...fresh, ...current].slice(0, 5));
    }, 0);
    return () => window.clearTimeout(show);
  }, [alerts]);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    writeSoundPreference(next);
    if (next && context.current?.state === "running") chime(context.current, "new");
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
                  : `New order ${alert.shortCode}`}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setBanner([])}
            className="mt-3 text-sm font-semibold underline underline-offset-4"
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </>
  );
}
