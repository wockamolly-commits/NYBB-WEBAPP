import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The storefront's buttons. One recipe, worn by a <button> or by a link.
 *
 * WHAT THIS REPLACES, AND WHY IT HAD TO BE ONE THING.
 * ================================================================
 * There used to be an ActionLink that only knew how to be an anchor, so
 * every real <button> in the app wrote its own look. The orange fill was
 * copy-pasted as a raw class string into four files, and it had already
 * drifted: one was min-h-12, one min-h-11, one carried duration-200 and one
 * did not. Worse, actions that were neither loud nor outlined had nowhere in
 * the system to live, so "Empty the cart", "Add something else" and "Back to
 * the cart" all fell out of it into bare underlined text. CartView even wrote
 * the correct rule in a comment ("a link is a place you go rather than a thing
 * you do") and then broke it twenty-five lines further down.
 *
 * The missing piece was a quiet tier. The system went loud, outlined, then off
 * a cliff to plain text. `ghost` is that tier: full button geometry, no weight
 * at rest, a tinted ground under the cursor. It is what lets a secondary action
 * be quiet without being invisible.
 *
 * TONE IS THE GROUND, NOT THE BUTTON'S OWN COLOUR.
 * ================================================================
 * That distinction is the whole reason this is a component. The two grounds
 * cannot share a palette:
 *
 *   dark   Brand orange on ink measures 5.4:1. It is what every CTA on this
 *          brand has always been, so it stays the primary fill on ink and
 *          charcoal.
 *
 *   light  The same orange on the amber page measures 1.8:1 and is
 *          unreadable. globals.css already says orange is for dark surfaces.
 *          On amber the primary action is an ink fill, which separates from
 *          the gradient at roughly 11:1.
 *
 * Tone also carries the focus ring, because the ring's neighbours are the
 * ground on both sides once it is offset. See the note in globals.css.
 *
 * GEOMETRY IS SHARED SO THE TIERS READ AS ONE FAMILY.
 * ================================================================
 * Every variant is the same height, radius, face and tracking. Only weight
 * changes between them. That is what makes a row holding a danger button and
 * a ghost button read as two ranks of one control rather than as two unrelated
 * widgets, which is exactly what the cart footer used to look like.
 *
 * Nothing here changes size on hover, so nothing reflows under the cursor. The
 * press is a 2% scale, which is composited and does not touch layout, and
 * globals.css already zeroes the duration under prefers-reduced-motion; the
 * variant below also pins the scale back to 1 there, because a duration of
 * zero on a transform still moves it, just instantly.
 */

/**
 * The press, for controls that are not buttons in the CTA sense.
 *
 * The size chips, the flavour tiles, the option rows and the pickup windows
 * are selection controls: they carry aria-pressed and their look is owned by
 * whether they are chosen, so they cannot be a Button variant. What they can
 * share is the answer to a finger, and they should, because a screen where
 * some things respond to a press and others do not reads as half-built.
 */
export const PRESSABLE = [
  "transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out",
  "active:scale-[0.98] active:duration-75 motion-reduce:active:scale-100",
].join(" ");

const button = cva(
  [
    "font-display relative inline-flex shrink-0 items-center justify-center gap-2",
    "rounded-md text-sm leading-none tracking-[0.06em] whitespace-nowrap select-none",
    "transition-[background-color,border-color,color,transform] duration-200 ease-out",
    // The press should answer immediately and release lazily, which is what
    // makes a control feel connected to the finger rather than animated.
    "active:duration-75 active:scale-[0.98] motion-reduce:active:scale-100",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:active:scale-100",
  ],
  {
    variants: {
      tone: {
        dark: "[--focus-ring:var(--color-nybb-orange)]",
        light: "[--focus-ring:var(--color-nybb-ink)]",
      },
      variant: {
        primary: "",
        secondary: "border",
        ghost: "",
        /**
         * Quiet at rest, red the moment you engage it.
         *
         * The first cut of this was a solid red fill, and it was wrong in a
         * way the screenshot made obvious: on the cart it came out louder
         * than "Choose a pickup time", so the page's own hierarchy said the
         * thing to do here was throw the order away. A destructive action is
         * rare and secondary, and it cannot outrank the action the screen
         * exists for.
         *
         * Red only on engagement is also the only thing the palette allows.
         * Against the amber ground, signage red measures 1.66:1 and the deep
         * red 2.29:1, so red cannot be a hairline, a label or an icon out
         * here: a fill is the sole form it can legibly take. Rest is
         * therefore ink, and the fill arrives on hover, on focus and under a
         * finger, which is precisely when it is needed.
         *
         * It still carries a border at rest, at the same weight as secondary.
         * The first quiet version was borderless, and borderless on this page
         * is indistinguishable from a caption: the amber ground is so light
         * and so saturated that nothing subtle survives on it, ink at 40%
         * measuring 2.3:1 against the gradient. There is no soft plate
         * available here, only a real edge or nothing, and "nothing" is the
         * bug this whole pass exists to remove.
         *
         * So the two cart-footer controls are peers in weight, and what
         * separates them is the trash icon, the words, and the fact that one
         * of them turns red the instant you go near it.
         */
        danger: [
          "border hover:border-transparent focus-visible:border-transparent",
          "hover:bg-nybb-red-deep hover:text-nybb-bone",
          "focus-visible:bg-nybb-red-deep focus-visible:text-nybb-bone",
          "active:bg-nybb-red-deeper active:text-nybb-bone active:border-transparent",
        ].join(" "),
      },
      size: {
        // 44px, the touch target floor, and the height everything in a row
        // with a quantity stepper has to match.
        default: "min-h-11 px-5",
        // The full-width commitment at the bottom of a card. Taller and wider
        // rather than louder, because it is already the only fill in view.
        lg: "min-h-12 px-7",
        // Square, and on the same 44px floor as everything else here.
        //
        // This used to be 42px, derived from the quantity stepper's outer
        // height when that stepper's own buttons were 40px. Deriving one
        // control's size from another control's mistake carried the mistake
        // into three screens: the cart, the workspace shell and the hero
        // video, all of which had a sub-floor icon button. The stepper's
        // buttons are now 44px too, so its group stands 2px taller than this
        // square; centred in a flex row that difference is not visible, and
        // matching a neighbour was never worth being under the floor for.
        icon: "size-11 px-0",
      },
      block: {
        true: "w-full",
        false: "",
      },
    },
    compoundVariants: [
      {
        tone: "dark",
        variant: "primary",
        class:
          "bg-nybb-orange text-nybb-ink hover:bg-nybb-orange-lit active:bg-nybb-orange-lit disabled:bg-nybb-bone/15 disabled:text-nybb-bone/60",
      },
      {
        tone: "light",
        variant: "primary",
        class:
          "bg-nybb-ink text-nybb-bone hover:bg-nybb-charcoal active:bg-nybb-graphite disabled:bg-nybb-ink/12 disabled:text-nybb-ink/45",
      },
      {
        // bone/40 rather than /30: a control's own boundary needs 3:1 to count
        // as visible, and /30 measures 2.6 against ink where /40 measures 3.5.
        tone: "dark",
        variant: "secondary",
        class:
          "border-nybb-bone/40 text-nybb-bone hover:border-nybb-bone/75 hover:bg-nybb-bone/10 active:bg-nybb-bone/15 disabled:border-nybb-bone/15 disabled:text-nybb-bone/35",
      },
      {
        // The same rule against the amber ground, where ink/25 measures 1.6
        // and ink/55 measures 3.3. Checked against the gradient's darkest
        // stop, because the ground is fixed and content scrolls through every
        // stop of it.
        tone: "light",
        variant: "secondary",
        class:
          "border-nybb-ink/55 text-nybb-ink hover:border-nybb-ink/85 hover:bg-nybb-ink/5 active:bg-nybb-ink/10 disabled:border-nybb-ink/20 disabled:text-nybb-ink/35",
      },
      {
        tone: "dark",
        variant: "ghost",
        class:
          "text-nybb-bone/70 hover:text-nybb-bone hover:bg-nybb-bone/10 active:bg-nybb-bone/15 disabled:text-nybb-bone/35",
      },
      {
        // ink/75 composited on the darkest stop of the gradient measures
        // 5.2:1, so the quiet tier is quiet by weight and not by being
        // half-legible.
        tone: "light",
        variant: "ghost",
        class:
          "text-nybb-ink/75 hover:text-nybb-ink hover:bg-nybb-ink/8 active:bg-nybb-ink/12 disabled:text-nybb-ink/35",
      },
      {
        // Bone on the deep red measures 5.2:1 engaged and 6.8:1 pressed.
        // Disabled goes grey rather than pale red: a washed-out red still
        // reads as a warning, and a warning you cannot press is a bug report.
        variant: "danger",
        tone: "dark",
        class:
          "border-nybb-bone/40 text-nybb-bone/75 disabled:border-nybb-bone/15 disabled:bg-transparent disabled:text-nybb-bone/35",
      },
      {
        variant: "danger",
        tone: "light",
        class:
          "border-nybb-ink/55 text-nybb-ink/85 disabled:border-nybb-ink/20 disabled:bg-transparent disabled:text-nybb-ink/35",
      },
    ],
    defaultVariants: {
      tone: "light",
      variant: "primary",
      size: "default",
      block: false,
    },
  },
);

type ButtonStyleProps = VariantProps<typeof button>;

export function buttonStyles({
  className,
  ...variants
}: ButtonStyleProps & { className?: string }) {
  // cva owns `className` as a passthrough of its own, so it is taken out here
  // and merged afterwards instead. tailwind-merge is what lets a call site
  // override a variant's colour without fighting it on specificity.
  return cn(button(variants), className);
}

export function Button({
  tone,
  variant,
  size,
  block,
  className,
  type = "button",
  ...props
}: React.ComponentProps<"button"> & ButtonStyleProps) {
  return (
    <button
      type={type}
      className={buttonStyles({ tone, variant, size, block, className })}
      {...props}
    />
  );
}

/** An internal route goes through next/link; mailto and tel do not. */
function isRoute(href: string) {
  return href.startsWith("/") || href.startsWith("#");
}

export function ButtonLink({
  href,
  tone,
  variant,
  size,
  block,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"a">, "href"> & ButtonStyleProps & { href: string }) {
  const classes = buttonStyles({ tone, variant, size, block, className });

  return isRoute(href) ? (
    <Link href={href} className={classes} {...props}>
      {children}
    </Link>
  ) : (
    <a href={href} className={classes} {...props}>
      {children}
    </a>
  );
}
