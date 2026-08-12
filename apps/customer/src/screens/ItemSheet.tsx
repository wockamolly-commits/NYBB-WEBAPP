import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { MenuItem } from "../api/types";
import { formatPeso } from "../format";
import {
  MAX_QUANTITY,
  MIN_QUANTITY,
  defaultSelection,
  optionPriceCents,
  selectionProblem,
  toggleOption,
  unitPreviewCents,
  type LineSelection,
} from "../menu/pricing";
import { RADIUS, RADIUS_FULL, TAP_TARGET, colors, heatScale } from "../theme";
import { Button, Label, shared } from "../ui";

/**
 * Choosing a size, a flavour and a heat.
 *
 * The price that moves as the customer taps is a preview, and it is computed by
 * `src/menu/pricing.ts`, which is the phone's copy of the same resolution order
 * Postgres uses. It is here so a choice between a HALF and a FULL is legible
 * while it is being made. It is not what anybody is charged.
 *
 * The button explains itself rather than greying out. A disabled control with
 * no reason attached is indistinguishable from a broken screen.
 */
export function ItemSheet({
  item,
  onClose,
  onAdd,
}: {
  item: MenuItem | null;
  onClose: () => void;
  onAdd: (item: MenuItem, selection: LineSelection) => void;
}) {
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={item !== null}
    >
      {item ? <ItemSheetBody item={item} onAdd={onAdd} onClose={onClose} /> : null}
    </Modal>
  );
}

function ItemSheetBody({
  item,
  onClose,
  onAdd,
}: {
  item: MenuItem;
  onClose: () => void;
  onAdd: (item: MenuItem, selection: LineSelection) => void;
}) {
  const [selection, setSelection] = useState<LineSelection>(() => defaultSelection(item));

  const unit = unitPreviewCents(item, selection);
  const problem = selectionProblem(item, selection);

  function setVariation(variationSlug: string) {
    setSelection((current) => ({ ...current, variationSlug }));
  }

  function tapOption(groupSlug: string, optionSlug: string) {
    const group = item.optionGroups.find((entry) => entry.slug === groupSlug);
    if (!group) return;

    setSelection((current) => ({
      ...current,
      optionSlugs: {
        ...current.optionSlugs,
        [groupSlug]: toggleOption(group, current.optionSlugs[groupSlug] ?? [], optionSlug),
      },
    }));
  }

  function changeQuantity(change: number) {
    setSelection((current) => ({
      ...current,
      quantity: Math.min(Math.max(current.quantity + change, MIN_QUANTITY), MAX_QUANTITY),
    }));
  }

  return (
    <View style={styles.sheet}>
      <View style={styles.sheetHeader}>
        <Pressable
          accessibilityLabel="Close"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.close}
        >
          <Text style={styles.closeText}>CLOSE</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.sheetBody}>
        <Text style={shared.title}>{item.name}</Text>
        {item.description ? (
          <Text style={[shared.body, styles.description]}>{item.description}</Text>
        ) : null}

        <View style={styles.group}>
          <Label>Size</Label>
          <View style={styles.chips}>
            {item.variations.map((variation) => (
              <Chip
                key={variation.slug}
                label={`${variation.shortName}  ${formatPeso(variation.priceCents)}`}
                onPress={() => setVariation(variation.slug)}
                selected={selection.variationSlug === variation.slug}
              />
            ))}
          </View>
        </View>

        {item.optionGroups.map((group) => (
          <View key={group.slug} style={styles.group}>
            <Label>
              {group.name}
              {group.minSelect > 0 ? " (required)" : ""}
              {group.maxSelect > 1 ? ` (up to ${group.maxSelect})` : ""}
            </Label>
            <View style={styles.chips}>
              {group.options.map((option) => {
                const add = optionPriceCents(option, selection.variationSlug);
                const heat =
                  option.heatPercent === null || option.heatPercent === undefined
                    ? null
                    : heatScale[Math.min(4, Math.floor(option.heatPercent / 25))];

                return (
                  <Chip
                    accent={heat}
                    key={option.slug}
                    label={add > 0 ? `${option.name}  +${formatPeso(add)}` : option.name}
                    onPress={() => tapOption(group.slug, option.slug)}
                    selected={(selection.optionSlugs[group.slug] ?? []).includes(option.slug)}
                  />
                );
              })}
            </View>
          </View>
        ))}

        <View style={styles.group}>
          <Label>How many</Label>
          <View style={styles.quantityRow}>
            <Pressable
              accessibilityLabel="One fewer"
              accessibilityRole="button"
              onPress={() => changeQuantity(-1)}
              style={styles.quantityButton}
            >
              <Text style={styles.quantityButtonText}>-</Text>
            </Pressable>
            <Text style={styles.quantityValue}>{selection.quantity}</Text>
            <Pressable
              accessibilityLabel="One more"
              accessibilityRole="button"
              onPress={() => changeQuantity(1)}
              style={styles.quantityButton}
            >
              <Text style={styles.quantityButtonText}>+</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <View style={styles.sheetFooter}>
        <View style={shared.row}>
          <Text style={shared.fine}>Preview price</Text>
          <Text style={styles.previewTotal}>
            {unit === null ? "" : formatPeso(unit * selection.quantity)}
          </Text>
        </View>
        <Text style={[shared.fine, styles.previewNote]}>
          The branch prices the order when it is placed. This is what we expect it to be.
        </Text>
        <Button
          disabled={problem !== null || unit === null}
          label={
            problem
              ? problem.reason === "too_few"
                ? `PICK ${problem.group.name.toUpperCase()}`
                : `TOO MANY UNDER ${problem.group.name.toUpperCase()}`
              : "ADD TO CART"
          }
          onPress={() => onAdd(item, selection)}
        />
      </View>
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
  accent,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accent?: string | null;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      {accent ? <View style={[styles.chipAccent, { backgroundColor: accent }]} /> : null}
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: colors.char, flex: 1 },
  sheetHeader: { alignItems: "flex-end", paddingHorizontal: 20, paddingTop: 14 },
  close: { justifyContent: "center", minHeight: TAP_TARGET, paddingHorizontal: 4 },
  closeText: {
    color: colors.buffaloOrangeLit,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  sheetBody: { paddingBottom: 28, paddingHorizontal: 20 },
  description: { marginTop: 8 },
  group: { marginTop: 22 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chip: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: RADIUS,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: TAP_TARGET,
    paddingHorizontal: 14,
  },
  chipSelected: { backgroundColor: colors.buffaloOrange, borderColor: colors.buffaloOrange },
  chipAccent: { borderRadius: RADIUS_FULL, height: 10, width: 10 },
  chipText: { color: colors.bone, fontSize: 14, fontWeight: "700" },
  chipTextSelected: { color: colors.char },
  quantityRow: { alignItems: "center", flexDirection: "row", gap: 16, marginTop: 10 },
  quantityButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: RADIUS_FULL,
    borderWidth: 1,
    height: TAP_TARGET,
    justifyContent: "center",
    width: TAP_TARGET,
  },
  quantityButtonText: { color: colors.bone, fontSize: 20, fontWeight: "600" },
  quantityValue: { color: colors.bone, fontSize: 18, fontWeight: "900", minWidth: 24, textAlign: "center" },
  sheetFooter: {
    borderTopColor: colors.graphite,
    borderTopWidth: 1,
    gap: 10,
    paddingBottom: 26,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  previewTotal: { color: colors.bone, fontSize: 18, fontWeight: "900" },
  previewNote: { marginBottom: 4 },
});
