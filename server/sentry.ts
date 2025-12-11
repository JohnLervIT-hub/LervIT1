import * as Sentry from '@sentry/node';
import { logger } from './logger';
import type { Express } from 'express';

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    logger.warn({ event: 'sentry' }, 'SENTRY_DSN not configured - error monitoring disabled');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  });

  logger.info({ event: 'sentry' }, 'Sentry error monitoring initialized');
}

/**
 * Request + tracing middleware (needed for spans / performance dashboards)
 * Must be registered BEFORE routes.
 */
export function setupSentryRequestHandlers(app: Express) {
  if (!process.env.SENTRY_DSN) return;

  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}

/**
 * Error handler (must be AFTER routes, BEFORE my custom error handler)
 */
export function setupSentryErrorHandler(app: Express) {
  if (!process.env.SENTRY_DSN) return;

  app.use(Sentry.Handlers.errorHandler());
}

/**
 * Helper for logging backend exceptions with context (payment, booking, etc.)
 */
export function captureException(
  error: Error | unknown,
  context?: {
    flow?: 'payment' | 'booking' | 'notification' | 'vision_engine' | 'auth' | 'general';
    userId?: string;
    bookingId?: string;
    extra?: Record<string, unknown>;
  },
) {
  const errorObj = error instanceof Error ? error : new Error(String(error));

  Sentry.captureException(errorObj, {
    tags: {
      flow: context?.flow || 'unknown',
      ...(context?.userId && { userId: context.userId }),
      ...(context?.bookingId && { bookingId: context.bookingId }),
    },
    extra: context?.extra,
  });
}

export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
  extra?: Record<string, unknown>,
) {
  Sentry.captureMessage(message, {
    level,
    extra,
  });
}

export { Sentry };
