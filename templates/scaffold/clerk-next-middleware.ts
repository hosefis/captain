import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)"]);

/** Protects application routes while allowing sign-in and public entry points. */
export default clerkMiddleware(async (authentication, request) => {
  if (!isPublicRoute(request)) {
    await authentication.protect();
  }
});

/** Public route matching configuration for Clerk middleware. */
export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico)).*)"],
};
