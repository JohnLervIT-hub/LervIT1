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
import Telnyx from 'telnyx';
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
import { resolveIdentity, linkIdentityFromContact, type ResolvedIdentity } from './lib/identityResolver';
import { agentEventBus } from './lib/agentEventBus';
import { JAILBREAK_PREAMBLE } from './lib/promptSanitizer';
import type { NovaCallContext } from './lib/novaBridge';

// Regexes used to auto-extract contact info from customer DMs so anonymous
// senderIds can be linked to a users row mid-conversation. Kept loose — a
// false-positive on the phone regex just triggers a failed users lookup,
// which no-ops on the resolver side.
const DM_PHONE_REGEX = /(\+?1?[\s.-]?\(?[0-9]{3}\)?[\s.-]?[0-9]{3}[\s.-]?[0-9]{4})/;
const DM_EMAIL_REGEX = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;

const router = express.Router();

const APP_BASE_URL = (process.env.APP_BASE_URL ?? 'https://app.lervit.com').trim();
const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID;

// Per-phone dedupe for DM → voice handoffs. Same phone hitting handoff
// multiple times inside CALL_COOLDOWN_MS (e.g. IG + Messenger both
// escalating, or a rapid-fire follow-up DM) collapses to a single
// nova.call_dm_handoff emit. In-process only — fine for the pilot
// single-instance deploy; move to Redis if we ever go multi-node.
const recentCalls = new Map<string, number>(); // phone → last emit timestamp (ms)
const CALL_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

// Tracks call_control_ids that have already had ElevenLabs streaming started
// so call.initiated (outbound) and call.answered (inbound / fallback) don't
// both trigger startStreaming on the same call. In-process only; entries are
// cleared on call.hangup.
const streamingStarted = new Set<string>();

// Per-call context handed to the Nova bridge when Telnyx opens its WebSocket.
// The bridge reads this by callControlId to greet the customer by name and
// steer the prompt/goal per callType. Seeded by nova.ts on outbound dial and
// (as a fallback) here on call.initiated; cleared on call.hangup.
export const novaCallContextStore = new Map<string, NovaCallContext>();

// Lazy Telnyx client — matches the pattern in voice-routes.ts so we don't
// crash boot when TELNYX_API_KEY is missing in local/dev.
function telnyxSdk() {
  return new Telnyx({ apiKey: process.env.TELNYX_API_KEY ?? '' });
}

// ─── Telnyx webhook ──────────────────────────────────────────

router.post(
  '/api/nova/webhook',
  async (req: Request, res: Response) => {
    res.json({ received: true });

    logger.info({
      contentType: req.headers['content-type'],
      bodyType: typeof req.body,
      hasData: !!req.body?.data,
    }, '[Nova Webhook] Request received');

    // Global express.json() in server/index.ts has already parsed req.body
    // into an object by the time this handler runs, so we don't (and can't)
    // re-parse. Kept the string-branch defensively in case a future path
    // change routes here before json parsing.
    let payload: any;
    try {
      payload =
        typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (err) {
      logger.error({
        err,
        bodyType: typeof req.body,
        body: JSON.stringify(req.body)?.slice(0, 200),
      }, '[Nova Webhook] Parse/handler error');
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
      case 'call.initiated': {
        const direction = callPayload?.direction;

        logger.info(
          {
            callControlId,
            direction,
            to: callPayload?.to,
          },
          '[Nova] Call initiated webhook received',
        );

        // Fallback context seed for the bridge. nova.ts already seeds richer
        // context when it originated the dial; this fills in anything that
        // path missed (e.g. inbound calls) so the bridge greeting/prompt isn't
        // generic. Skip if the store already has an entry.
        if (callControlId && !novaCallContextStore.has(callControlId)) {
          const ctx: NovaCallContext = { callType };
          try {
            if (callType === 'lead_conversion' && entityId) {
              const [row] = await db
                .select({
                  contactName: leads.contactName,
                  pickupAddress: quotes.pickupAddress,
                  dropoffAddress: quotes.dropoffAddress,
                  totalPrice: quotes.totalPrice,
                })
                .from(leads)
                .leftJoin(quotes, eq(quotes.id, leads.quoteId))
                .where(eq(leads.id, entityId))
                .limit(1);
              if (row) {
                ctx.customerName = row.contactName ?? undefined;
                ctx.pickupAddress = row.pickupAddress ?? undefined;
                ctx.dropoffAddress = row.dropoffAddress ?? undefined;
                ctx.price = row.totalPrice ? String(row.totalPrice) : undefined;
                ctx.leadId = entityId;
              }
            } else if (
              (callType === 'payment_recovery' || callType === 'review_request') &&
              entityId
            ) {
              const [booking] = await db
                .select({
                  customerName: users.name,
                  pickupAddress: bookings.pickupAddress,
                  dropoffAddress: bookings.dropoffAddress,
                  price: bookings.price,
                })
                .from(bookings)
                .innerJoin(users, eq(users.id, bookings.customerId))
                .where(eq(bookings.id, entityId))
                .limit(1);
              if (booking) {
                ctx.customerName = booking.customerName ?? undefined;
                ctx.pickupAddress = booking.pickupAddress ?? undefined;
                ctx.dropoffAddress = booking.dropoffAddress ?? undefined;
                ctx.price = booking.price ? String(booking.price) : undefined;
              }
            }
          } catch (err) {
            logger.warn({ err, callControlId }, '[Nova] context hydrate failed');
          }
          novaCallContextStore.set(callControlId, ctx);
        }

        // For outbound calls, answer immediately and start ElevenLabs streaming
        // instead of waiting for call.answered — Telnyx sometimes never fires
        // .answered for outbound legs even after the callee picks up.
        if ((direction === 'outgoing' || direction === 'outbound') && callControlId) {
          try {
            await telnyxSdk().calls.actions.answer(callControlId, {});

            logger.info(
              { callControlId },
              '[Nova] Call answered via initiate',
            );

            // Small delay so Telnyx has time to fully set up the media leg
            // before we ask it to open the bidirectional stream.
            await new Promise((r) => setTimeout(r, 500));

            if (ELEVENLABS_AGENT_ID) {
              const bridgeHost = (
                process.env.APP_BASE_URL ?? 'https://app.lervit.com'
              )
                .trim()
                .replace(/^https?:\/\//, '')
                .replace(/\/$/, '');
              await telnyxSdk().calls.actions.startStreaming(callControlId, {
                stream_url: `wss://${bridgeHost}/api/nova/stream/${encodeURIComponent(callControlId)}`,
                stream_track: 'both_tracks',
              });
              streamingStarted.add(callControlId);
              logger.info(
                { callControlId },
                '[Nova] ElevenLabs stream started on initiate ✅',
              );
            }
          } catch (err: any) {
            logger.error(
              { err, callControlId },
              '[Nova] ElevenLabs stream failed',
            );
            // No fallback — let call stay silent
            // Better than robotic TTS message
          }
        }

        // Inbound: answer the call so Telnyx fires call.answered, which then
        // triggers startStreaming → ElevenLabs connect in the handler below.
        if (direction === 'incoming' && callControlId) {
          try {
            await telnyxSdk().calls.actions.answer(callControlId, {});
            logger.info(
              { callControlId },
              '[Nova] Inbound call answered ✅',
            );
          } catch (err: any) {
            logger.error(
              { err, callControlId },
              '[Nova] Inbound answer failed',
            );
          }
        }
        break;
      }

      case 'call.answered':
        logger.info(
          {
            callControlId,
            from: callPayload?.from,
            to: callPayload?.to,
            agentId: ELEVENLABS_AGENT_ID,
            hasAgentId: !!ELEVENLABS_AGENT_ID,
            callType,
            alreadyStreaming: streamingStarted.has(callControlId),
          },
          '[Nova] call.answered received',
        );

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

        // Skip startStreaming if call.initiated already kicked it off for this
        // call — call.answered acts as a fallback for inbound or edge cases
        // where the initiate-path stream setup failed silently.
        if (streamingStarted.has(callControlId)) {
          logger.info(
            { callControlId },
            '[Nova] Stream already started on initiate — skipping',
          );
          break;
        }

        if (
          ELEVENLABS_AGENT_ID &&
          callControlId &&
          !streamingStarted.has(callControlId)
        ) {
          try {
            const bridgeHost = (
              process.env.APP_BASE_URL ?? 'https://app.lervit.com'
            )
              .trim()
              .replace(/^https?:\/\//, '')
              .replace(/\/$/, '');
            await telnyxSdk().calls.actions.startStreaming(callControlId, {
              stream_url: `wss://${bridgeHost}/api/nova/stream/${encodeURIComponent(callControlId)}`,
              stream_track: 'both_tracks',
            });

            streamingStarted.add(callControlId);

            logger.info(
              { callControlId },
              '[Nova] ElevenLabs stream started ✅',
            );
          } catch (err: any) {
            logger.error(
              { err: err?.message, callControlId },
              '[Nova] ElevenLabs stream failed',
            );
          }
        }
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
        streamingStarted.delete(callControlId);
        novaCallContextStore.delete(callControlId);

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

// ─── Inbound SMS webhook ─────────────────────────────────────
//
// Captures WhatsApp OTPs and any other inbound SMS delivered to our Telnyx
// number. Ack fast, log to business_events, never throw back to Telnyx.

router.post(
  '/api/nova/sms/inbound',
  async (req: Request, res: Response) => {
    res.status(200).send('OK');

    try {
      const { from, to, text, id, received_at } =
        req.body?.data?.payload ?? req.body ?? {};

      logger.info(
        { from, to, text, id, received_at },
        '[Nova SMS] Inbound SMS received',
      );

      await emitEvent(
        'nova.sms_received',
        'sms',
        id ?? 'unknown',
        { from, to, text },
        'system',
      ).catch(() => {});
    } catch (err) {
      logger.error({ err }, '[Nova SMS] Inbound webhook error');
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

// DM human-handoff flow — replaces the old "notify John via Xavier" path with
// a lead upsert + `nova.call_dm_handoff` event. Nova voice picks up the event
// and calls the customer within 5 minutes; John is only pinged as a fallback
// when the DM never surfaced a phone number.
const DM_ADDRESS_FROM_REGEX = /(?:from|pickup(?:\s+at)?|moving from)\s+([^\n]+?)(?=\s+to\s+|[.,\n]|$)/i;
const DM_ADDRESS_TO_REGEX = /(?:^|\s)(?:to|dropoff(?:\s+at)?|deliver(?:ed)?(?:\s+to)?)\s+([^\n]+?)(?=[.,\n]|$)/i;

// True when Nova's most recent turn asked the customer for a callback phone
// number (either the runDMHumanHandoff "what's the best number" prompt or the
// reasoning path's escalate variant). When the customer's next turn contains
// a phone, we should treat it as answering the callback prompt and short-
// circuit into runDMHumanHandoff instead of running another reasoning turn.
function isCallbackContext(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): boolean {
  const lastAssistant = [...history].reverse().find((h) => h.role === 'assistant');
  if (!lastAssistant) return false;
  return /best number|number to reach|call you at|what(?:'s| is) the best (?:number|way to reach)|reach you on/i.test(
    lastAssistant.content,
  );
}

async function runDMHumanHandoff(input: {
  channel: 'messenger' | 'instagram';
  senderId: string;
  identity?: ResolvedIdentity | null;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<void> {
  const { channel, senderId } = input;
  const send = channel === 'instagram' ? sendInstagramMessage : sendMessengerMessage;
  const channelLabel = channel === 'instagram' ? 'Instagram' : 'Messenger';

  let identity = input.identity ?? null;
  if (!identity) {
    identity = await resolveIdentity(channel, senderId).catch((err) => {
      logger.warn({ err, senderId, channel }, '[Nova DM] Handoff identity lookup failed');
      return null;
    });
  }

  const history =
    input.history ??
    (channel === 'instagram'
      ? igConversationHistory.get(senderId)
      : conversationHistory.get(senderId)) ??
    [];

  const customerPhone = identity?.phone;
  const customerEmail = identity?.email;
  const customerName = identity?.name ?? undefined;

  const conversationText = history
    .map((h) => `${h.role === 'user' ? 'Customer' : 'Nova'}: ${h.content}`)
    .join('\n');
  // Only scan customer turns for pickup/dropoff — otherwise Nova's own
  // paraphrases ("so you're moving from Beltline to Kensington?") would
  // echo bad or hallucinated addresses back into the handoff payload.
  const customerTurns = history
    .filter((h) => h.role === 'user')
    .map((h) => h.content)
    .join('\n');
  const addressMatch = customerTurns.match(DM_ADDRESS_FROM_REGEX);
  const dropoffMatch = customerTurns.match(DM_ADDRESS_TO_REGEX);

  let leadId: string | undefined;

  if (customerPhone || customerEmail) {
    const existingLead = customerPhone
      ? await db
          .select()
          .from(leads)
          .where(eq(leads.contactPhone, customerPhone))
          .limit(1)
      : [];

    if (existingLead.length) {
      leadId = existingLead[0].id;
      await db
        .update(leads)
        .set({
          status: 'contacted',
          notes: `${channelLabel} DM handoff requested.\n${conversationText}`,
          updatedAt: new Date(),
        })
        .where(eq(leads.id, leadId));
    } else {
      const newLead = await db
        .insert(leads)
        .values({
          contactPhone: customerPhone,
          contactEmail: customerEmail,
          contactName: customerName,
          sourceChannel: channel === 'instagram' ? 'instagram_dm' : 'messenger_dm',
          utmCampaign: 'nova-clarke',
          leadType: 'b2c',
          intentScore: 90,
          status: 'new',
          notes: `${channelLabel} DM handoff.\nConversation:\n${conversationText}`,
        })
        .returning();
      leadId = newLead[0]?.id;
    }
  }

  if (customerPhone) {
    const lastCall = recentCalls.get(customerPhone);
    if (lastCall && Date.now() - lastCall < CALL_COOLDOWN_MS) {
      logger.info(
        { phone: customerPhone, msSinceLast: Date.now() - lastCall },
        '[Nova] Call cooldown active — skip',
      );
      await send(
        senderId,
        `Our team is already on their way to call you! Should be any moment 📞`,
      );
      return;
    }
    recentCalls.set(customerPhone, Date.now());

    await agentEventBus.emit(
      'nova.call_dm_handoff',
      {
        leadId,
        phone: customerPhone,
        name: customerName,
        channel,
        senderId,
        conversationSummary: conversationText,
        pickupAddress: addressMatch?.[1]?.trim(),
        dropoffAddress: dropoffMatch?.[1]?.trim(),
      },
      channel === 'instagram' ? 'nova-instagram' : 'nova-messenger',
    );

    await send(
      senderId,
      `Perfect! One of our team will call you at ${customerPhone} within 5 minutes to get you booked 🚛`,
    );
  } else {
    await send(
      senderId,
      `Happy to have someone call you! What's the best number to reach you on? 📞`,
    );

    await xavier
      .run('escalate', {
        issue:
          `${channelLabel} DM handoff — no phone number captured.\n` +
          `Customer: ${customerName ?? senderId}\n\n` +
          `${conversationText}\n\n` +
          `Reply: ${APP_BASE_URL}/admin?tab=nova`,
        severity: 'low',
        agentName: 'Nova Clarke',
        data: { senderId, channel },
      })
      .catch((err) =>
        logger.warn({ err, senderId, channel }, '[Nova DM] Xavier fallback failed'),
      );
  }
}

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
    await runDMHumanHandoff({ channel: 'messenger', senderId });
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

    // Tier 1 + Tier 2 pre-pass. resolveIdentity() upserts the messenger_identities
    // row and returns the enriched profile if the sender has been linked. On
    // unknown senders we regex-scan the customer message for a phone/email —
    // a hit triggers linkIdentityFromContact, which permanently binds the
    // (platform, senderId) mapping so the CURRENT message already picks up
    // return-customer context in buildCustomerContext.
    try {
      let identity = await resolveIdentity('messenger', senderId).catch((err) => {
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

      const phoneMatch = message.match(DM_PHONE_REGEX);
      const emailMatch = message.match(DM_EMAIL_REGEX);

      if (identity && !identity.isKnown && (phoneMatch || emailMatch)) {
        const linked = await linkIdentityFromContact('messenger', senderId, {
          phone: phoneMatch?.[0],
          email: emailMatch?.[0],
        }).catch((err) => {
          logger.warn({ err, senderId }, '[Nova Messenger] Auto-link failed');
          return null;
        });
        if (linked?.isKnown) {
          identity = linked;
          logger.info(
            { senderId, userId: linked.userId, resolvedBy: linked.resolvedBy },
            '[Nova Messenger] Identity auto-linked',
          );
        }
      }

      if (phoneMatch && isCallbackContext(history)) {
        const callbackIdentity: ResolvedIdentity | null = identity
          ? identity.phone
            ? identity
            : { ...identity, phone: phoneMatch[0] }
          : null;
        await runDMHumanHandoff({
          channel: 'messenger',
          senderId,
          identity: callbackIdentity,
          history,
        });
        await emitEvent(
          'nova.messenger_message_handled',
          'agent',
          'nova',
          {
            senderId,
            messageLength: message.length,
            source: 'callback_context',
            action: 'escalate_human',
          },
          'agent',
        );
        return;
      }

      // Explicit callback/human intent — short-circuit before Tier 2 reasoning
      // so phrases like "call me", "talk to a human", or "I'm available now"
      // never get routed into a booking/quote reply.
      const wantsCallback =
        /call\s*(me|back)|call\s*back|talk\s*to\s*(a\s*)?(human|person|someone|agent|team)|need\s*a\s*call|speak\s*to\s*(someone|a\s*person)|phone\s*(call|me)|i('m| am)\s*available|available\s*now|call\s*me\s*now/i.test(
          message,
        );

      if (wantsCallback) {
        logger.info(
          { senderId, message },
          '[Nova Messenger] Callback intent detected → handoff',
        );
        await runDMHumanHandoff({
          channel: 'messenger',
          senderId,
          identity,
          history,
        });
        await emitEvent(
          'nova.messenger_message_handled',
          'agent',
          'nova',
          {
            senderId,
            messageLength: message.length,
            source: 'callback_intent',
            action: 'escalate_human',
          },
          'agent',
        );
        return;
      }

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
          await runDMHumanHandoff({
            channel: 'messenger',
            senderId,
            identity,
            history,
          });
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
    await runDMHumanHandoff({ channel: 'instagram', senderId });
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
      let identity = await resolveIdentity('instagram', senderId).catch((err) => {
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

      const phoneMatch = message.match(DM_PHONE_REGEX);
      const emailMatch = message.match(DM_EMAIL_REGEX);

      if (identity && !identity.isKnown && (phoneMatch || emailMatch)) {
        const linked = await linkIdentityFromContact('instagram', senderId, {
          phone: phoneMatch?.[0],
          email: emailMatch?.[0],
        }).catch((err) => {
          logger.warn({ err, senderId }, '[Nova Instagram] Auto-link failed');
          return null;
        });
        if (linked?.isKnown) {
          identity = linked;
          logger.info(
            { senderId, userId: linked.userId, resolvedBy: linked.resolvedBy },
            '[Nova Instagram] Identity auto-linked',
          );
        }
      }

      if (phoneMatch && isCallbackContext(history)) {
        const callbackIdentity: ResolvedIdentity | null = identity
          ? identity.phone
            ? identity
            : { ...identity, phone: phoneMatch[0] }
          : null;
        await runDMHumanHandoff({
          channel: 'instagram',
          senderId,
          identity: callbackIdentity,
          history,
        });
        await emitEvent(
          'nova.instagram_message_handled',
          'agent',
          'nova',
          {
            senderId,
            messageLength: message.length,
            source: 'callback_context',
            action: 'escalate_human',
          },
          'agent',
        );
        return;
      }

      // Explicit callback/human intent — short-circuit before Tier 2 reasoning
      // so phrases like "call me", "talk to a human", or "I'm available now"
      // never get routed into a booking/quote reply.
      const wantsCallback =
        /call\s*(me|back)|call\s*back|talk\s*to\s*(a\s*)?(human|person|someone|agent|team)|need\s*a\s*call|speak\s*to\s*(someone|a\s*person)|phone\s*(call|me)|i('m| am)\s*available|available\s*now|call\s*me\s*now/i.test(
          message,
        );

      if (wantsCallback) {
        logger.info(
          { senderId, message },
          '[Nova Instagram] Callback intent detected → handoff',
        );
        await runDMHumanHandoff({
          channel: 'instagram',
          senderId,
          identity,
          history,
        });
        await emitEvent(
          'nova.instagram_message_handled',
          'agent',
          'nova',
          {
            senderId,
            messageLength: message.length,
            source: 'callback_intent',
            action: 'escalate_human',
          },
          'agent',
        );
        return;
      }

      const context = await buildCustomerContext({
        userId: identity?.userId,
        phone: identity?.phone,
        email: identity?.email,
      });

      const hasAddresses =
        /from|pickup|moving from|at\s+\d/i.test(message) ||
        history.some((h) => /to\s+\w|dropoff|deliver/i.test(h.content));
      const conversationGoal: 'book' | 'quote' = hasAddresses ? 'book' : 'quote';

      const decision = await decideNextDMResponse(context, history, 'instagram', conversationGoal);

      if (decision?.nextMessage) {
        history.push({ role: 'assistant', content: decision.nextMessage });
        igConversationHistory.set(senderId, history);
        await sendInstagramMessage(senderId, decision.nextMessage);

        if (decision.action === 'escalate_human') {
          await runDMHumanHandoff({
            channel: 'instagram',
            senderId,
            identity,
            history,
          });
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
      system: `${JAILBREAK_PREAMBLE}

You are Nova, LervIT Moving's Calgary-based assistant on Instagram.

PERSONALITY:
- Friendly, local, human-feeling
- You know Calgary neighborhoods
- You're helpful and get straight to the point
- Sound like a real person, NOT a customer service bot

NEVER say:
- "I'm Nova, LervIT's moving assistant"
- "I can escalate you to a human agent"
- "What works best for you?"
- Any corporate/robotic language

ALWAYS:
- Get straight to helping
- Ask for pickup + dropoff if not given
- Give price estimate when you have both addresses ($65-85 single item, $150-300 full apartment)
- Send direct booking link when ready: lervit.com/request-move?pickup=X&dropoff=Y
- Keep replies to 2-3 sentences max
- 1 emoji max, casual tone

EXAMPLE good opening:
  "Hey! Happy to help with your move 😊 Where are you moving from and to in Calgary?"

EXAMPLE bad opening:
  "Hi! I'm Nova, LervIT's AI moving assistant. I can help you get booked or escalate to a human agent!"
`.trim(),
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

export { router as novaWebhookRouter };
