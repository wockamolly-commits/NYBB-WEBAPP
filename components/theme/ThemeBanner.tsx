"use client";

import { X } from "lucide-react";
import { useCallback, useState, useSyncExternalStore } from "react";
import { THEME_PRESETS, bannerText, type ThemeSetting } from "@/lib/themes/presets";
import { ThemeEmblem } from "./ThemeEmblem";

const EVENT = "nybb:theme-banner";

/**
 * The key includes the theme, the text's length and its first characters, so
 * a dismissal covers this message only. Change the words and it shows again.
 */
function dismissKey(id: string, text: string): string {
  return `nybb:theme-banner:${id}:${text.length}:${text.slice(0, 24)}`;
}

function readDismissed(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    // Private mode, or storage blocked. The banner simply shows.
    return false;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * The seasonal notice above the header.
 *
 * Dismissed for the browser session, not forever: a season lasts weeks and a
 * customer who closed it on Monday should not be shouted at again on every
 * page, but nor should a new message be swallowed by an old dismissal.
 *
 * The dismissal is read through useSyncExternalStore with a server snapshot of
 * "not dismissed", so the server and the first client render agree and there
 * is no hydration mismatch; a dismissed banner disappears in the commit after.
 * A custom window event keeps every instance on the page in step.
 *
 * `preview` ignores any earlier dismissal, for the Workspace's preview routes.
 */
export function ThemeBanner({ theme, preview = false }: { theme: ThemeSetting; preview?: boolean }) {
  const text = bannerText(theme);
  const key = text ? dismissKey(theme.id, text) : "";

  const dismissed = useSyncExternalStore(
    subscribe,
    () => (key && !preview ? readDismissed(key) : false),
    () => false,
  );

  // In a preview the stored dismissal is ignored, so closing has to be
  // remembered here instead.
  const [closedHere, setClosedHere] = useState(false);

  const close = useCallback(() => {
    setClosedHere(true);
    try {
      window.sessionStorage.setItem(key, "1");
    } catch {
      // Nothing to remember it in; it closes for this render only.
    }
    window.dispatchEvent(new Event(EVENT));
  }, [key]);

  if (!text || dismissed || closedHere) return null;

  const name = THEME_PRESETS[theme.id].name;

  return (
    <div role="region" aria-label={`${name} notice`} className="theme-banner">
      <div className="theme-banner__inner">
        <ThemeEmblem id={theme.id} className="theme-banner__emblem size-6" />
        <p className="theme-banner__text">{text}</p>
        <ThemeEmblem id={theme.id} className="theme-banner__emblem theme-banner__emblem--end size-6" />
        <button type="button" onClick={close} aria-label="Close this notice" className="theme-banner__close">
          <X aria-hidden className="size-4" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
