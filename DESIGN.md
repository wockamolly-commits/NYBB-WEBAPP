---
name: NYBB Order
description: A warm printed ground, black stamped type, and a five-stop heat scale, for a Cebu wing house that sells hotness by the percent.
colors:
  griddle-amber: "#f7a70f"
  ground-stop-1: "#f2860f"
  ground-stop-3: "#f9c614"
  ground-stop-4: "#fae51a"
  buffalo-orange: "#ef6212"
  buffalo-orange-lit: "#f47621"
  char: "#0b0b0c"
  charcoal: "#17181a"
  graphite: "#232528"
  warm-bone: "#f5f1ea"
  cream: "#faf3e3"
  parchment: "#f2e4c6"
  parchment-deep: "#ecdab4"
  signage-yellow: "#f9ee18"
  buffalo-red: "#ee2329"
  red-deep: "#c81319"
  red-deeper: "#a80f15"
  heat-1: "#f9ee18"
  heat-2: "#f7c115"
  heat-3: "#f47621"
  heat-4: "#ef4a17"
  heat-5: "#ee2329"
typography:
  hero:
    fontFamily: "Anton, Impact, sans-serif"
    fontSize: "clamp(2.75rem, 9vw, 6rem)"
    fontWeight: 400
    lineHeight: 0.85
    letterSpacing: "-0.015em"
  page:
    fontFamily: "Anton, Impact, sans-serif"
    fontSize: "clamp(2.5rem, 9vw, 5rem)"
    fontWeight: 400
    lineHeight: 0.88
    letterSpacing: "-0.012em"
  major:
    fontFamily: "Anton, Impact, sans-serif"
    fontSize: "clamp(2.25rem, 5vw, 3.5rem)"
    fontWeight: 400
    lineHeight: 0.9
    letterSpacing: "-0.008em"
  minor:
    fontFamily: "Anton, Impact, sans-serif"
    fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)"
    fontWeight: 400
    lineHeight: 0.95
    letterSpacing: "-0.004em"
  panel:
    fontFamily: "Anton, Impact, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "0.08em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "0.14em"
  numeric:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.2
    fontFeature: "tabular-nums"
  script:
    fontFamily: "Daughter of Fortune, cursive"
    fontSize: "1.75rem"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "0.01em"
rounded:
  sm: "0.3rem"
  md: "0.4rem"
  lg: "0.5rem"
  xl: "0.7rem"
  full: "9999px"
spacing:
  gutter: "1.25rem"
  gutter-wide: "2rem"
  section: "5rem"
  section-wide: "7rem"
  container: "72rem"
components:
  button-primary-light:
    backgroundColor: "{colors.char}"
    textColor: "{colors.warm-bone}"
    typography: "{typography.panel}"
    rounded: "{rounded.md}"
    padding: "0 1.25rem"
    height: "2.75rem"
  button-primary-light-hover:
    backgroundColor: "{colors.charcoal}"
    textColor: "{colors.warm-bone}"
  button-primary-dark:
    backgroundColor: "{colors.buffalo-orange}"
    textColor: "{colors.char}"
    typography: "{typography.panel}"
    rounded: "{rounded.md}"
    padding: "0 1.25rem"
    height: "2.75rem"
  button-primary-dark-hover:
    backgroundColor: "{colors.buffalo-orange-lit}"
    textColor: "{colors.char}"
  button-secondary-light:
    backgroundColor: "transparent"
    textColor: "{colors.char}"
    typography: "{typography.panel}"
    rounded: "{rounded.md}"
    padding: "0 1.25rem"
    height: "2.75rem"
  button-ghost-light:
    backgroundColor: "transparent"
    textColor: "{colors.char}"
    typography: "{typography.panel}"
    rounded: "{rounded.md}"
    padding: "0 1.25rem"
    height: "2.75rem"
  button-danger-light:
    backgroundColor: "transparent"
    textColor: "{colors.char}"
    typography: "{typography.panel}"
    rounded: "{rounded.md}"
    padding: "0 1.25rem"
    height: "2.75rem"
  button-danger-light-hover:
    backgroundColor: "{colors.red-deep}"
    textColor: "{colors.warm-bone}"
  product-tile:
    backgroundColor: "{colors.charcoal}"
    textColor: "{colors.warm-bone}"
    rounded: "{rounded.md}"
    padding: "0.625rem 0.75rem"
  input-field:
    backgroundColor: "transparent"
    textColor: "{colors.warm-bone}"
    rounded: "{rounded.md}"
    padding: "0.625rem 0.75rem"
    fontSize: "1rem"
  chrome-bar:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.char}"
    height: "4.5rem"
---

# Design System: NYBB Order

## Overview

**Creative North Star: "The Basket Liner"**

The whole system is the branded greaseproof sheet the wings actually arrive on. A warm printed
ground that runs hot at the top and cools to signage yellow at the bottom. Black type stamped onto
it hard enough to read across a counter. The store's own wall drawing pressed into the paper rather
than printed over it. And a five-stop heat scale printed along the edge, top and bottom, bracketing
everything in between. Once that image is in mind, every rule in this document follows from it: why
the ground is loud, why the chrome is parchment instead of white, why the drawing darkens rather
than lightens, and why nothing floats.

Hot, printed, engineered. The ground is genuinely saturated, and that is the brand: the live site
samples at 237 instances of the orange against 183 of black, so a timid neutral page would be a
different restaurant. What keeps a saturated page from reading as a flyer is that every loud move
is governed by a stated rule with a measured number behind it. The orange is unusable as type on
this ground at 1.8:1, so it is never type on this ground. The focus ring is ink on light and orange
on dark because the ring's neighbours are the ground on both sides once it is offset. The
destructive red is two steps down its own hue because signage red cannot carry a label.

Nothing in this system is decorative by accident. The grain exists because a gradient this smooth
bands on an 8-bit panel. The wall drawing sits at 10% rather than the 9% the filled silhouette
before it used, because a line drawing puts far less ink on the page per square inch and reads
fainter at the same alpha. The one authored animation on the site is the heat scale drawing itself,
which is the product's own mechanism moving, not a fade applied to seven sections in turn.

**Key Characteristics:**

- A fixed warm gradient ground, with dark surfaces sitting on it. That contrast is the layout.
- Anton in caps for every heading, Inter for reading, JetBrains Mono for every number.
- One radius, `0.4rem`, on essentially everything.
- No shadows except one warm offset under the sticky chrome.
- A five-stop heat ramp that is the same five swatches everywhere it appears.
- Every colour pair carries a measured contrast ratio, and the ratio decided the value.

## Colors

Warm the whole way through. There is no neutral grey anywhere in this system: even the near-black
carries a trace of blue so it does not go dead beside warm food photography, and even the shadows
are brown.

### Primary

- **Buffalo Orange** (`#ef6212`): The sampled brand value, not an invention. Every price, every
  active state, the focus ring on dark surfaces, and the CTA fill wherever the ground is dark. It
  is also the ground of every product tile, because most of the legacy cutouts were exported
  already flattened onto orange.
- **Buffalo Orange Lit** (`#f47621`): The site's own lighter orange, used there in gradients and
  here as the hover state, so hover stays inside the existing palette rather than being a computed
  lightening of the primary.

### Secondary

- **Griddle Amber** (`#f7a70f`): The page ground. Painted as a fixed four-stop gradient
  interpolated in oklab, running `#f2860f` at the top through `#f9c614` to `#fae51a` at the
  bottom; the token value is the mid stop, which is what any flat `background` use resolves to.
  Fixed rather than scrolling, because a gradient that travels with a long menu page stops reading
  as light and starts reading as a very tall image. The other three stops are declared as
  `ground-stop-1`, `ground-stop-3` and `ground-stop-4` (Griddle Amber itself is stop 2). They were
  prose-only for a while, which meant anything that had to restate the gradient outside CSS, such as
  the share image, was writing hex nobody could check against the palette.
- **Signage Yellow** (`#f9ee18`): Extremely high contrast on ink, which is exactly why it is
  rationed. Badges, micro-labels, and the bottom stop of the heat scale. Never a paragraph.

### Tertiary

- **Buffalo Red** (`#ee2329`): A display colour with two declared jobs, the top of the heat scale
  and the accent a destructive icon control takes on hover. It cannot carry a label.
- **Red Deep** (`#c81319`) and **Red Deeper** (`#a80f15`): The destructive fill at rest-engaged and
  pressed. Warm bone measures 5.2:1 on deep and 6.8:1 on deeper, which is what lets a destructive
  control be unmistakably red and still read as a considered control rather than a fire alarm.

### Neutral

- **Char** (`#0b0b0c`): Body copy on the light ground, the primary button fill on the light ground
  at roughly 11:1 against the gradient, and the darkest surface. Not pure black.
- **Charcoal** (`#17181a`): Cards, product tiles, and every elevated dark surface.
- **Graphite** (`#232528`): Input fills, unfilled heat segments, and pressed states on dark.
- **Warm Bone** (`#f5f1ea`): Reading colour on dark surfaces. Warm off-white rather than pure white,
  so long copy on a near-black ground does not glare.
- **Cream** (`#faf3e3`) and **Parchment** (`#f2e4c6`): The chrome surface, always as a gradient
  from one to the other so the navbar and footer are never a single flat tone. Both sit on the same
  warm hue as the page's own gradient, which is what makes the bar read as the ground lit from the
  front rather than as a white block covering it.
- **Parchment Deep** (`#ecdab4`): The footer's legal plinth, one step deeper again, so the page ends
  on a base rather than fading out.

### The heat ramp

Five fixed swatches, `heat-1` through `heat-5`, running signage yellow to buffalo red. Deliberately
not a gradient function: a given heat level must be the same swatch on a product page, a receipt, a
kitchen ticket and a printed pickup slip, and a function sampled at a different position would not
guarantee that.

### Named Rules

**The One Loud Thing Rule.** Orange is the only loud colour. Yellow and red are accents with narrow,
stated jobs. Nothing else in this system gets a colour at all.

**The Orange Is For Dark Rule.** Buffalo Orange on the amber ground measures 1.8:1 and on parchment
2.6:1. It is therefore never type on a light surface. It may appear on a light surface only as a
graphic: a rule, an underline, a fill. On ink it measures 5.4:1 and is for headings, prices,
buttons and icons, never for paragraphs.

**The Ground Owns the Ring Rule.** The focus ring colour belongs to the surface, not to the control.
Ink is the default, at 7.6:1 on the darkest stop of the gradient, and dark surfaces flip it to
orange, at 6.0:1 on ink. This is keyed off the background utility at zero specificity, so a charcoal
card added next year gets a legible ring without anyone remembering to ask for one.

**The Never Adjacent Rule.** Orange text never sits on red, and red never sits on orange.

## Typography

**Display Font:** Anton (with Impact, sans-serif)
**Body Font:** Inter (with system-ui, sans-serif)
**Numeric Font:** JetBrains Mono (with ui-monospace, monospace)
**Lettering:** Daughter of Fortune, and only for the store's fixed tagline

**Character:** A heavy condensed grotesque carrying the stadium-signage register, set against a
neutral text face chosen because it holds at 14px on a phone, which is where most of this is read.
The mono is load-bearing rather than decorative: prices, order short codes, pickup codes, prep
countdowns and heat percentages all have to align in a column and must not reflow as digits change.

### Hierarchy

- **Hero** (Anton, `clamp(2.75rem, 9vw, 6rem)`, `0.85`, `-0.015em`): The landing headline, and
  nothing else. The 6rem cap is real: Anton past that stops being a headline and becomes a texture.
  Excluded from balanced wrapping, because it sets its own breaks.
- **Page** (Anton, `clamp(2.5rem, 9vw, 5rem)`, `0.88`, `-0.012em`): Every route title that is not
  the landing hero. Menu, category, cart, checkout, about, contact.
- **Major** (Anton, `clamp(2.25rem, 5vw, 3.5rem)`, `0.9`, `-0.008em`): Section headings within a
  page.
- **Minor** (Anton, `clamp(1.75rem, 3.5vw, 2.5rem)`, `0.95`, `-0.004em`): Sub-section headings.
- **Panel** (Anton, `0.875rem`, `0.08em`): The heading inside a card. "Order total", "Size",
  "Pickup time". Small on purpose, so it does not outrank the number underneath it, and tracked,
  because Anton at 14px in caps closes up.
- **Body** (Inter, `1rem`, `1.5`): All reading copy. Orphan control (`text-wrap: pretty`) is applied
  globally to paragraphs, list items, definitions and captions.
- **Label** (`0.75rem`, `0.14em`, uppercase): The micro-label, a data caption or the name of the
  thing the number beside it measures. Deliberately family-agnostic, because this role is worn by
  all three faces depending on what it labels; only the metrics are shared.
- **Numeric** (JetBrains Mono, tabular figures): Every number the user has to read, compare, or say
  out loud.
- **Script** (Daughter of Fortune, `1.75rem`, `1.1`, `0.01em`): The store's taglines, and nothing
  else on the site. There are two, and both are fixed brand strings rather than copy: "#Your All
  Time Favorite Chicken Wings" is the primary, and "#Wing It! #Love It" is the second, which the
  footer carries. It has no size tier in the heading scale
  because it is not in that hierarchy: this is lettering, part of the lockup, and it behaves like the
  wordmark rather than like a text style. It never takes a variable string, never sets a heading, a
  label or a price, and is never uppercased, because a brush script's joins are drawn for lowercase
  and caps break every one of them.

  **Where it appears, and at what size.** The landing hero, once in the body of the About page, and
  the footer. All three run the same pair, `1.5rem` below `sm` and `1.75rem` from `sm` up, with one
  documented exception: the hero drops to `1.25rem` under `max-height: 500px`, where a landscape
  phone has under 300px below the header and the CTAs have to clear it. Otherwise the size does not
  vary by placement, and that is a rule rather than two authors happening to agree: a lockup that
  resizes between placements stops reading as one object and starts reading as a font somebody
  liked. More than one content placement per page is a repeat; the footer's tagline is chrome and
  does not count against that, the same exemption the footer skyline holds under The One Drawn Scene
  Per Page Rule.

  **The tagline has two renderings, and the phrase decides which one, not the space.** The delivered
  artwork (`components/brand/TaglineMark.tsx`) is three interlocking lines on a rising diagonal at
  1.945:1. It cannot be made into one line: across 463 rows of the trimmed master there is not one
  blank row to cut on, and no rotation from -30 to +6 degrees separates the bands, so extracting
  three horizontal pieces would mean cutting through glyphs. It also letters exactly one phrase, the
  primary, because the words are drawn into the pixels. **Use the artwork only for the primary
  tagline, and only where a block roughly 2:1 fits.** The second tagline has no delivered artwork,
  so it is always set as type. Relettering a drawn logo is the designer's job, not a transform's; if
  a master for the second phrase ever arrives, `TaglineMark` is where it goes.

  **Where the space is a single line, use `.tagline-inked`.** It puts the lockup's own paint,
  signage yellow filled inside a black keyline over a black offset shadow, onto the lockup's own
  typeface, so what a one-line placement gives up is the diagonal composition and not the lettering.
  Daughter of Fortune was identified by rendering all four delivered faces against the delivered
  artwork; it is the face the mark is set in, not a lookalike. `paint-order: stroke fill` is load
  bearing, because a centred stroke eats half its width out of the inside of a script this fine and
  closes the thin joins. Both stroke and shadow are in `em`, so the treatment holds at any size.

  The landing hero and the footer both use the class, for different reasons: the hero because its
  slot is a single line, the footer because it carries the second tagline and no artwork for that
  phrase exists. The About page's instance is neither: it is a signature inside a body-copy column,
  where the ink-on-amber setting is still right.

  **The keyline sets the artwork's minimum size.** Signage yellow measures about 1.1:1 on the
  chrome, so every bit of the mark's legibility there is the black keyline, exactly as it is for
  BUFFALO and BRAD'S in the wordmark. Measured on the delivered file the median black run is 72px
  against a 17,717px width, which lands at 1.06px rendered 260 wide and 0.89px at 220. Below about
  200 the keyline drops out at 1x and the mark degrades to yellow on cream. `w-[220px]
  sm:w-[260px]` is therefore a floor. Anything smaller needs a variant drawn with a heavier
  keyline, not a transform, which is The Hatching Stays Strokes Rule arriving in a second costume.

  **Colour is the surface's, and the margin is thin.** Ink on the amber ground at 7.7:1, bone on
  ink. Never Buffalo Orange: 1.8:1 on amber and 2.2:1 at the top of the hero's scrim, both under
  even the 3:1 large text is allowed. This face has the thinnest joins in the system and is the last
  thing that should be spending a marginal ratio.

### Named Rules

**The Tracking Scales With the Type Rule.** The display class carries `+0.005em`, which is what a
condensed face needs at label size. Left unchanged at 96px that same value opens the word up, so
each tier takes back more of it as it grows, down to a floor of `-0.015em`. Never set tracking once
and apply it across sizes.

**The Numbers Are Mono Rule.** If a value is a price, a code, a countdown, a quantity or a
percentage, it is JetBrains Mono with tabular figures. No exceptions, because these appear beside
each other in columns and in receipts.

**The Bloom Correction Rule.** Light type on a near-black ground blooms: counters close and
letterforms spread. Dark surfaces therefore add `0.006em` of tracking to untracked reading copy,
applied at the surface at zero specificity so a new dark card inherits it and anything stating its
own tracking keeps it.

**The Sixteen Pixel Rule.** Form controls are `16px` below the `sm` breakpoint. Anything smaller
makes iOS Safari zoom the viewport on focus, which on a checkout form reads as the page jumping.

**The Fourth Face Letters, It Does Not Set Rule.** This document used to end on a flat ban against a
fourth typeface, and the ban was right about the risk and wrong about the shape. A brand script has
one legitimate job here and it is a logo's job: lettering a fixed phrase that the store already draws
that way. So the face is admitted for exactly that and nothing widens it. If a new string is
variable, or is a heading, a label, a control or a number, it is Anton, Inter or JetBrains Mono. The
type scale was measured against Anton's metrics and none of that measurement transfers. Three faces
still set the interface; the fourth only ever letters.

## Layout

A single centred column at `max-width: 72rem`, with `1.25rem` gutters growing to `2rem` from the
`sm` breakpoint. The chrome uses slightly tighter gutters (`1rem` to `1.5rem`) because it holds a
logo and a nav rather than reading content.

**Vertical rhythm.** Full-width sections run `5rem` of vertical padding, opening to `7rem` from
`sm`. Sections alternate between the bare amber ground and full-bleed dark bands, and that
alternation is the page's structure. There are no drawn dividers between sections; the change of
ground is the divider.

**The sticky chrome.** The header is `4.5rem` tall, growing to `5.5rem` from `sm`, and sticks at
the top of the viewport. The category bar sticks beneath it, and scroll-margin on anchored content
is derived from those two heights. If the header height changes, three other numbers change with
it.

**Grids.** The menu grid runs two columns on a phone, three at `sm`, four at `lg`. Product tiles are
full-height flex columns so a row equalises to its tallest card and every price in a row pins to the
same baseline, whatever the names above them did.

**Breakpoints.** Tailwind defaults, and only three of them are used: `sm` (640px), `md` (768px),
`lg` (1024px). Layout is designed at 320px first and verified there.

**Short viewports key on height, not width.** A landscape phone at 844x390 is 844 wide, so every
width-keyed rule hands it the desktop treatment while it has under 300px of room below the header.
Anything that must stay above the fold takes a `max-height` query, not a width one. The hero gives
back its padding and drops to a `2.5rem` headline under `max-height: 500px`, which is what keeps its
buttons reachable. Orientation is not something CSS can ask about, and width answers the wrong
question.

### Named Rules

**The Header Is In The Fold Rule.** The header is `sticky top-0` and therefore still in flow, so the
first screen is the hero plus the bar above it. A hero sized to fill the viewport actually overfills
it. Size it to leave roughly an eighth of the viewport to the next section, so the page reads as
having more below rather than ending at a seam.

**Horizontal overflow is a bug.** The page body never scrolls sideways. Wide content, meaning
tables, tickets, and the analytics grid, gets its own overflow container.

## Elevation & Depth

**This system is flat, and separation is carried by value.** A charcoal card on the amber ground is
already separated by roughly 11:1 of lightness, so a drawn edge or a shadow underneath it would be
redundant, and product tiles carry no border at all for exactly that reason. The global hairline
token is ink at 16% alpha, which reads on the light ground and goes nearly invisible on dark cards.
That is correct rather than a bug.

Depth that does exist is pressed rather than stacked. The wall drawing is ink at 10% opacity, so it
darkens the ground rather than lightening it and reads as an emboss in the paper. The chrome
gradient makes the bar read as the ground lit from the front.

**The wall belongs to the public site, not to the document.** It is rendered by
`app/(marketing)/layout.tsx` as a `MuralArt` layer. The slot it occupies was `body::before` until
that turned out to be a claim nobody had checked: that every route on the origin wants a marketing
watermark behind it. The 404 does not: it carries a street scene of its own, and a second drawing
pressed into the ground behind the first is two drawn scenes on one page, which The One Drawn Scene
Per Page Rule exists to prevent. The staff workspace will not either, for the plainer reason that a
drawing behind an order board is noise on a screen somebody watches for a whole shift. The grain
stays on `body`, because it is dithering the page gradient and that gradient is document-level.

### Shadow Vocabulary

- **Chrome float** (`box-shadow: 0 12px 28px -14px rgba(84, 46, 8, 0.32)`): The single shadow in the
  system. It exists because the sticky bar overlaps the hero video and needs to sit above it rather
  than butt against it with a hard seam.

### Named Rules

**The Value, Not Shadow Rule.** Surfaces separate by lightness. Do not add a shadow or a border to
something that is already 11:1 away from what is behind it.

**The Warm Shadow Rule.** If a shadow is genuinely needed, it is brown and offset. A neutral grey
shadow on a warm page reads as dirt.

## Shapes

One radius, `0.4rem` (`rounded-md`), on essentially everything: buttons, cards, product tiles,
inputs, steppers. It is tighter than a soft-cafe radius on purpose, because this brand is signage
and baskets. The scale exists (`0.3rem` through `0.7rem`, derived from a `0.5rem` base) and is used
for nested corners, such as the stepper's end caps inside its group. Full rounding is reserved for
genuinely circular objects: badges, dots, and the nav underline cap.

Borders are used where a control needs its own boundary, at `1px`, and always at an alpha that
measures at least 3:1 against its ground. On dark that is bone at 40%; on the amber ground it is ink
at 55%. The lower values that read as "subtle" on a neutral page do not survive this ground.

Product photography is square-cropped and bled to all four edges of its frame. The tile colour shows
only where there is no photograph at all.

### Named Rules

**The One Radius Rule.** New components take `0.4rem` unless there is a stated geometric reason not
to. A system with five radii in play reads as five systems.

**The Real Edge Or Nothing Rule.** The amber ground is so light and so saturated that nothing subtle
survives on it. Ink at 40% measures 2.3:1 against the gradient, so there is no soft plate available
here. A control either takes a real edge or it takes none.

## Components

### Buttons

**Character:** Tactile and immediate. The press answers instantly and releases lazily, which is what
makes a control feel connected to the finger rather than animated.

- **Shape:** One radius (`0.4rem`), Anton at `0.875rem` with `0.06em` tracking, uppercase.
- **Geometry is shared across all four tiers.** Same height, radius, face and tracking. Only weight
  changes. That is what makes a row holding a danger button and a ghost button read as two ranks of
  one control rather than two unrelated widgets.
- **Sizes:** `2.75rem` default (the touch-target floor, and the height anything sharing a row with a
  quantity stepper must match), `3rem` for the full-width commitment at the bottom of a card, and
  `2.625rem` square for icon-only.
- **Tone is the ground, not the button.** On dark surfaces the primary fill is Buffalo Orange with
  char text. On the amber ground the same orange is unreadable, so the primary fill is Char with
  bone text. Tone also carries the focus ring.
- **Primary:** solid fill, hover shifts to the lit orange (dark) or charcoal (light).
- **Secondary:** `1px` border at 40% bone or 55% ink, tinted ground on hover.
- **Ghost:** full button geometry, no weight at rest, tinted ground under the cursor. This tier
  exists so a secondary action can be quiet without falling out of the system into bare underlined
  text.
- **Danger:** quiet at rest, red the moment you engage it. It carries a border at the same weight as
  secondary and turns to the deep red fill on hover, focus and press.
- **States:** hover and focus never change size, so nothing reflows under the cursor. The press is a
  2% scale, composited, pinned back to 1 under reduced motion.

### Cards and tiles

- **Corner:** `0.4rem`.
- **Background:** Charcoal, with bone text set on the container so contents inherit rather than each
  leaf declaring a colour.
- **Border:** none. See the Value, Not Shadow Rule.
- **Internal padding:** `0.625rem`/`0.75rem` growing to `0.875rem`/`1rem` from `sm`.
- **Product tiles** are a square orange image frame above a black name plate, with the item code on
  its own line in mono, the name balanced, and the price pinned to the bottom of the card. The
  photograph scales 4% on hover over 500ms.

### Inputs and fields

- **Style:** transparent fill, `1px` border at 25% bone, `0.4rem` radius, `16px` text.
- **Hover / focus:** border steps to 45% then 60%. Colour is the only thing that moves; the box does
  not.
- **Error:** the border goes signage red *and* a message appears beside the field, bone letters
  against a red left rule. Colour on its own is never the error message. Signage red on charcoal
  measures 4.3:1, which is under AA for body text, so the red is the marker and the bone is the
  message.
- **Labels:** the uppercase micro-label at 55% bone, above the field.

The Workspace is the one denser operating surface. Its fields use Graphite fill so an editable
region remains visible across a shift on Ink and Charcoal. The outside edge is bone at 40%, rising
to 65% on hover and Buffalo Orange on focus. Placeholder copy is bone at 60%, which keeps it above
4.5:1 on Graphite rather than making affordance copy faint for style.

Workspace dropdowns are composite controls, never a native `<select>` popup. The trigger keeps the
same `2.75rem` geometry and edge as an input, with an orange chevron in a separated end cap. The
popup is Charcoal with the same real edge, selected rows carry a check and a faint structural fill,
and the keyboard-highlighted row becomes Buffalo Orange with Char text. Base UI owns focus,
keyboard navigation, dismissal and the hidden form value.

The Workspace shell also themes the browser surfaces around those controls: caret and selection,
scrollbars, checkbox and radio states, file buttons, ranges and date-picker indicators. New admin
screens therefore inherit one control language even before they need a dedicated component.

### The delete confirmation

The Workspace's one interrupting surface, and the only dialog in the system. It is a native
`<dialog>` opened with `showModal()`, so the top layer, the focus trap, Escape and the inert page
behind it are the browser's work rather than a hand-rolled trap. It replaced `window.confirm`, which
was the one surface in the app that nothing in this document could reach: it announces the origin,
it orders OK before Cancel, and it cannot say which record is about to go.

- **Panel:** Charcoal, `0.4rem`, `1px` bone at 40%. The border is not a breach of The Value, Not
  Shadow Rule. That rule governs a surface already separated by lightness; Charcoal over a scrimmed
  Ink page measures 1.1:1, which is no separation at all, so the panel takes a real edge instead. A
  shadow would darken nothing on a near-black ground.
- **Backdrop:** Char at 82%, unblurred. Chrome in this system is solid rather than translucent, and
  a blur would be the one place in the product that softens the ground instead of covering it.
- **Name plate:** the record about to be deleted, drawn as the product tile's own plate. Ink,
  `0.4rem`, an identifier in mono caps above the name in the display face. It answers the only
  question a person has at this moment, which is whether this is the right record.
- **The one red thing is the confirm button.** The micro-label is signage yellow, doing its stated
  job. The heading, the name and the consequence are all bone. Red is not type in this system and
  it is not type here.
- **Motion:** 140ms. The panel rises `0.5rem` and the backdrop fades, through `@starting-style` and
  `allow-discrete`. This is the one arrival that earns a transition, because a surface interrupting
  the page and appearing between two frames reads as a rendering fault rather than as an answer to
  the button.
- **Order:** Cancel first in the DOM, so the safe answer holds focus and Enter deletes nothing. The
  row reverses on a phone, which puts Cancel where the thumb rests and moves the destructive button
  out of that arc.

### Named Rules

**The Destructive Fill Is Earned Rule.** The `danger` button tier is quiet at rest because it sits
on a screen that exists for something else. `dangerSolid`, the Red Deep fill, belongs only to a
control that is already the answer to a question the person was asked. A delete that has to be
found by hovering is a worse dialog, not a politer one.

**The Repeated Delete Loses Its Words Rule.** A delete that appears once per row takes
`ConfirmDeleteButton`'s `iconOnly` tier: the trash on the 44px square, no label. Fifteen labelled
DELETE OPTION buttons down a table is fifteen instances of the rarest and most dangerous action on
the screen, carried at the same weight as Save. The dialog is unchanged, so nothing is hidden and
only the repetition is. The accessible name does not shrink with the button: `triggerLabel` names
the record ("Delete option: Classic Buffalo"), because a screen reader must never meet fifteen
buttons called the same thing.

### The workspace table

The shape a Workspace screen takes when it manages a list of like records. The option groups screen
is the reference implementation; it replaced fifteen independent wrapping forms, one per option,
which measured 7,372px on a 1440 desktop and 14,832px on a phone before anything was even opened.

The failure that layout had is worth naming, because it is the one a form-per-row always has. A
`flex-wrap` row sizes itself from its own contents, so no two rows can align even in principle: a
row showing an amount field sits differently from one that is not. And every field carries its own
label, so the column names get printed once per row, which puts three lines of label text between
one record's name and the next. That is precisely what stops an eye running down a column, so the
one thing somebody comes to this screen to do, find a record by name, is the thing the layout
prevents.

- **One template, two consumers.** The header row and every data row take `grid-template-columns`
  from a single function and from nothing else. Two separately authored width lists drift on the
  first change, and a row one pixel out of column with the row above reads as a rendering fault
  rather than as a layout.
- **Column names are printed once.** Per-cell labels stay in the DOM and go `lg:sr-only`, never
  deleted: a grid header cell is not programmatically the label of an input three rows below it,
  so removing them would leave every field announcing nothing but its value.
- **Two layouts, one DOM.** Cells are grouped into wrappers carrying `lg:contents`. Below `lg`
  those wrappers are real and the row stacks into a few sensible lines; from `lg` up
  `display: contents` dissolves them and their children become direct grid items in header order.
  Eight columns inside 390px is not a table, it is a horizontal scrollbar.
- **An optional column belongs to the table, not to a row.** A column that appeared on only the
  rows using it would not be a column. Whether it is open is group state, seeded from the data and
  updated by the rows, so opening it reflows the whole table at once.
- **Chrome collapses, data does not.** The photograph is a 44px thumbnail that opens its editor;
  the delete is the icon-only tier; the row's own hint lines move up to the group when what they
  state is a group fact. Every field stays visible and editable.
- **Rules, not plates.** Rows separate with a `1px` bone-at-15% top rule and the header row draws
  none of its own, because the first row's rule is already there and a second would double it.
  There is no zebra: this system separates by value and a table is not an exception.

**The Repeated Save Is Quiet Rule.** A Save button that appears once per row is `secondary` at rest
and takes `primary` (the brand orange) only while that row holds uncommitted edits. Seventeen orange
Save buttons was the old screen, and at that count the colour stops meaning "this is the action" and
starts meaning "this is a form", which is The One Loud Thing Rule failing by repetition rather than
by hue. Quiet at rest also buys the state for free: exactly one row is orange, and it is the row you
were working in.

**The Container Is Not A Peer Of Its Rows Rule.** A group's own name belongs in a heading in the
display face with a summary line under it, not in a text input that looks exactly like the fifteen
text inputs beneath it. Its fields go behind a disclosure, because they are edited about once in the
life of the record. The disclosure hides with the `hidden` attribute and never unmounts: a required
field taken out of the DOM would post an empty value the first time somebody changed something while
the panel was shut, and `display: none` takes the fields out of the tab order for free. A switch that
stays outside the disclosure opens it when it makes the record dirty, so the change always has a
Save on screen.

**The Destructive Control Comes After The Thing It Deletes Rule.** Delete group sits at the foot of
the card, below the options. It used to sit between the group's fields and its options, ruled off on
both sides, which is the most isolated and therefore most prominent position on a card, given to the
one action nobody came here to perform.

Three screens take this table: option groups, categories, and the sizes inside the item editor. It
has one implementation, `components/ui/WorkspaceTable.tsx`, because three separately authored column
lists would drift from each other and from this document on the first change.

### The workspace form section

The shape a Workspace form takes when it has more than one part.
`components/ui/WorkspaceSection.tsx` is the implementation.

From `lg` up a section is two columns: a `16rem` rail carrying the heading and its explanation, and
a body carrying the controls. Below `lg` it stacks into heading, description, controls, which is the
order the page already reads in. The rail is wide enough for these explanations to set at a readable
measure and narrow enough that the body still holds a five column table at `lg`.

**The Section Outranks Its Own Fields Rule.** A section's name is an `<h2>` in the display face at
panel size in full bone. It used to be a `<p>` set in the same size and family as the field labels
underneath it and at a *lower* alpha, 55 against 65, so "DETAILS" was the weakest text inside its own
card and "CATEGORY" outranked it. A form whose sections are quieter than its fields cannot be skimmed
for the section you want, which is the only way anybody navigates a long form. It also gave the form
no heading structure at all for a screen reader.

**The Prose Leaves The Control Flow Rule.** Explanation goes in the rail. The item editor carried
five sections each opening with one to three paragraphs before any control appeared: the note on
"On the menu" ran to four lines under two checkboxes, and the sizes explanation to five lines before
the first field. Every visit paid for instruction that is read once, and it was paid in the vertical
space between the controls somebody came to use. Nothing is dropped and no word is rewritten; the
rail is a place to put them.

A hint that belongs to one field rather than to the section stays with that field, under the row it
describes and named by `aria-describedby`, at a capped measure. The code hint used to sit under a
three field row where it read as a note about all three, and inside its own 128px column it set at
five words a line.

**The Commit Is The Foot Of The Form, Not A Card After It.** The button that saves a form sits
after everything it commits, on the same two column grid as the sections above it with the rail
empty, and inside the last section's own plate rather than on a plate of its own. An inset bone at
15% rule divides them, the same device that separates an option group's identity from its options.
Whatever blocks the button is stated beside it at the weight of body copy.

This replaces an earlier rule that asked for a strip of its own on the section geometry, and the
correction is the interesting half. Alignment alone did not do the work claimed for it. A rail
carrying nothing, a body column carrying one 44px button, and the same charcoal plate at the same
width as the four real sections around it: the eye reads "section", finds no heading and no content,
and the card reads as unfinished rather than as a commit. The 16rem offset only says something when
a control directly above it wears the same left edge, and in a plate of its own there was nothing
above it at all. Attached, the button lands under the last control it commits, and the block ends
the way the per size price grid already ended, with the content and then the one Save that commits
it.

Two smaller things the same pass fixed, both worth repeating. The blocking reason used to be 12px at
55% bone, the quietest text on the page, explaining the one control nobody could press. And the
status line sat in the button's flex row inside a `w-full` wrapper, which is a flex item whether or
not the message renders, so an idle form paid a row gap for a line that was not there.

### Selection controls

A distinct family from buttons. Size chips, flavour tiles, option rows and pickup windows carry
`aria-pressed` and their look is owned by whether they are chosen, so they cannot be a button
variant. What they share with buttons is the answer to a finger: the same 2% press on the same
timing, because a screen where some things respond to a press and others do not reads as half-built.

Three states, and they are structural rather than decorative:

- **Available:** `1px` border at 25% bone, stepping to 60% on hover with a 5% tinted ground.
- **Chosen:** the orange fill with char text. The border disappears, because a fill does not need
  one.
- **Taken:** flat, and still on screen. Border drops to 10%, text to 35%, the press is pinned off.
  A window that vanishes reads as a bug in the page; a window that is visibly taken reads as a busy
  shop, which is the truth and also sells the next one.

### The pickup slot picker

Windows in a two-column grid, three from `sm`, each at least `4rem` tall and full-height so a window
carrying "2 left" does not stand taller than the one beside it. The time is tabular mono; the
capacity note sits under it in orange when the window is open, in char at 75% when chosen, and at
35% bone when taken.

Its unavailable state is a dashed-border panel, not an error. Several of the reasons a customer
cannot pick a time are administrative rather than a fault, so the panel says which one in body copy
rather than leaving a blank that reads as broken.

### The order status ladder

Four equal bars across the card, `0.25rem` tall and fully rounded, orange for reached and bone at
15% for the rest. Labels sit under the bars from `sm` and are replaced on a phone by a single
"Step 2 of 4, Preparing" line, because "COLLECTED" in `12px` caps at `0.14em` wants 78px in a 70px
column and these are single words that cannot wrap. Screen readers get every rung and its state at
every width regardless.

The ladder is drawn only for an order still on it. A stopped order gets no ladder and no code, so it
is visibly a shorter, quieter card.

### The sticky cart bar

Charcoal, pinned to the bottom of the viewport below `lg` only, with a real spacer of the same
height in the flow so it covers nothing. Item count in the display face, running total in orange
mono beneath it, and the button at the right end. It respects `env(safe-area-inset-bottom)` and
carries an upward warm shadow. It hides itself on the cart and on checkout, where its only action
would point back the way the customer just came.

### Navigation

Anton at `0.75rem` with `0.1em` tracking, growing to `0.875rem` from `sm`, set in ink at 70% and
going to full ink on hover. The hover indicator is an orange rule that draws in from the left on a
transform, never a colour change on the text, because orange is unreadable as type on parchment but
perfectly legible as a graphic. Every nav target is at least `2.75rem` tall.

### The heat meter (signature)

Five segments at `0.625rem` by `1rem`, filled from the fixed heat ramp and unfilled in graphite,
followed by the percentage in tabular mono and the level name in Anton. The same component appears
in the wings configurator, on the order confirmation, on the staff ticket and on the printed pickup
slip, with the same five swatches every time. It is the one thing in this interface that could not
be lifted from a template, and it is treated accordingly.

The landing page carries **one** more surface built from the same five swatches, and the number
matters enough to be the rule below. The **heat band** is the ramp itself: five bars ascending left
to right from sm up, each carrying its name, its percentage and the two upcharges, rotating to five
stacked rows with full width bars on a phone. It is the only place on that page where the ramp is
drawn, and it owns the site's one authored animation because it is where somebody is choosing.

It got there in three corrections, and the third returned it to where the first left it, which is
worth recording rather than hiding. The hero and the band were once the same object, both ascending
ramps within two screens of each other, which is a repeat rather than a statement, so they were
split by job: a **hero strip** that stated the scale, and a band flattened into a price list of
rows. Different shapes, same five swatches, and the reveal was given back to the band.

Splitting by job was the right fix to the wrong problem. Two drawings of one fact is a repeat
whatever the shapes are, and the strip was spending the first screen on the third section: a
visitor who has not decided they want wings is being shown a price list's table of contents. So the
strip is gone rather than redrawn. The claim went back into the subhead, where a claim with no
object belongs, and the hero spends its picture on the ink layer instead. See
`components/site/HeroWall.tsx`.

With the strip gone, the band had nothing left to differentiate itself from, and the flattened rows
were a shape adopted to avoid a collision that no longer exists. The ramp is the better drawing of
the product on its own merits: ascending columns say "a scale you move along" in one look, where
rows say "a table you read". So the band is the ramp again, and the reveal ascends with it.

### Named Rules

**The One Heat Surface Per Page Rule.** A level is the same swatch everywhere, and that is the point
of the fixed ramp. The ramp itself is drawn once per page, in the place where somebody is choosing a
level. This replaces an earlier rule that permitted two surfaces provided they differed in shape:
changing the shape of a restatement does not stop it being one, and the second surface is always the
one further from the decision, which is the one to cut.

**The Moment Belongs To The Band Rule.** The five bars extending in sequence is the site's only
authored animation and it lives where somebody is choosing. Nothing else on the landing page draws
the ramp at all now, so the band's entrance is the first time a visitor sees the object move, which
is what the rule was protecting all along.

### The heat rule (signature)

The same five stops as hard bands across the full width, running along the bottom edge of the navbar
at `3px` and the top edge of the footer thicker. It brackets the page in the brand's own scale, ties
the two pieces of chrome together as one material, and gives the navbar a deliberate brand edge
where it meets the hero video. Hard stops, never a blend, keeping faith with the ramp being five
quoted swatches rather than a decoration derived from them.

### The chrome surface

A shared gradient from Cream to Parchment, sized to its element, so the same declaration gives a
subtle wash across an 88px bar and a real fall of light down a 400px footer. Solid, never
translucent: a semi-transparent bar takes a tint from whatever is behind it, so the wordmark's
ground would shift as the page scrolls.

### Named Rules

**The States Differ Structurally Rule.** Before adding a colour to distinguish a state, check whether
the state already differs in structure. A ready order carries an orange heading, orange bars and a
six-line orange code; a stopped one has no code and no ladder at all. A coloured stripe on top of
that says something the screen has already said twice, and one card wearing a stripe that no other
card wears reads as a component from a different product.

**The Press Is Shared Rule.** Anything a finger can press answers with the same 2% scale on the same
timing, whether it is a button, a chip, a flavour tile or a pickup window. Selection controls are not
buttons, but they are pressable, and the feel has to agree.

**The Full Thing Stays On Screen Rule.** A sold-out flavour, a taken pickup window and an
out-of-stock item go flat, not away. Removing them makes the interface look broken and hides the
information that the shop is busy.

## The ink layer

The physical store is a hand drawn New York street scene: black brush marker on white walls,
wrapping the counter and the kiosk bay. Heavy marker outlines on the foreground objects, medium
ruled lines on the building edges, fine dense hatching for the facade texture. The packaging carries
a filled skyline and the logo lockup.

None of that is a palette and none of it is a mood. It is a **material**, and the material is ink.
The site has no white wall to put it on and is not getting one: what it has is a warm printed ground
with dark surfaces on it, and the store's own wall drawing already pressed into that ground as ink
at 10%. Every other motif is the same material at a different size, not a second one. The store
draws in marker on white; the site prints the same drawing in char on the amber, in bone on the
charcoal, and in orange where a graphic accent is wanted.

Everything below follows from that single decision, and so does the fact that the incumbent world
did not move an inch to accommodate it.

The artwork arrived as raster only, at print resolution, with no editable original, so a tracing step
sits between the delivered files and anything shipped. `scripts/trace-mural.ts` is that step and
`public/mural/` is its output. The delivered files stay out of the repository.

**Where it appears.** The 404, where the marquee corner is the whole page. The landing hero, where
the same corner takes the right half of the dark band in bone at full strength, on a wash that puts
the film out of its way (`components/site/HeroWall.tsx`). The empty cart, which gets the traffic
signal, a subject chosen because a signal at rest is what a screen about nothing having moved yet
should show. The no-photo tile, which gets one of three small motifs at 14% behind the item name.
And the footer, which is chrome and carries the filled skyline rather than a line drawing. One scene
per route, and the footer never counts against that.

The landing hero is the placement that answers the obvious objection to using the marquee crop
twice: it carries the shop's name, and the header draws the wordmark eighty pixels above it. The
crop stays because lettering is the one subject that reads better the larger it gets, which is what
a hero-sized bleed does to it, and because a logo doing chrome's job and a street scene with a sign
in it are not the same object. The real duplicate on that screen is the wordmark burnt into the hero
film, which `scripts/build-hero-video.sh` exists to crop off and which the files in `public/video/`
predate.

### Named Rules

**The Ink Layer Takes the Surface's Colour Rule.** A mural asset never carries a colour of its own.
It is traced to `currentColor` and rendered through a CSS mask, so one file serves char on amber,
bone on charcoal and orange as a graphic. A flattened black-on-white export is wrong twice over: on
the amber ground it paints the white rectangle this system does not have, and on a charcoal card it
draws black on black. Note that an SVG loaded through `<img>` cannot do this, because that document
is isolated and `currentColor` resolves against nothing there. The colour is decided at render time
by the surface, because the surface is the only thing that knows what it is.

**The One Drawn Scene Per Page Rule.** The One Heat Surface Per Page Rule, generalised. A heat level
keeps its swatch everywhere and a drawing keeps its lines everywhere, but the same *form* appears
once per page. Two street scenes on one route is not a statement and its restatement, it is a repeat. The
footer's skyline does not count as the second one: it is a filled silhouette off the packaging doing
a mark's job, chrome that brackets every page the way the heat rule does, and a filled emblem is a
different form from a line drawing. Count scenes, not drawings.

**The Hatching Stays Strokes Rule.** Facade hatching is discrete strokes and never a tone. It is
about ten pixels wide against an eighteen thousand pixel source, so scaling a whole scene down to a
phone puts it under one device pixel, and a sub-pixel ink line is a wash. There is no neutral grey
in this system and there is no honest way to arrive at one. The fix is upstream every single time:
crop to a smaller subject, or export a variant with the fine strokes removed at the bitmap by a
morphological opening. A motif that reads at 400px and turns to mud at 64px needs a different
drawing, not a transform. The full street canyon cannot be shown below roughly 1830px with its
hatching intact, which is why no placement shows the full canyon.

**The Drawing Runs Off The Page Rule.** A mural asset is a crop of a wall, so its own boundary is a
straight line that means nothing. Sized to sit inside a column it reads as a framed picture laid on
the page, which is the one thing this artwork must never do. Every large placement therefore bleeds
off the edges of whatever clips it, using `cover` rather than `contain`: `contain` fits the whole
drawing in the box and leaves bare ground around the remainder, which is the framed look arriving by
another route. Any edge left inside the page is faded to nothing rather than cut, by intersecting a
gradient into the mask. Fading lowers the strokes' alpha and never merges them into a tone, and ink
thinning over the amber blends towards amber rather than towards a neutral, so this does not reopen
the grey question.

Two smaller things learned at the same time, both cheap to repeat and expensive to find. Write
`mask-*` and `-webkit-mask-*` from one source: a component that spreads caller overrides over a style
object holding both will silently keep the prefixed default, because the aliases are one property and
the last declaration wins. And a skyline that has to span a width it was not drawn for needs a second
drawing, not a stretch and not a repeat.

**The Drawing Darkens the Ground Rule.** Where the artwork sits behind content it darkens, as ink at
low alpha, the way the wall behind the storefront does at 10%. That is what makes it read as printed
into the page rather than pasted onto it. Where the artwork *is* the content it takes the surface's
reading colour and may therefore lighten, as it does in bone on a charcoal card. The test is whether
anything has to
stay legible on top of it: behind type it darkens, and the alpha is whatever keeps that type above
4.5:1. On the no-photo tile that alpha is 14%, which measures 4.68:1 against char in the worst case,
a solid marker stroke sitting directly behind a letter. Bare orange measures 6.02:1, so the drawing
costs 1.34 of contrast and the budget is what set the number.

The lightening half of that rule has one trap in it, and the landing hero walked into it first. On a
near-black ground a drawing at a middling alpha is a neutral grey: bone at 55% over Char composites
to about `rgb(141,136,130)`, which is the one colour this system does not have. There is no safe
midpoint to tune towards, because the whole interval between the two ends is grey. Either something
sits on top, in which case the drawing goes to a low alpha and darkens, or nothing does, in which
case it runs at full strength in the surface's reading colour. A drawing that feels too loud at full
strength is too large, not too opaque, and the fix is to give it less of the section.

**The Landscape Crop Needs A Landscape Hole Rule.** A mural asset is a wide crop of a wall, and
`cover` scales it by whichever dimension of its box demands more. On a portrait viewport that is
always the height and it is not close: the landing hero's right-hand placement is 1600 by 1187 of
artwork, and a 768x1024 tablet hands it a 399 by 800 hole, which renders the drawing 1078 wide and
throws 679 of that away. What survives is two letterforms and no street. So a placement like this is
gated on `min-aspect-ratio`, not on a width breakpoint, which cannot tell a portrait tablet from a
laptop. Below the gate there is no drawing at all, and that is the correct outcome rather than a
degraded one: on a portrait viewport the copy is the full width of the section, so there is no
region beside it for a wall to occupy anyway.

## Do's and Don'ts

### Do:

- **Do** put dark surfaces on the amber ground. That contrast is the layout, and alternating bare
  ground with full-bleed dark bands is how a page gets its structure here.
- **Do** measure every new colour pair and record the ratio. Every value in this system has one
  behind it.
- **Do** composite a colour through a 1x1 canvas and read the pixel back when checking contrast
  programmatically. Tailwind v4 emits `oklch()` and naive RGB parsing of `getComputedStyle` produces
  fake failures near 1.1:1.
- **Do** use `2.75rem` as the minimum interactive height, everywhere.
- **Do** let the ground set the focus ring, and let the tone prop set it on a control that knows
  better than its surroundings.
- **Do** set text colour on a dark container and let its contents inherit, rather than declaring a
  colour on every leaf.
- **Do** use transform-only hover and press effects, so nothing reflows.
- **Do** use the heat ramp's five fixed swatches wherever a heat level appears.
- **Do** spend motion on the product's own mechanisms rather than on arrivals, and make the drawn or
  finished state the default so no-JS and reduced motion both keep it.
- **Do** let states differ structurally before reaching for a colour to distinguish them.

### Don't:

- **Don't** set Buffalo Orange as type on any light surface. It measures 1.8:1 on the amber ground
  and 2.6:1 on parchment. As a graphic it is fine.
- **Don't** use signage red for anything but the top of the heat scale and a hover accent. A
  destructive fill takes Red Deep.
- **Don't** put orange text on red or red text on orange.
- **Don't** add a border or a shadow to a surface already separated by value.
- **Don't** use a neutral grey anywhere. Not in a shadow, not in a hairline, not in a disabled state.
- **Don't** implement a focus ring as a `box-shadow`. Any component that sets its own shadow
  silently defeats it. Focus is an outline, `3px`, offset `2px`.
- **Don't** set a form control below `16px` on a phone.
- **Don't** set the display face below `0.75rem`, or above `6rem`.
- **Don't** apply a blanket entrance animation to sections as they scroll. Motion is earned by
  meaning here, and a fade applied to seven sections in turn says nothing about any of them. Motion
  that animates the product's own mechanism, the way the heat scale draws its five stops, is exactly
  what this system wants more of.
- **Don't** introduce a second radius scale or a second accent colour.
- **Don't** widen the fourth typeface past the tagline. See The Fourth Face Letters, It Does Not Set
  Rule: it is admitted to letter one fixed phrase and it sets nothing.
- **Don't** ship a mural asset with a colour baked into it, and don't reach for `<img>` to load one.
  Both produce the same failure: a drawing that cannot take its surface's colour, which is a white
  box on the amber ground and an invisible one on a charcoal card.
- **Don't** make a hatched drawing smaller by scaling it. Below about a pixel the strokes stop being
  strokes. Crop to a smaller subject or export a culled variant.
- **Don't** put a drawn scene on the order tracker or the confirmation screen. The States Differ
  Structurally Rule already covers it: those screens say what they are twice over, and a decoration
  on top is a third telling that adds nothing.
- **Don't** paper the site in mural. One drawn scene per page, on pages that have room for one, and
  the amber gradient keeps doing the structural work.
