import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { TAP_TARGET, colors } from "../theme";
import { Button, Label, Notice, shared } from "../ui";

/**
 * What being signed in currently means, said plainly.
 *
 * The account exists and orders are attributed to it, but the history and
 * profile endpoints are a later slice, so this screen does not pretend to be a
 * dashboard with nothing in it. It names the address, says what the account is
 * doing right now, and offers the way out. When history lands it goes here.
 */
export function AccountScreen({
  email,
  onSignOut,
  onDismiss,
}: {
  email: string | null;
  onSignOut: () => void;
  onDismiss: () => void;
}) {
  return (
    <View style={shared.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back to the menu"
          accessibilityRole="button"
          onPress={onDismiss}
          style={styles.back}
        >
          <Text style={styles.backText}>MENU</Text>
        </Pressable>
        <Text style={shared.title}>Account</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.block}>
          <Label>Signed in as</Label>
          <Text style={styles.email}>{email ?? "your NYBB account"}</Text>
        </View>

        <View style={styles.block}>
          <Notice>
            Orders you place from now on are attached to this account. Past orders and saved pickup
            details are not in the app yet.
          </Notice>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button label="SIGN OUT" onPress={onSignOut} tone="danger" />
        <Text style={shared.fine}>
          Signing out removes the account from this phone. An order you are already tracking stays
          on screen.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", flexDirection: "row", gap: 14, paddingBottom: 14, paddingTop: 12 },
  back: { justifyContent: "center", minHeight: TAP_TARGET },
  backText: { color: colors.buffaloOrangeLit, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  body: { paddingBottom: 24 },
  block: { marginBottom: 18 },
  email: { color: colors.bone, fontSize: 17, fontWeight: "700", marginTop: 8 },
  footer: {
    borderTopColor: colors.graphite,
    borderTopWidth: 1,
    gap: 10,
    paddingBottom: 20,
    paddingTop: 14,
  },
});
