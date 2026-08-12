# Transition inventory, manual intake and delivery

## Purpose

This is the first implementation artifact for the 2026-08-12 transition to customer pickup orders
and manual ZenPOS entry. Delivery is deliberately deferred. This document identifies what can be
reused, what must not receive more work, and the first safe implementation boundary.

**Resolved 2026-08-12:** customers place pickup orders in the NYBB app. Staff review each order,
enter accepted orders manually in ZenPOS, and attach the ZenPOS reference to the NYBB order. ZenPOS
is the official sale record. Delivery remains a documented later phase. See
`docs/service-model-and-zenpos-options.md`.

## Current architecture found in the repository

| Area | Current implementation | Transition classification |
| --- | --- | --- |
| Menu, branch price lists, variations, modifiers, heat pricing | Catalog and database price resolvers | Reuse unchanged. Pricing remains server-authoritative. |
| Public order creation | `app/actions/checkout.ts` calls `place_order(jsonb, uuid)` | Replace with customer order submission plus staff acceptance and ZenPOS-entry confirmation. |
| Capacity | `pickup_slots`, `get_pickup_slots()`, branch pickup slot settings | Retain for the current pickup phase. Delivery capacity is deferred. |
| Orders | `orders.service_mode` is constrained to `pickup`; pickup code and slot are required | Retain for the current pickup phase. Widen only when delivery is explicitly reopened. |
| Staff operations | Board actions call `staff_set_order_status()` and enforce the pickup-code claim | Rebuild around shared transitions with pickup and delivery branches. Keep the audit and permission pattern. |
| Customer tracking | Tracking returns pickup code and pickup window | Re-scope later. It can become a read-only customer status feature, but it must not create orders. |
| Payment and refunds | PayMongo lifecycle and staff refunds are being implemented | Preserve provider reconciliation and refund controls. Payment/tender rules must be redefined for manual sources. |
| ZenPOS | Manual re-key model and unverified adapter plan | Defer all integration work. Staff enter accepted orders manually; do not connect systems yet. |
| Mobile plan | Native customer and staff apps were proposed | Redirect to staff intake and operations first. A customer app needs a separate non-ordering purpose. |

## Exact pickup-only seams

The following current elements are deliberately not delivery-ready and must not be patched casually:

- `service_mode` is an enum that does not contain `delivery`, and `orders` has a CHECK constraint
  that allows only `pickup`.
- `place_order()` validates a public customer checkout payload and reserves a pickup slot in the
  same transaction.
- `pickup_code` is required on every order and current staff claim logic depends on it.
- The active status arrays, tracking copy, staff board, history queries, and payment-expiry jobs
  assume a pickup slot and a pickup lifecycle.
- Branch configuration, content copy, metadata, and storefront UI use the wording "pickup only".

These are controlled seams for the future delivery phase. Do not change them now. The current
transition can reuse the pickup model while replacing customer checkout with an acceptance and
manual-ZenPOS-entry workflow.

## First implementation slice

Implement the following vertical slice without ZenPOS order posting:

1. Adapt customer pickup order submission for a staff acceptance step, with `accepted_by` and a
   clear “Entered in ZenPOS” audit record.
2. Retain server-resolved menu prices and existing pickup slots. ZenPOS becomes the official sale,
   price, discount, and tender record after staff entry.
3. Add an optional staff-entered ZenPOS ticket reference only if it helps prevent double entry. Do
   not query or validate it against ZenPOS.
4. Let a staff user accept, confirm manual ZenPOS entry, progress, cancel, and reconcile pickup orders
   under role and permission checks. Preserve the existing pickup-code claim.
5. Add migration, SQL, and unit tests for the acceptance and manual ZenPOS-entry workflow. Do not
   add any ZenPOS API, import, webhook, mapping, or synchronization work in this phase.

## Deferred delivery design decisions

The schema cannot safely invent these values. Do not implement them until delivery is reopened:

- Order sources and channel codes that must be reported separately.
- NYBB riders, third-party couriers, delivery platforms, or a mixture.
- Delivery address minimum fields, landmark policy, geocoding policy, and privacy retention.
- Delivery zones, fees, free-delivery or minimum-order rules, and promised-time calculation.
- Cash, external wallet, online prepayment, delivery-platform collection, and refund rules.
- Delivery failure, cancellation, return-to-store, and proof-of-handoff policies.

## Safe work already started

- The planning amendment identifies ZenPOS as a broader operational integration, not just an item
  mapper.
- The codebase now has a documented separation between reusable domain assets and public web
  checkout assumptions.
- No production migration, public-flow deletion, mobile scaffold, or ZenPOS transaction posting has
  been started. ZenPOS order posting is excluded by design. This preserves the working
  implementation while delivery rules and manual-entry controls are being designed.
