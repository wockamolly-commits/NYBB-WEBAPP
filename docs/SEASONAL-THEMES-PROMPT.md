# Prompt: Build "Seasonal Themes" for the New York Buffalo Brad's website

You are adding a **Seasonal Themes** feature to the New York Buffalo Brad's website. It is modelled on a working implementation in a sister project (Wingers Unlimited: Next.js 16 App Router, React 19, Supabase, Zod 4, plain CSS design tokens). Rebuild the same feature here, adapted to this codebase's brand, stack and conventions. Do not copy the other brand's names, copy, logo geometry or colours.

---

## 0. Before you write any code

1. Explore this repo and report back briefly:
   - Framework and router, styling approach (CSS variables? Tailwind tokens? CSS-in-JS?), and where the brand colour tokens are defined.
   - Whether there is an admin panel, how auth and per-user permissions work, and how content is stored and published (database, CMS, flat files).
   - How public pages are cached and revalidated.
   - The shared layout that wraps every public page (header, footer, main), the header logo element, and the big full-width colour sections that could carry a background pattern.
   - Any hard-coded colour literals (`#hex`, `rgb()`) in component styles that bypass the tokens.
2. If there is no admin panel or no database, stop and ask me how the active theme should be stored and switched (env var, config file, or a small admin page) before you go on.
3. Ask me which seasonal themes to ship. The reference set is below. Some are regional (Sinulog is a Cebu festival), so the list should fit this business's location and customers.

---

## 1. What the feature is

An admin picks one theme for the whole public website from a gallery. The theme goes live on every public page right away. A theme changes **only how the site looks, never what it says**: menu, prices, page copy and layout stay the same.

A theme is made of:

| Layer | What it does |
|---|---|
| **Palette** | Overrides the brand colour tokens, so every component re-tints with no per-component changes. |
| **Background pattern** | A tiling SVG motif on the large colour panels. It comes in two variants: light-on-dark for dark panels and ink-on-light for light/accent panels. |
| **Header ornament ("garland")** | A strip that repeats horizontally and hangs just under the header (bunting, string lights, lanterns). It gently sways, or twinkles for Christmas lights. |
| **Logo topper** | A small accessory on the logo. It is either a *hat* worn on the logo's rim (tilted, tips gently) or an object that *floats beside* the logo in a clear corner (drifts, or swings if it hangs from a cord). |
| **Banner (optional)** | A dismissible strip above the header with a seasonal message. Admins can write their own text or use the preset's suggested text. |
| **Animated effect (optional)** | One full-viewport canvas particle layer (falling snow, rising hearts, fireworks, and so on) with a click/tap burst and occasional "hero" sprites (Santa's sleigh, a dragon, a dance lion, bats, paper planes). |
| **Special figures** | Optional extra art per theme, for example a waving elf standing on the footer. |

There is also a **default** theme, the everyday look. With it there are no overrides, decorations, banner or animation.

---

## 2. Theme presets (single source of truth)

Create one module (e.g. `lib/themes/presets.ts`) that both the public site and the admin import:

```ts
export const THEME_IDS = ["default", "valentines", "graduation", "summer", "back-to-school",
  "halloween", "christmas", "sinulog", "chinese-new-year", "new-year"] as const; // adjust per step 0.3
export type ThemeId = (typeof THEME_IDS)[number];
export type EffectKind = "none" | "hearts" | "graduation" | "summer" | "school" | "halloween"
  | "snow" | "sinulog" | "lunar" | "fireworks";

export type ThemePreset = {
  id: ThemeId;
  name: string;          // "Christmas"
  season: string;        // "September to December", a hint shown in the admin
  blurb: string;         // one line for the admin card describing the look
  effectLabel: string;   // plain-English description of the animation
  effect: EffectKind;
  banner: string;        // suggested banner text (in this brand's voice)
  swatch: [primary: string, accent: string, light: string, highlight: string]; // admin card dots
  chrome: string;        // <meta name="theme-color"> value (mobile address bar)
};

export const BANNER_MAX = 140;
export const themeSettingSchema = z.object({
  id: z.enum(THEME_IDS),
  banner: z.object({ show: z.boolean(), text: z.string().trim().max(BANNER_MAX) }),
  effects: z.boolean(),
});
export type ThemeSetting = z.infer<typeof themeSettingSchema>;
export const DEFAULT_THEME: ThemeSetting = { id: "default", banner: { show: false, text: "" }, effects: true };

/** Defensive read: anything unknown or malformed falls back to DEFAULT_THEME. */
export function parseTheme(raw: unknown): ThemeSetting;
/** Banner text to show, or null: none for default or when hidden; empty custom text uses the preset's text. */
export function bannerText(t: ThemeSetting): string | null;
```

Reference presets. Write the banner copy and blurbs again in this brand's voice. Map the palette roles to this site's own token names.

| id | Season hint | Look | Effect |
|---|---|---|---|
| valentines | Early–mid Feb | Wine `#7a1530` + blush `#ffc2d1`, light `#fff0f3`; scattered-heart print; heart garland | Hearts rise and sway; click releases a burst of hearts |
| graduation | Mar–Jun | Gown black `#1c1c1e` + diploma gold `#f2c94c`; mortarboard/scroll/star print; pennant bunting; mortarboard hat topper | Gold confetti and the odd mortarboard fall; click tosses caps |
| summer | Mar–May (tropical) or Jun–Aug | Ocean teal `#0b4f6c` + sun `#ffd23f` + sand `#fff4dc`; wave-and-sun print; scalloped wave edge; sun topper | Sunlit bubbles rise and shimmer; click pops a splash |
| back-to-school | Jun–Aug / Aug–Sep | Denim `#1d4e89` + bus yellow `#ffc72c`; chalk-doodle print; ruler edge; apple topper | Chalk letters/numbers/pencils drift down; paper planes glide across now and then |
| halloween | Late Oct | Midnight purple `#2a1440` + pumpkin `#ff8c1a`; cobweb/bat/moon print; witch-hat topper | Leaves tumble, bats flit past; click scatters leaves |
| christmas | Sep–Dec (PH) / Nov–Dec (US) | Holly red `#8c1c24` + warm gold `#ffe08a` + snow `#fbf6ec`, evergreen `#1f6b45`; snowflake print; twinkling string lights; Santa-hat topper; waving elf on the footer | Snow falls and drifts away from the pointer; every 22–34 s Santa's sleigh and reindeer fly across the upper sky trailing gold stardust; click shakes loose a flurry |
| sinulog *(regional)* | Jan, 3rd Sunday | Sunset red-orange `#9a3412` + festival yellow `#ffd60a`; woven banig print; banderitas bunting with a Santo Niño medallion | Festival confetti and ribbons; click bursts confetti |
| chinese-new-year | Late Jan–Feb | Cinnabar `#c0141c` + lucky gold `#ffcf3f`; cloud/coin/plum-blossom print; lantern + firecracker garland; hanging lantern topper (swings) | Blossoms and coins fall, lanterns float up; a dragon chasing its pearl and a dance lion take turns crossing; click sets off firecrackers |
| new-year | Late Dec–early Jan | Midnight blue `#0b1638` + champagne gold `#f5d06f`; starburst/confetti print; gold zigzag streamer; party-hat topper | Fireworks bloom in the background with fading trails; stars twinkle in place; click launches a firework |

For a US/New York audience, consider swapping regional themes for local ones, e.g. **Fourth of July**, **Thanksgiving**, **St. Patrick's Day** or **Game Day / Super Bowl** (a big one for a wings brand). Ask me first (step 0.3).

**Palette roles to define per theme.** Map each of these to this site's existing tokens: primary dark (header/footer panels), primary mid, primary deepest (shadows, banner background), gradient-foot, accent (buttons, highlights), accent 2, light surface, light surface deep, plus any secondary tokens the site uses (secondary, earthy brown, alert red, sky, body ink). Keep the default theme's contrast rules: whatever text colour sits on the primary must still pass WCAG AA on every theme's primary, and primary-on-accent likewise. Check each pair.

---

## 3. Storage, permissions, caching

Reuse the existing publish model if there is one. In the reference, the active theme is **the newest row in a `publications` table with `scope = 'theme'`** and `data = {id, banner, effects}`. That gives it the existing public read path, cache tag and audit trail for free.

- **No draft step.** Applying a theme goes live at once, because it changes look, not content. The safety net is the preview (section 7), not a draft.
- **Separate permission.** Add a `themes` permission. Content publishers must **not** be able to switch the theme, and theme managers must not be able to publish content. Owners/super-admins have it implicitly.
- **Enforce at every layer:**
  - Server action calls `assertPerm("themes")` and validates input with `themeSettingSchema.parse`.
  - Database: with Supabase/Postgres, add a migration that extends the scope check constraint and the permissions check constraint. Split the insert RLS policy so `scope = 'theme'` requires `has_perm('themes')`, `published_by = auth.uid()`, `jsonb_typeof(data) = 'object'` and `data ? 'id'`. Change the existing publish policy to `scope <> 'theme' AND has_perm('publish')`.
- **Public read:** `getTheme()` wrapped in the framework's data cache (`unstable_cache` / `"use cache"`) with a `theme` tag. It returns `DEFAULT_THEME` when the backend isn't configured and always runs the stored value through `parseTheme`. After a write, expire the tag (`updateTag`/`revalidateTag`) and revalidate the root layout so every page picks it up.
- **Audit:** theme changes appear in change history with a readable label ("Theme: Christmas", "Theme: default restored") and a link back to the themes admin page.

---

## 4. Styling architecture (the important part)

**Principle: a theme re-tints tokens; it never forks components.**

1. Wrap all public-page chrome in a single wrapper element: `<div className="theme-root" data-theme={id}>` with `display: contents`, so it never affects layout.
2. Generate one stylesheet (e.g. `app/themes.css`, imported once in the root layout) with a block per theme:
   ```css
   [data-theme="christmas"] {
     --primary: #8c1c24; --accent: #ffe08a; /* …every palette role… */
     --print-shadow: 6px 6px 0 color-mix(in srgb, var(--primary-deep) 55%, transparent);
     --theme-pattern: url("data:image/svg+xml;utf8,…");       --theme-pattern-size: 120px 120px;
     --theme-pattern-light: url("data:image/svg+xml;utf8,…"); --theme-pattern-light-size: 120px 120px;
     --theme-garland: url("…"); --theme-garland-size: 176px 26px; --theme-garland-h: 26px;
     --theme-topper: url("…"); --topper-x: …%; --topper-y: …%; --topper-w: …%;
     --topper-ratio: 44 / 32; --topper-ax: 35%; --topper-ay: 86%; --topper-rot: 22deg; --topper-motion: theme-tip;
   }
   ```
3. **Audit the existing CSS:** wherever a brand colour is a literal (`rgb(7 71 41 / .4)` and the like), replace it with `color-mix(in srgb, var(--token) X%, transparent)` so themes reach it. Add a note to the style guide: "keep new colours on tokens".
4. **Shared rules**, all scoped to `.theme-root:not([data-theme="default"])`:
   - Dark panels (header, footer, dark feature sections): `background-image: var(--theme-pattern)`. Where a panel already has a gradient, layer the pattern over it.
   - Light/accent panels and heroes: `var(--theme-pattern-light)`. Pattern opacity is about 7.5% white on dark and about 10% primary on light. Keep it subtle.
   - `.site-header::after`: the garland, absolutely positioned at `top: 100%`, `repeat-x`, `pointer-events: none`.
   - `.site-header__logo::after`: the topper, positioned **in percentages of the logo box** so it scales with the logo at every breakpoint; `transform: translate(-ax, -ay) rotate(rot)` around its anchor point. Add a white "paper-cut" outline (four 1.5px `drop-shadow`s plus a soft offset shadow) so dark toppers stay readable on a dark header.
   - `html[data-theme]:not([data-theme="default"]) body { background-color: var(--primary) }` so overscroll matches.
   - Under `@media (prefers-reduced-motion: no-preference)` only: garlands `theme-sway` (6s skewX ±1.2deg, alternate); Christmas lights `theme-twinkle` (`steps(2)` brightness/saturate/glow); toppers use `var(--topper-motion)`, one of `theme-tip` (hats rock on their base), `theme-float` (drift up and down) or `theme-swing` (pivot from the top). Sacred or revered figures stay still.
   - `@media print`: hide all theme decoration, banner and canvas.

### 4a. Generator script

Don't hand-write the data URIs. Write `scripts/build-themes-css.mjs` (npm script `themes:css`) that:
- Holds readable SVG source for every pattern, garland and topper, and converts each to a CSS `url("data:image/svg+xml;utf8,…")`: single quotes inside, `#` → `%23`, whitespace collapsed.
- Draws each pattern twice: `PATTERNS[id](color, opacity)` returns `[tileSize, uri]`.
- **Topper placement is computed, not eyeballed.** Measure the logo image once (aspect ratio, and for a round badge the circle centre and radius as fractions of the width). For `kind: "hat"`, place the art's anchor on the rim at a set angle from 12 o'clock (≈40°, sunk slightly into the rim) and tilt it about 22°. For `kind: "beside"`, fit the art's tight bounding box into one clear corner rectangle so every theme's object has the same footprint. Each topper declares `box` (tight art bounds), `anchor` (pivot as fractions) and `size` or `fit`. **Redo the measurements for this site's logo**; if the logo isn't round, define "hat" against its top edge instead.
- Also writes full-colour standalone SVGs to `public/assets/images/themes/` (e.g. `elf.svg`, `lantern.svg`) for `<img>` use and footer figures.
- Writes a "GENERATED – edit the script, not this file" header into the output CSS.

All artwork (Santa, reindeer, elf, dragon, lion, lanterns, religious figures) must be **original drawings**. Don't copy clip art or trademarked characters.

### 4b. Christmas footer elf (example of a "special figure")

`.theme-root[data-theme="christmas"] .site-footer::before` shows `elf.svg`, standing on the footer's top edge or cloud divider. It lines up with the content container's left edge (`left: max(var(--gutter), calc(50% - var(--container)/2 + var(--gutter)))`), sizes from the divider height with `clamp()`, uses `pointer-events: none`, and sits bottom-left so it never collides with a bottom-right floating button. The wave animation lives **inside the SVG's own `<style>`** (one arm rotates now and then, the body bobs) and switches off under `prefers-reduced-motion`.

---

## 5. Components

### `ThemeDocument` (client)
While mounted it sets `document.documentElement.dataset.theme` (removed for default) and updates `<meta name="theme-color">` to the preset's `chrome`. On unmount it restores both, so navigating into the admin panel leaves no trace. It renders `<ThemeEffects kind={preset.effect} />` only when `id !== "default"` and `effects` is on.

### `ThemeBanner` (client)
- Renders `bannerText(theme)` or nothing. It has `role="region"` and `aria-label="<Theme name> notice"`, a theme emblem on each side (the right one is hidden under 640px, where the text left-aligns and shrinks), and a 36px close button with `aria-label="Close this notice"`.
- Dismissal is stored in `sessionStorage` under a key that includes theme id + text length + a text prefix, so **new text shows again**. Read it through `useSyncExternalStore` (server snapshot `false`) plus a custom window event so all instances update without a hydration mismatch. Wrap storage access in try/catch for private mode.
- A `preview` prop ignores earlier dismissals.
- Styles: background is the dark pattern over primary-deep, white bold text with `text-wrap: balance`, accent bottom border. It slides in (0.5s) and the emblems bob, motion-gated.

### `ThemeEmblem`
A small decorative 32×32 SVG per theme (heart, mortarboard, sun, apple, pumpkin, tree, starburst…) drawn in `currentColor`, with an optional `--theme-emblem-cut` colour for cut-outs. Themes with a full-colour figure render an `<img>` from `public/assets/images/themes/` instead. It's used in the banner and the admin cards and is always `aria-hidden`.

### `ThemeEffects` (client)
`<canvas className="theme-fx theme-fx--page|box" aria-hidden="true">`. It starts the engine in an effect and destroys it on cleanup. It passes `still: true` when `prefers-reduced-motion: reduce` **or** `navigator.connection.saveData` is set, read reactively through `useSyncExternalStore` on the media query. `page` scope is `position: fixed; inset: 0; z-index` above page art but **below the header, floating buttons and skip link**. `box` scope fills its parent (used by the admin's live sample).

### Wiring
The shared public layout loads `getSite()` and `getTheme()` in parallel and passes the theme to the chrome wrapper. The chrome renders: skip link → (optional preview notice) → `ThemeBanner` → header → `<main>` → footer/floating UI → `ThemeDocument`. The draft-preview routes, if any, also wear the live theme.

---

## 6. Animation engine (`components/theme/engine.ts`)

It's a dependency-free canvas particle system: one canvas, one `requestAnimationFrame` loop. Design goal: **it stays in the background**, with low counts, low opacity and slow motion.

**Effect definition:**
```ts
type Effect = {
  density: number; min: number; max: number;      // ambient particles per 1M CSS px², clamped
  repel: number;                                   // how strongly ambient particles drift from the pointer (radius ~110px); 0 = off
  trails?: boolean;                                // fade the previous frame instead of clearing (fireworks)
  ambient(w, h, initial): Particle;                // initial=true scatters across the viewport; else spawns at the entry edge
  burst(x, y): Particle[];                         // click/tap burst
  every?: { min; max; solo?; spawn(w, h): Particle[] }; // occasional hero sprites; solo = wait until the previous one has left
};
```
Particle modes: `fall`, `rise` (sinusoidal sway, pointer repel), `ballistic` (velocity + exponential drag + gravity + TTL fade), `fly` (crosses horizontally with a gentle bob; it is kept until its whole length, including a trailing dragon body or leading reindeer team, is off-screen), `prance` (walks along the bottom edge, stops mid-screen to dance for ~2.6 s, then walks on), `rocket` (rises to a target height, then explodes into a ballistic burst), `still` (twinkles in place).

**Behaviour requirements:**
- `startEngine({canvas, kind, scope, still})` returns `{ destroy() }` or `null` if there is no 2D context. Without canvas support the CSS decoration still carries the theme.
- **Reduced motion / Save-Data:** draw a single, thinned, motionless frame and don't start the loop or listeners.
- Pointer events are **listened to on window** (or the host box in preview). The canvas itself has `pointer-events: none` and never blocks clicks. Bursts are ignored on form fields (`input, textarea, select, [contenteditable]`), throttled to one per 250 ms, and skipped when there are already more than 140 extras.
- Size from `document.documentElement.clientWidth` (not `100vw`, which includes the scrollbar). Cap DPR at 2 (1.5 under 640px). Resize via ResizeObserver (box) or window resize, rAF-debounced.
- **Performance:** start at 60% budget when `hardwareConcurrency <= 4`. Use 60% density under 640px wide. Every 90 frames, if more than half were slow (>25 ms), multiply the budget by 0.7 (floor 0.3). Cap physics `dt` at 50 ms; run hero-sprite timers on real time.
- Pause on `visibilitychange` (hidden tab) and resume cleanly.
- Recycle ambient particles that leave the view instead of allocating new ones. Queue particles **spawned during the extras filter pass** (stardust, firework shards) in a `born` array and append them after the pass; pushing mid-filter loses them (a real bug in the reference).
- Large sprites (sleigh + reindeer, dragon head, lion parts) are original SVG strings in `xmas-art.ts` / `lunar-art.ts`, **rasterised once** to offscreen canvases at the needed size and then transformed per frame. Animate gaits (reindeer gallop, lion trot) by composing parts.
- **Christmas sleigh specifics:** desktop size ≈62px tall, ≈150 px/s; mobile ≈34px, ≈100 px/s. Random direction. Fly in the band just below the header's garland and above the hero headline (measure this site's header + banner height; cap at 32% of the height for short boxes). Follow a gentle sky wave. Emit gold/white stardust specks every ~45 ms from the runners. Next visit 22–34 s after it sets off, one at a time.

---

## 7. Admin UI (`/admin/themes`)

Page header: kicker "Appearance", title "Seasonal themes", and a lede that explains a theme changes colours, patterns, decorations and animations everywhere but never content or prices, that you should preview first, and that applying is instant.

1. **"Live on the website" card:** a swatch tile in the live theme's colours with its emblem, the theme name, "Since <date/time in the business's timezone> by <display name or email>", and "Banner on/off · animations on/off". When a seasonal theme is live, show a **Restore default look** button with a confirm dialog.
2. **Gallery ("Choose a theme"):** a `role="radiogroup"` of card buttons (`role="radio"`, `aria-checked`). Each card shows art in that theme's colours (`data-theme` on the card so tokens apply), a band, the emblem, four swatch dots, the name and season, and a **Live** tag on the active one. Selected by default: the live theme, or the first seasonal theme if default is live.
3. **Detail panel** (remount with `key={selected}` to reset its state). There are two columns:
   - **Live sample:** a miniature mock page inside `data-theme={id}` (banner, header with logo and nav, a hero panel with kicker, headline and button, two product cards with prices, a footer strip) plus `<ThemeEffects scope="box">`, so the admin can hover and click to try the interaction. The hint below it reads: "Live sample. Move the pointer over it or click to try the interaction."
   - **Settings:** emblem, name, season, Live tag, blurb, and "Animation: <effectLabel>". There is an **Animated effects** checkbox (hint: visitors who prefer reduced motion always get a still version) and a **Show a banner above the header** checkbox. When the banner is on, a textarea (`maxLength=140`, a live `n/140` counter, placeholder = the preset's suggested text, "Leave empty to use the suggested message") shows field-level validation errors from the server.
   - Actions: **Preview on site** and **Preview menu** (both open in a new tab), plus a primary button whose label reflects state: "Apply theme" / "Save changes" (live theme edited) / "Restore default" / disabled "Live now" / "Default is live" when nothing has changed. Confirm before applying ("<Name> replaces <Live name> on every page of the live website right away. Content and prices are not affected."), then `router.refresh()`.
4. Server actions: `applyTheme(input)` (zod-validated, writes, expires the cache, returns a friendly message) and `restoreDefaultTheme()`.
5. Add the themes link to the admin nav (only for users with the permission) and the `themes` permission to the user-management UI as "Seasonal themes".

### Preview routes
`/preview/theme/[id]` and `/preview/theme/[id]/menu` render the **real** home and menu pages wrapped in the chosen theme. Settings come from the query string (`?banner=1&fx=1&text=…`, text trimmed to 140). Guard them with `requireAdmin("themes")`, return 404 for unknown ids, and set `robots: noindex, nofollow`. A sticky preview notice reads "Theme preview: <Name>. Visitors do not see this until it is applied." with links to the other preview page and back to the themes admin.

---

## 8. Accessibility and quality bar

- All decoration is `aria-hidden` / CSS pseudo-elements; the canvas never takes focus or pointer events.
- Respect `prefers-reduced-motion` everywhere: canvas (still frame), CSS keyframes (gated by `no-preference`), and SVG-internal animation.
- Check AA contrast for every theme's text/background pairs, including the banner's white text on primary-deep and button text on the accent.
- Decorations must never cover nav links, buttons, the order/CTA button, a back-to-top button or the skip link. Verify z-index order: canvas < header < floating buttons < skip link.
- No layout shift: the wrapper is `display: contents`, the garland is absolutely positioned, and the banner is the only element that adds height (it's expected and dismissible).
- Test at 360, 390, 768, 1280 and 1920 px wide with the banner open and closed.

---

## 9. Documentation

- **Admin guide:** how to pick, preview, customise the banner and animation, apply and restore; that changes are instant and logged in history; that the feature needs the *Seasonal themes* permission.
- **Developer notes:** where presets live, how the active theme is stored and cached, the migration and its policies, "edit `scripts/build-themes-css.mjs` then run `npm run themes:css`", the engine overview, and the rule to keep colours on tokens.

---

## 10. Acceptance checklist

- [ ] Applying each theme re-tints every public page (home, menu, legal, 404) with no component edits beyond replacing colour literals with tokens.
- [ ] Pattern, garland, logo topper and (for Christmas) the footer elf render correctly at all test widths; the topper stays attached to the logo as it resizes.
- [ ] The banner shows the custom or suggested text, closes for the session, and reappears when the text changes.
- [ ] Animation runs, reacts to the pointer and clicks, ignores clicks in form fields, pauses in hidden tabs, and shows a single still frame under reduced motion and Save-Data.
- [ ] The Santa sleigh crosses below the header and above the hero headline, one at a time, with stardust.
- [ ] Default theme shows zero theme artefacts (no `data-theme` on `<html>`, original `theme-color`).
- [ ] Navigating from the public site to `/admin` removes `data-theme` from `<html>`.
- [ ] A user with `publish` but not `themes` cannot change the theme through the UI, the server action, **or** a direct database insert, and vice versa.
- [ ] Preview routes require the permission, 404 on unknown ids, and are `noindex`.
- [ ] The change appears in audit/history with a readable label.
- [ ] Production build, typecheck and lint pass; `npm run themes:css` regenerates the stylesheet with no diff after a clean run.

Work in small, reviewable steps (data model and migration → tokens audit → generated CSS → public components → engine → admin → preview → docs), and show me the result in a browser for at least the default, Christmas and one other theme before calling it done.
