"use client";

import { ButtonLink } from "@/components/ui/Button";
import { formatPeso } from "@/lib/format";
import { holdSummary, type ManagedMenu } from "@/lib/staff/menu-types";
import { ItemHoldControl } from "./ItemHoldControl";

const CHIP = "rounded px-2 py-1 text-xs font-semibold uppercase tracking-wider";

export function MenuList({
  menu,
  can,
  actingBranchId,
}: {
  menu: ManagedMenu;
  can: { configure: boolean; availability: boolean };
  actingBranchId: string | null;
}) {
  return (
    <div className="mt-7 space-y-8">
      {menu.categories.map((category) => (
        <section key={category.id}>
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="font-display heading-minor">{category.name}</h2>
            {!category.isActive ? (
              <span className={`bg-nybb-bone/10 text-nybb-bone/55 ${CHIP}`}>Off the menu</span>
            ) : null}
          </div>

          {category.items.length === 0 ? (
            <p className="text-nybb-bone/55 mt-3 text-sm">No items in this category yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {category.items.map((item) => {
                const summary = holdSummary(item.holds);
                return (
                  <article key={item.id} className="bg-nybb-charcoal rounded-md p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display heading-panel">
                            {item.name}
                            {item.code ? (
                              <span className="text-nybb-bone/55 ml-2 text-xs font-normal tracking-normal uppercase">
                                {item.code}
                              </span>
                            ) : null}
                          </h3>
                          {!item.isActive ? (
                            <span className={`bg-nybb-bone/10 text-nybb-bone/55 ${CHIP}`}>Off the menu</span>
                          ) : null}
                          {item.isFeatured ? (
                            <span className={`bg-nybb-yellow/15 text-nybb-yellow ${CHIP}`}>Featured</span>
                          ) : null}
                        </div>
                        <p className="text-nybb-bone/60 mt-2 text-sm">
                          {item.variations.length > 0
                            ? item.variations
                                .map((variation) => `${variation.shortLabel} ${formatPeso(variation.priceCents)}`)
                                .join(" · ")
                            : "No sizes configured yet."}
                        </p>
                        {summary ? <p className="text-nybb-orange mt-2 text-sm">{summary}</p> : null}
                      </div>
                      {can.configure ? (
                        <ButtonLink
                          href={`/workspace/menu/items/${item.id}`}
                          tone="dark"
                          variant="secondary"
                        >
                          Edit
                        </ButtonLink>
                      ) : null}
                    </div>

                    {can.availability ? (
                      <div className="border-nybb-bone/15 mt-4 border-t pt-4">
                        <ItemHoldControl item={item} branches={menu.branches} actingBranchId={actingBranchId} />
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
