"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * One link in the header's main nav, marked when it is the page being read.
 *
 * A client island only because the current path lives in the router. The
 * header around it stays a server component, which it has to be: it reads the
 * session cookie.
 *
 * The current page wears the hover's orange rule permanently, at full ink.
 * Orange cannot be type on parchment (2.6:1), so the marker is the same
 * graphic the hover already draws, which keeps "you are here" and "you could
 * go here" one visual idea. `aria-current` carries it for a screen reader.
 */
export function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const current = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "font-display hover:text-nybb-ink after:bg-nybb-orange relative inline-flex min-h-11 items-center text-xs tracking-[0.1em] transition-colors duration-200 after:absolute after:inset-x-0 after:bottom-[0.6rem] after:h-[2px] after:origin-left after:rounded-full after:transition-transform after:duration-200 hover:after:scale-x-100 sm:text-sm",
        current ? "text-nybb-ink after:scale-x-100" : "text-nybb-ink/70 after:scale-x-0",
      )}
    >
      {children}
    </Link>
  );
}
