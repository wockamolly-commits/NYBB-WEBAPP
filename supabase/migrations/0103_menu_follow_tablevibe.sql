-- 0103: the menu follows the TableVibe webshop (buffalobrads.tablevibe.co).
--
-- GENERATED from docs/reference/tablevibe-menu-2026-11-09.json, captured
-- 2026-11-09 from the webshop's own menu API for the Mango Avenue venue. Its
-- pickup and delivery menus were identical, item for item and peso for peso.
-- Read that file, not this one, to check a price.
--
-- Decided with the user before it was written:
--   * TableVibe's layout wins, except wings. TableVibe sells each flavour as
--     its own item; here they stay one Chicken item with the flavour as a
--     choice, because the home, menu, wings, About and cart pages are built on
--     that item. Its sizes, prices and other choices are TableVibe's, and each
--     flavour takes the description TableVibe gives its wing item.
--   * Salted Egg stays a wing flavour, which TableVibe does not sell alone.
--   * Every item TableVibe lists is switched on, including the 25 that were
--     off waiting for an owner's pickup price. These are that price.
--   * Ours that TableVibe does not list are switched off, never deleted,
--     because order_lines point at them. So are sizes that no longer exist.
--   * One price at every counter.
--
-- Matched by slug throughout, so nothing is duplicated and a re-run changes
-- nothing. Branches, holds, photographs on existing items, featured flags,
-- codes, users and orders are not touched.

-- A database built from migrations alone (the SQL tests, a new environment)
-- has no menu yet: seed.sql runs after every migration. There is nothing to
-- follow TableVibe onto, so this does nothing there.
do $$
begin
if not exists (select 1 from menu_categories where slug = 'chicken-wings') then
  raise notice '0103: no menu to update, skipped';
  return;
end if;

-- Categories: TableVibe's names and order. Waffles and Rice Meals are not on it.
update menu_categories set name = 'What''s New', sort_order = 0, is_active = true where slug = 'whats-new';
update menu_categories set name = 'Chicken', sort_order = 1, is_active = true where slug = 'chicken-wings';
update menu_categories set name = 'Hunger Buster', sort_order = 2, is_active = true where slug = 'hunger-busters';
update menu_categories set name = 'Breaktime Treats', sort_order = 3, is_active = true where slug = 'breaktime-treats';
update menu_categories set name = 'NY Specials', sort_order = 4, is_active = true where slug = 'ny-specials';
update menu_categories set name = 'Pasta', sort_order = 5, is_active = true where slug = 'pasta';
update menu_categories set name = 'Value Meal', sort_order = 6, is_active = true where slug = 'value-meals';
update menu_categories set name = 'NY Burgers', sort_order = 7, is_active = true where slug = 'ny-burgers';
update menu_categories set name = 'Hotdog and Sausage', sort_order = 8, is_active = true where slug = 'ny-hotdogs';
update menu_categories set name = 'Fries & Sides', sort_order = 9, is_active = true where slug = 'sides';
update menu_categories set name = 'Coffee Series', sort_order = 10, is_active = true where slug = 'iced-coffee';
update menu_categories set name = 'Beverages', sort_order = 11, is_active = true where slug = 'beverages';
update menu_categories set is_active = false, sort_order = 12 where slug = 'rice-meals';
update menu_categories set is_active = false, sort_order = 13 where slug = 'waffles';

-- Option groups and their options.
insert into menu_option_groups (slug, name, sort_order, is_active) values ('chicken-flavor-6pcs', 'Chicken Flavor (6pcs)', 0, true)
  on conflict (slug) do update set name = excluded.name, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'chicken-flavor-6pcs'), 'classic-buffalo', 'Classic Buffalo', 0, 0, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'chicken-flavor-6pcs'), 'garlic-parmesan', 'Garlic Parmesan', 0, 10, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'chicken-flavor-6pcs'), 'honey-garlic', 'Honey Garlic', 0, 20, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'chicken-flavor-6pcs'), 'brads-gravy', 'Brad''s Gravy', 0, 30, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'chicken-flavor-6pcs'), 'bbq-lime', 'BBQ Lime', 0, 40, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'chicken-flavor-6pcs'), 'honey-mustard', 'Honey Mustard', 0, 50, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'chicken-flavor-6pcs'), 'sweet-spicy', 'Sweet Spicy', 0, 60, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'chicken-flavor-6pcs'), 'smokey-bbq', 'Smokey BBQ', 0, 70, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'chicken-flavor-6pcs'), 'cheezy', 'Cheezy', 0, 80, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'chicken-flavor-6pcs'), 'salted-egg', 'Salted Egg', 0, 90, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update menu_options set is_active = false where group_id = (select id from menu_option_groups where slug = 'chicken-flavor-6pcs') and slug not in ('classic-buffalo', 'garlic-parmesan', 'honey-garlic', 'brads-gravy', 'bbq-lime', 'honey-mustard', 'sweet-spicy', 'smokey-bbq', 'cheezy', 'salted-egg');
insert into menu_option_groups (slug, name, sort_order, is_active) values ('choice-of-drink-1', 'Choice of Drink 1', 10, true)
  on conflict (slug) do update set name = excluded.name, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drink-1'), 'pineapple-16-oz', 'Pineapple 16 Oz', 0, 0, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drink-1'), 'orange-16-oz', 'Orange 16 Oz', 0, 10, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drink-1'), 'cucumber-lemonade-16-oz', 'Cucumber Lemonade 16 Oz', 0, 20, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drink-1'), 'strawberry-red-tea-16oz', 'Strawberry Red Tea 16oz', 0, 30, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update menu_options set is_active = false where group_id = (select id from menu_option_groups where slug = 'choice-of-drink-1') and slug not in ('pineapple-16-oz', 'orange-16-oz', 'cucumber-lemonade-16-oz', 'strawberry-red-tea-16oz');
insert into menu_option_groups (slug, name, sort_order, is_active) values ('choice-of-drink-2', 'Choice of Drink 2', 20, true)
  on conflict (slug) do update set name = excluded.name, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drink-2'), 'pineapple-16-oz', 'Pineapple 16 Oz', 0, 0, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drink-2'), 'orange-16-oz', 'Orange 16 Oz', 0, 10, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drink-2'), 'cucumber-lemonade-16-oz', 'Cucumber Lemonade 16 Oz', 0, 20, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drink-2'), 'strawberry-red-tea-16oz', 'Strawberry Red Tea 16oz', 0, 30, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update menu_options set is_active = false where group_id = (select id from menu_option_groups where slug = 'choice-of-drink-2') and slug not in ('pineapple-16-oz', 'orange-16-oz', 'cucumber-lemonade-16-oz', 'strawberry-red-tea-16oz');
insert into menu_option_groups (slug, name, sort_order, is_active) values ('choice-of-fries-medium-size-1', 'Choice of Fries (Medium Size) 1', 30, true)
  on conflict (slug) do update set name = excluded.name, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-fries-medium-size-1'), 'cheese', 'Cheese', 0, 0, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-fries-medium-size-1'), 'barbecue', 'Barbecue', 0, 10, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-fries-medium-size-1'), 'sour-cream', 'Sour Cream', 0, 20, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-fries-medium-size-1'), 'original', 'Original', 0, 30, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update menu_options set is_active = false where group_id = (select id from menu_option_groups where slug = 'choice-of-fries-medium-size-1') and slug not in ('cheese', 'barbecue', 'sour-cream', 'original');
insert into menu_option_groups (slug, name, sort_order, is_active) values ('choice-of-fries-medium-size-2', 'Choice of Fries (Medium Size) 2', 40, true)
  on conflict (slug) do update set name = excluded.name, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-fries-medium-size-2'), 'cheese', 'Cheese', 0, 0, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-fries-medium-size-2'), 'barbecue', 'Barbecue', 0, 10, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-fries-medium-size-2'), 'sour-cream', 'Sour Cream', 0, 20, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-fries-medium-size-2'), 'original', 'Original', 0, 30, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update menu_options set is_active = false where group_id = (select id from menu_option_groups where slug = 'choice-of-fries-medium-size-2') and slug not in ('cheese', 'barbecue', 'sour-cream', 'original');
insert into menu_option_groups (slug, name, sort_order, is_active) values ('choice-of-chicken', 'Choice of Chicken', 50, true)
  on conflict (slug) do update set name = excluded.name, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-chicken'), 'chicken-wings', 'Chicken Wings', 0, 0, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-chicken'), 'boneless-chicken', 'Boneless Chicken', 0, 10, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update menu_options set is_active = false where group_id = (select id from menu_option_groups where slug = 'choice-of-chicken') and slug not in ('chicken-wings', 'boneless-chicken');
insert into menu_option_groups (slug, name, sort_order, is_active) values ('level-of-hotness', 'Level of Hotness', 60, true)
  on conflict (slug) do update set name = excluded.name, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'level-of-hotness'), 'none', 'Original', 0, 0, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'level-of-hotness'), 'lite', 'Lite', 2900, 10, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'level-of-hotness'), 'moderate', 'Moderate', 2900, 20, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'level-of-hotness'), 'hot', 'Hot', 2900, 30, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'level-of-hotness'), 'wild', 'Wild', 2900, 40, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'level-of-hotness'), 'insane', 'Insane', 2900, 50, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update menu_options set is_active = false where group_id = (select id from menu_option_groups where slug = 'level-of-hotness') and slug not in ('none', 'lite', 'moderate', 'hot', 'wild', 'insane');
insert into menu_option_groups (slug, name, sort_order, is_active) values ('extra-sauce', 'Extra Sauce', 70, true)
  on conflict (slug) do update set name = excluded.name, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'extra-sauce'), 'no-extra-sauce', 'No Extra Sauce', 0, 0, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'extra-sauce'), 'classic-buffalo-small', 'Classic Buffalo Small', 5500, 10, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'extra-sauce'), 'garlic-parmesan-small', 'Garlic Parmesan Small', 5500, 20, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'extra-sauce'), 'honey-garlic-small', 'Honey Garlic Small', 5500, 30, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'extra-sauce'), 'brads-gravy-small', 'Brad''s Gravy Small', 5500, 40, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'extra-sauce'), 'bbq-lime-small', 'BBQ Lime Small', 5500, 50, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'extra-sauce'), 'honey-mustard-small', 'Honey Mustard Small', 5500, 60, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'extra-sauce'), 'sweet-spicy-small', 'Sweet Spicy Small', 5500, 70, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'extra-sauce'), 'smokey-bbq-small', 'Smokey BBQ Small', 5500, 80, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'extra-sauce'), 'cheezy-small', 'Cheezy Small', 5500, 90, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'extra-sauce'), 'salted-egg-small', 'Salted Egg Small', 5500, 100, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'extra-sauce'), 'classic-buffalo-large', 'Classic Buffalo Large', 13500, 110, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'extra-sauce'), 'garlic-parmesan-large', 'Garlic Parmesan Large', 13500, 120, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'extra-sauce'), 'honey-garlic-large', 'Honey Garlic Large', 13500, 130, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'extra-sauce'), 'brads-gravy-large', 'Brad''s Gravy Large', 13500, 140, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'extra-sauce'), 'bbq-lime-large', 'BBQ Lime Large', 13500, 150, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'extra-sauce'), 'honey-mustard-large', 'Honey Mustard Large', 13500, 160, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'extra-sauce'), 'sweet-spicy-large', 'Sweet Spicy Large', 13500, 170, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'extra-sauce'), 'smokey-bbq-large', 'Smokey BBQ Large', 13500, 180, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'extra-sauce'), 'cheezy-large', 'Cheezy Large', 13500, 190, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'extra-sauce'), 'salted-egg-large', 'Salted Egg Large', 13500, 200, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update menu_options set is_active = false where group_id = (select id from menu_option_groups where slug = 'extra-sauce') and slug not in ('no-extra-sauce', 'classic-buffalo-small', 'garlic-parmesan-small', 'honey-garlic-small', 'brads-gravy-small', 'bbq-lime-small', 'honey-mustard-small', 'sweet-spicy-small', 'smokey-bbq-small', 'cheezy-small', 'salted-egg-small', 'classic-buffalo-large', 'garlic-parmesan-large', 'honey-garlic-large', 'brads-gravy-large', 'bbq-lime-large', 'honey-mustard-large', 'sweet-spicy-large', 'smokey-bbq-large', 'cheezy-large', 'salted-egg-large');
insert into menu_option_groups (slug, name, sort_order, is_active) values ('add-ons', 'Add-ons', 80, true)
  on conflict (slug) do update set name = excluded.name, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'add-ons'), 'pepsi', 'Pepsi', 6900, 0, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'add-ons'), '7-up', '7-Up', 6900, 10, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'add-ons'), 'mountain-dew', 'Mountain Dew', 6900, 20, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'add-ons'), 'cucumber-lemonade-juice', 'Cucumber Lemonade Juice', 7900, 30, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'add-ons'), 'strawberry-red-tea', 'Strawberry Red Tea', 7900, 40, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'add-ons'), 'pineapple-juice', 'Pineapple Juice', 7900, 50, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'add-ons'), 'lemon-iced-tea-juice', 'Lemon Iced Tea Juice', 7900, 60, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'add-ons'), 'ny-fries', 'NY Fries', 8900, 70, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update menu_options set is_active = false where group_id = (select id from menu_option_groups where slug = 'add-ons') and slug not in ('pepsi', '7-up', 'mountain-dew', 'cucumber-lemonade-juice', 'strawberry-red-tea', 'pineapple-juice', 'lemon-iced-tea-juice', 'ny-fries');
insert into menu_option_groups (slug, name, sort_order, is_active) values ('choice-of-fries', 'Choice of Fries', 90, true)
  on conflict (slug) do update set name = excluded.name, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-fries'), 'small-fries', 'Small Fries', 0, 0, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-fries'), 'medium-fries', 'Medium Fries', 2000, 10, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-fries'), 'large-fries', 'Large Fries', 3000, 20, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update menu_options set is_active = false where group_id = (select id from menu_option_groups where slug = 'choice-of-fries') and slug not in ('small-fries', 'medium-fries', 'large-fries');
insert into menu_option_groups (slug, name, sort_order, is_active) values ('choice-of-drinks', 'Choice of Drinks', 100, true)
  on conflict (slug) do update set name = excluded.name, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), 'pepsi-8oz', 'Pepsi 8oz', 0, 0, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), 'mountain-dew-8oz', 'Mountain Dew 8oz', 0, 10, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), '7-up-8oz', '7-Up 8oz', 0, 20, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), 'ny-black-coffee-hot', 'NY Black Coffee (Hot)', 0, 30, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), 'pepsi-16oz', 'Pepsi 16oz', 1000, 40, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), 'mountain-dew-16oz', 'Mountain Dew 16oz', 1000, 50, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), '7-up-16oz', '7-Up 16oz', 1000, 60, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), 'pineapple-juice-8oz', 'Pineapple Juice 8oz', 1000, 70, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), 'lemon-iced-tea-8oz', 'Lemon Iced Tea 8oz', 1000, 80, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), 'cucumber-lemonade-juice-8oz', 'Cucumber Lemonade Juice 8oz', 1000, 90, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), 'strawberry-red-tea-8oz', 'Strawberry Red Tea 8oz', 1000, 100, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), 'orange-juice-8oz', 'Orange Juice 8oz', 1000, 110, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), 'pepsi-22oz', 'Pepsi 22oz', 2000, 120, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), 'mountain-dew-22oz', 'Mountain Dew 22oz', 2000, 130, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), '7-up-22oz', '7-Up 22oz', 2000, 140, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), 'pineapple-juice-16oz', 'Pineapple Juice 16oz', 2000, 150, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), 'lemon-iced-tea-16oz', 'Lemon Iced Tea 16oz', 2000, 160, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), 'cucumber-lemonade-juice-16oz', 'Cucumber Lemonade Juice 16oz', 2000, 170, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), 'strawberry-red-tea-16oz', 'Strawberry Red Tea 16oz', 2000, 180, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), 'orange-juice-16oz', 'Orange Juice 16oz', 2000, 190, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), 'pineapple-juice-22oz', 'Pineapple Juice 22oz', 3000, 200, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), 'lemon-iced-tea-22oz', 'Lemon Iced Tea 22oz', 3000, 210, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), 'cucumber-lemonade-juice-22oz', 'Cucumber Lemonade Juice 22oz', 3000, 220, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), 'strawberry-red-tea-22oz', 'Strawberry Red Tea 22oz', 3000, 230, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), 'orange-juice-22oz', 'Orange Juice 22oz', 3000, 240, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), 'iced-americano', 'Iced Americano', 6900, 250, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), 'iced-sweet-black', 'Iced Sweet Black', 6900, 260, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), 'iced-dark-mocha', 'Iced Dark Mocha', 6900, 270, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), 'iced-hazelnut', 'Iced Hazelnut', 6900, 280, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-drinks'), 'iced-vanilla', 'Iced Vanilla', 6900, 290, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update menu_options set is_active = false where group_id = (select id from menu_option_groups where slug = 'choice-of-drinks') and slug not in ('pepsi-8oz', 'mountain-dew-8oz', '7-up-8oz', 'ny-black-coffee-hot', 'pepsi-16oz', 'mountain-dew-16oz', '7-up-16oz', 'pineapple-juice-8oz', 'lemon-iced-tea-8oz', 'cucumber-lemonade-juice-8oz', 'strawberry-red-tea-8oz', 'orange-juice-8oz', 'pepsi-22oz', 'mountain-dew-22oz', '7-up-22oz', 'pineapple-juice-16oz', 'lemon-iced-tea-16oz', 'cucumber-lemonade-juice-16oz', 'strawberry-red-tea-16oz', 'orange-juice-16oz', 'pineapple-juice-22oz', 'lemon-iced-tea-22oz', 'cucumber-lemonade-juice-22oz', 'strawberry-red-tea-22oz', 'orange-juice-22oz', 'iced-americano', 'iced-sweet-black', 'iced-dark-mocha', 'iced-hazelnut', 'iced-vanilla');
insert into menu_option_groups (slug, name, sort_order, is_active) values ('best-value-offer', 'Best Value Offer', 110, true)
  on conflict (slug) do update set name = excluded.name, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'best-value-offer'), 'bavarian-waffle', 'Bavarian Waffle', 5900, 0, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'best-value-offer'), 'chocolate-waffle', 'Chocolate Waffle', 5900, 10, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'best-value-offer'), 'classic-hotdog', 'Classic Hotdog', 11500, 20, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'best-value-offer'), 'rookie-burger', 'Rookie Burger', 11900, 30, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update menu_options set is_active = false where group_id = (select id from menu_option_groups where slug = 'best-value-offer') and slug not in ('bavarian-waffle', 'chocolate-waffle', 'classic-hotdog', 'rookie-burger');
insert into menu_option_groups (slug, name, sort_order, is_active) values ('choice-of-ribs', 'Choice of Ribs', 120, true)
  on conflict (slug) do update set name = excluded.name, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-ribs'), 'original', 'Original', 0, 0, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-ribs'), 'spicy', 'Spicy', 0, 10, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update menu_options set is_active = false where group_id = (select id from menu_option_groups where slug = 'choice-of-ribs') and slug not in ('original', 'spicy');
insert into menu_option_groups (slug, name, sort_order, is_active) values ('choice-of-sauce', 'Choice of Sauce', 130, true)
  on conflict (slug) do update set name = excluded.name, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-sauce'), 'classic-buffalo', 'Classic Buffalo', 0, 0, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-sauce'), 'garlic-parmesan', 'Garlic Parmesan', 0, 10, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-sauce'), 'honey-garlic', 'Honey Garlic', 0, 20, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-sauce'), 'brads-gravy', 'Brad''s Gravy', 0, 30, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-sauce'), 'bbq-lime', 'BBQ Lime', 0, 40, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-sauce'), 'honey-mustard', 'Honey Mustard', 0, 50, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-sauce'), 'sweet-spicy', 'Sweet Spicy', 0, 60, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-sauce'), 'smokey-bbq', 'Smokey BBQ', 0, 70, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-sauce'), 'cheezy', 'Cheezy', 0, 80, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-sauce'), 'salted-egg', 'Salted Egg', 0, 90, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'choice-of-sauce'), 'plain', 'Plain', 0, 100, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update menu_options set is_active = false where group_id = (select id from menu_option_groups where slug = 'choice-of-sauce') and slug not in ('classic-buffalo', 'garlic-parmesan', 'honey-garlic', 'brads-gravy', 'bbq-lime', 'honey-mustard', 'sweet-spicy', 'smokey-bbq', 'cheezy', 'salted-egg', 'plain');
insert into menu_option_groups (slug, name, sort_order, is_active) values ('waffle-coffee-upgrade', 'Waffle Coffee Upgrade', 140, true)
  on conflict (slug) do update set name = excluded.name, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'waffle-coffee-upgrade'), 'hot-coffee', 'Hot Coffee', 7000, 0, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'waffle-coffee-upgrade'), 'iced-sweet-black', 'Iced Sweet Black', 7000, 10, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'waffle-coffee-upgrade'), 'iced-americano', 'Iced Americano', 7000, 20, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'waffle-coffee-upgrade'), 'iced-vanilla', 'Iced Vanilla', 9900, 30, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'waffle-coffee-upgrade'), 'iced-hazelnut', 'Iced Hazelnut', 9900, 40, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'waffle-coffee-upgrade'), 'iced-dark-mocha', 'Iced Dark Mocha', 9900, 50, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update menu_options set is_active = false where group_id = (select id from menu_option_groups where slug = 'waffle-coffee-upgrade') and slug not in ('hot-coffee', 'iced-sweet-black', 'iced-americano', 'iced-vanilla', 'iced-hazelnut', 'iced-dark-mocha');
insert into menu_option_groups (slug, name, sort_order, is_active) values ('waffle-combo-upgrade', 'Waffle Combo Upgrade', 150, true)
  on conflict (slug) do update set name = excluded.name, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'waffle-combo-upgrade'), 'hot-coffee', 'Hot Coffee', 0, 0, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'waffle-combo-upgrade'), 'iced-sweet-black', 'Iced Sweet Black', 0, 10, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'waffle-combo-upgrade'), 'iced-americano', 'Iced Americano', 0, 20, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'waffle-combo-upgrade'), 'iced-vanilla', 'Iced Vanilla', 2900, 30, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'waffle-combo-upgrade'), 'iced-hazelnut', 'Iced Hazelnut', 2900, 40, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values ((select id from menu_option_groups where slug = 'waffle-combo-upgrade'), 'iced-dark-mocha', 'Iced Dark Mocha', 2900, 50, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update menu_options set is_active = false where group_id = (select id from menu_option_groups where slug = 'waffle-combo-upgrade') and slug not in ('hot-coffee', 'iced-sweet-black', 'iced-americano', 'iced-vanilla', 'iced-hazelnut', 'iced-dark-mocha');

-- Wing flavours: TableVibe's description for each flavour's wing item.
update menu_options set description = 'Chicken wings tossed in a creamy and cheesy sauce with the right balance of garlic taste and mild spice.' where slug = 'garlic-parmesan' and group_id = (select id from menu_option_groups where slug = 'wing-flavour');
update menu_options set description = 'Chicken wings tossed in a perfect combination of our special hot sauce and butter, giving its rich flavor and spice.' where slug = 'classic-buffalo' and group_id = (select id from menu_option_groups where slug = 'wing-flavour');
update menu_options set description = 'Chicken wings tossed in a perfect balance of sweet pure honey and garlicky sauce.' where slug = 'honey-garlic' and group_id = (select id from menu_option_groups where slug = 'wing-flavour');
update menu_options set description = 'Chicken wings tossed in herbs and spices, blended with mustard, and sweetened with pure honey.' where slug = 'honey-mustard' and group_id = (select id from menu_option_groups where slug = 'wing-flavour');
update menu_options set description = 'Chicken wings tossed in a unique and Asian-inspired barbecue sauce infused with lime.' where slug = 'bbq-lime' and group_id = (select id from menu_option_groups where slug = 'wing-flavour');
update menu_options set description = 'Chicken wings tossed in a flavorful and meaty sauce made from meat stock and mushroom with hints of vegetables and aromatics.' where slug = 'brads-gravy' and group_id = (select id from menu_option_groups where slug = 'wing-flavour');
update menu_options set description = 'Chicken wings tossed in a tangy sauce with a combination of pure honey and specially blended hot sauce.' where slug = 'sweet-spicy' and group_id = (select id from menu_option_groups where slug = 'wing-flavour');
update menu_options set description = 'Chicken wings tossed in a mild smoky flavored barbecue sauce sprinkled with different herbs and spices.' where slug = 'smokey-barbecue' and group_id = (select id from menu_option_groups where slug = 'wing-flavour');
update menu_options set description = 'A rich, creamy cheese sauce, subtly enhanced with a delicate hint of unique flavors and aroma.' where slug = 'cheezy' and group_id = (select id from menu_option_groups where slug = 'wing-flavour');

-- Items.
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'whats-new'), 'ny-umbrella', 'NY Umbrella', 'Stay dry in style with our NY Umbrella featuring a sturdy frame and reliable canopy Perfect for rainy days in the city with a compact design that fits easily in any bag', 0, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'ny-umbrella'), 'regular', 'Regular', 'REG', 34900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'ny-umbrella');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'ny-umbrella');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'whats-new'), 'rainy-day-rush-bundle-a', 'Rainy Day Rush 2026 (Bundle A)', 'Bundle A: 
1 Half Order Chicken Wings
2 Rice
1 Carbonara
2 Juices (16oz)
1 Free NY Umbrella', 10, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'rainy-day-rush-bundle-a'), 'regular', 'Regular', 'REG', 129900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'rainy-day-rush-bundle-a');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'rainy-day-rush-bundle-a'), (select id from menu_option_groups where slug = 'chicken-flavor-6pcs'), true, 1, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'rainy-day-rush-bundle-a'), (select id from menu_option_groups where slug = 'choice-of-drink-1'), false, 0, 1, 10)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'rainy-day-rush-bundle-a'), (select id from menu_option_groups where slug = 'choice-of-drink-2'), false, 0, 1, 20)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'rainy-day-rush-bundle-a') and group_id not in ((select id from menu_option_groups where slug = 'chicken-flavor-6pcs'), (select id from menu_option_groups where slug = 'choice-of-drink-1'), (select id from menu_option_groups where slug = 'choice-of-drink-2'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'whats-new'), 'rainy-day-rush-bundle-b', 'Rainy Day Rush 2026 (Bundle B)', 'Bundle B:
1 Carbonara
2 Flavored Fries
2 Juices (16oz)
2 Classic Hotdog
1 Free NY Umbrella', 20, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'rainy-day-rush-bundle-b'), 'regular', 'Regular', 'REG', 129900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'rainy-day-rush-bundle-b');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'rainy-day-rush-bundle-b'), (select id from menu_option_groups where slug = 'choice-of-fries-medium-size-1'), false, 0, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'rainy-day-rush-bundle-b'), (select id from menu_option_groups where slug = 'choice-of-fries-medium-size-2'), false, 0, 1, 10)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'rainy-day-rush-bundle-b'), (select id from menu_option_groups where slug = 'choice-of-drink-1'), false, 0, 1, 20)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'rainy-day-rush-bundle-b'), (select id from menu_option_groups where slug = 'choice-of-drink-2'), false, 0, 1, 30)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'rainy-day-rush-bundle-b') and group_id not in ((select id from menu_option_groups where slug = 'choice-of-fries-medium-size-1'), (select id from menu_option_groups where slug = 'choice-of-fries-medium-size-2'), (select id from menu_option_groups where slug = 'choice-of-drink-1'), (select id from menu_option_groups where slug = 'choice-of-drink-2'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'hunger-busters'), 'brads-angus-burger-meal', 'Brad''s Angus Burger Meal', 'Brad''s specially grilled Angus burger patty topped with juicy tomato, lettuce and cheese, infused with aioli and sweet barbecue sauce, and served with fries and drink.', 0, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'brads-angus-burger-meal'), 'regular', 'Regular', 'REG', 40900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'brads-angus-burger-meal');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'brads-angus-burger-meal'), (select id from menu_option_groups where slug = 'choice-of-fries'), true, 1, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'brads-angus-burger-meal'), (select id from menu_option_groups where slug = 'choice-of-drinks'), true, 1, 1, 10)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'brads-angus-burger-meal'), (select id from menu_option_groups where slug = 'best-value-offer'), false, 0, 4, 20)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'brads-angus-burger-meal') and group_id not in ((select id from menu_option_groups where slug = 'choice-of-fries'), (select id from menu_option_groups where slug = 'choice-of-drinks'), (select id from menu_option_groups where slug = 'best-value-offer'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'hunger-busters'), 'blt-burger-meal', 'BLT Burger Meal', 'Juicy grilled quarter pounder patty with bacon, lettuce, and tomato, made perfect with aioli barbecue sauce, and served with fries and a drink.', 10, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'blt-burger-meal'), 'regular', 'Regular', 'REG', 36900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'blt-burger-meal');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'blt-burger-meal'), (select id from menu_option_groups where slug = 'choice-of-fries'), true, 1, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'blt-burger-meal'), (select id from menu_option_groups where slug = 'choice-of-drinks'), true, 1, 1, 10)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'blt-burger-meal'), (select id from menu_option_groups where slug = 'best-value-offer'), false, 0, 4, 20)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'blt-burger-meal') and group_id not in ((select id from menu_option_groups where slug = 'choice-of-fries'), (select id from menu_option_groups where slug = 'choice-of-drinks'), (select id from menu_option_groups where slug = 'best-value-offer'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'hunger-busters'), 'smokey-bbq-chicken-burger-meal', 'Smokey BBQ Chicken Burger Meal', 'Smokey, savory, crispy and golden chicken fillet topped with Buffalo Brad''s special smokey BBQ sauce, and paired with NY french fries and a drink.', 20, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'smokey-bbq-chicken-burger-meal'), 'regular', 'Regular', 'REG', 34800, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'smokey-bbq-chicken-burger-meal');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'smokey-bbq-chicken-burger-meal'), (select id from menu_option_groups where slug = 'choice-of-fries'), true, 1, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'smokey-bbq-chicken-burger-meal'), (select id from menu_option_groups where slug = 'choice-of-drinks'), true, 1, 1, 10)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'smokey-bbq-chicken-burger-meal'), (select id from menu_option_groups where slug = 'best-value-offer'), false, 0, 4, 20)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'smokey-bbq-chicken-burger-meal') and group_id not in ((select id from menu_option_groups where slug = 'choice-of-fries'), (select id from menu_option_groups where slug = 'choice-of-drinks'), (select id from menu_option_groups where slug = 'best-value-offer'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'hunger-busters'), 'honey-garlic-chicken-burger-meal', 'Honey Garlic Chicken Burger Meal', 'Crispy and golden chicken fillet glazed with Buffalo Brad''s sweet and tangy special honey garlic sauce, and paired with NY french fries and a drink.', 30, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'honey-garlic-chicken-burger-meal'), 'regular', 'Regular', 'REG', 34800, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'honey-garlic-chicken-burger-meal');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'honey-garlic-chicken-burger-meal'), (select id from menu_option_groups where slug = 'choice-of-fries'), true, 1, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'honey-garlic-chicken-burger-meal'), (select id from menu_option_groups where slug = 'choice-of-drinks'), true, 1, 1, 10)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'honey-garlic-chicken-burger-meal'), (select id from menu_option_groups where slug = 'best-value-offer'), false, 0, 4, 20)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'honey-garlic-chicken-burger-meal') and group_id not in ((select id from menu_option_groups where slug = 'choice-of-fries'), (select id from menu_option_groups where slug = 'choice-of-drinks'), (select id from menu_option_groups where slug = 'best-value-offer'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'hunger-busters'), 'buffalo-chicken-burger-meal', 'Buffalo Chicken Burger Meal', 'Succulent chicken thigh fillet sandwich on a bed of fresh lettuce served with our signature Classic Buffalo sauce, fries and a drink', 40, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'buffalo-chicken-burger-meal'), 'regular', 'Regular', 'REG', 34800, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'buffalo-chicken-burger-meal');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'buffalo-chicken-burger-meal'), (select id from menu_option_groups where slug = 'choice-of-fries'), true, 1, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'buffalo-chicken-burger-meal'), (select id from menu_option_groups where slug = 'choice-of-drinks'), true, 1, 1, 10)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'buffalo-chicken-burger-meal'), (select id from menu_option_groups where slug = 'best-value-offer'), false, 0, 4, 20)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'buffalo-chicken-burger-meal') and group_id not in ((select id from menu_option_groups where slug = 'choice-of-fries'), (select id from menu_option_groups where slug = 'choice-of-drinks'), (select id from menu_option_groups where slug = 'best-value-offer'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'hunger-busters'), 'cheezy-chicken-burger-meal', 'Cheezy Chicken Burger Meal', 'Crispy and golden chicken fillet, topped with Buffalo Brad''s special cheezy sauce all tucked between soft buns, and paired with NY french fries and a drink.', 50, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'cheezy-chicken-burger-meal'), 'regular', 'Regular', 'REG', 34800, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'cheezy-chicken-burger-meal');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'cheezy-chicken-burger-meal'), (select id from menu_option_groups where slug = 'choice-of-fries'), true, 1, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'cheezy-chicken-burger-meal'), (select id from menu_option_groups where slug = 'choice-of-drinks'), true, 1, 1, 10)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'cheezy-chicken-burger-meal'), (select id from menu_option_groups where slug = 'best-value-offer'), false, 0, 4, 20)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'cheezy-chicken-burger-meal') and group_id not in ((select id from menu_option_groups where slug = 'choice-of-fries'), (select id from menu_option_groups where slug = 'choice-of-drinks'), (select id from menu_option_groups where slug = 'best-value-offer'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'hunger-busters'), 'quarterback-burger-meal', 'The Quarterback Burger Meal', 'Classic grilled quarter pounder patty deliciously topped with cheese, basted with Brad''s thousand island sauce, and served with fries and a drink.', 60, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'quarterback-burger-meal'), 'regular', 'Regular', 'REG', 28200, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'quarterback-burger-meal');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'quarterback-burger-meal'), (select id from menu_option_groups where slug = 'choice-of-fries'), true, 1, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'quarterback-burger-meal'), (select id from menu_option_groups where slug = 'choice-of-drinks'), true, 1, 1, 10)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'quarterback-burger-meal'), (select id from menu_option_groups where slug = 'best-value-offer'), false, 0, 4, 20)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'quarterback-burger-meal') and group_id not in ((select id from menu_option_groups where slug = 'choice-of-fries'), (select id from menu_option_groups where slug = 'choice-of-drinks'), (select id from menu_option_groups where slug = 'best-value-offer'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'hunger-busters'), 'rookie-burger-meal', 'Rookie Burger Meal', 'Our mouthwatering burger perfectly topped with our signature aioli sauce and paired with fries and drink for an unparalleled burst of flavor.', 70, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'rookie-burger-meal'), 'regular', 'Regular', 'REG', 18800, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'rookie-burger-meal');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'rookie-burger-meal'), (select id from menu_option_groups where slug = 'choice-of-fries'), true, 1, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'rookie-burger-meal'), (select id from menu_option_groups where slug = 'choice-of-drinks'), true, 1, 1, 10)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'rookie-burger-meal'), (select id from menu_option_groups where slug = 'best-value-offer'), false, 0, 4, 20)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'rookie-burger-meal') and group_id not in ((select id from menu_option_groups where slug = 'choice-of-fries'), (select id from menu_option_groups where slug = 'choice-of-drinks'), (select id from menu_option_groups where slug = 'best-value-offer'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'breaktime-treats'), 'hungarian-sandwich-meal', 'Hungarian Sandwich Meal', 'Juicy and tender sausage topped with white onion, drizzled with sausage sauce, and served with fries and a drink.', 0, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'hungarian-sandwich-meal'), 'regular', 'Regular', 'REG', 27500, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'hungarian-sandwich-meal');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'hungarian-sandwich-meal'), (select id from menu_option_groups where slug = 'choice-of-fries'), true, 1, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'hungarian-sandwich-meal'), (select id from menu_option_groups where slug = 'choice-of-drinks'), true, 1, 1, 10)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'hungarian-sandwich-meal'), (select id from menu_option_groups where slug = 'best-value-offer'), false, 0, 4, 20)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'hungarian-sandwich-meal') and group_id not in ((select id from menu_option_groups where slug = 'choice-of-fries'), (select id from menu_option_groups where slug = 'choice-of-drinks'), (select id from menu_option_groups where slug = 'best-value-offer'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'breaktime-treats'), 'chili-cheesedog-meal', 'Chili Cheesedog Meal', 'An appetizing cheese hotdog smothered with chili con carne, mustard, ketchup and mayo, sprinkled with cheddar cheese, and served with fries and a drink.', 10, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'chili-cheesedog-meal'), 'regular', 'Regular', 'REG', 25500, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'chili-cheesedog-meal');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'chili-cheesedog-meal'), (select id from menu_option_groups where slug = 'choice-of-fries'), true, 1, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'chili-cheesedog-meal'), (select id from menu_option_groups where slug = 'choice-of-drinks'), true, 1, 1, 10)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'chili-cheesedog-meal'), (select id from menu_option_groups where slug = 'best-value-offer'), false, 0, 4, 20)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'chili-cheesedog-meal') and group_id not in ((select id from menu_option_groups where slug = 'choice-of-fries'), (select id from menu_option_groups where slug = 'choice-of-drinks'), (select id from menu_option_groups where slug = 'best-value-offer'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'breaktime-treats'), 'jalapeno-cheesedog-meal', 'Jalapeño Cheesedog Meal', 'Cheesy hotdog covered with nacho cheese, mustard, ketchup, mayo, pickled jalapeño and onion bits, and served with fries and a drink.', 20, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'jalapeno-cheesedog-meal'), 'regular', 'Regular', 'REG', 21500, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'jalapeno-cheesedog-meal');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'jalapeno-cheesedog-meal'), (select id from menu_option_groups where slug = 'choice-of-fries'), true, 1, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'jalapeno-cheesedog-meal'), (select id from menu_option_groups where slug = 'choice-of-drinks'), true, 1, 1, 10)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'jalapeno-cheesedog-meal'), (select id from menu_option_groups where slug = 'best-value-offer'), false, 0, 4, 20)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'jalapeno-cheesedog-meal') and group_id not in ((select id from menu_option_groups where slug = 'choice-of-fries'), (select id from menu_option_groups where slug = 'choice-of-drinks'), (select id from menu_option_groups where slug = 'best-value-offer'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'breaktime-treats'), 'classic-hotdog-meal', 'Classic Hotdog Meal', 'Classic tasty grilled beef hotdog with mayo, ketchup and mustard, and served with fries and a drink.', 30, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'classic-hotdog-meal'), 'regular', 'Regular', 'REG', 17500, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'classic-hotdog-meal');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'classic-hotdog-meal'), (select id from menu_option_groups where slug = 'choice-of-fries'), true, 1, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'classic-hotdog-meal'), (select id from menu_option_groups where slug = 'choice-of-drinks'), true, 1, 1, 10)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'classic-hotdog-meal'), (select id from menu_option_groups where slug = 'best-value-offer'), false, 0, 4, 20)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'classic-hotdog-meal') and group_id not in ((select id from menu_option_groups where slug = 'choice-of-fries'), (select id from menu_option_groups where slug = 'choice-of-drinks'), (select id from menu_option_groups where slug = 'best-value-offer'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'ny-specials'), 'ny-ribs', 'NY Ribs', 'Tender and juicy spare ribs smothered with the signature NY original or spicy sauce.', 0, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
update menu_items t set image_url = s.image_url, image_source = s.image_source, image_width = s.image_width,
  image_height = s.image_height, image_blur_data_url = s.image_blur_data_url, image_treatment = s.image_treatment
  from menu_items s where t.slug = 'ny-ribs' and s.slug = 'ribs-original' and t.image_url is null and t.image_source is null;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'ny-ribs'), 'regular', 'Regular', 'REG', 39900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'ny-ribs');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'ny-ribs'), (select id from menu_option_groups where slug = 'choice-of-ribs'), true, 1, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'ny-ribs') and group_id not in ((select id from menu_option_groups where slug = 'choice-of-ribs'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'ny-specials'), '10-pc-chicken-nuggets', '10-Pc. Chicken Nuggets', '10-piece deep fried breaded chicken meat served with your choice of flavored sauce.', 10, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
update menu_items t set image_url = s.image_url, image_source = s.image_source, image_width = s.image_width,
  image_height = s.image_height, image_blur_data_url = s.image_blur_data_url, image_treatment = s.image_treatment
  from menu_items s where t.slug = '10-pc-chicken-nuggets' and s.slug = 'chicken-nuggets' and t.image_url is null and t.image_source is null;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = '10-pc-chicken-nuggets'), 'regular', 'Regular', 'REG', 24900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = '10-pc-chicken-nuggets');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = '10-pc-chicken-nuggets'), (select id from menu_option_groups where slug = 'choice-of-sauce'), true, 1, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = '10-pc-chicken-nuggets') and group_id not in ((select id from menu_option_groups where slug = 'choice-of-sauce'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'ny-specials'), '6-pc-chicken-nuggets', '6-Pc. Chicken Nuggets', '6-piece deep fried breaded chicken meat served with your choice of flavored sauce.', 20, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
update menu_items t set image_url = s.image_url, image_source = s.image_source, image_width = s.image_width,
  image_height = s.image_height, image_blur_data_url = s.image_blur_data_url, image_treatment = s.image_treatment
  from menu_items s where t.slug = '6-pc-chicken-nuggets' and s.slug = 'chicken-nuggets' and t.image_url is null and t.image_source is null;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = '6-pc-chicken-nuggets'), 'regular', 'Regular', 'REG', 16900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = '6-pc-chicken-nuggets');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = '6-pc-chicken-nuggets'), (select id from menu_option_groups where slug = 'choice-of-sauce'), true, 1, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = '6-pc-chicken-nuggets') and group_id not in ((select id from menu_option_groups where slug = 'choice-of-sauce'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'pasta'), 'spaghetti', 'Spaghetti', 'Spaghetti pasta topped with sweet-style spaghetti sauce, cheddar cheese and juicy meatballs.', 0, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'spaghetti'), 'regular', 'Regular', 'REG', 18600, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'spaghetti');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'spaghetti');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'pasta'), 'carbonara', 'Carbonara', 'Fettuccini pasta topped with creamy carbonara sauce and mushroom slices, and garnished with parmesan cheese and parsley flakes.', 10, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'carbonara'), 'regular', 'Regular', 'REG', 18600, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'carbonara');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'carbonara');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'value-meals'), 'vm1-burger-steak-solo', 'VM1 Burger Steak Solo', 'Juicy and tender 2-piece burger steaks served with rice and rich savory gravy a satisfying classic meal done the Buffalo Brad''s way.', 0, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
update menu_items t set image_url = s.image_url, image_source = s.image_source, image_width = s.image_width,
  image_height = s.image_height, image_blur_data_url = s.image_blur_data_url, image_treatment = s.image_treatment
  from menu_items s where t.slug = 'vm1-burger-steak-solo' and s.slug = 'burger-steak-meal' and t.image_url is null and t.image_source is null;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'vm1-burger-steak-solo'), 'regular', 'Regular', 'REG', 12400, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'vm1-burger-steak-solo');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'vm1-burger-steak-solo'), (select id from menu_option_groups where slug = 'choice-of-sauce'), true, 1, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'vm1-burger-steak-solo') and group_id not in ((select id from menu_option_groups where slug = 'choice-of-sauce'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'value-meals'), 'vm2-chicken-nuggets-solo', 'VM2 Chicken Nuggets Solo', 'Crispy and golden 4-piece chicken nuggets paired with rice and your choice of dip. Perfectly bite-sized, big on flavor.', 10, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
update menu_items t set image_url = s.image_url, image_source = s.image_source, image_width = s.image_width,
  image_height = s.image_height, image_blur_data_url = s.image_blur_data_url, image_treatment = s.image_treatment
  from menu_items s where t.slug = 'vm2-chicken-nuggets-solo' and s.slug = 'chicken-nuggets-meal' and t.image_url is null and t.image_source is null;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'vm2-chicken-nuggets-solo'), 'regular', 'Regular', 'REG', 12400, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'vm2-chicken-nuggets-solo');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'vm2-chicken-nuggets-solo'), (select id from menu_option_groups where slug = 'choice-of-sauce'), true, 1, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'vm2-chicken-nuggets-solo') and group_id not in ((select id from menu_option_groups where slug = 'choice-of-sauce'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'value-meals'), 'vm3-boneless-chicken-solo', 'VM3 Boneless Chicken Solo', 'Get 2 pieces of our signature boneless chicken in your favorite sauce, served with rice. All the flavor, none of the bones!', 20, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
update menu_items t set image_url = s.image_url, image_source = s.image_source, image_width = s.image_width,
  image_height = s.image_height, image_blur_data_url = s.image_blur_data_url, image_treatment = s.image_treatment
  from menu_items s where t.slug = 'vm3-boneless-chicken-solo' and s.slug = 'boneless-chicken-meal' and t.image_url is null and t.image_source is null;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'vm3-boneless-chicken-solo'), 'regular', 'Regular', 'REG', 12400, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'vm3-boneless-chicken-solo');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'vm3-boneless-chicken-solo'), (select id from menu_option_groups where slug = 'choice-of-sauce'), true, 1, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'vm3-boneless-chicken-solo') and group_id not in ((select id from menu_option_groups where slug = 'choice-of-sauce'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'value-meals'), 'vm4-chicken-wings-solo', 'VM4 Chicken Wings Solo', 'Savor 2 pieces of NY Buffalo Brad''s iconic chicken wings tossed in your chosen sauce served with rice for a bold, flavorful meal.', 30, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
update menu_items t set image_url = s.image_url, image_source = s.image_source, image_width = s.image_width,
  image_height = s.image_height, image_blur_data_url = s.image_blur_data_url, image_treatment = s.image_treatment
  from menu_items s where t.slug = 'vm4-chicken-wings-solo' and s.slug = 'chicken-wings-meal' and t.image_url is null and t.image_source is null;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'vm4-chicken-wings-solo'), 'regular', 'Regular', 'REG', 12400, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'vm4-chicken-wings-solo');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'vm4-chicken-wings-solo'), (select id from menu_option_groups where slug = 'choice-of-sauce'), true, 1, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'vm4-chicken-wings-solo') and group_id not in ((select id from menu_option_groups where slug = 'choice-of-sauce'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'value-meals'), 'burger-steak-meal', 'VM1 Burger Steak Meal', 'Juicy and tender 2-piece burger steaks served with rice and rich savory gravy a satisfying classic meal done the Buffalo Brad''s way', 40, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'burger-steak-meal'), 'regular', 'Regular', 'REG', 19900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'burger-steak-meal');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'burger-steak-meal'), (select id from menu_option_groups where slug = 'choice-of-fries'), true, 1, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'burger-steak-meal'), (select id from menu_option_groups where slug = 'choice-of-drinks'), true, 1, 1, 10)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'burger-steak-meal'), (select id from menu_option_groups where slug = 'best-value-offer'), false, 0, 4, 20)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'burger-steak-meal') and group_id not in ((select id from menu_option_groups where slug = 'choice-of-fries'), (select id from menu_option_groups where slug = 'choice-of-drinks'), (select id from menu_option_groups where slug = 'best-value-offer'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'value-meals'), 'chicken-nuggets-meal', 'VM2 Chicken Nuggets Meal', 'Crispy and golden 4-piece chicken nuggets paired with rice and your choice of dip. Perfectly bite-sized, big on flavor', 50, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'chicken-nuggets-meal'), 'regular', 'Regular', 'REG', 19900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'chicken-nuggets-meal');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'chicken-nuggets-meal'), (select id from menu_option_groups where slug = 'choice-of-sauce'), true, 1, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'chicken-nuggets-meal'), (select id from menu_option_groups where slug = 'choice-of-fries'), true, 1, 1, 10)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'chicken-nuggets-meal'), (select id from menu_option_groups where slug = 'choice-of-drinks'), true, 1, 1, 20)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'chicken-nuggets-meal'), (select id from menu_option_groups where slug = 'best-value-offer'), false, 0, 4, 30)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'chicken-nuggets-meal') and group_id not in ((select id from menu_option_groups where slug = 'choice-of-sauce'), (select id from menu_option_groups where slug = 'choice-of-fries'), (select id from menu_option_groups where slug = 'choice-of-drinks'), (select id from menu_option_groups where slug = 'best-value-offer'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'value-meals'), 'boneless-chicken-meal', 'VM3 Boneless Chicken Meal', 'Get 2 pieces of our signature boneless chicken in your favorite sauce, served with rice. All the flavor, none of the bones!', 60, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'boneless-chicken-meal'), 'regular', 'Regular', 'REG', 19900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'boneless-chicken-meal');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'boneless-chicken-meal'), (select id from menu_option_groups where slug = 'choice-of-sauce'), true, 1, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'boneless-chicken-meal'), (select id from menu_option_groups where slug = 'choice-of-fries'), true, 1, 1, 10)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'boneless-chicken-meal'), (select id from menu_option_groups where slug = 'choice-of-drinks'), true, 1, 1, 20)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'boneless-chicken-meal'), (select id from menu_option_groups where slug = 'best-value-offer'), false, 0, 4, 30)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'boneless-chicken-meal') and group_id not in ((select id from menu_option_groups where slug = 'choice-of-sauce'), (select id from menu_option_groups where slug = 'choice-of-fries'), (select id from menu_option_groups where slug = 'choice-of-drinks'), (select id from menu_option_groups where slug = 'best-value-offer'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'value-meals'), 'chicken-wings-meal', 'VM4 Chicken Wings Meal', 'Savor 2 pieces of NY Buffalo Brad''s iconic chicken wings tossed in your chosen sauce served with rice for a bold, flavorful meal.', 70, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'chicken-wings-meal'), 'regular', 'Regular', 'REG', 19900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'chicken-wings-meal');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'chicken-wings-meal'), (select id from menu_option_groups where slug = 'choice-of-sauce'), true, 1, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'chicken-wings-meal'), (select id from menu_option_groups where slug = 'choice-of-fries'), true, 1, 1, 10)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'chicken-wings-meal'), (select id from menu_option_groups where slug = 'choice-of-drinks'), true, 1, 1, 20)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'chicken-wings-meal'), (select id from menu_option_groups where slug = 'best-value-offer'), false, 0, 4, 30)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'chicken-wings-meal') and group_id not in ((select id from menu_option_groups where slug = 'choice-of-sauce'), (select id from menu_option_groups where slug = 'choice-of-fries'), (select id from menu_option_groups where slug = 'choice-of-drinks'), (select id from menu_option_groups where slug = 'best-value-offer'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'ny-burgers'), 'brads-angus-burger', 'Brad''s Angus Burger', 'Brad''s specially grilled Angus burger patty topped with juicy tomato, lettuce and cheese, and infused with aioli and sweet barbecue sauce.', 0, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'brads-angus-burger'), 'regular', 'Regular', 'REG', 37900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'brads-angus-burger');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'brads-angus-burger');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'ny-burgers'), 'blt', 'BLT Burger', 'Juicy grilled quarter pounder patty with bacon, lettuce, and tomato, made perfect with aioli and sweet barbecue sauce.', 10, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'blt'), 'regular', 'Regular', 'REG', 30900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'blt');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'blt');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'ny-burgers'), 'smokey-bbq-chicken-burger', 'Smokey BBQ Chicken Burger', 'Smoky, savory, crispy and golden chicken fillet topped with Buffalo Brad''s special smokey BBQ sauce.', 20, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'smokey-bbq-chicken-burger'), 'regular', 'Regular', 'REG', 28800, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'smokey-bbq-chicken-burger');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'smokey-bbq-chicken-burger');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'ny-burgers'), 'buffalo-chicken', 'Buffalo Chicken Burger', 'Succulent chicken thigh fillet sandwich on a bed of fresh lettuce served with our signature Classic Buffalo sauce.', 30, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'buffalo-chicken'), 'regular', 'Regular', 'REG', 28800, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'buffalo-chicken');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'buffalo-chicken');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'ny-burgers'), 'cheezy-chicken-burger', 'Cheezy Chicken Burger', 'Crispy and golden chicken fillet, topped with Buffalo Brad''s special cheezy sauce all tucked between soft buns.', 40, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'cheezy-chicken-burger'), 'regular', 'Regular', 'REG', 28800, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'cheezy-chicken-burger');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'cheezy-chicken-burger');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'ny-burgers'), 'honey-garlic-chicken-burger', 'Honey Garlic Chicken Burger', 'Crispy and golden chicken fillet glazed with Buffalo Brad''s sweet and tangy special honey garlic sauce.', 50, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'honey-garlic-chicken-burger'), 'regular', 'Regular', 'REG', 28800, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'honey-garlic-chicken-burger');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'honey-garlic-chicken-burger');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'ny-burgers'), 'quarterback', 'The Quarterback Burger', 'Classic grilled quarter pounder patty deliciously topped with cheese and basted with Brad''s thousand island sauce.', 60, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'quarterback'), 'regular', 'Regular', 'REG', 20900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'quarterback');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'quarterback');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'ny-burgers'), 'rookie', 'Rookie Burger', 'Our mouthwatering burger perfectly topped with our signature aioli sauce for an unparalleled burst of flavor.', 70, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'rookie'), 'regular', 'Regular', 'REG', 11900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'rookie');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'rookie');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'ny-hotdogs'), 'hungarian-sandwich', 'Hungarian Sausage Sandwich', 'Juicy and tender sausage topped with white onion and drizzled with sausage sauce.', 0, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'hungarian-sandwich'), 'regular', 'Regular', 'REG', 21500, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'hungarian-sandwich');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'hungarian-sandwich');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'ny-hotdogs'), 'chili-cheese-dog', 'Chili Cheesedog', 'An appetizing cheese hotdog smothered with chili con carne, mustard, ketchup and mayo, and sprinkled with cheddar cheese.', 10, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'chili-cheese-dog'), 'regular', 'Regular', 'REG', 19500, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'chili-cheese-dog');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'chili-cheese-dog');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'ny-hotdogs'), 'jalapeno-cheese-dog', 'Jalapeño Cheesedog', 'Cheesy hotdog covered with nacho cheese, mustard, ketchup, mayo, pickled jalapeño and onion bits.', 20, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'jalapeno-cheese-dog'), 'regular', 'Regular', 'REG', 15500, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'jalapeno-cheese-dog');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'jalapeno-cheese-dog');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'ny-hotdogs'), 'classic-hotdog', 'Classic Hotdog', 'Classic tasty grilled beef hotdog with mayo, ketchup and mustard.', 30, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'classic-hotdog'), 'regular', 'Regular', 'REG', 11500, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'classic-hotdog');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'classic-hotdog');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'sides'), 'mozzarella-sticks', 'Mozzarella Sticks', 'Deep-fried mozzarella with a golden and crispy texture outside, gooey and stretchy melted cheese texture inside, and paired with marinara sauce.', 0, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'mozzarella-sticks'), 'regular', 'Regular', 'REG', 35900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'mozzarella-sticks');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'mozzarella-sticks');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'sides'), 'sunrise-waffle', 'Sunrise Waffle', 'A savory delight filled with tender ham, egg, and cheese, all nestled in a warm and soft waffle. Perfect for breakfast or anytime.', 10, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'sunrise-waffle'), 'regular', 'Regular', 'REG', 10900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'sunrise-waffle');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'sunrise-waffle'), (select id from menu_option_groups where slug = 'waffle-coffee-upgrade'), false, 0, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'sunrise-waffle') and group_id not in ((select id from menu_option_groups where slug = 'waffle-coffee-upgrade'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'sides'), 'bavarian-waffle', 'Bavarian Waffle', 'A soft, golden waffle filled with smooth, creamy Bavarian filling for an indulgent experience in every bite.', 20, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'bavarian-waffle'), 'regular', 'Regular', 'REG', 5900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'bavarian-waffle');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'bavarian-waffle'), (select id from menu_option_groups where slug = 'waffle-coffee-upgrade'), false, 0, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'bavarian-waffle') and group_id not in ((select id from menu_option_groups where slug = 'waffle-coffee-upgrade'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'sides'), 'chocolate-waffle', 'Chocolate Waffle', 'A warm, soft waffle filled with rich and perfect blend of chocolate sweetness in every bite. Perfect for satisfying your sweet cravings.', 30, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'chocolate-waffle'), 'regular', 'Regular', 'REG', 5900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'chocolate-waffle');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'chocolate-waffle'), (select id from menu_option_groups where slug = 'waffle-coffee-upgrade'), false, 0, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'chocolate-waffle') and group_id not in ((select id from menu_option_groups where slug = 'waffle-coffee-upgrade'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'sides'), 'sunrise-waffle-combo', 'Sunrise Waffle Combo', 'A savory delight filled with tender ham, egg, and cheese, all nestled in a warm and soft waffle with your favorite iced coffee. Perfect for breakfast or anytime.', 40, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
update menu_items t set image_url = s.image_url, image_source = s.image_source, image_width = s.image_width,
  image_height = s.image_height, image_blur_data_url = s.image_blur_data_url, image_treatment = s.image_treatment
  from menu_items s where t.slug = 'sunrise-waffle-combo' and s.slug = 'sunrise-waffle' and t.image_url is null and t.image_source is null;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'sunrise-waffle-combo'), 'regular', 'Regular', 'REG', 17900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'sunrise-waffle-combo');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'sunrise-waffle-combo'), (select id from menu_option_groups where slug = 'waffle-combo-upgrade'), false, 0, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'sunrise-waffle-combo') and group_id not in ((select id from menu_option_groups where slug = 'waffle-combo-upgrade'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'sides'), 'chocolate-waffle-combo', 'Chocolate Waffle Combo', 'A warm, soft waffle filled with rich and perfect blend of chocolate sweetness in every bite. Perfect for satisfying your sweet cravings with your favorite iced coffee.', 50, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
update menu_items t set image_url = s.image_url, image_source = s.image_source, image_width = s.image_width,
  image_height = s.image_height, image_blur_data_url = s.image_blur_data_url, image_treatment = s.image_treatment
  from menu_items s where t.slug = 'chocolate-waffle-combo' and s.slug = 'chocolate-waffle' and t.image_url is null and t.image_source is null;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'chocolate-waffle-combo'), 'regular', 'Regular', 'REG', 13900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'chocolate-waffle-combo');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'chocolate-waffle-combo'), (select id from menu_option_groups where slug = 'waffle-combo-upgrade'), false, 0, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'chocolate-waffle-combo') and group_id not in ((select id from menu_option_groups where slug = 'waffle-combo-upgrade'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'sides'), 'bavarian-waffle-combo', 'Bavarian Waffle Combo', 'A soft, golden waffle filled with smooth, creamy Bavarian filling paired with your favorite iced coffee for an indulgent experience in every bite.', 60, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
update menu_items t set image_url = s.image_url, image_source = s.image_source, image_width = s.image_width,
  image_height = s.image_height, image_blur_data_url = s.image_blur_data_url, image_treatment = s.image_treatment
  from menu_items s where t.slug = 'bavarian-waffle-combo' and s.slug = 'bavarian-waffle' and t.image_url is null and t.image_source is null;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'bavarian-waffle-combo'), 'regular', 'Regular', 'REG', 13900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'bavarian-waffle-combo');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'bavarian-waffle-combo'), (select id from menu_option_groups where slug = 'waffle-combo-upgrade'), false, 0, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'bavarian-waffle-combo') and group_id not in ((select id from menu_option_groups where slug = 'waffle-combo-upgrade'));
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'sides'), 'french-fries-sour-cream', 'French Fries Sour Cream', 'Crispy golden thick-cut fries with sour cream flavor.', 70, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'french-fries-sour-cream'), 'regular', 'Regular', 'REG', 16500, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'french-fries-sour-cream');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'french-fries-sour-cream');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'sides'), 'french-fries-bbq', 'French Fries BBQ', 'Crispy golden thick-cut fries with barbecue flavor.', 80, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'french-fries-bbq'), 'regular', 'Regular', 'REG', 16500, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'french-fries-bbq');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'french-fries-bbq');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'sides'), 'french-fries-cheese', 'French Fries Cheese', 'Crispy golden thick-cut fries with cheese flavor.', 90, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'french-fries-cheese'), 'regular', 'Regular', 'REG', 16500, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'french-fries-cheese');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'french-fries-cheese');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'sides'), 'french-fries', 'NY Fries', 'Crispy golden thick-cut fries.', 100, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'french-fries'), 'small', 'Small', 'SMALL', 8900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'french-fries'), 'medium', 'Medium', 'MED', 14900, 10, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'french-fries'), 'large', 'Large', 'LARGE', 16900, 20, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'small'), is_active = (slug in ('small', 'medium', 'large')) where item_id = (select id from menu_items where slug = 'french-fries');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'french-fries');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'sides'), 'plain-rice', 'Plain Rice', 'Plain white rice topped with parsley flakes.', 110, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'plain-rice'), 'regular', 'Regular', 'REG', 4900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'plain-rice');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'plain-rice');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'iced-coffee'), 'iced-dark-mocha', 'Iced Dark Mocha', 'For reference only: Refreshing iced beverage with dark chocolate and espresso.', 0, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'iced-dark-mocha'), 'regular', 'Regular', 'REG', 16900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'iced-dark-mocha');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'iced-dark-mocha');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'iced-coffee'), 'iced-vanilla', 'Iced Vanilla', 'For reference only: Indulge in the euphoric blend of sweet vanilla in this refreshing iced drink.', 10, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'iced-vanilla'), 'regular', 'Regular', 'REG', 16900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'iced-vanilla');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'iced-vanilla');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'iced-coffee'), 'iced-hazelnut', 'Iced Hazelnut', 'For reference only: Indulge in the rich and nutty goodness of Hazelnut, a delightful flavor that adds a touch of warmth and sophistication to your favorite beverages.', 20, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'iced-hazelnut'), 'regular', 'Regular', 'REG', 16900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'iced-hazelnut');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'iced-hazelnut');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'iced-coffee'), 'iced-americano', 'Iced Americano', 'For reference: Enjoy the bold and invigorating taste of this Iced Americano.', 30, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'iced-americano'), 'regular', 'Regular', 'REG', 11900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'iced-americano');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'iced-americano');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'iced-coffee'), 'iced-sweet-black', 'Iced Sweet Black', 'For reference: Iced sweet black, a cold and slightly sweetened black coffee.', 40, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'iced-sweet-black'), 'regular', 'Regular', 'REG', 11900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'iced-sweet-black');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'iced-sweet-black');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'beverages'), 'cucumber-lemonade', 'Cucumber Lemonade Juice', 'Cucumber Lemonade', 0, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'cucumber-lemonade'), '8-oz', '8oz', '8 OZ', 7900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'cucumber-lemonade'), '16-oz', '16oz', '16 OZ', 11900, 10, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'cucumber-lemonade'), '22-oz', '22oz', '22 OZ', 13900, 20, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = '8-oz'), is_active = (slug in ('8-oz', '16-oz', '22-oz')) where item_id = (select id from menu_items where slug = 'cucumber-lemonade');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'cucumber-lemonade');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'beverages'), 'pineapple-juice', 'Pineapple Juice', 'For reference only: Quench your thirst with Pineapple Juice, a refreshing beverage bursting with tropical flavor.', 10, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'pineapple-juice'), '8-oz', '8oz', '8 OZ', 7900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'pineapple-juice'), '16-oz', '16oz', '16 OZ', 11900, 10, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'pineapple-juice'), '22-oz', '22oz', '22 OZ', 13900, 20, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = '8-oz'), is_active = (slug in ('8-oz', '16-oz', '22-oz')) where item_id = (select id from menu_items where slug = 'pineapple-juice');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'pineapple-juice');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'beverages'), 'strawberry-red-tea', 'Strawberry Red Tea', 'For reference: Refresh yourself with this pure and tangy Strawberry Red Tea, a natural sweetness in every sip.', 20, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'strawberry-red-tea'), '8-oz', '8oz', '8 OZ', 7900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'strawberry-red-tea'), '16-oz', '16oz', '16 OZ', 11900, 10, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'strawberry-red-tea'), '22-oz', '22oz', '22 OZ', 13900, 20, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = '8-oz'), is_active = (slug in ('8-oz', '16-oz', '22-oz')) where item_id = (select id from menu_items where slug = 'strawberry-red-tea');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'strawberry-red-tea');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'beverages'), 'lemon-iced-tea', 'Lemon Iced Tea Juice', 'Iced Tea', 30, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'lemon-iced-tea'), '8-oz', '8oz', '8 OZ', 7900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'lemon-iced-tea'), '16-oz', '16oz', '16 OZ', 11900, 10, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'lemon-iced-tea'), '22-oz', '22oz', '22 OZ', 13900, 20, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = '8-oz'), is_active = (slug in ('8-oz', '16-oz', '22-oz')) where item_id = (select id from menu_items where slug = 'lemon-iced-tea');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'lemon-iced-tea');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'beverages'), 'pepsi', 'Pepsi', 'Satisfy your thirst with the ultimate refreshment of Pepsi, as its unique blend of flavors and effervescence provides a revitalizing and satisfying drinking experience.', 40, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'pepsi'), '8-oz', '8oz', '8 OZ', 6900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'pepsi'), '16-oz', '16oz', '16 OZ', 10900, 10, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'pepsi'), '22-oz', '22oz', '22 OZ', 12900, 20, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = '8-oz'), is_active = (slug in ('8-oz', '16-oz', '22-oz')) where item_id = (select id from menu_items where slug = 'pepsi');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'pepsi');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'beverages'), '7-up', '7-Up', 'Lemon-lime-flavored soda.', 50, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = '7-up'), '8-oz', '8oz', '8 OZ', 6900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = '7-up'), '16-oz', '16oz', '16 OZ', 10900, 10, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = '7-up'), '22-oz', '22oz', '22 OZ', 12900, 20, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = '8-oz'), is_active = (slug in ('8-oz', '16-oz', '22-oz')) where item_id = (select id from menu_items where slug = '7-up');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = '7-up');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'beverages'), 'mountain-dew', 'Mountain Dew', 'Experience the bold and exhilarating taste of Mountain Dew, offering a refreshing and energizing beverage.', 60, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'mountain-dew'), '8-oz', '8oz', '8 OZ', 6900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'mountain-dew'), '16-oz', '16oz', '16 OZ', 10900, 10, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'mountain-dew'), '22-oz', '22oz', '22 OZ', 12900, 20, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = '8-oz'), is_active = (slug in ('8-oz', '16-oz', '22-oz')) where item_id = (select id from menu_items where slug = 'mountain-dew');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'mountain-dew');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'beverages'), 'bottled-water', 'Bottled Water', 'Bottled drinking water', 70, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'bottled-water'), 'regular', 'Regular', 'REG', 4900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'bottled-water');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'bottled-water');
insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = 'beverages'), 'hot-coffee', 'Hot Coffee', 'Hot black coffee', 80, true, 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.')
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'hot-coffee'), 'regular', 'Regular', 'REG', 4900, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'regular'), is_active = (slug in ('regular')) where item_id = (select id from menu_items where slug = 'hot-coffee');
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'hot-coffee');
update menu_items set is_active = true, pricing_note = 'TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured 2026-11-09. The same for pickup and delivery there.' where slug = 'chicken-wings';
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'chicken-wings'), 'half', 'Half (6 Pcs)', 'HALF', 39800, 0, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values ((select id from menu_items where slug = 'chicken-wings'), 'full', 'Full (10 Pcs)', 'FULL', 62500, 10, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;
update item_variations set is_default = (slug = 'half'), is_active = (slug in ('half', 'full')) where item_id = (select id from menu_items where slug = 'chicken-wings');
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'chicken-wings'), (select id from menu_option_groups where slug = 'wing-flavour'), true, 1, 1, 0)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'chicken-wings'), (select id from menu_option_groups where slug = 'choice-of-chicken'), true, 1, 1, 10)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'chicken-wings'), (select id from menu_option_groups where slug = 'level-of-hotness'), true, 1, 1, 20)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'chicken-wings'), (select id from menu_option_groups where slug = 'extra-sauce'), true, 1, 1, 30)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values ((select id from menu_items where slug = 'chicken-wings'), (select id from menu_option_groups where slug = 'add-ons'), false, 0, 8, 40)
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;
delete from menu_item_option_groups where item_id = (select id from menu_items where slug = 'chicken-wings') and group_id not in ((select id from menu_option_groups where slug = 'wing-flavour'), (select id from menu_option_groups where slug = 'choice-of-chicken'), (select id from menu_option_groups where slug = 'level-of-hotness'), (select id from menu_option_groups where slug = 'extra-sauce'), (select id from menu_option_groups where slug = 'add-ons'));

-- Ours that TableVibe does not sell.
update menu_items set is_active = false, pricing_note = 'Retired when the menu followed the TableVibe webshop, which sells the VM1 to VM4 Solo and Meal items instead. 2026-11-09.' where slug = 'value-meal';
update menu_items set is_active = false, pricing_note = 'Retired when the menu followed the TableVibe webshop, which sells 6-Pc. and 10-Pc. Chicken Nuggets as two items. 2026-11-09.' where slug = 'chicken-nuggets';
update menu_items set is_active = false, pricing_note = 'Retired when the menu followed the TableVibe webshop, which sells one NY Ribs item with a Choice of Ribs. 2026-11-09.' where slug = 'ribs-original';
update menu_items set is_active = false, pricing_note = 'Retired when the menu followed the TableVibe webshop, which sells one NY Ribs item with a Choice of Ribs. 2026-11-09.' where slug = 'ribs-spicy';
update menu_items set is_active = false, pricing_note = 'Switched off: not on the TableVibe webshop menu, which this menu now follows exactly. 2026-11-09.' where slug = 'hawaiian-bbq-dog';
update menu_items set is_active = false, pricing_note = 'Switched off: not on the TableVibe webshop menu, which this menu now follows exactly. 2026-11-09.' where slug = 'hungarian-rice-meal';
update menu_items set is_active = false, pricing_note = 'Switched off: not on the TableVibe webshop menu, which this menu now follows exactly. 2026-11-09.' where slug = 'chicken-with-rice';
end
$$;
