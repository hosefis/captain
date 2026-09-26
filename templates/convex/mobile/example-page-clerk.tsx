import { useState } from "react";
import { Link } from "expo-router";
import { Button, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from "convex/react";
import { api } from "{convexApiImport}";

function Tasks() {
  const tasks = useQuery(api.tasks.list);
  const add = useMutation(api.tasks.add);
  const setCompleted = useMutation(api.tasks.setCompleted);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    const value = text.trim();
    if (!value) return;
    try {
      await add({ text: value });
      setText("");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add the task.");
    }
  }

  return (
    <>
      <TextInput accessibilityLabel="New task" maxLength={200} value={text} onChangeText={setText} placeholder="New task" style={{ borderWidth: 1, padding: 8 }} />
      <Button title="Add task" onPress={() => void submit()} />
      {error ? <Text accessibilityRole="alert">{error}</Text> : null}
      {tasks === undefined ? <Text>Loading tasks…</Text> : tasks.map((task) => (
        <View key={task._id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Switch accessibilityLabel={`Complete ${task.text}`} value={task.completed} onValueChange={(completed) => {
            void setCompleted({ id: task._id, completed }).catch((cause: unknown) => {
              setError(cause instanceof Error ? cause.message : "Could not update the task.");
            });
          }} />
          <Text>{task.text}</Text>
        </View>
      ))}
    </>
  );
}

export default function ExamplePage() {
  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
      <Link href="/">Home</Link>
      <Text style={{ fontSize: 24, fontWeight: "bold" }}>Convex task example</Text>
      <Text>Only you can see and change your tasks.</Text>
      <AuthLoading><Text>Checking sign-in…</Text></AuthLoading>
      <Unauthenticated><Link href="/sign-in">Sign in with Clerk to use your task list</Link></Unauthenticated>
      <Authenticated><Tasks /></Authenticated>
    </ScrollView>
  );
}
