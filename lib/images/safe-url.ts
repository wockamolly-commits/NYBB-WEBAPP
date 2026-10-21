/**
 * Whether a stored image address is safe to draw.
 *
 * Migration 0101 holds the same rules as CHECK constraints, so a row that
 * breaks them cannot be written. The database cannot know its own public
 * hostname, though, so it accepts any Supabase project host; this is where the
 * exact host is checked, against NEXT_PUBLIC_SUPABASE_URL. It is also the
 * second line: an address that fails here is dropped and the reader shows no
 * picture, rather than handing next/image a host it will refuse (which breaks
 * the page) or the browser a URL somebody else chose.
 */

const PATH = /^[A-Za-z0-9_-][A-Za-z0-9_./-]*$/;
const PLACEHOLDER = /^data:image\/(png|jpeg|webp|gif|avif);base64,[A-Za-z0-9+/]+={0,2}$/;
const SUPABASE_HOST = /^[a-z0-9-]+\.supabase\.co$/;

export function isOwnStorageImageUrl(
  value: string | null | undefined,
  bucket: string,
  projectUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): boolean {
  if (!value || value.length > 1024) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.search || url.hash || url.username || url.password || url.port) {
    return false;
  }

  let expectedHost: string | null = null;
  if (projectUrl) {
    try {
      expectedHost = new URL(projectUrl).hostname;
    } catch {
      expectedHost = null;
    }
  }
  if (expectedHost ? url.hostname !== expectedHost : !SUPABASE_HOST.test(url.hostname)) return false;

  const prefix = `/storage/v1/object/public/${bucket}/`;
  // The URL parser has already collapsed any "..", so compare the original
  // text as well: an address that needed collapsing was not one we wrote.
  if (!url.pathname.startsWith(prefix) || !value.endsWith(url.pathname)) return false;
  const rest = url.pathname.slice(prefix.length);
  return PATH.test(rest) && !rest.includes("..") && !rest.includes("//");
}

export function isImagePlaceholder(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length <= 20_000 && PLACEHOLDER.test(value);
}
