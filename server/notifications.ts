import type { Booking, User } from "@shared/schema";
import { Resend } from 'resend';

// Initialize Resend client
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Email notification service with Resend integration
export interface EmailNotification {
  to: string;
  subject: string;
  body: string;
  type: 'booking_confirmation' | 'job_assignment' | 'payment_receipt' | 'status_update';
}

class NotificationService {
  private fromEmail = 'LervIT <onboarding@resend.dev>'; // Use your verified domain in production
  
  async sendEmail(notification: EmailNotification): Promise<void> {
    // Log for debugging
    console.log('\n📧 EMAIL NOTIFICATION:');
    console.log('To:', notification.to);
    console.log('Subject:', notification.subject);
    console.log('Type:', notification.type);
    
    // Send real email via Resend
    if (resend) {
      try {
        const { data, error } = await resend.emails.send({
          from: this.fromEmail,
          to: notification.to,
          subject: notification.subject,
          html: notification.body,
        });
        
        if (error) {
          console.error('Resend error:', error);
        } else {
          console.log('✅ Email sent successfully! ID:', data?.id);
        }
      } catch (error) {
        console.error('Failed to send email:', error);
      }
    } else {
      console.log('⚠️ Resend not configured - email logged only');
      console.log('Body:', notification.body);
    }
    console.log('---\n');
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
      
      <p>Thanks for choosing LervIT!</p>
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
      
      <p>Log in to your LervIT dashboard to accept this job before it expires.</p>
      
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
      completed: 'Your move has been completed. Thank you for using LervIT!',
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
      
      <p>Log in to your LervIT account to view full details.</p>
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
      
      <p>You can message your mover through the LervIT platform.</p>
      
      <p>Looking forward to your move!</p>
    `;

    await this.sendEmail({
      to: customer.email,
      subject,
      body,
      type: 'status_update',
    });
  }

  // Password reset email
  async sendPasswordReset(email: string, name: string, resetToken: string): Promise<void> {
    const resetUrl = `${process.env.BASE_URL || 'https://lervit.com'}/reset-password?token=${resetToken}`;
    const subject = 'Reset Your LervIT Password';
    const body = `
      <h2>Password Reset Request</h2>
      <p>Hi ${name},</p>
      <p>We received a request to reset your password for your LervIT account.</p>
      
      <p><strong>Click the link below to reset your password:</strong></p>
      <p><a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 4px;">Reset Password</a></p>
      
      <p>Or copy and paste this link into your browser:</p>
      <p>${resetUrl}</p>
      
      <p><strong>This link will expire in 1 hour.</strong></p>
      
      <p>If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.</p>
      
      <p>Thanks,<br>The LervIT Team</p>
    `;

    await this.sendEmail({
      to: email,
      subject,
      body,
      type: 'status_update',
    });
  }
}

export const notificationService = new NotificationService();

export const sendPasswordResetEmail = (email: string, name: string, resetToken: string) => 
  notificationService.sendPasswordReset(email, name, resetToken);
