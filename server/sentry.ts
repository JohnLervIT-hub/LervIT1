import * as Sentry from '@sentry/node';
import { logger } from './logger';

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  
  if (!dsn) {
    logger.warn({ event: 'sentry' }, 'SENTRY_DSN not configured - error monitoring disabled');
    return;
  }
  
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    integrations: [],
  });
  
  logger.info({ event: 'sentry' }, 'Sentry error monitoring initialized');
}

export function captureException(error: Error | unknown, context?: {
  flow?: 'payment' | 'booking' | 'notification' | 'vision_engine' | 'auth';
  userId?: string;
  bookingId?: string;
  extra?: Record<string, unknown>;
}) {
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

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', context?: {
  flow?: string;
  extra?: Record<string, unknown>;
}) {
  Sentry.captureMessage(message, {
    level,
    tags: { flow: context?.flow || 'general' },
    extra: context?.extra,
  });
}

export { Sentry };
