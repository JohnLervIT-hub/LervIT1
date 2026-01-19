import cron from 'node-cron';
import { db } from './db';
import { bookings, jobNotifications, users, BOOKING_STATUSES, abandonedBookings, movers, moverStripeAccounts } from '@shared/schema';
import { eq, lt, and, or, inArray, gte, isNotNull, isNull, lte } from 'drizzle-orm';
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
  
  // Send abandoned booking reminders every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    await sendAbandonedBookingReminders();
  });
  
  // Send Stripe onboarding reminders every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    await sendStripeOnboardingReminders();
  });
  
  // Send profile completion reminders every 6 hours (offset by 3 hours from Stripe reminders)
  cron.schedule('0 3,9,15,21 * * *', async () => {
    await sendProfileCompletionReminders();
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
    }
    
    return completedBookings.length;
  } catch (error) {
    logEvent.error('autoCompletePastPaidBookings', error);
    return 0;
  }
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
const sentAbandonedReminders = new Set<string>();

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
      const reminderKey = `${abandoned.id}-${abandoned.reminderCount}`;
      
      // Skip if we already sent this reminder in this session
      if (sentAbandonedReminders.has(reminderKey)) {
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
          const baseUrl = process.env.REPLIT_DEPLOYMENT_URL || 'https://app.lervit.com';
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
          const baseUrl = process.env.REPLIT_DEPLOYMENT_URL || 'https://app.lervit.com';
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
      
      // Update reminder count and timestamp
      await db.update(abandonedBookings)
        .set({
          reminderCount: abandoned.reminderCount + 1,
          reminderSentAt: now,
          updatedAt: now,
        })
        .where(eq(abandonedBookings.id, abandoned.id));
      
      sentAbandonedReminders.add(reminderKey);
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
      
      const baseUrl = process.env.REPLIT_DEPLOYMENT_URL || 
        (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'https://app.lervit.com');
      
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
      
      const baseUrl = process.env.REPLIT_DEPLOYMENT_URL || 
        (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'https://app.lervit.com');
      
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
            body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #1a56db;">Complete Your Mover Profile</h2>
              <p>Hi ${user.name || 'there'},</p>
              <p>${urgency}! Your LervIT mover profile is missing a few things that help customers choose you.</p>
              <p><strong>What's still needed:</strong> ${stillNeeded}</p>
              <p style="background: #f0f9ff; padding: 12px; border-radius: 6px; border-left: 4px solid #1a56db;">
                <strong>Did you know?</strong> ${benefit}
              </p>
              <p>It only takes a few minutes to complete, and you'll start receiving job matches right away.</p>
              <p style="margin-top: 16px;">
                <strong>Need help?</strong> Watch our quick tutorial video: 
                <a href="https://youtu.be/qaRKHwrUTQU?si=EuPfgMvyVkm9l4Ro" style="color: #1a56db;">How to Complete Your Mover Profile</a>
              </p>
              <div style="margin: 24px 0;">
                <a href="${baseUrl}/mover-onboarding" 
                   style="background-color: #1a56db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  Complete My Profile
                </a>
              </div>
              <p style="color: #666; font-size: 14px;">
                Questions? Reply to this email or visit our support page.
              </p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
              <p style="color: #999; font-size: 12px;">
                You're receiving this because you signed up as a mover on LervIT but haven't completed your profile yet.
              </p>
            </div>`,
          });
          emailsSent++;
        } catch (err) {
          console.error(`[Profile Reminder] Failed to send email to ${user.email}:`, err);
        }
      }
      
      // Send SMS reminder (only for 2nd and 3rd reminders to avoid spamming)
      if (user.phone && reminderNumber >= 2) {
        try {
          const smsMessage = `LervIT: ${urgency}! Complete your mover profile to start receiving jobs. ${benefit}. Takes 2 min: ${baseUrl}/mover-onboarding`;
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
