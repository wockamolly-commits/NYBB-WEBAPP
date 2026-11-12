"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { EffectKind } from "@/lib/themes/presets";
import { cn } from "@/lib/utils";
import { startEngine } from "./engine";

const REDUCE = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Reduced motion, or a connection asking us to save data. Read reactively. */
function prefersStill(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return window.matchMedia(REDUCE).matches || Boolean(connection?.saveData);
}

/**
 * The seasonal canvas. `page` covers the viewport under the header and the
 * floating cards; `box` fills its parent, for the Workspace's live sample.
 *
 * Decoration only: aria-hidden, no pointer events, never focusable. The engine
 * listens on the window (or the host box) instead, so the canvas never
 * swallows a click meant for a button under it.
 */
export function ThemeEffects({ kind, scope = "page" }: { kind: EffectKind; scope?: "page" | "box" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // The server cannot know; it renders as if motion is fine and the client
  // corrects in the first commit, before the engine starts.
  const still = useSyncExternalStore(subscribe, prefersStill, () => false);

  useEffect(() => {
    if (!ref.current || kind === "none") return;
    const engine = startEngine({ canvas: ref.current, kind, scope, still });
    return () => engine?.destroy();
  }, [kind, scope, still]);

  if (kind === "none") return null;
  return <canvas ref={ref} aria-hidden="true" className={cn("theme-fx", `theme-fx--${scope}`)} />;
}
