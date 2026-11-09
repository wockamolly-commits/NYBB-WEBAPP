-- 0106_menu_realtime.sql
-- Tell open storefront pages that the menu changed, so a sold out mark (or
-- any menu edit) reaches them without the customer reloading.
--
-- The same mechanism as 0072 for store hours: a statement trigger sends an
-- empty signal on a public Broadcast topic, and components/menu/MenuLiveRefresh
-- answers it with router.refresh(), which re-reads get_storefront_menu(). The
-- payload carries no menu data, so the browser still learns what is on sale
-- only from the function every other visitor reads.
--
-- Statement level, not row level: 0103 touched hundreds of rows in one
-- statement each, and a Save in the workspace touches a handful. Either way
-- the page needs one refresh, and the client folds a burst into one.
--
-- branches is included because whether a counter trades changes what the
-- menu shows (0102, 0105). It already signals store-hours; a second trigger
-- signals menu.

create or replace function broadcast_menu_changed()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform realtime.send(
    jsonb_build_object('changed', true),
    'changed',
    'menu',
    false
  );
  return null;
end;
$$;

revoke execute on function broadcast_menu_changed()
  from public, anon, authenticated, service_role;

create trigger menu_item_branch_holds_broadcast_menu
  after insert or update or delete on menu_item_branch_holds
  for each statement execute function broadcast_menu_changed();

create trigger menu_items_broadcast_menu
  after insert or update or delete on menu_items
  for each statement execute function broadcast_menu_changed();

create trigger item_variations_broadcast_menu
  after insert or update or delete on item_variations
  for each statement execute function broadcast_menu_changed();

create trigger menu_categories_broadcast_menu
  after insert or update or delete on menu_categories
  for each statement execute function broadcast_menu_changed();

create trigger menu_options_broadcast_menu
  after insert or update or delete on menu_options
  for each statement execute function broadcast_menu_changed();

create trigger menu_option_groups_broadcast_menu
  after insert or update or delete on menu_option_groups
  for each statement execute function broadcast_menu_changed();

create trigger menu_item_option_groups_broadcast_menu
  after insert or update or delete on menu_item_option_groups
  for each statement execute function broadcast_menu_changed();

create trigger branches_broadcast_menu
  after update on branches
  for each statement execute function broadcast_menu_changed();

comment on function broadcast_menu_changed() is
  'Signals the public menu Broadcast topic after a hold, item, size, option, '
  'category or branch change. The payload contains no data; the page re-reads '
  'get_storefront_menu().';
