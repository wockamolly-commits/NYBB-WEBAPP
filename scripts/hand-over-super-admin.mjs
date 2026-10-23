#!/usr/bin/env node
// Handing the Super Admin role to a new address, in one step.
//
//   node scripts/hand-over-super-admin.mjs <new-email>          what would happen (changes nothing)
//   node scripts/hand-over-super-admin.mjs <new-email> --yes    do it
//
// It calls hand_over_super_admin (migration 0100) with the service role key
// from the environment or .env.local. That one transaction records the new
// address as the only Super Admin, switches off every other active admin
// profile, ends their sessions, and writes an audit row for each. The outgoing
// Super Admin loses their database rights the moment it returns, whether or
// not the new one ever signs in.
//
// It does NOT change SUPER_ADMIN_EMAIL. Do that in Vercel straight after and
// redeploy, or nobody can sign in as Super Admin until you do: the database
// now refuses any other address, which is the safe way round. The full
// procedure is in docs/IMPLEMENTATION-PROMPT.md, section 13.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ENV_FILE = join(process.cwd(), ".env.local");

function loadEnvFile() {
  if (!existsSync(ENV_FILE)) return {};
  const values = {};
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^["']+|["']+$/g, "").trim();
  }
  return values;
}

const fileEnv = loadEnvFile();
const env = (name) => process.env[name] || fileEnv[name] || "";

const [email, flag] = process.argv.slice(2);
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("Usage: node scripts/hand-over-super-admin.mjs <new-email> [--yes]");
  process.exit(2);
}

const url = env("NEXT_PUBLIC_SUPABASE_URL");
const key = env("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed.");
  process.exit(2);
}

console.log(`Project: ${new URL(url).host}`);
console.log(`New Super Admin: ${email.trim().toLowerCase()}`);

if (flag !== "--yes") {
  console.log("");
  console.log("Nothing changed. With --yes this will, in one transaction:");
  console.log("  - record that address as the only Super Admin the database accepts,");
  console.log("  - switch off every other active Super Admin profile and end its sessions,");
  console.log("  - write an audit entry for each one switched off.");
  console.log("Then set SUPER_ADMIN_EMAIL to the same address in Vercel and redeploy.");
  process.exit(0);
}

const response = await fetch(`${url}/rest/v1/rpc/hand_over_super_admin`, {
  method: "POST",
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ p_new_email: email }),
});
const body = await response.json().catch(() => null);
if (!response.ok) {
  console.error(`Handover refused (${response.status}): ${body?.message ?? "no detail"}`);
  process.exit(1);
}

console.log("");
console.log(`Done. Super Admin profiles switched off: ${body.revoked}.`);
console.log(
  body.sessionsEnded
    ? "Their sessions were ended."
    : "Their sessions could NOT be ended from the database. Their profiles are off, so a token they still hold has no rights, but sign them out in the Supabase dashboard (Authentication, Users) as well.",
);
console.log(
  body.newAdminHasAccount
    ? "The new address already has an account; it becomes Super Admin on its next sign-in."
    : "The new address has no account yet; it is created on its first sign-in.",
);
console.log("Next: set SUPER_ADMIN_EMAIL in Vercel to the new address and redeploy.");
