/**
 * Google Cloud Vision helper — OCR text extraction from mover document URLs.
 *
 * Uses the REST endpoint (images:annotate) with an API key so no service
 * account setup is required. Reid calls this before running its LLM audit so
 * the model has the actual document contents (name, dates, policy numbers)
 * to check against the mover's profile.
 *
 * If GOOGLE_VISION_API_KEY is unset the extractor short-circuits with an
 * empty result rather than throwing — Reid falls back to metadata-only audit.
 */

import { logger } from '../logger';

interface VisionResult {
  text: string;
  confidence: number;
  error?: string;
}

const VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY;

export async function extractTextFromDocument(documentUrl: string): Promise<VisionResult> {
  if (!VISION_API_KEY) {
    logger.warn('[Vision] GOOGLE_VISION_API_KEY not set — skipping OCR');
    return { text: '', confidence: 0, error: 'no_api_key' };
  }

  try {
    const docResponse = await fetch(documentUrl);

    if (!docResponse.ok) {
      return { text: '', confidence: 0, error: 'fetch_failed' };
    }

    const arrayBuffer = await docResponse.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    const visionResponse = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64 },
              features: [
                { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 },
                { type: 'TEXT_DETECTION', maxResults: 1 },
              ],
            },
          ],
        }),
      },
    );

    const visionData = (await visionResponse.json()) as any;

    if (!visionResponse.ok) {
      logger.error({ error: visionData }, '[Vision] API error');
      return { text: '', confidence: 0, error: 'api_error' };
    }

    const annotation = visionData.responses?.[0]?.fullTextAnnotation;

    if (!annotation) {
      return { text: '', confidence: 0, error: 'no_text_found' };
    }

    const text: string = annotation.text ?? '';

    const pages = annotation.pages ?? [];
    let totalConf = 0;
    let confCount = 0;
    for (const page of pages) {
      for (const block of page.blocks ?? []) {
        if (typeof block.confidence === 'number') {
          totalConf += block.confidence;
          confCount++;
        }
      }
    }
    const confidence = confCount > 0 ? totalConf / confCount : 0.5;

    logger.info(
      { textLength: text.length, confidence: Math.round(confidence * 100) },
      '[Vision] Text extracted',
    );

    return { text, confidence };
  } catch (err: any) {
    logger.error({ err }, '[Vision] extractText failed');
    return { text: '', confidence: 0, error: err?.message ?? 'unknown_error' };
  }
}

export function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|bmp|tiff|pdf)(\?|$)/i.test(url);
}
