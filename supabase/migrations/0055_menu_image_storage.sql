-- 0055_menu_image_storage.sql
-- The Storage bucket menu photography lives in, and the one policy that lets
-- the owner put a photograph in it.
--
-- WHY THIS MIGRATION EXISTS AT ALL.
--
-- Storage has its own policies. They are rows on storage.objects, entirely
-- separate from the table RLS in 0009 and from the SECURITY DEFINER functions
-- in 0053 and 0054, and nothing granted by those reaches a bucket. Before this
-- file, the only thing that had ever written to Storage was
-- scripts/ingest-legacy-images.ts, an operator job holding the service role
-- key, which bypasses policies entirely and therefore never needed one.
--
-- The workspace upload is not that. It goes through the ordinary staff client,
-- as the signed-in person, on the `authenticated` role, and without the policy
-- below every upload comes back "new row violates row-level security policy".
-- Reaching for the service role key to get around that would put a
-- policy-bypassing client into a request path a browser can reach, which is
-- the one thing this whole feature is built to avoid. So: a policy.
--
-- WHY THE BUCKET IS CREATED HERE AND NOT ONLY BY THE SCRIPT.
--
-- ensureBucket() in scripts/ingest-legacy-images.ts creates it too, and that
-- was fine while the ingest was the only writer. It is not fine now: the
-- workspace upload would depend on a laptop job having been run against this
-- environment first. Both are idempotent and either order works.
--
-- The bucket is public because next.config.ts optimizes
-- /storage/v1/object/public/menu-images/**, which is an unauthenticated read
-- by every customer's browser. Nothing private is ever put in it. The name is
-- the one in lib/staff/menu-image-limits.ts, which next.config.ts and the
-- ingest script both import.
--
-- WHY INSERT AND NOTHING ELSE.
--
-- Every upload lands at a fresh randomUUID() path and no path is ever written
-- twice: next.config.ts holds optimized menu images for a year, and that is
-- only safe while replacing a photograph produces a new URL. An update policy
-- would make overwriting in place possible, which is the exact mistake the
-- year-long TTL cannot survive. A delete policy is not needed either; the old
-- object is orphaned, not removed, and cleaning those up is an operator job
-- with the service role, the same as the ingest.
--
-- WHY THE BUCKET ALSO CARRIES A FILE SIZE LIMIT AND A MIME TYPE LIST.
--
-- The insert policy above only checks who may write, gated on
-- menu:configure. It says nothing about what they write. Without a bound
-- here, any session holding that permission can PUT arbitrary bytes of any
-- type straight into a public bucket through the Storage REST API, bypassing
-- every check in actions.ts (isDecodableImageType, MENU_IMAGE_MAX_BYTES, the
-- sharp decode itself): those all run inside processMenuImage's own call
-- path, which is not the only door into this bucket.
--
-- The bound here is not the client's 5 MB upload ceiling. This bucket never
-- receives a source photograph; it only ever receives the WebP
-- processMenuImage already produced (the workspace path) or renderDerivative
-- produced (the ingest path), both a single 900px square tile at quality
-- 80-82. That is reliably a few hundred KB; 2 MB leaves generous headroom
-- above the worst case without reopening the door a raw upload would need.
-- image/webp is the only type either writer ever puts here.

-- storage.buckets and storage.objects belong to Supabase's Storage service and
-- do not exist in a bare Postgres. tests/sql/harness.ts shims them so the
-- statements below are parsed and executed like every other migration, but a
-- local Postgres without that shim has nothing to apply this to.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice '0055 skipped: no storage schema in this database';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('menu-images', 'menu-images', true, 2097152, array['image/webp'])
  on conflict (id) do nothing;

  -- Same permission the RPCs that write image_url check, so the two halves of
  -- one upload cannot disagree: a session that may not configure the menu
  -- cannot put an object in the bucket, and a session that somehow did could
  -- still not point a menu row at it.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'menu configure uploads menu images'
  ) then
    execute $policy$
      create policy "menu configure uploads menu images"
        on storage.objects
        for insert
        to authenticated
        with check (
          bucket_id = 'menu-images'
          -- Schema qualified on purpose. A policy on storage.objects is
          -- evaluated by the Storage service's own session, whose search_path
          -- is not this migration's, and an unqualified name there resolves to
          -- nothing at request time rather than failing here.
          and public.current_staff_has_permission('menu:configure')
        )
    $policy$;
  end if;
end;
$$;
