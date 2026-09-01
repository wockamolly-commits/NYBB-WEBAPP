import { expect, test, type Page } from "@playwright/test";
import {
  PHOTO_TEST_SLUG,
  TEST_IMAGE_PATH,
  itemIdBySlug,
  listBucketPaths,
  purgeNewBucketObjects,
  readImage,
  writeImage,
  type ImageColumns,
} from "./fixtures/menu-photo";

/**
 * The menu photo editor, driven the way a person drives it.
 *
 * Every assertion here stands for a bug that reached the owner. The unit
 * suite could not have caught any of them: they are all about what the field
 * holds and shows between one click and the next, and tests/unit has no DOM.
 *
 *  - choosing a file showed nothing until it had been uploaded
 *  - a photograph could be saved once, after which every control went dead
 *  - React 19 emptied the file input under the field, so the second Upload
 *    posted an empty form
 *  - a saved photograph could not be reframed on a later visit at all
 *  - a photograph picked before the page hydrated was swallowed, leaving the
 *    filename on screen over a field that had never heard of it
 */

let itemId: string;
let originalColumns: ImageColumns;
let bucketBefore: Set<string>;

test.beforeAll(async () => {
  itemId = await itemIdBySlug(PHOTO_TEST_SLUG);
  originalColumns = await readImage(itemId);
  bucketBefore = await listBucketPaths();
});

test.afterAll(async () => {
  // Put the row back before cleaning the bucket, so nothing is ever deleted
  // while a row still points at it.
  await writeImage(itemId, originalColumns);
  const removed = await purgeNewBucketObjects(bucketBefore);
  if (removed.length) console.log(`[e2e] removed ${removed.length} object(s) this run uploaded`);
});

function editor(page: Page) {
  return {
    fileInput: page.locator('input[type="file"]'),
    zoom: page.locator('input[type="range"]').first(),
    verticalPosition: page.locator('input[type="range"]').nth(1),
    upload: page.getByRole("button", { name: /^Upload$/ }),
    reframe: page.getByRole("button", { name: /Reframe this photograph/ }),
    render: page.getByRole("button", { name: /Check final render/ }),
  };
}

async function openEditor(page: Page) {
  await page.goto(`/workspace/menu/items/${itemId}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('input[type="file"]')).toBeVisible();
  return editor(page);
}

/** Nudges a range control the way a keyboard user would, firing real events. */
async function nudge(control: ReturnType<typeof editor>["zoom"], steps: number) {
  await control.focus();
  for (let i = 0; i < steps; i++) await control.press("ArrowRight");
}

test("shows the chosen photograph immediately, before anything is uploaded", async ({ page }) => {
  const field = await openEditor(page);

  // Nothing chosen: the controls have nothing to act on and say so.
  await expect(field.zoom).toBeDisabled();
  await expect(field.upload).toBeDisabled();

  await field.fileInput.setInputFiles(TEST_IMAGE_PATH);

  // The heart of it. This must not need an upload, a button press, or a
  // round trip to the server.
  await expect(page.getByText("Live crop of the chosen photograph.")).toBeVisible();
  await expect(field.zoom).toBeEnabled();
  await expect(field.verticalPosition).toBeEnabled();
  await expect(field.upload).toBeEnabled();
  await expect(field.render).toBeEnabled();
});

test("keeps the crop editable after a save, and saves again", async ({ page }) => {
  const field = await openEditor(page);
  await field.fileInput.setInputFiles(TEST_IMAGE_PATH);
  await expect(field.upload).toBeEnabled();

  await field.upload.click();
  await expect(page.getByText("Photo saved.")).toBeVisible();
  const firstSave = await readImage(itemId);
  expect(firstSave.image_url, "the first upload should have written a tile").toBeTruthy();

  // What used to be impossible: the field is still holding the photograph.
  await expect(field.zoom).toBeEnabled();
  await expect(field.upload).toBeEnabled();

  await nudge(field.zoom, 5);
  // The success line stands down rather than claiming a crop that is no
  // longer what is saved.
  await expect(page.getByText("Adjusted since the last upload.")).toBeVisible();

  await field.upload.click();
  await expect(page.getByText("Photo saved.")).toBeVisible();

  const secondSave = await readImage(itemId);
  expect(
    secondSave.image_url,
    "the second upload should have written a different tile",
  ).not.toBe(firstSave.image_url);
});

test("reframes a saved photograph on a later visit", async ({ page }) => {
  const field = await openEditor(page);
  await field.fileInput.setInputFiles(TEST_IMAGE_PATH);
  await field.upload.click();
  await expect(page.getByText("Photo saved.")).toBeVisible();
  const saved = await readImage(itemId);

  // Coming back to the item later, which is where the crop used to be frozen
  // for good: the file lives in component state and a page load has none.
  await page.reload({ waitUntil: "domcontentloaded" });
  const reopened = editor(page);
  await expect(reopened.zoom).toBeDisabled();
  await expect(reopened.reframe).toBeEnabled();

  await reopened.reframe.click();
  await expect(page.getByText("Live crop of this row's own photograph.")).toBeVisible();
  await expect(reopened.zoom).toBeEnabled();
  await expect(reopened.upload).toBeEnabled();

  await nudge(reopened.zoom, 6);
  await reopened.upload.click();
  await expect(page.getByText("Photo saved.")).toBeVisible();

  const reframed = await readImage(itemId);
  expect(reframed.image_url, "reframing should have written a new tile").not.toBe(saved.image_url);
});

test("keeps the uncropped original beside the tile, which is what reframing needs", async ({
  page,
}) => {
  const field = await openEditor(page);
  await field.fileInput.setInputFiles(TEST_IMAGE_PATH);
  await field.upload.click();
  await expect(page.getByText("Photo saved.")).toBeVisible();

  const { image_url: tile } = await readImage(itemId);
  expect(tile).toBeTruthy();
  const original = (tile as string).replace(/\.webp$/, ".original.webp");
  expect(original, "the original must be a different object from the tile").not.toBe(tile);

  const response = await page.request.head(original);
  expect(response.status(), `no original stored at ${original}`).toBe(200);
});

test("takes up a photograph chosen before the page finished loading", async ({ page }) => {
  // The field is server-rendered complete: the file input is on screen and
  // usable a while before React attaches a listener to it. A person who picks
  // a photograph in that window fires a change event into nothing, and because
  // the input keeps the file afterwards, neither they nor the field has any
  // way of noticing. The filename sits there and every control stays dead.
  await page.route("**/*.js", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    await route.continue();
  });

  const field = await openEditor(page);
  await field.fileInput.setInputFiles(TEST_IMAGE_PATH);

  // Once the page is alive it has to adopt what it is already holding.
  await expect(page.getByText("Live crop of the chosen photograph.")).toBeVisible();
  await expect(field.zoom).toBeEnabled();
  await expect(field.upload).toBeEnabled();
});
