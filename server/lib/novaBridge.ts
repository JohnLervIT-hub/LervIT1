import WebSocket from 'ws';
import { logger } from '../logger';

const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID;

export function createNovaBridge(
  telnyxWs: WebSocket,
  callControlId: string,
): void {
  if (!ELEVENLABS_AGENT_ID) {
    logger.error('[Bridge] No agent ID');
    return;
  }

  logger.info({ callControlId }, '[Bridge] Connecting to ElevenLabs');

  const elevenWs = new WebSocket(
    `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${ELEVENLABS_AGENT_ID}`,
  );

  elevenWs.on('open', () => {
    logger.info({ callControlId }, '[Bridge] ElevenLabs connected');

    elevenWs.send(
      JSON.stringify({
        type: 'conversation_initiation_client_data',
        conversation_config_override: {
          agent: {
            prompt: {
              prompt:
                'You are Nova from LervIT Moving Calgary. ' +
                'Be warm, brief, and help book moves.',
            },
            first_message:
              'Hey! Nova from LervIT — ' +
              'you wanted to chat about a move. ' +
              'How can I help?',
            language: 'en',
          },
          tts: {
            voiceId: process.env.ELEVENLABS_VOICE_ID ?? undefined,
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

      if (msg.event === 'media' && msg.media?.payload) {
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
