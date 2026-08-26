"use client";

import { LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { WorkspaceFieldLabel, WorkspaceInput } from "@/components/ui/WorkspaceField";
import type { ManagedCategory, MenuActionState } from "@/lib/staff/menu-types";
import { deleteMenuEntity, saveMenuCategory } from "../actions";

const initialState: MenuActionState = { status: "idle" };

function StatusMessage({ state }: { state: MenuActionState }) {
  if (state.status === "idle" || !state.message) return null;
  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={state.status === "error" ? "text-nybb-orange mt-3 text-sm" : "text-nybb-yellow mt-3 text-sm"}
    >
      {state.message}
    </p>
  );
}

function itemCountLabel(count: number): string {
  return `${count} item${count === 1 ? "" : "s"}`;
}

/**
 * One existing category: an inline save form and a guarded delete form,
 * each its own useActionState so a failure on one row, or on one of a row's
 * two forms, never clears the other.
 */
function CategoryRow({ category }: { category: ManagedCategory }) {
  const [saveState, saveAction, savePending] = useActionState(saveMenuCategory, initialState);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteMenuEntity, initialState);
  const [isActive, setIsActive] = useState(category.isActive);
  const pending = savePending || deletePending;
  const itemCount = category.items.length;

  return (
    <article className="bg-nybb-charcoal rounded-md p-5">
      <form action={saveAction} className="flex flex-wrap items-end gap-4">
        <input type="hidden" name="id" value={category.id} />
        <div className="min-w-48 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <WorkspaceFieldLabel htmlFor={`category-name-${category.id}`}>Name</WorkspaceFieldLabel>
            <span className="text-nybb-bone/55 text-xs">{itemCountLabel(itemCount)}</span>
          </div>
          <WorkspaceInput
            id={`category-name-${category.id}`}
            name="name"
            defaultValue={category.name}
            minLength={2}
            maxLength={80}
            required
            disabled={pending}
          />
        </div>
        <div className="min-w-64 flex-[2]">
          <WorkspaceFieldLabel htmlFor={`category-blurb-${category.id}`}>Blurb</WorkspaceFieldLabel>
          <WorkspaceInput
            id={`category-blurb-${category.id}`}
            name="blurb"
            defaultValue={category.blurb ?? ""}
            maxLength={200}
            disabled={pending}
          />
        </div>
        <label className="border-nybb-bone/15 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3.5">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            disabled={pending}
          />
          <span className="text-sm">On the menu</span>
        </label>
        <input type="hidden" name="isActive" value={isActive ? "true" : "false"} />
        <Button type="submit" tone="dark" variant="primary" disabled={pending} className="min-h-11">
          {savePending ? (
            <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Save aria-hidden className="size-4" />
          )}
          Save
        </Button>
      </form>
      <p className="text-nybb-bone/55 mt-2 text-xs">
        One line under the category header. A description, not marketing copy.
      </p>
      <StatusMessage state={saveState} />

      <form
        action={deleteAction}
        className="border-nybb-bone/15 mt-4 border-t pt-4"
        onSubmit={(event) => {
          if (!window.confirm(`Delete "${category.name}"? This cannot be undone.`)) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="entity" value="category" />
        <input type="hidden" name="id" value={category.id} />
        <Button type="submit" tone="dark" variant="danger" disabled={pending} className="min-h-11">
          {deletePending ? (
            <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Trash2 aria-hidden className="size-4" />
          )}
          Delete category
        </Button>
        {itemCount > 0 ? (
          <span className="text-nybb-bone/55 ml-3 text-xs">
            Has {itemCountLabel(itemCount)}. Move or delete them first.
          </span>
        ) : null}
      </form>
      <StatusMessage state={deleteState} />
    </article>
  );
}

/** A blank row at the end that adds a new category. No delete, nothing to count. */
function NewCategoryRow() {
  const [state, action, pending] = useActionState(saveMenuCategory, initialState);
  const [isActive, setIsActive] = useState(true);

  return (
    <article className="border-nybb-bone/30 rounded-md border border-dashed p-5">
      <p className="type-caps text-nybb-bone/55">New category</p>
      <form action={action} className="mt-3 flex flex-wrap items-end gap-4">
        <div className="min-w-48 flex-1">
          <WorkspaceFieldLabel htmlFor="new-category-name">Name</WorkspaceFieldLabel>
          <WorkspaceInput id="new-category-name" name="name" minLength={2} maxLength={80} required disabled={pending} />
        </div>
        <div className="min-w-64 flex-[2]">
          <WorkspaceFieldLabel htmlFor="new-category-blurb">Blurb</WorkspaceFieldLabel>
          <WorkspaceInput id="new-category-blurb" name="blurb" maxLength={200} disabled={pending} />
        </div>
        <label className="border-nybb-bone/15 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3.5">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            disabled={pending}
          />
          <span className="text-sm">On the menu</span>
        </label>
        <input type="hidden" name="isActive" value={isActive ? "true" : "false"} />
        <Button type="submit" tone="dark" variant="primary" disabled={pending} className="min-h-11">
          {pending ? (
            <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Plus aria-hidden className="size-4" />
          )}
          Add category
        </Button>
      </form>
      <p className="text-nybb-bone/55 mt-2 text-xs">
        One line under the category header. A description, not marketing copy.
      </p>
      <StatusMessage state={state} />
    </article>
  );
}

export function CategoryEditor({ categories }: { categories: ManagedCategory[] }) {
  return (
    <div className="mt-7 space-y-4">
      {categories.map((category) => (
        <CategoryRow key={category.id} category={category} />
      ))}
      <NewCategoryRow />
    </div>
  );
}
