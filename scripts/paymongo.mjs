#!/usr/bin/env node
// Connecting this deployment to a PayMongo account.
//
//   node scripts/paymongo.mjs check                    what the keys are, and whether PayMongo accepts them
//   node scripts/paymongo.mjs webhooks                 what this account already delivers to
//   node scripts/paymongo.mjs webhook:create <url>     register the endpoint and save its signing secret
//
// The mode is never chosen here. It is read from PAYMONGO_SECRET_KEY, because a
// key IS its mode, and a script that let you name one could disagree with the
// key and register a live webhook while every intent went to the test account.
//
// SECRETS ARE NEVER PRINTED. `webhook:create` writes the signing secret into
// .env.local (gitignored) and prints a masked confirmation. Pass --show only
// when you need to read the value yourself to paste it into Vercel, and only in
// a terminal you are looking at.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ENV_FILE = join(process.cwd(), ".env.local");
const API = "https://api.paymongo.com/v1";

// The four this application reconciles. `payment.paid` and `payment.failed`
// drive apply_paymongo_payment; the two refund events drive
// apply_paymongo_refund. Subscribing to more would deliver events no handler
// reads, and PayMongo would retry each one until it gave up.
const EVENTS = ["payment.paid", "payment.failed", "payment.refunded", "payment.refund.updated"];

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
function env(name) {
  return process.env[name] || fileEnv[name] || "";
}

// Prefix and length only. The prefix is not secret (it is how PayMongo names
// the kind and mode of a key) and the length catches a truncated paste, which
// is the failure a mask is actually for. Nothing past the prefix is shown,
// because a value printed here ends up in a terminal, a scrollback, and
// whatever is reading over its shoulder.
function mask(value) {
  if (!value) return "(not set)";
  const prefix = /^(sk_test_|sk_live_|pk_test_|pk_live_|whsk_)/.exec(value);
  const shown = prefix ? prefix[1] : `${value.slice(0, 2)}`;
  return `${shown}... ${value.length} characters`;
}

function keyMode(key) {
  if (/_live_/.test(key)) return "live";
  if (/_test_/.test(key)) return "test";
  return null;
}

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

async function paymongo(path, { method = "GET", body } = {}) {
  const key = env("PAYMONGO_SECRET_KEY");
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload?.errors?.[0]?.detail ?? `HTTP ${response.status}`;
    throw new Error(`PayMongo refused the request: ${detail}`);
  }
  return payload;
}

/** Everything checkable without spending a request. */
function inspectKeys() {
  const secret = env("PAYMONGO_SECRET_KEY");
  const publicKey = env("NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY");
  const webhookSecret = env("PAYMONGO_WEBHOOK_SECRET");

  console.log("  PAYMONGO_SECRET_KEY             ", mask(secret));
  console.log("  NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY ", mask(publicKey));
  console.log("  PAYMONGO_WEBHOOK_SECRET         ", mask(webhookSecret));
  console.log("  NEXT_PUBLIC_SITE_URL            ", env("NEXT_PUBLIC_SITE_URL") || "(not set)");
  console.log("  MOCK_PAYMENTS_ENABLED           ", env("MOCK_PAYMENTS_ENABLED") || "(not set)");
  console.log("");

  if (!secret) fail("PAYMONGO_SECRET_KEY is not set. Nothing can be checked until it is.");
  if (!/^sk_(test|live)_/.test(secret)) {
    fail("PAYMONGO_SECRET_KEY is not a secret key. It should read sk_test_... or sk_live_...");
  }
  if (publicKey && !/^pk_(test|live)_/.test(publicKey)) {
    fail("NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY is not a public key. It should read pk_test_... or pk_live_...");
  }
  if (publicKey && keyMode(secret) !== keyMode(publicKey)) {
    fail(`The keys disagree: the secret key is ${keyMode(secret)} and the public key is ${keyMode(publicKey)}.`);
  }
  return { mode: keyMode(secret), publicKey, webhookSecret };
}

async function check() {
  console.log("\nPayMongo configuration, as this machine reads it:\n");
  const { mode, publicKey, webhookSecret } = inspectKeys();

  // Listing webhooks is the cheapest authenticated call PayMongo offers, so it
  // doubles as proof the secret key is real rather than merely well shaped.
  const listed = await paymongo("/webhooks");
  const hooks = listed?.data ?? [];
  console.log(`  PayMongo accepted the ${mode} secret key.`);

  if (!publicKey) {
    console.log("\n  Set NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY. Without it no payment method is created,");
    console.log("  and checkout will not offer online payment at all.");
  }

  const enabled = hooks.filter((hook) => hook.attributes?.status === "enabled");
  console.log(`\n  Webhooks on this account: ${hooks.length} (${enabled.length} enabled)\n`);
  for (const hook of hooks) {
    const missing = EVENTS.filter((event) => !(hook.attributes?.events ?? []).includes(event));
    const state = hook.attributes?.status === "enabled" ? "enabled " : "disabled";
    console.log(`  ${state}  ${hook.attributes?.url}`);
    if (missing.length) console.log(`            missing events: ${missing.join(", ")}`);
  }

  if (!webhookSecret) {
    console.log("\n  PAYMONGO_WEBHOOK_SECRET is not set, so online payment stays off on this");
    console.log("  deployment by design. A payment nothing can confirm is worse than a rail");
    console.log("  nobody is offered. Run webhook:create, or read the secret from the endpoint");
    console.log("  you already made in the PayMongo dashboard.");
  }
  console.log("");
}

async function listWebhooks() {
  inspectKeys();
  const listed = await paymongo("/webhooks");
  for (const hook of listed?.data ?? []) {
    console.log(`\n  ${hook.id}`);
    console.log(`  url      ${hook.attributes?.url}`);
    console.log(`  status   ${hook.attributes?.status}`);
    console.log(`  livemode ${hook.attributes?.livemode}`);
    console.log(`  events   ${(hook.attributes?.events ?? []).join(", ")}`);
  }
  console.log("");
}

function saveWebhookSecret(secret) {
  const line = `PAYMONGO_WEBHOOK_SECRET=${secret}`;
  const existing = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  const pattern = /^[ \t]*PAYMONGO_WEBHOOK_SECRET[ \t]*=.*$/m;
  const next = pattern.test(existing)
    ? existing.replace(pattern, line)
    : `${existing.replace(/\s*$/, "")}\n\n# Written by scripts/paymongo.mjs.\n${line}\n`;
  writeFileSync(ENV_FILE, next, "utf8");
}

async function createWebhook(url, { show }) {
  if (!url) fail("Give the endpoint URL, for example https://your-deployment/api/paymongo/webhook");
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    fail(`"${url}" is not a URL.`);
  }
  if (parsed.protocol !== "https:") fail("PayMongo will only deliver to https.");
  if (!parsed.pathname.endsWith("/api/paymongo/webhook")) {
    fail("The path should end in /api/paymongo/webhook, which is the route that verifies the signature.");
  }

  const { mode } = inspectKeys();

  const existing = await paymongo("/webhooks");
  const already = (existing?.data ?? []).find((hook) => hook.attributes?.url === parsed.toString());
  if (already) {
    fail(
      `That endpoint already exists on this ${mode} account (${already.id}). PayMongo shows a ` +
        "signing secret only at creation, so read it from the dashboard rather than making a " +
        "second endpoint that would deliver every event twice.",
    );
  }

  const created = await paymongo("/webhooks", {
    method: "POST",
    body: { data: { attributes: { url: parsed.toString(), events: EVENTS } } },
  });
  const secret = created?.data?.attributes?.secret_key;
  if (!secret) fail("PayMongo created the webhook but returned no signing secret.");

  console.log(`\n  Created ${created.data.id} on the ${mode} account.`);
  console.log(`  url    ${created.data.attributes.url}`);
  console.log(`  events ${created.data.attributes.events.join(", ")}`);

  if (show) {
    console.log(`\n  PAYMONGO_WEBHOOK_SECRET=${secret}`);
  } else {
    saveWebhookSecret(secret);
    console.log(`\n  Signing secret written to .env.local (${mask(secret)}).`);
    console.log("  PayMongo shows it once. Copy it from that file into the Vercel environment now.");
  }
  console.log("");
}

const [command, ...rest] = process.argv.slice(2);
const show = rest.includes("--show");
const positional = rest.filter((argument) => !argument.startsWith("--"));

try {
  if (command === "check" || command === undefined) await check();
  else if (command === "webhooks") await listWebhooks();
  else if (command === "webhook:create") await createWebhook(positional[0], { show });
  else fail(`Unknown command "${command}". Try check, webhooks, or webhook:create <url>.`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
