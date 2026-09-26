import { useState } from "react";
import { useHostedAuth } from "@clerk/expo/hosted-auth";
import { Link, useRouter } from "expo-router";
import { Button, ScrollView, Text } from "react-native";

/** Clerk's hosted flow works in Expo Go and development builds. */
export default function SignInPage() {
  const { startHostedAuth } = useHostedAuth();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    setError("");
    try {
      await startHostedAuth({ mode: "sign-in" });
      router.replace("/example");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
      <Link href="/example">Back to tasks</Link>
      <Text style={{ fontSize: 24, fontWeight: "bold" }}>Sign in</Text>
      <Text>Sign in with your Clerk account to use your task list.</Text>
      {error ? <Text accessibilityRole="alert">{error}</Text> : null}
      <Button title="Sign in with Clerk" disabled={busy} onPress={() => void signIn()} />
    </ScrollView>
  );
}