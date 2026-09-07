import cron from 'node-cron';
import { db } from './db';
import { getBaseUrl } from './utils/urls';
import { bookings, jobNotifications, users, BOOKING_STATUSES, abandonedBookings, movers, moverStripeAccounts, businessEvents, kpiTargets, moverActivityLog, reviews, inAppNotifications } from '@shared/schema';
import { eq, lt, and, or, inArray, gte, isNotNull, isNull, lte, sql, desc } from 'drizzle-orm';
import { logEvent, logger } from './logger';
import { notificationService } from './notifications';
import { stripe } from './config/stripe';
import { moverWebSocket } from './websocket';
import { dispatchBooking, dispatchJobToMovers } from './dispatch';
import { emitEvent } from './events';

const NOTIFICATION_EXPIRY_MINUTES = 10;
const PENDING_PAYMENT_TIMEOUT_MINUTES = 120; // 2 hours for customers to complete payment
const PAYMENT_REMINDER_MINUTES = 15; // Send reminder 15 mins before expiry

// Max notifications across all waves (3 waves × 5 movers = 15).
// When this count is reached, no further auto re-dispatch is triggered.
const MAX_REDISPATCH_NOTIFICATIONS = 15;

// Track sent reminders in memory (simple approach for MVP)
const sentReminders = new Set<string>();

// Per-process mutex: prevents the same job from running twice within one process instance.
// Combined with atomic DB updates in each job, this also protects against duplicate
// emails when Replit briefly runs two instances during a rolling deploy.
const runningJobs = new Set<string>();

async function withJobLock<T>(jobName: string, fn: () => Promise<T>): Promise<T | null> {
  if (runningJobs.has(jobName)) {
    logger.warn({ event: 'job_skipped', jobName }, `Job ${jobName} already running, skipping tick`);
    return null;
  }
  runningJobs.add(jobName);
  try {
    return await fn();
  } finally {
    runningJobs.delete(jobName);
  }
}

let backgroundJobsStarted = false;

export function initBackgroundJobs() {
  if (backgroundJobsStarted) {
    logger.warn({ event: 'background_jobs', action: 'init_skipped' }, 'Background jobs already initialized in this process');
    return;
  }
  if (process.env.DISABLE_BACKGROUND_JOBS === '1') {
    logger.info({ event: 'background_jobs', action: 'init_disabled' }, 'Background jobs disabled via DISABLE_BACKGROUND_JOBS=1');
    return;
  }
  backgroundJobsStarted = true;

  logger.info({ event: 'background_jobs', action: 'init' }, 'Initializing background jobs');

  const TZ = { timezone: 'America/Edmonton' };

  // Merged into a single tick (was two separate */5 schedules competing for the DB)
  cron.schedule('*/5 * * * *', async () => {
    await withJobLock('expire_notifications', expireOldNotifications);
    await withJobLock('expire_stale_bookings', expireStaleBookings);
  }, TZ);

  // Offset by 1 min so it never fires at the same second as the */5 job above
  cron.schedule('1-59/2 * * * *', async () => {
    await withJobLock('payment_reminders', sendPaymentReminders);
  }, TZ);

  // Offset to minute :03 so it doesn't collide with the :00 batch
  cron.schedule('3,13,23,33,43,53 * * * *', async () => {
    await withJobLock('orphaned_payments', recoverOrphanedPayments);
  }, TZ);

  // 3 AM Calgary time (MDT = UTC-6, MST = UTC-7)
  cron.schedule('0 3 * * *', async () => {
    await withJobLock('daily_cleanup', dailyCleanup);
  }, TZ);

  // Offset to minute :07 to spread load
  cron.schedule('7,22,37,52 * * * *', async () => {
    await withJobLock('expire_past_jobs', expirePastScheduledJobs);
  }, TZ);

  // Offset to minute :02 (not :00) to avoid colliding with other hourly jobs
  cron.schedule('2 * * * *', async () => {
    await withJobLock('auto_complete_bookings', autoCompletePastPaidBookings);
  }, TZ);

  // Offset to minute :06 (not :05) for same reason
  cron.schedule('6 * * * *', async () => {
    await withJobLock('cancel_past_bookings', cancelPastDatedBookings);
  }, TZ);

  // Offset to minute :15 and :45 instead of :00 and :30
  cron.schedule('15,45 * * * *', async () => {
    await withJobLock('abandoned_reminders', sendAbandonedBookingReminders);
  }, TZ);

  // Every 6 hours at :10 Calgary time
  cron.schedule('10 */6 * * *', async () => {
    await withJobLock('stripe_onboarding_reminders', sendStripeOnboardingReminders);
  }, TZ);

  // 3 AM, 9 AM, 3 PM, 9 PM Calgary time
  cron.schedule('20 3,9,15,21 * * *', async () => {
    await withJobLock('profile_reminders', sendProfileCompletionReminders);
  }, TZ);

  // Daily 06:00 Calgary — snapshot yesterday's KPIs so APEX has a stable
  // brief to read at its 07:00 run.
  cron.schedule('0 6 * * *', async () => {
    await withJobLock('daily_kpi_snapshot', dailyKpiSnapshot);
  }, TZ);

  // Every 30 min — roll up per-mover activity for RETAIN inactivity detection.
  cron.schedule('*/30 * * * *', async () => {
    await withJobLock('mover_activity_rollup', moverActivityRollup);
  }, TZ);

  logger.info({ event: 'background_jobs', action: 'started' }, 'Background jobs started');

  // One-shot startup cleanup: catches any stale pending_payment / abandoned
  // notification rows that accumulated while the cron was not running (e.g.
  // when the worker was a separate un-deployed process). Safe to run every
  // boot — expireStaleBookings re-checks Stripe before flipping any row.
  setTimeout(() => {
    void withJobLock('expire_stale_bookings', expireStaleBookings);
    void withJobLock('expire_notifications', expireOldNotifications);
    void withJobLock('orphaned_payments', recoverOrphanedPayments);
  }, 5000);
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
      .returning({ id: jobNotifications.id, bookingId: jobNotifications.bookingId });
    
    const count = expiredNotifications.length;
    
    if (count > 0) {
      logEvent.cleanup('expire_notifications', { expiredNotifications: count });

      // Auto re-dispatch: check each affected booking and send a new wave
      // if all its notifications are now expired/declined and it's still pending.
      const affectedBookingIds = Array.from(new Set(expiredNotifications.map(n => n.bookingId)));
      await redispatchIfAllExpired(affectedBookingIds);
    }
    
    return count;
  } catch (error) {
    logEvent.error('expireOldNotifications', error);
    return 0;
  }
}

/**
 * For each booking that just had notifications expire, check whether:
 *   1. The booking is still in "pending" status (no mover accepted yet).
 *   2. All notifications for this booking are now non-pending (expired / declined).
 *   3. The total notification count hasn't hit the 3-wave cap (MAX_REDISPATCH_NOTIFICATIONS).
 * If all three are true, fire a fresh dispatch wave.
 * onConflictDoNothing in dispatchJobToMovers ensures already-notified movers are skipped,
 * so the new wave naturally reaches fresh movers who weren't in earlier waves.
 */
async function redispatchIfAllExpired(bookingIds: string[]) {
  for (const bookingId of bookingIds) {
    try {
      // 1. Booking must still be awaiting a mover
      const [booking] = await db
        .select()
        .from(bookings)
        .where(and(eq(bookings.id, bookingId), eq(bookings.status, BOOKING_STATUSES.PENDING)))
        .limit(1);

      if (!booking) continue;

      // 2. Fetch all notification records for this booking
      const allNotifs = await db
        .select({ status: jobNotifications.status })
        .from(jobNotifications)
        .where(eq(jobNotifications.bookingId, bookingId));

      if (allNotifs.length === 0) continue;

      // Skip if any notification is still pending (someone hasn't responded yet)
      const hasPending = allNotifs.some(n => n.status === 'pending');
      if (hasPending) continue;

      // 3. Respect the wave cap
      if (allNotifs.length >= MAX_REDISPATCH_NOTIFICATIONS) {
        logger.info(
          { event: 'redispatch_cap_reached', bookingId, totalNotifs: allNotifs.length },
          'Auto re-dispatch cap reached — admin manual assignment required'
        );
        // Notify customer that no movers could be found
        try {
          const [customer] = await db
            .select()
            .from(users)
            .where(eq(users.id, booking.customerId))
            .limit(1);
          if (customer?.email) {
            await notificationService.sendEmail({
              to: customer.email,
              subject: 'Update on Your LervIT Booking',
              body: `<p>Hi ${customer.name?.split(' ')[0] || 'there'},</p>
<p>We were unable to find an available mover for your booking at this time. Our team has been notified and will reach out to you shortly to assist.</p>
<p>We apologize for any inconvenience. You can also <a href="${process.env.BASE_URL || 'https://app.lervit.com'}/support">contact support</a> for immediate help.</p>
<p>— The LervIT Team</p>`,
              type: 'status_update',
            });
          }
          if (customer?.phone) {
            await notificationService.sendSMS({
              to: customer.phone,
              message: `LervIT: We couldn't find an available mover for your booking. Our team will contact you shortly. Need help now? Visit ${process.env.BASE_URL || 'https://app.lervit.com'}/support`,
              type: 'booking_update',
            });
          }
        } catch (notifyErr) {
          logEvent.error('redispatch_cap_customer_notify', notifyErr, { bookingId });
        }
        continue;
      }

      // Fire the next wave
      const wave = Math.floor(allNotifs.length / 5) + 1;
      const result = await dispatchJobToMovers(booking);

      logEvent.notification('auto_redispatch', {
        bookingId,
        wave,
        dispatched: result.dispatched,
        requiredVehicle: result.requiredVehicle,
        previousNotifCount: allNotifs.length,
      });

      if (result.dispatched === 0) {
        logger.warn(
          { event: 'auto_redispatch_no_movers', bookingId, wave },
          'Auto re-dispatch wave found no available movers'
        );
      }
    } catch (err) {
      logEvent.error('auto_redispatch', err, { bookingId });
    }
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

          // Dispatch mover notifications via the full pipeline. Use
          // dispatchBooking (not dispatchJobToMovers directly) so pre-selected
          // mover priority is honoured — otherwise a webhook-lost booking with
          // a customer-chosen mover would fan out to everyone instead of
          // pinging the chosen mover first (AC-5).
          if (updatedBooking) {
            try {
              await dispatchBooking(updatedBooking);
              logEvent.notification('orphan_recovery_movers_notified', {
                bookingId: updatedBooking.id,
                preSelectedMoverId: updatedBooking.preSelectedMoverId ?? null,
              });
            } catch (dispatchErr) {
              logEvent.error('orphan_recovery_dispatch', dispatchErr, { bookingId: booking.id });
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
// IMPORTANT: Excludes bookings with recent location updates (mover actively traveling)
async function autoCompletePastPaidBookings() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    
    // Threshold for "active" location updates - if mover updated location within 2 hours, they're still traveling
    const activeThreshold = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
    
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
          lt(bookings.preferredDate, today),
          // CRITICAL FIX: Only auto-complete if mover has NOT updated location recently
          // This prevents completing bookings while mover is still actively traveling
          or(
            isNull(bookings.locationUpdatedAt),
            lt(bookings.locationUpdatedAt, activeThreshold)
          )
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

      // Send review request per completed booking (only if no review exists yet).
      // Failures are per-booking so one bad email doesn't stop the batch.
      for (const { id: bookingId } of completedBookings) {
        try {
          await sendPostCompletionReviewRequest(bookingId);
        } catch (err) {
          logEvent.error('review_request_dispatch', err, { bookingId });
        }
      }
    }

    return completedBookings.length;
  } catch (error) {
    logEvent.error('autoCompletePastPaidBookings', error);
    return 0;
  }
}

// Post-completion review request. Idempotent: skips if a review already exists
// or if the customer already has a review_request in-app notification for the
// booking (guards against re-firing on repeat auto-complete runs).
async function sendPostCompletionReviewRequest(bookingId: string) {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking) return;

  // Skip if already reviewed
  const [existingReview] = await db.select({ id: reviews.id })
    .from(reviews)
    .where(eq(reviews.bookingId, bookingId))
    .limit(1);
  if (existingReview) return;

  // Skip if we've already prompted for this booking
  const [existingPrompt] = await db.select({ id: inAppNotifications.id })
    .from(inAppNotifications)
    .where(and(
      eq(inAppNotifications.bookingId, bookingId),
      eq(inAppNotifications.type, 'review_request'),
    ))
    .limit(1);
  if (existingPrompt) return;

  const [customer] = await db.select().from(users).where(eq(users.id, booking.customerId)).limit(1);
  if (!customer) return;

  let moverName: string | null = null;
  if (booking.moverId) {
    const [moverRow] = await db.select({ userId: movers.userId }).from(movers).where(eq(movers.id, booking.moverId)).limit(1);
    if (moverRow) {
      const [moverUser] = await db.select({ name: users.name }).from(users).where(eq(users.id, moverRow.userId)).limit(1);
      if (moverUser?.name) moverName = moverUser.name;
    }
  }

  // Email + SMS (rate-limited internally in the notifier)
  try {
    await notificationService.sendReviewRequest(customer, booking, moverName);
  } catch (err) {
    logEvent.error('review_request_email_sms', err, { bookingId });
  }

  // In-app notification (persist even if email/SMS fail)
  await db.insert(inAppNotifications).values({
    userId: booking.customerId,
    type: 'review_request',
    title: 'How was your move?',
    message: `Rate your experience with ${moverName || 'your mover'}`,
    bookingId,
    actionUrl: `/review/${bookingId}`,
    isRead: false,
  });
}

// Auto-cancel bookings with past dates that weren't completed
// This clears them from all mover dashboards in production
// IMPORTANT: Excludes bookings with recent location updates (mover actively traveling)
async function cancelPastDatedBookings() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    
    // Threshold for "active" location updates - if mover updated location within 2 hours, they're still traveling
    const activeThreshold = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
    
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
          lt(bookings.preferredDate, today),
          // CRITICAL FIX: Only auto-cancel if mover has NOT updated location recently
          // This prevents cancelling bookings while mover is still actively traveling
          or(
            isNull(bookings.locationUpdatedAt),
            lt(bookings.locationUpdatedAt, activeThreshold)
          )
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

// Track abandoned booking reminders to avoid duplicates
async function sendAbandonedBookingReminders() {
  try {
    const now = new Date();
    // Only send reminders for bookings abandoned 1+ hour ago but less than 24 hours
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Get abandoned bookings that haven't been recovered and need reminders
    const abandonedToRemind = await db.select()
      .from(abandonedBookings)
      .where(
        and(
          eq(abandonedBookings.recovered, false),
          lte(abandonedBookings.createdAt, oneHourAgo),
          gte(abandonedBookings.createdAt, twentyFourHoursAgo),
          lte(abandonedBookings.reminderCount, 2) // Max 3 reminders
        )
      );
    
    let emailsSent = 0;
    let smsSent = 0;
    
    for (const abandoned of abandonedToRemind) {
      // Atomic claim: only increment if reminderCount still matches what we read.
      // If two processes run simultaneously, only one wins the race — the other
      // gets no rows back and skips safely, preventing duplicate emails.
      const [claimed] = await db.update(abandonedBookings)
        .set({
          reminderCount: abandoned.reminderCount + 1,
          reminderSentAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(abandonedBookings.id, abandoned.id),
            eq(abandonedBookings.reminderCount, abandoned.reminderCount) // Optimistic lock
          )
        )
        .returning({ id: abandonedBookings.id });

      if (!claimed) {
        // Another process already handled this reminder — skip
        continue;
      }
      
      // Get selected mover info if available
      let moverName = null;
      if (abandoned.selectedMoverId) {
        const moverResult = await db.select({
          userId: movers.userId,
        })
        .from(movers)
        .where(eq(movers.id, abandoned.selectedMoverId))
        .limit(1);
        
        if (moverResult[0]) {
          const userResult = await db.select({ name: users.name })
            .from(users)
            .where(eq(users.id, moverResult[0].userId))
            .limit(1);
          moverName = userResult[0]?.name;
        }
      }
      
      // Send email reminder if we have email
      if (abandoned.email) {
        try {
          const baseUrl = getBaseUrl();
          // Build URL with all saved booking data for restoration
          const params = new URLSearchParams();
          params.set('abandonedId', abandoned.id);
          if (abandoned.pickupAddress) params.set('pickup', abandoned.pickupAddress);
          if (abandoned.dropoffAddress) params.set('dropoff', abandoned.dropoffAddress);
          if (abandoned.selectedMoverId) params.set('moverId', abandoned.selectedMoverId);
          if (abandoned.loadSize) params.set('loadSize', abandoned.loadSize);
          params.set('resumeStep', '2');
          const bookingUrl = `${baseUrl}/request-move?${params.toString()}`;
          
          // Determine reminder urgency message based on count
          const reminderNumber = abandoned.reminderCount + 1;
          let urgencyMessage = '';
          if (reminderNumber === 1) {
            urgencyMessage = "We saved your booking progress!";
          } else if (reminderNumber === 2) {
            urgencyMessage = "Don't forget - your booking is still waiting!";
          } else {
            urgencyMessage = "Last chance to complete your saved booking!";
          }
          
          const body = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background-color:#EA580C;padding:30px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;">Complete Your Booking</h1>
              <p style="color:#ffffff;margin:10px 0 0 0;font-size:14px;">${urgencyMessage}</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:30px;">
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 20px 0;">Hi there,</p>
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 25px 0;">We noticed you started booking a move but didn't finish. Good news - we saved all your details!</p>
              
              ${(abandoned.pickupAddress || abandoned.dropoffAddress || moverName) ? `
              <h3 style="color:#333333;font-size:16px;margin:0 0 15px 0;border-bottom:1px solid #eee;padding-bottom:10px;">Your Saved Details</h3>
              <table width="100%" style="margin-bottom:25px;">
                ${abandoned.pickupAddress ? `<tr>
                  <td style="padding:8px 0;color:#555555;font-size:14px;"><strong>From:</strong></td>
                  <td style="padding:8px 0;color:#333333;font-size:14px;">${abandoned.pickupAddress}</td>
                </tr>` : ''}
                ${abandoned.dropoffAddress ? `<tr>
                  <td style="padding:8px 0;color:#555555;font-size:14px;"><strong>To:</strong></td>
                  <td style="padding:8px 0;color:#333333;font-size:14px;">${abandoned.dropoffAddress}</td>
                </tr>` : ''}
                ${moverName ? `<tr>
                  <td style="padding:8px 0;color:#555555;font-size:14px;"><strong>Mover:</strong></td>
                  <td style="padding:8px 0;color:#333333;font-size:14px;">${moverName}</td>
                </tr>` : ''}
                ${abandoned.loadSize ? `<tr>
                  <td style="padding:8px 0;color:#555555;font-size:14px;"><strong>Load Size:</strong></td>
                  <td style="padding:8px 0;color:#333333;font-size:14px;">${abandoned.loadSize}</td>
                </tr>` : ''}
              </table>
              ` : ''}
              
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 25px 0;">
                <tr>
                  <td align="center">
                    <a href="${bookingUrl}" style="display:inline-block;background-color:#EA580C;color:#ffffff;font-size:18px;font-weight:bold;text-decoration:none;padding:15px 40px;border-radius:6px;">Complete Your Booking</a>
                  </td>
                </tr>
              </table>
              
              <p style="color:#888888;font-size:13px;line-height:20px;margin:0;text-align:center;">
                Click the button above to pick up right where you left off.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f8f8;padding:20px 30px;text-align:center;border-top:1px solid #eeeeee;">
              <p style="color:#888888;font-size:12px;margin:0;">&copy; ${new Date().getFullYear()} LervIT. All rights reserved.</p>
              <p style="color:#888888;font-size:11px;margin:5px 0 0 0;">Calgary's Smart Moving Platform</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
          `;
          
          await notificationService.sendEmail({
            to: abandoned.email,
            subject: reminderNumber === 3 ? 'Last Chance: Complete Your Moving Booking - LervIT' : 'Complete Your Moving Booking - LervIT',
            body,
            type: 'status_update',
          });
          emailsSent++;
        } catch (emailError) {
          logger.error({ error: emailError, abandonedId: abandoned.id }, 'Failed to send abandoned booking email');
        }
      }
      
      // Send SMS reminder if we have phone (only for first reminder)
      if (abandoned.phone && abandoned.reminderCount === 0) {
        try {
          const baseUrl = getBaseUrl();
          // Build short URL with abandoned ID (SMS char limit)
          const smsUrl = `${baseUrl}/request-move?abandonedId=${abandoned.id}&resumeStep=2`;
          await notificationService.sendSMS({
            to: abandoned.phone,
            message: `LervIT: We saved your moving booking! Complete it now: ${smsUrl}`,
            type: 'booking_update',
          });
          smsSent++;
        } catch (smsError) {
          logger.error({ error: smsError, abandonedId: abandoned.id }, 'Failed to send abandoned booking SMS');
        }
      }
      
    }
    
    if (emailsSent > 0 || smsSent > 0) {
      logger.info({ 
        event: 'abandoned_booking_reminders', 
        emailsSent, 
        smsSent,
        total: abandonedToRemind.length 
      }, `Sent ${emailsSent} emails and ${smsSent} SMS for abandoned bookings`);
    }
    
    return { emailsSent, smsSent };
  } catch (error) {
    logEvent.error('sendAbandonedBookingReminders', error);
    return { emailsSent: 0, smsSent: 0 };
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

// Track sent Stripe onboarding reminders in memory to avoid duplicates within same session
const sentStripeReminders = new Set<string>();

// Constants for Stripe onboarding reminders
const STRIPE_REMINDER_INTERVALS = [
  24 * 60 * 60 * 1000,  // 1st reminder: 24 hours after starting
  3 * 24 * 60 * 60 * 1000,  // 2nd reminder: 3 days after starting
  7 * 24 * 60 * 60 * 1000,  // 3rd reminder: 7 days after starting
];
const MAX_STRIPE_REMINDERS = 3;

async function sendStripeOnboardingReminders() {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Find movers with incomplete Stripe onboarding:
    // - Account created > 24 hours ago
    // - Not complete (chargesEnabled = false OR onboardingStatus != 'complete')
    // - Less than max reminders sent
    // - Last reminder was at least 24 hours ago (or never sent)
    const incompleteAccounts = await db.select({
      accountId: moverStripeAccounts.id,
      moverId: moverStripeAccounts.moverId,
      stripeAccountId: moverStripeAccounts.stripeAccountId,
      onboardingStatus: moverStripeAccounts.onboardingStatus,
      chargesEnabled: moverStripeAccounts.chargesEnabled,
      currentlyDue: moverStripeAccounts.currentlyDue,
      reminderCount: moverStripeAccounts.reminderCount,
      lastReminderAt: moverStripeAccounts.lastReminderAt,
      createdAt: moverStripeAccounts.createdAt,
    })
    .from(moverStripeAccounts)
    .where(
      and(
        eq(moverStripeAccounts.chargesEnabled, false),
        lt(moverStripeAccounts.createdAt, oneDayAgo),
        lt(moverStripeAccounts.reminderCount, MAX_STRIPE_REMINDERS)
      )
    );
    
    let emailsSent = 0;
    let smsSent = 0;
    
    for (const account of incompleteAccounts) {
      const reminderKey = `stripe_${account.accountId}_${account.reminderCount}`;
      
      // Skip if already sent this reminder in this session
      if (sentStripeReminders.has(reminderKey)) {
        continue;
      }
      
      // Check if enough time has passed since last reminder
      const timeSinceCreation = now.getTime() - new Date(account.createdAt).getTime();
      const requiredInterval = STRIPE_REMINDER_INTERVALS[account.reminderCount] || STRIPE_REMINDER_INTERVALS[STRIPE_REMINDER_INTERVALS.length - 1];
      
      if (timeSinceCreation < requiredInterval) {
        continue;
      }
      
      // Check last reminder time - ensure at least 24 hours between reminders
      if (account.lastReminderAt) {
        const timeSinceLastReminder = now.getTime() - new Date(account.lastReminderAt).getTime();
        if (timeSinceLastReminder < 24 * 60 * 60 * 1000) {
          continue;
        }
      }
      
      // Get mover and user info
      const moverResult = await db.select({
        userId: movers.userId,
      })
      .from(movers)
      .where(eq(movers.id, account.moverId))
      .limit(1);
      
      if (!moverResult[0]) continue;
      
      const userResult = await db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
      })
      .from(users)
      .where(eq(users.id, moverResult[0].userId))
      .limit(1);
      
      const user = userResult[0];
      if (!user) continue;
      
      // Determine what's still needed
      const stillNeeded = account.currentlyDue && account.currentlyDue.length > 0
        ? account.currentlyDue.slice(0, 3).map(item => 
            item.replace(/^individual\./, '')
              .replace(/^external_account$/, 'bank account')
              .replace(/verification\.document/, 'ID verification')
              .replace(/_/g, ' ')
          ).join(', ')
        : 'a few more details';
      
      const baseUrl = getBaseUrl();

      // Customize message based on reminder count
      const reminderNumber = account.reminderCount + 1;
      let subject: string;
      let urgency: string;
      
      if (reminderNumber === 1) {
        subject = 'Complete Your Payout Setup - LervIT';
        urgency = 'Just a quick reminder';
      } else if (reminderNumber === 2) {
        subject = 'Your Payouts Are Almost Ready - LervIT';
        urgency = 'Don\'t miss out on earnings';
      } else {
        subject = 'Final Reminder: Complete Your Payout Setup - LervIT';
        urgency = 'This is your final reminder';
      }
      
      // Send email reminder
      if (user.email) {
        try {
          await notificationService.sendEmail({
            to: user.email,
            subject,
            type: 'status_update',
            body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #1a56db;">Complete Your Payout Setup</h2>
              <p>Hi ${user.name || 'there'},</p>
              <p>${urgency} to finish setting up your LervIT payout account so you can receive earnings from completed moves.</p>
              <p><strong>What's still needed:</strong> ${stillNeeded}</p>
              <p>It only takes a few minutes to complete, and once done, your earnings will be deposited directly to your bank account.</p>
              <div style="margin: 24px 0;">
                <a href="${baseUrl}/mover-settings" 
                   style="background-color: #1a56db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  Complete Setup Now
                </a>
              </div>
              <p style="color: #666; font-size: 14px;">
                Questions? Reply to this email or visit our support page.
              </p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
              <p style="color: #999; font-size: 12px;">
                You're receiving this because you started setting up payouts on LervIT but haven't completed it yet.
              </p>
            </div>`,
          });
          emailsSent++;
        } catch (err) {
          console.error(`[Stripe Reminder] Failed to send email to ${user.email}:`, err);
        }
      }
      
      // Send SMS reminder (only for 2nd and 3rd reminders to avoid spamming)
      if (user.phone && reminderNumber >= 2) {
        try {
          const smsMessage = `LervIT: ${urgency}! Complete your payout setup to receive earnings. It takes 2 min: ${baseUrl}/mover-settings`;
          await notificationService.sendSMS({
            to: user.phone,
            message: smsMessage,
            type: 'booking_update',
          });
          smsSent++;
        } catch (err) {
          console.error(`[Stripe Reminder] Failed to send SMS to ${user.phone}:`, err);
        }
      }
      
      // Update reminder count
      await db.update(moverStripeAccounts)
        .set({
          reminderCount: account.reminderCount + 1,
          lastReminderAt: now,
          updatedAt: now,
        })
        .where(eq(moverStripeAccounts.id, account.accountId));
      
      sentStripeReminders.add(reminderKey);
    }
    
    if (emailsSent > 0 || smsSent > 0) {
      logger.info({ 
        event: 'stripe_onboarding_reminders', 
        emailsSent, 
        smsSent,
        total: incompleteAccounts.length 
      }, `Sent ${emailsSent} emails and ${smsSent} SMS for incomplete Stripe onboarding`);
    }
    
    return { emailsSent, smsSent };
  } catch (error) {
    logEvent.error('sendStripeOnboardingReminders', error);
    return { emailsSent: 0, smsSent: 0 };
  }
}

// Track sent profile reminders in memory to avoid duplicates within same session
const sentProfileReminders = new Set<string>();

// Constants for profile completion reminders
const PROFILE_REMINDER_INTERVALS = [
  24 * 60 * 60 * 1000,      // 1st reminder: 24 hours after signup
  3 * 24 * 60 * 60 * 1000,  // 2nd reminder: 3 days after signup
  7 * 24 * 60 * 60 * 1000,  // 3rd reminder: 7 days after signup
];
const MAX_PROFILE_REMINDERS = 3;

async function sendProfileCompletionReminders() {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Find movers with incomplete profiles:
    // - Created > 24 hours ago
    // - onboardingCompleted = false OR missing key profile fields
    // - Less than max reminders sent
    // - Last reminder was at least 24 hours ago (or never sent)
    const incompleteMovers = await db.select({
      moverId: movers.id,
      userId: movers.userId,
      vehicleType: movers.vehicleType,
      vehiclePhoto: movers.vehiclePhoto,
      moverImage: movers.moverImage,
      bio: movers.bio,
      onboardingCompleted: movers.onboardingCompleted,
      profileReminderCount: movers.profileReminderCount,
      lastProfileReminderAt: movers.lastProfileReminderAt,
      createdAt: movers.createdAt,
    })
    .from(movers)
    .where(
      and(
        lt(movers.createdAt, oneDayAgo),
        lt(movers.profileReminderCount, MAX_PROFILE_REMINDERS),
        or(
          eq(movers.onboardingCompleted, false),
          isNull(movers.moverImage),
          isNull(movers.vehiclePhoto),
          isNull(movers.bio)
        )
      )
    );
    
    let emailsSent = 0;
    let smsSent = 0;
    
    for (const mover of incompleteMovers) {
      const reminderKey = `profile_${mover.moverId}_${mover.profileReminderCount}`;
      
      // Skip if already sent this reminder in this session
      if (sentProfileReminders.has(reminderKey)) {
        continue;
      }
      
      // Check if enough time has passed since account creation
      const timeSinceCreation = now.getTime() - new Date(mover.createdAt).getTime();
      const requiredInterval = PROFILE_REMINDER_INTERVALS[mover.profileReminderCount] || PROFILE_REMINDER_INTERVALS[PROFILE_REMINDER_INTERVALS.length - 1];
      
      if (timeSinceCreation < requiredInterval) {
        continue;
      }
      
      // Check last reminder time - ensure at least 24 hours between reminders
      if (mover.lastProfileReminderAt) {
        const timeSinceLastReminder = now.getTime() - new Date(mover.lastProfileReminderAt).getTime();
        if (timeSinceLastReminder < 24 * 60 * 60 * 1000) {
          continue;
        }
      }
      
      // Get user info
      const userResult = await db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
      })
      .from(users)
      .where(eq(users.id, mover.userId))
      .limit(1);
      
      const user = userResult[0];
      if (!user) continue;
      
      // Determine what's missing from profile
      const missingItems: string[] = [];
      if (!mover.onboardingCompleted) missingItems.push('onboarding wizard');
      if (!mover.moverImage) missingItems.push('profile photo');
      if (!mover.vehiclePhoto) missingItems.push('vehicle photo');
      if (!mover.bio) missingItems.push('bio/description');
      
      const stillNeeded = missingItems.length > 0 
        ? missingItems.slice(0, 3).join(', ')
        : 'complete your profile';
      
      const baseUrl = getBaseUrl();

      // Customize message based on reminder count
      const reminderNumber = mover.profileReminderCount + 1;
      let subject: string;
      let urgency: string;
      let benefit: string;
      
      if (reminderNumber === 1) {
        subject = 'Complete Your Mover Profile - LervIT';
        urgency = 'Quick reminder';
        benefit = 'Complete profiles get 3x more job offers';
      } else if (reminderNumber === 2) {
        subject = 'Movers Are Getting Jobs - Are You? - LervIT';
        urgency = 'Don\'t miss out';
        benefit = 'Movers with photos and bios earn 40% more';
      } else {
        subject = 'Final Reminder: Complete Your Profile - LervIT';
        urgency = 'Last chance reminder';
        benefit = 'Incomplete profiles are hidden from customers';
      }
      
      // Send email reminder
      if (user.email) {
        try {
          await notificationService.sendEmail({
            to: user.email,
            subject,
            type: 'status_update',
            body: `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background-color:#4CAF50;padding:30px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;">LervIT</h1>
              <p style="color:#ffffff;margin:8px 0 0 0;font-size:14px;">Smart Moving Platform</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 30px;">
              <h2 style="color:#333333;margin:0 0 20px 0;font-size:22px;">Complete Your Mover Profile</h2>
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 20px 0;">
                Hi ${user.name || 'there'},
              </p>
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 20px 0;">
                ${urgency}! Your LervIT mover profile is missing a few things that help customers choose you.
              </p>
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 20px 0;">
                <strong>What's still needed:</strong> ${stillNeeded}
              </p>
              <div style="background-color:#E8F5E9;border-left:4px solid #4CAF50;padding:15px;margin:0 0 20px 0;border-radius:4px;">
                <p style="color:#2E7D32;font-size:14px;margin:0;">
                  <strong>Did you know?</strong> ${benefit}
                </p>
              </div>
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 20px 0;">
                It only takes a few minutes to complete, and you'll start receiving job matches right away.
              </p>
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 25px 0;">
                <strong>Need help?</strong> Watch our quick tutorial video: 
                <a href="https://youtu.be/qaRKHwrUTQU?si=EuPfgMvyVkm9l4Ro" style="color:#4CAF50;text-decoration:underline;">How to Complete Your Mover Profile</a>
              </p>
              <div style="text-align:center;margin:30px 0;">
                <a href="${baseUrl}/mover-onboarding" 
                   style="display:inline-block;background-color:#4CAF50;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;padding:15px 40px;border-radius:6px;">
                  Complete My Profile
                </a>
              </div>
              <p style="color:#777777;font-size:14px;line-height:22px;margin:20px 0 0 0;">
                <strong>Need help?</strong> Call our toll-free support line: <a href="tel:1-888-982-0885" style="color:#4CAF50;text-decoration:none;font-weight:bold;">1-888-982-0885</a>
              </p>
              <p style="color:#777777;font-size:14px;line-height:22px;margin:10px 0 0 0;">
                Our team is ready to guide you through the profile completion process.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8f8f8;padding:20px 30px;text-align:center;border-top:1px solid #eeeeee;">
              <p style="color:#888888;font-size:12px;margin:0 0 5px 0;">
                You're receiving this because you signed up as a mover on LervIT.
              </p>
              <p style="color:#999999;font-size:12px;margin:0;">
                &copy; ${new Date().getFullYear()} LervIT. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
          });
          emailsSent++;
        } catch (err) {
          console.error(`[Profile Reminder] Failed to send email to ${user.email}:`, err);
        }
      }
      
      // Send SMS reminder (only for 2nd and 3rd reminders to avoid spamming)
      if (user.phone && reminderNumber >= 2) {
        try {
          const smsMessage = `LervIT: ${urgency}! Complete your mover profile to start receiving jobs. ${benefit}. Takes 2 min: ${baseUrl}/mover-onboarding - Need help? Call 1-888-982-0885`;
          await notificationService.sendSMS({
            to: user.phone,
            message: smsMessage,
            type: 'booking_update',
          });
          smsSent++;
        } catch (err) {
          console.error(`[Profile Reminder] Failed to send SMS to ${user.phone}:`, err);
        }
      }
      
      // Update reminder count
      await db.update(movers)
        .set({
          profileReminderCount: mover.profileReminderCount + 1,
          lastProfileReminderAt: now,
        })
        .where(eq(movers.id, mover.moverId));
      
      sentProfileReminders.add(reminderKey);
    }
    
    if (emailsSent > 0 || smsSent > 0) {
      logger.info({
        event: 'profile_completion_reminders',
        emailsSent,
        smsSent,
        total: incompleteMovers.length
      }, `Sent ${emailsSent} emails and ${smsSent} SMS for incomplete mover profiles`);
    }

    return { emailsSent, smsSent };
  } catch (error) {
    logEvent.error('sendProfileCompletionReminders', error);
    return { emailsSent: 0, smsSent: 0 };
  }
}

// ============================================================
// AGENT-FACING JOBS
// ============================================================

/**
 * Daily KPI snapshot — runs 06:00 Calgary time so APEX (07:00) has a
 * stable, pre-aggregated view. Writes a single `business_events` row
 * with eventType `kpi.daily_snapshot` and payload `{ metrics, targets, deltas }`.
 */
async function dailyKpiSnapshot() {
  try {
    // "Yesterday" = the previous local day, but we operate on UTC here
    // and rely on the fact that revenue queries elsewhere use created_at
    // in the DB's timezone. Close-enough for a daily rollup.
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
    const startOfDayBefore = new Date(startOfYesterday.getTime() - 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const paidStates: string[] = ['paid', 'succeeded'];

    // Yesterday's completed + paid bookings and revenue
    const [yesterdayRow] = await db.execute<{
      completed_count: number;
      revenue: string;
    }>(sql`
      SELECT
        COUNT(*)::int                                     AS completed_count,
        COALESCE(SUM(price::numeric), 0)                  AS revenue
      FROM bookings
      WHERE status = 'completed'
        AND payment_status = ANY(${paidStates})
        AND created_at >= ${startOfYesterday}
        AND created_at <  ${startOfToday}
    `) as unknown as Array<{ completed_count: number; revenue: string }>;

    const [dayBeforeRow] = await db.execute<{
      completed_count: number;
      revenue: string;
    }>(sql`
      SELECT
        COUNT(*)::int                                     AS completed_count,
        COALESCE(SUM(price::numeric), 0)                  AS revenue
      FROM bookings
      WHERE status = 'completed'
        AND payment_status = ANY(${paidStates})
        AND created_at >= ${startOfDayBefore}
        AND created_at <  ${startOfYesterday}
    `) as unknown as Array<{ completed_count: number; revenue: string }>;

    const [monthRow] = await db.execute<{
      completed_count: number;
      revenue: string;
    }>(sql`
      SELECT
        COUNT(*)::int                                     AS completed_count,
        COALESCE(SUM(price::numeric), 0)                  AS revenue
      FROM bookings
      WHERE status = 'completed'
        AND payment_status = ANY(${paidStates})
        AND created_at >= ${startOfMonth}
    `) as unknown as Array<{ completed_count: number; revenue: string }>;

    // Funnel: new bookings and conversion rate for yesterday
    const [funnelRow] = await db.execute<{
      total: number;
      converted: number;
    }>(sql`
      SELECT
        COUNT(*)::int                                                                       AS total,
        COUNT(*) FILTER (WHERE payment_status = ANY(${paidStates}))::int                    AS converted
      FROM bookings
      WHERE created_at >= ${startOfYesterday}
        AND created_at <  ${startOfToday}
    `) as unknown as Array<{ total: number; converted: number }>;

    // New movers + active movers yesterday
    const [moversRow] = await db.execute<{
      new_movers: number;
      active_movers: number;
    }>(sql`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= ${startOfYesterday} AND created_at < ${startOfToday})::int                              AS new_movers,
        COUNT(*) FILTER (WHERE last_location_update >= ${startOfYesterday} AND last_location_update < ${startOfToday})::int          AS active_movers
      FROM movers
    `) as unknown as Array<{ new_movers: number; active_movers: number }>;

    // Avg response time (mover accept latency) — proxied by
    // job_notifications.responded_at - created_at where status='accepted'
    const [responseRow] = await db.execute<{ avg_response_seconds: string | null }>(sql`
      SELECT AVG(EXTRACT(EPOCH FROM (responded_at - created_at)))::text AS avg_response_seconds
      FROM job_notifications
      WHERE status = 'accepted'
        AND responded_at IS NOT NULL
        AND created_at >= ${startOfYesterday}
        AND created_at <  ${startOfToday}
    `) as unknown as Array<{ avg_response_seconds: string | null }>;

    // Load current active targets
    const targetRows = await db.select().from(kpiTargets);
    const targetMap: Record<string, number> = {};
    for (const t of targetRows) {
      targetMap[t.metricName] = Number(t.targetValue);
    }

    const revenueYesterday = Number(yesterdayRow?.revenue ?? 0);
    const revenueDayBefore = Number(dayBeforeRow?.revenue ?? 0);
    const completedYesterday = yesterdayRow?.completed_count ?? 0;
    const completedDayBefore = dayBeforeRow?.completed_count ?? 0;
    const monthlyRevenue = Number(monthRow?.revenue ?? 0);
    const monthlyCompleted = monthRow?.completed_count ?? 0;
    const conversionRate = funnelRow?.total
      ? (funnelRow.converted / funnelRow.total) * 100
      : 0;

    const payload = {
      period: {
        yesterdayStart: startOfYesterday.toISOString(),
        yesterdayEnd: startOfToday.toISOString(),
        monthStart: startOfMonth.toISOString(),
      },
      metrics: {
        revenue: {
          yesterday: revenueYesterday,
          dayBefore: revenueDayBefore,
          monthToDate: monthlyRevenue,
        },
        completedMoves: {
          yesterday: completedYesterday,
          dayBefore: completedDayBefore,
          monthToDate: monthlyCompleted,
        },
        conversion: {
          yesterdayRatePct: Math.round(conversionRate * 100) / 100,
          yesterdayTotal: funnelRow?.total ?? 0,
          yesterdayConverted: funnelRow?.converted ?? 0,
        },
        movers: {
          newYesterday: moversRow?.new_movers ?? 0,
          activeYesterday: moversRow?.active_movers ?? 0,
        },
        avgResponseSeconds: responseRow?.avg_response_seconds
          ? Math.round(Number(responseRow.avg_response_seconds))
          : null,
      },
      targets: targetMap,
      deltas: {
        revenueVsDayBefore: revenueYesterday - revenueDayBefore,
        completedVsDayBefore: completedYesterday - completedDayBefore,
        monthlyRevenueVsTarget: targetMap.monthly_revenue
          ? monthlyRevenue - targetMap.monthly_revenue
          : null,
        completedMovesVsTarget: targetMap.completed_moves
          ? monthlyCompleted - targetMap.completed_moves
          : null,
      },
    };

    await emitEvent('kpi.daily_snapshot', 'system', 'daily', payload);
    logger.info({ event: 'kpi_snapshot', payload }, 'Daily KPI snapshot written');
    return payload;
  } catch (error) {
    logEvent.error('dailyKpiSnapshot', error);
    return null;
  }
}

/**
 * Mover activity rollup — every 30 min, write one `mover_activity_log`
 * row per mover with a `rollup` activity_type and per-window counters.
 * RETAIN reads this history to detect inactivity trends.
 */
async function moverActivityRollup() {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const allMovers = await db.select().from(movers);

    // Aggregate today's completed + declined counts per mover in one pass.
    const completedRows = await db.execute<{ mover_id: string; count: number }>(sql`
      SELECT mover_id, COUNT(*)::int AS count
      FROM bookings
      WHERE mover_id IS NOT NULL
        AND status = 'completed'
        AND updated_at >= ${startOfToday}
      GROUP BY mover_id
    `) as unknown as Array<{ mover_id: string; count: number }>;
    const completedByMover = new Map<string, number>(
      completedRows.map(r => [r.mover_id, r.count]),
    );

    const declinedRows = await db.execute<{ mover_id: string; count: number }>(sql`
      SELECT mover_id, COUNT(*)::int AS count
      FROM job_notifications
      WHERE status = 'declined'
        AND (responded_at IS NOT NULL AND responded_at >= ${startOfToday})
      GROUP BY mover_id
    `) as unknown as Array<{ mover_id: string; count: number }>;
    const declinedByMover = new Map<string, number>(
      declinedRows.map(r => [r.mover_id, r.count]),
    );

    let inserted = 0;
    for (const mover of allMovers) {
      const completed = completedByMover.get(mover.id) ?? 0;
      const declined = declinedByMover.get(mover.id) ?? 0;
      const lastLocationAgeMs = mover.lastLocationUpdate
        ? now.getTime() - new Date(mover.lastLocationUpdate).getTime()
        : null;

      await db.insert(moverActivityLog).values({
        moverId: mover.id,
        activityType: 'rollup',
        metadata: {
          jobsCompletedToday: completed,
          jobsDeclinedToday: declined,
          lastLocationAgeMinutes: lastLocationAgeMs !== null
            ? Math.round(lastLocationAgeMs / 60000)
            : null,
          isAvailable: mover.isAvailable ?? false,
          rating: mover.rating ?? null,
          completedTripsLifetime: mover.completedTrips ?? 0,
        },
      });
      inserted += 1;
    }

    logger.info({ event: 'mover_activity_rollup', moverCount: inserted }, 'Mover activity rolled up');
    return { moverCount: inserted };
  } catch (error) {
    logEvent.error('moverActivityRollup', error);
    return { moverCount: 0 };
  }
}
