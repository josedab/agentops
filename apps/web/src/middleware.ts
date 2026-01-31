// Clerk Authentication Middleware
// Uncomment when NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY are set

// import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
//
// // Define protected routes
// const isProtectedRoute = createRouteMatcher([
//   '/dashboard(.*)',
//   '/api/trpc(.*)',
// ]);
//
// // Define public routes
// const isPublicRoute = createRouteMatcher([
//   '/',
//   '/sign-in(.*)',
//   '/sign-up(.*)',
//   '/api/webhook(.*)',
//   '/api/ingest(.*)',
// ]);
//
// export default clerkMiddleware(async (auth, req) => {
//   if (isProtectedRoute(req)) {
//     await auth.protect();
//   }
// });
//
// export const config = {
//   matcher: [
//     // Skip Next.js internals and static files
//     '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
//     // Always run for API routes
//     '/(api|trpc)(.*)',
//   ],
// };

// Placeholder middleware - replace with Clerk middleware above when ready
export default function middleware() {
  // No-op middleware for development
}

export const config = {
  matcher: [],
};
