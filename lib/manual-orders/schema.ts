import { z } from "zod";

/**
 * The staff-app order-intake boundary.
 *
 * It intentionally accepts identifiers, quantities, fulfilment details and an
 * order-source label, but no price, discount, delivery fee, payment state or
 * ZenPOS reference. The server resolves prices and creates the audit and POS
 * link. Delivery-fee policy and tender rules remain owner decisions, so they
 * must not arrive as ungoverned numeric fields from a staff client.
 */
const orderLineSchema = z.object({
  itemId: z.uuid(),
  variationId: z.uuid(),
  optionIds: z.array(z.uuid()).max(20),
  quantity: z.number().int().min(1).max(50),
  notes: z.string().trim().max(280).optional(),
});

const customerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(7).max(32),
  email: z.email().optional(),
});

const commonSchema = {
  branchId: z.uuid(),
  /** A required label until the owner confirms the controlled source list. */
  source: z.string().trim().min(1).max(80),
  customer: customerSchema,
  lines: z.array(orderLineSchema).min(1).max(50),
  notes: z.string().trim().max(500).optional(),
  isTest: z.boolean().optional(),
};

const pickupIntakeSchema = z.object({
  ...commonSchema,
  serviceMode: z.literal("pickup"),
  /** An entered order can be an immediate collection or a promised collection. */
  pickup: z
    .object({
      promisedAt: z.iso.datetime({ offset: true }).optional(),
    })
    .optional(),
});

const deliveryIntakeSchema = z.object({
  ...commonSchema,
  serviceMode: z.literal("delivery"),
  delivery: z.object({
    addressLine: z.string().trim().min(1).max(280),
    barangay: z.string().trim().max(120).optional(),
    city: z.string().trim().min(1).max(120),
    landmark: z.string().trim().max(280).optional(),
    instructions: z.string().trim().max(500).optional(),
    promisedAt: z.iso.datetime({ offset: true }).optional(),
  }),
});

export const manualOrderIntakeSchema = z.discriminatedUnion("serviceMode", [
  pickupIntakeSchema,
  deliveryIntakeSchema,
]);

export type ManualOrderIntake = z.infer<typeof manualOrderIntakeSchema>;
export type ManualOrderLine = z.infer<typeof orderLineSchema>;
