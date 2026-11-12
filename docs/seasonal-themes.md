# Seasonal themes

A seasonal theme changes how the public website looks for a while: colours, a print on the header
and footer, a garland under the header, a small accessory on the logo, an optional banner and an
optional animation. It never changes the menu, the prices or what any page says. The staff
Workspace is never themed.

## For the person running the website

You need the **Seasonal themes** permission. The Super Admin has it already and can give it to
anyone from **Team**, in the **Website** group. It is not part of any job role by default.

1. Open **Workspace, Themes**. The card at the top shows what is live, since when, and who put it up.
2. Pick a theme in **Choose a theme**. The sample beside the settings is a small copy of the site in
   that theme. Move the pointer over it, or click it, to see the animation react.
3. Choose the settings:
   - **Animated effects.** Falling snow, rising hearts, fireworks and so on. Visitors who have asked
     their device for reduced motion always see a still version, whatever you choose.
   - **Show a banner above the header.** A one line message across the top of every page. Leave the
     text empty to use the suggested message, or write your own (140 characters at most). Visitors
     can close it; it stays closed until they close the browser, or until you change the words.
4. Check it on the real pages with **Preview on site** and **Preview menu**. Both open in a new tab
   and only you can see them.
5. Press **Apply theme** and confirm. It is live on every page straight away. There is no draft.
6. To go back to the everyday look, press **Restore default look** on the top card.

Every change appears in **Audit** as "Theme: Christmas", "Theme: default restored" and so on, with
a link back to this screen.

The themes, roughly when to run them:

| Theme | Season |
|---|---|
| New Year | Late December to early January |
| Sto. Niño (Sinulog) | January, the third Sunday |
| Chinese New Year | Late January to February |
| Valentine's | Early to mid February |
| Summer | March to May |
| Independence Day | June 12 |
| Back to School | June to August |
| Halloween | Late October |
| Christmas | September to December |

## For developers

### Where things live

| What | Where |
|---|---|
| The list of themes, names, banner copy, the setting schema, `parseTheme`, `bannerText` | `lib/themes/presets.ts` |
| Each theme's colours | `lib/themes/palettes.ts` |
| Patterns, garlands, logo toppers, the shared CSS rules | `scripts/build-themes-css.ts` |
| Footer figures (Christmas elf, Sto. Niño, lion dance) | `scripts/theme-figures.ts` and the elf in the build script |
| The generated stylesheet (do not edit) | `app/themes.css`, plus `public/themes/*.svg` |
| Storefront read, cached | `lib/themes/read.ts` (`getTheme`) |
| Workspace read and writes | `lib/themes/admin.ts`, `app/(workspace)/workspace/themes/` |
| Preview routes | `app/preview/theme/[id]` and `.../menu` |
| Components | `components/theme/` (banner, emblem, document, effects, engine, sprites) |
| Migration | `supabase/migrations/0107_site_themes.sql` |

After editing the script or a palette: `npm run themes:css`. A second run produces no diff.

### Storage and permissions

`site_themes` is append only; the newest row is live. Nobody holds a grant on it. The storefront
reads through `get_site_theme()` (security definer, granted to anon), the Workspace through
`admin_get_site_theme()`, and the only write is `admin_apply_site_theme()`, which checks
`themes:manage`, validates, inserts and writes an audit row (`theme.apply` or `theme.restore`, the
theme id as `target_id`). `themes:manage` is business wide and no role's default.
`tests/sql/site-themes.test.ts` covers the refusals.

### Caching

`getTheme()` is the one cross request cached read on the storefront: `unstable_cache`, tag
`site-theme`, five minute backstop. That is safe because the answer is the same for every visitor.
The apply action calls `updateTag("site-theme")` and `revalidatePath("/", "layout")`. Every failure,
including a database without the migration, reads as the everyday look.

### How the styling works

A theme re-tints tokens; it never forks a component.

- The storefront chrome (`components/site/StorefrontChrome.tsx`) is wrapped in
  `<div class="theme-root" data-theme="...">`, which is `display: contents`.
- `app/themes.css` defines each theme twice: under `:root:has(.theme-root[data-theme=x])` (colours
  only, so the body ground and portalled popups wear it from the first paint with no script) and
  under `[data-theme=x]` (colours plus artwork, for the wrapper and the Workspace gallery).
- The brand colours in `app/globals.css` are a plain `@theme`, not `@theme inline`, so a utility like
  `bg-nybb-orange` compiles to `var(--color-nybb-orange)` and follows the theme. **Keep new colours on
  these tokens.** A literal colour in a component is one no theme can reach.
- The header stays light in every theme because the wordmark's black "NEW YORK" disappears on dark.
  Themes tint the chrome; they recolour the ground, the cards and the accent.
- Bone, the reds and the heat scale are never themed.
- `tests/unit/theme-contrast.test.ts` checks every palette at AA on every pair the storefront
  prints. If one fails, change the palette.

### Logo toppers

Placement is computed from measurements of the wordmark (900 by 519), recorded in the script.
Hats are worn on the right shoulder of the "O" in BUFFALO, clear of the K in YORK. Objects sit in
the clear space right of BRAD'S. Positions are percentages of the logo link, so they follow the
logo at every width.

### The animation engine

`components/theme/engine.ts` is a dependency free canvas particle system: one canvas, one
`requestAnimationFrame` loop. Each effect declares a density, a pointer repel strength, an ambient
spawner, a click burst and optional "hero" figures on a timer (the sleigh, the dragon and the dance
lion, paper planes, bats). Figures in `sprites.ts` are original SVG, rasterised once.

The dragon's body is not a picture: it is painted each frame as one tapered curve with a gold
crest, a scaled saddle, paddling legs and a tail tuft, so it can swim in smooth S curves; only its
head is a sprite. The lion dance is a body sprite (two gait frames) plus a separate head, which
nods as it trots and rears up and shakes when the lion stops to dance. No animation library is
used: the effects are particle and path drawing on one canvas, which a library would not make
smoother, and it keeps the storefront free of an extra download.

Footer figures: the elf (Christmas), the Sto. Niño (Sinulog) and a lion dance (Chinese New Year).
Each theme has its own and none is shared. The Sto. Niño never moves; a revered image is not an
animation. The elf waves and the lion nods and blinks, inside their own SVG, off under reduced
motion.

- Reduced motion or Save-Data: one still, thinned frame, no loop, no listeners.
- Pointer events are read on the window (or the sample box); the canvas never takes them. Bursts
  skip form fields, are throttled to one per 250 ms, and stop at 140 extras.
- Budget starts at 60% on four cores or fewer, density drops to 60% under 640 px, and every 90
  frames the budget sheds 30% if most frames were slow. Hidden tabs pause.
- Particles spawned during the extras pass go into `born` and are appended after it.
- Stacking: canvas (z 20) under the floating cards (30 to 40), the header (50), the banner (51)
  and the skip link (60).
