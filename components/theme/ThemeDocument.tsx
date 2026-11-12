"use client";

import { useEffect } from "react";
import { THEME_PRESETS, type ThemeSetting } from "@/lib/themes/presets";
import { ThemeEffects } from "./ThemeEffects";

/**
 * The parts of a theme that live outside the page wrapper.
 *
 * While mounted it puts data-theme on <html> and the theme's colour in
 * <meta name="theme-color">, the phone's address bar. On unmount it puts both
 * back, so following a link from the storefront into the Workspace leaves no
 * trace of the season behind. The colours themselves do not depend on this:
 * app/themes.css applies them with :root:has(.theme-root[data-theme]) from
 * the first paint.
 */
export function ThemeDocument({ theme }: { theme: ThemeSetting }) {
  const preset = THEME_PRESETS[theme.id];

  useEffect(() => {
    if (theme.id === "default") return;
    const root = document.documentElement;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousColor = meta?.getAttribute("content") ?? null;
    root.dataset.theme = theme.id;
    meta?.setAttribute("content", preset.chrome);
    return () => {
      delete root.dataset.theme;
      if (meta && previousColor !== null) meta.setAttribute("content", previousColor);
    };
  }, [theme.id, preset.chrome]);

  if (theme.id === "default" || !theme.effects) return null;
  return <ThemeEffects kind={preset.effect} />;
}
