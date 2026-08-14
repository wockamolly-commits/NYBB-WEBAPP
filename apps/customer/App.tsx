import * as Crypto from "expo-crypto";
import * as Notifications from "expo-notifications";
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
import { parseOrderDeepLink } from "./src/push/deep-link";
import { AccountScreen } from "./src/screens/AccountScreen";
import { CartScreen } from "./src/screens/CartScreen";
import { CheckoutScreen, type CheckoutDetails } from "./src/screens/CheckoutScreen";
import { ItemSheet } from "./src/screens/ItemSheet";
import { MenuScreen } from "./src/screens/MenuScreen";
import { OrderScreen } from "./src/screens/OrderScreen";
import { SignInScreen } from "./src/screens/SignInScreen";
import { clearOrder, loadOrder as loadStoredOrder, saveOrder } from "./src/session/store";
import { useCustomerSession } from "./src/session/useCustomerSession";
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
 * THE ORDER SESSION AND THE ACCOUNT BOTH SURVIVE A TERMINATION.
 * ================================================================
 * `src/session/store.ts` keeps the tracking token, the short code and the
 * Supabase session in platform secure storage, so an app the operating system
 * reclaims between placing an order and paying for it comes back to that order
 * rather than stranding the customer with only the branch's phone number. All
 * three are bearer credentials, which is why they are in the keychain and not in
 * ordinary app storage, and why nothing in this file logs them.
 *
 * NOTHING HERE READS AN ACCESS TOKEN OUT OF STATE.
 * ================================================================
 * `auth.accessToken()` is async because it refreshes an expiring token before
 * handing it over. Every authenticated call in this file awaits it at the moment
 * of the call rather than closing over a token from an earlier render, which is
 * what stops a long-lived screen from sending a credential that died while it
 * was open.
 */

/**
 * Show an order alert even when the app is the thing on screen.
 *
 * `expo-notifications` discards an incoming notification when no handler is
 * set, and says so plainly in `setNotificationHandler`'s own documentation.
 * Without this, a customer who placed an order and then went back to browsing
 * the menu is told nothing when it goes ready: the order screen polls, but the
 * menu, cart and account screens do not, and the operating system was going to
 * be the thing that told them.
 *
 * No badge. Nothing in this app ever clears one, so setting it would leave a
 * dot on the icon that outlives the order it was about.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const PAYMENT_METHOD = "qrph";

type Screen = "menu" | "cart" | "checkout" | "order" | "signin" | "account";

const EMPTY_DETAILS: CheckoutDetails = { name: "", phone: "", email: "", notes: "" };

/** The one order this app currently knows about, and the token that reads it. */
type OrderSession = Credentials & { shortCode: string };

export default function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  const auth = useCustomerSession();

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

  const [orderSession, setOrderSession] = useState<OrderSession | null>(null);
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
  const loadOrder = useCallback(
    async (target: OrderSession) => {
      setOrderLoading(true);
      const result = await fetchOrder(target.shortCode, {
        ...target,
        accessToken: await auth.accessToken(),
      });
      if (result.ok) {
        setOrder(result.data);
        setOrderError(null);
        // Once the payment has cleared there is nothing left to scan, and
        // leaving a stale QR code on screen invites a second payment.
        if (result.data.payment?.status === "paid") setPayment(null);
      } else {
        setOrderError(result.error);
      }
      setOrderLoading(false);
    },
    [auth],
  );

  const refreshOrder = useCallback(async () => {
    if (orderSession) await loadOrder(orderSession);
  }, [orderSession, loadOrder]);

  /**
   * Restore the order this app was tracking when it was last closed.
   *
   * Runs once, and only takes over the screen when there is something to show.
   * A customer who left the app on the menu and comes back to a stored order
   * they already collected should not be dropped onto a tracking screen, so the
   * read below decides: `leaveOrder` clears the store, and an order the server
   * no longer recognises clears it too.
   */
  useEffect(() => {
    let live = true;

    void (async () => {
      const stored = await loadStoredOrder();
      if (!live || !stored) return;

      const restored: OrderSession = {
        shortCode: stored.shortCode,
        trackingToken: stored.trackingToken,
      };
      setOrderSession(restored);
      setScreen("order");
      await loadOrder(restored);
    })();

    return () => {
      live = false;
    };
    // Deliberately once, on launch. `loadOrder` changes identity whenever the
    // session hook re-renders, and restoring on every one of those would fetch
    // the order in a loop and drag the customer back to the order screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Switch the tracking screen to whichever order a push notification named.
   *
   * Always overwrites the current order session rather than checking whether
   * it already matches: a tap for the order already on screen becomes a
   * harmless reload, and a tap for a different one is exactly the case this
   * exists for. `data.url` on the notification is the only source for the
   * short code and token, so there is nothing here for the customer to
   * confirm first.
   */
  const openOrderFromNotification = useCallback(
    async (shortCode: string, trackingToken: string) => {
      const target: OrderSession = { shortCode, trackingToken };
      setOrderSession(target);
      await saveOrder({ shortCode, trackingToken });
      setOrder(null);
      setOrderError(null);
      setPayment(null);
      setPaymentError(null);
      setScreen("order");
      await loadOrder(target);
    },
    [loadOrder],
  );

  /**
   * Tapping a notification opens the order it is about.
   *
   * `getLastNotificationResponse` covers the tap that launched the app from
   * fully closed, which never reaches a listener registered after the fact.
   * The listener covers every tap after that, while the app is already
   * running in the foreground or background.
   *
   * WHY THE RESPONSE IS CLEARED ONCE HANDLED.
   * ================================================================
   * `getLastNotificationResponse` keeps returning the same tap until it is
   * cleared, and this effect resubscribes on more renders than just the first
   * (`openOrderFromNotification` is not referentially stable). Without the
   * clear, a customer who tapped a notification and then navigated away would
   * be dragged back to that order on the next unrelated re-render.
   */
  useEffect(() => {
    function openFrom(response: Notifications.NotificationResponse | null | undefined) {
      const url = response?.notification.request.content.data.url;
      if (typeof url !== "string") return;
      const target = parseOrderDeepLink(url);
      if (!target) return;
      Notifications.clearLastNotificationResponse();
      void openOrderFromNotification(target.shortCode, target.trackingToken);
    }

    openFrom(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener(openFrom);
    return () => subscription.remove();
  }, [openOrderFromNotification]);

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

    const result = await placeOrder(
      {
        attemptId,
        branchSlug: slots?.branch?.slug ?? null,
        pickupSlotStart: selectedSlotStart,
        details,
        paymentMethod: PAYMENT_METHOD,
        lines: toOrderLines(cart),
      },
      // Signed in or not, the order goes through the same call. The token is
      // what lets `place_order` stamp `orders.user_id`, which is the whole
      // difference between an order that appears in an account later and one
      // that only the tracking token can ever reach.
      { accessToken: await auth.accessToken() },
    );

    if (result.ok) {
      const placed: OrderSession = {
        shortCode: result.data.shortCode,
        trackingToken: result.data.trackingToken,
      };
      setOrderSession(placed);
      // Written before the first read, not after. The read can fail on a bad
      // connection, and the one moment this token must not be lost is the
      // moment it is the only way back to an order that has just been paid for.
      await saveOrder({ shortCode: placed.shortCode, trackingToken: placed.trackingToken ?? null });
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
    if (!orderSession) return;

    setPaymentBusy(true);
    setPaymentError(null);

    const result = await startPayment(
      orderSession.shortCode,
      { method: PAYMENT_METHOD, paymentAttemptId },
      { ...orderSession, accessToken: await auth.accessToken() },
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
    if (!orderSession) return;

    setPaymentBusy(true);
    setPaymentError(null);
    const result = await settleMockPayment(
      orderSession.shortCode,
      { method: PAYMENT_METHOD, paymentAttemptId, outcome },
      { ...orderSession, accessToken: await auth.accessToken() },
    );
    if (!result.ok) setPaymentError(result.error);
    else setPayment(null);
    await refreshOrder();
    setPaymentBusy(false);
  }

  async function announceArrival() {
    if (!orderSession) return;

    setArrivalBusy(true);
    const result = await markArrived(orderSession.shortCode, {
      ...orderSession,
      accessToken: await auth.accessToken(),
    });
    if (!result.ok) setOrderError(result.error);
    await refreshOrder();
    setArrivalBusy(false);
  }

  async function leaveOrder() {
    setOrderSession(null);
    setOrder(null);
    setPayment(null);
    setPaymentError(null);
    setOrderError(null);
    setDetails(EMPTY_DETAILS);
    setScreen("menu");
    reloadMenu();
    // The stored copy goes with it, or the next launch restores an order the
    // customer has explicitly finished with.
    await clearOrder();
  }

  async function completeSignIn() {
    const signedIn = await auth.verifyCode();
    if (signedIn) setScreen("menu");
  }

  async function signOut() {
    await auth.signOut();
    setScreen("menu");
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
          onOpenAccount={() => {
            if (auth.session) {
              setScreen("account");
              return;
            }
            auth.openSignIn();
            setScreen("signin");
          }}
          onOpenCart={() => setScreen("cart")}
          onRetry={reloadMenu}
          onSelectItem={setActiveItem}
          signedInEmail={auth.session?.email ?? null}
        />
      ) : screen === "signin" ? (
        <SignInScreen
          busy={auth.signInBusy}
          code={auth.signInCode}
          email={auth.signInEmail}
          error={auth.signInError}
          notice={auth.signInNotice}
          onCodeChange={auth.setSignInCode}
          onDismiss={() => setScreen("menu")}
          onEmailChange={auth.setSignInEmail}
          onRequestCode={() => void auth.requestCode()}
          onUseAnotherAddress={auth.useAnotherAddress}
          onVerifyCode={() => void completeSignIn()}
          resendAvailableAt={auth.resendAvailableAt}
          step={auth.signInStep}
        />
      ) : screen === "account" ? (
        <AccountScreen
          email={auth.session?.email ?? null}
          onDismiss={() => setScreen("menu")}
          onSignOut={() => void signOut()}
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
          onDone={() => void leaveOrder()}
          onPay={() => void pay()}
          onRefresh={() => void refreshOrder()}
          onSettleMock={(outcome) => void settleMock(outcome)}
          order={order}
          payment={payment}
          paymentBusy={paymentBusy}
          paymentError={paymentError}
          shortCode={orderSession?.shortCode ?? ""}
          trackingToken={orderSession?.trackingToken ?? ""}
        />
      )}

      <ItemSheet item={activeItem} onAdd={addToCart} onClose={() => setActiveItem(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.char, flex: 1 },
});
