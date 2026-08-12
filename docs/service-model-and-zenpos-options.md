# Service model and ZenPOS integration options

## Direction change, 2026-08-12

NYBB is planned to support both pickup and delivery. **Delivery is deferred and out of scope for
the current build.** Customers will initially place pickup orders in the NYBB app. Staff will review
those orders and manually enter each accepted order in ZenPOS. This supersedes the prior pickup-only
assumptions for future work, while keeping delivery design documented for a later phase.

**Resolved 2026-08-12:** the NYBB app receives the customer's pickup order first. Staff then
manually enter each accepted order in ZenPOS. The NYBB app owns the customer order, pickup workflow,
and customer updates. ZenPOS remains the authority for official sales, tenders, receipts, cash-up,
returns, and inventory records. Store the ZenPOS ticket or sale reference on the NYBB order after
staff entry.

**Delivery deferral, 2026-08-12:** do not implement delivery fields, addresses, rider assignment,
delivery fees, delivery statuses, or delivery ZenPOS mapping in the current phase. The delivery
sections below are future-design notes only and must be revisited with the owner before work starts.

**Hard integration boundary, 2026-08-12:** the NYBB app must never create, update, or synchronize
customer orders into ZenPOS. Staff manually enter accepted orders in ZenPOS. Any ZenPOS connection
is read-only from the NYBB app's perspective: it may retrieve approved data such as product
availability, prices, stock, ticket references, status, refunds, and reports, but cannot send an
order, status change, cancellation, refund, or payment instruction to ZenPOS.

**ZenPOS integration deferral, 2026-08-12:** do not build any ZenPOS connection in the current
phase, including read-only access. Staff will continue to enter accepted pickup orders manually in
ZenPOS. Ticket numbers may be recorded manually in NYBB if useful, but the NYBB system must not
query, import, synchronize, map, or otherwise exchange data with ZenPOS until this phase is
explicitly reopened.

The existing pickup ordering implementation remains an executable reference and must not be
deleted. Its server-authoritative pricing, order audit, role model, catalog, image pipeline, and
payment-provider work are reusable. Its public checkout, pickup-only lifecycle, slot rules, and
customer-web assumptions are no longer the target product.

## Recommended operational model

Customers initially place pickup orders directly in the NYBB app. Staff review and accept them
there, then enter the accepted order in ZenPOS to create the official sale, payment record, receipt,
kitchen ticket, and inventory movement. The NYBB app records the staff member who entered the ZenPOS
reference, tracks pickup handoff, and updates the customer. It must show a clear “Entered in ZenPOS”
state so staff do not enter the same order twice.

For delivery, add a dispatcher-oriented queue with address and landmark, contact number, promised
time, fee, rider or courier assignment, and proof of handoff. For pickup, keep the pickup code and
claim flow. Do not make delivery a boolean attached to a pickup order. It needs its own lifecycle,
failure reasons, and operational timestamps.

The recommended division of authority is:

| Concern | Recommended authority | Why |
| --- | --- | --- |
| BIR sale, tender, void, return, cash-up, official receipt | ZenPOS | It is the branch POS and is designed for sales recording, tender controls, audit, and reporting. |
| Customer order creation, staff review, order-source attribution, delivery dispatch, customer contact, pickup claim, rider handoff | NYBB app | These are the customer and cross-channel workflows that the team needs to shape for NYBB. |
| Catalog master, price, item availability | Decide one master per branch, preferably ZenPOS if staff must key all sales there | Two editable menus create pricing and stock drift. Mirror one master read-only into the other system. |
| Payment gateway events, where NYBB continues to take online payment | NYBB backend, reconciled to ZenPOS | The provider webhook is the proof of payment. ZenPOS needs a matching external tender entry, not a guessed payment state. |

Each NYBB order must store the ZenPOS ticket or sale reference once entered. This is the non-negotiable
reconciliation link. It lets a cashier find the same transaction, prevents a second entry, and ties
delivery, refunds, and customer support to the official sale.

## Delivery scope that must be restored

The old plan deliberately removed delivery. The new plan must reintroduce it as a scoped subsystem,
not blindly restore every legacy feature.

- Add `service_mode` values for `pickup` and `delivery`, with delivery-only address, landmark,
  delivery-fee, dispatcher, rider or courier, and handoff fields.
- Replace pickup-only status arrays with a shared order core and service-specific transitions.
  Delivery needs at least assigned, out for delivery, delivered, failed delivery, and return or
  cancellation handling. Pickup keeps ready and claimed.
- Record the order source and the person who entered it. This is essential when phone, walk-in,
  social, and delivery-platform orders all look like manual entries.
- Define delivery zones, fees, service hours, rider capacity, address validation, contact protocol,
  cancellation, failed-delivery, return-to-store, and refund rules before implementation. These are
  owner decisions, not defaults to borrow from a different business.
- Keep pricing, discounts, tax, and payment state server-authoritative even though a staff member
  is entering the order. Manual entry does not permit an editable total.

## ZenPOS: practical options to explore

ZenPOS publicly lists pickup and delivery tracking, configurable sales channels, order stations,
Kitchen Display System, inventory, loyalty, reports, and “Sales API Posting” using cloud and LAN.
It also advertises a Remote Terminal that turns phones and tablets into virtual POS terminals.
Those claims establish useful avenues to investigate, but not an integration contract. The vendor
must confirm the API, data model, security, cost, and per-branch availability in writing.

| Option | What ZenPOS would provide | NYBB app role | Value | Main risk or question |
| --- | --- | --- | --- | --- |
| A. Manual entry directly in ZenPOS, import data out | Official ticket, tender, kitchen, stock, reports | Delivery dispatch and customer operations, linked by ZenPOS ticket number | Lowest tax and cash-up risk, no automatic sale creation | Can staff enter delivery fields and source channel fast enough, and can NYBB read the records reliably? |
| B. Automatic NYBB-to-ZenPOS order posting | Official sale, receipt, tender, stock decrement, kitchen ticket | Sends customer orders into ZenPOS | Would remove double entry | **Excluded.** NYBB must not send or synchronize orders to ZenPOS. |
| C. NYBB app posts only to ZenPOS KDS | Kitchen routing and preparation timing | Intake, delivery dispatch, then separate POS entry | Faster kitchen visibility | Dangerous if the KDS event does not also produce an official sale and stock movement. |
| D. ZenPOS Remote Terminal or its own mobile ordering surface | POS entry on staff handhelds | Use ZenPOS for intake, NYBB app only fills gaps | May eliminate custom POS-entry work | May not support NYBB delivery workflow, customer data, app branding, or integration access. |
| E. Read-only synchronization | Menu, prices, stock, sales, tender, voids, and reports | NYBB app remains an operational overlay | Valuable even if posting is unavailable | Freshness, branch credential scope, and whether events can be pushed rather than polled. |
| F. Analytics and reconciliation feed | Transaction, tender, cashier, channel, prep, refund, and stock data | NYBB dashboard matches internal orders to POS sales | Gives management one trusted picture | Need a common order ID, consistent channel codes, and correct treatment of online tenders. |

### Recommended sequence

1. **Resolved 2026-08-12: NYBB app first for customer orders.** Staff accept the customer order in
   the NYBB app, manually create its official sale in ZenPOS, then attach or scan the ZenPOS ticket
   number before preparation or dispatch. This is **Option B in manual-confirmation mode**.
2. Test **Option D** before building a custom staff POS-entry screen. If ZenPOS Remote Terminal
   already meets the real counter workflow, use it and reserve custom development for delivery
   operations that it cannot cover.
3. **Option B is excluded.** Do not build NYBB-to-ZenPOS order posting, even if ZenPOS offers a
   suitable API. The connection may only retrieve ZenPOS information for the NYBB app.
4. Treat **Option C** as an enhancement only. Kitchen-only injection is never acceptable if it
   causes staff to create a second sale manually for stock or BIR reporting.

## Data and functions to request from ZenPOS

Request the following by business capability, not just “an API.” The first group is the minimum
for safe posting. The rest may be more valuable than item mapping.

### 1. Sale retrieval and payment integrity, highest priority

- Retrieve a sale by ticket, receipt, claim tag, branch, date, and customer reference.
- Stable ticket, receipt, and sale IDs that can be stored in the NYBB app and found again after a
  return, void, refund, or branch day-end.
- The tender and payment model, and an export or API representation that lets the NYBB app display
  payment information without guessing from a ticket screen.
- Correct support for cash, GCash, Maya, card, bank transfer, delivery-platform collections, and
  cash-on-delivery if NYBB offers them.
- BIR and receipt implications of linking NYBB operational data to a completed sale, then later
  reflecting a void, return, or refund.
- Sales channel, source, cashier, order type, delivery fee, customer reference, and free-text note
  fields that staff can enter in ZenPOS and the NYBB app can retrieve by API or export.

### 2. Operations and kitchen

- Create pickup and delivery orders, promised times, claim tags, kitchen tickets, preparation
  states, and order-status events.
- KDS routing by item, category, branch, prep station, and status event.
- Remote Terminal suitability for a staff Android or iOS handheld workflow.
- Whether one API-created sale reaches the KDS, printer, stock ledger, tender reports, and official
  receipt flow exactly once.

### 3. Catalog, price, stock, and availability

- Read products, categories, modifier groups, price books, branch-specific prices, taxes, and
  promo rules.
- Read stock on hand, stop-sell status, inventory movement, and estimated freshness of each value.
- Product availability notifications or a polling endpoint, including branch and warehouse scope.
- Modifier rules and whether heat price can depend on wing size. If not, establish the correct POS
  line-item representation before mapping data.

### 4. Delivery and customer operations

- Delivery and pickup type fields, configured sales channels, courier or rider assignment, claim
  tags, customer contact fields, address and landmark fields, delivery fee, and delivery status.
- Whether ZenPOS's delivery feature is an operational dispatch tool or only a reporting label.
- Customer and loyalty records, consent fields, point earning or redemption, and whether these can
  be read or written without duplicating customer profiles.

### 5. Reconciliation, reporting, and governance

- Transaction, tender, cashier, channel, discount, void, return, refund, item, kitchen-time, and
  stock reports, with filters and export or API access.
- Event webhooks or change tokens for sales, order status, inventory, price, voids, and refunds.
- Per-branch credentials, head-office access, rate limits, LAN versus cloud connectivity, a sandbox,
  audit history, data retention, support escalation, and module or API charges.

## Discovery workshop and acceptance test

Ask ZenPOS for one structured technical workshop and a non-production test tenant. Run the same
test matrix on both a pickup and delivery sale:

1. A customer places one pickup order and one delivery order in the NYBB app. Staff accept each,
   then enter it in ZenPOS with items, modifiers, discount, source channel, customer contact, and
   the applicable fulfillment details.
2. The official ticket is created once, reaches the kitchen once, uses the correct tender, and
   appears in the correct branch reports.
3. A staff user links each ZenPOS ticket to the customer order. A second entry attempt is blocked.
4. Change or cancel it before and after preparation, then test a partial and full refund and prove
   the NYBB record receives or can reconcile the change.
5. Mark an item sold out and change a branch price, then confirm the NYBB app receives the change
   within the agreed freshness target.
6. Close the cashier shift and reconcile the NYBB order total, ZenPOS sale total, tender total,
   delivery fees, refunds, voids, and cash drawer with no unexplained difference.

Do not build automatic posting. Even if ZenPOS demonstrates it, NYBB-to-ZenPOS customer-order
synchronization is outside the approved scope.

## Decisions required before implementation

1. ~~When staff manually enter an order, is ZenPOS or the NYBB staff app the first and authoritative
   entry point?~~ **Resolved 2026-08-12: customers order through NYBB first, and staff manually
   enter accepted orders into ZenPOS. ZenPOS is the official sale record.**
2. Which order sources must be captured at launch: counter, phone, Facebook or Instagram, WhatsApp,
   Foodpanda, Grab, direct mobile app request, or others?
3. Does “delivery” use NYBB riders, third-party platforms, third-party couriers, or a mix? Who owns
   the delivery fee and cash-on-delivery collection?
4. Which payment and tender types are allowed per source and service mode? The previous online-only
   payment ruling must be explicitly replaced or retained where applicable.
5. Which system owns the menu, branch price, promo, customer, and loyalty masters?
6. Which native screens must ship first: staff intake, dispatcher queue, rider app, customer order
   tracking, customer loyalty, or all of them?
7. Which ZenPOS modules and APIs does each branch currently license, and can ZenPOS supply a sandbox
   plus written technical documentation?

Until these are answered, limit work to a customer-order and staff-confirmation prototype,
delivery-safe domain design, and vendor discovery. Do not build automated ZenPOS posting. Do not
release customer ordering until the manual ZenPOS entry workflow is safe and tested.
