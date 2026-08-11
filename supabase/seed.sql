-- supabase/seed.sql
--
-- GENERATED FILE. Do not edit by hand.
-- Regenerate with `npm run build:seed` after changing lib/catalog/.
--
-- The published Hot Wings menu, the nine flavours, the Level of Hotness
-- scale and the nine branches, as transcribed in lib/catalog/. Generated
-- rather than written so the storefront and the database cannot drift.
--
-- Every insert is an upsert on a natural key, so this file is safe to
-- re-run. Two categories of column are deliberately left out of the
-- update lists, because they belong to whoever is running the shop and
-- not to this file:
--
--   * availability: menu_categories.is_active, menu_items.is_active,
--     item_variations.is_active, menu_options.is_active
--   * branch operations: is_active, is_accepting_orders, prep_minutes_
--     default, pickup_slot_minutes, pickup_slot_capacity, price_list_id
--
-- Prices ARE reasserted. This file is the published price list, so
-- re-running it after someone edits a price in the workspace puts the
-- printed menu back. That is the intended behaviour, and it is the reason
-- to reach for this file rather than for a hand-written patch.
--
-- Not seeded, on purpose:
--
--   * store_hours. The real weekday hours are open question 2 in spec
--     section 28 and only the owner can answer them. branch_is_open_at()
--     fails closed with no rows, which is the correct behaviour: a shop
--     with unknown hours is shut, not guessing.
--   * the pilot branch. All nine are seeded is_active = false. Which one
--     opens first is question 1 and nothing here decides it.
--   * item_variation_prices. One price list exists, and its prices are
--     already on item_variations.price_cents, which is where
--     resolve_variation_price_cents() falls back to. Seeding both would
--     be two copies of one number. The override table earns its place the
--     day a second list exists.
--   * image_url. scripts/ingest-legacy-images.ts writes it after it
--     uploads to Storage. What is seeded here is the archive provenance,
--     so a photograph can be traced back to its source file.

begin;

-- ---------------------------------------------------------------------------
-- Price list
-- ---------------------------------------------------------------------------

insert into price_lists (slug, name) values
  ('hot-wings-standard', 'Hot Wings standard')
on conflict (slug) do update set name = excluded.name;

-- ---------------------------------------------------------------------------
-- Branches (9), every one inactive. Exactly one gets flipped
-- when the owner names the pilot.
-- ---------------------------------------------------------------------------

insert into branches (
  slug, name, short_name, format, price_list_id,
  address_line, city, phones, sort_order
) values
  ('mango-avenue', 'NYBB Hot Wings, Mango Avenue', 'Mango Avenue', 'street', (select id from price_lists where slug = 'hot-wings-standard'), 'Gen. Maxilom Avenue (Mango Avenue)', 'Cebu City', array['0906-440-5297']::text[], 0),
  ('garden-bloc', 'NYBB Hot Wings, Central Bloc', 'Central Bloc, IT Park', 'street', (select id from price_lists where slug = 'hot-wings-standard'), 'Central Bloc, Cebu IT Park, Lahug', 'Cebu City', array['0906-331-3631', '(032) 318-2405']::text[], 1),
  ('shell-gorordo', 'NYBB Hot Wings, Shell Gorordo', 'Shell Gorordo', 'petrol', (select id from price_lists where slug = 'hot-wings-standard'), '839 Gorordo Avenue', 'Cebu City', array['0917-114-1392']::text[], 2),
  ('shell-cebu-country-club', 'NYBB Hot Wings, Shell Mobility Cebu Country Club', 'Shell Cebu Country Club', 'petrol', (select id from price_lists where slug = 'hot-wings-standard'), 'Gov. Cuenco Avenue, Kasambagan', 'Cebu City', array['0932-360-2916']::text[], 3),
  ('shell-north-gateway', 'NYBB Hot Wings, Shell North Gateway', 'Shell North Gateway', 'petrol', (select id from price_lists where slug = 'hot-wings-standard'), 'JP Rizal North Road, Labogon', 'Mandaue City', array['0906-538-1220']::text[], 4),
  ('shell-naga', 'NYBB Hot Wings, Shell Mobility Naga', 'Shell Naga', 'petrol', (select id from price_lists where slug = 'hot-wings-standard'), 'Uling Road', 'Naga, Cebu', array['0946-352-0538']::text[], 5),
  ('chong-hua-medical-mall', 'NYBB Hot Wings, Chong Hua Medical Mall', 'Chong Hua Medical Mall', 'hospital', (select id from price_lists where slug = 'hot-wings-standard'), 'Don Julio Llorente corner C. Rodriguez', 'Cebu City', array['0969-328-2875']::text[], 6),
  ('nustar', 'NYBB Hot Wings, NUSTAR', 'NUSTAR', 'casino', (select id from price_lists where slug = 'hot-wings-standard'), 'NUSTAR Resort, South Road Properties', 'Cebu City', array['0917-790-0243']::text[], 7),
  ('sm-city-cebu', 'NYBB Hot Wings, SM City Cebu Food Hall', 'SM City Cebu', 'food-hall', (select id from price_lists where slug = 'hot-wings-standard'), 'SM City Cebu Food Hall', 'Cebu City', array['0917-790-0386']::text[], 8)
on conflict (slug) do update set
  name = excluded.name,
  short_name = excluded.short_name,
  format = excluded.format,
  address_line = excluded.address_line,
  city = excluded.city,
  phones = excluded.phones,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------

insert into menu_categories (slug, name, blurb, sort_order) values
  ('chicken-wings', 'Chicken Wings', 'Nine flavours, five levels of heat. The reason the place exists.', 0),
  ('ribs', 'Ribs', 'Slow cooked, two ways.', 1),
  ('ny-burgers', 'NY Burgers', 'Five burgers, numbered BB1 to BB5.', 2),
  ('ny-chicken-burgers', 'NY Chicken Burgers', 'The wing flavours, in a bun.', 3),
  ('ny-hotdogs', 'NY Hotdogs', 'Five dogs, numbered H1 to H5.', 4),
  ('value-meals', 'Value Meals', 'Two pieces of wings and rice, then build up from there.', 5),
  ('sides', 'Sides', 'The supporting cast.', 6),
  ('pasta', 'Pasta', 'Two plates, solo or as a meal.', 7),
  ('waffles', 'Waffles', 'On their own, or with an iced coffee.', 8),
  ('iced-coffee', 'Iced Coffee Series', 'Cold, and cheaper than the mall.', 9)
on conflict (slug) do update set
  name = excluded.name,
  blurb = excluded.blurb,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Items
-- ---------------------------------------------------------------------------

insert into menu_items (
  category_id, slug, name, code, description,
  image_source, image_treatment, pricing_note, is_featured, sort_order
) values
  ((select id from menu_categories where slug = 'chicken-wings'), 'chicken-wings', 'Chicken Wings', null, 'Fried to order, then sauced in the flavour you pick. Add a level of hotness on top of any flavour.', '2024/05/Classic-Buffalo.jpg', 'lifestyle', null, true, 0),
  ((select id from menu_categories where slug = 'ribs'), 'ribs-original', 'Original Ribs', null, null, '2025/03/RIBS-ORIG.jpg', 'cutout', null, true, 0),
  ((select id from menu_categories where slug = 'ribs'), 'ribs-spicy', 'Spicy Ribs', null, null, '2025/03/RIBS-SPICY.jpg', 'cutout', null, false, 1),
  ((select id from menu_categories where slug = 'ny-burgers'), 'rookie', 'The Rookie', 'BB1', null, '2024/05/Rookie-Burger-1.jpg', 'cutout', null, false, 0),
  ((select id from menu_categories where slug = 'ny-burgers'), 'quarterback', 'The Quarterback', 'BB2', null, '2024/05/The-Quarter-Burger.jpg', 'cutout', null, false, 1),
  ((select id from menu_categories where slug = 'ny-burgers'), 'blt', 'BLT', 'BB3', null, '2024/05/BLT-Burger.jpg', 'cutout', null, false, 2),
  ((select id from menu_categories where slug = 'ny-burgers'), 'buffalo-chicken', 'Buffalo Chicken', 'BB4', null, '2024/05/Buffalo-Chicken-Burger.jpg', 'cutout', null, true, 3),
  ((select id from menu_categories where slug = 'ny-burgers'), 'brads-angus-burger-meal', 'Brad''s Angus Burger Meal', 'BB5', null, '2024/05/Brads-Angus-Burger.jpg', 'cutout', null, false, 4),
  ((select id from menu_categories where slug = 'ny-chicken-burgers'), 'smokey-bbq-chicken-burger', 'Smokey BBQ Chicken Burger', null, null, '2025/03/smoky-Burger-bundle-1.jpg', 'cutout', 'The live menu lists Smokey BBQ at 309 and a Smokey BBQ Meal at 350. Read here as one item with two sizes. Confirm.', false, 0),
  ((select id from menu_categories where slug = 'ny-chicken-burgers'), 'honey-garlic-chicken-burger', 'Honey Garlic Chicken Burger', null, null, '2025/03/honey-Burger-bundle-1.jpg', 'cutout', null, false, 1),
  ((select id from menu_categories where slug = 'ny-chicken-burgers'), 'cheezy-chicken-burger', 'Cheezy Chicken Burger', null, null, '2025/03/Cheezy-Burger-bundle-1.jpg', 'cutout', null, false, 2),
  ((select id from menu_categories where slug = 'ny-hotdogs'), 'classic-hotdog', 'Classic', 'H1', null, '2024/05/Classic-Hotdog.jpg', 'cutout', null, false, 0),
  ((select id from menu_categories where slug = 'ny-hotdogs'), 'jalapeno-cheese-dog', 'Jalapeno Cheese', 'H2', null, '2024/05/Jalapeno-Cheese-Dog.jpg', 'cutout', null, false, 1),
  ((select id from menu_categories where slug = 'ny-hotdogs'), 'chili-cheese-dog', 'Chili Cheese', 'H3', null, '2024/05/Chili-Cheese-Dog.jpg', 'cutout', null, false, 2),
  ((select id from menu_categories where slug = 'ny-hotdogs'), 'hawaiian-bbq-dog', 'Hawaiian BBQ', 'H4', null, '2024/05/Hawaiian-BBQ-Dog.jpg', 'cutout', null, false, 3),
  ((select id from menu_categories where slug = 'ny-hotdogs'), 'hungarian-sandwich', 'Hungarian Sandwich', 'H5', null, '2024/05/Hungarian-Sausage.jpg', 'cutout', null, false, 4),
  ((select id from menu_categories where slug = 'value-meals'), 'value-meal', 'Value Meal', null, 'Two pieces of wings with rice. Add a drink, then fries.', '2024/05/Value-Meals.jpg', 'cutout', null, true, 0),
  ((select id from menu_categories where slug = 'sides'), 'chicken-nuggets', 'Chicken Nuggets', null, null, '2024/05/Chicken-Nuggets-1.jpg', 'cutout', null, false, 0),
  ((select id from menu_categories where slug = 'sides'), 'mozzarella-sticks', 'Mozzarella Sticks', null, null, '2024/05/Untitled-design-2024-05-22T160627.766.png', 'lifestyle', null, false, 1),
  ((select id from menu_categories where slug = 'sides'), 'hungarian-rice-meal', 'Hungarian Rice Meal', null, null, null, null, null, false, 2),
  ((select id from menu_categories where slug = 'sides'), 'french-fries', 'French Fries', null, null, null, null, null, false, 3),
  ((select id from menu_categories where slug = 'sides'), 'chicken-with-rice', 'Chicken with Rice', null, null, null, null, null, false, 4),
  ((select id from menu_categories where slug = 'pasta'), 'spaghetti', 'Spaghetti', null, null, '2025/03/spag.jpg', 'cutout', 'The live menu prints 156/159 without labels. Read as solo and meal, matching how the sides list labels its own two-price items. Confirm.', false, 0),
  ((select id from menu_categories where slug = 'pasta'), 'carbonara', 'Carbonara', null, null, '2025/03/carbonara.jpg', 'cutout', 'The live menu prints 156/159 without labels. Read as solo and meal, matching how the sides list labels its own two-price items. Confirm.', false, 1),
  ((select id from menu_categories where slug = 'waffles'), 'chocolate-waffle', 'Chocolate Waffle', null, null, '2025/03/chocolate-coffee.png', 'transparent', null, false, 0),
  ((select id from menu_categories where slug = 'waffles'), 'bavarian-waffle', 'Bavarian Waffle', null, null, '2025/03/bavarian-coffee.png', 'transparent', null, false, 1),
  ((select id from menu_categories where slug = 'waffles'), 'sunrise-waffle', 'Sunrise Waffle', null, null, '2025/03/egg-coffee.png', 'transparent', null, false, 2),
  ((select id from menu_categories where slug = 'iced-coffee'), 'iced-americano', 'Iced Americano', null, null, null, null, null, false, 0),
  ((select id from menu_categories where slug = 'iced-coffee'), 'iced-vanilla', 'Iced Vanilla', null, null, null, null, null, false, 1),
  ((select id from menu_categories where slug = 'iced-coffee'), 'iced-dark-mocha', 'Iced Dark Mocha', null, null, null, null, null, false, 2),
  ((select id from menu_categories where slug = 'iced-coffee'), 'iced-hazelnut', 'Iced Hazelnut', null, null, null, null, null, false, 3)
on conflict (slug) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  code = excluded.code,
  description = excluded.description,
  image_source = excluded.image_source,
  image_treatment = excluded.image_treatment,
  pricing_note = excluded.pricing_note,
  is_featured = excluded.is_featured,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Variations. A single-price item still gets one row, so nothing
-- downstream has to branch on whether an item has sizes.
-- ---------------------------------------------------------------------------

insert into item_variations (
  item_id, slug, label, short_label, price_cents, is_default, sort_order
) values
  ((select id from menu_items where slug = 'chicken-wings'), 'half', 'Half, 6 pieces', 'HALF', 32900, true, 0),
  ((select id from menu_items where slug = 'chicken-wings'), 'full', 'Full, 10 pieces', 'FULL', 52900, false, 1),
  ((select id from menu_items where slug = 'ribs-original'), 'regular', 'Regular', 'REG', 34900, true, 0),
  ((select id from menu_items where slug = 'ribs-spicy'), 'regular', 'Regular', 'REG', 34900, true, 0),
  ((select id from menu_items where slug = 'rookie'), 'regular', 'Regular', 'REG', 15900, true, 0),
  ((select id from menu_items where slug = 'quarterback'), 'regular', 'Regular', 'REG', 22900, true, 0),
  ((select id from menu_items where slug = 'blt'), 'regular', 'Regular', 'REG', 27900, true, 0),
  ((select id from menu_items where slug = 'buffalo-chicken'), 'regular', 'Regular', 'REG', 30900, true, 0),
  ((select id from menu_items where slug = 'brads-angus-burger-meal'), 'regular', 'Regular', 'REG', 34900, true, 0),
  ((select id from menu_items where slug = 'smokey-bbq-chicken-burger'), 'a-la-carte', 'A la carte', 'SOLO', 30900, true, 0),
  ((select id from menu_items where slug = 'smokey-bbq-chicken-burger'), 'meal', 'Meal', 'MEAL', 35000, false, 1),
  ((select id from menu_items where slug = 'honey-garlic-chicken-burger'), 'regular', 'Regular', 'REG', 30900, true, 0),
  ((select id from menu_items where slug = 'cheezy-chicken-burger'), 'regular', 'Regular', 'REG', 30900, true, 0),
  ((select id from menu_items where slug = 'classic-hotdog'), 'regular', 'Regular', 'REG', 14900, true, 0),
  ((select id from menu_items where slug = 'jalapeno-cheese-dog'), 'regular', 'Regular', 'REG', 17900, true, 0),
  ((select id from menu_items where slug = 'chili-cheese-dog'), 'regular', 'Regular', 'REG', 20900, true, 0),
  ((select id from menu_items where slug = 'hawaiian-bbq-dog'), 'regular', 'Regular', 'REG', 24900, true, 0),
  ((select id from menu_items where slug = 'hungarian-sandwich'), 'regular', 'Regular', 'REG', 23900, true, 0),
  ((select id from menu_items where slug = 'value-meal'), 'set-a', 'Set A, wings and rice', 'SET A', 10200, true, 0),
  ((select id from menu_items where slug = 'value-meal'), 'set-b', 'Set B, with a drink', 'SET B', 12400, false, 1),
  ((select id from menu_items where slug = 'value-meal'), 'set-c', 'Set C, with a drink and fries', 'SET C', 15000, false, 2),
  ((select id from menu_items where slug = 'chicken-nuggets'), '6-pieces', '6 pieces', '6 PC', 13100, true, 0),
  ((select id from menu_items where slug = 'chicken-nuggets'), '10-pieces', '10 pieces', '10 PC', 21000, false, 1),
  ((select id from menu_items where slug = 'mozzarella-sticks'), 'regular', 'Regular', 'REG', 29900, true, 0),
  ((select id from menu_items where slug = 'hungarian-rice-meal'), 'regular', 'Regular', 'REG', 18900, true, 0),
  ((select id from menu_items where slug = 'french-fries'), 'regular', 'Regular', 'REG', 12800, true, 0),
  ((select id from menu_items where slug = 'chicken-with-rice'), 'solo', 'Solo', 'SOLO', 10500, true, 0),
  ((select id from menu_items where slug = 'chicken-with-rice'), 'meal', 'Meal', 'MEAL', 13000, false, 1),
  ((select id from menu_items where slug = 'spaghetti'), 'solo', 'Solo', 'SOLO', 15600, true, 0),
  ((select id from menu_items where slug = 'spaghetti'), 'meal', 'Meal', 'MEAL', 15900, false, 1),
  ((select id from menu_items where slug = 'carbonara'), 'solo', 'Solo', 'SOLO', 15600, true, 0),
  ((select id from menu_items where slug = 'carbonara'), 'meal', 'Meal', 'MEAL', 15900, false, 1),
  ((select id from menu_items where slug = 'chocolate-waffle'), 'a-la-carte', 'A la carte', 'SOLO', 4900, true, 0),
  ((select id from menu_items where slug = 'chocolate-waffle'), 'with-coffee', 'With iced coffee', 'COMBO', 10900, false, 1),
  ((select id from menu_items where slug = 'bavarian-waffle'), 'a-la-carte', 'A la carte', 'SOLO', 4900, true, 0),
  ((select id from menu_items where slug = 'bavarian-waffle'), 'with-coffee', 'With iced coffee', 'COMBO', 10900, false, 1),
  ((select id from menu_items where slug = 'sunrise-waffle'), 'a-la-carte', 'A la carte', 'SOLO', 8900, true, 0),
  ((select id from menu_items where slug = 'sunrise-waffle'), 'with-coffee', 'With iced coffee', 'COMBO', 14900, false, 1),
  ((select id from menu_items where slug = 'iced-americano'), 'regular', 'Regular', 'REG', 8900, true, 0),
  ((select id from menu_items where slug = 'iced-vanilla'), 'regular', 'Regular', 'REG', 13900, true, 0),
  ((select id from menu_items where slug = 'iced-dark-mocha'), 'regular', 'Regular', 'REG', 13900, true, 0),
  ((select id from menu_items where slug = 'iced-hazelnut'), 'regular', 'Regular', 'REG', 13900, true, 0)
on conflict (item_id, slug) do update set
  label = excluded.label,
  short_label = excluded.short_label,
  price_cents = excluded.price_cents,
  is_default = excluded.is_default,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Option groups and options
-- ---------------------------------------------------------------------------

insert into menu_option_groups (slug, name, sort_order) values
  ('wing-flavour', 'Flavour', 0),
  ('level-of-hotness', 'Level of Hotness', 1)
on conflict (slug) do update set
  name = excluded.name,
  sort_order = excluded.sort_order;

insert into menu_options (
  group_id, slug, name, description, price_cents, heat_percent,
  image_source, sort_order
) values
  ((select id from menu_option_groups where slug = 'wing-flavour'), 'classic-buffalo', 'Classic Buffalo', 'The original. Tangy, buttery, unmistakably buffalo.', 0, null, '2024/05/Classic-Buffalo.jpg', 0),
  ((select id from menu_option_groups where slug = 'wing-flavour'), 'bbq-lime', 'BBQ Lime', 'Smoky barbecue cut with lime.', 0, null, '2024/05/BBQ-Lime-1.jpg', 1),
  ((select id from menu_option_groups where slug = 'wing-flavour'), 'cheezy', 'Cheezy', 'Thick cheese sauce, poured on.', 0, null, '2025/03/Cheezy.jpg', 2),
  ((select id from menu_option_groups where slug = 'wing-flavour'), 'garlic-parmesan', 'Garlic Parmesan', 'Garlic butter and grated parmesan.', 0, null, '2024/05/Garlic-Parmesan-1.jpg', 3),
  ((select id from menu_option_groups where slug = 'wing-flavour'), 'honey-mustard', 'Honey Mustard', 'Sweet and sharp in equal measure.', 0, null, '2024/05/Honey-Mustard-1.jpg', 4),
  ((select id from menu_option_groups where slug = 'wing-flavour'), 'smokey-barbecue', 'Smokey Barbecue', 'Deep, dark and smoky.', 0, null, '2025/03/Smokey-Barbecue.jpg', 5),
  ((select id from menu_option_groups where slug = 'wing-flavour'), 'salted-egg', 'Salted Egg', 'Rich, savoury, a Filipino favourite.', 0, null, '2025/03/Salted-Egg.jpg', 6),
  ((select id from menu_option_groups where slug = 'wing-flavour'), 'honey-garlic', 'Honey Garlic', 'Sticky honey, toasted garlic.', 0, null, '2024/05/Honey-Garlic-1.jpg', 7),
  ((select id from menu_option_groups where slug = 'wing-flavour'), 'sweet-spicy', 'Sweet Spicy', 'Sweet first, heat after.', 0, null, '2024/05/Sweet-Spicy-1.jpg', 8),
  ((select id from menu_option_groups where slug = 'level-of-hotness'), 'none', 'No heat', 'Flavour only.', 0, 0, null, 0),
  ((select id from menu_option_groups where slug = 'level-of-hotness'), 'lite', 'Lite', null, null, 20, null, 1),
  ((select id from menu_option_groups where slug = 'level-of-hotness'), 'moderate', 'Moderate', null, null, 40, null, 2),
  ((select id from menu_option_groups where slug = 'level-of-hotness'), 'hot', 'Hot', null, null, 60, null, 3),
  ((select id from menu_option_groups where slug = 'level-of-hotness'), 'wild', 'Wild', null, null, 80, null, 4),
  ((select id from menu_option_groups where slug = 'level-of-hotness'), 'insane', 'Insane', null, null, 100, null, 5)
on conflict (group_id, slug) do update set
  name = excluded.name,
  description = excluded.description,
  price_cents = excluded.price_cents,
  heat_percent = excluded.heat_percent,
  image_source = excluded.image_source,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Which groups hang off which item, and how many the customer must pick
-- ---------------------------------------------------------------------------

insert into menu_item_option_groups (
  item_id, group_id, is_required, min_select, max_select, sort_order
) values
  ((select id from menu_items where slug = 'chicken-wings'), (select id from menu_option_groups where slug = 'wing-flavour'), true, 1, 1, 0),
  ((select id from menu_items where slug = 'chicken-wings'), (select id from menu_option_groups where slug = 'level-of-hotness'), false, 0, 1, 1)
on conflict (item_id, group_id) do update set
  is_required = excluded.is_required,
  min_select = excluded.min_select,
  max_select = excluded.max_select,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Variation-dependent option prices.
--
-- The Level of Hotness costs PHP 30 on a HALF order of wings and PHP 40 on
-- a FULL one, and INSANE costs PHP 40 and PHP 60. A flat upcharge cannot
-- say that, which is why menu_options.price_cents is null for these rows
-- and the real number lives here, per (option, variation, price list).
-- ---------------------------------------------------------------------------

insert into menu_option_variation_prices (
  option_id, variation_id, price_list_id, price_cents
) values
  ((select o.id from menu_options o join menu_option_groups g on g.id = o.group_id where g.slug = 'level-of-hotness' and o.slug = 'lite'), (select v.id from item_variations v join menu_items i on i.id = v.item_id where i.slug = 'chicken-wings' and v.slug = 'half'), (select id from price_lists where slug = 'hot-wings-standard'), 3000),
  ((select o.id from menu_options o join menu_option_groups g on g.id = o.group_id where g.slug = 'level-of-hotness' and o.slug = 'lite'), (select v.id from item_variations v join menu_items i on i.id = v.item_id where i.slug = 'chicken-wings' and v.slug = 'full'), (select id from price_lists where slug = 'hot-wings-standard'), 4000),
  ((select o.id from menu_options o join menu_option_groups g on g.id = o.group_id where g.slug = 'level-of-hotness' and o.slug = 'moderate'), (select v.id from item_variations v join menu_items i on i.id = v.item_id where i.slug = 'chicken-wings' and v.slug = 'half'), (select id from price_lists where slug = 'hot-wings-standard'), 3000),
  ((select o.id from menu_options o join menu_option_groups g on g.id = o.group_id where g.slug = 'level-of-hotness' and o.slug = 'moderate'), (select v.id from item_variations v join menu_items i on i.id = v.item_id where i.slug = 'chicken-wings' and v.slug = 'full'), (select id from price_lists where slug = 'hot-wings-standard'), 4000),
  ((select o.id from menu_options o join menu_option_groups g on g.id = o.group_id where g.slug = 'level-of-hotness' and o.slug = 'hot'), (select v.id from item_variations v join menu_items i on i.id = v.item_id where i.slug = 'chicken-wings' and v.slug = 'half'), (select id from price_lists where slug = 'hot-wings-standard'), 3000),
  ((select o.id from menu_options o join menu_option_groups g on g.id = o.group_id where g.slug = 'level-of-hotness' and o.slug = 'hot'), (select v.id from item_variations v join menu_items i on i.id = v.item_id where i.slug = 'chicken-wings' and v.slug = 'full'), (select id from price_lists where slug = 'hot-wings-standard'), 4000),
  ((select o.id from menu_options o join menu_option_groups g on g.id = o.group_id where g.slug = 'level-of-hotness' and o.slug = 'wild'), (select v.id from item_variations v join menu_items i on i.id = v.item_id where i.slug = 'chicken-wings' and v.slug = 'half'), (select id from price_lists where slug = 'hot-wings-standard'), 3000),
  ((select o.id from menu_options o join menu_option_groups g on g.id = o.group_id where g.slug = 'level-of-hotness' and o.slug = 'wild'), (select v.id from item_variations v join menu_items i on i.id = v.item_id where i.slug = 'chicken-wings' and v.slug = 'full'), (select id from price_lists where slug = 'hot-wings-standard'), 4000),
  ((select o.id from menu_options o join menu_option_groups g on g.id = o.group_id where g.slug = 'level-of-hotness' and o.slug = 'insane'), (select v.id from item_variations v join menu_items i on i.id = v.item_id where i.slug = 'chicken-wings' and v.slug = 'half'), (select id from price_lists where slug = 'hot-wings-standard'), 4000),
  ((select o.id from menu_options o join menu_option_groups g on g.id = o.group_id where g.slug = 'level-of-hotness' and o.slug = 'insane'), (select v.id from item_variations v join menu_items i on i.id = v.item_id where i.slug = 'chicken-wings' and v.slug = 'full'), (select id from price_lists where slug = 'hot-wings-standard'), 6000)
on conflict (option_id, variation_id, price_list_id) do update set
  price_cents = excluded.price_cents;

commit;
