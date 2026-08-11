# ZenPOS integration questions

**For:** CodeLikeUs Technologies (ZenPOS)
**From:** New York Buffalo Brad's Hot Wings
**Subject:** scoping a link between our pickup ordering website and ZenPOS

This file is safe to send or paste as is. Internal notes live in `docs/zenpos-discovery.md`
and should not be shared outside the team.

---

## Background

New York Buffalo Brad's is launching a customer facing website for pickup orders, starting with the
Central Bloc, IT Park branch. Customers choose their items, pick a collection time, and pay online
at the point of ordering. An order is only sent to the branch once payment has cleared, so every
order that reaches the counter is already fully paid.

At the moment those orders arrive on a screen in the branch and our staff enter them into ZenPOS by
hand. We would like to understand whether ZenPOS can receive them directly, and what shape that
would take.

To be clear about scope: we are not looking for ZenPOS to process payments. That is settled before
the order reaches you. What we are asking about is getting the order itself, and its already paid
status, into ZenPOS accurately.

We are scoping this from our side before committing to any build, so the answers below decide how
we design ours. Where the answer is no or not supported, that is genuinely useful to know, and we
would rather hear it now than assume it.

---

## Questions

**1. Interface and access.** Does ZenPOS offer a REST or GraphQL API for external systems? If so,
where is the documentation, and how does an external system authenticate (API key, OAuth, client
certificate, or another method)?

**2. Direction of the integration.** Can an external system create orders in ZenPOS, or is the
interface read only (for example reporting and sales exports)?

**3. Recording an already paid sale.** Our website orders are paid online before they reach the
branch, through our own payment provider, so ZenPOS would be recording a sale rather than
collecting for it. Three parts to this:

  - Can a sale be created as already settled, so no one at the till is prompted to take payment
    again?
  - Can it be tagged with a tender or payment type that represents money taken outside ZenPOS, so
    the branch's end of day totals stay correct and the amount is not counted as cash in the
    drawer?
  - If a customer is refunded through our payment provider rather than at the till, is there a way
    to reflect that in ZenPOS?

**4. Outbound notifications.** Does ZenPOS send notifications out to an external system when
something changes? Are these webhooks, a polling endpoint, or neither? The changes that matter most
to us are an order moving through the kitchen (accepted, being prepared, ready, completed), a change
in item availability, and any void, discount, or refund applied at the till to an order that
originated with us. That last one matters because our records would otherwise still show the
original amount.

**5. Stock and item availability.** Can an external system read current item availability or stock
levels? We would like the website to stop offering items that a branch has run out of, and to
account for counter trade when estimating how much a kitchen can take on.

**6. Modifiers and add-ons.** How are add-ons and options modelled? Specifically, can an add-on
carry a price that varies depending on the parent item or size it is attached to? Our heat levels
are priced differently depending on the portion size they are added to, so we need to know whether
that is expressible, or whether such an add-on has to be sent as its own separate line.

**7. Multiple branches.** Is there a branch or store dimension in the interface, and can a single
set of credentials cover several branches, or does each branch need its own? We operate a range of
site formats, including a mall food hall unit, a hospital kiosk, a casino outlet, petrol station
forecourts, and street front stores, so we expect to add branches over time.

**8. Kitchen Display System.** Does the Kitchen Display System have its own way to receive orders,
independent of the till? Since our orders arrive already paid, the kitchen screen may be the more
natural landing place for them. If that is possible, we would also need to know whether an order
that lands on the kitchen screen is recorded as a sale for reporting and stock purposes, or whether
it would still have to be entered at the till separately. If it is display only, it solves the
kitchen's problem but not the bookkeeping one, and we would want to understand that before choosing
this route.

**9. QR Ordering.** Your QR Ordering module already accepts orders placed by customers on their own
devices, so ZenPOS is evidently able to take an order that originates outside the till. Can an
external website post orders into that same path? Two specifics, if so:

  - Does that path expect payment to be collected by ZenPOS or its payment partner? Our orders are
    paid before they get to you, so we would need to submit an order that is already settled rather
    than one awaiting payment.
  - Is it available to a third party website, or only to your own hosted QR ordering pages?

If this route is open to us it may be the simplest option for both sides, so we would like to
understand what it supports and what it requires on your side.

**10. Operational details.** Finally, a few practical points:

  - Are there rate limits on how frequently an external system may send requests?
  - Is there a sandbox or test environment where we can test without creating real transactions in
    a live branch?
  - Is there support for idempotency keys, so that a retried request is recognised as the same
    order rather than creating a duplicate? Because our orders arrive already paid, a duplicate
    would appear as a second paid sale in the branch's figures, so we would rather rely on your
    duplicate handling than on ours alone.
  - If an order is created in error, can it be voided or cancelled through the same interface, or
    does that have to be done by a supervisor at the till?
  - Who do we contact for technical support, and what are the hours? Our busiest trading periods
    are evenings and weekends.

---

## What we would do with the answers

We are happy to work with whatever ZenPOS supports today, including keeping our current manual
process if direct integration is not available. We are not asking for anything to be built for us.
We only need an accurate picture of what exists so we scope our own work correctly.

If it is easier to cover this in a call than in writing, we are glad to do that, and we would
appreciate a written summary afterwards for our records.

**Contact:** [IT head name, email, mobile]
