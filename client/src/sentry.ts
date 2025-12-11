import * as Sentry from '@sentry/react';

const isProduction = import.meta.env.MODE === 'production';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [
    Sentry.browserTracingIntegration(),
  ],
  tracesSampleRate: isProduction ? 0.1 : 1.0,
  environment: import.meta.env.MODE || 'development',
  enabled: !!import.meta.env.VITE_SENTRY_DSN,
  beforeSend(event) {
    return event;
  },
});

export { Sentry };
