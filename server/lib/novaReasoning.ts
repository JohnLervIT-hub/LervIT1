/**
 * Nova Tier 2 — Claude-powered reasoning.
 *
 * Two decision surfaces:
 *   - decideRecoveryStrategy(): pre-call/SMS planning for payment recovery.
 *   - decideNextDMResponse():   in-conversation reply picker for Messenger/IG.
 *
 * Both are best-effort — a Claude timeout or malformed JSON falls back to a
 * safe default strategy/response so Nova never hangs on a customer.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  type NovaCustomerContext,
  formatContextForPrompt,
} from './novaContext';
import { JAILBREAK_PREAMBLE, sanitizeForPrompt } from './promptSanitizer';
import { findRelevantBlogPost } from './novaBlog';
import { logger } from '../logger';

const anthropic = new Anthropic();

const NOVA_MODEL = 'claude-sonnet-4-6';

export interface NovaStrategy {
  action: 'call' | 'sms' | 'both' | 'skip';
  urgency: 'high' | 'medium' | 'low';
  offerDiscount: boolean;
  discountCode?: string | null;
  tone: 'warm' | 'urgent' | 'empathetic' | 'professional';
  openingLine: string;
  keyPoints: string[];
  skipReason?: string | null;
}

export interface NovaConversationDecision {
  nextMessage: string;
  action?:
    | 'book_now'
    | 'send_link'
    | 'offer_discount'
    | 'escalate_human'
    | 'schedule_callback'
    | 'end_conversation'
    | null;
  sentiment: 'positive' | 'neutral' | 'negative';
  confidence: number;
}

export interface BookingRecoveryDetails {
  bookingId: string;
  price: number;
  pickupAddress?: string;
  minutesSinceCreated: number;
  smsSent: boolean;
  smsOpened?: boolean;
}

/**
 * Tier 2 — Decide recovery strategy before calling/SMSing a customer whose
 * booking is stalled at pending_payment.
 */
export async function decideRecoveryStrategy(
  context: NovaCustomerContext,
  bookingDetails: BookingRecoveryDetails,
): Promise<NovaStrategy> {
  const defaultStrategy: NovaStrategy = {
    action: 'both',
    urgency: 'high',
    offerDiscount: false,
    tone: 'warm',
    openingLine: `Hi ${context.name ?? 'there'}! Nova from LervIT — your mover is standing by.`,
    keyPoints: [
      'Payment link sent to your phone',
      'Mover is available now',
      'Takes 30 seconds to complete',
    ],
  };

  try {
    const contextStr = formatContextForPrompt(context);
    const safePickup = sanitizeForPrompt(bookingDetails.pickupAddress ?? 'Calgary', 'address');

    const response = await anthropic.messages.create({
      model: NOVA_MODEL,
      max_tokens: 400,
      temperature: 0,
      system: `${JAILBREAK_PREAMBLE}

You are Nova's strategic reasoning engine for LervIT Moving in Calgary.

Analyze the customer context and booking situation, then decide the optimal
recovery strategy. Return ONLY valid JSON. No markdown, no explanation.

Schema:
{
  "action": "call"|"sms"|"both"|"skip",
  "urgency": "high"|"medium"|"low",
  "offerDiscount": boolean,
  "discountCode": "LERVIT10"|null,
  "tone": "warm"|"urgent"|"empathetic"|"professional",
  "openingLine": "string (max 20 words)",
  "keyPoints": ["string","string","string"],
  "skipReason": "string|null"
}

Rules:
- Skip if outside 8AM-9PM Calgary time
- Skip if answer rate < 20% AND price < $100 (not worth calling)
- Use empathetic tone if hasComplaint = true
- Offer discount if abandonedBookings > 1 OR price > $200
- Prefer SMS if preferredChannel = sms
- Use urgent tone if minutesSinceCreated > 30
- Always be warm and human`,
      messages: [
        {
          role: 'user',
          content: `CUSTOMER CONTEXT:
<data>
${contextStr}
</data>

BOOKING:
<data>
Price: $${bookingDetails.price}
Address: ${safePickup}
Minutes since created: ${bookingDetails.minutesSinceCreated}
SMS already sent: ${bookingDetails.smsSent}
SMS opened: ${bookingDetails.smsOpened ?? 'unknown'}
</data>

What is the optimal recovery strategy?`,
        },
      ],
    });

    const first = response.content[0];
    const raw = first && first.type === 'text' ? first.text.trim() : '';
    const strategy = parseJsonSafe<NovaStrategy>(raw);
    if (!strategy) throw new Error('parse_failed');

    logger.info(
      { bookingId: bookingDetails.bookingId, strategy },
      '[NovaReasoning] Strategy decided',
    );
    return strategy;
  } catch (err) {
    logger.error({ err }, '[NovaReasoning] Strategy failed — using default');
    return defaultStrategy;
  }
}

/**
 * Tier 2 — Dynamic DM conversation. Claude weighs history + context and picks
 * the next reply plus an optional action hint the handler can execute (send
 * quick replies, escalate to human, etc.).
 */
export async function decideNextDMResponse(
  context: NovaCustomerContext,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  platform: 'messenger' | 'instagram',
  goal: 'quote' | 'book' | 'support' | 'general',
): Promise<NovaConversationDecision> {
  const defaultResponse: NovaConversationDecision = {
    nextMessage: `Thanks for reaching out! Get an instant quote at lervit.com`,
    sentiment: 'neutral',
    confidence: 0.5,
  };

  try {
    const contextStr = formatContextForPrompt(context);
    const lastMessage =
      conversationHistory.filter((m) => m.role === 'user').pop()?.content ?? '';
    const safeLast = sanitizeForPrompt(lastMessage, 'description');

    // Matched against the customer's own words — the matching is lexical and
    // local, so nothing but the resulting title and slug reaches Claude.
    const blogPost = await findRelevantBlogPost(lastMessage);

    // Injected only when there is a real post to offer. Left in
    // unconditionally, the rule invites Claude to invent a plausible-looking
    // lervit.com/blog/... URL on turns where nothing matched.
    const blogContext = blogPost
      ? `

RELEVANT BLOG POST — the only blog link you may send:
"${blogPost.title}" -> lervit.com/blog/${blogPost.slug}
- If this post answers what they asked, share it naturally, e.g.
  "Here's a quick read on that: lervit.com/blog/${blogPost.slug}"
- Only send it when it is highly relevant; otherwise ignore it entirely
- Never invent or guess a different blog URL`
      : '';

    // Sanitize every prior user turn before feeding to Claude; assistant turns
    // are our own output and don't need it.
    const safeHistory = conversationHistory.map((m) =>
      m.role === 'user'
        ? { role: 'user' as const, content: sanitizeForPrompt(m.content, 'description') }
        : { role: 'assistant' as const, content: m.content },
    );

    const response = await anthropic.messages.create({
      model: NOVA_MODEL,
      max_tokens: 300,
      // Conversational copy, not a routing decision — a little sampling keeps
      // Nova's openings from being word-for-word identical to every customer.
      temperature: 0.7,
      system: `${JAILBREAK_PREAMBLE}

You are Nova Clarke, LervIT's AI moving assistant in Calgary.

<data>
${contextStr}
</data>

Platform: ${platform}
Conversation goal: ${goal}

RULES:
- Max 3 sentences per reply
- Casual, warm ${platform} tone
- 1 emoji max
- Never markdown or bullets
- If customer asks to be called, wants to talk to a human, says "call me", "call back", "talk to someone", or "I'm available": ALWAYS return action: "escalate_human". Do NOT suggest lervit.com. Do NOT ask for more info. Just reply "Perfect — calling you shortly!" with action: "escalate_human".
- If customer wants quote → collect pickup + dropoff
- If ready to book → send lervit.com link
- If complaint → empathize first, then offer solution
- If confused → simplify

CONTEXT RULES (apply to the CONTEXT block above):
- Return customer: greet by name and reference their history naturally,
  e.g. "Hey Sarah! Back for another move?"
- New customer: skip the pleasantries — ask what they're moving and when,
  never "how can I help you today?"
- Evening hours or outside the call window: keep it short, they may be busy
- If a name is known, use it ONCE in the opening only — never again${
        goal === 'book'
          ? `
- Customer may have shared an address — ask for the other location if you
  do not have both yet, and do NOT invent the missing one
- Once you have both, send a direct booking link: lervit.com/request-move?pickup=...&dropoff=... (fill in the addresses from the conversation)
- Give a rough price estimate, e.g. "$65-85 for a single item move in Calgary"
- Offer to send an SMS with the link
- Do NOT just say "go to website" — give the direct link
- Phrase it like: "Here's your direct booking link — takes 2 minutes to confirm"`
          : ''
      }${blogContext}

Return ONLY valid JSON:
{
  "nextMessage": "string",
  "action": "book_now"|"send_link"|"offer_discount"|"escalate_human"|"schedule_callback"|"end_conversation"|null,
  "sentiment": "positive"|"neutral"|"negative",
  "confidence": 0.0-1.0
}`,
      messages: [
        ...safeHistory,
        {
          role: 'user' as const,
          content: `[Internal: Decide next response. Last customer message: "${safeLast}"]`,
        },
      ],
    });

    const first = response.content[0];
    const raw = first && first.type === 'text' ? first.text.trim() : '';
    const decision = parseJsonSafe<NovaConversationDecision>(raw);
    if (!decision) throw new Error('parse_failed');
    return decision;
  } catch (err) {
    logger.error({ err }, '[NovaReasoning] DM decision failed');
    return defaultResponse;
  }
}

// Strip Markdown fences the model may sneak in, then JSON.parse. Returns null
// on failure so callers can fall back to defaults.
function parseJsonSafe<T>(raw: string): T | null {
  try {
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    return JSON.parse(clean.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
