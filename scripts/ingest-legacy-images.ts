/**
 * Upload the legacy photography to Supabase Storage and point the menu at it.
 *
 * This is the real ingest from spec section 5.6. Its Phase 0 stand-in,
 * scripts/build-static-images.ts, writes the same derivatives to public/img so
 * the static pages have real food in them. Both read their transform rules
 * from scripts/lib/image-pipeline.ts, so this job differs from that one in
 * destination and in nothing else.
 *
 * Run: npm run ingest:images [-- --dry-run] [-- --only <key>]
 *
 * Requires a Supabase project and these two variables, either exported or in
 * .env.local:
 *
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * The service role key is required and correct here. This is a one-off
 * operator job run from a laptop: it writes to a Storage bucket and updates
 * menu rows, both of which RLS denies to every browser-facing role by design.
 * Nothing in the application may import this file.
 *
 * Once this has run against an environment, public/img is dead weight for that
 * environment and can be deleted.
 */

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { branches } from "../lib/catalog/branches";
import { categories } from "../lib/catalog/menu";
import { renderDerivative, sources } from "./lib/image-pipeline";

const BUCKET = "menu";

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const ONLY = (() => {
  const index = argv.indexOf("--only");
  return index >= 0 ? argv[index + 1] : null;
})();

/**
 * Where an archive key lands in the database.
 *
 * Three tables carry photography and each stores the same five columns, so the
 * ingest is one loop over a list of targets rather than three near-identical
 * blocks that drift.
 */
type Target = {
  imageKey: string;
  table: "menu_items" | "menu_options" | "branches";
  /** Human label for the log line. */
  label: string;
  /** The row this key belongs to, matched on slug. */
  match: { column: string; value: string; groupSlug?: string };
};

function targets(): Target[] {
  const list: Target[] = [];

  for (const category of categories) {
    for (const item of category.items) {
      if (!item.imageKey) continue;
      list.push({
        imageKey: item.imageKey,
        table: "menu_items",
        label: item.name,
        match: { column: "slug", value: item.slug },
      });
    }
  }

  // Wing flavours carry their own photography and get their own grid, so the
  // option row holds an image just as an item row does.
  const seenOptions = new Set<string>();
  for (const category of categories) {
    for (const item of category.items) {
      for (const group of item.optionGroups) {
        for (const option of group.options) {
          if (!option.imageKey) continue;
          const key = `${group.slug}/${option.slug}`;
          if (seenOptions.has(key)) continue;
          seenOptions.add(key);
          list.push({
            imageKey: option.imageKey,
            table: "menu_options",
            label: `${group.name}: ${option.name}`,
            match: { column: "slug", value: option.slug, groupSlug: group.slug },
          });
        }
      }
    }
  }

  for (const branch of branches) {
    if (!branch.imageKey) continue;
    list.push({
      imageKey: branch.imageKey,
      table: "branches",
      label: branch.shortName,
      match: { column: "slug", value: branch.slug },
    });
  }

  return list;
}

/**
 * Read .env.local without adding a dotenv dependency for a script that runs
 * by hand a handful of times. Values already in the environment win, so
 * `SUPABASE_SERVICE_ROLE_KEY=... npm run ingest:images` targets a different
 * project without editing a file.
 */
async function loadEnvLocal() {
  let contents: string;
  try {
    contents = await readFile(path.join(process.cwd(), ".env.local"), "utf8");
  } catch {
    return;
  }
  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(40),
});

async function ensureBucket(supabase: SupabaseClient) {
  const { data, error } = await supabase.storage.getBucket(BUCKET);
  if (data) return;
  // Any error other than "not found" is a real problem worth stopping on.
  if (error && !/not found|does not exist/i.test(error.message)) throw error;

  console.log(`creating public bucket "${BUCKET}"`);
  const created = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: "5MB",
    allowedMimeTypes: ["image/webp"],
  });
  if (created.error) throw created.error;
}

async function currentImageUrl(
  supabase: SupabaseClient,
  target: Target,
): Promise<string | null> {
  let query = supabase
    .from(target.table)
    .select("image_url")
    .eq(target.match.column, target.match.value);

  if (target.match.groupSlug) {
    const group = await supabase
      .from("menu_option_groups")
      .select("id")
      .eq("slug", target.match.groupSlug)
      .single();
    if (group.error) throw group.error;
    query = query.eq("group_id", group.data.id);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data?.image_url ?? null;
}

/** The object path inside the bucket, given a public URL. */
function objectPath(publicUrl: string): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const index = publicUrl.indexOf(marker);
  return index >= 0 ? publicUrl.slice(index + marker.length) : null;
}

async function ingest() {
  await loadEnvLocal();
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(
      "Missing configuration. This job needs NEXT_PUBLIC_SUPABASE_URL and\n" +
        "SUPABASE_SERVICE_ROLE_KEY, exported or set in .env.local.\n" +
        "No Supabase project exists yet, so nothing to point it at.",
    );
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(
    parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    parsed.data.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );

  const all = targets();
  const planned = ONLY ? all.filter((t) => t.imageKey === ONLY) : all;
  if (planned.length === 0) {
    console.error(ONLY ? `no target uses image key "${ONLY}"` : "nothing to ingest");
    process.exitCode = 1;
    return;
  }

  // Every archive key that no database row claims. These are site chrome (the
  // wordmark, the interior scenes) rather than catalog data, and they stay in
  // public/ served by Next. Printed rather than ignored, so a key that should
  // have had a home is noticed instead of quietly skipped.
  const claimed = new Set(all.map((target) => target.imageKey));
  const unclaimed = Object.keys(sources).filter((key) => !claimed.has(key));

  if (!DRY_RUN) await ensureBucket(supabase);

  let uploaded = 0;
  for (const target of planned) {
    const derivative = await renderDerivative(target.imageKey);

    // A randomUUID() path, for the reason next.config.ts makes unavoidable:
    // minimumCacheTTL is a year, and the image optimizer keys its derivatives
    // on the source URL. Re-cropping a photograph and re-uploading it to the
    // same path changes nothing a browser will ever see. A new path is a new
    // URL, and a new URL is a new crop.
    const objectKey = `${target.imageKey}/${randomUUID()}.webp`;

    if (DRY_RUN) {
      console.log(
        `would upload ${target.imageKey.padEnd(30)} -> ${BUCKET}/${objectKey}` +
          `  (${target.table}.${target.match.column}=${target.match.value})`,
      );
      continue;
    }

    // Read before writing, so the object this row is about to stop pointing at
    // can be cleaned up once the new one is safely linked.
    const previous = await currentImageUrl(supabase, target);

    const upload = await supabase.storage
      .from(BUCKET)
      .upload(objectKey, derivative.data, {
        contentType: "image/webp",
        cacheControl: "31536000",
        upsert: false,
      });
    if (upload.error) throw upload.error;

    const { data: publicUrl } = supabase.storage.from(BUCKET).getPublicUrl(objectKey);

    let update = supabase
      .from(target.table)
      .update(
        {
          image_url: publicUrl.publicUrl,
          image_width: derivative.width,
          image_height: derivative.height,
          image_blur_data_url: derivative.blurDataURL,
          image_source: derivative.source,
        },
        // Counted, so a slug that matches nothing is an error rather than a
        // silent success followed by a menu full of empty tiles.
        { count: "exact" },
      )
      .eq(target.match.column, target.match.value);

    if (target.match.groupSlug) {
      const group = await supabase
        .from("menu_option_groups")
        .select("id")
        .eq("slug", target.match.groupSlug)
        .single();
      if (group.error) throw group.error;
      update = update.eq("group_id", group.data.id);
    }

    const { error: updateError, count } = await update;
    if (updateError) throw updateError;
    if (!count) {
      // The row is missing, so the object just uploaded belongs to nothing.
      // Remove it rather than leave a paid-for orphan behind, and stop: an
      // unseeded database is not something to plough on through.
      await supabase.storage.from(BUCKET).remove([objectKey]);
      throw new Error(
        `no ${target.table} row where ${target.match.column} = ${target.match.value}. ` +
          `Run supabase/seed.sql first.`,
      );
    }

    // The row now points at the new object, so the old one is unreachable.
    // Deleted after the update, never before: a failed update with a deleted
    // object leaves the menu with a broken image.
    if (previous) {
      const stale = objectPath(previous);
      if (stale && stale !== objectKey) {
        await supabase.storage.from(BUCKET).remove([stale]);
      }
    }

    uploaded += 1;
    const kb = Math.round(derivative.data.byteLength / 1024);
    console.log(
      `${target.imageKey.padEnd(30)} ${String(kb).padStart(4)} KB  -> ${target.label}`,
    );
  }

  console.log(
    DRY_RUN
      ? `\n${planned.length} uploads planned, nothing written`
      : `\n${uploaded} images uploaded to ${BUCKET}/ and linked`,
  );

  if (unclaimed.length > 0 && !ONLY) {
    console.log(
      `\n${unclaimed.length} archive keys have no database row and stay in public/:`,
    );
    console.log(`  ${unclaimed.sort().join(", ")}`);
  }

  const lowRes = planned.filter((target) => sources[target.imageKey]?.lowRes);
  if (lowRes.length > 0) {
    console.log(
      `\n${lowRes.length} shipped from thumbnails and are on the re-shoot ask: ` +
        lowRes.map((target) => target.imageKey).join(", "),
    );
  }
}

ingest().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
