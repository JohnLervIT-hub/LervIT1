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
import Anthropic from '@anthropic-ai/sdk';
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
import { xavier } from './agents/xavier';
import { geocodeAddress, getDrivingDistance } from './google-maps';
import { buildCustomerContext } from './lib/novaContext';
import { decideNextDMResponse } from './lib/novaReasoning';
import { resolveIdentity } from './lib/identityResolver';

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

      // FIX 1 — reject rather than fall back pickup→dropoff (which would
      // create a same-address booking and confuse dispatch).
      const finalPickup = pickupAddress ?? quote.pickupAddress;
      const finalDropoff = dropoffAddress ?? quote.dropoffAddress;

      if (!finalDropoff) {
        return res.json({
          success: false,
          action: 'collect_dropoff',
          message:
            'I need the dropoff address to complete your booking. Where would you like your items delivered?',
        });
      }

      // FIX 2 — geocode + driving distance so lat/lng and distance are real.
      // google-maps.ts falls back to Haversine / mock geocoder if no API key,
      // so this never fails hard.
      const [pickupGeo, dropoffGeo] = await Promise.all([
        geocodeAddress(finalPickup),
        geocodeAddress(finalDropoff),
      ]);

      const driving = await getDrivingDistance(
        pickupGeo.coordinates,
        dropoffGeo.coordinates,
      );

      const bookingId = crypto.randomUUID();

      await db.insert(bookings).values({
        id: bookingId,
        customerId: customer.id,
        pickupAddress: finalPickup,
        dropoffAddress: finalDropoff,
        pickupLatitude: pickupGeo.coordinates.lat,
        pickupLongitude: pickupGeo.coordinates.lng,
        dropoffLatitude: dropoffGeo.coordinates.lat,
        dropoffLongitude: dropoffGeo.coordinates.lng,
        distance: String(driving.distanceKm),
        loadSize: quote.loadSize ?? 'medium',
        preferredDate: preferredDate ? new Date(preferredDate) : new Date(),
        numberOfMovers,
        pickupDifficulty: pickupAccess ?? 'ground',
        dropoffDifficulty: dropoffAccess ?? 'ground',
        price: quote.totalPrice ?? '0',
        status: 'pending',
        paymentStatus: 'pending',
        // FIX 3 (attribution) — every voice booking is tagged so analytics
        // and the agent bus can distinguish Nova-originated bookings.
        sourceChannel: 'nova_voice',
        utmSource: 'nova',
        utmMedium: 'voice',
      });

      // FIX 4 — payment gate.
      // Nova bookings are always created with paymentStatus='pending' because
      // the voice call cannot capture payment inline. We SMS a payment link
      // and defer dispatch to the Stripe payment.succeeded webhook flow, which
      // will emit the standard `booking.created` bus event (dispatch + Mark
      // monitor) once payment lands. Skipping the bus emit here avoids firing
      // Victor before the customer has paid.
      if (customer.phone) {
        await notificationService.sendSMS({
          to: customer.phone,
          message:
            `LervIT booking reserved! Complete payment: ${APP_BASE_URL}/pay/${bookingId} ` +
            `Your mover will be assigned once payment is confirmed.`,
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
          paymentStatus: 'pending',
        },
        'agent',
      );

      logger.info(
        { bookingId, quoteId, distanceKm: driving.distanceKm },
        '[Nova] Live booking created — awaiting payment',
      );

      return res.json({
        success: true,
        bookingId,
        action: 'payment_required',
        message: `Your booking is reserved! I've sent a payment link to your phone. Once payment is confirmed, we'll assign your mover immediately.`,
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

// ─── Tool 6: send_signup (unified) ───────────────────────────
//
// Consolidated replacement for collect-email + send-link + signup. Accepts
// email, phone, or both; sends the link via whichever channels were provided.
// The three legacy tools are kept for backward compatibility with existing
// ElevenLabs agent configs.

router.post(
  '/api/nova/send-signup',
  express.json(),
  async (req: Request, res: Response) => {
    const {
      email,
      phone,
      name,
      account_type = 'customer',
      lead_id,
    } = req.body ?? {};

    if (!email && !phone) {
      return res.status(400).json({
        success: false,
        message: 'Need either email or phone',
      });
    }

    const params = new URLSearchParams();
    if (email) params.set('email', email);
    if (name) params.set('name', name);
    if (phone) params.set('phone', phone);
    if (account_type === 'mover') params.set('role', 'mover');

    const signupUrl = `${APP_BASE_URL}/signup?${params.toString()}`;

    const sent = { email: false, sms: false };

    if (email) {
      try {
        await sendResendEmail({
          from: EMAIL_SENDERS.OUTREACH,
          to: email,
          subject:
            account_type === 'mover'
              ? 'Your LervIT mover signup link'
              : 'Your LervIT signup link',
          html: `
            <p>Hi ${name ?? 'there'},</p>
            <p>Great talking with you! Here is your signup link:</p>
            <a href="${signupUrl}"
               style="background:#1e3a5f;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:12px 0;">
              ${account_type === 'mover' ? 'Complete mover signup' : 'Complete your account'} &rarr;
            </a>
            <p>Use code LERVIT10 for 10% off your first move.</p>
            <p>Nova Clarke<br/>LervIT Moving</p>
          `,
          listUnsubscribeUrl: `${APP_BASE_URL}/preferences`,
        });
        sent.email = true;
      } catch (err) {
        logger.error({ err, email }, '[Nova] send-signup email failed');
      }
    }

    if (phone) {
      try {
        await notificationService.sendSMS({
          to: phone,
          message:
            `${name ? `Hi ${name}! ` : ''}` +
            `Nova from LervIT. Signup link: ${signupUrl} ` +
            `Use LERVIT10 for 10% off. Reply STOP to opt out`,
          type: 'pilot_status',
        });
        sent.sms = true;
      } catch (err) {
        logger.error({ err, phone }, '[Nova] send-signup SMS failed');
      }
    }

    if (lead_id) {
      await db
        .update(leads)
        .set({
          contactEmail: email ?? undefined,
          contactName: name ?? undefined,
          contactPhone: phone ?? undefined,
          status: 'contacted',
        })
        .where(eq(leads.id, lead_id))
        .catch((err) =>
          logger.error({ err, lead_id }, '[Nova] send-signup lead update failed'),
        );
    }

    await emitEvent(
      'nova.signup_initiated',
      'lead',
      lead_id ?? email ?? phone,
      { email, phone, name, account_type, sent },
      'agent',
    );

    return res.json({
      success: sent.email || sent.sms,
      sent,
      message:
        sent.sms && sent.email
          ? 'Link sent to your phone and email!'
          : sent.sms
            ? 'Link sent to your phone!'
            : sent.email
              ? 'Link sent to your email!'
              : 'Failed to send link — please try again',
    });
  },
);

// ─── Nova Messenger (Facebook Page inbox) ───────────────────
//
// Verification (GET) and event delivery (POST) for the LervIT Facebook Page.
// Meta calls the same URL for both. Verification uses META_VERIFY_TOKEN;
// event delivery is public so we ack fast and log everything.
//
// Conversation history is kept in-memory keyed by senderId. That is fine for
// the MVP (one server, short-lived chats) but is lost on restart / horizontal
// scale — swap for a table if this ever survives past the pilot.

const MESSENGER_VERIFY_TOKEN =
  process.env.META_VERIFY_TOKEN ?? 'lervit_nova_messenger';
const MESSENGER_GRAPH_URL = 'https://graph.facebook.com/v19.0/me/messages';

const NOVA_MESSENGER_CONTEXT = `
KEY INFO:
- Company: LervIT Moving Calgary
- Website: lervit.com
- Phone: 1-888-982-0885
- Promo: LERVIT10 (10% off first move)
- Pay in 4 via Afterpay
- Service: Calgary, Airdrie, Cochrane
- Rating: 5.0 stars Google
- Verified local movers
- Instant AI quote in 30 seconds
- Snap a photo → get price → book

QUOTE LINK: lervit.com
BOOKING: app.lervit.com/request-move
`.trim();

type MessengerHistoryEntry = { role: 'user' | 'assistant'; content: string };
const conversationHistory = new Map<string, MessengerHistoryEntry[]>();

const messengerAnthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
});

router.get('/api/nova/messenger/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === MESSENGER_VERIFY_TOKEN) {
    logger.info('[Nova Messenger] Webhook verified');
    return res.status(200).send(challenge);
  }

  return res.status(403).json({ error: 'Verification failed' });
});

// Global express.json() at server/index.ts pre-parses req.body and stashes the
// raw bytes on req.rawBody. Signature verification against req.rawBody is
// possible but deferred — reinstate once Messenger delivery is proven working.
router.post(
  '/api/nova/messenger/webhook',
  async (req: Request, res: Response) => {
    res.status(200).send('EVENT_RECEIVED');

    try {
      const body = req.body;
      if (body?.object !== 'page') return;

      for (const entry of body.entry ?? []) {
        for (const event of entry.messaging ?? []) {
          if (event.message?.is_echo) continue;

          const senderId = event.sender?.id as string | undefined;
          if (!senderId) continue;

          const messageText = event.message?.text as string | undefined;
          const postback = event.postback?.payload as string | undefined;

          logger.info(
            { senderId, messageText, postback },
            '[Nova Messenger] Message received',
          );

          await handleMessengerMessage({
            senderId,
            message: messageText ?? '',
            postback: postback ?? '',
            pageId: event.recipient?.id,
          });
        }
      }
    } catch (err) {
      logger.error({ err }, '[Nova Messenger] Webhook error');
    }
  },
);

async function handleMessengerMessage(input: {
  senderId: string;
  message: string;
  postback?: string;
  pageId?: string;
}): Promise<void> {
  const { senderId, message, postback } = input;

  // Postbacks (quick-reply / button taps) short-circuit the Claude flow.
  if (postback === 'GET_QUOTE') {
    await sendMessengerMessage(
      senderId,
      "Here's your instant quote link! 👉 lervit.com — takes 30 seconds. Use code LERVIT10 for 10% off! 🎉",
    );
    await emitEvent(
      'nova.messenger_postback',
      'agent',
      'nova',
      { senderId, postback },
      'agent',
    );
    return;
  }

  if (postback === 'HUMAN_HANDOFF') {
    await sendMessengerMessage(
      senderId,
      "Of course! I'll have someone from our team reach out to you shortly. You can also call us at 1-888-982-0885 anytime!",
    );
    await xavier
      .run('escalate', {
        issue: `Messenger handoff requested by user ${senderId}`,
        severity: 'low',
        agentName: 'Nova Clarke',
        data: { senderId, channel: 'messenger' },
      })
      .catch((err) =>
        logger.warn({ err, senderId }, '[Nova Messenger] Xavier escalation failed'),
      );
    await emitEvent(
      'nova.messenger_postback',
      'agent',
      'nova',
      { senderId, postback },
      'agent',
    );
    return;
  }

  if (!message.trim()) return;

  try {
    const history = conversationHistory.get(senderId) ?? [];
    history.push({ role: 'user', content: message });

    // Keep last 10 turns so the context window and cost stay bounded.
    if (history.length > 10) {
      history.splice(0, history.length - 10);
    }

    // Tier 1 + Tier 2 pre-pass. resolveIdentity() checks the senderId map for
    // a prior linked users row; unknown senders fall through with defaults but
    // still get time-of-day awareness. Once Nova collects contact info
    // in-conversation, linkIdentityFromContact() upgrades the mapping and
    // subsequent DMs return the enriched identity.
    try {
      const identity = await resolveIdentity('messenger', senderId).catch((err) => {
        logger.warn({ err, senderId }, '[Nova Messenger] Identity resolution failed');
        return null;
      });

      logger.info(
        {
          senderId,
          identityId: identity?.identityId,
          isKnown: identity?.isKnown,
          userId: identity?.userId,
          totalInteractions: identity?.totalInteractions,
        },
        '[Nova Messenger] Identity resolved',
      );

      const context = await buildCustomerContext({
        userId: identity?.userId,
        phone: identity?.phone,
        email: identity?.email,
      });
      const decision = await decideNextDMResponse(context, history, 'messenger', 'general');

      if (decision?.nextMessage) {
        history.push({ role: 'assistant', content: decision.nextMessage });
        conversationHistory.set(senderId, history);
        await sendMessengerMessage(senderId, decision.nextMessage);

        if (decision.action === 'escalate_human') {
          await xavier
            .run('escalate', {
              issue: `Messenger DM escalation for user ${senderId}`,
              severity: 'low',
              agentName: 'Nova Clarke',
              data: { senderId, channel: 'messenger', reason: 'reasoning_escalation' },
            })
            .catch((err) =>
              logger.warn({ err, senderId }, '[Nova Messenger] Xavier escalation failed'),
            );
        }

        const wantsQuote =
          decision.action === 'send_link' ||
          decision.action === 'book_now' ||
          decision.action === 'offer_discount' ||
          /quote|price|cost|how much|book|move/i.test(message);

        if (wantsQuote) {
          await sendMessengerQuickReplies(
            senderId,
            'Want an instant quote?',
            [
              { title: 'Get Quote 🚛', payload: 'GET_QUOTE' },
              { title: 'Talk to Someone', payload: 'HUMAN_HANDOFF' },
            ],
          );
        }

        await emitEvent(
          'nova.messenger_message_handled',
          'agent',
          'nova',
          {
            senderId,
            messageLength: message.length,
            source: 'reasoning',
            sentiment: decision.sentiment,
            action: decision.action ?? null,
          },
          'agent',
        );
        return;
      }
    } catch (reasoningErr) {
      logger.warn({ err: reasoningErr, senderId }, '[Nova Messenger] Reasoning failed — falling back to direct Claude');
    }

    // Fallback: direct Claude call (pre-reasoning behavior).
    const response = await messengerAnthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 150,
      system: `You are Nova, a friendly representative for LervIT Moving in Calgary, AB.
You handle Facebook Messenger inquiries.

${NOVA_MESSENGER_CONTEXT}

RULES:
- Keep responses SHORT (2-3 sentences max)
- Be warm and conversational
- Calgary-friendly tone
- Never invent prices or features
- Always offer to send quote link
- Use simple language (no markdown)
- No bullet points in messages
- Sound like a real person texting`,
      messages: history,
    });

    const first = response.content[0];
    const novaReply =
      first && first.type === 'text'
        ? first.text
        : 'Hey! Thanks for reaching out to LervIT. How can I help with your move?';

    history.push({ role: 'assistant', content: novaReply });
    conversationHistory.set(senderId, history);

    await sendMessengerMessage(senderId, novaReply);

    // Naive quote-intent detector — if the message mentions price/booking,
    // append quick-reply buttons on top of the Claude answer.
    const wantsQuote = /quote|price|cost|how much|book|move/i.test(message);
    if (wantsQuote) {
      await sendMessengerQuickReplies(
        senderId,
        'Want an instant quote?',
        [
          { title: 'Get Quote 🚛', payload: 'GET_QUOTE' },
          { title: 'Talk to Someone', payload: 'HUMAN_HANDOFF' },
        ],
      );
    }

    await emitEvent(
      'nova.messenger_message_handled',
      'agent',
      'nova',
      { senderId, messageLength: message.length },
      'agent',
    );
  } catch (err) {
    logger.error({ err, senderId }, '[Nova Messenger] Handler failed');
    await sendMessengerMessage(
      senderId,
      'Hey! Nova from LervIT here. For instant help visit lervit.com or call us at 1-888-982-0885!',
    ).catch(() => {});
  }
}

async function sendMessengerMessage(
  recipientId: string,
  text: string,
): Promise<void> {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) {
    logger.error('[Nova Messenger] META_PAGE_ACCESS_TOKEN not set — skipping send');
    return;
  }

  try {
    const res = await fetch(MESSENGER_GRAPH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
        access_token: token,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      logger.warn(
        { status: res.status, recipientId, errText },
        '[Nova Messenger] Graph API send failed',
      );
    }
  } catch (err) {
    logger.error({ err, recipientId }, '[Nova Messenger] fetch threw');
  }
}

async function sendMessengerQuickReplies(
  recipientId: string,
  text: string,
  replies: Array<{ title: string; payload: string }>,
): Promise<void> {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) return;

  try {
    const res = await fetch(MESSENGER_GRAPH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: {
          text,
          quick_replies: replies.map((r) => ({
            content_type: 'text',
            title: r.title,
            payload: r.payload,
          })),
        },
        access_token: token,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      logger.warn(
        { status: res.status, recipientId, errText },
        '[Nova Messenger] Quick-replies send failed',
      );
    }
  } catch (err) {
    logger.error({ err, recipientId }, '[Nova Messenger] quick-replies fetch threw');
  }
}

// ─── Nova Instagram (DM inbox) ──────────────────────────────
//
// Instagram Messaging via the Graph API. Meta uses a separate `object=instagram`
// webhook payload but the messaging shape mirrors Messenger closely. Sends go
// through the IG Business account's /messages endpoint (not the Page's), so we
// require INSTAGRAM_BUSINESS_ID. Access token falls back to the Page token
// since the Page + linked IG Business account share auth via the Meta App.

const INSTAGRAM_VERIFY_TOKEN =
  process.env.INSTAGRAM_VERIFY_TOKEN ?? 'lervit_nova_instagram';

type IgHistoryEntry = { role: 'user' | 'assistant'; content: string };
const igConversationHistory = new Map<string, IgHistoryEntry[]>();

router.get('/api/nova/instagram/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === INSTAGRAM_VERIFY_TOKEN) {
    logger.info('[Nova Instagram] Webhook verified');
    return res.status(200).send(challenge);
  }

  return res.status(403).json({ error: 'Verification failed' });
});

router.post(
  '/api/nova/instagram/webhook',
  async (req: Request, res: Response) => {
    res.status(200).send('EVENT_RECEIVED');

    try {
      const body = req.body;
      if (body?.object !== 'instagram') return;

      for (const entry of body.entry ?? []) {
        for (const event of entry.messaging ?? []) {
          if (event.message?.is_echo) continue;

          const senderId = event.sender?.id as string | undefined;
          const messageText = event.message?.text as string | undefined;
          const postback = event.postback?.payload as string | undefined;

          if (!senderId || (!messageText && !postback)) continue;

          logger.info(
            { senderId, messageText, postback },
            '[Nova Instagram] Message received',
          );

          await handleInstagramMessage({
            senderId,
            message: messageText ?? '',
            postback: postback ?? undefined,
          });
        }
      }
    } catch (err) {
      logger.error({ err }, '[Nova Instagram] Webhook error');
    }
  },
);

async function handleInstagramMessage(input: {
  senderId: string;
  message: string;
  postback?: string;
}): Promise<void> {
  const { senderId, message, postback } = input;

  if (postback === 'GET_QUOTE') {
    await sendInstagramMessage(
      senderId,
      "Here's your instant quote link 👉 lervit.com — takes 30 seconds. Use code LERVIT10 for 10% off! 🎉",
    );
    await emitEvent(
      'nova.instagram_postback',
      'agent',
      'nova',
      { senderId, postback },
      'agent',
    );
    return;
  }

  if (postback === 'HUMAN_HANDOFF') {
    await sendInstagramMessage(
      senderId,
      'Of course! Someone from our team will reach out shortly. You can also call us at 1-888-982-0885 📞',
    );
    await xavier
      .run('escalate', {
        issue: `Instagram DM handoff requested by user ${senderId}`,
        severity: 'low',
        agentName: 'Nova Clarke',
        data: { senderId, channel: 'instagram' },
      })
      .catch((err) =>
        logger.warn({ err, senderId }, '[Nova Instagram] Xavier escalation failed'),
      );
    await emitEvent(
      'nova.instagram_postback',
      'agent',
      'nova',
      { senderId, postback },
      'agent',
    );
    return;
  }

  if (!message.trim()) return;

  try {
    const history = igConversationHistory.get(senderId) ?? [];
    history.push({ role: 'user', content: message });

    if (history.length > 10) {
      history.splice(0, history.length - 10);
    }

    // Tier 1 + Tier 2 pre-pass — same shape as the Messenger handler.
    try {
      const identity = await resolveIdentity('instagram', senderId).catch((err) => {
        logger.warn({ err, senderId }, '[Nova Instagram] Identity resolution failed');
        return null;
      });

      logger.info(
        {
          senderId,
          identityId: identity?.identityId,
          isKnown: identity?.isKnown,
          userId: identity?.userId,
          totalInteractions: identity?.totalInteractions,
        },
        '[Nova Instagram] Identity resolved',
      );

      const context = await buildCustomerContext({
        userId: identity?.userId,
        phone: identity?.phone,
        email: identity?.email,
      });
      const decision = await decideNextDMResponse(context, history, 'instagram', 'general');

      if (decision?.nextMessage) {
        history.push({ role: 'assistant', content: decision.nextMessage });
        igConversationHistory.set(senderId, history);
        await sendInstagramMessage(senderId, decision.nextMessage);

        if (decision.action === 'escalate_human') {
          await xavier
            .run('escalate', {
              issue: `Instagram DM escalation for user ${senderId}`,
              severity: 'low',
              agentName: 'Nova Clarke',
              data: { senderId, channel: 'instagram', reason: 'reasoning_escalation' },
            })
            .catch((err) =>
              logger.warn({ err, senderId }, '[Nova Instagram] Xavier escalation failed'),
            );
        }

        const wantsQuote =
          decision.action === 'send_link' ||
          decision.action === 'book_now' ||
          decision.action === 'offer_discount' ||
          /quote|price|cost|how much|book|move/i.test(message);

        if (wantsQuote) {
          await new Promise((r) => setTimeout(r, 1000));
          await sendInstagramQuickReplies(
            senderId,
            'Want an instant quote?',
            [
              { title: 'Get Quote 🚛', payload: 'GET_QUOTE' },
              { title: 'Talk to Someone', payload: 'HUMAN_HANDOFF' },
            ],
          );
        }

        await emitEvent(
          'nova.instagram_message_handled',
          'agent',
          'nova',
          {
            senderId,
            messageLength: message.length,
            source: 'reasoning',
            sentiment: decision.sentiment,
            action: decision.action ?? null,
          },
          'agent',
        );
        return;
      }
    } catch (reasoningErr) {
      logger.warn({ err: reasoningErr, senderId }, '[Nova Instagram] Reasoning failed — falling back to direct Claude');
    }

    const response = await messengerAnthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 150,
      system: `You are Nova, LervIT Moving's friendly Instagram DM assistant in Calgary, AB.

${NOVA_MESSENGER_CONTEXT}

INSTAGRAM RULES:
- Keep responses SHORT (2-3 sentences)
- Warm, casual Instagram tone
- Use 1 emoji max per message
- No markdown or bullet points
- Sound like a real person DMing
- Always offer quote link when someone asks about moving`,
      messages: history,
    });

    const first = response.content[0];
    const novaReply =
      first && first.type === 'text'
        ? first.text
        : 'Hey! Thanks for reaching out to LervIT 👋 How can I help with your move?';

    history.push({ role: 'assistant', content: novaReply });
    igConversationHistory.set(senderId, history);

    await sendInstagramMessage(senderId, novaReply);

    const wantsQuote = /quote|price|cost|how much|book|move/i.test(message);
    if (wantsQuote) {
      await new Promise((r) => setTimeout(r, 1000));
      await sendInstagramQuickReplies(
        senderId,
        'Want an instant quote?',
        [
          { title: 'Get Quote 🚛', payload: 'GET_QUOTE' },
          { title: 'Talk to Someone', payload: 'HUMAN_HANDOFF' },
        ],
      );
    }

    await emitEvent(
      'nova.instagram_message_handled',
      'agent',
      'nova',
      { senderId, messageLength: message.length },
      'agent',
    );
  } catch (err) {
    logger.error({ err, senderId }, '[Nova Instagram] Handler failed');
    await sendInstagramMessage(
      senderId,
      'Hey! For instant help visit lervit.com or call 1-888-982-0885 📞',
    ).catch(() => {});
  }
}

async function sendInstagramMessage(
  recipientId: string,
  text: string,
): Promise<void> {
  const igId = process.env.INSTAGRAM_BUSINESS_ID;
  if (!igId) {
    logger.error('[Nova Instagram] INSTAGRAM_BUSINESS_ID not set — skipping send');
    return;
  }

  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) {
    logger.error('[Nova Instagram] INSTAGRAM_ACCESS_TOKEN not set — skipping send');
    return;
  }

  try {
    const res = await fetch(
      `https://graph.instagram.com/v26.0/${igId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text },
        }),
      },
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      logger.warn(
        { status: res.status, recipientId, errText },
        '[Nova Instagram] Graph API send failed',
      );
    }
  } catch (err) {
    logger.error({ err, recipientId }, '[Nova Instagram] fetch threw');
  }
}

async function sendInstagramQuickReplies(
  recipientId: string,
  text: string,
  replies: Array<{ title: string; payload: string }>,
): Promise<void> {
  const igId = process.env.INSTAGRAM_BUSINESS_ID;
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!igId || !token) return;

  try {
    const res = await fetch(
      `https://graph.instagram.com/v26.0/${igId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: {
            text,
            quick_replies: replies.map((r) => ({
              content_type: 'text',
              title: r.title,
              payload: r.payload,
            })),
          },
        }),
      },
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      logger.warn(
        { status: res.status, recipientId, errText },
        '[Nova Instagram] Quick-replies send failed',
      );
    }
  } catch (err) {
    logger.error({ err, recipientId }, '[Nova Instagram] quick-replies fetch threw');
  }
}

export { router as novaWebhookRouter };
