import WebSocket from 'ws';
import { logger } from '../logger';

const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID;

export interface NovaCallContext {
  callType?: string;
  customerName?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  price?: string;
  leadId?: string;
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
        ? `${greeting} You started booking a move but didn't complete payment. Want me to send the link again?`
        : `${greeting} You wanted to chat about your move. How can I help?`;

    const goal = context?.resume
      ? context.resume.goal
      : context?.callType === 'lead_conversion'
        ? 'Book the move live on this call. Offer LERVIT10 if they hesitate.'
        : context?.callType === 'payment_recovery'
        ? 'Get customer to complete payment at lervit.com'
        : 'Help customer with their move. Get pickup and dropoff addresses.';

    const prompt =
      `You are Nova from LervIT Moving Calgary.\n` +
      `Be warm, casual, local. Max 2 sentences per response.\n` +
      `Never spell out words. Say "LervIT" as "LER-vit".\n` +
      `Say "lervit.com" as "lervit dot com".\n` +
      `Goal: ${goal}`;

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
            model_id: 'eleven_flash_v2_5',
            voice_settings: {
              stability: 0.25,
              similarity_boost: 0.75,
              style: 0.0,
              use_speaker_boost: true,
            },
            optimize_streaming_latency: 4,
          },
          conversation: {
            client_events: ['audio', 'interruption', 'agent_response'],
          },
          input_format: {
            type: 'ulaw',
            sample_rate: 8000,
          },
          output_format: {
            type: 'ulaw',
            sample_rate: 8000,
          },
        },
      }),
    );
  });

  elevenWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'audio' && msg.audio_event?.audio_base_64) {
        if (telnyxWs.readyState === WebSocket.OPEN) {
          telnyxWs.send(
            JSON.stringify({
              event: 'media',
              stream_id: telnyxStreamId,
              media: {
                payload: msg.audio_event.audio_base_64,
              },
            }),
          );
        }
      }

      if (msg.type === 'interruption') {
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

  elevenWs.on('close', () => {
    logger.info({ callControlId }, '[Bridge] ElevenLabs disconnected');
  });

  telnyxWs.on('close', () => {
    logger.info({ callControlId }, '[Bridge] Telnyx disconnected');
    elevenWs.close();
  });
}
