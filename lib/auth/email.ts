import { z } from "zod";

/**
 * The one spelling of "a sign-in address" both sign-in paths agree on.
 *
 * NORMALIZED FIRST, VALIDATED SECOND, AND THE ORDER IS THE WHOLE POINT.
 * ================================================================
 * `z.email().trim().toLowerCase()` reads as though it cleans the input and then
 * checks it, and does the opposite: those are transforms applied to a value that
 * has already passed validation, so " maria@example.com " is refused as
 * malformed. A password manager, a mail client, and a software keyboard's
 * autocomplete all append exactly that trailing space, which makes the failure
 * common, invisible to the person typing, and impossible to fix by looking
 * harder at what they typed. Piping in this direction also hands the rate
 * limiter's hashed namespace one spelling of an address rather than several.
 *
 * It lives here rather than in its caller because it had to be fixed twice. The
 * mobile API's `lib/customer/auth.ts` got the ordering right while the web
 * action (`app/(marketing)/login/actions.ts`) kept the broken one, and a
 * validator copied into two files is a validator that gets repaired in one.
 * That second caller is gone with the mobile app, but the reasoning is not: the
 * web action is a `"use server"` file, so it could not export this for a test
 * even if it wanted to, which is the standing reason this module exists.
 */
export const signInEmailSchema = z
  .string({ error: "Enter a valid email address." })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Enter a valid email address." }));
