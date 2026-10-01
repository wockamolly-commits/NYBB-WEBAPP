-- 0077_voucher_posters.sql
--
-- A poster for a voucher: the artwork the owner already makes for social
-- media, attached to the code it advertises so the storefront can show it in
-- the promo popup and on the code's card at /promos.
--
-- WHY THE POSTER IS FOUR COLUMNS ON vouchers AND NOT A TABLE OF ITS OWN. A
-- voucher has at most one poster, and the poster has no life apart from the
-- code: it is shown exactly when the code is listed and never otherwise. Living
-- on the row means list_customer_promos needs no new join and no new rule. The
-- poster is visible precisely when the code is, which is the whole requirement.
--
-- WHY IT HAS ITS OWN SETTER RATHER THAN RIDING IN admin_upsert_voucher. The
-- upsert refuses with VOUCHER_LOCKED once a code has met an order (0067), and
-- that is right for terms: a customer who already used a code was promised what
-- it said. A poster is not a term. Swapping the artwork on a running promo is
-- the most ordinary thing an owner does, so it gets its own function that
-- ignores the lock, the same way 0073 gave publicise one.
--
-- WHY A BUCKET OF ITS OWN. 0055's menu-images policy admits menu:configure,
-- and a person who manages vouchers need not hold it. Widening that policy
-- would let a voucher manager put objects in the menu bucket for no reason.
-- A second bucket keeps each permission writing only where it is used.

-- ---------------------------------------------------------------------------
-- 1. The columns.
-- ---------------------------------------------------------------------------

alter table vouchers
  add column if not exists poster_url            text,
  add column if not exists poster_width          integer,
  add column if not exists poster_height         integer,
  add column if not exists poster_blur_data_url  text;

-- All four or none. A url without dimensions cannot be laid out without a
-- jump, and dimensions without a url describe nothing. A null here means "this
-- voucher has no poster", never a zero-sized one (AGENTS.md rule 6).
alter table vouchers
  drop constraint if exists vouchers_poster_complete;
alter table vouchers
  add constraint vouchers_poster_complete check (
    (poster_url is null and poster_width is null and poster_height is null
      and poster_blur_data_url is null)
    or (poster_url is not null and poster_width > 0 and poster_height > 0
      and poster_blur_data_url is not null)
  );

-- ---------------------------------------------------------------------------
-- 2. The bucket and the one policy that lets a voucher manager write to it.
-- ---------------------------------------------------------------------------

-- Public for the reason 0055 gives for menu-images: next/image fetches it
-- without a session on every customer's behalf. Every object is a processed
-- WebP at most 1600px on its long side, which lands well under 3 MB; the
-- ceiling is what stands between a vouchers:manage session and arbitrary bytes
-- in a public bucket. "do update" from the start, for the reason 0056 had to
-- correct 0055. There is no UPDATE or DELETE policy: every upload is a fresh
-- path, so nothing is ever overwritten under a year-long image cache.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice '0077 skipped the bucket: no storage schema in this database';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('voucher-posters', 'voucher-posters', true, 3145728, array['image/webp'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'vouchers manage uploads voucher posters'
  ) then
    execute $policy$
      create policy "vouchers manage uploads voucher posters"
        on storage.objects
        for insert
        to authenticated
        with check (
          bucket_id = 'voucher-posters'
          -- Schema qualified for the reason 0055 gives.
          and public.current_staff_has_permission('vouchers:manage')
        )
    $policy$;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The setter.
-- ---------------------------------------------------------------------------

-- All four arguments null clears the poster. Anything else must be a complete
-- poster whose url points into a voucher-posters bucket, so a staff session
-- cannot point a public page at an arbitrary host. next/image would refuse
-- such a host anyway, but the row should never hold one.
create or replace function admin_set_voucher_poster(
  p_voucher_id uuid,
  p_url        text,
  p_width      integer,
  p_height     integer,
  p_blur       text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id uuid := auth.uid();
  v_before   text;
  v_clear    boolean;
begin
  if not current_staff_has_permission('vouchers:manage') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_voucher_id is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  v_clear := p_url is null and p_width is null and p_height is null and p_blur is null;
  if not v_clear and (
    p_url is null
    or p_url not like 'https://%/storage/v1/object/public/voucher-posters/%'
    or p_width is null or p_width <= 0
    or p_height is null or p_height <= 0
    or p_blur is null or p_blur not like 'data:image/%'
  ) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  select poster_url into v_before from vouchers where id = p_voucher_id for update;
  if not found then
    raise exception 'VOUCHER_NOT_FOUND' using errcode = 'P0001';
  end if;

  update vouchers
     set poster_url = p_url,
         poster_width = p_width,
         poster_height = p_height,
         poster_blur_data_url = p_blur
   where id = p_voucher_id;

  insert into audit_logs (actor_profile_id, action, target_table, target_id, diff)
  values (
    v_actor_id,
    case when v_clear then 'voucher.poster_remove' else 'voucher.poster_set' end,
    'vouchers',
    p_voucher_id::text,
    jsonb_build_object('before', to_jsonb(v_before), 'after', to_jsonb(p_url))
  );
end;
$$;

-- service_role named for the reason 0073 gives.
revoke execute on function admin_set_voucher_poster(uuid, text, integer, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function admin_set_voucher_poster(uuid, text, integer, integer, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The listing, restated with the poster in each row.
-- ---------------------------------------------------------------------------

-- 0076's body with four keys added to the select and nothing else touched. In
-- particular the WHERE clause is unchanged, which is what makes the poster
-- appear and disappear with the code: inactive, not started, expired, used up,
-- wrong counter, already spent by this account or switched off, and the poster
-- goes with it. The blur placeholder travels too so a card or the popup can
-- hold its shape while the image loads.

create or replace function list_customer_promos(p_branch_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_settings  app_settings%rowtype;
  v_branch_id uuid;
  v_user_id   uuid := auth.uid();
  v_now       timestamptz := now();
  v_rows      jsonb;
begin
  -- The flag is the authority, as it is in preview_voucher and place_order.
  -- An empty array rather than an error: a caller learns nothing, not even
  -- that the feature exists, which is the same posture the reference takes
  -- when its switch is off. It also means the storefront never reads the flag
  -- separately, so there is one place it is honoured and nothing to drift.
  select * into v_settings from app_settings where id = 1;
  if not coalesce(v_settings.vouchers_enabled, false) then
    return '[]'::jsonb;
  end if;

  -- A BLANK SLUG MEANS "DO NOT FILTER", NOT "USE THE DEFAULT COUNTER".
  --
  -- resolve_pickup_branch_id(null) answers with the first active branch by
  -- sort_order, and calling it here on a customer who has chosen nothing would
  -- quietly narrow the list to that one counter. That is the exact mistake the
  -- counter picker was built to undo: PRODUCT.md records that hiding the choice
  -- meant "the shop somebody collected from was decided for them and named only
  -- in a footnote". Deciding which promos they may hear about the same way
  -- would be the same bug wearing a different hat.
  --
  -- So an unchosen counter lists every promo, and a branch-scoped one arrives
  -- carrying its branchNames for the card to print. The customer sees the
  -- restriction in words, and resolve_voucher still refuses it at the wrong
  -- counter with VOUCHER_WRONG_BRANCH. An unknown slug resolves to null and is
  -- treated as unchosen rather than as a reason to show nothing, because a
  -- stale cookie must not empty the page.
  if nullif(btrim(coalesce(p_branch_slug, '')), '') is not null then
    v_branch_id := resolve_pickup_branch_id(p_branch_slug);
  end if;

  select coalesce(
      jsonb_agg(to_jsonb(p) - 'sortExpires' order by p."sortExpires", p.code),
      '[]'::jsonb
    )
  into v_rows
  from (
    select
      v.code,
      v.description,
      -- Every one of these is nullable and none of the nulls means zero. They
      -- travel as nulls and the TypeScript parse branches on them, per
      -- AGENTS.md rule 6. A coalesce here would turn a percentage promo into
      -- "PHP 0.00 off" on a public page.
      v.amount_cents        as "amountCents",
      v.percent_off         as "percentOff",
      v.max_discount_cents  as "maxDiscountCents",
      v.min_order_cents     as "minOrderCents",
      v.expires_at          as "expiresAt",
      -- NEW IN 0077. Null when the voucher has no poster, and all four are
      -- null together (vouchers_poster_complete).
      v.poster_url            as "posterUrl",
      v.poster_width          as "posterWidth",
      v.poster_height         as "posterHeight",
      v.poster_blur_data_url  as "posterBlurDataUrl",
      -- Whether this one is being shown because it belongs to the person
      -- asking, so the page can group it apart from the public offers rather
      -- than present a loyalty reward as a general promotion.
      (
        v.owner_user_id is not null
        or exists (
          select 1 from voucher_customers vc
          where vc.voucher_id = v.id and vc.user_id = v_user_id
        )
      ) as personal,
      coalesce(
        (select jsonb_agg(mi.name order by mi.name)
         from voucher_items vi join menu_items mi on mi.id = vi.item_id
         where vi.voucher_id = v.id),
        '[]'::jsonb
      ) as "itemNames",
      coalesce(
        (select jsonb_agg(mc.name order by mc.name)
         from voucher_categories vcat join menu_categories mc on mc.id = vcat.category_id
         where vcat.voucher_id = v.id),
        '[]'::jsonb
      ) as "categoryNames",
      coalesce(
        (select jsonb_agg(b.name order by b.name)
         from voucher_branches vb join branches b on b.id = vb.branch_id
         where vb.voucher_id = v.id),
        '[]'::jsonb
      ) as "branchNames",
      -- Soonest to expire first, and the ones that never expire last rather
      -- than first, which is where a null would sort by default here. Dropped
      -- from the payload above: it is a sort key, not something to render.
      coalesce(v.expires_at, 'infinity'::timestamptz) as "sortExpires"
    from vouchers v
    where
      -- Rules 2 and 3 of resolve_voucher, with its null semantics intact:
      -- a null start is "live already", a null expiry is "never ends".
      v.is_active
      and (v.starts_at is null or v_now >= v.starts_at)
      and (v.expires_at is null or v_now < v.expires_at)
      -- The exhaustion rule, read rather than raced. A null max_uses is
      -- unlimited; reading it as zero would hide every open promo.
      and (v.max_uses is null or v.uses_count < v.max_uses)
      -- Rule 4, the owner half.
      and (v.owner_user_id is null or v.owner_user_id = v_user_id)
      -- Rule 4, the restriction list half. Matched on account only, for the
      -- enumeration reason in 0074's header.
      and (
        not exists (select 1 from voucher_customers vc where vc.voucher_id = v.id)
        or exists (
          select 1 from voucher_customers vc
          where vc.voucher_id = v.id and vc.user_id = v_user_id
        )
      )
      -- Rule 5, applied only once a counter is actually chosen. An empty
      -- voucher_branches means every counter.
      and (
        v_branch_id is null
        or not exists (select 1 from voucher_branches vb where vb.voucher_id = v.id)
        or exists (
          select 1 from voucher_branches vb
          where vb.voucher_id = v.id and vb.branch_id = v_branch_id
        )
      )
      -- NEW IN 0076. Already spent by the person asking, so there is nothing
      -- left to advertise. A guest has no account to count against and is
      -- simply not filtered here; the storefront's cookie covers that browser,
      -- and checkout refuses a guest over their cap regardless.
      and (
        v_user_id is null
        or (
          select count(*)
          from voucher_redemptions r
          where r.voucher_id = v.id and r.user_id = v_user_id
        ) < v.max_uses_per_customer
      )
      -- The visibility gate: either the owner published it, or it is this
      -- customer's own and they are entitled to be told whether or not it was
      -- advertised.
      and (
        v.publicise
        or v.owner_user_id = v_user_id
        or exists (
          select 1 from voucher_customers vc
          where vc.voucher_id = v.id and vc.user_id = v_user_id
        )
      )
  ) p;

  return v_rows;
end;
$$;

comment on function list_customer_promos(text) is
  'Promo codes that may be shown to the caller at one counter: publicised '
  'codes for everyone, plus the signed-in caller own vouchers, minus any the '
  'caller has no redemptions left on. Returns an empty array when '
  'vouchers_enabled is off. Applies every eligibility rule resolve_voucher '
  'applies except the ones needing a cart, so a listed code is live but is '
  'not promised to fit the order.';
