import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: isProduction ? undefined : {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
  base: {
    env: process.env.NODE_ENV || 'development',
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
});

export function createRequestLogger(requestId?: string) {
  return logger.child({ requestId: requestId || crypto.randomUUID().slice(0, 8) });
}

export const logEvent = {
  payment: (action: string, data: { userId?: string; bookingId?: string; amount?: string; status?: string; error?: string }) => {
    logger.info({ event: 'payment', action, ...data }, `Payment: ${action}`);
  },
  
  booking: (action: string, data: { userId?: string; bookingId?: string; status?: string; moverId?: string; error?: string }) => {
    logger.info({ event: 'booking', action, ...data }, `Booking: ${action}`);
  },
  
  notification: (action: string, data: { bookingId?: string; moverId?: string; count?: number; error?: string }) => {
    logger.info({ event: 'notification', action, ...data }, `Notification: ${action}`);
  },
  
  matching: (action: string, data: { bookingId?: string; vehicleType?: string; moversFound?: number; error?: string }) => {
    logger.info({ event: 'matching', action, ...data }, `Matching: ${action}`);
  },
  
  cleanup: (action: string, data: { expiredNotifications?: number; staleBookings?: number; error?: string }) => {
    logger.info({ event: 'cleanup', action, ...data }, `Cleanup: ${action}`);
  },
  
  auth: (action: string, data: { userId?: string; email?: string; error?: string }) => {
    logger.info({ event: 'auth', action, ...data }, `Auth: ${action}`);
  },
  
  error: (context: string, error: Error | unknown, data?: Record<string, unknown>) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error({ event: 'error', context, error: errorMessage, stack: errorStack, ...data }, `Error in ${context}: ${errorMessage}`);
  },
};

export default logger;
