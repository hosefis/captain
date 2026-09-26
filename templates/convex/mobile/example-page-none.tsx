import { useState } from "react";
import { Link } from "expo-router";
import { Button, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "{convexApiImport}";

export default function ExamplePage() {
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
    <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
      <Link href="/">Home</Link>
      <Text style={{ fontSize: 24, fontWeight: "bold" }}>Convex task example</Text>
      <Text>This list is shared with everyone using this unauthenticated app.</Text>
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
    </ScrollView>
  );
}
