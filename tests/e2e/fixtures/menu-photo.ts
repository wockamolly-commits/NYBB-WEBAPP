import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { MENU_IMAGE_BUCKET } from "@/lib/staff/menu-image-limits";
import { loadLocalEnv } from "../global-setup";

/**
 * Reading and putting back the menu rows the browser suite edits.
 *
 * THESE TESTS WRITE TO THE PROJECT IN .env.local.
 *
 * There is no local Postgres and Storage stack running for this project, so
 * the suite drives the same database the dev server does. Two things keep
 * that honest: it only ever touches a row it has snapshotted first and puts
 * back afterwards, and it deletes the bucket objects its own uploads created.
 * The row it chooses carries no photograph, so even a run that dies halfway
 * through leaves a row with no photograph, which is what it started as.
 */

/**
 * The item the photo tests edit, by slug rather than id.
 *
 * A slug is stable across environments and readable in a failure message; an
 * id is neither. This one is chosen because it has no photograph of its own
 * to lose, and because nothing else in the suite touches it.
 */
export const PHOTO_TEST_SLUG = "french-fries";

/** A photograph that ships with the repository, so no fixture binary is added. */
export const TEST_IMAGE_PATH = "public/img/burger-angus.523a876c.webp";

export type ImageColumns = {
  image_url: string | null;
  image_width: number | null;
  image_height: number | null;
  image_blur_data_url: string | null;
  image_treatment: string | null;
  image_source: string | null;
};

const IMAGE_COLUMNS =
  "image_url, image_width, image_height, image_blur_data_url, image_treatment, image_source";

let client: SupabaseClient | null = null;

/** The service role client, which is how a test reads what a screen wrote. */
export function serviceClient(): SupabaseClient {
  if (client) return client;
  loadLocalEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("tests/e2e needs the Supabase URL and service role key.");
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export async function itemIdBySlug(slug: string): Promise<string> {
  const { data, error } = await serviceClient()
    .from("menu_items")
    .select("id")
    .eq("slug", slug)
    .single();
  if (error) throw new Error(`no menu item with slug "${slug}": ${error.message}`);
  return data.id as string;
}

export async function readImage(itemId: string): Promise<ImageColumns> {
  const { data, error } = await serviceClient()
    .from("menu_items")
    .select(IMAGE_COLUMNS)
    .eq("id", itemId)
    .single();
  if (error) throw error;
  return data as ImageColumns;
}

export async function writeImage(itemId: string, columns: ImageColumns): Promise<void> {
  const { error } = await serviceClient().from("menu_items").update(columns).eq("id", itemId);
  if (error) throw error;
}

/** Every object path the bucket holds, so a run can tell what it added. */
export async function listBucketPaths(): Promise<Set<string>> {
  const paths = new Set<string>();
  const years = await serviceClient().storage.from(MENU_IMAGE_BUCKET).list("", { limit: 1000 });
  for (const folder of years.data ?? []) {
    if (folder.id) continue; // a file at the root, not a year folder
    const objects = await serviceClient()
      .storage.from(MENU_IMAGE_BUCKET)
      .list(folder.name, { limit: 1000 });
    for (const object of objects.data ?? []) paths.add(`${folder.name}/${object.name}`);
  }
  return paths;
}

/**
 * Deletes the objects that appeared while the suite ran.
 *
 * Compared against a snapshot taken before the first test rather than against
 * what the rows reference, so it can never remove a photograph somebody else
 * uploaded while this was running. An upload leaves two objects, the tile and
 * its original, and both are this suite's to clean up.
 */
export async function purgeNewBucketObjects(before: Set<string>): Promise<string[]> {
  const after = await listBucketPaths();
  const added = [...after].filter((path) => !before.has(path));
  if (added.length) {
    const { error } = await serviceClient().storage.from(MENU_IMAGE_BUCKET).remove(added);
    if (error) throw error;
  }
  return added;
}
