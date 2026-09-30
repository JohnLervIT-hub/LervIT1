import WebSocket from 'ws';
import { logger } from '../logger';

const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID;

/** Upper bound of each G.711 µ-law segment, in the 14-bit biased domain. */
const SEG_UEND = [0x3f, 0x7f, 0xff, 0x1ff, 0x3ff, 0x7ff, 0xfff, 0x1fff];

/** Canonical G.711 linear-to-µ-law encode (Sun g711.c), 16-bit PCM in. */
function linearToMuLaw(pcm: number): number {
  let val = pcm >> 2; // 16-bit -> 14-bit
  let mask: number;

  if (val < 0) {
    val = -val;
    mask = 0x7f;
  } else {
    mask = 0xff;
  }

  if (val > 8159) val = 8159; // clip before bias overflows the top segment
  val += 0x84 >> 2;

  let seg = 8;
  for (let i = 0; i < 8; i++) {
    if (val <= SEG_UEND[i]) {
      seg = i;
      break;
    }
  }

  if (seg >= 8) return 0x7f ^ mask;
  return ((seg << 4) | ((val >> (seg + 1)) & 0x0f)) ^ mask;
}

/**
 * ElevenLabs silently drops `tts.output_format` from conversation_config_override
 * unless the agent whitelists it, so the agent keeps sending pcm_16000 while the
 * Telnyx media stream is ulaw_8000 — forwarding those frames verbatim makes the
 * callee hear static and hang up. Converting here keeps the bridge correct no
 * matter what the agent negotiates; when it does negotiate ulaw_8000 the caller
 * skips this entirely and forwards the original payload.
 *
 * Returns a stateful encoder because ElevenLabs chunk boundaries do not respect
 * sample or sample-pair boundaries: a chunk can end mid-sample, and an odd
 * sample count leaves one sample with no partner to average against. Both carry
 * into the next chunk rather than being dropped, which would tick the output
 * clock out of phase with the input for the rest of the call.
 */
function createPcmToMuLawEncoder() {
  let halfSample: number | null = null; // trailing byte of a split 16-bit sample
  let unpaired: number | null = null; // sample awaiting its downsample partner

  return {
    /** 16 kHz signed 16-bit LE PCM -> 8 kHz µ-law, halving the rate by pairwise average. */
    encode(chunk: Buffer): Buffer {
      let buf = chunk;

      if (halfSample !== null) {
        buf = Buffer.concat([Buffer.from([halfSample]), chunk]);
        halfSample = null;
      }

      let byteLen = buf.length;
      if (byteLen % 2 === 1) {
        halfSample = buf[byteLen - 1];
        byteLen -= 1;
      }

      const available = (unpaired !== null ? 1 : 0) + byteLen / 2;
      const out = Buffer.allocUnsafe(available >> 1);
      let outIdx = 0;
      let pending = unpaired;
      unpaired = null;

      for (let i = 0; i < byteLen; i += 2) {
        const sample = buf.readInt16LE(i);
        if (pending === null) {
          pending = sample;
        } else {
          // Averaging the pair is a 2-tap box filter — crude, but it keeps the
          // 4-8 kHz band from aliasing back down the way bare decimation would.
          out[outIdx++] = linearToMuLaw((pending + sample) >> 1);
          pending = null;
        }
      }

      unpaired = pending;
      return out;
    },

    /** Drop carried samples so a barged-in utterance does not inherit stale audio. */
    reset(): void {
      halfSample = null;
      unpaired = null;
    },
  };
}

export interface NovaCallContext {
  callType?: string;
  customerName?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  price?: string;
  leadId?: string;
  /** Lead's business name, when they have one — seeds {{companyName}}. */
  companyName?: string;
  /**
   * Set when this leg is picking up a call that dropped — see
   * server/lib/novaCallState.ts. Replaces the first message and the goal so
   * Nova acknowledges the disconnect instead of replaying the intro.
   */
  resume?: {
    stage?: string;
    retryCount: number;
    opening: string;
    goal: string;
  };
}

export function createNovaBridge(
  telnyxWs: WebSocket,
  callControlId: string,
  context?: NovaCallContext,
): void {
  if (!ELEVENLABS_AGENT_ID) {
    logger.error('[Bridge] No agent ID');
    return;
  }

  logger.info({ callControlId, callType: context?.callType }, '[Bridge] Connecting to ElevenLabs');

  const elevenWs = new WebSocket(
    `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${ELEVENLABS_AGENT_ID}`,
  );

  let telnyxStreamId: string | undefined;
  let agentOutputFormat: string | undefined;
  const muLaw = createPcmToMuLawEncoder();

  elevenWs.on('open', () => {
    logger.info({ callControlId }, '[Bridge] ElevenLabs connected');

    const greeting = context?.customerName
      ? `Hey ${context.customerName}! Nova here from LervIT Moving Calgary.`
      : `Hey! Nova here from LervIT Moving Calgary.`;

    const contextInfo = [
      context?.pickupAddress ? `Moving from: ${context.pickupAddress}` : '',
      context?.dropoffAddress ? `Moving to: ${context.dropoffAddress}` : '',
      context?.price ? `Quote: $${context.price}` : '',
    ]
      .filter(Boolean)
      .join('. ');

    const firstMessage = context?.resume
      ? context.resume.opening
      : context?.callType === 'lead_conversion'
        ? `${greeting} You reached out about a move${contextInfo ? ' — ' + contextInfo : ''}. Still planning that move?`
        : context?.callType === 'payment_recovery'
        ? `${greeting} You started booking with us but didn't complete payment. Want me to send the link again?`
        : context?.callType === 'mover_cold_intro'
        ? `${greeting} I'm reaching out to see if you'd be open to a quick chat about partnering with us on moves in Calgary.`
        : context?.callType === 'review_request'
        ? `${greeting} We just completed your move and wanted to make sure everything went smoothly. Got a minute to share how it went?`
        : context?.callType === 'mover_dispatch'
        ? `${greeting} I'm calling about a move job coming up that matches your area. Got 30 seconds to hear the details?`
        : `${greeting} How can I help you today?`;

    const goal = context?.resume
      ? context.resume.goal
      : context?.callType === 'lead_conversion'
        ? 'Book the move live on this call. Offer LERVIT10 if they hesitate.'
        : context?.callType === 'payment_recovery'
        ? 'Get customer to complete payment at lervit.com'
        : context?.callType === 'mover_cold_intro'
        // Paired with the cold-intro opener above: without this the call pitches
        // a partnership and then asks the mover for their own pickup address.
        ? 'Gauge interest in partnering on Calgary moves and book a follow-up chat.'
        : context?.callType === 'review_request'
        ? 'Get feedback on the move and request a Google review if satisfied.'
        : context?.callType === 'mover_dispatch'
        ? 'Share job details and confirm mover availability and interest.'
        : 'Help customer with their move. Get pickup and dropoff addresses.';

    // Only with a leadId: report_objection writes to that lead row and 400s
    // without one, so telling a lead-less call to reach for it just produces a
    // failed tool call mid-conversation.
    const objectionRule = context?.leadId
      ? `If they say they are not interested, to not call again, to remove them, ` +
        `or that they already have a mover, call the report_objection tool with ` +
        `leadId "${context.leadId}" and their reason in a few words. ` +
        `Then thank them, say you won't call again, and end the call.\n`
      : '';

    // ── Move context snippet (injected when we have it) ─────────────────────
    const moveContext = [
      context?.pickupAddress ? `Pickup: ${context.pickupAddress}` : '',
      context?.dropoffAddress ? `Drop-off: ${context.dropoffAddress}` : '',
      context?.price ? `Quote: $${context.price}` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    const prompt =
      `You are Nova Clarke, the voice concierge for LervIT Moving Calgary.\n` +
      `Pronunciation: say "LervIT" as "LER-vit" and "lervit.com" as "lervit dot com".\n` +
      `You are warm, upbeat, and local — you know Calgary well.\n` +
      `Keep every response to 1–2 sentences. Never read out punctuation or spell\n` +
      `words letter-by-letter. If you need to give a URL or email, say it\n` +
      `naturally ("lervit dot com", "support at lervit dot com").\n` +
      `\n` +
      `ABOUT LERVIT MOVING CALGARY:\n` +
      `- Professional local and long-distance moving in and around Calgary, Alberta.\n` +
      `- Services: residential moves, commercial moves, packing/unpacking,\n` +
      `  furniture assembly, junk removal add-ons.\n` +
      `- Instant online quote at lervit.com — no obligation, no account needed.\n` +
      `- All bookings include insurance coverage. No surprise fees.\n` +
      `- Discount code LERVIT10 gives 10 % off (offer only when customer hesitates).\n` +
      `- Book online or ask the customer for their email and say a booking link\n` +
      `  will be sent to them.\n` +
      `\n` +
      `BOOKING SLOT-FILL RULES — capture these in order, one question at a time:\n` +
      `  1. Move date (or approximate — "sometime in October" is fine).\n` +
      `  2. Pickup address or neighbourhood (e.g. "Beltline", "Okotoks").\n` +
      `  3. Drop-off address or neighbourhood.\n` +
      `  4. Rough size: studio / 1-bed / 2-bed / 3-bed+ / office.\n` +
      `  5. Name and best phone number or email to send the quote link.\n` +
      `Do NOT ask for all of them at once. One slot per turn. If the customer\n` +
      `volunteers several, capture them all and skip those slots.\n` +
      `\n` +
      `COMMON OBJECTIONS:\n` +
      `- "Too expensive / price" → remind them the quote is free, mention LERVIT10.\n` +
      `- "Already have a mover" → congratulate them and ask if they'd like a\n` +
      `  backup quote (movers sometimes cancel last-minute).\n` +
      `- "Not ready yet" → ask their timeline; offer to send a reminder.\n` +
      `- "Just browsing" → offer to hold a tentative date, no charge.\n` +
      `\n` +
      (context?.callType === 'mover_dispatch' && moveContext
        ? `JOB DETAILS FOR THIS CALL:\n${moveContext}\n\n`
        : '') +
      `CURRENT GOAL: ${goal}\n` +
      `\n` +
      objectionRule +
      `GUARDRAILS:\n` +
      `- Never promise a price without directing the customer to lervit.com for\n` +
      `  an exact quote (you can give ballpark ranges if pushed).\n` +
      `- Never argue. If a caller is rude, calmly offer to call back another time.\n` +
      `- If asked something you don't know, say "Great question — I'll have the\n` +
      `  team follow up" and offer to take their email.\n` +
      `- Never reveal that you are an AI unless directly and sincerely asked.\n` +
      `  If asked sincerely, be honest and move the conversation forward.\n`;

    // Dynamic variables the console-side agent config interpolates as
    // {{leadId}} / {{leadName}} / {{companyName}} — most importantly the
    // report_objection tool's leadId param, which has no other way to learn
    // which lead is on the phone. Always sent, with '' for what we don't know:
    // ElevenLabs fails the conversation if a variable the agent references was
    // not provided, and an inbound call has no lead behind it.
    const dynamicVariables = {
      leadId: context?.leadId ?? '',
      leadName: context?.customerName ?? '',
      companyName: context?.companyName ?? '',
    };

    logger.info(
      { callControlId, leadId: dynamicVariables.leadId || undefined },
      '[Bridge] Seeding agent dynamic variables',
    );

    elevenWs.send(
      JSON.stringify({
        type: 'conversation_initiation_client_data',
        conversation_config_override: {
          agent: {
            prompt: { prompt },
            first_message: firstMessage,
            language: 'en',
          },
          tts: {
            model_id: 'eleven_flash_v2',
            voice_settings: {
              stability: 0.25,
              similarity_boost: 0.75,
              style: 0.0,
              use_speaker_boost: true,
            },
            optimize_streaming_latency: 4,
            // No output_format here on purpose: ElevenLabs drops it unless the
            // agent whitelists the override, and drops it *silently*, which is
            // what made a64533f/e6af118/8283e79 all look plausible and all fail.
            // createPcmToMuLawEncoder converts on the way out to Telnyx instead.
          },
          conversation: {
            client_events: ['audio', 'interruption', 'agent_response'],
          },
          // No turn-taking config here. `asr.turn_detection` (mode /
          // silence_duration_ms / threshold) is OpenAI Realtime's shape, not
          // ElevenLabs'; theirs is conversation_config.turn — turn_eagerness
          // plus turn_timeout in *seconds*, min 1, so 900ms isn't expressible.
          // And `turn` is not on the override allowlist, so a block here would
          // be dropped silently exactly like tts.output_format above. Nova's
          // "let the customer finish their thought" pause is set on the agent
          // in the ElevenLabs console.
        },
      }),
    );
  });

  elevenWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'conversation_initiation_metadata') {
        agentOutputFormat =
          msg.conversation_initiation_metadata_event?.agent_output_audio_format;
        logger.info(
          { callControlId, metadata: msg.conversation_initiation_metadata_event },
          '[Bridge] ElevenLabs negotiated config',
        );
      }

      if (msg.type === 'audio' && msg.audio_event?.audio_base_64) {
        if (telnyxWs.readyState === WebSocket.OPEN) {
          let payload: string | undefined = msg.audio_event.audio_base_64;

          if (agentOutputFormat === 'pcm_16000') {
            const encoded = muLaw.encode(
              Buffer.from(msg.audio_event.audio_base_64, 'base64'),
            );
            // A chunk carrying only a half sample encodes to nothing; sending an
            // empty media frame would just make Telnyx reject the payload.
            payload = encoded.length > 0 ? encoded.toString('base64') : undefined;
          }

          if (payload) {
            telnyxWs.send(
              JSON.stringify({
                event: 'media',
                stream_id: telnyxStreamId,
                media: {
                  payload,
                },
              }),
            );
          }
        }
      }

      if (msg.type === 'interruption') {
        muLaw.reset();
        if (telnyxWs.readyState === WebSocket.OPEN) {
          telnyxWs.send(JSON.stringify({ event: 'clear' }));
        }
      }
    } catch (err) {
      logger.error({ err }, '[Bridge] ElevenLabs parse error');
    }
  });

  telnyxWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.event === 'start') {
        telnyxStreamId = msg.stream_id;
        logger.info(
          { callControlId, streamId: telnyxStreamId },
          '[Bridge] Stream started',
        );
      }

      if (
        msg.event === 'media' &&
        msg.media?.payload &&
        msg.media?.track === 'inbound'
      ) {
        if (elevenWs.readyState === WebSocket.OPEN) {
          elevenWs.send(
            JSON.stringify({
              user_audio_chunk: msg.media.payload,
            }),
          );
        }
      }

      if (msg.event === 'stop') {
        logger.info({ callControlId }, '[Bridge] Telnyx stream stopped');
        elevenWs.close();
      }
    } catch (err) {
      logger.error({ err }, '[Bridge] Telnyx parse error');
    }
  });

  elevenWs.on('error', (err) => {
    logger.error({ err, callControlId }, '[Bridge] ElevenLabs error');
  });

  elevenWs.on('close', (code, reason) => {
    logger.info(
      { callControlId, code, reason: reason?.toString() },
      '[Bridge] ElevenLabs disconnected',
    );
  });

  telnyxWs.on('close', () => {
    logger.info({ callControlId }, '[Bridge] Telnyx disconnected');
    elevenWs.close();
  });
}
