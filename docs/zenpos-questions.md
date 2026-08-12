# ZenPOS integration questions

> **Status: deferred, 2026-08-12.** Do not send this questionnaire or start ZenPOS integration
> work until the core NYBB pickup system is ready. It is retained for the later discovery phase.

Hi [name],

New York Buffalo Brad's Hot Wings is building a customer pickup-ordering app. Customers will place
their pickup orders in the NYBB app. Staff will review each order, then manually enter accepted
orders in ZenPOS. ZenPOS will remain the official sales, tender, receipt, cash-up, returns, and
inventory record. Delivery is planned for a later phase and is not part of this request.

Our first need is a safe staff workflow that links each NYBB order to its ZenPOS ticket, prevents
double entry, and gives us delivery, kitchen, stock, and reporting information. We will not send,
create, update, or synchronize customer orders from the NYBB app into ZenPOS. Staff will continue
to enter accepted orders manually in ZenPOS.

We could not find technical documentation publicly, so please point us to any available
documentation or the appropriate technical contact. We will roll this out one branch at a time.
Each branch currently has its own ZenPOS account.

1. **What integration interfaces are available?** API, webhooks, database or file export, scheduled
   email reports, cloud portal, LAN endpoint, or another supported method. Please share the
   documentation and authentication approach for each.

2. **How can we retrieve one existing sale reliably?** Can we search by ticket number, receipt
   number, claim tag, customer phone, date and branch? Which returned identifier is immutable and
   safe for us to store as the permanent link from an NYBB order to the ZenPOS sale?

3. **Which sale fields can we read?** We need items, modifiers, quantities, prices, discounts,
   taxes, delivery fee, total, tender, payment status, cashier, sales channel, order type,
   customer details, notes, created time, and branch. Please identify anything unavailable or only
   present in reports.

4. **How does the Kitchen Display System work with manually entered pickup sales?**
   Does every entered sale reach the correct KDS or kitchen printer once? Can we read preparation
   and ready states, either by API, webhook, report, or polling? Can routing vary by category or
   station?

5. **Can the Remote Terminal support this workflow on staff mobile devices?** We are considering a
   staff Android and iOS app for operations. Does Remote Terminal work on both platforms, and can
   it create the same pickup transaction as a counter terminal? What hardware, licensing, and
   network requirements apply?

6. **What catalog and inventory data is available externally?** We need products, modifier groups,
   branch price books, active promotions, stop-sell status, stock on hand, and stock movement. Are
   there real-time notifications or a supported polling interval? If an item is stopped in ZenPOS,
   how quickly can another system learn that?

7. **How are changes reflected?** We need to reconcile voids, returns, refunds, discounts, tender
   changes, item substitutions, order status, price updates, and stock changes. Are webhooks,
   change tokens, an audit feed, or reports available? If the answer is reports only, what is the
   normal delivery cadence and format?

8. **How do branches and head office work?** Is there a head-office or franchise login that can
    access several branches, or do we need separate credentials and setup for each branch? Are
    product IDs and report formats consistent across branch accounts? What is needed to link a new
    branch without a software change?

9. **What reporting and export options are available?** We need transaction, tender, cashier,
    channel, item, discount, void, return, refund, kitchen-time, and inventory reports,
    ideally at transaction level. Please describe CSV, Excel, PDF, emailed reports, API reports,
    historical retention, and branch filters.

10. **What are the operational constraints?** Please confirm available sandbox or test accounts,
    API or export pricing, rate limits, cloud versus LAN availability, support escalation during a
    branch rush, audit logs, data retention, and whether BIR rules restrict any of the data access
    or delivery workflow above.

We would appreciate one technical walkthrough against an environment matching an NYBB branch. We
would like to submit one pickup order through the NYBB app, enter it in ZenPOS, link it by a stable
reference, see the kitchen and report outcomes, update or refund it, and confirm what data we can
retrieve.

Thanks,

[name]
[role], New York Buffalo Brad's Hot Wings
[email] / [mobile]
