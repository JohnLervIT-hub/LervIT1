import cron from 'node-cron';
import { db } from './db';
import { bookings, jobNotifications, users, BOOKING_STATUSES } from '@shared/schema';
import { eq, lt, and, inArray, gte, isNotNull } from 'drizzle-orm';
import { logEvent, logger } from './logger';
import { notificationService } from './notifications';
import { stripe } from './config/stripe';

const NOTIFICATION_EXPIRY_MINUTES = 10;
const PENDING_PAYMENT_TIMEOUT_MINUTES = 120; // 2 hours for customers to complete payment
const PAYMENT_REMINDER_MINUTES = 15; // Send reminder 15 mins before expiry

// Track sent reminders in memory (simple approach for MVP)
const sentReminders = new Set<string>();

export function initBackgroundJobs() {
  logger.info({ event: 'background_jobs', action: 'init' }, 'Initializing background jobs');

  cron.schedule('*/5 * * * *', async () => {
    await expireOldNotifications();
  });

  cron.schedule('*/5 * * * *', async () => {
    await expireStaleBookings();
  });
  
  // Send payment reminders every 2 minutes
  cron.schedule('*/2 * * * *', async () => {
    await sendPaymentReminders();
  });
  
  // Detect and recover orphaned payments every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    await recoverOrphanedPayments();
  });

  cron.schedule('0 3 * * *', async () => {
    await dailyCleanup();
  });
  
  // Expire past scheduled job notifications every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    await expirePastScheduledJobs();
  });
  
  // Auto-complete past-dated paid bookings every hour (enables reviews)
  cron.schedule('0 * * * *', async () => {
    await autoCompletePastPaidBookings();
  });
  
  // Auto-cancel unpaid past-dated bookings every hour (clears mover dashboards)
  cron.schedule('5 * * * *', async () => {
    await cancelPastDatedBookings();
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
    
    // First, get stale bookings WITHOUT updating them
    const staleBookingCandidates = await db
      .select({
        id: bookings.id,
        stripePaymentIntentId: bookings.stripePaymentIntentId,
        customerId: bookings.customerId,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.status, 'pending_payment'),
          lt(bookings.createdAt, cutoffTime)
        )
      );
    
    let expiredCount = 0;
    let recoveredCount = 0;
    
    for (const booking of staleBookingCandidates) {
      // CRITICAL SAFETY CHECK: Before expiring, verify with Stripe that payment hasn't succeeded
      if (booking.stripePaymentIntentId) {
        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
          
          if (paymentIntent.status === 'succeeded') {
            // Payment ACTUALLY SUCCEEDED - recover it instead of expiring!
            // Use PENDING status (awaiting mover matching) - correct per booking state machine
            // Note: Email is NOT sent here to avoid duplicates - recoverOrphanedPayments handles that
            await db
              .update(bookings)
              .set({
                status: BOOKING_STATUSES.PENDING,
                paymentStatus: 'succeeded',
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(bookings.id, booking.id),
                  eq(bookings.paymentStatus, 'pending') // Only update if not already succeeded
                )
              );
            
            recoveredCount++;
            
            logEvent.payment('stale_booking_recovered', {
              bookingId: booking.id,
              paymentIntentId: booking.stripePaymentIntentId,
              reason: 'payment_succeeded_before_expiry',
            });
            
            continue; // Don't expire this booking
          }
        } catch (stripeErr) {
          // Stripe error - safe to expire (payment likely doesn't exist or failed)
          logEvent.error('stale_booking_stripe_check', stripeErr, { bookingId: booking.id });
        }
      }
      
      // No successful payment found - safe to expire
      await db
        .update(bookings)
        .set({ 
          status: 'payment_failed',
          paymentStatus: 'failed'
        })
        .where(eq(bookings.id, booking.id));
      
      expiredCount++;
    }
    
    if (expiredCount > 0 || recoveredCount > 0) {
      logEvent.cleanup('expire_stale_bookings', { 
        expiredBookings: expiredCount,
        recoveredBookings: recoveredCount,
      });
    }
    
    return expiredCount;
  } catch (error) {
    logEvent.error('expireStaleBookings', error);
    return 0;
  }
}

// Send payment reminders 15 minutes before booking expires
async function sendPaymentReminders() {
  try {
    // Bookings expire at PENDING_PAYMENT_TIMEOUT_MINUTES (120) after creation
    // We want to remind 15 minutes before expiry, so at (120 - 15) = 105 minutes after creation
    // Window: bookings created between 105 and 107 minutes ago (2-minute tolerance for cron drift)
    const reminderAgeMinutes = PENDING_PAYMENT_TIMEOUT_MINUTES - PAYMENT_REMINDER_MINUTES; // 105 minutes
    const toleranceMinutes = 2;
    
    const reminderWindowStart = new Date(Date.now() - (reminderAgeMinutes + toleranceMinutes) * 60 * 1000); // 107 mins ago
    const reminderWindowEnd = new Date(Date.now() - reminderAgeMinutes * 60 * 1000); // 105 mins ago
    
    // Get pending_payment bookings created in the reminder window
    const bookingsNeedingReminder = await db
      .select({
        id: bookings.id,
        customerId: bookings.customerId,
        pickupAddress: bookings.pickupAddress,
        dropoffAddress: bookings.dropoffAddress,
        price: bookings.price,
        createdAt: bookings.createdAt,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.status, 'pending_payment'),
          gte(bookings.createdAt, reminderWindowStart),
          lt(bookings.createdAt, reminderWindowEnd)
        )
      );
    
    let remindersSent = 0;
    
    for (const booking of bookingsNeedingReminder) {
      // Skip if we've already sent a reminder for this booking
      if (sentReminders.has(booking.id)) {
        continue;
      }
      
      // Get customer details
      const [customer] = await db
        .select()
        .from(users)
        .where(eq(users.id, booking.customerId));
      
      if (customer) {
        try {
          await notificationService.sendPaymentReminder(customer, {
            id: booking.id,
            pickupAddress: booking.pickupAddress,
            dropoffAddress: booking.dropoffAddress,
            price: booking.price,
          });
          
          // Mark as sent so we don't send again
          sentReminders.add(booking.id);
          remindersSent++;
          
          logger.info({ 
            event: 'payment_reminder', 
            bookingId: booking.id, 
            customerId: customer.id 
          }, 'Payment reminder sent');
        } catch (err) {
          logEvent.error('sendPaymentReminder', err);
        }
      }
    }
    
    if (remindersSent > 0) {
      logEvent.cleanup('payment_reminders', { remindersSent });
    }
    
    // Clean up old reminder records if too many accumulate
    if (sentReminders.size > 1000) {
      sentReminders.clear();
    }
    
    return remindersSent;
  } catch (error) {
    logEvent.error('sendPaymentReminders', error);
    return 0;
  }
}

// Detect bookings with successful Stripe payments but not updated in database
async function recoverOrphanedPayments() {
  try {
    // Find bookings that have payment intent but status is still pending_payment
    // These might have been paid but webhook failed
    const potentialOrphans = await db
      .select({
        id: bookings.id,
        customerId: bookings.customerId,
        stripePaymentIntentId: bookings.stripePaymentIntentId,
        status: bookings.status,
        paymentStatus: bookings.paymentStatus,
        createdAt: bookings.createdAt,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.status, 'pending_payment'),
          isNotNull(bookings.stripePaymentIntentId)
        )
      )
      .limit(50); // Process in batches
    
    let recovered = 0;
    
    for (const booking of potentialOrphans) {
      if (!booking.stripePaymentIntentId) continue;
      
      try {
        // Check Stripe for actual payment status
        const paymentIntent = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
        
        if (paymentIntent.status === 'succeeded') {
          // Payment was successful but booking wasn't updated - recover it!
          // Use PENDING status (awaiting mover matching) - this is correct per booking state machine
          const [updatedBooking] = await db
            .update(bookings)
            .set({
              status: BOOKING_STATUSES.PENDING,
              paymentStatus: 'succeeded',
              updatedAt: new Date(),
            })
            .where(eq(bookings.id, booking.id))
            .returning();
          
          recovered++;
          
          logEvent.payment('orphan_recovered', {
            bookingId: booking.id,
            paymentIntentId: booking.stripePaymentIntentId,
            customerId: booking.customerId,
          });
          
          // Notify customer that their booking is now confirmed
          // Use updated booking object for correct status in email
          const [customer] = await db
            .select()
            .from(users)
            .where(eq(users.id, booking.customerId));
          
          if (customer && updatedBooking) {
            try {
              await notificationService.sendBookingConfirmation(customer, updatedBooking);
            } catch (emailErr) {
              logEvent.error('orphan_recovery_email', emailErr);
            }
          }
        }
      } catch (stripeErr) {
        // Payment intent might not exist or other Stripe error - skip
        logEvent.error('orphan_check_stripe', stripeErr, { bookingId: booking.id });
      }
    }
    
    if (recovered > 0) {
      logEvent.cleanup('orphan_payments_recovered', { recovered });
      logger.info({ event: 'orphan_recovery', recovered }, `Recovered ${recovered} orphaned payments`);
    }
    
    return recovered;
  } catch (error) {
    logEvent.error('recoverOrphanedPayments', error);
    return 0;
  }
}

// Expire job notifications for bookings with past scheduled dates
async function expirePastScheduledJobs() {
  try {
    const now = new Date();
    // Add a grace period of 2 hours after scheduled time
    const gracePeriodMs = 2 * 60 * 60 * 1000;
    const cutoffTime = new Date(now.getTime() - gracePeriodMs);
    
    // Find pending job notifications for bookings with past scheduled dates
    const pastJobNotifications = await db
      .select({
        notificationId: jobNotifications.id,
        bookingId: jobNotifications.bookingId,
        preferredDate: bookings.preferredDate,
      })
      .from(jobNotifications)
      .innerJoin(bookings, eq(jobNotifications.bookingId, bookings.id))
      .where(
        and(
          eq(jobNotifications.status, 'pending'),
          lt(bookings.preferredDate, cutoffTime)
        )
      );
    
    if (pastJobNotifications.length === 0) {
      return 0;
    }
    
    const notificationIds = pastJobNotifications.map(n => n.notificationId);
    
    // Expire these notifications
    await db
      .update(jobNotifications)
      .set({ status: 'expired' })
      .where(inArray(jobNotifications.id, notificationIds));
    
    logEvent.cleanup('expire_past_scheduled_jobs', { 
      expiredCount: notificationIds.length 
    });
    
    return notificationIds.length;
  } catch (error) {
    logEvent.error('expirePastScheduledJobs', error);
    return 0;
  }
}

// Auto-complete past-dated bookings that were paid
// This enables customers to leave reviews for completed moves
async function autoCompletePastPaidBookings() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    
    // Find paid bookings that are past-dated and still in active states
    const paidStatuses = ['paid', 'succeeded'];
    const activeStatuses = ['confirmed', 'en_route_to_pickup', 'loading', 'en_route_to_dropoff', 'unloading', 'in_transit'];
    
    const completedBookings = await db
      .update(bookings)
      .set({ 
        status: 'completed',
        updatedAt: new Date(),
      })
      .where(
        and(
          inArray(bookings.status, activeStatuses),
          inArray(bookings.paymentStatus, paidStatuses),
          lt(bookings.preferredDate, today)
        )
      )
      .returning({ id: bookings.id, preferredDate: bookings.preferredDate, status: bookings.status });
    
    if (completedBookings.length > 0) {
      logEvent.cleanup('auto_complete_paid_bookings', { 
        completedCount: completedBookings.length,
        bookingIds: completedBookings.map(b => b.id),
      });
      
      logger.info({ 
        event: 'auto_complete_paid_bookings', 
        count: completedBookings.length 
      }, `Auto-completed ${completedBookings.length} past-dated paid bookings`);
    }
    
    return completedBookings.length;
  } catch (error) {
    logEvent.error('autoCompletePastPaidBookings', error);
    return 0;
  }
}

// Auto-cancel bookings with past dates that weren't completed
// This clears them from all mover dashboards in production
async function cancelPastDatedBookings() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    
    // All statuses that should be auto-cancelled if past-dated
    // Includes pending, confirmed, payment states, AND in-progress move states
    const activeStatuses = [
      'pending', 
      'confirmed', 
      'pending_payment',
      'en_route_to_pickup',
      'loading',
      'en_route_to_dropoff',
      'unloading',
      'in_transit'
    ];
    
    const pastBookings = await db
      .update(bookings)
      .set({ 
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(
        and(
          inArray(bookings.status, activeStatuses),
          lt(bookings.preferredDate, today)
        )
      )
      .returning({ id: bookings.id, preferredDate: bookings.preferredDate, status: bookings.status });
    
    if (pastBookings.length > 0) {
      logEvent.cleanup('cancel_past_dated_bookings', { 
        cancelledCount: pastBookings.length,
        bookingIds: pastBookings.map(b => b.id),
        statuses: pastBookings.map(b => b.status),
      });
      
      logger.info({ 
        event: 'past_dated_cleanup', 
        count: pastBookings.length 
      }, `Auto-cancelled ${pastBookings.length} past-dated bookings`);
    }
    
    return pastBookings.length;
  } catch (error) {
    logEvent.error('cancelPastDatedBookings', error);
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
    
    // Also clean up old reminder tracking
    sentReminders.clear();
    
  } catch (error) {
    logEvent.error('dailyCleanup', error);
  }
}

export async function runManualCleanup() {
  const expiredNotifs = await expireOldNotifications();
  const staleBooks = await expireStaleBookings();
  const autoCompleted = await autoCompletePastPaidBookings();
  const pastDatedBooks = await cancelPastDatedBookings();
  
  return {
    expiredNotifications: expiredNotifs,
    staleBookings: staleBooks,
    autoCompletedBookings: autoCompleted,
    cancelledPastDatedBookings: pastDatedBooks,
    timestamp: new Date().toISOString(),
  };
}
