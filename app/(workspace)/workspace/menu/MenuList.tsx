"use client";

import { Search, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { PRESSABLE } from "@/components/ui/Button";
import { WorkspaceFieldLabel, WorkspaceInput } from "@/components/ui/WorkspaceField";
import {
  MENU_STATUS_FILTERS,
  MENU_STATUS_FILTER_LABELS,
  browseMenu,
  isUnfiltered,
  menuBrowseSearch,
  parseMenuBrowseParams,
  type MenuBrowseState,
} from "@/lib/staff/menu-browse";
import type { ManagedMenu } from "@/lib/staff/menu-types";
import { cn } from "@/lib/utils";
import { MenuItemRow } from "./MenuItemRow";

const CHIP = "rounded px-2 py-1 text-xs font-semibold uppercase tracking-wider";

const UNFILTERED: MenuBrowseState = { query: "", categoryId: null, status: "all" };

/**
 * The menu list: a search, two filters, and the items they leave.
 *
 * The filters live in the URL as well as in state, written with
 * history.replaceState (which Next integrates with its router), so opening an
 * item and pressing Back lands on the same filtered list rather than on the
 * top of fifty items. replaceState rather than pushState, because a history
 * entry per keystroke would make Back walk through the search one letter at a
 * time.
 *
 * The starting state is read from the address on the client, not handed down
 * from the server. Back restores this route from the router's cache, which
 * holds the render from before anything was typed, so a prop would bring the
 * list back unfiltered under an address that says otherwise.
 */
export function MenuList({
  menu,
  can,
  actingBranchId,
}: {
  menu: ManagedMenu;
  can: { configure: boolean; availability: boolean };
  actingBranchId: string | null;
}) {
  const searchParams = useSearchParams();
  const [state, setState] = useState<MenuBrowseState>(() =>
    parseMenuBrowseParams(Object.fromEntries(searchParams), menu.categories),
  );
  const searchRef = useRef<HTMLInputElement>(null);
  const result = useMemo(() => browseMenu(menu.categories, state), [menu.categories, state]);
  const filtered = !isUnfiltered(state);

  const search = menuBrowseSearch(state, menu.categories);
  useEffect(() => {
    if (window.location.search === search) return;
    window.history.replaceState(null, "", `${window.location.pathname}${search}`);
  }, [search]);

  function update(patch: Partial<MenuBrowseState>) {
    setState((current) => ({ ...current, ...patch }));
  }

  return (
    <div className="mt-7">
      <div role="search" className="bg-nybb-charcoal space-y-5 rounded-md p-4 sm:p-5">
        <div>
          <WorkspaceFieldLabel htmlFor="menu-search">Search the menu</WorkspaceFieldLabel>
          <div className="relative mt-2">
            <Search
              aria-hidden
              className="text-nybb-bone/60 pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
            />
            <WorkspaceInput
              ref={searchRef}
              id="menu-search"
              type="search"
              value={state.query}
              maxLength={80}
              autoComplete="off"
              placeholder="Item name, code, size or category"
              onChange={(event) => update({ query: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Escape" && state.query !== "") {
                  event.preventDefault();
                  update({ query: "" });
                }
              }}
              className="mt-0 pr-12 pl-10 [&::-webkit-search-cancel-button]:appearance-none"
            />
            {state.query !== "" ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  update({ query: "" });
                  searchRef.current?.focus();
                }}
                className="text-nybb-bone/70 hover:text-nybb-bone absolute top-1/2 right-0 grid size-11 -translate-y-1/2 place-items-center rounded-md"
              >
                <X aria-hidden className="size-4" />
              </button>
            ) : null}
          </div>
        </div>

        <FilterGroup label="Show">
          {MENU_STATUS_FILTERS.map((status) => (
            <FilterChip
              key={status}
              active={state.status === status}
              count={result.statusCounts[status]}
              onClick={() => update({ status })}
            >
              {MENU_STATUS_FILTER_LABELS[status]}
            </FilterChip>
          ))}
        </FilterGroup>

        <FilterGroup label="Category">
          <FilterChip
            active={state.categoryId === null}
            count={Object.values(result.categoryCounts).reduce((sum, n) => sum + n, 0)}
            onClick={() => update({ categoryId: null })}
          >
            All categories
          </FilterChip>
          {menu.categories.map((category) => (
            <FilterChip
              key={category.id}
              active={state.categoryId === category.id}
              count={result.categoryCounts[category.id] ?? 0}
              onClick={() => update({ categoryId: category.id })}
            >
              {category.name}
            </FilterChip>
          ))}
        </FilterGroup>
      </div>

      <div className="mt-5 flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p role="status" className="text-nybb-bone/70 text-sm">
          {filtered
            ? `Showing ${result.shown} of ${result.total} ${result.total === 1 ? "item" : "items"}`
            : `${result.total} ${result.total === 1 ? "item" : "items"} in ${menu.categories.length} categories`}
        </p>
        {filtered ? (
          <button
            type="button"
            onClick={() => setState(UNFILTERED)}
            className="text-nybb-orange min-h-11 text-sm underline underline-offset-2"
          >
            Clear search and filters
          </button>
        ) : null}
      </div>

      {result.sections.length === 0 ? (
        <div className="border-nybb-bone/30 mt-4 rounded-md border border-dashed p-6 text-center">
          <p className="font-display heading-panel">Nothing matches</p>
          <p className="text-nybb-bone/65 mt-2 text-sm">
            {state.query.trim() !== ""
              ? `No item matches "${state.query.trim()}" with these filters. Check the spelling, or clear the filters to search the whole menu.`
              : "No item fits these filters."}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-8">
          {result.sections.map(({ category, items }) => (
            <section key={category.id} aria-labelledby={`menu-category-${category.id}`}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 id={`menu-category-${category.id}`} className="font-display heading-minor">
                  {category.name}
                </h2>
                <span className="text-nybb-bone/60 font-mono text-sm">
                  {items.length === category.items.length
                    ? category.items.length
                    : `${items.length} of ${category.items.length}`}
                </span>
                {!category.isActive ? (
                  <span className={`bg-nybb-bone/10 text-nybb-bone/70 ${CHIP}`}>Off the menu</span>
                ) : null}
              </div>

              {items.length === 0 ? (
                <p className="text-nybb-bone/60 mt-3 text-sm">
                  {category.items.length === 0
                    ? "No items in this category yet."
                    : "No item in this category fits the search or filter."}
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {items.map((item) => (
                    <MenuItemRow
                      key={item.id}
                      item={item}
                      category={category}
                      branches={menu.branches}
                      actingBranchId={actingBranchId}
                      can={can}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <p aria-hidden className="type-caps text-nybb-bone/65">
        {label}
      </p>
      {/* One line that scrolls sideways on a phone, so thirteen categories do
          not push the list a screen down; wrapping from sm up, where they fit
          in two or three lines. The scroll is its own container, so the page
          never scrolls sideways. */}
      <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
        {children}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        PRESSABLE,
        "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3.5 text-sm whitespace-nowrap",
        active
          ? "bg-nybb-orange text-nybb-ink font-semibold"
          : "border-nybb-bone/25 hover:border-nybb-bone/60 hover:bg-nybb-bone/5 border",
      )}
    >
      {children}
      <span className={cn("font-mono text-xs", active ? "text-nybb-ink/75" : "text-nybb-bone/60")}>
        {count}
      </span>
    </button>
  );
}
