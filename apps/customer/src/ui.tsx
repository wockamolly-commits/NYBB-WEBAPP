import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { RADIUS, TAP_TARGET, colors } from "./theme";

/**
 * The handful of controls every screen needs, so that none of them redraws a
 * button slightly differently.
 *
 * Tone follows DESIGN.md: on a dark ground the primary fill is Buffalo Orange
 * with char text, secondary is a bone border at 40%, and a quiet tier exists so
 * a minor action does not have to fall out of the system into bare underlined
 * text. Every one of them is at least a 44px target.
 */

export function Button({
  label,
  onPress,
  tone = "primary",
  disabled,
  busy,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  tone?: "primary" | "secondary" | "quiet" | "danger";
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
}) {
  const inactive = disabled || busy;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(inactive) }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === "primary" && styles.buttonPrimary,
        tone === "secondary" && styles.buttonSecondary,
        tone === "quiet" && styles.buttonQuiet,
        tone === "danger" && styles.buttonDanger,
        pressed && !inactive && styles.buttonPressed,
        inactive && styles.buttonInactive,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={tone === "primary" ? colors.char : colors.bone} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            tone === "primary" ? styles.buttonLabelOnFill : styles.buttonLabelOnDark,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** The uppercase micro-label that sits above a field or a group. */
export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

/**
 * Something the customer needs to read, which is not an error by default.
 *
 * `tone="alert"` puts a red rule beside it rather than turning the words red.
 * DESIGN.md is explicit that colour is never the message on its own, and
 * signage red on charcoal does not measure for body text.
 */
export function Notice({
  children,
  tone = "quiet",
}: {
  children: ReactNode;
  tone?: "quiet" | "alert" | "good";
}) {
  return (
    <View
      style={[
        styles.notice,
        tone === "alert" && styles.noticeAlert,
        tone === "good" && styles.noticeGood,
      ]}
    >
      <Text style={styles.noticeText}>{children}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: RADIUS,
    justifyContent: "center",
    minHeight: TAP_TARGET + 8,
    paddingHorizontal: 18,
  },
  buttonPrimary: { backgroundColor: colors.buffaloOrange },
  buttonSecondary: { borderColor: colors.border, borderWidth: 1 },
  buttonQuiet: { backgroundColor: "transparent" },
  buttonDanger: { borderColor: colors.buffaloRed, borderWidth: 1 },
  buttonPressed: { opacity: 0.85 },
  buttonInactive: { opacity: 0.45 },
  buttonLabel: { fontSize: 13, fontWeight: "900", letterSpacing: 1, textAlign: "center" },
  buttonLabelOnFill: { color: colors.char },
  buttonLabelOnDark: { color: colors.bone },
  label: {
    color: colors.boneLabel,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  notice: {
    backgroundColor: colors.charcoal,
    borderLeftColor: colors.border,
    borderLeftWidth: 3,
    borderRadius: RADIUS,
    padding: 12,
  },
  noticeAlert: { borderLeftColor: colors.buffaloRed },
  noticeGood: { borderLeftColor: colors.signageYellow },
  noticeText: { color: colors.bone, fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: colors.charcoal, borderRadius: RADIUS, padding: 14 },
});

export const shared = StyleSheet.create({
  screen: { backgroundColor: colors.char, flex: 1, paddingHorizontal: 20 },
  title: { color: colors.bone, fontSize: 28, fontWeight: "800", letterSpacing: -0.8 },
  body: { color: colors.boneMuted, fontSize: 14, lineHeight: 21 },
  fine: { color: colors.boneLabel, fontSize: 11, lineHeight: 16 },
  row: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
});
