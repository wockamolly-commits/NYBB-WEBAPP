import { expect, test } from "@playwright/test";

/**
 * A new promo code cannot be created without its poster (0089), as a person
 * meets that rule.
 *
 * tests/sql/voucher-poster.test.ts proves the database refuses the create and
 * tests/unit/voucher-poster.test.ts proves the shared check. Neither can see
 * the part that lives in React: Create is stopped before the Server Action
 * starts, so React never resets the form and the code the person typed is
 * still there when they come back to add the poster. An action that returned
 * early instead would count as run, and the reset would empty every field.
 *
 * IT WRITES NOTHING. Every submit here is refused in the browser, and the test
 * asserts that no request left the page.
 */

const NEW_CODE = "/workspace/vouchers/new";

test("refuses Create without a poster, and keeps what was typed", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });

  await page.goto(NEW_CODE);
  const code = page.getByLabel("Code", { exact: true });
  await code.fill("E2EPOSTER");
  await page.getByLabel("Amount off, in pesos").fill("50");

  await page.getByRole("button", { name: "Create code" }).click();

  await expect(page.getByText("Choose a poster before creating the code.")).toBeVisible();
  await expect(
    page.getByText("Add a poster. A promo code cannot be created without one."),
  ).toBeVisible();
  const poster = page.getByLabel("Choose a poster (required)");
  await expect(poster).toBeFocused();
  await expect(poster).toHaveAttribute("aria-required", "true");
  await expect(poster).toHaveAttribute("aria-invalid", "true");

  // Still on the create screen, with the form as it was left.
  await expect(page).toHaveURL(new RegExp(`${NEW_CODE}$`));
  await expect(code).toHaveValue("E2EPOSTER");
  expect(posts, "a refused Create must not reach the server").toEqual([]);
});

test("refuses a file that is not an image", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });

  await page.goto(NEW_CODE);
  await page.getByLabel("Code", { exact: true }).fill("E2EPOSTER");
  await page.getByLabel("Choose a poster (required)").setInputFiles({
    name: "terms.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4"),
  });
  await expect(page.getByText(/Choose a JPEG, PNG, WebP or AVIF image/)).toBeVisible();

  // A refused file is not a chosen one, so Create is still blocked.
  await page.getByRole("button", { name: "Create code" }).click();
  await expect(page.getByText("Choose a poster before creating the code.")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${NEW_CODE}$`));
  expect(posts, "a refused Create must not reach the server").toEqual([]);
});
