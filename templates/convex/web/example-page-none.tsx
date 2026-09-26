"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "{convexApiImport}";

export default function ExamplePage() {
  const tasks = useQuery(api.tasks.list);
  const add = useMutation(api.tasks.add);
  const setCompleted = useMutation(api.tasks.setCompleted);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    <main style={{ maxWidth: 640, margin: "2rem auto", padding: 16 }}>
      <Link href="/">Home</Link>
      <h1>Convex task example</h1>
      <p>This list is shared with everyone using this unauthenticated app.</p>
      <form onSubmit={submit}>
        <input aria-label="New task" maxLength={200} value={text} onChange={(event) => setText(event.target.value)} />
        <button type="submit">Add task</button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {tasks === undefined ? <p>Loading tasks…</p> : (
        <ul>
          {tasks.map((task) => (
            <li key={task._id}>
              <label>
                <input type="checkbox" checked={task.completed} onChange={(event) => {
                  void setCompleted({ id: task._id, completed: event.target.checked }).catch((cause: unknown) => {
                    setError(cause instanceof Error ? cause.message : "Could not update the task.");
                  });
                }} />
                {task.text}
              </label>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
