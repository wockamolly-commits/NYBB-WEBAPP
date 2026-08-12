import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { MenuItem, StorefrontMenu } from "../api/types";
import { formatPesoCompact } from "../format";
import { itemPriceRange } from "../menu/pricing";
import { RADIUS, RADIUS_FULL, TAP_TARGET, colors, heatScale } from "../theme";
import { Button, Notice, shared } from "../ui";

/**
 * The menu, as the server publishes it.
 *
 * Every price on this screen came from `/api/mobile/v1/menu`, which reads the
 * same `get_storefront_menu()` the website reads. Nothing here is computed from
 * a local price list, and when the server answers from its static catalog the
 * screen says so, because a published list is not a live one.
 */
export function MenuScreen({
  menu,
  loading,
  error,
  cartCount,
  onRetry,
  onOpenCart,
  onSelectItem,
}: {
  menu: StorefrontMenu | null;
  loading: boolean;
  error: string | null;
  cartCount: number;
  onRetry: () => void;
  onOpenCart: () => void;
  onSelectItem: (item: MenuItem) => void;
}) {
  const [category, setCategory] = useState<string>("all");

  const categories = useMemo(
    () => [{ slug: "all", name: "All" }, ...(menu?.categories ?? [])],
    [menu],
  );

  const items = useMemo(() => {
    if (!menu) return [];
    return menu.categories
      .filter((entry) => category === "all" || entry.slug === category)
      .flatMap((entry) => entry.items);
  }, [menu, category]);

  return (
    <View style={shared.screen}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.brand}>NYBB HOT WINGS</Text>
          <Text style={shared.title}>Pick your heat.</Text>
        </View>
        <Pressable
          accessibilityLabel={`Open cart, ${cartCount} items`}
          accessibilityRole="button"
          onPress={onOpenCart}
          style={styles.cartButton}
        >
          <Text style={styles.cartButtonText}>CART</Text>
          <Text style={styles.cartBadge}>{cartCount}</Text>
        </Pressable>
      </View>

      {loading && !menu ? (
        <View style={styles.centred}>
          <ActivityIndicator color={colors.buffaloOrange} />
          <Text style={[shared.body, styles.centredText]}>Loading the menu.</Text>
        </View>
      ) : error ? (
        <View style={styles.centred}>
          <Notice tone="alert">{error}</Notice>
          <View style={styles.retry}>
            <Button label="TRY AGAIN" onPress={onRetry} tone="secondary" />
          </View>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={items}
          keyExtractor={(item) => item.slug}
          ListHeaderComponent={
            <View>
              {menu?.source === "static" ? (
                <View style={styles.staticNotice}>
                  <Notice tone="alert">
                    This menu is a published copy, not the live branch price list. You can look, but
                    an order will not go through until the branch is connected.
                  </Notice>
                </View>
              ) : null}
              <View style={styles.categoryRow}>
                {categories.map((entry) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: category === entry.slug }}
                    key={entry.slug}
                    onPress={() => setCategory(entry.slug)}
                    style={[
                      styles.categoryButton,
                      category === entry.slug && styles.categoryButtonActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryText,
                        category === entry.slug && styles.categoryTextActive,
                      ]}
                    >
                      {entry.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          }
          ListEmptyComponent={
            <Notice>Nothing is on the menu here just now.</Notice>
          }
          renderItem={({ item }) => <MenuCard item={item} onPress={() => onSelectItem(item)} />}
        />
      )}
    </View>
  );
}

function MenuCard({ item, onPress }: { item: MenuItem; onPress: () => void }) {
  const { fromCents, toCents } = itemPriceRange(item);
  const price =
    fromCents === toCents
      ? formatPesoCompact(fromCents)
      : `${formatPesoCompact(fromCents)} to ${formatPesoCompact(toCents)}`;

  // The hottest option this item carries, purely as a visual cue on the card.
  const heat = item.optionGroups
    .flatMap((group) => group.options)
    .reduce<number | null>(
      (hottest, option) =>
        option.heatPercent === null || option.heatPercent === undefined
          ? hottest
          : Math.max(hottest ?? 0, option.heatPercent),
      null,
    );

  return (
    <Pressable
      accessibilityLabel={`${item.name}, from PHP ${price}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.menuCard, pressed && styles.menuCardPressed]}
    >
      {heat === null ? null : (
        <View
          style={[
            styles.heatMark,
            { backgroundColor: heatScale[Math.min(4, Math.floor(heat / 25))] },
          ]}
        />
      )}
      <View style={styles.itemCopy}>
        {item.code ? <Text style={styles.itemCode}>{item.code}</Text> : null}
        <Text style={styles.itemName}>{item.name}</Text>
        {item.description ? (
          <Text numberOfLines={2} style={styles.itemDescription}>
            {item.description}
          </Text>
        ) : null}
        <Text style={styles.itemPrice}>PHP {price}</Text>
      </View>
      <View style={styles.chooseMark}>
        <Text style={styles.chooseMarkText}>+</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 16,
    paddingTop: 12,
  },
  headerCopy: { flex: 1, paddingRight: 12 },
  brand: {
    color: colors.signageYellow,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2.4,
    marginBottom: 6,
  },
  cartButton: {
    alignItems: "center",
    backgroundColor: colors.buffaloOrange,
    borderRadius: RADIUS_FULL,
    flexDirection: "row",
    gap: 7,
    minHeight: TAP_TARGET,
    paddingHorizontal: 14,
  },
  cartButtonText: { color: colors.char, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  cartBadge: { color: colors.char, fontSize: 14, fontWeight: "900" },
  centred: { alignItems: "center", flex: 1, justifyContent: "center", paddingHorizontal: 12 },
  centredText: { marginTop: 12, textAlign: "center" },
  retry: { marginTop: 16, minWidth: 180 },
  list: { paddingBottom: 24 },
  staticNotice: { marginBottom: 16 },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  categoryButton: {
    borderColor: colors.border,
    borderRadius: RADIUS_FULL,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: 14,
  },
  categoryButtonActive: { backgroundColor: colors.bone, borderColor: colors.bone },
  categoryText: { color: colors.bone, fontSize: 13, fontWeight: "700" },
  categoryTextActive: { color: colors.char },
  menuCard: {
    alignItems: "center",
    backgroundColor: colors.charcoal,
    borderRadius: RADIUS,
    flexDirection: "row",
    marginBottom: 10,
    minHeight: 108,
    padding: 14,
  },
  menuCardPressed: { backgroundColor: colors.graphite },
  heatMark: { alignSelf: "stretch", borderRadius: RADIUS_FULL, marginRight: 12, width: 4 },
  itemCopy: { flex: 1 },
  itemCode: {
    color: colors.boneLabel,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  itemName: { color: colors.bone, fontSize: 17, fontWeight: "800", marginTop: 3 },
  itemDescription: { color: colors.boneMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  itemPrice: { color: colors.bone, fontSize: 13, fontWeight: "800", marginTop: 8 },
  chooseMark: {
    alignItems: "center",
    backgroundColor: colors.bone,
    borderRadius: RADIUS_FULL,
    height: 42,
    justifyContent: "center",
    marginLeft: 12,
    width: 42,
  },
  chooseMarkText: { color: colors.char, fontSize: 24, fontWeight: "500", marginTop: -2 },
});
