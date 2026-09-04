"use client";

import {
  BarChart3,
  ClipboardList,
  ExternalLink,
  Handshake,
  History,
  LayoutDashboard,
  ScrollText,
  Settings,
  Store,
  UserRound,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonStyles } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/**
 * The workspace's one navigation bar.
 *
 * WHY THIS IS A CLIENT COMPONENT AT ALL.
 * ================================================================
 * The bar used to be written inline in the server layout, which meant it could
 * not know which page it was on. Eight identical ghost buttons, no current
 * state, no aria-current: a cashier three taps into a shift had nothing on
 * screen telling them whether they were looking at the board or at history,
 * and a screen reader read the row as eight equal links. Knowing the current
 * route needs usePathname, so the bar moved here and the permission decisions
 * stayed on the server, which is the half that must not be guessable.
 *
 * The server therefore hands down a list it has already filtered. This
 * component never asks who you are, only where you are.
 */

const ICONS = {
  dashboard: LayoutDashboard,
  orders: ClipboardList,
  history: History,
  menu: UtensilsCrossed,
  availability: Store,
  settings: Settings,
  analytics: BarChart3,
  audit: ScrollText,
  team: Users,
  leads: Handshake,
  profile: UserRound,
} as const;

export type WorkspaceNavIcon = keyof typeof ICONS;

export type WorkspaceNavItem = {
  href: string;
  label: string;
  icon: WorkspaceNavIcon;
};

/**
 * History lives under /workspace/orders, so a plain prefix test would light
 * both tabs at once, and a plain equality test would leave the board unlit
 * whenever a nested route was added later. Exact match, with the deepest
 * matching item winning, is the rule that holds for both.
 */
export function isCurrent(pathname: string, href: string, items: readonly WorkspaceNavItem[]): boolean {
  if (pathname === href) return true;
  if (!pathname.startsWith(`${href}/`)) return false;
  // A deeper item that also matches owns the highlight instead.
  return !items.some(
    (other) =>
      other.href !== href &&
      other.href.startsWith(`${href}/`) &&
      (pathname === other.href || pathname.startsWith(`${other.href}/`)),
  );
}

export function WorkspaceNav({ items }: { items: readonly WorkspaceNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Workspace"
      className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-4 pb-2 sm:px-6 lg:px-8"
    >
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const current = isCurrent(pathname, item.href, items);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              buttonStyles({
                tone: "dark",
                variant: current ? "secondary" : "ghost",
                className: "px-3",
              }),
              // The current tab carries weight, a lit edge and a rule beneath
              // it. Three signals rather than one, because a counter tablet is
              // read at arm's length in a bright room and colour alone is the
              // first thing that room takes away.
              current &&
                "border-nybb-orange text-nybb-bone bg-nybb-orange/12 hover:border-nybb-orange hover:bg-nybb-orange/20",
            )}
          >
            <Icon aria-hidden className="size-4" />
            {item.label}
          </Link>
        );
      })}
      <a
        href="/"
        target="_blank"
        rel="noreferrer"
        className={buttonStyles({
          tone: "dark",
          variant: "ghost",
          className: "ml-auto px-3",
        })}
      >
        <ExternalLink aria-hidden className="size-4" />
        Storefront
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </nav>
  );
}
