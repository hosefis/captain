import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";

/** Lists tasks shared by everyone using the application. */
export const list = query({
  args: {},
  handler: async (context) => context.db.query("tasks").order("desc").collect(),
});

/** Creates a shared task after validating its text. */
export const add = mutation({
  args: { text: v.string() },
  handler: async (context, taskInput) => {
    const text = taskInput.text.trim();
    if (!text || text.length > 200) {
      throw new Error("Task text must be between 1 and 200 characters.");
    }
    return context.db.insert("tasks", { text, completed: false });
  },
});

/** Changes completion state for an existing shared task. */
export const setCompleted = mutation({
  args: { id: v.id("tasks"), completed: v.boolean() },
  handler: async (context, taskInput) => {
    const task = await context.db.get(taskInput.id);
    if (!task) throw new Error("Task not found.");
    await context.db.patch(taskInput.id, { completed: taskInput.completed });
  },
});
