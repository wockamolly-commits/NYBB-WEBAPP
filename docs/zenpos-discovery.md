# ZenPOS discovery, internal notes

**Internal. Do not send this file to CodeLikeUs or to anyone outside the team.**

**`docs/zenpos-questions.md` is the version to send.** It carries the same ten questions with the
reasoning stripped out, written as a letter so it can go straight into an email. It deliberately
contains no reference to this file, no internal notes, and no mention of the earlier project, so
nothing needs stripping before it goes out. If you edit the questions there, mirror the change
here, and keep it clean of anything a vendor should not read.

**Status:** Deferred. Customer orders originate in the NYBB app, then staff manually enter accepted
orders in ZenPOS. Do not pursue ZenPOS API, export, event, kitchen, inventory, or reporting
integration work until the core NYBB pickup system is ready.
**Owner:** the IT head.
**Who answers it:** a technical contact at CodeLikeUs Technologies (ZenPOS), Cebu City.
Published contact number: +63 917 639 7020.
**Related:** section 16 of `docs/IMPLEMENTATION-PROMPT.md`, and open item 5 in section 28.

---

## Superseding operational decision

The earlier reasoning in this file assumed a pickup-only customer ordering website. The active
model is a customer pickup app. Staff review its orders, manually enter accepted orders in ZenPOS,
and attach the ZenPOS ticket reference to the NYBB order before preparation. Delivery is deferred.
Retain the older notes as background only. The current sendable questionnaire is
`docs/zenpos-questions.md`, and the active design is `docs/service-model-and-zenpos-options.md`.

**Hard boundary:** NYBB will not create, update, or synchronize customer orders in ZenPOS. The
integration scope is ZenPOS information flowing into NYBB, not NYBB order data flowing into ZenPOS.

## Why this exists

The NYBB app receives customer pickup orders. ZenPOS is the till where staff manually create the
accepted sale. The NYBB app needs to record that ZenPOS reference, then use kitchen, availability,
and reporting information without duplicating official sales entry. ZenPOS publishes no public
technical documentation, so we ask them directly.

Every answer changes what we build. Two of them can change it completely.

## Nothing here blocks the manual-entry pilot

The branch can run without an integration: staff receive orders in the NYBB app, manually enter
them in ZenPOS, then attach the ticket reference. This discovery improves speed, data quality,
delivery visibility, and reporting. It does not authorize automatic POS posting until the vendor
proves it is safe.

That should shape the conversation. We are not asking for a favour under time pressure, and we
should not accept a vague yes just to close the topic. A wrong answer costs more than no answer,
for the reason set out under question 3.

## The payment-first ruling changed this document

**Owner ruling, 2026-08-11: pickup orders are strictly payment first. The customer pays online
before the order is processed. There is no pay at counter and no pay later.**

That removes the risk this document was originally built around. When orders could arrive unpaid,
the decisive question was whether ZenPOS could hold an unpaid open ticket, and a POS that could
only record finished paid sales would have put unpaid orders in front of staff looking settled. See
the history under question 3. Under payment first, every order genuinely is paid before it reaches
the branch, so "finished paid sale only" is now an acceptable answer rather than a blocker.

The risk moves rather than disappearing. It is now about **how the money is recorded**, not whether
it was collected. If ZenPOS books our online sales as cash taken at that branch, the end of day
count will not balance and the branch will look short every night. Question 3 was rewritten to ask
about tender type and refunds instead.

## Priority order

If the conversation is short, get these answered properly and let the rest wait:

1. **Question 9**, QR Ordering. The most likely quick win, and the only door that might already be
   open today.
2. **Question 3**, recording an already paid sale, specifically the tender type part. This no
   longer decides whether we build the integration, but getting it wrong corrupts branch cash ups.
3. **Question 2**, create versus read only. Still the gate on the whole idea.

The sent version deliberately gives all ten questions equal weight, so our priorities are not
visible to the vendor.

---

## What each question is really testing

**1. Interface and access.** If there is no API, questions 2 through 10 mostly fall away. We stop,
keep the manual workflow permanently, and do not half build toward something that does not exist.

**2. Direction of the integration.** Many POS interfaces exist for reporting, so outside software
can pull sales out but cannot put an order in. That is useful for accounting and useless to us. A
read only answer means the counter keeps typing, and the only remaining value is the availability
read in question 5.

**3. Recording an already paid sale.**

*Rewritten after the payment-first ruling. The original version of this question, and why it was
the decisive one, is preserved below because the reasoning still applies the moment anyone proposes
reintroducing pay at counter.*

**What we now need.** Our orders arrive already paid, through our own payment provider. So the
question is whether ZenPOS can record a settled sale, tagged as money taken outside ZenPOS, and
whether a refund issued through our provider can be reflected. The failure mode to avoid is a
branch whose drawer is counted short every night because online sales were booked as cash.

**The history, which now sits dormant rather than dead.** On the reference project, the POS would
only create finished, paid looking sales, never open unpaid tickets. Website orders that had not
been paid for yet arrived at the till looking settled. Staff could no longer tell real money from
pretend money, the counter started making mistakes, and the automatic sending was switched off.
Manual re-keying replaced it and is still in production a year later. Section 16.1 of the spec
records this in full.

**Why that no longer bites us.** Payment first means no unpaid order ever reaches the branch, so
there is nothing for a paid looking record to misrepresent. **If pay at counter is ever
reintroduced, this question reverts to being the decisive one and the integration has to be
re-examined before it ships.** Do not treat the downgrade as permanent.

The sent version frames all of this around our own payment model, which is true and sufficient on
its own. It does not mention the earlier system.

**4. Outbound notifications.** Without these, information only flows one way. The website would
never learn that the kitchen marked an order ready, so staff would still be updating the website by
hand. With them, most of the remaining double handling goes away.

Payment-first added a second reason. We now hold the money, so a void, discount, or refund applied
at the till against one of our orders leaves our records overstated and the customer possibly owed
a refund we do not know about. Under pay at counter this was ZenPOS's problem. Now it is ours.

**5. Stock and item availability.** Two wins. The website stops selling items a branch has run out
of, and, more valuable, the website learns how busy the branch already is from counter trade. Right
now it cannot see walk in load at all, so its slot capacity is partly guesswork.

**6. Modifiers and add-ons.** Our heat levels are priced per portion size. If ZenPOS cannot express
a price that varies by parent item, heat has to be sent as its own separate line, which is workable
but changes how a ticket reads at the counter. We need to know before we build the ticket, not
after.

**7. Multiple branches. Partly answered already, and it changed the design.**

**Owner report, 2026-08-11: each branch runs its own ZenPOS account.** The reference project ran a
single POS account for the whole business, and section 16.4 inherited that assumption without
anyone noticing. It is wrong here.

What follows if it holds:

- **Item IDs are per account**, so the same wing has a different POS id at every branch. The single
  `menu_items.pos_item_id` column in 16.4 can only ever be correct for one branch. It becomes a
  join table keyed by `(branch_id, menu entity)`. Section 16.4 has been corrected.
- **Credentials are per branch**, so `ZENPOS_API_KEY` as one environment variable is wrong. Removed
  from section 26.
- **Mapping is per branch too**, which is an operational cost nobody has priced yet. Somebody has
  to sit down and map every item at every branch, by hand, once per branch. Ten branches means ten
  passes. Worth telling the owner before they picture a single afternoon's work.
- **Discovery may need repeating.** If accounts are provisioned separately, one branch's answers
  about API access may not hold for another, particularly if branches were onboarded years apart or
  sit on different plans.

Still unknown, and now asked in the sent version: whether a head office or franchise level login
exists that reaches several branches at once. Their public material mentions multi-branch purchasing
controlled from headquarters and franchise support with branch restrictions, so some head office
layer probably exists. If it does, it may collapse this back to one integration instead of ten,
which is the single most valuable thing question 7 could come back with.

**Verify this before building.** It came from the owner rather than from ZenPOS, and it describes
how the accounts were sold to NYBB, which is not necessarily how the software models them.

**Web research, 2026-08-11, so nobody repeats it.** Their public site describes four ordering
surfaces in one line each: Self-Ordering Kiosk, QR Ordering ("customers order directly from their
phones"), Remote Terminal (staff phones and tablets as extra tills), and a Kitchen Display System.
There is no API documentation, no webhook specification, no developer portal, and no statement of
how payment is handled in any ordering mode. Their merchant iPad app lists QR ordering and KDS as
shipped features, so these are real products rather than roadmap items.

One thing worth knowing before the call: the app store listing states ZenPOS is **BIR accredited**,
so its sales recording is regulated. Creating sales and voiding them are tax-relevant events, which
means answers to questions 3 and 10 may be constrained by regulation rather than by engineering.

Two shapes a QR ordering module usually takes, and we do not know which this is: order only, where
payment happens at the counter afterwards, or order and pay, where their own payment partner
collects first. The second would very likely have no way to represent an order that arrives already
settled. There is also a real chance the QR path is table-bound (dine-in), since nothing in their
material mentions takeout, pickup, or ordering ahead for a later time. If so it may not model a
scheduled pickup order at all, which would rule out the route regardless of payment.

**8. Kitchen Display System.** Sometimes the kitchen screen is the easier surface to send to, and
sometimes it is the only one open. Worth asking even if question 2 came back discouraging.

Payment first makes this route more attractive, since the kitchen genuinely is the only thing our
orders still need from the branch. But watch the trap: if the kitchen screen is display only, the
sale never lands in ZenPOS at all, so the food gets cooked and the day's figures are wrong. That
would mean someone re-keys for the books even though the kitchen already has the order, which is
worse than today, not better. The sent version asks about this directly.

**9. QR Ordering. The most promising.** ZenPOS already sells a feature where a customer orders from
their own phone, which means it is already built to accept orders from a device it does not
control. If that path can take our orders too, it is very likely the intended route, and unlike
everything else here it may exist today with no development on their side.

The likely catch, added after the payment-first ruling: a QR ordering flow almost certainly expects
to collect payment itself, through ZenPOS or its payment partner. Ours are already paid. If that
path cannot accept a settled order, it is the wrong door despite being the open one, so the sent
version asks about payment collection and third party access explicitly rather than just asking
whether the door exists.

**10. Operational details.** These decide whether the integration is safe to run unattended during
a rush. No test environment and no duplicate protection means one bad network moment can create an
order twice.

Payment first raises the cost of exactly that. A duplicate is no longer a spurious unpaid ticket a
cashier notices and deletes, it is a second paid sale in the branch's figures. The void question
was added for the same reason: we need a way to undo our own mistakes without a supervisor
override at the till every time.

---

## Answers

Date each answer and record who gave it. A verbal yes from a salesperson is not a written yes from
an engineer, and vendor staff change.

| # | Question | Answer | Given by | Date |
|---|----------|--------|----------|------|
| 1 | API exists, docs, authentication | | | |
| 2 | Can create orders, or read only | | | |
| 3 | Settled sale, external tender type, refunds | | | |
| 4 | Outbound notifications | | | |
| 5 | Stock and availability read | | | |
| 6 | Add-on pricing by parent item | | | |
| 7 | Branch dimension and credentials | | | |
| 8 | Kitchen Display System ingest | | | |
| 9 | QR Ordering accepts outside orders | | | |
| 10 | Limits, test environment, duplicates, support | | | |

## What happens next, depending on the answers

- **No API, or read only.** Keep the manual workflow and close the topic. Nothing on the website
  changes.
- **Sales can be created and tagged as paid elsewhere.** Build the ZenPOS connector. Staff stop
  typing orders in. The orders screen stays, because it still owns when to start cooking, when the
  food is ready, and the pickup code check at handover, but it becomes a screen staff read rather
  than copy from.
- **Sales can be created but only as cash, or only with ZenPOS's own tender types.** Buildable, but
  not until the owner and whoever does the branch cash up agree how the difference is reconciled.
  Do not ship it on a developer's judgement. A branch that appears short every night will be
  blamed on staff.
- **Plus outbound notifications.** The above, plus the till updates the website by itself.
- **QR Ordering turns out to be usable.** Likely the fastest route to all of the above, and worth
  pursuing first if it is on the table.

No development against ZenPOS starts before questions 2 and 3 have written answers.
