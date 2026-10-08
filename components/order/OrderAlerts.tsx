"use client";

import { BellRing, CheckCircle2, LoaderCircle, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { acknowledgeReadyOrder } from "@/app/actions/order-ready-acknowledgement";
import { Button } from "@/components/ui/Button";
import {
  ALARM_INTERVAL_MS,
  COLLECTED_CHIME,
  COOKING_CHIME,
  READY_ALARM,
  STOPPED_CHIME,
  audioContextConstructor,
  playPhrase,
} from "@/lib/orders/alert-sounds";
import {
  ringKey,
  shouldRingReady,
  soundStage,
  stageToAnnounce,
  type OrderSoundStage,
} from "@/lib/orders/order-alerts";
import { READY_RING_COPY, isTerminalStatus } from "@/lib/orders/status";
import type { OrderStatus } from "@/lib/orders/types";
import { CustomerArrivalButton } from "./CustomerArrivalButton";

/**
 * The tracking page's sounds, and the ready alarm's off switch.
 *
 * The page already redraws itself on every change (OrderTrackingLiveRefresh),
 * so this only has to compare what it is given now with what it last heard.
 * Every step after "received" plays once: cooking, collected, and a refusal or
 * cancellation. Ready is different. It is the one step that needs the
 * customer to move, so it loops, loud, until they tap "I'm coming", and it
 * starts again whenever the counter rings them from the board.
 *
 * WHAT THE PHONE REMEMBERS. The last step it announced, per order, in
 * localStorage, so a reload or the 20 second refresh never replays a chime.
 * The first time a phone sees an order it learns the step without a sound,
 * because whatever it says is already on the screen.
 *
 * WHY THERE IS A SOUND BUTTON. Browsers refuse to play audio until the page
 * has been touched. The first tap anywhere unlocks it, and the button says so,
 * rather than leaving an alarm that silently never sounds.
 *
 * Push stays the channel for a closed browser. This is the open page in a
 * hand or on a car seat, which is where most customers wait.
 */

const SOUND_KEY = "nybb-order-sound";
const stageKey = (shortCode: string) => `nybb-order-stage:${shortCode}`;

const CHIMES: Partial<Record<OrderSoundStage, Parameters<typeof playPhrase>[1]>> = {
  cooking: COOKING_CHIME,
  collected: COLLECTED_CHIME,
  stopped: STOPPED_CHIME,
};

function readStage(shortCode: string): OrderSoundStage | null {
  try {
    const value = window.localStorage.getItem(stageKey(shortCode));
    return value === "received" ||
      value === "cooking" ||
      value === "ready" ||
      value === "collected" ||
      value === "stopped"
      ? value
      : null;
  } catch {
    return null;
  }
}

function writeStage(shortCode: string, stage: OrderSoundStage): void {
  try {
    window.localStorage.setItem(stageKey(shortCode), stage);
  } catch {
    // Private mode. The worst case is a missed or repeated chime.
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

export function OrderAlerts({
  shortCode,
  trackingToken,
  status,
  readyAcknowledgedAt,
  readyRingAt,
  customerArrivedAt,
}: {
  shortCode: string;
  trackingToken: string | null;
  status: OrderStatus;
  readyAcknowledgedAt: string | null;
  readyRingAt: string | null;
  customerArrivedAt: string | null;
}) {
  const [soundOn, setSoundOn] = useState(true);
  const [audioReady, setAudioReady] = useState(false);
  // The ring this phone answered, so the alarm stops on the tap rather than a
  // round trip later. A new ring from the counter has a new key.
  const [answered, setAnswered] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const context = useRef<AudioContext | null>(null);
  const sounding = useRef<Set<OscillatorNode>>(new Set());

  const order = { status, readyAcknowledgedAt, readyRingAt, customerArrivedAt };
  const currentRing = ringKey(order);
  const ringing = shouldRingReady(order) && answered !== currentRing;
  const ready = status === "ready";

  // The preference, and the unlock. A context made before the first touch
  // starts suspended, so it is made, or resumed, on every touch until it runs.
  useEffect(() => {
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
    // Some browsers allow it straight away for a site the person has used.
    unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.clearTimeout(read);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const soundOnRef = useRef(soundOn);
  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  const silence = useCallback(() => {
    for (const osc of sounding.current) {
      try {
        osc.stop();
      } catch {
        // Already stopped.
      }
    }
    sounding.current.clear();
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(0);
  }, []);

  // One-shot chimes for every step after "received".
  useEffect(() => {
    const next = soundStage(status);
    const announce = stageToAnnounce(readStage(shortCode), next);
    writeStage(shortCode, next);
    if (!announce || announce === "ready") return;
    const notes = CHIMES[announce];
    const audio = context.current;
    if (notes && soundOnRef.current && audio?.state === "running") {
      playPhrase(audio, notes, "notice");
    }
  }, [shortCode, status]);

  // The ready alarm, looping until it is answered.
  useEffect(() => {
    const audio = context.current;
    if (!ringing || !soundOn || !audioReady || !audio) return;
    const burst = () => {
      playPhrase(audio, READY_ALARM, "alarm", (osc) => {
        sounding.current.add(osc);
        osc.onended = () => sounding.current.delete(osc);
      });
      if ("vibrate" in navigator) navigator.vibrate([300, 120, 300, 120, 500]);
    };
    burst();
    const timer = window.setInterval(burst, ALARM_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
      silence();
    };
  }, [ringing, soundOn, audioReady, silence]);

  function imComing() {
    setAnswered(currentRing);
    setError(null);
    silence();
    startTransition(async () => {
      const result = await acknowledgeReadyOrder({ shortCode, trackingToken });
      // The alarm stays off either way: the customer has heard it, and making
      // it ring again because a network request failed would punish them for
      // the signal. What they need to know is that the counter may not have
      // been told.
      if (!result.ok) setError(result.error);
    });
  }

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    writeSoundPreference(next);
    if (next && context.current?.state === "running") {
      playPhrase(context.current, COOKING_CHIME, "notice");
    }
  }

  const terminal = isTerminalStatus(status);
  const coming = ready && !ringing && (readyAcknowledgedAt !== null || answered === currentRing);

  return (
    <>
      {ringing ? (
        <div
          role="alert"
          className="bg-nybb-yellow text-nybb-ink mt-5 rounded-md p-4 shadow-lg"
        >
          <div className="flex items-start gap-3">
            <BellRing aria-hidden className="mt-0.5 size-6 shrink-0" />
            <div className="min-w-0">
              <p className="font-display text-lg leading-tight">
                {readyRingAt ? READY_RING_COPY.title : "Your order is ready"}
              </p>
              <p className="mt-1 text-sm leading-relaxed">
                Tap below to stop the alarm and let the counter know you are on
                your way.
              </p>
            </div>
          </div>
          <Button tone="light" block className="mt-4" onClick={imComing}>
            <CheckCircle2 aria-hidden className="size-5" />
            I&apos;m coming
          </Button>
        </div>
      ) : null}

      {coming && customerArrivedAt === null ? (
        <>
          <p
            role="status"
            className="border-nybb-bone/20 text-nybb-bone/80 mt-5 flex items-center gap-2 rounded-md border px-4 py-3 text-sm leading-relaxed"
          >
            {pending ? (
              <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />
            ) : (
              <CheckCircle2 aria-hidden className="text-nybb-orange size-4 shrink-0" />
            )}
            The counter knows you are on your way.
          </p>
          <CustomerArrivalButton shortCode={shortCode} trackingToken={trackingToken} />
        </>
      ) : null}

      {ready && !ringing && customerArrivedAt !== null ? (
        <p className="bg-nybb-yellow text-nybb-ink mt-5 rounded-md px-4 py-3 text-sm leading-relaxed">
          The counter knows you are here. Have your pickup code ready.
        </p>
      ) : null}

      {error ? (
        <div className="bg-nybb-red-deep/20 mt-3 rounded p-3 text-sm" role="alert">
          <p>{error}</p>
          <button
            type="button"
            onClick={imComing}
            className="mt-2 min-h-11 font-semibold underline underline-offset-4"
          >
            Try again
          </button>
        </div>
      ) : null}

      {terminal ? null : (
        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button
            tone="dark"
            variant="ghost"
            onClick={toggleSound}
            aria-pressed={soundOn}
          >
            {soundOn ? (
              <Volume2 aria-hidden className="size-4" />
            ) : (
              <VolumeX aria-hidden className="size-4" />
            )}
            {!soundOn ? "Sound off" : audioReady ? "Sound on" : "Tap to allow sound"}
          </Button>
          <p className="text-nybb-bone/60 text-sm leading-relaxed">
            {soundOn
              ? "Keep this page open. It plays a sound at each step and rings when your order is ready."
              : "Sound is off. The page still updates on its own."}
          </p>
        </div>
      )}
    </>
  );
}
