import type { ContentFieldErrors } from "./schema";

/** What the content actions answer with. Out here because a "use server" file may only export async functions. */
export type ContentActionState =
  | { ok: true; message: string }
  | { ok: false; error: string; fieldErrors?: ContentFieldErrors };
