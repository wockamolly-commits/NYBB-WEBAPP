# Browser tests

`npm run test:e2e`

These drive a real Chromium against a real dev server. They exist for the bugs
`tests/unit` structurally cannot see: that suite runs in Node with no DOM, so
anything about what a screen holds and shows between one click and the next is
invisible to it. Every assertion in `menu-photo-editor.spec.ts` stands for a
defect that passed lint, types, `next build` and 900 unit tests, and was then
found by a person clicking.

## Read this before running them

**They write to the Supabase project named in `.env.local`.** There is no local
Postgres and Storage stack for this project, so the browser talks to the same
database the dev server does.

Three things keep that safe, and they are the rules any new test here has to
follow:

1. Touch one row, chosen because it has nothing to lose. The photo tests edit
   the item with slug `french-fries`, which carries no photograph, so a run
   that dies halfway leaves a row with no photograph, exactly as it found it.
2. Snapshot before, restore after. `beforeAll` reads the row's image columns
   and `afterAll` writes them back, whatever happened in between.
3. Clean up the bucket. `afterAll` deletes the objects that appeared during the
   run, compared against a listing taken before the first test, so it can never
   remove something another person uploaded while it ran.

A test that has to change more than a photograph creates the row it edits
instead, and deletes it afterwards. `menu-item-options.spec.ts` does that: it
makes an item that is off the menu, edits it, and removes it and everything
hanging off it in `afterEach`, whether the test passed or failed. That is the
safer of the two patterns and the one to reach for first. Snapshot and restore
is for the cases where the screen under test needs a row that already exists.

## What you need

- `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` and `SUPER_ADMIN_EMAIL`.
- Chromium: `npx playwright install chromium` if it is not already there.
- A dev server, or nothing: the config reuses one on port 3000 if it is
  running and starts one otherwise.

## Signing in

`global-setup.ts` mints a staff session instead of filling in the login form,
which cannot be driven headlessly because it sends a one time code to an inbox.
It asks the admin API for a magic link, verifies the token, and writes the
session into the same cookies the workspace reads, using the app's own client
so the encoding cannot drift. The result lands in `tests/e2e/.auth/staff.json`,
which is not committed.

This is not a way around authorisation. The session belongs to a real staff row
and carries exactly that row's permissions.

### The three people it signs in as

All three are derived from `SUPER_ADMIN_EMAIL`, and none is created here. They
already exist in the project.

| State file | Address | Row | Used by |
|---|---|---|---|
| `.auth/staff.json` | `+nybbowner` | manager, **all branches** | everything, by default |
| `.auth/staff-branch.json` | `+nybbmanager` | manager, **Central Bloc** | `branch-scoped-staff.spec.ts` |
| `.auth/admin.json` | no suffix, the address itself | the **Super Admin** | `workspace-team-layout.spec.ts` |

Two things to know about them.

**The default persona must stay business wide.** A plus address is not the
configured Super Admin, so `+nybbowner` resolves as an ordinary staff row.
Since migration 0059 the shared menu catalog is a business wide capability, so
assigning that account a branch would take `menu:configure` away and break
every menu spec at once, with a failure that reads like a routing bug.

**The admin persona is the owner's own account.** Workspace access is Super
Admin only and cannot be reached any other way, so the spec that uses it reads
rendered geometry and nothing else: it never presses Save, never submits the
grant form, and never opens the revoke confirmation. Keep it that way. A test
that writes through that session is writing to the real owner's account and
leaving audit rows that say the owner did it.

## Running one test

```
npx playwright test -g "reframes a saved"      # by name
npx playwright test --headed                   # watch it happen
npx playwright test --debug                    # step through it
```

Failures keep a trace (`npx playwright show-trace`) and a screenshot under
`test-results/`, both of which are gitignored.

## Adding tests

Assert what a person would see: the words on the screen and whether a control
can be used. `menu-photo-editor.spec.ts` checks captions and enabled states
rather than class names or component internals, because the bugs it guards
were all of the form "the button is there but does nothing".

The suite runs one test at a time on purpose (`workers: 1`). Two tests editing
one menu row at once would be two people editing one menu row at once.
