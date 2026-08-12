import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { previewSubtotalCents, type CartLine } from "../cart";
import { formatPeso } from "../format";
import { RADIUS, RADIUS_FULL, TAP_TARGET, colors } from "../theme";
import { Button, shared } from "../ui";

/**
 * The cart, which is a list of choices rather than a bill.
 *
 * The figure at the bottom is the sum of preview prices and says so. The real
 * one arrives with the order, from the branch's own price list, and this screen
 * never gets to argue with it.
 */
export function CartScreen({
  cart,
  onBack,
  onChangeQuantity,
  onCheckout,
}: {
  cart: CartLine[];
  onBack: () => void;
  onChangeQuantity: (key: string, change: number) => void;
  onCheckout: () => void;
}) {
  return (
    <View style={shared.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back to the menu"
          accessibilityRole="button"
          onPress={onBack}
          style={styles.back}
        >
          <Text style={styles.backText}>MENU</Text>
        </Pressable>
        <Text style={shared.title}>Your cart</Text>
      </View>

      {cart.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing picked yet.</Text>
          <Text style={[shared.body, styles.emptyBody]}>
            Start with your favourite wings, then choose the heat.
          </Text>
          <View style={styles.emptyAction}>
            <Button label="BROWSE MENU" onPress={onBack} />
          </View>
        </View>
      ) : (
        <>
          <FlatList
            contentContainerStyle={styles.list}
            data={cart}
            keyExtractor={(line) => line.key}
            renderItem={({ item: line }) => (
              <View style={styles.line}>
                <View style={styles.lineCopy}>
                  <Text style={styles.lineName}>{line.itemName}</Text>
                  <Text style={styles.lineDetail}>
                    {[line.variationLabel, ...line.optionLabels].join(", ")}
                  </Text>
                  <Text style={styles.linePrice}>
                    {formatPeso(line.unitPreviewCents)} each
                  </Text>
                </View>
                <View style={styles.quantity}>
                  <Pressable
                    accessibilityLabel={`One fewer ${line.itemName}`}
                    accessibilityRole="button"
                    onPress={() => onChangeQuantity(line.key, -1)}
                    style={styles.quantityButton}
                  >
                    <Text style={styles.quantityButtonText}>-</Text>
                  </Pressable>
                  <Text style={styles.quantityValue}>{line.quantity}</Text>
                  <Pressable
                    accessibilityLabel={`One more ${line.itemName}`}
                    accessibilityRole="button"
                    onPress={() => onChangeQuantity(line.key, 1)}
                    style={styles.quantityButton}
                  >
                    <Text style={styles.quantityButtonText}>+</Text>
                  </Pressable>
                </View>
              </View>
            )}
          />

          <View style={styles.footer}>
            <View style={shared.row}>
              <Text style={shared.fine}>Preview subtotal</Text>
              <Text style={styles.total}>{formatPeso(previewSubtotalCents(cart))}</Text>
            </View>
            <Text style={[shared.fine, styles.footerNote]}>
              The branch prices every line when the order is placed, so this figure can still move.
            </Text>
            <Button label="CHOOSE A PICKUP TIME" onPress={onCheckout} />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", flexDirection: "row", gap: 14, paddingBottom: 18, paddingTop: 12 },
  back: { justifyContent: "center", minHeight: TAP_TARGET },
  backText: {
    color: colors.buffaloOrangeLit,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  empty: { alignItems: "center", flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  emptyTitle: { color: colors.bone, fontSize: 26, fontWeight: "800", textAlign: "center" },
  emptyBody: { marginTop: 10, textAlign: "center" },
  emptyAction: { marginTop: 24, minWidth: 200 },
  list: { paddingBottom: 16 },
  line: {
    alignItems: "center",
    backgroundColor: colors.charcoal,
    borderRadius: RADIUS,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    padding: 14,
  },
  lineCopy: { flex: 1, paddingRight: 12 },
  lineName: { color: colors.bone, fontSize: 16, fontWeight: "800" },
  lineDetail: { color: colors.boneMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  linePrice: { color: colors.boneLabel, fontSize: 12, marginTop: 6 },
  quantity: { alignItems: "center", flexDirection: "row", gap: 10 },
  quantityButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: RADIUS_FULL,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  quantityButtonText: { color: colors.bone, fontSize: 18, fontWeight: "600" },
  quantityValue: { color: colors.bone, fontSize: 15, fontWeight: "900", minWidth: 16, textAlign: "center" },
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
