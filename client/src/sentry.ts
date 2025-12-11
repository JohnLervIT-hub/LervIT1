/**
 * Sentry Frontend Error Monitoring & Performance Tracing
 * 
 * Uses Sentry v7 with BrowserTracing for:
 * - Automatic page load performance tracking
 * - Navigation span collection for route changes
 * - Error boundary integration
 * - Meaningful transaction names for all routes
 * 
 * Note: Using wouter (not React Router), so we use basic BrowserTracing
 * without React Router-specific instrumentation.
 */
import * as Sentry from '@sentry/react';
import { BrowserTracing } from '@sentry/tracing';

// Route to meaningful transaction name mapping
const ROUTE_NAMES: Record<string, string> = {
  '/': 'Landing – Home',
  '/website': 'Landing – Marketing',
  '/login': 'Auth – Login',
  '/signup': 'Auth – Signup',
  '/forgot-password': 'Auth – Forgot Password',
  '/reset-password': 'Auth – Reset Password',
  '/browse-movers': 'Customer – Browse Movers',
  '/support': 'Support – Help Center',
  '/request-move': 'Booking Flow – Request Move',
  '/dashboard': 'Customer – Dashboard',
  '/my-bookings': 'Customer – My Bookings',
  '/profile': 'Customer – Profile',
  '/mover-dashboard': 'Mover – Dashboard',
  '/mover-profile-setup': 'Mover – Profile Setup',
  '/mover-profile': 'Mover – Profile',
  '/mover-verification': 'Mover – Verification',
  '/admin': 'Admin – Dashboard',
  '/admin/users': 'Admin – Users Management',
  '/admin/movers': 'Admin – Movers Management',
  '/admin/moves': 'Admin – Moves Management',
  '/admin/revenue': 'Admin – Revenue Analytics',
  '/admin/support': 'Admin – Support Dashboard',
  '/admin/verification': 'Admin – Verification Review',
  '/messages': 'Messaging – Chat',
};

// Dynamic route patterns
function getTransactionName(path: string): string {
  // Check static routes first
  if (ROUTE_NAMES[path]) {
    return ROUTE_NAMES[path];
  }
  
  // Handle dynamic routes
  if (path.startsWith('/payment/')) return 'Payment – Checkout';
  if (path.startsWith('/track-trip/')) return 'Customer – Track Trip';
  if (path.startsWith('/booking/')) return 'Booking – Details';
  if (path.startsWith('/mover/')) return 'Mover – Public Profile';
  if (path.startsWith('/review/')) return 'Review – Submit';
  if (path.startsWith('/messages/')) return 'Messaging – Conversation';
  
  // Fallback to path
  return `Page – ${path}`;
}

// Only initialize if DSN is provided
const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    integrations: [
      new BrowserTracing({
        // Trace all same-origin requests and specific domains
        tracePropagationTargets: [
          'localhost',
          'lervit.com',
          /^https:\/\/.*\.replit\.dev/,
          /^\//,  // All relative URLs
        ],
        // Transform route paths into meaningful transaction names
        beforeNavigate: (context) => {
          // context.name contains the URL path for the navigation
          // Extract pathname from context.name or fall back to window.location
          let path = window.location.pathname;
          if (context.name && context.name.startsWith('/')) {
            path = context.name;
          } else if (context.name) {
            try {
              const url = new URL(context.name, window.location.origin);
              path = url.pathname;
            } catch {
              // Keep window.location.pathname as fallback
            }
          }
          return {
            ...context,
            name: getTransactionName(path),
          };
        },
      }),
    ],
    // Full trace sampling in development, reduce in production
    tracesSampleRate: import.meta.env.MODE === 'production' ? 0.2 : 1.0,
    // Environment tagging
    environment: import.meta.env.MODE || 'development',
    // Release tracking (can be set via CI/CD)
    release: import.meta.env.VITE_APP_VERSION || undefined,
    // Ignore common non-actionable errors
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error exception captured',
    ],
    // Before sending hook for additional context
    beforeSend(event) {
      // Add current route to event tags for better categorization
      if (typeof window !== 'undefined') {
        const path = window.location.pathname;
        event.tags = {
          ...event.tags,
          route: path,
          transaction_name: getTransactionName(path),
        };
      }
      return event;
    },
  });
}

export { Sentry };
