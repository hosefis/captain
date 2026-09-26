import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";

// In an unauthenticated project, this list is shared by everyone using the app.
export const list = query({
  args: {},
  handler: async (ctx) => ctx.db.query("tasks").order("desc").collect(),
});

export const add = mutation({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    const text = args.text.trim();
    if (!text || text.length > 200) {
      throw new Error("Task text must be between 1 and 200 characters.");
    }
    return ctx.db.insert("tasks", { text, completed: false });
  },
});

export const setCompleted = mutation({
  args: { id: v.id("tasks"), completed: v.boolean() },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) throw new Error("Task not found.");
    await ctx.db.patch(args.id, { completed: args.completed });
  },
});
