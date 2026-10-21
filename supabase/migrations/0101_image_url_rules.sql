-- 0101: what an image address may be.
--
-- Every photograph this app shows is a file it uploaded itself: the Server
-- Actions re-encode the upload (lib/staff/menu-image.ts, voucher-poster.ts),
-- put it in Storage, and hand the resulting public URL to an RPC. The RPCs
-- are granted to authenticated, though, so a staff member's own session could
-- call them directly with any address at all. staff_set_menu_item_image and
-- staff_set_menu_option_image (0053, 0054, 0056) checked only that a URL came
-- with dimensions; the poster functions (0077) checked a LIKE pattern any
-- host could satisfy. The blur placeholders, which the browser draws as a CSS
-- background, were checked not at all on the menu, and as "starts with
-- data:image/" on posters.
--
-- So a menu photograph could be pointed at another site (a tracking pixel on
-- every storefront visit, or an image next/image refuses to load, which
-- breaks the page), or a placeholder could be any URL the browser will fetch.
--
-- Rules now, as CHECK constraints so they hold for every writer, including
-- scripts and the next RPC somebody writes:
--
--   * An image URL is https, on a Supabase project host, under the public path
--     of the bucket that table's images live in, with a plain file path: no
--     query string, no fragment, no "..", nothing outside [A-Za-z0-9_./-].
--   * A blur placeholder is a base64 data URL of a raster image type, and
--     small. SVG is refused: it is a document that can carry script.
--
-- The host is checked as "a Supabase project", not as this project, because
-- the database does not know its own public hostname. The app checks the exact
-- host where it renders (lib/images/safe-url.ts), which is also where an
-- address that somehow got in is dropped instead of drawn.
--
-- Checked against the live rows before it was written (2026-10-21): every
-- stored URL is this project's menu-images or voucher-posters path and every
-- placeholder is data:image/webp;base64, so the constraints validate.
--
-- SSRF: no server code fetches a stored image address. Uploads are read from
-- the request body, and next/image only fetches hosts in next.config.ts
-- remotePatterns, which are this project's two buckets and PayMongo.

create or replace function is_storage_image_url(p_url text, p_bucket text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_url is not null
     and length(p_url) <= 1024
     and p_url ~ ('^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/'
                  || p_bucket
                  || '/[A-Za-z0-9_-][A-Za-z0-9_./-]*$')
     and p_url !~ '\.\.'
     and p_url !~ '//[^/]*//'
$$;

comment on function is_storage_image_url(text, text) is
  'True for an https public URL of a file in the named bucket of a Supabase '
  'project, with a plain path. Since 0101.';

create or replace function is_image_placeholder(p_value text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_value is not null
     and length(p_value) <= 20000
     and p_value ~ '^data:image/(png|jpeg|webp|gif|avif);base64,[A-Za-z0-9+/]+={0,2}$'
$$;

comment on function is_image_placeholder(text) is
  'True for a small base64 data URL of a raster image. Since 0101.';

revoke execute on function is_storage_image_url(text, text) from public, anon, authenticated;
revoke execute on function is_image_placeholder(text) from public, anon, authenticated;

alter table menu_items
  add constraint menu_items_image_url_safe
    check (image_url is null or is_storage_image_url(image_url, 'menu-images')),
  add constraint menu_items_image_blur_safe
    check (image_blur_data_url is null or is_image_placeholder(image_blur_data_url));

alter table menu_options
  add constraint menu_options_image_url_safe
    check (image_url is null or is_storage_image_url(image_url, 'menu-images')),
  add constraint menu_options_image_blur_safe
    check (image_blur_data_url is null or is_image_placeholder(image_blur_data_url));

alter table vouchers
  add constraint vouchers_poster_url_safe
    check (poster_url is null or is_storage_image_url(poster_url, 'voucher-posters')),
  add constraint vouchers_poster_blur_safe
    check (poster_blur_data_url is null or is_image_placeholder(poster_blur_data_url));
