import { describe, expect, it } from "vitest";
import { isCurrent, type WorkspaceNavItem } from "@/components/workspace/WorkspaceNav";

/**
 * The bar a cashier reads at arm's length.
 *
 * It carried no current state at all until this pass: eight identical ghost
 * buttons, and a screen reader that announced them as eight equal links. The
 * rule below is the whole of what "current" means, and it is not a prefix
 * test, because History lives underneath Orders and a prefix test lights both.
 */
const ITEMS: WorkspaceNavItem[] = [
  { href: "/workspace", label: "Dashboard", icon: "dashboard" },
  { href: "/workspace/orders", label: "Orders", icon: "orders" },
  { href: "/workspace/orders/history", label: "History", icon: "history" },
  { href: "/workspace/settings", label: "Settings", icon: "settings" },
  { href: "/workspace/profile", label: "Profile", icon: "profile" },
];

function lit(pathname: string): string[] {
  return ITEMS.filter((item) => isCurrent(pathname, item.href, ITEMS)).map((item) => item.label);
}

describe("which workspace tab is the current one", () => {
  it("lights exactly one tab on every route the bar offers", () => {
    for (const item of ITEMS) {
      expect(lit(item.href), item.href).toEqual([item.label]);
    }
  });

  it("does not light Orders as well as History, which share a prefix", () => {
    expect(lit("/workspace/orders/history")).toEqual(["History"]);
  });

  it("does not light the dashboard on every page just because it is the root", () => {
    expect(lit("/workspace/settings")).toEqual(["Settings"]);
    expect(lit("/workspace/orders")).toEqual(["Orders"]);
  });

  it("keeps the nearest tab lit on a child route nothing else claims", () => {
    // A future /workspace/orders/42 belongs to the board, not to History and
    // not to the dashboard.
    expect(lit("/workspace/orders/42")).toEqual(["Orders"]);
  });

  it("falls back to the nearest ancestor tab, never to two tabs at once", () => {
    // /workspace is an ancestor of every workspace route, so it is the last
    // resort when nothing deeper claims one. That only ever happens on a page
    // absent from this person's bar, and the bar is permission-filtered to the
    // pages they can reach, so in practice the exact match above always wins.
    expect(lit("/workspace/availability")).toEqual(["Dashboard"]);
  });

  it("lights nothing outside the workspace at all", () => {
    expect(lit("/checkout")).toEqual([]);
    expect(lit("/")).toEqual([]);
    // A sibling route that merely starts with the same characters is not a
    // child of it, which string prefixes on their own would get wrong.
    expect(lit("/workspace-archive")).toEqual([]);
  });
});
