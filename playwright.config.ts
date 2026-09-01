import { defineConfig } from "@playwright/test";

/**
 * The browser suite, for the things unit tests here structurally cannot see.
 *
 * tests/unit runs in Node with no DOM, which is right for pricing, crop
 * geometry and SQL, and blind to every bug the menu photo editor has actually
 * shipped: a tile that stayed empty until an upload, controls that went dead
 * after a save, a file input React emptied underneath the field. Each was
 * found by a person clicking, after passing lint, types, build and 900 tests.
 * This is where that class of bug gets caught instead.
 *
 * IT DRIVES THE REAL PROJECT. See tests/e2e/README.md before running it.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",

  // One at a time, deliberately. These tests write to a shared database and a
  // shared Storage bucket, so two of them running at once would be two people
  // editing the same menu row and reading each other's results.
  fullyParallel: false,
  workers: 1,

  // A dev server compiles a route the first time it is asked for one, and the
  // workspace is a large route. The generous timeouts are that, not slowness
  // in the assertions.
  timeout: 180_000,
  expect: { timeout: 20_000 },

  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  forbidOnly: Boolean(process.env.CI),
  retries: 0,

  use: {
    baseURL: "http://localhost:3000",
    // Written by global-setup, which mints a staff session rather than
    // driving the login form: the form sends a one time code by email and
    // cannot be filled in headlessly.
    storageState: "tests/e2e/.auth/staff.json",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  // Reuses the dev server that is already running, which is the normal case on
  // a development machine, and starts one otherwise.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 240_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
