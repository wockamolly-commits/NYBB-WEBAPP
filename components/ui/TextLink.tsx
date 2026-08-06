import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * A link that is a place you go, not a thing you do.
 *
 * This is the other half of the split that components/ui/Button.tsx describes.
 * The underline vocabulary stays, but it stays only where it is true: the
 * standing invitation beside a section heading, the way back up out of a
 * product page, an email address printed as itself. Everything that performs
 * an action moved to Button, because an underline promises navigation and a
 * control that empties your cart is not navigation.
 *
 * `tone` is the ground, for the same reason it is on Button: orange on the
 * amber page measures 1.8:1, so the accent colour cannot cross grounds. On
 * dark the link is orange and the hover brightens it; on amber the link is
 * ink and the hover is carried by the weight of the underline instead, since
 * there is no second ink to move to.
 */

const TONE = {
  dark: "text-nybb-orange decoration-nybb-orange/40 hover:text-nybb-orange-lit hover:decoration-nybb-orange-lit [--focus-ring:var(--color-nybb-orange)]",
  light:
    "text-nybb-ink decoration-nybb-ink/30 hover:decoration-nybb-ink [--focus-ring:var(--color-nybb-ink)]",
} as const;

/** An internal route goes through next/link; mailto and tel do not. */
function isRoute(href: string) {
  return href.startsWith("/") || href.startsWith("#");
}

export function TextLink({
  href,
  tone,
  className,
  children,
}: {
  href: string;
  tone: keyof typeof TONE;
  className?: string;
  children: React.ReactNode;
}) {
  const classes = cn(
    "font-display inline-flex min-h-11 items-center text-sm tracking-[0.06em] underline underline-offset-[7px] transition-colors duration-200",
    TONE[tone],
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
