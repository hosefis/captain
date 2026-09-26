/** Pass this as the third argument to `fetchQuery`, `fetchMutation`, `fetchAction`,
 * or `preloadQuery` from `convex/nextjs` in Server Components and Server Actions. */
export function convexServerOptions() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error("Set NEXT_PUBLIC_CONVEX_URL after running npx convex dev.");
  }
  return { url };
}
