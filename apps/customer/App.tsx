import * as Crypto from "expo-crypto";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { Linking, SafeAreaView, StyleSheet } from "react-native";
import type { MobileError, MobilePaymentStart } from "./src/api/contract";
import {
  fetchMenu,
  fetchOrder,
  fetchPickupSlots,
  markArrived,
  placeOrder,
  settleMockPayment,
  startPayment,
  type Credentials,
} from "./src/api/client";
import type { MenuItem, PickupSlots, StorefrontMenu, TrackedOrder } from "./src/api/types";
import { addLine, buildCartLine, cartCount, changeQuantity, toOrderLines, type CartLine } from "./src/cart";
import type { LineSelection } from "./src/menu/pricing";
import { CartScreen } from "./src/screens/CartScreen";
import { CheckoutScreen, type CheckoutDetails } from "./src/screens/CheckoutScreen";
import { ItemSheet } from "./src/screens/ItemSheet";
import { MenuScreen } from "./src/screens/MenuScreen";
import { OrderScreen } from "./src/screens/OrderScreen";
import { colors } from "./src/theme";

/**
 * The NYBB customer app.
 *
 * WHAT THIS FILE IS RESPONSIBLE FOR, AND WHAT IT IS NOT.
 * ================================================================
 * It holds the cart, moves between screens, and calls the mobile API. It does
 * not decide anything a customer pays for or a branch acts on. Prices come from
 * the menu endpoint, the total comes back with the order, payment state comes
 * from the PayMongo webhook by way of an order read, and order status is
 * whatever the last read said it was. There is no code path here that writes
 * any of those, and adding one would be the bug.
 *
 * THE ORDER SESSION LIVES IN MEMORY ONLY, FOR NOW.
 * ================================================================
 * The tracking token is the credential that reads a guest's order, and it is
 * held in React state rather than in secure storage, because this slice does
 * not have a secure-storage dependency yet. The consequence is honest and worth
 * knowing: if the operating system terminates the app between placing an order
 * and paying for it, the app loses its way back to that order, and the customer
 * needs the branch. Persisting it belongs in the same slice as native sign-in,
 * where the Supabase session also has to be stored properly.
 */

const PAYMENT_METHOD = "qrph";

type Screen = "menu" | "cart" | "checkout" | "order";

const EMPTY_DETAILS: CheckoutDetails = { name: "", phone: "", email: "", notes: "" };

/** The one order this app currently knows about, and the token that reads it. */
type OrderSession = Credentials & { shortCode: string };

export default function App() {
  const [screen, setScreen] = useState<Screen>("menu");

  const [menu, setMenu] = useState<StorefrontMenu | null>(null);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [menuReloads, setMenuReloads] = useState(0);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [activeItem, setActiveItem] = useState<MenuItem | null>(null);

  const [slots, setSlots] = useState<PickupSlots | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedSlotStart, setSelectedSlotStart] = useState<string | null>(null);

  const [details, setDetails] = useState<CheckoutDetails>(EMPTY_DETAILS);
  const [attemptId, setAttemptId] = useState<string>(() => Crypto.randomUUID());
  const [placing, setPlacing] = useState(false);
  const [checkoutError, setCheckoutError] = useState<MobileError | null>(null);

  const [session, setSession] = useState<OrderSession | null>(null);
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState<MobileError | null>(null);

  const [payment, setPayment] = useState<MobilePaymentStart | null>(null);
  const [paymentAttemptId, setPaymentAttemptId] = useState<string>(() => Crypto.randomUUID());
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentError, setPaymentError] = useState<MobileError | null>(null);
  const [arrivalBusy, setArrivalBusy] = useState(false);

  const loadSlots = useCallback(async () => {
    setSlotsLoading(true);
    setSlotsError(null);
    const result = await fetchPickupSlots();
    if (result.ok) {
      setSlots(result.data);
      // A window that is no longer offered must not stay selected. The database
      // would refuse it anyway, but showing it as chosen until then is a lie
      // the customer would only discover at the last step.
      setSelectedSlotStart((current) =>
        current && result.data.slots.some((slot) => slot.startsAt === current && slot.remaining > 0)
          ? current
          : null,
      );
    } else {
      setSlotsError(result.error.message);
    }
    setSlotsLoading(false);
  }, []);

  /**
   * Load the menu on mount, and again whenever something asks for a reload.
   *
   * Written as a subscription rather than as a call, which is what an effect is
   * for: the request starts, and every piece of state it produces is set in the
   * callback once it answers. `live` drops a response that arrives after the
   * screen has moved on, which is otherwise a state update on a component that
   * is no longer there.
   */
  useEffect(() => {
    let live = true;

    void fetchMenu().then((result) => {
      if (!live) return;
      if (result.ok) {
        setMenu(result.data);
        setMenuError(null);
      } else {
        setMenuError(result.error.message);
      }
      setMenuLoading(false);
    });

    return () => {
      live = false;
    };
  }, [menuReloads]);

  function reloadMenu() {
    setMenuLoading(true);
    setMenuError(null);
    setMenuReloads((count) => count + 1);
  }

  /**
   * Read one order back.
   *
   * Takes the session it should read rather than closing over state, so the
   * first read can happen in the same turn that places the order instead of in
   * an effect watching for the session to appear. An effect that fetches on a
   * state change it just caused is a render loop waiting for one bad
   * dependency.
   */
  const loadOrder = useCallback(async (target: OrderSession) => {
    setOrderLoading(true);
    const result = await fetchOrder(target.shortCode, target);
    if (result.ok) {
      setOrder(result.data);
      setOrderError(null);
      // Once the payment has cleared there is nothing left to scan, and leaving
      // a stale QR code on screen invites a second payment.
      if (result.data.payment?.status === "paid") setPayment(null);
    } else {
      setOrderError(result.error);
    }
    setOrderLoading(false);
  }, []);

  const refreshOrder = useCallback(async () => {
    if (session) await loadOrder(session);
  }, [session, loadOrder]);

  function openCheckout() {
    setCheckoutError(null);
    setScreen("checkout");
    void loadSlots();
  }

  function addToCart(item: MenuItem, selection: LineSelection) {
    const line = buildCartLine(item, selection);
    if (line) setCart((current) => addLine(current, line));
    setActiveItem(null);
  }

  async function submitOrder() {
    if (!selectedSlotStart || cart.length === 0) return;

    setPlacing(true);
    setCheckoutError(null);

    const result = await placeOrder({
      attemptId,
      branchSlug: slots?.branch?.slug ?? null,
      pickupSlotStart: selectedSlotStart,
      details,
      paymentMethod: PAYMENT_METHOD,
      lines: toOrderLines(cart),
    });

    if (result.ok) {
      const placed: OrderSession = {
        shortCode: result.data.shortCode,
        trackingToken: result.data.trackingToken,
      };
      setSession(placed);
      setOrder(null);
      setPayment(null);
      setPaymentError(null);
      setPaymentAttemptId(Crypto.randomUUID());
      setCart([]);
      setSelectedSlotStart(null);
      // The attempt id is spent. Reusing it would be refused, which is exactly
      // what it is for, but the next order needs its own.
      setAttemptId(Crypto.randomUUID());
      setScreen("order");
      await loadOrder(placed);
    } else {
      setCheckoutError(result.error);
      // The server told us the grid on screen is out of date. Reload it before
      // the customer picks again, rather than letting them pick another window
      // that filled at the same moment.
      if (result.error.staleSlots) void loadSlots();
      if (result.error.newAttempt) setAttemptId(Crypto.randomUUID());
    }

    setPlacing(false);
  }

  async function pay() {
    if (!session) return;

    setPaymentBusy(true);
    setPaymentError(null);

    const result = await startPayment(
      session.shortCode,
      { method: PAYMENT_METHOD, paymentAttemptId },
      session,
    );

    if (result.ok) {
      setPayment(result.data);
      if (result.data.action === "redirect") {
        await Linking.openURL(result.data.redirectUrl).catch(() => undefined);
      }
      if (result.data.action === "done") await refreshOrder();
    } else {
      setPaymentError(result.error);
      // A fresh attempt id for the next press. The old one is the idempotency
      // key of an attempt that did not work, and reusing it would return the
      // same failed attempt rather than making a new one.
      setPaymentAttemptId(Crypto.randomUUID());
    }

    setPaymentBusy(false);
  }

  async function settleMock(outcome: "paid" | "failed") {
    if (!session) return;

    setPaymentBusy(true);
    setPaymentError(null);
    const result = await settleMockPayment(
      session.shortCode,
      { method: PAYMENT_METHOD, paymentAttemptId, outcome },
      session,
    );
    if (!result.ok) setPaymentError(result.error);
    else setPayment(null);
    await refreshOrder();
    setPaymentBusy(false);
  }

  async function announceArrival() {
    if (!session) return;

    setArrivalBusy(true);
    const result = await markArrived(session.shortCode, session);
    if (!result.ok) setOrderError(result.error);
    await refreshOrder();
    setArrivalBusy(false);
  }

  function leaveOrder() {
    setSession(null);
    setOrder(null);
    setPayment(null);
    setPaymentError(null);
    setOrderError(null);
    setDetails(EMPTY_DETAILS);
    setScreen("menu");
    reloadMenu();
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      {screen === "menu" ? (
        <MenuScreen
          cartCount={cartCount(cart)}
          error={menuError}
          loading={menuLoading}
          menu={menu}
          onOpenCart={() => setScreen("cart")}
          onRetry={reloadMenu}
          onSelectItem={setActiveItem}
        />
      ) : screen === "cart" ? (
        <CartScreen
          cart={cart}
          onBack={() => setScreen("menu")}
          onChangeQuantity={(key, change) =>
            setCart((current) => changeQuantity(current, key, change))
          }
          onCheckout={openCheckout}
        />
      ) : screen === "checkout" ? (
        <CheckoutScreen
          cart={cart}
          details={details}
          error={checkoutError}
          onBack={() => setScreen("cart")}
          onDetailsChange={setDetails}
          onPlaceOrder={() => void submitOrder()}
          onReloadSlots={() => void loadSlots()}
          onSelectSlot={setSelectedSlotStart}
          placing={placing}
          selectedSlotStart={selectedSlotStart}
          slots={slots}
          slotsError={slotsError}
          slotsLoading={slotsLoading}
        />
      ) : (
        <OrderScreen
          arrivalBusy={arrivalBusy}
          error={orderError}
          loading={orderLoading}
          onArrived={() => void announceArrival()}
          onDone={leaveOrder}
          onPay={() => void pay()}
          onRefresh={() => void refreshOrder()}
          onSettleMock={(outcome) => void settleMock(outcome)}
          order={order}
          payment={payment}
          paymentBusy={paymentBusy}
          paymentError={paymentError}
        />
      )}

      <ItemSheet item={activeItem} onAdd={addToCart} onClose={() => setActiveItem(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.char, flex: 1 },
});
