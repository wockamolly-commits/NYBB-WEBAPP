---
name: NYBB Order
description: A warm printed ground, black stamped type, and a five-stop heat scale, for a Cebu wing house that sells hotness by the percent.
colors:
  griddle-amber: "#f7a70f"
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
it hard enough to read across a counter. A buffalo pressed into the paper rather than printed over
it. And a five-stop heat scale printed along the edge, top and bottom, bracketing everything in
between. Once that image is in mind, every rule in this document follows from it: why the ground is
loud, why the chrome is parchment instead of white, why the mark darkens rather than lightens, and
why nothing floats.

Hot, printed, engineered. The ground is genuinely saturated, and that is the brand: the live site
samples at 237 instances of the orange against 183 of black, so a timid neutral page would be a
different restaurant. What keeps a saturated page from reading as a flyer is that every loud move
is governed by a stated rule with a measured number behind it. The orange is unusable as type on
this ground at 1.8:1, so it is never type on this ground. The focus ring is ink on light and orange
on dark because the ring's neighbours are the ground on both sides once it is offset. The
destructive red is two steps down its own hue because signage red cannot carry a label.

Nothing in this system is decorative by accident. The grain exists because a gradient this smooth
bands on an 8-bit panel. The buffalo is a single bold silhouette because a detailed engraving
collapses into a smudge at watermark opacity. The one authored animation on the site is the heat
scale drawing itself, which is the product's own mechanism moving, not a fade applied to seven
sections in turn.

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
  as light and starts reading as a very tall image.
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

Depth that does exist is pressed rather than stacked. The buffalo mark is a dark silhouette in the
gradient's own hue at 9% opacity, so it darkens the ground rather than lightening it and reads as an
emboss in the paper. The chrome gradient makes the bar read as the ground lit from the front.

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

Two further expressions of the same object, and the difference between them is how much of the
decision they support. The **heat band** on the landing page is the full one: five ascending bars in
a tall track, each carrying its name, percentage and both upcharges, and it owns the page's single
authored animation. The **hero strip** is the compressed one: the same five swatches and the same
ascending read at a fraction of the height, with the names and percentages but no prices and no
motion. The strip states that heat is sold on a scale; the band is where somebody chooses a level.
Neither is a decoration derived from the other, and a level is the same swatch in both.

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
- **Don't** introduce a second radius scale, a second accent colour, or a fourth typeface.
