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
fainter at the same alpha. The one authored animation on the site is the heat scale's fire, which
is the product's own mechanism burning, not a fade applied to seven sections in turn.

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

**The Counted Thing Is Numbered Rule.** Where a heading claims a count, the list under it is
numbered, so a reader can check the claim instead of taking it. The landing page's branch list runs
`01` to `09` under "9 counters across Cebu", in the same two digit mono form the pickup steps use
eighty lines above it: the page quotes its own device rather than bringing a second one. The index
is `aria-hidden`, because the list element already tells a screen reader how many items it holds
and does not need the count read out nine times. It also gives a plain two column list of small
type a rhythm it had no other way of getting, which is the second reason it is there and not the
first.

The same paragraph makes a second countable claim, that online ordering is open at some number of
the counters, and until recently the list under it could not say which. The rows that take online
orders now carry a short orange caps marker beside their phone number, on the same ground and at
the same ratio as the number itself. The other five carry nothing: the paragraph has already said
the rest take orders on the phone, and a second tag repeating that nine times is The States Differ
Structurally Rule being broken with words rather than with colour. The marker reads "Online" on
screen and "Takes online orders" to a screen reader, because "Mango Avenue, Online" is a riddle.

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
  system. It exists because the sticky bar overlaps the hero and needs to sit above it rather
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
- **The tile's footer row** is 44px on every tile, whether or not it holds a button, with the price
  centred in it, so a row mixing quick-add items with configured ones still puts every price on one
  line. The name above it always gets the full width of the plate and never shares a line with the
  button. The plate's padding is even on all four sides (`0.75rem`, `1rem` from `sm`), which is what
  sits the Add button in the corner with an even margin, centred on the price.
- **The quick-add button** is a 44px square carrying only its icon below `md`, and gains its word
  from `md` up. A phone plate is about 110px wide and cannot hold a price beside "Cart full".

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

Every composite popup in the Workspace opens downward and stays there. The positioner's default is
to flip above the trigger when the window is short, which is right in the abstract and wrong on
these screens: filter rows sit near the top of their pages, so a laptop only a little short of a
desktop fires the flip, and a control that appears above its field on one machine and below it on
the next is a control you have to look for. The side is pinned; only the sideways behaviour still
avoids collisions, which is what keeps a popup inside a 375px screen. Nothing is squeezed to make
this work: a list stops shrinking at 11rem and a calendar is never capped at all, so on a genuinely
short window they run past the fold and the page scrolls to them.

They also sit UNDER the sticky header rather than over it, at `z-30` against the header's `z-40`
and page content's `z-20`. An anchored panel travels with its field, so a popup that outranked the
header slid up and painted over the workspace nav as soon as the page scrolled, covering the logo
and the links. Passing behind the header is what every other anchored thing on a scrolling page
does, and nothing is lost by it: the panel opens downward, away from the header, so it is never
clipped while the field it belongs to is on screen.

Workspace date fields are the same rule applied to the calendar. The field itself stays a real
`<input type="date">`, so it keeps segmented entry, typed dates and its `YYYY-MM-DD` value, but the
browser's own panel is switched off and `components/ui/WorkspaceDateField.tsx` draws the calendar.
That is not decoration. Chrome renders its panel in a widget layer no stylesheet reaches, welded to
the bottom edge of the control, so on the analytics filter card it opened with no gap and the card's
edge running behind it, which read as a rendering fault rather than as a menu. Owning the popup is
the only way it can have a gap, an alignment and the workspace's material. It uses the same Base UI
positioner as the dropdown, at the same `10px` offset from the field and aligned to the field's left
edge rather than to the small button that opens it, so a calendar and a dropdown on one row open the
same distance from their fields and obey the same rule about which way they open. The panel is
Charcoal on the same real edge, six rows always so it cannot change height as you page, the selected
day is Buffalo Orange with Ink text, and today is signage yellow when it is not the selection.

All three date filters in the Workspace use it: analytics, the audit log and order history. The one
native date control left is the sold-out hold's `datetime-local`, which is why the shell still
themes the browser's picker indicator.

The Workspace shell also themes the browser surfaces around those controls: caret and selection,
scrollbars, checkbox and radio states, file buttons, ranges and date-picker indicators. New admin
screens therefore inherit one control language even before they need a dedicated component.

Scrollbars are the one surface that has to be stated twice, by engine rather than stacked, and the
reason is worth knowing before anybody edits them. `scrollbar-width` and `scrollbar-color` are the
standard pair, and the moment either is set, Chrome hands the scrollbar to its own renderer and
ignores every `::-webkit-scrollbar` rule on the page. That renderer draws stepper arrows and offers
no property to turn them off. The workspace asked for a thin bar in one place and a graphite track
in another, and got a Windows stepper bar wearing the project's colours, most visibly as a ten pixel
band with a grey button at each end running the full width of the header under the navigation. So
Chrome and Safari take the `::-webkit-scrollbar` rules, which can dismiss the buttons by name, and
Firefox takes the standard pair inside an `@supports not selector(::-webkit-scrollbar)` block.
Neither engine sees both.

The navigation row then takes a second, quieter treatment on top of that, as `.scroll-rail`: no
track, a six pixel bone thumb, sitting inside the row's own bottom padding. It keeps a scrollbar
rather than hiding one, because how much of the row you can see and where in it you are looking are
real facts and nothing else in the header carries them. The row also scrolls its current tab into
view on every route change, which is the fact the highlight carries and was regularly parked off
screen on a tablet.

### The delete confirmation

The Workspace's one interrupting surface, and one of the system's two dialogs (the other is the
branch sheet below). It is a native
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

### The branch sheet

The detail each card on `/contact` opens: a map, the address, the numbers, the week of hours, and
the two things somebody does next. `components/branches/BranchDirectory.tsx` is the implementation.
It is the delete confirmation's material at a larger size, and it shares that dialog's backdrop,
edge and 140ms rise from the same selectors rather than restating them.

- **Map first.** On a phone the map takes the top of the sheet at 4:3 and the details scroll beneath
  it; from `md` it takes the left half at full height. It is the one thing on the sheet the card did
  not already say. The frame mounts only when the sheet opens, so a visitor who opens nothing sends
  Google nothing, and it fades in over a graphite placeholder rather than flashing white.
- **A pin or the street, never a guess.** `pin` in `lib/catalog/branches.ts` is read off the
  branch's own Google listing. A branch whose listing could not be told apart from its neighbours
  maps from its address and says so in one line under it.
- **The card is the target.** The name is a button whose `::after` covers the plate, so the whole
  card opens the sheet while the phone numbers sit above that layer and still dial. The focus ring
  is drawn on the card, in ink, because a ring around the name would say the name is the control.
- **Hours are a table, Monday first, today marked twice**: a bone tint across the row and the word
  TODAY in signage yellow, because a tint alone is colour carrying a meaning. Times are mono so the
  column aligns. A week nobody has published is one dashed-border sentence, not seven "Not set" rows.
- **Open or shut is shape and colour**: a filled orange dot with "Open now", a bone ring with "Closed
  now". Shown only for a counter this platform is live on, because for the others nobody can say.
- **Actions stick to the foot** of whatever is scrolling, on a charcoal fill with a bone at 15% rule.
  Get directions is the primary fill, because somebody who opened a map is asking how to get there;
  Call is secondary. They stack on a phone with Directions on top.
- **Focus opens on Close**, named explicitly, because Chrome counts a scrollable box as focusable and
  `showModal()` otherwise lands on the sheet's scroll container.

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

**The Control That Has A Twin Names Its Own Scope Rule.** When the same question is asked at two
scopes, each control says which scope it is and points at the other. The item editor's global switch
read "On the menu", which named no menu, and the per-counter control reads "sold out", which names
no counter, so a person looking at either had no way to tell the other existed. They are now "Sell
this item at all", whose hint ends by naming Available at, and "Available at", whose rail sends a
person wanting a timed hold back to the menu list. Neither label is longer than the one it replaced;
they are just about something.

The corollary is that the narrower control does not grow a copy of the wider one. "Available at"
sets and lifts, and the hold it writes is always the indefinite kind, because the question that
screen answers is "do we sell this here". The three hold kinds and their time picker stay on the
menu list, where the person with the empty fryer already is. Two full implementations of one
control do not stay identical, and the day they diverge is the day the two screens disagree about
what an item's state is.

**A Small Set Of Choices Is Not A Table.** The sold out control spent an hour as the workspace
table, a Counter / Now / Selling here grid rendered once per item card, and it was wrong three ways.
A table puts a counter's name at the far left of a 1400px card and its own tick box at the far
right, so the two things that belong together sit as far apart as the card allows and the eye
crosses the screen to answer "is this one on". Its header printed the column names once per card, so
a menu of forty nine items printed them forty nine times, which is the fault the options screen was
rebuilt to remove reappearing one level up. And a "Now" column reading "Available" beside a ticked
box is one fact said twice, on every row of every item.

The table earns its columns when fifteen rows have to line up and be compared. Two counters hanging
off one item are not that: they are a small set of choices, which is the selection control family.
So each counter is a bordered box carrying its own mark and its own name, wrapping, the shape the
item editor already uses for Featured. State is printed only where there is state, because a ticked
box has already said the rest.

The corollary, once a field opens per choice: it goes under the group, not inside a cell. Inside
one, the "back on" stack made that cell 120px tall, the grid's bottom alignment sank the row's other
contents to the foot of it, and two open rows read as a broken page. Under the group, the counter
names become a fixed first column so the fields share a left edge instead of each starting wherever
its own label ended, and the hint that belongs to the field rather than to any counter is stated
once for the group.

**One Piece Of State Gets One Control.** Sold out had two: a cashier's on the menu list with three
hold kinds and a time picker, and an owner's tick box table on the item editor with neither. Sharing
their wording and their layout made them look alike, which was an improvement and not the fix. Two
controls for one piece of state is two vocabularies, two layouts, two things to keep in step, and a
person having to learn which screen does which. There is one now.

Which screen keeps it is decided by permission, not by taste. A cashier holds `menu:availability`
and not `menu:configure`, and the item editor is behind `menu:configure`, so a control that lived
only there would be unreachable by the people who use it most, in the middle of the shift it exists
for. It lives on the menu list; the editor states the item's current state in the same words and
links to it.

The three hold kinds collapsed into a box and an optional time, because `today`, `until` and
`indefinite` differ only in whether there is an end and what the screen called it when it was set.
So the control asks the two questions that decide it, is this counter selling the item and when
does it come back, and the action derives the stored kind. Nothing is lost from the audit trail and
nobody is asked to classify their own answer. The time field renders only where it can apply: beside
a counter that is still selling the item it is a field with nothing to say, which is what the old
control showed permanently, greyed, next to the control that had already disabled it.

**One State, One Sentence, Wherever It Is Read.** The menu list and the item editor both show
whether a counter is selling an item, and each wrote its own words for it. The list said "Sold out
at Central Bloc" for an indefinite hold AND for one ending at 6pm, so the two were indistinguishable
on the screen a cashier actually works from, while the editor distinguished them. They now build
that sentence from one function, `branchStatusLine`, and the date formatter they had a copy of each
is also one function. A second screen describing shared state in its own words is not a wording
choice, it is a second definition of the state, and it drifts.

The same pass put the list's control on a fixed grid. It was a `flex flex-wrap` row, so it sized
itself from its own contents and landed differently on every card in a list of forty items, which
is the fault the workspace table section describes and the whole of why that screen read as sloppy
beside the editor. That pass stopped at making the two look alike; the rule above is where it ended
up, with one of them gone.

**A Repeated Action Becomes A Column And One Save.** "Available at" shipped first as a Stop selling
button on every row, acting on the press. That reads fine against one counter and badly against
nine: taking an item off four of them was four presses, four writes and four audit rows for what
the person held in their head as one decision, with no way to change their mind between the first
press and the last. It is now a tick box column and a single Save, which is the shape the per size
price grid already arrived at from the same argument, and it carries that grid's two conditions:
only the changed rows are sent, so an untouched counter is never rewritten, and the action does not
stop at the first failure, so a counter this person may not act on costs that counter and not the
other three. The Repeated Save Is Quiet Rule still applies to the one button that remains: quiet
until something has changed, and it names how many counters are about to move.

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

### The landing hero

A full bleed picture under a light scrim, with the type bottom aligned on it and carrying its own
ink. The picture is a three slide dissolve (`components/site/HeroSlideshow.tsx`): the store's seven
second food film, then its two delivered wall murals, then round again.

**What moves between slides is opacity and nothing else.** No push, no slow zoom. The film moves
because it is a film; the dissolve into and out of it takes 1.2 seconds.

**What moves within a slide is the phone's window onto the mural, and only there.** The murals are
16:9 and a phone hero is about 390 by 658, so a mural scaled to cover it is 1170 wide and a third of
the artwork fits. No framing solves that: both murals put the food on the left and a panel of
display type on the right, and a slice from the middle is a column of half letters. So below `xl`
the picture sits at its natural width and the hero is a window travelling across it, left edge to
right edge, once, over the whole time the slide is up. About 780px in 12.2 seconds, which is 64 a
second, or a sixth of the viewport: a camera move rather than a transition, and it ends having shown
everything.

This is not the Ken Burns drift the first rule is written against. That is motion added to a picture
that already fitted; this is the only way a picture that does not fit is ever seen whole. Nothing
moves from `xl` up, because from `xl` up there is nothing that does not fit.

The mechanism is `.hero-pan-track` and it computes its own travel: the track takes the hero's height
and the mural's ratio, so `calc(-100% + 100cqw)` is exactly the overhang at any viewport, with
nothing measured in JavaScript and nothing written down. It collapses to zero on its own when the
picture is no longer wider than the hero. `prefers-reduced-motion` parks it at `panRest`, a quarter
in, which is the fixed framing the phone had before there was a pan. Pause freezes it where it
stands rather than ending it.

**A panning still sets its own length too.** A stationary still holds six seconds. A panning one
holds eleven, because it has a beginning and an end and cutting away halfway is the same edit the
film's twelve second backstop exists to avoid. The film holds until it has finished playing: the
hero advances on the video's `ended` rather than on a clock, and is rewound to its first frame
coming back round. Three answers, one function, `slideHoldMs`.

**The murals are re-laid out, not cropped, and the wordmark is out of them at source.** The print
files are 3:1 and 2.7:1 at up to 29370px wide, which is a wall, and no crop of a wall is a hero. A
build that grew each print mural onto a 2.05:1 canvas by washing its own edges outward shipped in
between and worked, but it was a machine rebuilding a composition. The murals are supplied at 16:9
with the composition arranged for that shape, and with the Hot Wings lockup removed by the designer,
which retires the crop that used to take it off: the header draws that lockup eighty pixels above
the hero, and two of them on one screen is the duplicate The One Drawn Scene Per Page Rule is
written against. `scripts/build-hero-slides.ts` now only resizes and encodes. 16:9 is still not the
section's shape, so from `xl` the browser takes 13 to 22 percent off the height; `objectPositionWide`
holds the picture above centre so what goes is the floor rather than the display panel.

**The ink is on the letters, and the scrim is what is left over.** Both murals are shot on a pale
ground, one grey and one near white, and the brightest patch under the copy column measures 249 of
255. Bone at 60% over that needs its ground held at about 77% ink to clear 4.5:1, and a scrim that
heavy is a scrim that covers the artwork: on the eating mural it landed squarely on the woman the
photograph is of, and on a phone, where the copy spans the width, it covered the picture outright.

So the budget moved onto the type, and four moves between them took the scrim from 90% ink at the
foot to 66, and from 72% five hundred pixels up to 10 at 530 and nothing by 580:

- **`.hero-type` is a halo, not a wash.** Four ink stops sized in ems of whatever they are set on, so
  the ground a glyph is measured against is ink at the one place the measurement happens, which is
  the pixel beside the letterform, and the picture two words over is untouched. Each radius takes a
  `max()` against a pixel floor, because at 14px a proportional halo lands inside the antialiasing.
- **The hero's copy does not spend contrast on hierarchy.** The lede was bone at 75% and the status
  line at 60, which is right on a surface whose ground the page owns and wrong on a photograph:
  lighter type on a pale wall is worse type, and those alphas were costing 19 points of ink
  underneath. They are bone and bone at 85, and size does the ranking it was already doing.
- **`.hero-keyline` makes the orange headline a graphic.** Buffalo Orange measures about 1.0:1 on the
  spread mural's wall and no halo reaches far enough to fix that, so the old scrim held 73% ink at
  380px up purely to keep one line orange. The keyline is the ink outline the store's own wordmark
  is drawn with, which is what The Orange Is For Dark Rule already permits orange to be on a light
  ground. `paint-order: stroke fill`, for the reason `.tagline-inked` gives.
- **The tagline takes a heavier keyline in the hero only.** It sits at the top of the copy block,
  which is the one height the ramp no longer reaches. 0.1em here against the artwork's own 0.05em,
  which the footer and the About page keep, because their grounds are the ones it was drawn for.

What is left is `.hero-ramp`, settling the copy block onto the floor of the section rather than
holding a ratio on its own:

- **Lengths, not percentages:** 66% at the foot, 58% at 300px, 55% at 400px, gone by 580px, measured
  up from the section's floor. The copy is a fixed block sitting on that foot, so how far up it
  reaches depends on how tall the section is: 500px of type is 79% of a 702px hero and 56% of an
  842px one. A ramp in percentages is measured for one window and wrong in the other, which is how a
  headline that cleared 6:1 at 1920x1080 measured 1.9:1 at 1280x800.
- **Longer and very slightly heavier from `xl`, because it is also narrower there:** 70% at the
  foot, 46% at 330px, 30% at 470px, gone by 650px. The extra reach is what carries the tagline,
  which sits about 500px up in an 842px hero, where the ramp below `xl` has already run out.
- **Masked toward the right from `xl`:** solid to 40% of the width, gone by 72%. That hands the
  mural's display panel back whole, and it is what lets the left of the ramp be longer without the
  picture paying for it. Both ends are further apart than they need to be, because a mask edge is a
  straight vertical line drawn across a photograph and the eye finds those.

Under it a flat hold at 6% at every width, which is a grade rather than a cover, and against the
amber band a 72px `.hero-foot`. The foot used to be a sixth of each picture faded into ink by the
build script, which meant the artwork paid for the section's bottom edge and the depth that survived
depended on how much height that viewport happened to crop: 194px in the file, 56 of it left at
1920x1080. In the stylesheet it is the same depth on every screen and costs the mural nothing.

A diagonal ramp was tried and rejected: `to top right` on a wide box points mostly upward, so the
corner it hands back is the top left, where the murals put a face and a drink, and the band it drags
across the middle is where the headline's second half sits.

**The hero keeps its minimum height on a phone**, which is what leaves a part of the picture that no
type stands on. The give-back keys on viewport height rather than width, like everything else on
this section: under 500px tall the minimum goes, which is the landscape phone. It used to key on
width, where the effect was to shrink a portrait phone's hero to exactly its copy, so every pixel of
the mural was behind the scrim. At 390x844 the difference is 147px of artwork that nothing covers.

Measured on all three slides at 1920x1080, 1440x900, 1280x800, 390x844 and 844x390, and on the
panning slides at five points across the traverse, against the pixels that border a glyph rather
than the block the copy sits in. A haloed glyph is only ever ground at its own edge, and a target's
neighbourhood is grown from its own letterforms: measured from every painted pixel in the crop, the
orange half of the headline was being read against the ground around the bone half on the line
above.

**Three controls on one plinth, bottom right.** Previous, pause, next, as icon buttons on an ink
bar with a bone ring and hairline dividers, because a control that sits on a picture cannot know
what is behind it and the ghost tier is transparent at rest. Pause is what WCAG 2.2.2 (Level A)
requires of motion that starts by itself and runs past five seconds, and it is a real focusable
button reached before the two CTAs. Previous and next are there for everyone, including the visitor
with `prefers-reduced-motion` set, who is never moved automatically and for whom they are the only
way to see the other two pictures. Their labels count: "Next picture, 2 of 3".

**A metered link is asked to pay for one picture.** The poster is the LCP element and is
unconditional. The film is 540 KB and the murals about 170 KB between them, so `isMetered` in
`lib/site/connection.ts` gates the film, the timer and the prefetch: that visitor gets the poster,
and a mural only if they press next.

### Navigation

Anton at `0.75rem` with `0.1em` tracking, growing to `0.875rem` from `sm`, set in ink at 70% and
going to full ink on hover. The hover indicator is an orange rule that draws in from the left on a
transform, never a colour change on the text, because orange is unreadable as type on parchment but
perfectly legible as a graphic. Every nav target is at least `2.75rem` tall.

### The promo bar

An ink band directly under the navbar, carrying the running promo's code in the display face and
its sentence in bone at 70%. It is the one place on the storefront where a dark surface sits
against the chrome rather than against the amber ground, and that is what makes it read as a
notice rather than as another section.

The only orange is a `3px` rule at the left end, as a graphic and never as type, because orange
measures 1.8:1 on amber and 2.6:1 on parchment. The message is one link and the dismiss is a
separate `2.75rem` square button beside it: two targets, not a button nested inside a link, and at
320px the sentence truncates while the code never does, because the code is the payload.

**It is not a live region**, and that is the ReorderNotice rule applied rather than broken. That
rule is about content arriving after first paint, which has to be announced. This is server
rendered from a cookie and present at first paint, so a `role="status"` on it would read an advert
aloud on every page of the site. It is an `aside` with a label, which is a landmark somebody can
skip.

**It does not animate in.** An arrival has to be about the thing arriving, and a bar sliding down
says nothing about the promo. It is simply there, and then it is scrolled past.

**It sits below the sticky header rather than inside it**, so it is seen on arrival and then
leaves. A bar inside `sticky top-0` would be pinned to the viewport for the whole session, which
is the difference between noticeable and obtrusive.

### The heat meter (signature)

Five segments at `0.625rem` by `1rem`, filled from the fixed heat ramp and unfilled in graphite,
followed by the percentage in tabular mono and the level name in Anton. It reports a level that has
already been decided: the order confirmation, the staff ticket, the printed pickup slip and the
Workspace heat mix. Where somebody is still deciding, the scale is the slider below instead. Same
five swatches either way, which is the whole point of the fixed ramp.

The landing page carries **one** more surface built from the same five swatches, and the number
matters enough to be the rule below. The **heat band** is the ramp itself, drawn as one bar you
drag: hard bands in the five fixed swatches, lit up to whichever stop the thumb is on, with the
level name and its percentage below. It is the only place on that page where the ramp is drawn, and
it owns the site's one authored animation because it is where somebody is choosing.

It got there in four corrections, and the third returned it to where the first left it, which is
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

**And then the fourth correction, which is the one that stuck.** "A scale you move along" was the
right sentence and the band still would not let anybody move along it. Five bars side by side are
a picture of a scale: they state all five answers at once, which is a price list of the product
rather than the product. So the band is now one bar you drag, and the bar burns up to wherever you
put it. Same five swatches, same hard bands, same percentages; the difference is that the customer
supplies the position instead of reading five of them.

The heat scale is two components. `components/menu/HotnessMeter.tsx` is the picture: a glass tube
holding the five fixed swatches, a fire standing on the lit run, and the level names under their
segments. It takes a `score` (0 to 100), `animated`, `showParticles` and a `size` of `small`
(cards), `medium` (panels) or `large` (a full width band), and owns no choice.
`components/menu/HeatSlider.tsx` is the control: it lays the invisible range input over the meter's
tube and keeps every rule about what a position means. It is not to be confused with
`components/menu/HeatMeter.tsx`, the five small static segments described above.

The slider comes in two shapes. The **band** (`large`) is the landing page's full bleed moment,
with the chosen level set at the major heading step. The **inline** shape (`medium`) is the compact
instrument panel used on the wings category page and in the configurator, where it is the actual
control and not a picture beside one.

The inline shape always sits on an ink plate, never directly on the amber page. The ramp runs
signage yellow to red and is built for an ink ground; on amber the cold half of it washes into the
background. This is not a preference, it is the same measurement that governs orange as type here:
bone on the amber ground is 1.8:1, which is what made the heat meter's percentage unreadable on the
menu page for as long as it was drawn there.

The control itself is a real `<input type="range">` lying invisible over the artwork, with the
painted bar `aria-hidden` beneath it. Drag, tap, arrow keys, Home, End and a screen reader
announcing "Wild, 80 percent" all come from the platform rather than from a hand-rolled
`role="slider"`.

### How the meter is drawn

**The tube is an object, not a ramp.** A recessed channel in the site radius (the channel inside it
takes the radius less the housing's `2px` padding, so the two curves stay concentric), the five
fixed swatches inside it dimmed to 13% as unpowered filament, the same swatches lit up to the
pointer, a hot filament line through the lit run that brightens toward the pointer, and a sheet of
glass over the lot: a specular band across the top third and a thin return of light along the
bottom. The lit segments carry their own lighting overlay, bright along the top and falling off at
the bottom, so each reads as a lit volume. The swatches themselves are never recoloured; the light
is an overlay on the brand colour, which is what keeps a level the same swatch on a receipt.

**The pointer is a glass needle** standing through the tube, bone with a highlight on one side,
sitting in a radial pool of the level's light. It glides on a spring (`stiffness 210, damping 19`),
which overshoots the target by a few percent and settles, and it rides a full width rail translated
by the fill, so it moves by transform and never touches layout. One animated `--fill` value drives
the pointer, the lit run, the fire's mask and the particles, so they cannot drift out of step.

**Every level is a different fire, not one fire at five brightnesses.** Colour temperature, height,
the share of the fire that has rising licks, and how far the light carries all change together:

- **Lite** is a pilot light: small yellow tongues, no licks at all, a soft yellow glow.
- **Moderate** is warm amber, and the first few licks lift off it.
- **Hot** is an orange fire with a full body, most of its licks, and the first embers.
- **Wild** runs red into the edges, stands taller, and throws twice the embers.
- **Insane** is the tallest: a white base with a trace of blue where it is hottest, red crowns,
  sparks among the embers, and heat haze (the layers waver a fraction of a degree on clocks of
  their own, and a faint column of warm air rises above the crowns).

Particles are capped at 18 at the largest size and do not exist below Hot.

**The fire is layered tongues, and each tongue is one box.** A low **body** layer that never goes
out and carries the flicker in its sway, a layer of taller **licks** that are born at the tube,
rise, narrow and go out, and a **surge** of fast licks that only burns while somebody drags. Every
tongue is a soft silhouette (an SVG mask with the blur baked in, so the soft edge costs nothing per
frame) painted with two gradients: an ellipse of white hot light at the base, and the body running
from the level's core colour to nothing at the tip. Tongues are screened against each other inside
an isolated group, because overlapping flame adds light; on normal compositing translucent orange
over black accumulates toward brown. A continuous **bed** of flame along the tube is what makes the
tongues rise out of one burning line instead of standing on it as separate candles.

Positions, heights, widths, leans and timings are hashed with integer operations, never
`Math.sin`, because the meter renders on the server and hydrates in the browser. Which tongues are
lit at each level is ranked by the golden ratio, so a partial fire is spread along the bar rather
than filling in from one end.

**What went wrong on the way, because every one of these looks reasonable written down.**

- **Squashing the whole fire to shorten it made triangles.** The first version sized each level by
  scaling the fire group vertically, and a flame that loses height and keeps its width is not a
  small flame, it is a hump. Each tongue now scales about its own base, narrower as well as shorter.
- **Uncapped widths made humps anyway.** A tongue's width is a share of the bar, and the bar is
  70rem on a desktop band. Widths are capped against the flame height, so a tongue is always
  clearly taller than it is broad.
- **Striped haze read as a screen effect.** Heat haze drawn as faint horizontal striations looked
  like scanlines. Haze is movement and a warm column now, never a texture.
- **A custom property inside a keyframe costs the compositor.** Chrome cannot run a keyframe that
  reads `var()` off the main thread. With sixty tongues, a lean written as
  `skewX(calc(var(--lean) * 8deg))` inside the animation was measurable. Every keyframe is literal;
  the variation between tongues lives in static properties (`rotate` for the lean, `scale` for the
  mirror and the level, the box for the size), which compose with the animated `transform`.
- **Every animated layer counts.** A second masked element per tongue for the inner light, with its
  own flicker, took the meter from 60 to 33 frames a second at Insane on a 4x throttled CPU, for a
  difference nobody could see at speed. The inner light is a gradient on the tongue now, and the
  meter holds 60.

**Every stop in the fire's mask is a fraction of `--fill`, never a fixed percentage.** A fixed one
shipped in the slider before this: the ramp's middle stop sat at `38%`, which is past the fill at
Lite (20%) and Moderate (40%), and CSS clamps a gradient stop that falls before the one in front of
it. Both later stops collapsed onto 38%, and the fire ran a third of the way along a bar that was
only a fifth alight, ending in a hard vertical edge.

### Named Rules

**The One Heat Surface Per Page Rule.** A level is the same swatch everywhere, and that is the point
of the fixed ramp. The ramp itself is drawn once per page, in the place where somebody is choosing a
level. This replaces an earlier rule that permitted two surfaces provided they differed in shape:
changing the shape of a restatement does not stop it being one, and the second surface is always the
one further from the decision, which is the one to cut.

**The Living Heat Source Rule.** The meter's fire is the site's only authored animation. It burns
at rest, burns harder under a hover or focus, and surges while somebody drags. Nothing else on the
landing page draws the ramp at all, so this is the first and single time a visitor sees the object
move.

This replaces The Moment Belongs To The Band Rule, which gave the moment to the five bars extending
in sequence as the section arrived. (Part of that rule came back on 2026-09-21, under conditions
that keep its retirement's reasoning. See The Showcase Hands Over Rule.) The rule was right that the motion belongs where somebody is
choosing, and wrong about what choosing looks like. An entrance plays once, to nobody in particular,
and says exactly what the bars already said standing still; a visitor who scrolled past during it
never saw it at all. The band's job is to make somebody understand that heat is a thing you pick an
amount of, and the way to say that is to let them pick one. So the moment moved from the section's
arrival to the customer's own hand.

That rule then said **the flame never idles**, on the grounds that a looping flame is an animation
running at a visitor whether or not anybody is there. The owner reversed it (September 2026): a
still silhouette read as a static UI element, and the scale is meant to feel like a living heat
source. The reversal keeps the restraint the old clause was protecting, as rules rather than as a
ban:

- **At rest the fire is subtle.** The licks burn at reduced opacity and slightly lower; hover and
  focus bring them to full, and dragging lifts the whole fire and lights the surge layer.
- **Nothing loops visibly.** Every tongue and particle runs on its own hashed duration and offset,
  body, licks, haze and particles on separate clocks, and no group moves as one.
- **It stops when nobody can see it.** The meter pauses every loop when it is scrolled off screen,
  and under `prefers-reduced-motion` it draws a complete still fire with no loops and no particles.
- **Movement is transform and opacity only**, with literal keyframes. See How the meter is drawn.

### The heat rule (signature)

The same five stops as hard bands across the full width, running along the bottom edge of the navbar
at `3px` and the top edge of the footer thicker. It brackets the page in the brand's own scale, ties
the two pieces of chrome together as one material, and gives the navbar a deliberate brand edge
where it meets the hero. Hard stops, never a blend, keeping faith with the ramp being five
quoted swatches rather than a decoration derived from them.

### The chrome surface

A shared gradient from Cream to Parchment, sized to its element, so the same declaration gives a
subtle wash across an 88px bar and a real fall of light down a 400px footer. Solid, never
translucent: a semi-transparent bar takes a tint from whatever is behind it, so the wordmark's
ground would shift as the page scrolls.

### The landing band's head

The heat band was a heading over a half width paragraph, a great deal of nothing, and then the bar.
Two thirds of its width carried nothing at any height, and the readout, which is set at the major
heading step because it is the section's real headline, sat under the bar in the bottom left corner
a reader has already left.

It is now a two column row over a full width instrument. The section's heading and standfirst on the
left, the live readout on the right, a bone hairline across the band under both, and the bar hanging
off the bottom of that rule. The right hand column is the only thing on this page that answers back,
so it is the one that gets the empty half.

**The readout outranks the heading**, at `clamp(3rem, 7vw, 5.5rem)` against the heading's
`clamp(2.25rem, 5vw, 3.5rem)`. The headline is a fixed sentence and the readout is the live one.
It stays under the hero's own step, because the first screen keeps the largest type on the site.

**The level wears its own swatch**, transitioned on the meter's own 450ms so the word changes colour
on the same clock the bar does. DESIGN.md asks for the ramp's five fixed colours wherever a heat
level appears, and this is the largest place one appears anywhere. Measured, Heat 5 is the darkest
at 4.60:1 on bare Char and 4.20:1 on the lit ground the readout sits on; the name is set between
48px and 88px, so the bar to clear is 3:1, and the coldest stop clears 14.77:1. "Pick a level" is
not a level and stays bone.

**The heading crosses as a prop, not as a sibling.** The level somebody is holding can only be drawn
by the component that owns the value, so putting the readout on the headline's line means the
heading comes into the control. Server rendered nodes cross into a client component as a prop
without becoming client code, so the heading is still a server component and `HeatSlider` still owns
nothing but the control. See its `heading` prop.

**The sweep's observer moved down with it.** It watches the scale rather than the component root,
because a root that now contains a headline would start the demonstration several hundred pixels
early, to somebody still reading the standfirst. The element it watches has the top edge the root
used to have, so the trigger geometry is the one that was tuned. See The Showcase Hands Over Rule.

### The dark band surface

The chrome has been a material since the day it was drawn. The dark bands were not: they were
`bg-nybb-ink`, a flat `#0b0b0c` rectangle, and they are the two largest surfaces on the landing
page. On a page whose whole thesis is ink printed on a warm ground, the two places the ink is
thickest were the only ones with no material in them, and at a metre back they read as holes cut in
the page rather than as panels laid on it.

A band now carries `.band-ink`: Char, a dither, and whatever light the thing inside it throws. It
does not carry the chrome's wash, and the reason is worth keeping. The chrome falls from light at
the top because light in a room comes from above. A band's light does not: it comes from the object
inside the band that is burning or lit, and in both of these that object is low and off to one
side. A full width linear wash was built first and thrown out for saying the opposite, because it
lifted the heat band's top left corner, which is the one part of that band where nothing is alight.
A warm haze behind a headline with no source is the decoration this system does not ship.

The dither is not the ground's. `body::after` covers exactly what the body gradient covers and sits
at `z-index: -1`, so the page's grain stops at a band's top edge, and a band has no dither of its
own until it is given one. It needs one now: a field below crosses about two dozen levels over six
hundred pixels, and an unbroken ramp that shallow in near black is the worst case an 8-bit panel
has. Undithered it arrives as concentric rings. The band's grain is the same fractal turbulence as
the ground's with one change: the ground's is drawn through `overlay`, which over a near black
backdrop resolves to roughly twice the backdrop times the noise and moves a channel by under half a
level, so near black the noise has to add rather than blend. It is composited normally, and the
colour it adds is warm, because a dither brought in to protect a warm panel must not be the thing
that greys it. Measured on the rendered page, it moves Char by at most one level.

### The printed tooth

The bands' black was still a flat value with a light on it, which at a metre back is a flat value.
It now carries the wall's own hatching: cross hatched marker strokes, in the band material rather
than in either band, one declaration the way `.surface-chrome` is one declaration.

**Strokes, and not a scene.** The Ink Layer says every motif in this system is the same material at
a different size and never a second one, and this is the smallest size that material comes in. It is
deliberately not a drawing: the landing page already carries the store's wall in the hero, and the
empty cart's traffic signal was withdrawn for putting a motif on a page whose background already
held that motif. Hatching is the wall's texture without the wall's subject, so it adds no second
scene to count.

**The ink is Buffalo Orange, and that is not a free choice.** The drawing is char on the amber and
bone on a charcoal card, and neither works on Char. Bone at a low alpha over Char is the grey trap
The Drawing Darkens the Ground Rule names: 8 percent composites to `rgb(30 29 30)`, a neutral
arrived at by the back door. Orange at the same alpha composites to `rgb(29 18 12)`, warm brown, and
orange is already admitted as a graphic on dark. A texture is a graphic.

**The pitch is set by The Hatching Stays Strokes Rule.** 2px strokes on an 11px pitch, crossed by a
second pass at 17px, drawn at that size rather than scaled down from anything, so a stroke is two
device pixels at 1dppx and four at 2 and can never thin into the wash that rule exists to prevent.
A third pass at forty times the pitch gathers the weave into broad soft swathes with no hard stop
anywhere in it, because marker hatching is laid in passes and an even field of it is a fabric.

**The mask measures the empty margin in the container's own units.** Full weight at the viewport's
outer edges, fading to an eighth of it by the content column: the stops are `calc(50% ± 38rem)`,
which is half the container plus its gutter, so there is a 64px buffer between the last strong pixel
and the first glyph at every width. A percentage was there first and was wrong on a phone, where the
copy runs the full width and the outer thirds landed squarely behind the branch addresses at 4.47:1.
Below about 1216px those stops fall outside the box, CSS clamps a decreasing stop to the one before
it, and the band flattens to the low weight on its own. A narrow viewport has no bare margin to
decorate, so that is the right answer rather than a degraded one.

### The screened glow

The warm fields are smooth CSS radials, and a smooth radial is the one thing the object this system
is modelled on cannot do. A press lays down solid ink or none; everything between is a screen of
dots that shrink as the tone falls away. So the light in these bands breaks into a dot screen where
it runs out.

That is the justification and it also fixes the geometry. The screen is a ring, not a disc: nothing
in the core, where the tone is solid enough to print flat, and nothing outside the falloff, where
there is no ink to screen. What is left is a band of dots around each light, which is a second
register against the line work of the hatching and lands in the part of the band that was emptiest.

A staggered grid rather than a square one, two passes offset by half a cell, because a square screen
moires against the cross hatching under it and 45 degrees is what a press would use anyway. Dots are
drawn at 1.4px on a 9px cell, the same stroke floor The Hatching Stays Strokes Rule sets for the
lines: under a device pixel a screen stops being dots and becomes the grey this system does not
have.

**The screen is what the whole background costs**, and it is the only layer here that spends any
contrast at all. The rings were opened at 13 percent and pulled back to 11 with tighter falloffs,
because at 13 the branch addresses measured 4.57:1 and this system does not ship a number that close
to its own floor without a reason.

### The band material off the landing page

The sign in page is the third surface built on `.band-ink`, and it takes the ground, the hatching,
the grain and the dot screen. It was `bg-nybb-charcoal`, the one flat dark rectangle left outside
the material, and a customer arriving from the heat scale met a different black.

**It gets no `band-lit`.** A warm field is spill light, The Lit Thing Lights Its Ground Rule anchors
one on whatever in the band is burning, and a sign in page holds a heading, a paragraph and a form.
A field there is the light with no lamp that same rule already turned down once, in the empty bottom
right of the counters band.

**The screen travels without it, in the other shape a screen comes in.** On the two landing bands it
is a ring, and a ring is the shape of a light running out: solid ink in the core, dots through the
falloff, nothing past it. With no light there is no falloff to break up, and a ring drawn here would
be a halo around nothing. So `.band-screen-signin` is a flat tint instead, which is the other thing
a press does with a screen: a dot field laid into the empty part of the sheet. Same 1.4px dot on the
same 9px staggered cell, because the screen is one material and this must not become a second one.

Its two fields are anchored off the top and bottom edges rather than floated in the middle, so they
stay on the edges at any section height and the clear span between them is proportional. That span
always holds the centred column, which is what keeps the heading, the paragraph and the card out of
the dots whether the page is 620px tall or 1080.

The hatching needs nothing adapting because its mask was never written in percentages. The stops are
`calc(50% ± 38rem)`, which is half a `max-w-6xl` container plus its gutter, and the sign in page is
a `max-w-6xl` container: the form sits in the protected zone at the same 64px buffer the landing
page's copy does, at every width, with no page-specific rule.

Measured on the rendered page with every glyph set to `transparent`, at 1920x1080, 1440x900, 390x844
and a deliberately short 1440x620. The headline never drops below 15.35:1, the standfirst at bone 65
below 7.09:1, and the card copy at bone 60 holds 5.81:1 at every size, because the card is opaque
graphite and the screen behind it is not in the picture at all.

**`.band-ink` is a dark ground for the focus ring too.** The ring colour is keyed off the background
utility so a dark surface flips it from ink to orange, and `.band-ink` paints Char through a class
of its own rather than through `bg-nybb-ink`. Left off that list it would have given the sign in
page's button an ink ring on ink, and it had already done so on both landing bands, where the heat
slider is a focusable control. It is on the list now.

### What the finished bands measure

Read off the rendered page with every glyph set to `transparent`, so each figure is the real ground
inside that run's own box rather than its antialiasing. Every decorative layer in, at three widths.

| Run | Set in | 1920 | 1440 | 390 |
| --- | --- | --- | --- | --- |
| Heat headline | bone | 14.68:1 | 14.85:1 | 14.99:1 |
| Heat standfirst | bone 65 | 6.92:1 | 6.95:1 | 6.90:1 |
| Heat caption | bone 55 | 5.42:1 | 5.32:1 | 5.35:1 |
| Branches standfirst | bone 65 | 6.93:1 | 6.91:1 | 7.28:1 |
| Branches addresses | bone 50 | 4.66:1 | 4.66:1 | 4.69:1 |

The binding constraint is the branch addresses, 12px at bone 50, and the whole background is built
around keeping them above 4.5. The hatching costs them nothing, because the mask puts it outside the
column. The screen costs them 0.16.

### Named Rules

**The States Differ Structurally Rule.** Before adding a colour to distinguish a state, check whether
the state already differs in structure. A ready order carries an orange heading, orange bars and a
six-line orange code; a stopped one has no code and no ladder at all. A coloured stripe on top of
that says something the screen has already said twice, and one card wearing a stripe that no other
card wears reads as a component from a different product.

**The Press Is Shared Rule.** Anything a finger can press answers with the same 2% scale on the same
timing, whether it is a button, a chip, a flavour tile or a pickup window. Selection controls are not
buttons, but they are pressable, and the feel has to agree.

**The Lit Thing Lights Its Ground Rule.** A dark band is ink on paper, not a void, so anything in it
that is burning or lit throws a wide warm field onto the band behind it. Fire that lights nothing is
a sticker, and a photograph of a shopfront under lit orange signage sitting in flat black is a
rectangle with a hard edge rather than a lit room.

Four conditions, and the first two are what keep this from being a glow filter.

- **The field must have a source, and the source decides where it goes.** The heat band's field
  pools under the bar and is tallest over the hot end, because that is where Wild and Insane are and
  because heat rises. The branches band gets exactly one field, anchored on the photograph in its
  left column. A second one was tried in that band's empty bottom right, where an odd branch count
  leaves the list ragged, and it was the discarded linear wash wearing a different shape: a light
  with no lamp. That corner stays dark, which is the honest answer.
- **The source decides the colour, and the two are never swapped.** The heat band takes the ramp's
  own swatches because the thing alight in it is the scale. The branches band takes Buffalo Orange
  because the thing alight in it is a shopfront under the store's own signage.
- **It is weather, not an object.** Wide radials bleeding off the band's edges, sized in percentages
  of the band so a phone gets the same composition rather than a blob. A halo has a boundary, and a
  boundary makes it a thing on the page.
- **It never quotes a level.** Spill light is not a sixth stop, so The One Heat Surface Per Page
  Rule is untouched.

The budget was read back off the rendered page rather than intended. No field is written above 9
percent; where the heat band's two overlap its ground measures `rgb(35 27 24)`, warm brown and not
the neutral grey this system does not have, and the branches band's one field peaks at
`rgb(28 20 15)`. The tightest pair on either band is the heat band's caption, bone at 55, at 5.68:1
on the band's own Char and 5.41:1 on the core of the field. Every band paragraph is bone at 65 and
none drops under 7. The whole material costs about a quarter of a contrast ratio, and 9 percent is
where the caption's floor put the ceiling rather than a taste. See `.band-ink`, `.band-lit`,
`.band-lit-scale` and `.band-lit-counter` in globals.css.

**The Full Thing Stays On Screen Rule.** A sold-out flavour, a taken pickup window and an
out-of-stock item go flat, not away. Removing them makes the interface look broken and hides the
information that the shop is busy.

**The Arrival Says What The Content Is Rule.** A passage may animate as it comes into view only
where the movement says something the still version does not. This replaced a flat ban on scroll
entrances (September 2026), and it keeps the ban's reasoning by turning it into a test rather than
a prohibition.

The test is whether the arrival could be swapped onto the section next door without anybody
noticing. If it could, it is decoration and it does not ship.

What passes on the landing page: the ten flavours, the featured tiles and the nine counters. Each
of those is a list, and a list arriving one item after another is the shape of the content moving,
so the motion is the page saying "there are ten of these" before the reader has counted. What does
not pass, and carries no marker in the markup: How pickup works, which is four instructions and not
a sequence of objects, and the franchise line, which is one sentence.

**A whole section may also arrive as one object, and that is the second passing shape.** Added for
About, Branches and the counter picker on 2026-09-23 at the owner's request. Those pages carry one
list each at most, the nine counter cards and the three counted facts, and the rest is prose: under
the list test alone the About page would have had no motion at all past its own fold.

The permission is narrow and the width of it is the whole point. A section rises once, complete,
heading and body and photograph together, and says "here is the next part", which is true of it. A
section whose paragraphs fade in one after another says "this is a list", which is false, and that
is the sentence the original ban was written against. It is still banned. The test above is
unchanged: an arrival that could be swapped onto the section next door without anybody noticing is
decoration, and a passage staggering itself is exactly that swap made visible.

The landing page was left alone in this pass. Its sections are separated by a change of material,
bare ground against full-bleed dark band, and that change already does the work an arrival would be
doing. About and Branches are one continuous ground with a hairline rule between sections, so there
the arrival is the only thing marking the join.

**A board is one object and a grid of cards is many, which is where the counter picker splits from
the directory.** Both pages list the same nine counters. The Branches directory draws them as
separate plates with gaps between them, so a wave through them is the list's own shape moving and it
takes `.reveal-stagger`. The picker draws them as rows welded into one charcoal board by `divide-y`
and clipped by its own rounded corners, which `StoreList.tsx` argues for at length: same-size boxes
made the page read as a brochure of shops when it is a choice between kitchens. Staggering those
rows drifts the hairlines against one another and leaves the bottom row clipped by `overflow-hidden`
while it still carries its offset, so the board arrives whole. The shape of the arrival has to agree
with what the markup says the thing is.

The rules the passing cases still answer to:

- **The wave is capped.** 40ms a step to seven steps, so the tenth tile and the ninetieth both
  finish starting inside 280ms. Past that it stops being one movement and becomes a queue. See
  `lib/site/reveal.ts`, which is in `lib/` so the cap can be tested.
- **The finished state is the default.** Nothing in the stylesheet hides anything. The hidden state
  keys on a `data-reveal` attribute that only `components/site/ScrollReveal.tsx` writes, and that
  component returns early under `prefers-reduced-motion` or a missing `IntersectionObserver`. No
  script, no crawler and no reduced-motion reader ever waits for a fade to be given the content.
- **Nothing arrives twice.** Each group fires once and its observer disconnects. A section that
  faded back out on the way up would be reporting scroll position, not content.
- **A group already on screen is never hidden.** An entrance played to somebody looking at the
  finished thing is the exact failure The Moment Belongs To The Band Rule was retired for.
- **The dark bands move as heavier material.** A band's contents rise 36px over 760ms against a
  light section's 24px over 640ms, because alternating bare ground with full-bleed dark bands is
  how this page is built and two different materials should not move identically.
- **The heat scale arrives already moving.** Asked for by the owner on 2026-09-21. The block lifts
  in with the band and the thumb starts climbing 80ms later, while the fade is still running, so
  the scale is never seen standing still first. It steps from the coldest stop up to where an
  untouched showcase rests, naming Lite, Moderate and Hot in the readout as it passes each one, and
  is done inside 340ms. This ran as two separate beats for one day, the block landing and the scale
  then performing, and the owner read the gap as lag: by the time the scale moved they had already
  looked at it and were waiting for it to do what the copy beside it promised. See The Showcase
  Hands Over Rule, which is what keeps any of this from being the thing the system threw out.
- **Focus reveals a group outright.** Every group here holds something focusable, and a reader
  tabbing down the page reaches it before the scroll does. Waiting for an observer would put a
  focus ring on an invisible control. See `components/site/ScrollReveal.tsx`.

**The Showcase Hands Over Rule.** The landing page's heat scale plays itself once as it arrives.
This is The Moment Belongs To The Band Rule coming back, and the half of that retirement which was
right is written into the conditions rather than thrown away with it. The retirement said the
moment belongs to the customer's hand. So this is a demonstration that hands over, and every one of
these is load bearing:

- **It shows the picking, not the picture.** The thumb steps through real stops and the readout
  names each one, because what the scale has to say is that heat is an amount you choose. The five
  bars do not extend in sequence: the tube is drawn whole, as it always was, and what moves through
  it is the thumb. A single slide to the end would move the bar and never name what it passed.
- **A hand ends it.** A pointer or a key stops it where it stands, because the reader's own value
  is already arriving in a change event. Focus stops it and lands on the resting stop, because
  tabbing here carries no value and the alternative is leaving somebody holding whichever stop the
  sweep was passing through.
- **It never plays to somebody already watching.** A scale in view when the page loads is left
  alone. A control that rearranges itself in front of you is not a demonstration, it is a glitch.
- **It cannot repeat and it cannot loop.** The observer disconnects on the first crossing and no
  second schedule exists.
- **It is off by default.** Only the uncontrolled showcase sweeps. A slider that belongs to
  somebody's order is never moved on their behalf, which is a different act entirely.
- **The travel is capped, not fixed.** A longer ramp steps faster rather than running longer, so
  the whole thing finishes inside 700ms however many stops there are, and can never drift toward
  the five seconds that WCAG 2.2.2 would make us ship a pause control for.
- **The gap goes between the moves, never in front of the first one.** A gap in front is a wait,
  and a wait in front of an introduction is the introduction not starting.
- **The opening state is never shipped.** The server still renders the scale resting on Hot, so no
  JavaScript, a crawler and reduced motion all get what they got before. Winding back to the cold
  stop happens before paint, on a block that is below the fold.

See `heatSweepSteps` in `lib/menu/heat-slider.ts`. Inside the scale, the Living Heat Source Rule
still owns everything.

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
the film out of its way (`components/site/HeroWall.tsx`). The no-photo tile, which gets one of
three small motifs at 14% behind the item name.
And the footer, which is chrome and carries the filled skyline rather than a line drawing. One scene
per route, and the footer never counts against that.

The empty cart carried the traffic signal once, and it was withdrawn. The wall behind every
marketing page already has signals in it, so the cart restated its own background at a different
size and weight, and in a column with its crop edges showing it was the framed picture The Drawing
Runs Off The Page Rule forbids. The empty cart is now a charcoal card under the counter bar, with the
heat scale quoted as five ascending bars beside the message (`HeatSteps` in
`components/cart/CartView.tsx`). A drawing is not the default answer to an empty state; the test is
whether the page already shows the same form. The bars are the one ramp on that route, which keeps
The One Heat Surface Per Page Rule: nobody chooses a level on the cart, so there is no second surface
for them to restate, and they go the moment a line is added.

The landing hero is the placement that answers the obvious objection to using the marquee crop
twice: it carries the shop's name, and the header draws the wordmark eighty pixels above it. The
crop stays because lettering is the one subject that reads better the larger it gets, which is what
a hero-sized bleed does to it, and because a logo doing chrome's job and a street scene with a sign
in it are not the same object. The duplicate to watch for on that screen is a second wordmark in the
picture behind the type, which is why both the retired film and the murals that replaced it are
cropped before they ship: `scripts/build-hero-video.sh` cut the mark that was burnt into the film,
and `scripts/build-hero-slides.ts` cuts the panel each mural carries it on.

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
- **Do** give a dark band a source before you give it any warmth. The field comes from the thing in
  the band that is burning or lit, it takes that thing's colour, and a corner with nothing in it
  stays dark. See The Lit Thing Lights Its Ground Rule.
- **Do** mask a background texture against the container rather than against a percentage of the
  viewport. `calc(50% ± 38rem)` knows where the column is at every width and a percentage does not,
  and the widths where they disagree are the phone widths where the copy runs edge to edge.
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
- **Do** spend motion on the product's own mechanisms first, and make the drawn or finished state
  the default so no-JS and reduced motion both keep it. An arrival is allowed on top of that only
  where it passes The Arrival Says What The Content Is Rule.
- **Do** keep keyframes literal. A `var()` inside a keyframe keeps the animation off the compositor;
  put per-element variation in static properties beside the animated `transform`.
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
- **Don't** apply an undifferentiated entrance animation to sections as they scroll. This clause
  used to ban section entrances outright. The owner narrowed it on 2026-09-21, and the half that
  was right is the half that is kept: a fade applied to seven sections in turn says nothing about
  any of them, because it is the same sentence spoken seven times. What the ban was reaching for is
  that an arrival has to be about the thing arriving. Narrowed once more on 2026-09-23 to let a
  whole section arrive as one object on the prose pages; what stays banned either way is staggering
  a passage's paragraphs as though they were a list. See The Arrival Says What The Content Is
  Rule.
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
