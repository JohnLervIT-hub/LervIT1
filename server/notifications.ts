import type { Booking, User } from "@shared/schema";

// Email notification service
// For MVP: logs to console (can be upgraded to SendGrid/Resend later)
export interface EmailNotification {
  to: string;
  subject: string;
  body: string;
  type: 'booking_confirmation' | 'job_assignment' | 'payment_receipt' | 'status_update';
}

class NotificationService {
  async sendEmail(notification: EmailNotification): Promise<void> {
    // For MVP: log to console
    // In production: integrate with SendGrid/Resend
    console.log('\n📧 EMAIL NOTIFICATION:');
    console.log('To:', notification.to);
    console.log('Subject:', notification.subject);
    console.log('Type:', notification.type);
    console.log('Body:', notification.body);
    console.log('---\n');
    
    // TODO: Integrate with Resend/SendGrid for actual email delivery
    // await resend.emails.send({
    //   from: 'MoveIt <notifications@moveit.com>',
    //   to: notification.to,
    //   subject: notification.subject,
    //   html: notification.body,
    // });
  }

  // Booking confirmation email to customer
  async sendBookingConfirmation(customer: User, booking: Partial<Booking>): Promise<void> {
    const subject = `Booking Confirmed - Move #${booking.id?.slice(0, 8)}`;
    const body = `
      <h2>Your Move is Confirmed!</h2>
      <p>Hi ${customer.name},</p>
      <p>Your booking has been confirmed and we're finding the best mover for you.</p>
      
      <h3>Booking Details:</h3>
      <ul>
        <li><strong>Pickup:</strong> ${booking.pickupAddress}</li>
        <li><strong>Dropoff:</strong> ${booking.dropoffAddress}</li>
        <li><strong>Date:</strong> ${booking.preferredDate}</li>
        <li><strong>Load Size:</strong> ${booking.loadSize}</li>
      </ul>
      
      <p>You'll receive another email once a mover accepts your job.</p>
      
      <p>Thanks for choosing MoveIt!</p>
    `;

    await this.sendEmail({
      to: customer.email,
      subject,
      body,
      type: 'booking_confirmation',
    });
  }

  // Job assignment email to mover
  async sendJobAssignment(mover: User, booking: Partial<Booking>, estimatedEarnings: string): Promise<void> {
    const subject = `New Job Opportunity - Earn $${estimatedEarnings}`;
    const body = `
      <h2>New Job Available!</h2>
      <p>Hi ${mover.name},</p>
      <p>A new moving job matching your profile is available.</p>
      
      <h3>Job Details:</h3>
      <ul>
        <li><strong>Pickup:</strong> ${booking.pickupAddress}</li>
        <li><strong>Dropoff:</strong> ${booking.dropoffAddress}</li>
        <li><strong>Date:</strong> ${booking.preferredDate}</li>
        <li><strong>Load Size:</strong> ${booking.loadSize}</li>
        <li><strong>Estimated Earnings:</strong> $${estimatedEarnings} CAD</li>
      </ul>
      
      <p>Log in to your MoveIt dashboard to accept this job before it expires.</p>
      
      <p>Good luck!</p>
    `;

    await this.sendEmail({
      to: mover.email,
      subject,
      body,
      type: 'job_assignment',
    });
  }

  // Payment receipt email to customer
  async sendPaymentReceipt(customer: User, booking: Partial<Booking>, amount: string): Promise<void> {
    const subject = `Payment Receipt - Move #${booking.id?.slice(0, 8)}`;
    const body = `
      <h2>Payment Received</h2>
      <p>Hi ${customer.name},</p>
      <p>Thank you for your payment! Your move is all set.</p>
      
      <h3>Payment Details:</h3>
      <ul>
        <li><strong>Amount Paid:</strong> $${amount} CAD</li>
        <li><strong>Booking ID:</strong> ${booking.id?.slice(0, 8)}</li>
        <li><strong>Date:</strong> ${booking.preferredDate}</li>
      </ul>
      
      <h3>Move Details:</h3>
      <ul>
        <li><strong>Pickup:</strong> ${booking.pickupAddress}</li>
        <li><strong>Dropoff:</strong> ${booking.dropoffAddress}</li>
      </ul>
      
      <p>Your mover will contact you closer to the move date.</p>
      
      <p>See you soon!</p>
    `;

    await this.sendEmail({
      to: customer.email,
      subject,
      body,
      type: 'payment_receipt',
    });
  }

  // Status update email
  async sendStatusUpdate(user: User, booking: Partial<Booking>, newStatus: string): Promise<void> {
    const statusMessages: Record<string, string> = {
      confirmed: 'Your booking has been confirmed and we are finding a mover for you.',
      in_progress: 'Your move is in progress! The mover is on the way.',
      completed: 'Your move has been completed. Thank you for using MoveIt!',
      cancelled: 'Your booking has been cancelled.',
    };

    const subject = `Booking Update - Move #${booking.id?.slice(0, 8)}`;
    const body = `
      <h2>Booking Status Update</h2>
      <p>Hi ${user.name},</p>
      <p>${statusMessages[newStatus] || 'Your booking status has been updated.'}</p>
      
      <h3>Booking Details:</h3>
      <ul>
        <li><strong>Status:</strong> ${newStatus}</li>
        <li><strong>Pickup:</strong> ${booking.pickupAddress}</li>
        <li><strong>Dropoff:</strong> ${booking.dropoffAddress}</li>
        <li><strong>Date:</strong> ${booking.preferredDate}</li>
      </ul>
      
      <p>Log in to your MoveIt account to view full details.</p>
    `;

    await this.sendEmail({
      to: user.email,
      subject,
      body,
      type: 'status_update',
    });
  }

  // Job acceptance notification to customer
  async sendMoverAssigned(customer: User, mover: User, booking: Partial<Booking>): Promise<void> {
    const subject = `Mover Assigned - Move #${booking.id?.slice(0, 8)}`;
    const body = `
      <h2>Great News! A Mover Has Been Assigned</h2>
      <p>Hi ${customer.name},</p>
      <p>${mover.name} has accepted your moving job!</p>
      
      <h3>Your Mover:</h3>
      <ul>
        <li><strong>Name:</strong> ${mover.name}</li>
        <li><strong>Contact:</strong> ${mover.email}</li>
      </ul>
      
      <h3>Move Details:</h3>
      <ul>
        <li><strong>Pickup:</strong> ${booking.pickupAddress}</li>
        <li><strong>Dropoff:</strong> ${booking.dropoffAddress}</li>
        <li><strong>Date:</strong> ${booking.preferredDate}</li>
        <li><strong>Price:</strong> $${booking.price} CAD</li>
      </ul>
      
      <p>You can message your mover through the MoveIt platform.</p>
      
      <p>Looking forward to your move!</p>
    `;

    await this.sendEmail({
      to: customer.email,
      subject,
      body,
      type: 'status_update',
    });
  }
}

export const notificationService = new NotificationService();
