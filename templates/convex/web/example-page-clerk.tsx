"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { SignInButton, UserButton } from "@clerk/nextjs";
import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from "convex/react";
import { api } from "{convexApiImport}";

function Tasks() {
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
    <>
      <UserButton />
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
    </>
  );
}

export default function ExamplePage() {
  return (
    <main style={{ maxWidth: 640, margin: "2rem auto", padding: 16 }}>
      <Link href="/">Home</Link>
      <h1>Convex task example</h1>
      <p>Only you can see and change your tasks.</p>
      <AuthLoading><p>Checking sign-in…</p></AuthLoading>
      <Unauthenticated><SignInButton /></Unauthenticated>
      <Authenticated><Tasks /></Authenticated>
    </main>
  );
}
