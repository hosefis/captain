import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";

/** Lists tasks visible to the current application user. */
export const list = query({
  args: {},
  handler: async (context) => {
    const identity = await context.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in to view your tasks.");
    return context.db
      .query("tasks")
      .withIndex("by_owner", (queryBuilder) => queryBuilder.eq("ownerId", identity.subject))
      .order("desc")
      .collect();
  },
});

/** Creates a task after validating its text and the current user. */
export const add = mutation({
  args: { text: v.string() },
  handler: async (context, taskInput) => {
    const identity = await context.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in to add a task.");
    const text = taskInput.text.trim();
    if (!text || text.length > 200) {
      throw new Error("Task text must be between 1 and 200 characters.");
    }
    return context.db.insert("tasks", {
      text,
      completed: false,
      ownerId: identity.subject,
    });
  },
});

/** Changes completion state after checking that the task is accessible. */
export const setCompleted = mutation({
  args: { id: v.id("tasks"), completed: v.boolean() },
  handler: async (context, taskInput) => {
    const identity = await context.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in to update a task.");
    const task = await context.db.get(taskInput.id);
    if (!task || task.ownerId !== identity.subject) {
      throw new Error("Task not found.");
    }
    await context.db.patch(taskInput.id, { completed: taskInput.completed });
  },
});
