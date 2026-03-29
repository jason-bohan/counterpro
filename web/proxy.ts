import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isProtectedRoute = createRouteMatcher(['/dashboard(.*)', '/deal(.*)', '/negotiate(.*)', '/admin(.*)'])
const isPublicApi = createRouteMatcher(['/api/stripe/(.*)', '/api/webhooks/(.*)', '/api/cron/(.*)'])

export default clerkMiddleware(async (auth, req) => {
  if (isPublicApi(req)) return // skip Clerk for webhooks, cron, and Stripe
  if (isProtectedRoute(req)) await auth.protect()
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
