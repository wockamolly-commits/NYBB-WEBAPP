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
  ('whats-new', 'What''s New', 'Limited runs and the odd thing that is not food.', 0),
  ('chicken-wings', 'Chicken', 'Ten flavours, five levels of heat. The reason the place exists.', 1),
  ('ny-specials', 'NY Specials', 'Ribs off the bone, and nuggets by the box.', 2),
  ('hunger-busters', 'Hunger Busters', 'A burger, fries and a drink.', 3),
  ('breaktime-treats', 'Breaktime Treats', 'A dog, fries and a drink.', 4),
  ('value-meals', 'Value Meal', 'Rice, a main, and change from a note.', 5),
  ('ny-burgers', 'NY Burgers', 'Eight burgers, beef and chicken, on their own.', 6),
  ('pasta', 'Pasta', 'Two plates, solo or as a meal.', 7),
  ('ny-hotdogs', 'Hotdog And Sausage', 'On their own, numbered H1 to H5.', 8),
  ('sides', 'Fries & Sides', 'The supporting cast.', 9),
  ('rice-meals', 'Rice Meals', 'A sausage or a fillet, and rice.', 10),
  ('iced-coffee', 'Coffee Series', 'Cold, and cheaper than the mall.', 11),
  ('beverages', 'Beverages', 'Cold drinks by the cup and by the bottle.', 12),
  ('waffles', 'Waffles', 'On their own, or with an iced coffee.', 13)
on conflict (slug) do update set
  name = excluded.name,
  blurb = excluded.blurb,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Items
-- ---------------------------------------------------------------------------

insert into menu_items (
  category_id, slug, name, code, description,
  image_source, image_treatment, pricing_note, is_featured, is_active, sort_order
) values
  ((select id from menu_categories where slug = 'whats-new'), 'ny-umbrella', 'NY Umbrella', null, 'A branded umbrella, folding, for the rain and the sun. Merchandise rather than food.', null, null, 'Foodpanda delivery list price, SM City Cebu, captured 2026-09-07. Includes the delivery channel markup and is not a pickup price. Inactive until the owner confirms. See docs/MENU-PRICES-TO-CONFIRM.md. Also the only non-food item on the menu: it needs no pickup slot, no prep time and no kitchen ticket, so confirm it should be sold through an ordering flow built for food before switching it on.', false, false, 0),
  ((select id from menu_categories where slug = 'whats-new'), 'rainy-day-rush-bundle-a', 'Rainy Day Rush 2026 (Bundle A)', null, 'One half order of chicken wings, two rice, one carbonara, two 16oz juices, and a free NY Umbrella.', null, null, 'Foodpanda delivery list price, SM City Cebu, captured 2026-09-07. Includes the delivery channel markup and is not a pickup price. Inactive until the owner confirms. See docs/MENU-PRICES-TO-CONFIRM.md. Seasonal: the name carries a year, so it needs retiring rather than repricing once the promotion ends.', false, false, 1),
  ((select id from menu_categories where slug = 'whats-new'), 'rainy-day-rush-bundle-b', 'Rainy Day Rush 2026 (Bundle B)', null, 'One carbonara, two flavoured fries, two 16oz juices, two classic hotdogs, and a free NY Umbrella.', null, null, 'Foodpanda delivery list price, SM City Cebu, captured 2026-09-07. Includes the delivery channel markup and is not a pickup price. Inactive until the owner confirms. See docs/MENU-PRICES-TO-CONFIRM.md. Seasonal: the name carries a year, so it needs retiring rather than repricing once the promotion ends.', false, false, 2),
  ((select id from menu_categories where slug = 'chicken-wings'), 'chicken-wings', 'Chicken Wings', null, 'Fried to order, then sauced in the flavour you pick. Add a level of hotness on top of any flavour.', '2024/05/Classic-Buffalo.jpg', 'lifestyle', 'Boneless is priced level with bone-in because Foodpanda prices all four the same way (Half and Boneless Half both 458, Full and Boneless Full both 719). The parity is copied, not the amounts.', true, true, 0),
  ((select id from menu_categories where slug = 'ny-specials'), 'ribs-original', 'NY Ribs Original', null, null, '2025/03/RIBS-ORIG.jpg', 'cutout', null, true, true, 0),
  ((select id from menu_categories where slug = 'ny-specials'), 'ribs-spicy', 'NY Ribs Spicy', null, null, '2025/03/RIBS-SPICY.jpg', 'cutout', null, false, true, 1),
  ((select id from menu_categories where slug = 'ny-specials'), 'chicken-nuggets', 'Chicken Nuggets', null, null, '2024/05/Chicken-Nuggets-1.jpg', 'cutout', null, false, true, 2),
  ((select id from menu_categories where slug = 'hunger-busters'), 'rookie-burger-meal', 'Rookie Burger Meal', null, null, '2024/05/Rookie-Burger-1.jpg', 'cutout', 'Foodpanda delivery list price, SM City Cebu, captured 2026-09-07. Includes the delivery channel markup and is not a pickup price. Inactive until the owner confirms. See docs/MENU-PRICES-TO-CONFIRM.md.', false, false, 0),
  ((select id from menu_categories where slug = 'hunger-busters'), 'quarterback-burger-meal', 'The Quarterback Burger Meal', null, null, '2024/05/The-Quarter-Burger.jpg', 'cutout', 'Foodpanda delivery list price, SM City Cebu, captured 2026-09-07. Includes the delivery channel markup and is not a pickup price. Inactive until the owner confirms. See docs/MENU-PRICES-TO-CONFIRM.md.', false, false, 1),
  ((select id from menu_categories where slug = 'hunger-busters'), 'blt-burger-meal', 'BLT Burger Meal', null, null, '2024/05/BLT-Burger.jpg', 'cutout', 'Foodpanda delivery list price, SM City Cebu, captured 2026-09-07. Includes the delivery channel markup and is not a pickup price. Inactive until the owner confirms. See docs/MENU-PRICES-TO-CONFIRM.md.', false, false, 2),
  ((select id from menu_categories where slug = 'hunger-busters'), 'buffalo-chicken-burger-meal', 'Buffalo Chicken Burger Meal', null, null, '2024/05/Buffalo-Chicken-Burger.jpg', 'cutout', 'Foodpanda delivery list price, SM City Cebu, captured 2026-09-07. Includes the delivery channel markup and is not a pickup price. Inactive until the owner confirms. See docs/MENU-PRICES-TO-CONFIRM.md.', false, false, 3),
  ((select id from menu_categories where slug = 'hunger-busters'), 'smokey-bbq-chicken-burger-meal', 'Smokey BBQ Chicken Burger Meal', null, null, '2025/03/smoky-Burger-bundle-1.jpg', 'cutout', '350 is our own figure, from the Our Menu page''s Smokey BBQ Meal line. Foodpanda prices this meal at 401. Active because the price is ours rather than the delivery channel''s, but worth confirming.', false, true, 4),
  ((select id from menu_categories where slug = 'hunger-busters'), 'honey-garlic-chicken-burger-meal', 'Honey Garlic Chicken Burger Meal', null, null, '2025/03/honey-Burger-bundle-1.jpg', 'cutout', 'Foodpanda delivery list price, SM City Cebu, captured 2026-09-07. Includes the delivery channel markup and is not a pickup price. Inactive until the owner confirms. See docs/MENU-PRICES-TO-CONFIRM.md.', false, false, 5),
  ((select id from menu_categories where slug = 'hunger-busters'), 'cheezy-chicken-burger-meal', 'Cheezy Chicken Burger Meal', null, null, '2025/03/Cheezy-Burger-bundle-1.jpg', 'cutout', 'Foodpanda delivery list price, SM City Cebu, captured 2026-09-07. Includes the delivery channel markup and is not a pickup price. Inactive until the owner confirms. See docs/MENU-PRICES-TO-CONFIRM.md.', false, false, 6),
  ((select id from menu_categories where slug = 'hunger-busters'), 'brads-angus-burger-meal', 'Brad''s Angus Burger Meal', 'BB5', null, '2024/05/Brads-Angus-Burger.jpg', 'cutout', '349 is our own figure, from the Our Menu page''s BB5 line, which names the meal. Foodpanda prices this meal at 471. Active because the price is ours, but the gap is large enough to confirm.', false, true, 7),
  ((select id from menu_categories where slug = 'breaktime-treats'), 'classic-hotdog-meal', 'Classic Hotdog Meal', null, null, '2024/05/Classic-Hotdog.jpg', 'cutout', 'Foodpanda delivery list price, SM City Cebu, captured 2026-09-07. Includes the delivery channel markup and is not a pickup price. Inactive until the owner confirms. See docs/MENU-PRICES-TO-CONFIRM.md.', false, false, 0),
  ((select id from menu_categories where slug = 'breaktime-treats'), 'jalapeno-cheesedog-meal', 'Jalapeño Cheesedog Meal', null, null, '2024/05/Jalapeno-Cheese-Dog.jpg', 'cutout', 'Foodpanda delivery list price, SM City Cebu, captured 2026-09-07. Includes the delivery channel markup and is not a pickup price. Inactive until the owner confirms. See docs/MENU-PRICES-TO-CONFIRM.md.', false, false, 1),
  ((select id from menu_categories where slug = 'breaktime-treats'), 'chili-cheesedog-meal', 'Chili Cheesedog Meal', null, null, '2024/05/Chili-Cheese-Dog.jpg', 'cutout', 'Foodpanda delivery list price, SM City Cebu, captured 2026-09-07. Includes the delivery channel markup and is not a pickup price. Inactive until the owner confirms. See docs/MENU-PRICES-TO-CONFIRM.md.', false, false, 2),
  ((select id from menu_categories where slug = 'breaktime-treats'), 'hungarian-sandwich-meal', 'Hungarian Sandwich Meal', null, null, '2024/05/Hungarian-Sausage.jpg', 'cutout', 'Foodpanda delivery list price, SM City Cebu, captured 2026-09-07. Includes the delivery channel markup and is not a pickup price. Inactive until the owner confirms. See docs/MENU-PRICES-TO-CONFIRM.md.', false, false, 3),
  ((select id from menu_categories where slug = 'value-meals'), 'value-meal', 'Value Meal', null, 'Two pieces of wings with rice. Add a drink, then fries.', '2024/05/Value-Meals.jpg', 'cutout', 'Our Sets A, B and C are not on Foodpanda, which instead sells four named value meals at 229 each. Whether the sets survived the repricing is an owner question.', true, true, 0),
  ((select id from menu_categories where slug = 'value-meals'), 'chicken-wings-meal', 'Chicken Wings Meal', null, 'Two pieces of wings in your chosen sauce, with rice.', '2024/05/Classic-Buffalo.jpg', 'lifestyle', 'Foodpanda delivery list price, SM City Cebu, captured 2026-09-07. Includes the delivery channel markup and is not a pickup price. Inactive until the owner confirms. See docs/MENU-PRICES-TO-CONFIRM.md.', false, false, 1),
  ((select id from menu_categories where slug = 'value-meals'), 'boneless-chicken-meal', 'Boneless Chicken Meal', null, 'Two pieces of boneless chicken in your chosen sauce, with rice.', null, null, 'Foodpanda delivery list price, SM City Cebu, captured 2026-09-07. Includes the delivery channel markup and is not a pickup price. Inactive until the owner confirms. See docs/MENU-PRICES-TO-CONFIRM.md.', false, false, 2),
  ((select id from menu_categories where slug = 'value-meals'), 'chicken-nuggets-meal', 'Chicken Nuggets Meal', null, 'Four nuggets with rice and a dip.', '2024/05/Chicken-Nuggets-1.jpg', 'cutout', 'Foodpanda delivery list price, SM City Cebu, captured 2026-09-07. Includes the delivery channel markup and is not a pickup price. Inactive until the owner confirms. See docs/MENU-PRICES-TO-CONFIRM.md.', false, false, 3),
  ((select id from menu_categories where slug = 'value-meals'), 'burger-steak-meal', 'Burger Steak Meal', null, 'Two burger steaks with rice and gravy.', null, null, 'Foodpanda delivery list price, SM City Cebu, captured 2026-09-07. Includes the delivery channel markup and is not a pickup price. Inactive until the owner confirms. See docs/MENU-PRICES-TO-CONFIRM.md.', false, false, 4),
  ((select id from menu_categories where slug = 'ny-burgers'), 'rookie', 'Rookie Burger', 'BB1', null, '2024/05/Rookie-Burger-1.jpg', 'cutout', null, false, true, 0),
  ((select id from menu_categories where slug = 'ny-burgers'), 'quarterback', 'The Quarterback Burger', 'BB2', null, '2024/05/The-Quarter-Burger.jpg', 'cutout', null, false, true, 1),
  ((select id from menu_categories where slug = 'ny-burgers'), 'blt', 'BLT Burger', 'BB3', null, '2024/05/BLT-Burger.jpg', 'cutout', null, false, true, 2),
  ((select id from menu_categories where slug = 'ny-burgers'), 'buffalo-chicken', 'Buffalo Chicken Burger', 'BB4', null, '2024/05/Buffalo-Chicken-Burger.jpg', 'cutout', null, false, true, 3),
  ((select id from menu_categories where slug = 'ny-burgers'), 'brads-angus-burger', 'Brad''s Angus Burger', null, null, '2024/05/Brads-Angus-Burger.jpg', 'cutout', 'Foodpanda delivery list price, SM City Cebu, captured 2026-09-07, and not a pickup price. Our own list prices only the BB5 meal, never the burger alone. Inactive until the owner confirms.', false, false, 4),
  ((select id from menu_categories where slug = 'ny-burgers'), 'smokey-bbq-chicken-burger', 'Smokey BBQ Chicken Burger', null, null, '2025/03/smoky-Burger-bundle-1.jpg', 'cutout', null, false, true, 5),
  ((select id from menu_categories where slug = 'ny-burgers'), 'honey-garlic-chicken-burger', 'Honey Garlic Chicken Burger', null, null, '2025/03/honey-Burger-bundle-1.jpg', 'cutout', null, false, true, 6),
  ((select id from menu_categories where slug = 'ny-burgers'), 'cheezy-chicken-burger', 'Cheezy Chicken Burger', null, null, '2025/03/Cheezy-Burger-bundle-1.jpg', 'cutout', null, false, true, 7),
  ((select id from menu_categories where slug = 'pasta'), 'spaghetti', 'Spaghetti', null, null, '2025/03/spag.jpg', 'cutout', 'The live menu prints 156/159 without labels. Read as solo and meal, matching how the sides list labels its own two-price items. Foodpanda sells one size at 214. Confirm.', false, true, 0),
  ((select id from menu_categories where slug = 'pasta'), 'carbonara', 'Carbonara', null, null, '2025/03/carbonara.jpg', 'cutout', 'The live menu prints 156/159 without labels. Read as solo and meal, matching how the sides list labels its own two-price items. Foodpanda sells one size at 214. Confirm.', false, true, 1),
  ((select id from menu_categories where slug = 'ny-hotdogs'), 'classic-hotdog', 'Classic Hotdog', 'H1', null, '2024/05/Classic-Hotdog.jpg', 'cutout', null, false, true, 0),
  ((select id from menu_categories where slug = 'ny-hotdogs'), 'jalapeno-cheese-dog', 'Jalapeño Cheesedog', 'H2', null, '2024/05/Jalapeno-Cheese-Dog.jpg', 'cutout', null, false, true, 1),
  ((select id from menu_categories where slug = 'ny-hotdogs'), 'chili-cheese-dog', 'Chili Cheesedog', 'H3', null, '2024/05/Chili-Cheese-Dog.jpg', 'cutout', null, false, true, 2),
  ((select id from menu_categories where slug = 'ny-hotdogs'), 'hawaiian-bbq-dog', 'Hawaiian BBQ', 'H4', null, '2024/05/Hawaiian-BBQ-Dog.jpg', 'cutout', 'Not on the Foodpanda listing. Kept on the owner''s instruction: absence from the delivery menu is not evidence the counter stopped selling it.', false, true, 3),
  ((select id from menu_categories where slug = 'ny-hotdogs'), 'hungarian-sandwich', 'Hungarian Sausage Sandwich', 'H5', null, '2024/05/Hungarian-Sausage.jpg', 'cutout', null, false, true, 4),
  ((select id from menu_categories where slug = 'sides'), 'french-fries', 'NY Fries', null, null, null, null, 'Our list has one unlabelled French Fries price of 128, and 128 is none of Foodpanda''s three (103 / 172 / 195), so there is no honest way to say which size we hold a price for. The three sizes are recorded switched off and the single Regular keeps selling until the owner says which is which. Expect to delete Regular at that point.', false, true, 0),
  ((select id from menu_categories where slug = 'sides'), 'french-fries-cheese', 'French Fries Cheese', null, null, null, null, 'Foodpanda delivery list price, SM City Cebu, captured 2026-09-07. Includes the delivery channel markup and is not a pickup price. Inactive until the owner confirms. See docs/MENU-PRICES-TO-CONFIRM.md.', false, false, 1),
  ((select id from menu_categories where slug = 'sides'), 'french-fries-bbq', 'French Fries BBQ', null, null, null, null, 'Foodpanda delivery list price, SM City Cebu, captured 2026-09-07. Includes the delivery channel markup and is not a pickup price. Inactive until the owner confirms. See docs/MENU-PRICES-TO-CONFIRM.md.', false, false, 2),
  ((select id from menu_categories where slug = 'sides'), 'french-fries-sour-cream', 'French Fries Sour Cream', null, null, null, null, 'Foodpanda delivery list price, SM City Cebu, captured 2026-09-07. Includes the delivery channel markup and is not a pickup price. Inactive until the owner confirms. See docs/MENU-PRICES-TO-CONFIRM.md.', false, false, 3),
  ((select id from menu_categories where slug = 'sides'), 'mozzarella-sticks', 'Mozzarella Sticks', null, null, '2024/05/Untitled-design-2024-05-22T160627.766.png', 'lifestyle', null, false, true, 4),
  ((select id from menu_categories where slug = 'sides'), 'plain-rice', 'Plain Rice', null, null, null, null, 'Foodpanda delivery list price, SM City Cebu, captured 2026-09-07. Includes the delivery channel markup and is not a pickup price. Inactive until the owner confirms. See docs/MENU-PRICES-TO-CONFIRM.md.', false, false, 5),
  ((select id from menu_categories where slug = 'rice-meals'), 'hungarian-rice-meal', 'Hungarian With Rice', null, null, null, null, 'Our list has one price of 189, and Foodpanda sells this as Solo 213 and Meal 248, the meal being the one with a drink. Which of the two our 189 is nobody can say, so both are recorded switched off and the single Regular keeps selling. Expect to delete Regular once the owner rules.', false, true, 0),
  ((select id from menu_categories where slug = 'rice-meals'), 'chicken-with-rice', 'Chicken with Rice', null, null, null, null, 'Not on the Foodpanda listing. Kept on the owner''s instruction: absence from the delivery menu is not evidence the counter stopped selling it.', false, true, 1),
  ((select id from menu_categories where slug = 'iced-coffee'), 'iced-americano', 'Iced Americano', null, null, '2025/03/AMERICANO.jpg', 'cutout', null, false, true, 0),
  ((select id from menu_categories where slug = 'iced-coffee'), 'iced-sweet-black', 'Iced Sweet Black', null, 'Cold black coffee, lightly sweetened.', null, null, 'Foodpanda delivery list price, SM City Cebu, captured 2026-09-07. Includes the delivery channel markup and is not a pickup price. Inactive until the owner confirms. See docs/MENU-PRICES-TO-CONFIRM.md.', false, false, 1),
  ((select id from menu_categories where slug = 'iced-coffee'), 'iced-vanilla', 'Iced Vanilla', null, null, '2025/03/VANILLA.jpg', 'cutout', null, false, true, 2),
  ((select id from menu_categories where slug = 'iced-coffee'), 'iced-dark-mocha', 'Iced Dark Mocha', null, null, '2025/03/DARK-MOCHA.jpg', 'cutout', null, false, true, 3),
  ((select id from menu_categories where slug = 'iced-coffee'), 'iced-hazelnut', 'Iced Hazelnut', null, null, '2025/03/HAZELNUT.jpg', 'cutout', null, false, true, 4),
  ((select id from menu_categories where slug = 'beverages'), 'cucumber-lemonade', 'Cucumber Lemonade Juice', null, null, null, null, 'Foodpanda delivery list price, SM City Cebu, captured 2026-09-07. Includes the delivery channel markup and is not a pickup price. Inactive until the owner confirms. See docs/MENU-PRICES-TO-CONFIRM.md.', false, false, 0),
  ((select id from menu_categories where slug = 'beverages'), 'lemon-iced-tea', 'Lemon Iced Tea Juice', null, null, null, null, 'Foodpanda delivery list price, SM City Cebu, captured 2026-09-07. Includes the delivery channel markup and is not a pickup price. Inactive until the owner confirms. See docs/MENU-PRICES-TO-CONFIRM.md.', false, false, 1),
  ((select id from menu_categories where slug = 'beverages'), 'bottled-water', 'Bottled Water', null, null, null, null, 'Foodpanda delivery list price, SM City Cebu, captured 2026-09-07. Includes the delivery channel markup and is not a pickup price. Inactive until the owner confirms. See docs/MENU-PRICES-TO-CONFIRM.md.', false, false, 2),
  ((select id from menu_categories where slug = 'waffles'), 'chocolate-waffle', 'Chocolate Waffle', null, null, '2025/03/chocolate-coffee.png', 'transparent', 'Not on the Foodpanda listing. Kept on the owner''s instruction: absence from the delivery menu is not evidence the counter stopped selling it.', false, true, 0),
  ((select id from menu_categories where slug = 'waffles'), 'bavarian-waffle', 'Bavarian Waffle', null, null, '2025/03/bavarian-coffee.png', 'transparent', 'Not on the Foodpanda listing. Kept on the owner''s instruction: absence from the delivery menu is not evidence the counter stopped selling it.', false, true, 1),
  ((select id from menu_categories where slug = 'waffles'), 'sunrise-waffle', 'Sunrise Waffle', null, null, '2025/03/egg-coffee.png', 'transparent', 'Not on the Foodpanda listing. Kept on the owner''s instruction: absence from the delivery menu is not evidence the counter stopped selling it.', false, true, 2)
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
  item_id, slug, label, short_label, price_cents, is_default, is_active, sort_order
) values
  ((select id from menu_items where slug = 'ny-umbrella'), 'regular', 'Regular', 'REG', 34900, true, true, 0),
  ((select id from menu_items where slug = 'rainy-day-rush-bundle-a'), 'regular', 'Regular', 'REG', 129900, true, true, 0),
  ((select id from menu_items where slug = 'rainy-day-rush-bundle-b'), 'regular', 'Regular', 'REG', 129900, true, true, 0),
  ((select id from menu_items where slug = 'chicken-wings'), 'half', 'Half, 6 pieces', 'HALF', 32900, true, true, 0),
  ((select id from menu_items where slug = 'chicken-wings'), 'full', 'Full, 10 pieces', 'FULL', 52900, false, true, 1),
  ((select id from menu_items where slug = 'chicken-wings'), 'boneless-half', 'Boneless half, 6 pieces', 'BL HALF', 32900, false, true, 2),
  ((select id from menu_items where slug = 'chicken-wings'), 'boneless-full', 'Boneless full, 10 pieces', 'BL FULL', 52900, false, true, 3),
  ((select id from menu_items where slug = 'ribs-original'), 'regular', 'Regular', 'REG', 34900, true, true, 0),
  ((select id from menu_items where slug = 'ribs-spicy'), 'regular', 'Regular', 'REG', 34900, true, true, 0),
  ((select id from menu_items where slug = 'chicken-nuggets'), '6-pieces', '6 pieces', '6 PC', 13100, true, true, 0),
  ((select id from menu_items where slug = 'chicken-nuggets'), '10-pieces', '10 pieces', '10 PC', 21000, false, true, 1),
  ((select id from menu_items where slug = 'rookie-burger-meal'), 'regular', 'Regular', 'REG', 20600, true, true, 0),
  ((select id from menu_items where slug = 'quarterback-burger-meal'), 'regular', 'Regular', 'REG', 32600, true, true, 0),
  ((select id from menu_items where slug = 'blt-burger-meal'), 'regular', 'Regular', 'REG', 42500, true, true, 0),
  ((select id from menu_items where slug = 'buffalo-chicken-burger-meal'), 'regular', 'Regular', 'REG', 40100, true, true, 0),
  ((select id from menu_items where slug = 'smokey-bbq-chicken-burger-meal'), 'regular', 'Regular', 'REG', 35000, true, true, 0),
  ((select id from menu_items where slug = 'honey-garlic-chicken-burger-meal'), 'regular', 'Regular', 'REG', 40100, true, true, 0),
  ((select id from menu_items where slug = 'cheezy-chicken-burger-meal'), 'regular', 'Regular', 'REG', 40100, true, true, 0),
  ((select id from menu_items where slug = 'brads-angus-burger-meal'), 'regular', 'Regular', 'REG', 34900, true, true, 0),
  ((select id from menu_items where slug = 'classic-hotdog-meal'), 'regular', 'Regular', 'REG', 20200, true, true, 0),
  ((select id from menu_items where slug = 'jalapeno-cheesedog-meal'), 'regular', 'Regular', 'REG', 24800, true, true, 0),
  ((select id from menu_items where slug = 'chili-cheesedog-meal'), 'regular', 'Regular', 'REG', 29400, true, true, 0),
  ((select id from menu_items where slug = 'hungarian-sandwich-meal'), 'regular', 'Regular', 'REG', 31700, true, true, 0),
  ((select id from menu_items where slug = 'value-meal'), 'set-a', 'Set A, wings and rice', 'SET A', 10200, true, true, 0),
  ((select id from menu_items where slug = 'value-meal'), 'set-b', 'Set B, with a drink', 'SET B', 12400, false, true, 1),
  ((select id from menu_items where slug = 'value-meal'), 'set-c', 'Set C, with a drink and fries', 'SET C', 15000, false, true, 2),
  ((select id from menu_items where slug = 'chicken-wings-meal'), 'regular', 'Regular', 'REG', 22900, true, true, 0),
  ((select id from menu_items where slug = 'boneless-chicken-meal'), 'regular', 'Regular', 'REG', 22900, true, true, 0),
  ((select id from menu_items where slug = 'chicken-nuggets-meal'), 'regular', 'Regular', 'REG', 22900, true, true, 0),
  ((select id from menu_items where slug = 'burger-steak-meal'), 'regular', 'Regular', 'REG', 22900, true, true, 0),
  ((select id from menu_items where slug = 'rookie'), 'regular', 'Regular', 'REG', 15900, true, true, 0),
  ((select id from menu_items where slug = 'quarterback'), 'regular', 'Regular', 'REG', 22900, true, true, 0),
  ((select id from menu_items where slug = 'blt'), 'regular', 'Regular', 'REG', 27900, true, true, 0),
  ((select id from menu_items where slug = 'buffalo-chicken'), 'regular', 'Regular', 'REG', 30900, true, true, 0),
  ((select id from menu_items where slug = 'brads-angus-burger'), 'regular', 'Regular', 'REG', 43600, true, true, 0),
  ((select id from menu_items where slug = 'smokey-bbq-chicken-burger'), 'regular', 'Regular', 'REG', 30900, true, true, 0),
  ((select id from menu_items where slug = 'honey-garlic-chicken-burger'), 'regular', 'Regular', 'REG', 30900, true, true, 0),
  ((select id from menu_items where slug = 'cheezy-chicken-burger'), 'regular', 'Regular', 'REG', 30900, true, true, 0),
  ((select id from menu_items where slug = 'spaghetti'), 'solo', 'Solo', 'SOLO', 15600, true, true, 0),
  ((select id from menu_items where slug = 'spaghetti'), 'meal', 'Meal', 'MEAL', 15900, false, true, 1),
  ((select id from menu_items where slug = 'carbonara'), 'solo', 'Solo', 'SOLO', 15600, true, true, 0),
  ((select id from menu_items where slug = 'carbonara'), 'meal', 'Meal', 'MEAL', 15900, false, true, 1),
  ((select id from menu_items where slug = 'classic-hotdog'), 'regular', 'Regular', 'REG', 14900, true, true, 0),
  ((select id from menu_items where slug = 'jalapeno-cheese-dog'), 'regular', 'Regular', 'REG', 17900, true, true, 0),
  ((select id from menu_items where slug = 'chili-cheese-dog'), 'regular', 'Regular', 'REG', 20900, true, true, 0),
  ((select id from menu_items where slug = 'hawaiian-bbq-dog'), 'regular', 'Regular', 'REG', 24900, true, true, 0),
  ((select id from menu_items where slug = 'hungarian-sandwich'), 'regular', 'Regular', 'REG', 23900, true, true, 0),
  ((select id from menu_items where slug = 'french-fries'), 'regular', 'Regular', 'REG', 12800, true, true, 0),
  ((select id from menu_items where slug = 'french-fries'), 'small', 'Small', 'SMALL', 10300, false, false, 1),
  ((select id from menu_items where slug = 'french-fries'), 'medium', 'Medium', 'MED', 17200, false, false, 2),
  ((select id from menu_items where slug = 'french-fries'), 'large', 'Large', 'LARGE', 19500, false, false, 3),
  ((select id from menu_items where slug = 'french-fries-cheese'), 'regular', 'Regular', 'REG', 19000, true, true, 0),
  ((select id from menu_items where slug = 'french-fries-bbq'), 'regular', 'Regular', 'REG', 19000, true, true, 0),
  ((select id from menu_items where slug = 'french-fries-sour-cream'), 'regular', 'Regular', 'REG', 19000, true, true, 0),
  ((select id from menu_items where slug = 'mozzarella-sticks'), 'regular', 'Regular', 'REG', 29900, true, true, 0),
  ((select id from menu_items where slug = 'plain-rice'), 'regular', 'Regular', 'REG', 5700, true, true, 0),
  ((select id from menu_items where slug = 'hungarian-rice-meal'), 'regular', 'Regular', 'REG', 18900, true, true, 0),
  ((select id from menu_items where slug = 'hungarian-rice-meal'), 'solo', 'Solo', 'SOLO', 21300, false, false, 1),
  ((select id from menu_items where slug = 'hungarian-rice-meal'), 'meal', 'Meal, with a drink', 'MEAL', 24800, false, false, 2),
  ((select id from menu_items where slug = 'chicken-with-rice'), 'solo', 'Solo', 'SOLO', 10500, true, true, 0),
  ((select id from menu_items where slug = 'chicken-with-rice'), 'meal', 'Meal', 'MEAL', 13000, false, true, 1),
  ((select id from menu_items where slug = 'iced-americano'), 'regular', 'Regular', 'REG', 8900, true, true, 0),
  ((select id from menu_items where slug = 'iced-sweet-black'), 'regular', 'Regular', 'REG', 11900, true, true, 0),
  ((select id from menu_items where slug = 'iced-vanilla'), 'regular', 'Regular', 'REG', 13900, true, true, 0),
  ((select id from menu_items where slug = 'iced-dark-mocha'), 'regular', 'Regular', 'REG', 13900, true, true, 0),
  ((select id from menu_items where slug = 'iced-hazelnut'), 'regular', 'Regular', 'REG', 13900, true, true, 0),
  ((select id from menu_items where slug = 'cucumber-lemonade'), '8-oz', '8 oz', '8 OZ', 9100, true, true, 0),
  ((select id from menu_items where slug = 'cucumber-lemonade'), '16-oz', '16 oz', '16 OZ', 13700, false, true, 1),
  ((select id from menu_items where slug = 'cucumber-lemonade'), '22-oz', '22 oz', '22 OZ', 16000, false, true, 2),
  ((select id from menu_items where slug = 'lemon-iced-tea'), '8-oz', '8 oz', '8 OZ', 9100, true, true, 0),
  ((select id from menu_items where slug = 'lemon-iced-tea'), '16-oz', '16 oz', '16 OZ', 13700, false, true, 1),
  ((select id from menu_items where slug = 'lemon-iced-tea'), '22-oz', '22 oz', '22 OZ', 16000, false, true, 2),
  ((select id from menu_items where slug = 'bottled-water'), 'regular', 'Regular', 'REG', 5700, true, true, 0),
  ((select id from menu_items where slug = 'chocolate-waffle'), 'a-la-carte', 'A la carte', 'SOLO', 4900, true, true, 0),
  ((select id from menu_items where slug = 'chocolate-waffle'), 'with-coffee', 'With iced coffee', 'COMBO', 10900, false, true, 1),
  ((select id from menu_items where slug = 'bavarian-waffle'), 'a-la-carte', 'A la carte', 'SOLO', 4900, true, true, 0),
  ((select id from menu_items where slug = 'bavarian-waffle'), 'with-coffee', 'With iced coffee', 'COMBO', 10900, false, true, 1),
  ((select id from menu_items where slug = 'sunrise-waffle'), 'a-la-carte', 'A la carte', 'SOLO', 8900, true, true, 0),
  ((select id from menu_items where slug = 'sunrise-waffle'), 'with-coffee', 'With iced coffee', 'COMBO', 14900, false, true, 1)
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
  group_id, slug, code, name, description, price_cents, heat_percent,
  image_source, sort_order
) values
  ((select id from menu_option_groups where slug = 'wing-flavour'), 'classic-buffalo', 'NY1', 'Classic Buffalo', 'The original. Tangy, buttery, unmistakably buffalo.', 0, null, '2024/05/Classic-Buffalo.jpg', 0),
  ((select id from menu_option_groups where slug = 'wing-flavour'), 'bbq-lime', 'NY2', 'BBQ Lime', 'Smoky barbecue cut with lime.', 0, null, '2024/05/BBQ-Lime-1.jpg', 1),
  ((select id from menu_option_groups where slug = 'wing-flavour'), 'cheezy', 'NY3', 'Cheezy', 'Thick cheese sauce, poured on.', 0, null, '2025/03/Cheezy.jpg', 2),
  ((select id from menu_option_groups where slug = 'wing-flavour'), 'garlic-parmesan', 'NY4', 'Garlic Parmesan', 'Garlic butter and grated parmesan.', 0, null, '2024/05/Garlic-Parmesan-1.jpg', 3),
  ((select id from menu_option_groups where slug = 'wing-flavour'), 'honey-mustard', 'NY5', 'Honey Mustard', 'Sweet and sharp in equal measure.', 0, null, '2024/05/Honey-Mustard-1.jpg', 4),
  ((select id from menu_option_groups where slug = 'wing-flavour'), 'smokey-barbecue', 'NY6', 'Smokey BBQ', 'Deep, dark and smoky.', 0, null, '2025/03/Smokey-Barbecue.jpg', 5),
  ((select id from menu_option_groups where slug = 'wing-flavour'), 'salted-egg', 'NY7', 'Salted Egg', 'Rich, savoury, a Filipino favourite.', 0, null, '2025/03/Salted-Egg.jpg', 6),
  ((select id from menu_option_groups where slug = 'wing-flavour'), 'honey-garlic', 'NY8', 'Honey Garlic', 'Sticky honey, toasted garlic.', 0, null, '2024/05/Honey-Garlic-1.jpg', 7),
  ((select id from menu_option_groups where slug = 'wing-flavour'), 'sweet-spicy', 'NY9', 'Sweet Spicy', 'Sweet first, heat after.', 0, null, '2024/05/Sweet-Spicy-1.jpg', 8),
  ((select id from menu_option_groups where slug = 'wing-flavour'), 'brads-gravy', 'NY10', 'Brad''s Gravy', 'Savoury gravy of meat stock and mushroom.', 0, null, '2024/05/Brads-Gravy-3.jpg', 9),
  ((select id from menu_option_groups where slug = 'level-of-hotness'), 'none', null, 'No heat', 'Flavour only.', 0, 0, null, 0),
  ((select id from menu_option_groups where slug = 'level-of-hotness'), 'lite', null, 'Lite', null, 2900, 20, null, 1),
  ((select id from menu_option_groups where slug = 'level-of-hotness'), 'moderate', null, 'Moderate', null, 2900, 40, null, 2),
  ((select id from menu_option_groups where slug = 'level-of-hotness'), 'hot', null, 'Hot', null, 2900, 60, null, 3),
  ((select id from menu_option_groups where slug = 'level-of-hotness'), 'wild', null, 'Wild', null, 2900, 80, null, 4),
  ((select id from menu_option_groups where slug = 'level-of-hotness'), 'insane', null, 'Insane', null, 2900, 100, null, 5)
on conflict (group_id, slug) do update set
  code = excluded.code,
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

-- No option is priced per variation.

commit;
