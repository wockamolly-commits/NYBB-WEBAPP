import { useEffect, useState } from "react";
import {
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
import { RADIUS, TAP_TARGET, colors } from "../theme";
import { Button, Label, Notice, shared } from "../ui";

/**
 * Email, then a six-digit code.
 *
 * WHY SIGNING IN IS OPTIONAL AND SAYS SO.
 * ================================================================
 * A guest can order. That is a deliberate property of this product, recorded in
 * spec section 17, and a sign-in screen that blocks the menu would quietly
 * reverse it. So this screen is reachable rather than imposed, it names what an
 * account is actually for, and "Not now" is a real way out rather than a link in
 * grey text at the bottom.
 *
 * WHY THE CODE STEP KEEPS THE ADDRESS ON SCREEN AND EDITABLE.
 * ================================================================
 * The commonest reason a code never arrives is that it went to a typo. A screen
 * that only says "check your email" leaves the customer waiting on a message
 * that cannot come, so the address stays visible and "Use a different address"
 * goes back a step rather than restarting the app.
 */
export function SignInScreen({
  step,
  email,
  code,
  busy,
  error,
  notice,
  resendAvailableAt,
  onEmailChange,
  onCodeChange,
  onRequestCode,
  onVerifyCode,
  onUseAnotherAddress,
  onDismiss,
}: {
  step: "email" | "code";
  email: string;
  code: string;
  busy: boolean;
  error: MobileError | null;
  notice: string | null;
  resendAvailableAt: number | null;
  onEmailChange: (email: string) => void;
  onCodeChange: (code: string) => void;
  onRequestCode: () => void;
  onVerifyCode: () => void;
  onUseAnotherAddress: () => void;
  onDismiss: () => void;
}) {
  const resendIn = useCountdown(resendAvailableAt);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.flex}
    >
      <View style={shared.screen}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Close sign in"
            accessibilityRole="button"
            onPress={onDismiss}
            style={styles.back}
          >
            <Text style={styles.backText}>NOT NOW</Text>
          </Pressable>
          <Text style={shared.title}>Sign in</Text>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={[shared.body, styles.intro]}>
            An account keeps your pickup details and your past orders. You can order without one.
          </Text>

          {error ? (
            <View style={styles.block}>
              <Notice tone="alert">{error.message}</Notice>
            </View>
          ) : notice ? (
            <View style={styles.block}>
              <Notice tone="good">{notice}</Notice>
            </View>
          ) : null}

          {step === "email" ? (
            <View style={styles.block}>
              <Label>Email</Label>
              <TextInput
                accessibilityLabel="Email address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                autoFocus
                keyboardType="email-address"
                onChangeText={onEmailChange}
                onSubmitEditing={onRequestCode}
                placeholder="you@example.com"
                placeholderTextColor={colors.boneLabel}
                returnKeyType="send"
                style={[styles.input, error?.field === "email" && styles.inputInvalid]}
                value={email}
              />
              <Text style={[shared.fine, styles.hint]}>
                We send a six-digit code. There is no password to remember.
              </Text>
            </View>
          ) : (
            <View style={styles.block}>
              <Label>Six-digit code</Label>
              <TextInput
                accessibilityLabel="Six-digit sign-in code"
                autoComplete="one-time-code"
                autoFocus
                keyboardType="number-pad"
                maxLength={6}
                onChangeText={(next) => onCodeChange(next.replace(/[^0-9]/g, ""))}
                onSubmitEditing={onVerifyCode}
                placeholder="000000"
                placeholderTextColor={colors.boneLabel}
                returnKeyType="go"
                style={[styles.input, styles.inputCode, error?.field === "code" && styles.inputInvalid]}
                textContentType="oneTimeCode"
                value={code}
              />
              <Text style={[shared.fine, styles.hint]}>
                Sent to {email}. It is good for about ten minutes.
              </Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {step === "email" ? (
            <Button
              busy={busy}
              disabled={email.trim().length === 0}
              label="SEND ME A CODE"
              onPress={onRequestCode}
            />
          ) : (
            <>
              <Button
                busy={busy}
                disabled={code.length !== 6}
                label="SIGN IN"
                onPress={onVerifyCode}
              />
              <Button
                disabled={busy || resendIn > 0}
                label={resendIn > 0 ? `SEND ANOTHER CODE IN ${resendIn}S` : "SEND ANOTHER CODE"}
                onPress={onRequestCode}
                tone="secondary"
              />
              <Button
                disabled={busy}
                label="USE A DIFFERENT ADDRESS"
                onPress={onUseAnotherAddress}
                tone="quiet"
              />
            </>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * Seconds until a resend is allowed, ticking down.
 *
 * The deadline comes from the server rather than from a constant here, because
 * the server is the thing that will refuse the request. A hardcoded sixty
 * seconds that drifts from the real limit produces a button that is enabled and
 * then fails, which is worse than one that is honestly disabled.
 */
function useCountdown(deadline: number | null): number {
  const [now, setNow] = useState(() => Date.now());

  // What ticks is the clock, and the remaining seconds are derived from it
  // during render. Storing `remaining` instead would need an effect to correct
  // it whenever the deadline changed, and setting state in an effect body is
  // both a cascading render and the thing the React compiler lint refuses.
  useEffect(() => {
    if (deadline === null) return;

    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= deadline) clearInterval(timer);
    }, 1000);

    return () => clearInterval(timer);
  }, [deadline]);

  if (deadline === null) return 0;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { alignItems: "center", flexDirection: "row", gap: 14, paddingBottom: 14, paddingTop: 12 },
  back: { justifyContent: "center", minHeight: TAP_TARGET },
  backText: { color: colors.buffaloOrangeLit, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  body: { paddingBottom: 24 },
  intro: { marginBottom: 20 },
  block: { marginBottom: 18 },
  hint: { marginTop: 10 },
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
  inputCode: { fontSize: 24, fontWeight: "800", letterSpacing: 8, textAlign: "center" },
  inputInvalid: { borderColor: colors.buffaloRed },
  footer: {
    borderTopColor: colors.graphite,
    borderTopWidth: 1,
    gap: 10,
    paddingBottom: 20,
    paddingTop: 14,
  },
});
