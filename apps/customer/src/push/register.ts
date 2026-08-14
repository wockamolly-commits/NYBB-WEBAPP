import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { registerPushToken } from "../api/client";

/**
 * Matches the `channelId: "orders"` `lib/push/expo.ts` sends on every message.
 * Android drops a notification silently, no error anywhere, when it arrives for
 * a channel that does not exist on the phone, so the name here is not a label,
 * it is half of a contract with the server.
 */
const ANDROID_CHANNEL_ID = "orders";

/**
 * Turns this phone into a place one order's alerts can land.
 *
 * WHY THIS RUNS SILENTLY ON EVERY MOUNT, NOT JUST THE FIRST.
 * ================================================================
 * `push_subscription_orders` keys on `(endpoint, order_code)`: registering
 * again for a new order does not create a second device row, it adds a
 * followed order to the row this device already has. Skipping the call once
 * permission is granted is the bug the reference project actually shipped: a
 * customer who opted in last week has no live registration for this week's
 * order, and background alerts for it never arrive. There is no prompt on this
 * path, so calling it every time an order screen mounts costs one request and
 * is always safe to repeat.
 *
 * WHY A SIMULATOR RETURNS BEFORE ANYTHING ELSE.
 * ================================================================
 * `Device.isDevice` is false there. There is no APNs or FCM token behind a
 * simulator, so asking for permission or a push token would be asking for
 * something that does not exist.
 *
 * WHY EVERY FAILURE IS SWALLOWED.
 * ================================================================
 * This runs on the order screen, not behind a button. A phone offline, an
 * Expo project not yet configured, a declined permission, or a dead push
 * service must still leave the customer looking at a working order screen.
 */
export async function registerForOrder(shortCode: string, trackingToken: string): Promise<void> {
  try {
    if (!Device.isDevice) return;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: "Orders",
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const permission = await Notifications.getPermissionsAsync();
    // `requestPermissionsAsync` only shows a system prompt the first time a
    // customer is asked; both platforms answer a repeat call with whatever was
    // already decided rather than asking again. That is what keeps the one
    // permission prompt a customer will ever read to exactly one call, without
    // this module having to remember whether it already asked.
    const granted = permission.granted
      ? true
      : (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;

    const token = await Notifications.getExpoPushTokenAsync();
    const platform: "ios" | "android" = Platform.OS === "ios" ? "ios" : "android";

    await registerPushToken(shortCode, { expoToken: token.data, platform }, { trackingToken });
  } catch {
    // See the note above on swallowing. Nothing here is worth surfacing on the
    // order screen: the customer can still see the order, pay for it and pick
    // it up without a single push notification ever landing.
  }
}
