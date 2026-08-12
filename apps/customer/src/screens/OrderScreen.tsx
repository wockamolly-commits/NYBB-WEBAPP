import { useEffect } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import type { MobileError, MobilePaymentStart } from "../api/contract";
import type { TrackedOrder } from "../api/types";
import { formatPeso, formatPickupWindow } from "../format";
import { RADIUS, colors } from "../theme";
import { Button, Card, Label, Notice, shared } from "../ui";

/**
 * One order, read back from the server on a timer.
 *
 * Nothing on this screen is remembered as a fact. The status, the payment
 * state, the totals and the pickup code are whatever the last read said, and
 * the app never advances any of them on its own. That is the whole reason a
 * returning-from-payment screen cannot lie: coming back from PayMongo does not
 * make an order paid, the webhook does, and this screen finds out by asking.
 */

const FINAL_STATUSES = ["claimed", "rejected", "cancelled", "no_show"];

export function OrderScreen({
  order,
  loading,
  error,
  payment,
  paymentError,
  paymentBusy,
  arrivalBusy,
  onRefresh,
  onPay,
  onSettleMock,
  onArrived,
  onDone,
}: {
  order: TrackedOrder | null;
  loading: boolean;
  error: MobileError | null;
  payment: MobilePaymentStart | null;
  paymentError: MobileError | null;
  paymentBusy: boolean;
  arrivalBusy: boolean;
  onRefresh: () => void;
  onPay: () => void;
  onSettleMock: (outcome: "paid" | "failed") => void;
  onArrived: () => void;
  onDone: () => void;
}) {
  const settled = order !== null && FINAL_STATUSES.includes(order.status);

  useEffect(() => {
    // Polling rather than a socket, deliberately. The staff board is the
    // realtime surface; a customer waiting on a payment or a "ready" needs a
    // fresh answer within a few seconds, and a poll cannot get stuck in a
    // half-open connection on a phone that has moved between cells.
    if (settled) return;
    const timer = setInterval(onRefresh, 6000);
    return () => clearInterval(timer);
  }, [settled, onRefresh]);

  if (!order) {
    return (
      <View style={[shared.screen, styles.centred]}>
        {loading ? (
          <ActivityIndicator color={colors.buffaloOrange} />
        ) : (
          <>
            <Notice tone="alert">{error?.message ?? "We could not open that order."}</Notice>
            <View style={styles.action}>
              <Button label="TRY AGAIN" onPress={onRefresh} tone="secondary" />
            </View>
            <View style={styles.action}>
              <Button label="BACK TO THE MENU" onPress={onDone} tone="quiet" />
            </View>
          </>
        )}
      </View>
    );
  }

  const paid = order.payment?.status === "paid";
  const awaitingPayment = order.status === "pending" && order.payment?.status === "pending";

  return (
    <View style={shared.screen}>
      <ScrollView contentContainerStyle={styles.body}>
        <Label>Order</Label>
        <Text style={styles.code}>{order.shortCode}</Text>
        <Text style={styles.status}>{statusCopy(order)}</Text>

        {error ? (
          <View style={styles.block}>
            <Notice tone="alert">{error.message}</Notice>
          </View>
        ) : null}

        {awaitingPayment ? (
          <View style={styles.block}>
            <Card>
              <Label>Payment</Label>
              <Text style={[shared.body, styles.cardCopy]}>
                {formatPeso(order.payment?.amountCents ?? order.totalCents)} through QR Ph. The
                window is held until this is paid.
              </Text>
              {paymentError ? (
                <View style={styles.cardBlock}>
                  <Notice tone="alert">{paymentError.message}</Notice>
                </View>
              ) : null}
              {payment?.action === "qr" ? (
                <View style={styles.qrPanel}>
                  <Image
                    accessibilityLabel="QR Ph code for this payment"
                    resizeMode="contain"
                    source={{ uri: payment.qrImageUrl }}
                    style={styles.qr}
                  />
                  <Text style={shared.fine}>
                    Scan this in your banking app. This screen updates by itself once the payment
                    clears.
                  </Text>
                </View>
              ) : payment?.action === "redirect" ? (
                <View style={styles.cardBlock}>
                  <Notice>
                    Finish the payment in the page that opened, then come back here. This screen
                    updates by itself.
                  </Notice>
                </View>
              ) : payment?.action === "mock" ? (
                <View style={styles.mockPanel}>
                  <Notice tone="alert">
                    Development payment simulator. This never runs in a released build.
                  </Notice>
                  <Button
                    busy={paymentBusy}
                    label="SIMULATE A PAID PAYMENT"
                    onPress={() => onSettleMock("paid")}
                  />
                  <Button
                    busy={paymentBusy}
                    label="SIMULATE A FAILED PAYMENT"
                    onPress={() => onSettleMock("failed")}
                    tone="danger"
                  />
                </View>
              ) : (
                <View style={styles.cardBlock}>
                  <Button busy={paymentBusy} label="PAY NOW" onPress={onPay} />
                </View>
              )}
            </Card>
          </View>
        ) : null}

        {paid && order.status !== "claimed" ? (
          <View style={styles.block}>
            <Notice tone="good">
              Paid. The counter has your order and will start it for your window.
            </Notice>
          </View>
        ) : null}

        <View style={styles.block}>
          <Card>
            <Label>Show this at the counter</Label>
            <Text style={styles.pickupCode}>{order.pickupCode}</Text>
            <Text style={shared.fine}>
              Staff ask for these four digits before handing the order over.
            </Text>
          </Card>
        </View>

        <View style={styles.block}>
          <Label>Pickup</Label>
          <Text style={[shared.body, styles.cardCopy]}>
            {order.pickup
              ? formatPickupWindow(
                  order.pickup.startsAt,
                  order.pickup.endsAt,
                  order.branch.timezone,
                )
              : "No window on this order."}
          </Text>
          <Text style={shared.fine}>
            {order.branch.name}, {order.branch.addressLine}, {order.branch.city}
          </Text>
        </View>

        {order.status === "ready" ? (
          <View style={styles.block}>
            <Button
              busy={arrivalBusy}
              label={
                order.timeline.customerArrivedAt ? "THE COUNTER KNOWS YOU ARE HERE" : "I AM HERE"
              }
              disabled={Boolean(order.timeline.customerArrivedAt)}
              onPress={onArrived}
              tone="secondary"
            />
          </View>
        ) : null}

        <View style={styles.block}>
          <Label>Items</Label>
          {order.items.map((item, index) => (
            <View key={`${item.name}-${index}`} style={styles.item}>
              <View style={styles.itemCopy}>
                <Text style={styles.itemName}>
                  {item.quantity} x {item.name}
                </Text>
                <Text style={styles.itemDetail}>
                  {[item.variationLabel, ...item.options.map((option) => option.name)].join(", ")}
                </Text>
              </View>
              <Text style={styles.itemPrice}>{formatPeso(item.lineTotalCents)}</Text>
            </View>
          ))}

          <View style={[shared.row, styles.totalRow]}>
            <Text style={shared.body}>Subtotal</Text>
            <Text style={shared.body}>{formatPeso(order.subtotalCents)}</Text>
          </View>
          {order.discountCents > 0 ? (
            <View style={[shared.row, styles.totalRow]}>
              <Text style={shared.body}>Discount</Text>
              <Text style={shared.body}>-{formatPeso(order.discountCents)}</Text>
            </View>
          ) : null}
          <View style={[shared.row, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatPeso(order.totalCents)}</Text>
          </View>
          <Text style={[shared.fine, styles.totalNote]}>
            These figures come from the branch, not from this app.
          </Text>
        </View>

        <View style={styles.block}>
          <Button label="BACK TO THE MENU" onPress={onDone} tone="quiet" />
        </View>
      </ScrollView>
    </View>
  );
}

function statusCopy(order: TrackedOrder): string {
  switch (order.status) {
    case "pending":
      return order.payment?.status === "paid"
        ? "Paid. Waiting for the counter to accept it."
        : "Waiting for payment.";
    case "accepted":
      return "Accepted by the branch.";
    case "preparing":
      return "In the kitchen now.";
    case "ready":
      return "Ready for collection.";
    case "claimed":
      return "Collected. Enjoy.";
    case "rejected":
      return order.timeline.rejectedReason
        ? `The branch could not take this order. ${order.timeline.rejectedReason}`
        : "The branch could not take this order.";
    case "cancelled":
      return order.timeline.cancelledReason
        ? `Cancelled. ${order.timeline.cancelledReason}`
        : "Cancelled.";
    case "no_show":
      return "This order was not collected.";
    default:
      return "";
  }
}

const styles = StyleSheet.create({
  centred: { alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  action: { marginTop: 14, minWidth: 220 },
  body: { paddingBottom: 32, paddingTop: 16 },
  code: { color: colors.bone, fontSize: 34, fontWeight: "900", letterSpacing: -1, marginTop: 6 },
  status: { color: colors.buffaloOrangeLit, fontSize: 15, fontWeight: "700", marginTop: 6 },
  block: { marginTop: 22 },
  cardBlock: { marginTop: 12 },
  cardCopy: { marginBottom: 8, marginTop: 8 },
  pickupCode: {
    color: colors.signageYellow,
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: 6,
    marginBottom: 6,
    marginTop: 8,
  },
  qrPanel: { alignItems: "center", gap: 12, marginTop: 14 },
  qr: { backgroundColor: colors.bone, borderRadius: RADIUS, height: 240, padding: 8, width: 240 },
  mockPanel: { gap: 10, marginTop: 14 },
  item: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  itemCopy: { flex: 1, paddingRight: 12 },
  itemName: { color: colors.bone, fontSize: 15, fontWeight: "800" },
  itemDetail: { color: colors.boneMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  itemPrice: { color: colors.bone, fontSize: 14, fontWeight: "700" },
  totalRow: { marginTop: 10 },
  totalLabel: { color: colors.bone, fontSize: 15, fontWeight: "800" },
  totalValue: { color: colors.bone, fontSize: 18, fontWeight: "900" },
  totalNote: { marginTop: 10 },
});
