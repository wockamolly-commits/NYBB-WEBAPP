-- 0104: VM1 to VM4 are item codes, not part of the name.
--
-- 0103 copied TableVibe's names verbatim, and TableVibe writes the value
-- meal number into the name: "VM1 Burger Steak Solo". This menu already has
-- a place for that number. menu_items.code holds BB1 and H3 for the burgers
-- and hotdogs, and the storefront tile, the product page and the workspace
-- print it on its own line above the name. Left in the name, VM1 was printed
-- as part of the name and missing as a code.
--
-- So each such item gets the number as its code and the rest as its name:
-- code VM1, name "Burger Steak Solo". A Solo and its Meal share a code, as the
-- printed menu does; nothing makes codes unique.
--
-- Only names that open with VM and a number, and only where the code is still
-- empty, so a code somebody set by hand is never overwritten and a re-run
-- changes nothing. Prices, categories, slugs, photographs and orders are not
-- touched. On a database with no menu (the SQL tests) nothing matches.

update menu_items
set
  code = substring(name from '^(VM[0-9]+)\s'),
  name = btrim(substring(name from '^VM[0-9]+\s+(.+)$'))
where name ~ '^VM[0-9]+\s+\S'
  and (code is null or btrim(code) = '');
