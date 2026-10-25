import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/** Defines task storage and the indexes used by application queries. */
export default defineSchema({
  tasks: defineTable({
    text: v.string(),
    completed: v.boolean(),
  }),
});
