/** What applyTheme answers with. Out here because a "use server" file may only export async functions. */
export type ThemeActionState =
  | { ok: true; message: string }
  | { ok: false; error: string; fieldErrors?: { text?: string } };
