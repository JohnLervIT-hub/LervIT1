import type { Booking, User, Mover } from "@shared/schema";
import { Resend } from 'resend';

// Initialize Resend client
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Telnyx configuration
const telnyxApiKey = process.env.TELNYX_API_KEY;
const telnyxPhoneNumber = process.env.TELNYX_PHONE_NUMBER;

// Email notification service with Resend integration
export interface EmailNotification {
  to: string;
  subject: string;
  body: string;
  type: 'booking_confirmation' | 'job_assignment' | 'payment_receipt' | 'status_update' | 'pilot_status';
}

// SMS notification interface
export interface SMSNotification {
  to: string;
  message: string;
  type: 'job_alert' | 'booking_update' | 'payment_confirmation' | 'pilot_status' | 'phone_verification';
}

// Helper function to extract first name from full name
function getFirstName(fullName: string | null | undefined): string {
  if (!fullName) return 'there';
  const firstName = fullName.split(' ')[0];
  return firstName || 'there';
}

class NotificationService {
  private fromEmail = 'LervIT <support@lervit.com>';
  
  // Send phone verification code via SMS
  async sendPhoneVerificationCode(phone: string, code: string): Promise<boolean> {
    const message = `Your LervIT verification code is: ${code}. This code expires in 10 minutes.`;
    return this.sendSMS({
      to: phone,
      message,
      type: 'phone_verification' as any,
    });
  }

  // Send SMS via Telnyx REST API
  async sendSMS(notification: SMSNotification): Promise<boolean> {
    console.log('\n[SMS] Sending notification:');
    console.log('To:', notification.to);
    console.log('From:', telnyxPhoneNumber ? `${telnyxPhoneNumber.slice(0, 4)}****${telnyxPhoneNumber.slice(-2)}` : 'NOT SET');
    console.log('Type:', notification.type);
    
    if (!telnyxApiKey || !telnyxPhoneNumber) {
      console.log('[SMS] Telnyx not configured - SMS logged only');
      // Mask verification codes in logs for security
      const maskedMessage = notification.type === 'phone_verification' 
        ? notification.message.replace(/\d{6}/, '******')
        : notification.message;
      console.log('Message:', maskedMessage);
      console.log('---\n');
      return false;
    }
    
    try {
      // Format phone number for Telnyx (ensure E.164 format)
      let formattedPhone = notification.to.replace(/[^0-9+]/g, '');
      if (!formattedPhone.startsWith('+')) {
        // Assume Canadian number if no country code
        formattedPhone = formattedPhone.startsWith('1') ? `+${formattedPhone}` : `+1${formattedPhone}`;
      }
      
      const response = await fetch('https://api.telnyx.com/v2/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${telnyxApiKey}`,
        },
        body: JSON.stringify({
          from: telnyxPhoneNumber,
          to: formattedPhone,
          text: notification.message,
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        console.error('[SMS] Telnyx API error:', result);
        return false;
      }
      
      console.log('[SMS] Sent successfully! ID:', result.data?.id);
      console.log('---\n');
      return true;
    } catch (error: any) {
      console.error('[SMS] Failed to send:', error.message);
      console.log('---\n');
      return false;
    }
  }
  
  async sendEmail(notification: EmailNotification): Promise<void> {
    // Log for debugging
    console.log('\n[EMAIL] Sending notification:');
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
          console.log('[EMAIL] Sent successfully! ID:', data?.id);
        }
      } catch (error) {
        console.error('Failed to send email:', error);
      }
    } else {
      console.log('[EMAIL] Resend not configured - email logged only');
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
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 20px 0;">Hi ${getFirstName(customer.name)},</p>
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

  // Job assignment email to mover - urgent notification with 10min expiry
  async sendJobAssignment(mover: User, booking: Partial<Booking>, estimatedEarnings: string, distanceToPickup?: string): Promise<void> {
    const baseUrl = process.env.BASE_URL || 
      (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'https://app.lervit.com');
    const dashboardUrl = `${baseUrl}/mover-dashboard`;
    
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
      : 'ASAP';
    
    const subject = `[URGENT] NEW JOB - Earn $${estimatedEarnings} CAD (Expires in 10 min)`;
    const body = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <!-- Header with urgency -->
          <tr>
            <td style="background-color:#EA580C;padding:30px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;">New Job Available!</h1>
              <p style="color:#ffffff;margin:10px 0 0 0;font-size:14px;">TIME SENSITIVE - This opportunity expires in 10 minutes</p>
            </td>
          </tr>
          <!-- Earnings highlight -->
          <tr>
            <td style="background-color:#FFF7ED;padding:20px;text-align:center;border-bottom:1px solid #EA580C;">
              <p style="color:#9A3412;margin:0;font-size:14px;">Your Estimated Earnings</p>
              <p style="color:#EA580C;margin:5px 0 0 0;font-size:36px;font-weight:bold;">$${estimatedEarnings} CAD</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:30px;">
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 20px 0;">Hi ${getFirstName(mover.name)},</p>
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 25px 0;">A customer near you needs help moving. Here are the details:</p>
              
              <h3 style="color:#333333;font-size:16px;margin:0 0 15px 0;border-bottom:1px solid #eee;padding-bottom:10px;">Job Details</h3>
              <table width="100%" style="margin-bottom:25px;">
                <tr>
                  <td style="padding:8px 0;color:#555555;font-size:14px;"><strong>Pickup:</strong></td>
                  <td style="padding:8px 0;color:#333333;font-size:14px;">${booking.pickupAddress}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#555555;font-size:14px;"><strong>Dropoff:</strong></td>
                  <td style="padding:8px 0;color:#333333;font-size:14px;">${booking.dropoffAddress}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#555555;font-size:14px;"><strong>When:</strong></td>
                  <td style="padding:8px 0;color:#333333;font-size:14px;">${formattedDate}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#555555;font-size:14px;"><strong>Load Size:</strong></td>
                  <td style="padding:8px 0;color:#333333;font-size:14px;">${booking.loadSize || 'Standard'}</td>
                </tr>
                ${distanceToPickup ? `<tr>
                  <td style="padding:8px 0;color:#555555;font-size:14px;"><strong>Distance to Pickup:</strong></td>
                  <td style="padding:8px 0;color:#333333;font-size:14px;">${distanceToPickup} km</td>
                </tr>` : ''}
              </table>
              
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 25px 0;">
                <tr>
                  <td align="center">
                    <a href="${dashboardUrl}" style="display:inline-block;background-color:#EA580C;color:#ffffff;font-size:18px;font-weight:bold;text-decoration:none;padding:15px 40px;border-radius:6px;">Accept This Job</a>
                  </td>
                </tr>
              </table>
              
              <p style="color:#888888;font-size:13px;line-height:20px;margin:0;text-align:center;">
                IMPORTANT: First mover to accept gets the job. Don't miss out!
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

    await this.sendEmail({
      to: mover.email,
      subject,
      body,
      type: 'job_assignment',
    });
    
    // Also send SMS if mover has a phone number
    if (mover.phone) {
      const smsMessage = `LervIT: NEW JOB - $${estimatedEarnings} CAD. ${booking.loadSize || 'Standard'} load. Expires in 10 min! Open app to accept: ${dashboardUrl}`;
      await this.sendSMS({
        to: mover.phone,
        message: smsMessage,
        type: 'job_alert',
      });
    }
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
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 20px 0;">Hi ${getFirstName(customer.name)},</p>
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

  // Payment reminder email/SMS to customer (15 minutes before expiry)
  async sendPaymentReminder(customer: User, booking: Partial<Booking>): Promise<void> {
    const subject = `Complete Payment - Your booking expires in 15 minutes!`;
    const paymentUrl = `https://lervit.replit.app/payment/${booking.id}`;
    const firstName = getFirstName(customer.name);
    
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
            <td style="background-color:#f97316;padding:30px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;">LervIT</h1>
              <p style="color:#ffffff;margin:10px 0 0 0;font-size:16px;">Urgent: Complete Your Payment</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px 30px;">
              <h2 style="color:#333333;margin:0 0 20px 0;font-size:22px;">Your Booking Expires Soon!</h2>
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 20px 0;">Hi ${firstName},</p>
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 30px 0;">Your booking will expire in 15 minutes if payment is not completed. Complete payment now to notify movers in your area.</p>
              
              <h3 style="color:#333333;font-size:18px;margin:0 0 15px 0;">Move Details:</h3>
              <ul style="color:#555555;font-size:15px;line-height:28px;margin:0 0 30px 0;padding-left:20px;">
                <li><strong>Price:</strong> $${booking.price || '0'} CAD</li>
                <li><strong>Pickup:</strong> ${booking.pickupAddress}</li>
                <li><strong>Dropoff:</strong> ${booking.dropoffAddress}</li>
              </ul>
              
              <table cellpadding="0" cellspacing="0" style="margin:30px 0;">
                <tr>
                  <td style="background-color:#f97316;border-radius:6px;padding:14px 28px;">
                    <a href="${paymentUrl}" style="color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;">Complete Payment Now</a>
                  </td>
                </tr>
              </table>
              
              <p style="color:#888888;font-size:14px;line-height:20px;margin:0;">If you no longer need this move, you can ignore this email and the booking will be automatically cancelled.</p>
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
      type: 'status_update',
    });
    
    // Also send SMS reminder if customer has a phone number
    if (customer.phone) {
      const smsMessage = `LervIT: Your booking expires in 15 min! Complete payment now to book your move: ${paymentUrl}`;
      await this.sendSMS({
        to: customer.phone,
        message: smsMessage,
        type: 'booking_update',
      });
    }
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
      <p>Hi ${getFirstName(user.name)},</p>
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

  // Job acceptance notification to customer (email + SMS) - Uber-style with mover details
  async sendMoverAssigned(customer: User, mover: User, booking: Partial<Booking>, moverProfile?: Partial<Mover>): Promise<void> {
    const vehicleType = moverProfile?.vehicleType || 'Vehicle';
    const vehicleColor = moverProfile?.vehicleColor || '';
    const licensePlate = moverProfile?.licensePlate || '';
    const rating = moverProfile?.rating || '0';
    const completedTrips = moverProfile?.completedTrips || 0;
    
    // Format vehicle display (e.g., "White Pickup Truck")
    const vehicleDisplay = vehicleColor 
      ? `${vehicleColor} ${vehicleType.charAt(0).toUpperCase() + vehicleType.slice(1)}`
      : vehicleType.charAt(0).toUpperCase() + vehicleType.slice(1);
    
    const subject = `Your Mover is Confirmed - Move #${booking.id?.slice(0, 8)}`;
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
              <p style="color:#ffffff;margin:10px 0 0 0;font-size:14px;">Your mover is on the way!</p>
            </td>
          </tr>
          <!-- Mover Card -->
          <tr>
            <td style="padding:30px;">
              <h2 style="color:#333333;margin:0 0 20px 0;font-size:20px;">Meet Your Mover</h2>
              
              <!-- Mover Info Box -->
              <table width="100%" style="background-color:#f8f9fa;border-radius:8px;padding:20px;margin-bottom:25px;">
                <tr>
                  <td style="padding:15px;">
                    <h3 style="color:#333333;margin:0 0 5px 0;font-size:22px;">${mover.name}</h3>
                    <p style="color:#666666;margin:0 0 10px 0;font-size:14px;">
                      <span style="color:#FFB800;">★</span> ${parseFloat(rating as string).toFixed(1)} rating · ${completedTrips} completed trips
                    </p>
                    
                    <!-- Vehicle Details -->
                    <table style="margin-top:15px;width:100%;">
                      <tr>
                        <td style="padding:8px 0;border-top:1px solid #e0e0e0;">
                          <span style="color:#888888;font-size:13px;">VEHICLE</span><br/>
                          <span style="color:#333333;font-size:16px;font-weight:bold;">${vehicleDisplay}</span>
                        </td>
                      </tr>
                      ${licensePlate ? `
                      <tr>
                        <td style="padding:8px 0;border-top:1px solid #e0e0e0;">
                          <span style="color:#888888;font-size:13px;">LICENSE PLATE</span><br/>
                          <span style="color:#333333;font-size:18px;font-weight:bold;letter-spacing:2px;">${licensePlate}</span>
                        </td>
                      </tr>
                      ` : ''}
                      <tr>
                        <td style="padding:8px 0;border-top:1px solid #e0e0e0;">
                          <span style="color:#888888;font-size:13px;">CONTACT</span><br/>
                          <span style="color:#333333;font-size:14px;">${mover.phone || mover.email}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- Move Details -->
              <h3 style="color:#333333;font-size:16px;margin:0 0 15px 0;border-bottom:1px solid #eee;padding-bottom:10px;">Move Details</h3>
              <table width="100%" style="margin-bottom:25px;">
                <tr>
                  <td style="padding:8px 0;color:#555555;font-size:14px;"><strong>From:</strong></td>
                  <td style="padding:8px 0;color:#333333;font-size:14px;">${booking.pickupAddress}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#555555;font-size:14px;"><strong>To:</strong></td>
                  <td style="padding:8px 0;color:#333333;font-size:14px;">${booking.dropoffAddress}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#555555;font-size:14px;"><strong>When:</strong></td>
                  <td style="padding:8px 0;color:#333333;font-size:14px;">${booking.preferredDate ? new Date(booking.preferredDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'ASAP'}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#555555;font-size:14px;"><strong>Total:</strong></td>
                  <td style="padding:8px 0;color:#333333;font-size:16px;font-weight:bold;">$${booking.price} CAD</td>
                </tr>
              </table>
              
              <p style="color:#555555;font-size:14px;line-height:22px;margin:0;">
                You can message your mover through the LervIT app. Have a great move!
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f8f8;padding:20px 30px;text-align:center;border-top:1px solid #eeeeee;">
              <p style="color:#888888;font-size:12px;margin:0;">&copy; ${new Date().getFullYear()} LervIT. Calgary's Smart Moving Platform.</p>
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
      type: 'status_update',
    });
    
    // Also send SMS to customer if they have a phone number - Uber style with vehicle details
    if (customer.phone) {
      const plateInfo = licensePlate ? ` Plate: ${licensePlate}.` : '';
      const smsMessage = `LervIT: ${mover.name} is your mover! ${vehicleDisplay}.${plateInfo} Track your move in the app.`;
      await this.sendSMS({
        to: customer.phone,
        message: smsMessage,
        type: 'booking_update',
      });
    }
  }

  // Password reset email
  async sendPasswordReset(email: string, name: string, resetToken: string): Promise<void> {
    // In development, prioritize the dev domain to ensure tokens work correctly
    const isProduction = process.env.NODE_ENV === 'production';
    const baseUrl = isProduction 
      ? (process.env.BASE_URL || 'https://app.lervit.com')
      : (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : (process.env.BASE_URL || 'https://app.lervit.com'));
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

  // Email verification email
  async sendVerificationEmail(email: string, name: string, verificationToken: string): Promise<void> {
    // In development, prioritize the dev domain to ensure tokens work correctly
    const isProduction = process.env.NODE_ENV === 'production';
    const baseUrl = isProduction 
      ? (process.env.BASE_URL || 'https://app.lervit.com')
      : (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : (process.env.BASE_URL || 'https://app.lervit.com'));
    const verifyUrl = `${baseUrl}/verify-email?token=${verificationToken}`;
    const subject = 'Verify Your LervIT Email Address';
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
              <p style="color:#ffffff;margin:10px 0 0 0;font-size:14px;">Welcome to Calgary's Smart Moving Platform</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px 30px;">
              <h2 style="color:#333333;margin:0 0 20px 0;font-size:22px;">Verify Your Email</h2>
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 20px 0;">Hi ${name},</p>
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 30px 0;">Thanks for signing up for LervIT! Please verify your email address by clicking the button below:</p>
              
              <!-- Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 30px auto;">
                <tr>
                  <td style="background-color:#4CAF50;border-radius:6px;padding:15px 40px;">
                    <a href="${verifyUrl}" style="color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;display:inline-block;">Verify Email Address</a>
                  </td>
                </tr>
              </table>
              
              <p style="color:#555555;font-size:14px;line-height:22px;margin:0 0 10px 0;">Or copy this link into your browser:</p>
              <p style="color:#4CAF50;font-size:14px;line-height:22px;margin:0 0 30px 0;word-break:break-all;">
                <a href="${verifyUrl}" style="color:#4CAF50;">${verifyUrl}</a>
              </p>
              
              <p style="color:#888888;font-size:14px;line-height:22px;margin:0 0 10px 0;"><strong>This link expires in 24 hours.</strong></p>
              <p style="color:#888888;font-size:14px;line-height:22px;margin:0;">If you didn't create a LervIT account, you can safely ignore this email.</p>
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

  // Welcome email after verification - different templates for customers and movers
  async sendWelcomeEmail(email: string, name: string, role: string = 'customer'): Promise<void> {
    const baseUrl = process.env.BASE_URL || 
      (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'https://app.lervit.com');
    
    const isMover = role === 'mover';
    const subject = isMover 
      ? 'Welcome to LervIT - Start Earning Today!'
      : 'Welcome to LervIT - Your Moving Made Easy!';
    
    const dashboardUrl = isMover ? `${baseUrl}/mover-dashboard` : `${baseUrl}/dashboard`;
    
    // Customer-specific content
    const customerContent = `
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 25px 0;">Your email has been verified and you're all set to use LervIT! Here's what you can do:</p>
              
              <table width="100%" style="margin-bottom:30px;">
                <tr>
                  <td style="padding:15px;background-color:#f8f9fa;border-radius:8px;margin-bottom:10px;">
                    <h3 style="color:#333333;margin:0 0 8px 0;font-size:16px;">📦 Book Your First Move</h3>
                    <p style="color:#666666;margin:0;font-size:14px;">Get matched with trusted local movers in minutes</p>
                  </td>
                </tr>
                <tr><td style="height:10px;"></td></tr>
                <tr>
                  <td style="padding:15px;background-color:#f8f9fa;border-radius:8px;margin-bottom:10px;">
                    <h3 style="color:#333333;margin:0 0 8px 0;font-size:16px;">💰 Transparent Pricing</h3>
                    <p style="color:#666666;margin:0;font-size:14px;">Know exactly what you'll pay before you book - no hidden fees</p>
                  </td>
                </tr>
                <tr><td style="height:10px;"></td></tr>
                <tr>
                  <td style="padding:15px;background-color:#f8f9fa;border-radius:8px;">
                    <h3 style="color:#333333;margin:0 0 8px 0;font-size:16px;">📍 Track Your Move</h3>
                    <p style="color:#666666;margin:0;font-size:14px;">Real-time updates and direct messaging with your mover</p>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 25px auto;">
                <tr>
                  <td style="background-color:#4CAF50;border-radius:6px;padding:15px 40px;">
                    <a href="${dashboardUrl}" style="color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;display:inline-block;">Start Your First Move</a>
                  </td>
                </tr>
              </table>`;
    
    // Mover-specific content
    const moverContent = `
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 25px 0;">Your email has been verified and you're ready to start earning with LervIT! Here's how to get started:</p>
              
              <table width="100%" style="margin-bottom:30px;">
                <tr>
                  <td style="padding:15px;background-color:#f8f9fa;border-radius:8px;margin-bottom:10px;">
                    <h3 style="color:#333333;margin:0 0 8px 0;font-size:16px;">🚚 Complete Your Profile</h3>
                    <p style="color:#666666;margin:0;font-size:14px;">Add your vehicle details, availability, and service areas to start receiving job offers</p>
                  </td>
                </tr>
                <tr><td style="height:10px;"></td></tr>
                <tr>
                  <td style="padding:15px;background-color:#f8f9fa;border-radius:8px;margin-bottom:10px;">
                    <h3 style="color:#333333;margin:0 0 8px 0;font-size:16px;">✅ Get Verified</h3>
                    <p style="color:#666666;margin:0;font-size:14px;">Upload your documents for verification to unlock more job opportunities</p>
                  </td>
                </tr>
                <tr><td style="height:10px;"></td></tr>
                <tr>
                  <td style="padding:15px;background-color:#f8f9fa;border-radius:8px;margin-bottom:10px;">
                    <h3 style="color:#333333;margin:0 0 8px 0;font-size:16px;">💵 Set Up Payouts</h3>
                    <p style="color:#666666;margin:0;font-size:14px;">Connect your Stripe account to receive fast, secure payments</p>
                  </td>
                </tr>
                <tr><td style="height:10px;"></td></tr>
                <tr>
                  <td style="padding:15px;background-color:#f8f9fa;border-radius:8px;">
                    <h3 style="color:#333333;margin:0 0 8px 0;font-size:16px;">📱 Accept Jobs</h3>
                    <p style="color:#666666;margin:0;font-size:14px;">Get notified of nearby jobs via SMS and accept with one tap</p>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 25px auto;">
                <tr>
                  <td style="background-color:#4CAF50;border-radius:6px;padding:15px 40px;">
                    <a href="${dashboardUrl}" style="color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;display:inline-block;">Go to Mover Dashboard</a>
                  </td>
                </tr>
              </table>`;
    
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
              <h1 style="color:#ffffff;margin:0;font-size:28px;">Welcome to LervIT${isMover ? ', Partner!' : '!'}</h1>
              ${isMover ? '<p style="color:#ffffff;margin:10px 0 0 0;font-size:14px;">Join Calgary\'s Growing Network of Movers</p>' : ''}
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px 30px;">
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 20px 0;">Hi ${name},</p>
              ${isMover ? moverContent : customerContent}
              
              <p style="color:#555555;font-size:14px;line-height:22px;margin:0;text-align:center;">Questions? Just reply to this email - we're here to help!</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f8f8;padding:20px 30px;text-align:center;border-top:1px solid #eeeeee;">
              <p style="color:#888888;font-size:12px;margin:0;">© ${new Date().getFullYear()} LervIT. Calgary's Smart Moving Platform.</p>
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

  async sendPilotStatusUpdate(
    user: User, 
    newStatus: string, 
    notes?: string
  ): Promise<void> {
    const baseUrl = process.env.BASE_URL || 
      (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'https://app.lervit.com');
    const dashboardUrl = `${baseUrl}/mover-dashboard`;

    const statusMessages: Record<string, { title: string; message: string; color: string }> = {
      approved: {
        title: "You're Approved for Early Access!",
        message: "Congratulations! You've been approved for the LervIT Early Access Program. You can now start accepting jobs on the platform.",
        color: "#22C55E"
      },
      pending: {
        title: "Early Access Application Received",
        message: "Your application for the LervIT Early Access Program is being reviewed. We'll notify you once a decision is made.",
        color: "#3B82F6"
      },
      rejected: {
        title: "Early Access Application Update",
        message: "Unfortunately, your application for the LervIT Early Access Program was not approved at this time.",
        color: "#EF4444"
      },
      suspended: {
        title: "Early Access Status Update",
        message: "Your Early Access status has been temporarily suspended. Please contact support for more information.",
        color: "#F59E0B"
      },
      none: {
        title: "Early Access Status Update",
        message: "Your Early Access status has been updated.",
        color: "#6B7280"
      }
    };

    const statusInfo = statusMessages[newStatus] || statusMessages.none;
    const subject = `LervIT: ${statusInfo.title}`;

    const body = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background-color:${statusInfo.color};padding:30px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;">${statusInfo.title}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:30px;">
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 20px 0;">Hi ${getFirstName(user.name)},</p>
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 20px 0;">${statusInfo.message}</p>
              ${notes ? `
              <div style="background-color:#F3F4F6;border-left:4px solid ${statusInfo.color};padding:15px;margin:20px 0;border-radius:4px;">
                <p style="color:#374151;font-size:14px;margin:0;"><strong>Admin Notes:</strong></p>
                <p style="color:#555555;font-size:14px;margin:10px 0 0 0;">${notes}</p>
              </div>
              ` : ''}
              ${newStatus === 'approved' ? `
              <table cellpadding="0" cellspacing="0" style="margin:25px 0;">
                <tr>
                  <td style="background-color:${statusInfo.color};border-radius:6px;padding:15px 30px;">
                    <a href="${dashboardUrl}" style="color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;display:inline-block;">Go to Dashboard</a>
                  </td>
                </tr>
              </table>
              ` : ''}
              <p style="color:#888888;font-size:14px;line-height:22px;margin:20px 0 0 0;">If you have any questions, please contact our support team.</p>
            </td>
          </tr>
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
      to: user.email,
      subject,
      body,
      type: 'pilot_status',
    });

    if (user.phone) {
      let smsMessage = '';
      switch (newStatus) {
        case 'approved':
          smsMessage = `LervIT: Congrats! You've been approved for Early Access. Start accepting jobs now: ${dashboardUrl}`;
          break;
        case 'pending':
          smsMessage = `LervIT: Your Early Access application is being reviewed. We'll notify you when there's an update.`;
          break;
        case 'rejected':
          smsMessage = `LervIT: Your Early Access application update - please check your email for details.`;
          break;
        case 'suspended':
          smsMessage = `LervIT: Your Early Access status has been updated. Please check your email for details.`;
          break;
        default:
          smsMessage = `LervIT: Your Early Access status has been updated. Check your email for details.`;
      }

      await this.sendSMS({
        to: user.phone,
        message: smsMessage,
        type: 'pilot_status',
      });
    }
  }

  // Send campaign email (for admin bulk/personal emails)
  async sendCampaignEmail(
    recipientEmail: string,
    recipientName: string,
    subject: string,
    content: string,
    campaignType: string
  ): Promise<boolean> {
    const typeColors: Record<string, string> = {
      account_update: '#3B82F6',
      news: '#8B5CF6',
      promotion: '#F59E0B',
      event: '#10B981',
      personal: '#6366F1',
    };
    
    const headerColor = typeColors[campaignType] || '#4CAF50';
    
    const body = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background-color:${headerColor};padding:30px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;">LervIT</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 30px;">
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 20px 0;">Hi ${getFirstName(recipientName)},</p>
              <div style="color:#333333;font-size:16px;line-height:26px;">
                ${content}
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8f8f8;padding:20px 30px;text-align:center;border-top:1px solid #eeeeee;">
              <p style="color:#888888;font-size:12px;margin:0;">© ${new Date().getFullYear()} LervIT. All rights reserved.</p>
              <p style="color:#aaaaaa;font-size:11px;margin:10px 0 0 0;">You're receiving this because you have an account with LervIT.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    console.log('\n[CAMPAIGN EMAIL] Sending:');
    console.log('To:', recipientEmail);
    console.log('Subject:', subject);
    console.log('Type:', campaignType);
    
    if (resend) {
      try {
        const { data, error } = await resend.emails.send({
          from: this.fromEmail,
          to: recipientEmail,
          replyTo: 'support@lervit.com',
          subject,
          html: body,
        });
        
        if (error) {
          console.error('[CAMPAIGN EMAIL] Resend error:', error);
          return false;
        }
        console.log('[CAMPAIGN EMAIL] Sent successfully! ID:', data?.id);
        return true;
      } catch (error) {
        console.error('[CAMPAIGN EMAIL] Failed:', error);
        return false;
      }
    } else {
      console.log('[CAMPAIGN EMAIL] Resend not configured - logged only');
      return false;
    }
  }

  // Send role upgrade notification email
  async sendRoleUpgradeEmail(user: User, newRole: 'mover' | 'admin'): Promise<void> {
    const roleInfo = {
      mover: {
        title: 'Welcome to LervIT Mover Team!',
        color: '#2196F3',
        description: 'You have been upgraded to a mover account.',
        nextSteps: [
          'Complete your mover profile with vehicle details',
          'Upload required verification documents (driver\'s license, insurance, etc.)',
          'Set your availability to start receiving job requests',
          'Review the mover guidelines and terms of service',
        ],
        cta: 'Go to Mover Dashboard',
        ctaUrl: 'https://lervit.replit.app/mover-profile',
      },
      admin: {
        title: 'Admin Access Granted',
        color: '#9C27B0',
        description: 'You have been granted administrative access to LervIT.',
        nextSteps: [
          'Review the admin dashboard features',
          'Familiarize yourself with user management tools',
          'Check the verification queue for pending documents',
        ],
        cta: 'Go to Admin Dashboard',
        ctaUrl: 'https://lervit.replit.app/admin',
      },
    };

    const info = roleInfo[newRole];
    const subject = info.title;

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
            <td style="background-color:${info.color};padding:30px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;">LervIT</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px 30px;">
              <h2 style="color:#333333;margin:0 0 20px 0;font-size:22px;">${info.title}</h2>
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 20px 0;">Hi ${getFirstName(user.name)},</p>
              <p style="color:#555555;font-size:16px;line-height:24px;margin:0 0 30px 0;">${info.description}</p>
              
              <div style="background-color:#F0F9FF;border-left:4px solid ${info.color};padding:20px;margin:0 0 30px 0;border-radius:4px;">
                <h3 style="color:#333333;font-size:16px;margin:0 0 15px 0;">Next Steps:</h3>
                <ul style="color:#555555;font-size:15px;line-height:28px;margin:0;padding-left:20px;">
                  ${info.nextSteps.map(step => `<li>${step}</li>`).join('')}
                </ul>
              </div>
              
              <table cellpadding="0" cellspacing="0" style="margin:25px 0;">
                <tr>
                  <td style="background-color:${info.color};border-radius:6px;padding:15px 30px;">
                    <a href="${info.ctaUrl}" style="color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;display:inline-block;">${info.cta}</a>
                  </td>
                </tr>
              </table>
              
              <p style="color:#888888;font-size:14px;line-height:22px;margin:20px 0 0 0;">If you have any questions about your new role, please contact our support team at support@lervit.com.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f8f8;padding:20px 30px;text-align:center;border-top:1px solid #eeeeee;">
              <p style="color:#888888;font-size:12px;margin:0;">© ${new Date().getFullYear()} LervIT. All rights reserved.</p>
              <p style="color:#aaaaaa;font-size:11px;margin:10px 0 0 0;">Calgary's Smart Moving Platform</p>
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
      to: user.email,
      subject,
      body,
      type: 'status_update',
    });

    // Also send SMS if phone is available
    if (user.phone) {
      const smsMessage = newRole === 'mover'
        ? `LervIT: Congratulations! You've been upgraded to a Mover account. Complete your profile and start earning: ${info.ctaUrl}`
        : `LervIT: You've been granted admin access. Log in to access the admin dashboard.`;

      await this.sendSMS({
        to: user.phone,
        message: smsMessage,
        type: 'booking_update',
      });
    }

    console.log(`[ROLE UPGRADE] Notification sent to ${user.email} for ${newRole} role`);
  }
}

export const notificationService = new NotificationService();

export const sendPasswordResetEmail = (email: string, name: string, resetToken: string) => 
  notificationService.sendPasswordReset(email, name, resetToken);
