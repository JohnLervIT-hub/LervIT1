/**
 * Sentry Frontend Error Monitoring & Performance Tracing
 * 
 * Uses Sentry v7 with BrowserTracing for:
 * - Automatic page load performance tracking
 * - Navigation span collection for route changes
 * - Error boundary integration
 * 
 * Note: Using wouter (not React Router), so we use basic BrowserTracing
 * without React Router-specific instrumentation.
 */
import * as Sentry from '@sentry/react';
import { BrowserTracing } from '@sentry/tracing';

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
      // Add current route to event tags for better transaction naming
      if (typeof window !== 'undefined') {
        event.tags = {
          ...event.tags,
          route: window.location.pathname,
        };
      }
      return event;
    },
  });
}

export { Sentry };
