"use client";

import { useState } from "react";
import type { MenuActionState } from "@/lib/staff/menu-types";

/**
 * Whether a row holds edits nobody has committed yet, re-baselined whenever
 * the server says it saved.
 *
 * This exists to take the brand orange off a column of Save buttons. A Save
 * that is loud before there is anything to save is not signalling an action,
 * it is decorating a form, and repeated down a table it is what makes the
 * screen read as a wall: the option groups page carried seventeen orange Save
 * buttons and the categories page eleven, and at that count the colour stops
 * meaning "this is the action" and starts meaning "this is a form". Quiet at
 * rest and orange the moment a field changes inverts it. Nothing shouts until
 * you have done something, and then exactly one row does, which is also the
 * answer to "where was I".
 *
 * Re-baselining happens during render, keyed on the identity of the action
 * state, rather than in an effect. The distinction matters twice. An effect
 * listing the field values as dependencies would re-baseline on every
 * keystroke that followed a success, making `dirty` false forever after the
 * first save; and an effect keyed only on the state would need a ref to read
 * the current values, which is a ref write during render. Comparing the state
 * object this render against the one last render is React's own way to adjust
 * state from a changed input, and it settles before anything paints, so the
 * button never flashes orange on the frame after it saved.
 */
export function useDirty<T extends Record<string, unknown>>(
  current: T,
  state: MenuActionState,
): boolean {
  const [baseline, setBaseline] = useState(current);
  const [seenState, setSeenState] = useState(state);

  if (state !== seenState) {
    setSeenState(state);
    if (state.status === "success") setBaseline(current);
  }

  return (Object.keys(current) as (keyof T)[]).some((key) => current[key] !== baseline[key]);
}
