/**
 * Nova Clarke (VOICE) — Telnyx webhook + ElevenLabs agent tool endpoints.
 *
 * The webhook receives `.calls.dial()` status callbacks and mirrors them onto
 * `voice_calls` + `business_events`. The tool endpoints are invoked from the
 * ElevenLabs conversational agent while a call is live, and let Nova look up
 * a quote, send a signup link, or book a move.
 *
 * All lookups from a quote → customer go through the lead attached to the
 * quote (there is no direct quotes.userId column). Bookings can only be
 * created for customers who have already signed up (users row must exist).
 */

import crypto from 'crypto';
import express, { type Request, type Response } from 'express';
import { desc, eq } from 'drizzle-orm';
import {
  bookings,
  leads,
  quotes,
  users,
  voiceCalls,
} from '@shared/schema';
import { db } from './db';
import { emitEvent } from './events';
import { logger } from './logger';
import {
  EMAIL_SENDERS,
  notificationService,
  sendResendEmail,
} from './notifications';
import { victor } from './agents/victor';

const router = express.Router();

const APP_BASE_URL = process.env.APP_BASE_URL ?? 'https://app.lervit.com';

// ─── Telnyx webhook ──────────────────────────────────────────

router.post(
  '/api/nova/webhook',
  express.raw({ type: '*/*' }),
  async (req: Request, res: Response) => {
    res.json({ received: true });

    let payload: any;
    try {
      payload = JSON.parse(req.body.toString());
    } catch {
      return;
    }

    const event = payload?.data;
    const eventType = event?.event_type;
    const callPayload = event?.payload;
    const callControlId = callPayload?.call_control_id;

    const headers = (callPayload?.custom_headers ?? []) as Array<{
      name: string;
      value: string;
    }>;
    const callType = headers.find((h) => h.name === 'X-Nova-Type')?.value;
    const entityId = headers.find((h) => h.name === 'X-Nova-Entity-Id')?.value;

    logger.info({ eventType, callType }, '[Nova Webhook] Event received');

    switch (eventType) {
      case 'call.initiated':
        break;

      case 'call.answered':
        await db
          .update(voiceCalls)
          .set({ status: 'answered' })
          .where(eq(voiceCalls.telnyxCallControlId, callControlId))
          .catch(() => {});

        await emitEvent(
          'nova.call_answered',
          'agent',
          entityId ?? 'nova',
          { callControlId, callType },
          'agent',
        );
        break;

      case 'call.machine.detection.ended': {
        const machineResult = callPayload?.result;
        if (
          machineResult === 'machine_start' ||
          machineResult === 'machine_end_beep'
        ) {
          await emitEvent(
            'nova.voicemail_detected',
            'agent',
            entityId ?? 'nova',
            { callControlId, callType },
            'agent',
          );
        }
        break;
      }

      case 'call.hangup':
        await db
          .update(voiceCalls)
          .set({ status: 'completed' })
          .where(eq(voiceCalls.telnyxCallControlId, callControlId))
          .catch(() => {});

        await emitEvent(
          'nova.call_completed',
          'agent',
          entityId ?? 'nova',
          {
            callControlId,
            callType,
            hangupCause: callPayload?.hangup_cause,
          },
          'agent',
        );
        break;

      default:
        logger.info({ eventType }, '[Nova Webhook] Unhandled event');
    }
  },
);

// ─── Tool 1: lookup_quote ────────────────────────────────────

router.get('/api/nova/quote', async (req: Request, res: Response) => {
  const { phone } = req.query as { phone?: string };

  if (!phone) {
    return res.json({ found: false, message: 'No phone provided' });
  }

  try {
    // Quotes are linked via leads. Find lead by phone first.
    const lead = await db
      .select()
      .from(leads)
      .where(eq(leads.contactPhone, phone))
      .orderBy(desc(leads.createdAt))
      .limit(1);

    if (!lead[0]) {
      return res.json({ found: false, message: 'No lead found' });
    }

    const quote = await db
      .select()
      .from(quotes)
      .where(eq(quotes.leadId, lead[0].id))
      .orderBy(desc(quotes.createdAt))
      .limit(1);

    if (!quote[0]) {
      return res.json({ found: false, message: 'No quote found' });
    }

    return res.json({
      found: true,
      quoteId: quote[0].id,
      shortId: quote[0].shortId,
      totalPrice: quote[0].totalPrice,
      pickupAddress: quote[0].pickupAddress,
      dropoffAddress: quote[0].dropoffAddress,
      quoteUrl: quote[0].shortId
        ? `${APP_BASE_URL}/q/${quote[0].shortId}`
        : `${APP_BASE_URL}/quote/${quote[0].id}`,
      customerName: lead[0].contactName,
    });
  } catch (err) {
    logger.error({ err }, '[Nova] lookup_quote failed');
    return res.json({ found: false, message: 'Lookup failed' });
  }
});

// ─── Tool 2: collect_email ───────────────────────────────────

router.post(
  '/api/nova/collect-email',
  express.json(),
  async (req: Request, res: Response) => {
    const { leadId, email, name, phone, type = 'customer' } = req.body ?? {};

    if (!email) return res.status(400).json({ error: 'email required' });

    try {
      if (leadId) {
        await db
          .update(leads)
          .set({
            contactEmail: email,
            contactName: name || undefined,
          })
          .where(eq(leads.id, leadId));
      }

      const signupUrl =
        type === 'mover'
          ? `${APP_BASE_URL}/signup?role=mover`
          : `${APP_BASE_URL}/signup`;

      if (phone) {
        await notificationService.sendSMS({
          to: phone,
          message:
            `Hi ${name ?? 'there'}! Nova from LervIT. ` +
            `Sign up here: ${signupUrl} ` +
            `Reply STOP to opt out`,
          type: 'pilot_status',
        });
      }

      await sendResendEmail({
        from: EMAIL_SENDERS.OUTREACH,
        to: email,
        subject:
          type === 'mover'
            ? 'Your LervIT mover signup link'
            : 'Complete your LervIT account',
        html: `
          <p>Hi ${name ?? 'there'},</p>
          <p>Great talking with you! Here is your signup link:</p>
          <a href="${signupUrl}"
             style="background:#1e3a5f;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:12px 0;">
            ${type === 'mover' ? 'Complete mover signup' : 'Complete your account'} &rarr;
          </a>
          <p>Takes 5 minutes. Talk soon!</p>
          <p>Nova Clarke<br/>LervIT Moving</p>
        `,
        listUnsubscribeUrl: `${APP_BASE_URL}/preferences`,
      });

      await emitEvent(
        'nova.email_collected',
        'lead',
        leadId ?? email,
        { email, type },
        'agent',
      );

      return res.json({
        success: true,
        message: `Signup link sent to ${email}`,
      });
    } catch (err) {
      logger.error({ err }, '[Nova] collect-email failed');
      return res.status(500).json({ error: 'Failed to process' });
    }
  },
);

// ─── Tool 3: send_signup_link ────────────────────────────────

router.post(
  '/api/nova/send-link',
  express.json(),
  async (req: Request, res: Response) => {
    const { phone, name, type = 'customer', leadId } = req.body ?? {};

    if (!phone) return res.status(400).json({ error: 'phone required' });

    const signupUrl =
      type === 'mover'
        ? `${APP_BASE_URL}/signup?role=mover`
        : `${APP_BASE_URL}/request-move`;

    await notificationService.sendSMS({
      to: phone,
      message:
        `${name ? `Hi ${name}! ` : ''}` +
        `Nova from LervIT. ` +
        `${type === 'mover' ? 'Start earning: ' : 'Get your quote: '}` +
        `${signupUrl} ` +
        `Reply STOP to opt out`,
      type: 'pilot_status',
    });

    if (leadId) {
      await emitEvent(
        'nova.signup_link_sent',
        'lead',
        leadId,
        { phone, type },
        'agent',
      ).catch(() => {});
    }

    return res.json({ success: true, message: `Link sent to ${phone}` });
  },
);

// ─── Tool 4: book_move ───────────────────────────────────────

router.post(
  '/api/nova/book-move',
  express.json(),
  async (req: Request, res: Response) => {
    const {
      quoteId,
      pickupAddress,
      dropoffAddress,
      preferredDate,
      numberOfMovers = 1,
      pickupAccess,
      dropoffAccess,
    } = req.body ?? {};

    if (!quoteId) return res.status(400).json({ error: 'quoteId required' });

    try {
      const quoteRow = await db
        .select()
        .from(quotes)
        .where(eq(quotes.id, quoteId))
        .limit(1);

      if (!quoteRow[0]) return res.status(404).json({ error: 'Quote not found' });

      const quote = quoteRow[0];

      // Quotes have no userId — look up customer via the attached lead's phone.
      if (!quote.leadId) {
        return res.status(400).json({
          error: 'Quote has no attached lead; cannot resolve customer',
        });
      }

      const leadRow = await db
        .select()
        .from(leads)
        .where(eq(leads.id, quote.leadId))
        .limit(1);

      const contactPhone = leadRow[0]?.contactPhone;
      const contactEmail = leadRow[0]?.contactEmail;

      let customer: {
        id: string;
        name: string;
        phone: string | null;
        email: string;
        stripeCustomerId: string | null;
      } | null = null;

      if (contactPhone) {
        const rows = await db
          .select({
            id: users.id,
            name: users.name,
            phone: users.phone,
            email: users.email,
            stripeCustomerId: users.stripeCustomerId,
          })
          .from(users)
          .where(eq(users.phone, contactPhone))
          .limit(1);
        customer = rows[0] ?? null;
      }

      if (!customer && contactEmail) {
        const rows = await db
          .select({
            id: users.id,
            name: users.name,
            phone: users.phone,
            email: users.email,
            stripeCustomerId: users.stripeCustomerId,
          })
          .from(users)
          .where(eq(users.email, contactEmail))
          .limit(1);
        customer = rows[0] ?? null;
      }

      if (!customer) {
        return res.status(404).json({
          error: 'Customer not found — signup required first',
        });
      }

      if (!customer.stripeCustomerId) {
        return res.json({
          success: false,
          action: 'send_payment_link',
          message: 'No saved payment. Sending checkout link.',
          checkoutUrl: `${APP_BASE_URL}/quote/${quoteId}`,
        });
      }

      const bookingId = crypto.randomUUID();

      await db.insert(bookings).values({
        id: bookingId,
        customerId: customer.id,
        pickupAddress: pickupAddress ?? quote.pickupAddress,
        dropoffAddress: dropoffAddress ?? quote.dropoffAddress ?? quote.pickupAddress,
        loadSize: quote.loadSize ?? 'medium',
        preferredDate: preferredDate ? new Date(preferredDate) : new Date(),
        numberOfMovers,
        pickupDifficulty: pickupAccess ?? 'ground',
        dropoffDifficulty: dropoffAccess ?? 'ground',
        price: quote.totalPrice ?? '0',
        status: 'pending',
        paymentStatus: 'pending',
      });

      await victor
        .run('dispatch', { bookingId })
        .catch((err) =>
          logger.error({ err }, '[Nova] Victor dispatch failed'),
        );

      if (customer.phone) {
        await notificationService.sendSMS({
          to: customer.phone,
          message:
            `LervIT booking confirmed! Finding you a mover now. ` +
            `Track: ${APP_BASE_URL}/track/${bookingId}`,
          type: 'booking_update',
        });
      }

      await emitEvent(
        'nova.booking_created',
        'booking',
        bookingId,
        {
          bookingId,
          customerId: customer.id,
          quoteId,
          source: 'nova_voice',
        },
        'agent',
      );

      logger.info({ bookingId, quoteId }, '[Nova] Live booking created');

      return res.json({
        success: true,
        bookingId,
        message: `Booking confirmed! Confirmation sent to ${customer.phone ?? customer.email}`,
      });
    } catch (err) {
      logger.error({ err }, '[Nova] book-move failed');
      return res.status(500).json({ error: 'Booking failed' });
    }
  },
);

// ─── Tool 5: signup ──────────────────────────────────────────

router.post(
  '/api/nova/signup',
  express.json(),
  async (req: Request, res: Response) => {
    const { email, name, phone, account_type, lead_id } = req.body ?? {};

    if (!email || !name || !phone) {
      return res
        .status(400)
        .json({ error: 'email, name and phone required' });
    }

    try {
      const params = new URLSearchParams({ email, name });
      if (account_type === 'mover') params.set('role', 'mover');
      params.set('phone', phone);

      const signupUrl = `${APP_BASE_URL}/signup?${params.toString()}`;

      await sendResendEmail({
        from: EMAIL_SENDERS.TRANSACTIONAL,
        to: email,
        subject:
          account_type === 'mover'
            ? 'Complete your LervIT mover signup'
            : 'Welcome to LervIT — complete your account',
        html: `
          <p>Hi ${name},</p>
          <p>Nova from LervIT here! Great chatting with you.</p>
          <p>Click below to complete your account setup:</p>
          <a href="${signupUrl}"
             style="background:#1e3a5f;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:12px 0;">
            Complete signup &rarr;
          </a>
          <p>Takes 5 minutes. Welcome to LervIT!</p>
          <p>Nova Clarke<br/>LervIT Moving</p>
        `,
        listUnsubscribeUrl: `${APP_BASE_URL}/preferences`,
      });

      await notificationService.sendSMS({
        to: phone,
        message:
          `Hi ${name}! Nova from LervIT. ` +
          `Complete your signup: ${signupUrl} ` +
          `Reply STOP to opt out`,
        type: 'pilot_status',
      });

      if (lead_id) {
        await db
          .update(leads)
          .set({
            contactEmail: email,
            contactName: name,
            contactPhone: phone,
            status: 'contacted',
          })
          .where(eq(leads.id, lead_id));
      }

      await emitEvent(
        'nova.signup_initiated',
        'lead',
        lead_id ?? email,
        { email, name, phone, account_type },
        'agent',
      );

      logger.info({ email, account_type }, '[Nova] Signup initiated on call');

      return res.json({
        success: true,
        message: `Signup link sent to ${email} and ${phone}`,
      });
    } catch (err) {
      logger.error({ err }, '[Nova] signup failed');
      return res.status(500).json({ error: 'Signup failed' });
    }
  },
);

export { router as novaWebhookRouter };
