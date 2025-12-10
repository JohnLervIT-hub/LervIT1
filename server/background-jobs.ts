import cron from 'node-cron';
import { db } from './db';
import { bookings, jobNotifications } from '@shared/schema';
import { eq, lt, and, inArray } from 'drizzle-orm';
import { logEvent, logger } from './logger';

const NOTIFICATION_EXPIRY_MINUTES = 10;
const PENDING_PAYMENT_TIMEOUT_MINUTES = 30;

export function initBackgroundJobs() {
  logger.info({ event: 'background_jobs', action: 'init' }, 'Initializing background jobs');

  cron.schedule('*/5 * * * *', async () => {
    await expireOldNotifications();
  });

  cron.schedule('*/5 * * * *', async () => {
    await expireStaleBookings();
  });

  cron.schedule('0 3 * * *', async () => {
    await dailyCleanup();
  });

  logger.info({ event: 'background_jobs', action: 'started' }, 'Background jobs started');
}

async function expireOldNotifications() {
  try {
    const now = new Date();
    
    const expiredNotifications = await db
      .update(jobNotifications)
      .set({ status: 'expired' })
      .where(
        and(
          eq(jobNotifications.status, 'pending'),
          lt(jobNotifications.expiresAt, now)
        )
      )
      .returning({ id: jobNotifications.id });
    
    const count = expiredNotifications.length;
    
    if (count > 0) {
      logEvent.cleanup('expire_notifications', { expiredNotifications: count });
    }
    
    return count;
  } catch (error) {
    logEvent.error('expireOldNotifications', error);
    return 0;
  }
}

async function expireStaleBookings() {
  try {
    const cutoffTime = new Date(Date.now() - PENDING_PAYMENT_TIMEOUT_MINUTES * 60 * 1000);
    
    const staleBookings = await db
      .update(bookings)
      .set({ 
        status: 'payment_failed',
        paymentStatus: 'failed'
      })
      .where(
        and(
          eq(bookings.status, 'pending_payment'),
          lt(bookings.createdAt, cutoffTime)
        )
      )
      .returning({ id: bookings.id });
    
    const count = staleBookings.length;
    
    if (count > 0) {
      logEvent.cleanup('expire_stale_bookings', { staleBookings: count });
    }
    
    return count;
  } catch (error) {
    logEvent.error('expireStaleBookings', error);
    return 0;
  }
}

async function dailyCleanup() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const oldExpiredNotifications = await db
      .delete(jobNotifications)
      .where(
        and(
          inArray(jobNotifications.status, ['expired', 'declined']),
          lt(jobNotifications.notifiedAt, thirtyDaysAgo)
        )
      )
      .returning({ id: jobNotifications.id });
    
    logEvent.cleanup('daily_cleanup', { 
      expiredNotifications: oldExpiredNotifications.length 
    });
    
  } catch (error) {
    logEvent.error('dailyCleanup', error);
  }
}

export async function runManualCleanup() {
  const expiredNotifs = await expireOldNotifications();
  const staleBooks = await expireStaleBookings();
  
  return {
    expiredNotifications: expiredNotifs,
    staleBookings: staleBooks,
    timestamp: new Date().toISOString(),
  };
}
