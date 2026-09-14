import { expect, test, type Page } from "@playwright/test";
import { branches } from "../../lib/catalog/branches";

/**
 * The nearest counter suggestion on /stores.
 *
 * tests/unit/nearest-counter.test.ts proves the arithmetic. What it cannot see
 * is the part a customer meets: that a browser which already allowed location
 * gets the suggestion with no tap, that one which has not been asked gets a
 * button instead of a prompt, that a refusal leaves a working list, and that
 * the suggestion's button chooses the counter the way a row does.
 *
 * It writes nothing to the database. Choosing a counter sets a cookie in this
 * test's own browser context and nothing else.
 *
 * It depends on Central Bloc being a counter that takes online orders, which
 * it is in the project this suite runs against. If that changes, the first
 * assertion on the suggestion is where it will say so.
 */

// A customer, not the staff session the rest of the suite runs as.
test.use({ storageState: { cookies: [], origins: [] } });

const CENTRAL_BLOC = branches.find((branch) => branch.slug === "garden-bloc")!;
const MANILA = { latitude: 14.5995, longitude: 120.9842 };

function slot(page: Page) {
  return page.getByTestId("nearest-counter");
}

/**
 * A counter's row on the board. Scoped to the list, because the suggestion's
 * own button carries the same accessible name as the row it suggests: both
 * do the same thing, so they are rightly called the same.
 */
function row(page: Page, name: string) {
  return page.getByRole("listitem").getByRole("button", {
    name: new RegExp(`^(Collect from|Continue with) ${name}$`),
  });
}

async function rowNames(page: Page) {
  return page
    .getByRole("listitem")
    .getByRole("button", { name: /^(Collect from|Continue with) NYBB/ })
    .evaluateAll((buttons) => buttons.map((b) => b.getAttribute("aria-label")));
}

test("suggests the nearest counter without a tap when location is already allowed", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: CENTRAL_BLOC.pin!.lat,
    longitude: CENTRAL_BLOC.pin!.lng,
  });

  await page.goto("/stores");

  await expect(slot(page)).toContainText("Nearest to you");
  await expect(slot(page)).toContainText("Central Bloc, IT Park");
  await expect(slot(page)).toContainText("Under 100 m away");

  // Each pinned row carries its distance; a counter with no confirmed pin
  // carries none rather than a guess.
  await expect(page.locator("#counter-mango-avenue-details")).toContainText(/About \d/);
  await expect(page.locator("#counter-shell-cebu-country-club-details")).not.toContainText("away");

  // The row is marked, and nothing was chosen on the customer's behalf.
  await expect(row(page, CENTRAL_BLOC.name)).toContainText("Nearest");
  await expect(row(page, CENTRAL_BLOC.name)).not.toContainText("Your counter");
});

test("keeps the list in the published order once the suggestion lands", async ({
  page,
  context,
}) => {
  await page.goto("/stores");
  await expect(slot(page)).toContainText("Find my nearest counter");
  const before = await rowNames(page);

  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 10.3107153,
    longitude: 123.8962067,
  });
  await slot(page).getByRole("button", { name: "Find my nearest counter" }).click();

  await expect(slot(page)).toContainText("Nearest to you");
  expect(await rowNames(page)).toEqual(before);
});

test("falls back to the list when location is refused", async ({ page }) => {
  // No permission granted: headless Chromium refuses the prompt.
  await page.goto("/stores");

  const find = slot(page).getByRole("button", {
    name: "Find my nearest counter",
  });
  await expect(find).toBeVisible();
  await find.click();

  await expect(slot(page)).toContainText("Location is off for this site");
  await expect(page.getByText(/ away$/)).toHaveCount(0);

  // Every counter is still one press away.
  await row(page, CENTRAL_BLOC.name).click();
  await expect(page).toHaveURL(/\/menu/);
});

test("names the nearest counter without offering it when the customer is far away", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation(MANILA);

  await page.goto("/stores");

  await expect(slot(page)).toContainText("You look far from every counter");
  await expect(slot(page).getByRole("button")).toHaveCount(0);
});

test("chooses the suggested counter from the suggestion's own button", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: CENTRAL_BLOC.pin!.lat,
    longitude: CENTRAL_BLOC.pin!.lng,
  });

  await page.goto(`/stores?next=${encodeURIComponent("/stores")}`);
  await slot(page)
    .getByRole("button", { name: `Collect from ${CENTRAL_BLOC.name}` })
    .click();

  // Back on the picker, now with that counter chosen.
  await expect(row(page, CENTRAL_BLOC.name)).toContainText("Your counter");
  await expect(slot(page)).toContainText("It is already your counter");
  await expect(slot(page).getByRole("button")).toHaveCount(0);
});
