import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in to view your tasks.");
    return ctx.db
      .query("tasks")
      .withIndex("by_owner", (q) => q.eq("ownerId", identity.subject))
      .order("desc")
      .collect();
  },
});

export const add = mutation({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in to add a task.");
    const text = args.text.trim();
    if (!text || text.length > 200) {
      throw new Error("Task text must be between 1 and 200 characters.");
    }
    return ctx.db.insert("tasks", {
      text,
      completed: false,
      ownerId: identity.subject,
    });
  },
});

export const setCompleted = mutation({
  args: { id: v.id("tasks"), completed: v.boolean() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in to update a task.");
    const task = await ctx.db.get(args.id);
    if (!task || task.ownerId !== identity.subject) {
      throw new Error("Task not found.");
    }
    await ctx.db.patch(args.id, { completed: args.completed });
  },
});
