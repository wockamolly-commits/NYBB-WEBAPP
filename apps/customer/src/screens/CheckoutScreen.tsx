import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { MobileError } from "../api/contract";
import type { PickupSlots } from "../api/types";
import { previewSubtotalCents, type CartLine } from "../cart";
import { formatDay, formatPeso, formatTime } from "../format";
import { RADIUS, TAP_TARGET, colors } from "../theme";
import { Button, Label, Notice, shared } from "../ui";

export type CheckoutDetails = {
  name: string;
  phone: string;
  email: string;
  notes: string;
};

/**
 * Who the order is for, and when it is collected.
 *
 * The windows come from `get_pickup_slots()` and are the only ones this screen
 * will offer. A time typed by hand, or held over from a screen that loaded an
 * hour ago, is refused by `place_order` inside the same transaction that would
 * have reserved it, so the grid reloads whenever the server says it is stale.
 */
export function CheckoutScreen({
  cart,
  slots,
  slotsLoading,
  slotsError,
  selectedSlotStart,
  details,
  placing,
  error,
  onBack,
  onReloadSlots,
  onSelectSlot,
  onDetailsChange,
  onPlaceOrder,
}: {
  cart: CartLine[];
  slots: PickupSlots | null;
  slotsLoading: boolean;
  slotsError: string | null;
  selectedSlotStart: string | null;
  details: CheckoutDetails;
  placing: boolean;
  error: MobileError | null;
  onBack: () => void;
  onReloadSlots: () => void;
  onSelectSlot: (startsAt: string) => void;
  onDetailsChange: (details: CheckoutDetails) => void;
  onPlaceOrder: () => void;
}) {
  const timezone = slots?.branch?.timezone ?? "Asia/Manila";
  const openSlots = (slots?.slots ?? []).filter((slot) => slot.remaining > 0);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.flex}
    >
      <View style={shared.screen}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back to the cart"
            accessibilityRole="button"
            onPress={onBack}
            style={styles.back}
          >
            <Text style={styles.backText}>CART</Text>
          </Pressable>
          <Text style={shared.title}>Pickup</Text>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {error ? (
            <View style={styles.block}>
              <Notice tone="alert">{error.message}</Notice>
            </View>
          ) : null}

          <View style={styles.block}>
            <Label>Pickup window</Label>
            {slotsLoading ? (
              <ActivityIndicator color={colors.buffaloOrange} style={styles.loading} />
            ) : slotsError ? (
              <View style={styles.stack}>
                <Notice tone="alert">{slotsError}</Notice>
                <Button label="TRY AGAIN" onPress={onReloadSlots} tone="secondary" />
              </View>
            ) : openSlots.length === 0 ? (
              <View style={styles.stack}>
                <Notice>{unavailableCopy(slots)}</Notice>
                <Button label="CHECK AGAIN" onPress={onReloadSlots} tone="secondary" />
              </View>
            ) : (
              <View style={styles.slotGrid}>
                {openSlots.map((slot) => (
                  <Pressable
                    accessibilityLabel={`${formatDay(slot.startsAt, timezone)}, ${formatTime(slot.startsAt, timezone)}, ${slot.remaining} left`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selectedSlotStart === slot.startsAt }}
                    key={slot.startsAt}
                    onPress={() => onSelectSlot(slot.startsAt)}
                    style={[
                      styles.slot,
                      selectedSlotStart === slot.startsAt && styles.slotSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.slotDay,
                        selectedSlotStart === slot.startsAt && styles.slotTextSelected,
                      ]}
                    >
                      {formatDay(slot.startsAt, timezone)}
                    </Text>
                    <Text
                      style={[
                        styles.slotTime,
                        selectedSlotStart === slot.startsAt && styles.slotTextSelected,
                      ]}
                    >
                      {formatTime(slot.startsAt, timezone)}
                    </Text>
                    <Text
                      style={[
                        styles.slotRemaining,
                        selectedSlotStart === slot.startsAt && styles.slotTextSelected,
                      ]}
                    >
                      {slot.remaining} left
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
            {slots?.branch ? (
              <Text style={[shared.fine, styles.branchNote]}>
                {slots.branch.name}. These times come from the branch.
              </Text>
            ) : null}
          </View>

          <Field
            autoComplete="name"
            invalid={error?.field === "name"}
            label="Name"
            onChangeText={(name) => onDetailsChange({ ...details, name })}
            placeholder="Who should we hand it to"
            value={details.name}
          />
          <Field
            autoComplete="tel"
            invalid={error?.field === "phone"}
            keyboardType="phone-pad"
            label="Mobile number"
            onChangeText={(phone) => onDetailsChange({ ...details, phone })}
            placeholder="09xx xxx xxxx"
            value={details.phone}
          />
          <Field
            autoComplete="email"
            invalid={error?.field === "email"}
            keyboardType="email-address"
            label="Email (optional)"
            onChangeText={(email) => onDetailsChange({ ...details, email })}
            placeholder="For the receipt"
            value={details.email}
          />
          <Field
            label="Note for the kitchen (optional)"
            multiline
            onChangeText={(notes) => onDetailsChange({ ...details, notes })}
            placeholder="Anything they should know"
            value={details.notes}
          />
        </ScrollView>

        <View style={styles.footer}>
          <View style={shared.row}>
            <Text style={shared.fine}>Preview subtotal</Text>
            <Text style={styles.total}>{formatPeso(previewSubtotalCents(cart))}</Text>
          </View>
          <Text style={[shared.fine, styles.footerNote]}>
            Placing the order reserves the window and prices it at the branch. Payment comes next,
            and the order is only confirmed once the payment clears.
          </Text>
          <Button
            busy={placing}
            disabled={cart.length === 0 || selectedSlotStart === null}
            label="PLACE ORDER"
            onPress={onPlaceOrder}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function unavailableCopy(slots: PickupSlots | null): string {
  switch (slots?.unavailableReason) {
    case "no_branch":
      return "No branch is taking app orders yet.";
    case "not_accepting":
      return "The kitchen has paused new orders. Please try again shortly.";
    case "no_hours":
      return "The branch has no opening hours set for today.";
    case "closed_now":
      return "The branch is closed right now.";
    case "fully_booked":
      return "Every pickup window is full. Please check again in a few minutes.";
    default:
      return "There are no pickup windows open just now.";
  }
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  invalid,
  multiline,
  keyboardType,
  autoComplete,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  multiline?: boolean;
  keyboardType?: "phone-pad" | "email-address";
  autoComplete?: "name" | "tel" | "email";
}) {
  return (
    <View style={styles.block}>
      <Label>{label}</Label>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={keyboardType === "email-address" ? "none" : "sentences"}
        autoComplete={autoComplete}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.boneLabel}
        style={[styles.input, multiline && styles.inputTall, invalid && styles.inputInvalid]}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { alignItems: "center", flexDirection: "row", gap: 14, paddingBottom: 14, paddingTop: 12 },
  back: { justifyContent: "center", minHeight: TAP_TARGET },
  backText: {
    color: colors.buffaloOrangeLit,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  body: { paddingBottom: 24 },
  block: { marginBottom: 18 },
  stack: { gap: 12, marginTop: 10 },
  loading: { alignSelf: "flex-start", marginTop: 14 },
  slotGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  slot: {
    borderColor: colors.border,
    borderRadius: RADIUS,
    borderWidth: 1,
    minHeight: TAP_TARGET + 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  slotSelected: { backgroundColor: colors.buffaloOrange, borderColor: colors.buffaloOrange },
  slotDay: { color: colors.boneLabel, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  slotTime: { color: colors.bone, fontSize: 15, fontWeight: "800", marginTop: 2 },
  slotRemaining: { color: colors.boneLabel, fontSize: 10, marginTop: 2 },
  slotTextSelected: { color: colors.char },
  branchNote: { marginTop: 10 },
  input: {
    borderColor: colors.border,
    borderRadius: RADIUS,
    borderWidth: 1,
    color: colors.bone,
    fontSize: 16,
    marginTop: 8,
    minHeight: TAP_TARGET + 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  inputTall: { minHeight: 88, textAlignVertical: "top" },
  inputInvalid: { borderColor: colors.buffaloRed },
  footer: {
    borderTopColor: colors.graphite,
    borderTopWidth: 1,
    gap: 10,
    paddingBottom: 20,
    paddingTop: 14,
  },
  total: { color: colors.bone, fontSize: 18, fontWeight: "900" },
  footerNote: { marginBottom: 4 },
});
