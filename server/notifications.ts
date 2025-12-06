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
  private fromEmail = 'LervIT <onboarding@resend.dev>';
  
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
          replyTo: 'support@lervit.com',
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
    const formattedDate = booking.preferredDate 
      ? new Date(booking.preferredDate).toLocaleDateString('en-US', { 
          weekday: 'short', 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short'
        })
      : 'TBD';
    
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
            <td style="background-color:#4CAF50;padding:30px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;">LervIT</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px 30px;">
              <h2 style="color:#333333;margin:0 0 20px 0;font-size:22px;">Your Move is Confirmed!</h2>
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 20px 0;">Hi ${customer.name},</p>
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 30px 0;">Your booking has been confirmed and we're finding the best mover for you.</p>
              
              <h3 style="color:#333333;font-size:18px;margin:0 0 15px 0;">Booking Details:</h3>
              <ul style="color:#555555;font-size:15px;line-height:28px;margin:0 0 30px 0;padding-left:20px;">
                <li><strong>Pickup:</strong> ${booking.pickupAddress}</li>
                <li><strong>Dropoff:</strong> ${booking.dropoffAddress}</li>
                <li><strong>Date:</strong> ${formattedDate}</li>
                <li><strong>Load Size:</strong> ${booking.loadSize}</li>
              </ul>
              
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 20px 0;">You'll receive another email once a mover accepts your job.</p>
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0;">Thanks for choosing LervIT!</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f8f8;padding:20px 30px;text-align:center;border-top:1px solid #eeeeee;">
              <p style="color:#888888;font-size:12px;margin:0;">&copy; ${new Date().getFullYear()} LervIT. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
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
    const formattedDate = booking.preferredDate 
      ? new Date(booking.preferredDate).toLocaleDateString('en-US', { 
          weekday: 'short', 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short'
        })
      : 'TBD';
    
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
            <td style="background-color:#4CAF50;padding:30px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;">LervIT</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px 30px;">
              <h2 style="color:#333333;margin:0 0 20px 0;font-size:22px;">Payment Received</h2>
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 20px 0;">Hi ${customer.name},</p>
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 30px 0;">Thank you for your payment! Your move is all set.</p>
              
              <h3 style="color:#333333;font-size:18px;margin:0 0 15px 0;">Payment Details:</h3>
              <ul style="color:#555555;font-size:15px;line-height:28px;margin:0 0 30px 0;padding-left:20px;">
                <li><strong>Amount Paid:</strong> $${amount} CAD</li>
                <li><strong>Booking ID:</strong> ${booking.id?.slice(0, 8)}</li>
                <li><strong>Date:</strong> ${formattedDate}</li>
              </ul>
              
              <h3 style="color:#333333;font-size:18px;margin:0 0 15px 0;">Move Details:</h3>
              <ul style="color:#555555;font-size:15px;line-height:28px;margin:0 0 30px 0;padding-left:20px;">
                <li><strong>Pickup:</strong> ${booking.pickupAddress}</li>
                <li><strong>Dropoff:</strong> ${booking.dropoffAddress}</li>
              </ul>
              
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 20px 0;">Your mover will contact you closer to the move date.</p>
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0;">See you soon!</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f8f8;padding:20px 30px;text-align:center;border-top:1px solid #eeeeee;">
              <p style="color:#888888;font-size:12px;margin:0;">&copy; ${new Date().getFullYear()} LervIT. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
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
    const baseUrl = process.env.BASE_URL || 
      (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'https://lervit.com');
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
    const subject = 'Reset Your LervIT Password';
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
            <td style="background-color:#4CAF50;padding:30px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;">LervIT</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px 30px;">
              <h2 style="color:#333333;margin:0 0 20px 0;font-size:22px;">Password Reset Request</h2>
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 20px 0;">Hi ${name},</p>
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 30px 0;">We received a request to reset your password for your LervIT account. Click the button below to set a new password:</p>
              
              <!-- Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 30px 0;">
                <tr>
                  <td style="background-color:#4CAF50;border-radius:6px;padding:15px 30px;">
                    <a href="${resetUrl}" style="color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;display:inline-block;">Reset Password</a>
                  </td>
                </tr>
              </table>
              
              <p style="color:#555555;font-size:14px;line-height:22px;margin:0 0 10px 0;">Or copy this link into your browser:</p>
              <p style="color:#4CAF50;font-size:14px;line-height:22px;margin:0 0 30px 0;word-break:break-all;">
                <a href="${resetUrl}" style="color:#4CAF50;">${resetUrl}</a>
              </p>
              
              <p style="color:#888888;font-size:14px;line-height:22px;margin:0 0 10px 0;"><strong>This link expires in 1 hour.</strong></p>
              <p style="color:#888888;font-size:14px;line-height:22px;margin:0;">If you didn't request this, you can safely ignore this email.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f8f8;padding:20px 30px;text-align:center;border-top:1px solid #eeeeee;">
              <p style="color:#888888;font-size:12px;margin:0;">© ${new Date().getFullYear()} LervIT. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
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
