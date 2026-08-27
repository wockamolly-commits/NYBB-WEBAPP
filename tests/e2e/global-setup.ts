import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

/**
 * Signs the browser suite in, once, before any test runs.
 *
 * The workspace login sends a one time code to an inbox, so the form cannot be
 * filled in headlessly. This does what the form would have done: asks the
 * admin API for a magic link, verifies its token, and writes the resulting
 * session into the same cookies app/(workspace) reads, in the same encoding.
 * Playwright then starts every test already signed in.
 *
 * Nothing here is a shortcut around authorisation. The session belongs to a
 * real staff row and carries exactly the permissions that row has, so a test
 * that passes because a screen let it through proves the screen lets that
 * person through.
 */

export const STAFF_STATE_PATH = "tests/e2e/.auth/staff.json";

/** The plus-address suffix identifying the staff account the suite signs in as. */
const STAFF_SUFFIX = "nybbowner";

/**
 * Reads .env.local by hand.
 *
 * Next loads it for the application, and this file runs in Playwright's own
 * process, which is not the application. Node's --env-file is not available
 * to us either, because the test command is `playwright test`.
 */
export function loadLocalEnv(): void {
  let text: string;
  try {
    text = readFileSync(".env.local", "utf8");
  } catch {
    throw new Error(
      "tests/e2e needs .env.local (Supabase URL, anon key, service role key, SUPER_ADMIN_EMAIL). See tests/e2e/README.md.",
    );
  }
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) process.env[match[1]] ??= match[2].replace(/^"|"$/g, "");
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`tests/e2e needs ${name}. See tests/e2e/README.md.`);
  return value;
}

async function globalSetup(): Promise<void> {
  loadLocalEnv();

  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const email = required("SUPER_ADMIN_EMAIL").replace("@", `+${STAFF_SUFFIX}@`);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError) throw linkError;

  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
    type: "email",
    token_hash: link.properties.hashed_token,
  });
  if (verifyError) throw verifyError;
  if (!verified.session) throw new Error("the magic link verified without returning a session");

  // Encoded by the same client the app writes its staff cookies with, so the
  // names, the chunking and the encoding are whatever the app expects today
  // rather than whatever they were when this was written.
  const jar = new Map<string, string>();
  const staff = createServerClient(url, anonKey, {
    cookieOptions: { name: "nybb-staff-auth" },
    cookies: {
      encode: "tokens-only",
      getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const { error: setError } = await staff.auth.setSession({
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token,
  });
  if (setError) throw setError;

  const state = {
    cookies: [...jar.entries()].map(([name, value]) => ({
      name,
      value: encodeURIComponent(value),
      domain: "localhost",
      path: "/",
      expires: -1,
      httpOnly: false,
      secure: false,
      sameSite: "Lax" as const,
    })),
    origins: [],
  };

  mkdirSync(dirname(STAFF_STATE_PATH), { recursive: true });
  writeFileSync(STAFF_STATE_PATH, JSON.stringify(state, null, 2));
  console.log(`[e2e] signed in as ${email}`);
}

export default globalSetup;
