import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The storefront's two link shapes, and the rule about which colour each
 * ground is allowed.
 *
 * `tone` is the ground the link sits on, not the link's own colour. That is
 * the whole point of the component, because the two grounds cannot use the
 * same palette:
 *
 *   dark   The brand orange on ink measures about 5.4:1. It is what every
 *          CTA on this brand has always been, so it stays the primary fill
 *          and the accent link colour on every dark band.
 *
 *   light  The brand orange on the amber page ground measures about 1.8:1
 *          and is unreadable. globals.css already says orange is for dark
 *          surfaces; this enforces it. On amber the primary action is an ink
 *          fill, which separates from the gradient at roughly 11:1, and a
 *          text link is ink with an underline whose weight carries the hover
 *          instead of a colour change.
 *
 * Everything is at least 44px tall, and hover moves colour rather than size,
 * so nothing on the page reflows under the cursor.
 */

type Tone = "dark" | "light";

const ACTION: Record<Tone, Record<"primary" | "secondary", string>> = {
  dark: {
    primary:
      "bg-nybb-orange text-nybb-ink hover:bg-nybb-orange-lit",
    // bone/40 rather than /30: a control's own boundary needs 3:1 to count as
    // visible, and /30 measures 2.6 against ink where /40 measures 3.5.
    secondary:
      "text-nybb-bone border border-nybb-bone/40 hover:border-nybb-bone/75 hover:bg-nybb-bone/10",
  },
  light: {
    primary: "bg-nybb-ink text-nybb-bone hover:bg-nybb-charcoal",
    // Same rule against the amber ground, where ink/25 measures 1.6 and
    // ink/55 measures 3.3. The gradient's darkest stop is what this is
    // checked against, because the ground is fixed and content scrolls
    // through every stop of it.
    secondary:
      "text-nybb-ink border border-nybb-ink/55 hover:border-nybb-ink/85 hover:bg-nybb-ink/5",
  },
};

const TEXT: Record<Tone, string> = {
  dark: "text-nybb-orange decoration-nybb-orange/40 hover:text-nybb-orange-lit hover:decoration-nybb-orange-lit",
  light: "text-nybb-ink decoration-nybb-ink/30 hover:decoration-nybb-ink",
};

/** An internal route goes through next/link; mailto and tel do not. */
function isRoute(href: string) {
  return href.startsWith("/") || href.startsWith("#");
}

export function ActionLink({
  href,
  tone,
  variant = "primary",
  className,
  children,
}: {
  href: string;
  tone: Tone;
  variant?: "primary" | "secondary";
  className?: string;
  children: React.ReactNode;
}) {
  const classes = cn(
    "font-display inline-flex min-h-11 items-center justify-center rounded-md px-6 text-sm tracking-[0.06em] transition-colors duration-200",
    ACTION[tone][variant],
    className,
  );

  return isRoute(href) ? (
    <Link href={href} className={classes}>
      {children}
    </Link>
  ) : (
    <a href={href} className={classes}>
      {children}
    </a>
  );
}

export function TextLink({
  href,
  tone,
  className,
  children,
}: {
  href: string;
  tone: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  const classes = cn(
    "font-display inline-flex min-h-11 items-center text-sm tracking-[0.06em] underline underline-offset-[7px] transition-colors duration-200",
    TEXT[tone],
    className,
  );

  return isRoute(href) ? (
    <Link href={href} className={classes}>
      {children}
    </Link>
  ) : (
    <a href={href} className={classes}>
      {children}
    </a>
  );
}
