/**
 * Xavier Cole (APEX) — CEO orchestrator agent.
 *
 * Actions:
 *   - `daily_brief`: generate a plain-text operational brief from the
 *     shared intelligence summary, persist it, and SMS it to John.
 *   - `escalate`:    craft a short severity-tagged alert on behalf of
 *     another agent and SMS it to John.
 *
 * BaseAgent handles the `agent.apex.<action>` event + agent_logs row on
 * every run. This class emits a second explicit event (`apex.daily_brief`
 * / `apex.escalation`) so admin UIs can query by that friendly name
 * without joining on payload keys.
 */

import { BaseAgent } from './base';
import { emitEvent } from '../events';
import { buildIntelligenceSummary, type IntelligenceSummary } from '../intelligence';
import { logger } from '../logger';

const XAVIER_MODEL = 'claude-opus-4-6';

const CALGARY_TZ = 'America/Edmonton';

interface DailyBriefResult {
  brief: string;
  summary: IntelligenceSummary;
  smsSent: boolean;
  generatedAt: string;
}

interface EscalateInput {
  issue: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  agentName: string;
  data: Record<string, any>;
}

interface EscalateResult {
  message: string;
  smsSent: boolean;
  sentAt: string;
}

export class XavierAgent extends BaseAgent {
  name = 'Xavier Cole';
  code = 'apex';

  protected async execute(action: string, input: Record<string, any>): Promise<any> {
    switch (action) {
      case 'daily_brief':
        return this.dailyBrief();
      case 'escalate':
        return this.escalate(input as EscalateInput);
      default:
        throw new Error(`Xavier: unknown action "${action}"`);
    }
  }

  private async dailyBrief(): Promise<DailyBriefResult> {
    const summary = await buildIntelligenceSummary();

    const brief = await this.callClaude(
      `You are Xavier Cole, the AI CEO Agent for LervIT Technologies.
You generate concise daily operational briefs for John Eki, the founder.
Be direct, data-driven, and flag anything requiring his attention.
Format: plain text, no markdown, no emojis.`,
      `Generate today's LervIT brief based on this data:
${JSON.stringify(summary, null, 2)}

Include:
1. Revenue snapshot (today vs target)
2. Active operations status
3. Mover supply health
4. Any alerts or escalations
5. Top 3 priorities for John today

Keep it under 300 words. Direct and actionable.`,
      XAVIER_MODEL,
      1000,
    );

    const generatedAt = new Date().toISOString();

    await emitEvent(
      'apex.daily_brief',
      'agent',
      this.code,
      { brief, summary, generatedAt },
      'agent',
    );

    const smsSent = await this.sendSms(
      `LervIT Daily Brief - ${new Date().toLocaleDateString('en-CA', { timeZone: CALGARY_TZ })}\n\n${brief.slice(0, 1500)}`,
    );

    return { brief, summary, smsSent, generatedAt };
  }

  private async escalate(input: EscalateInput): Promise<EscalateResult> {
    if (!input?.issue || !input?.severity || !input?.agentName) {
      throw new Error('Xavier.escalate: issue, severity, and agentName are required');
    }

    const message = await this.callClaude(
      `You are Xavier Cole, AI CEO Agent for LervIT.
Craft a brief escalation alert for John Eki. Be specific and actionable.
Under 100 words. Plain text, no markdown.`,
      `Escalation from ${input.agentName}:
Issue: ${input.issue}
Severity: ${input.severity}
Data: ${JSON.stringify(input.data ?? {})}`,
      XAVIER_MODEL,
      300,
    );

    const sentAt = new Date().toISOString();

    await emitEvent(
      'apex.escalation',
      'agent',
      this.code,
      { ...input, message, sentAt },
      'agent',
    );

    const smsSent = await this.sendSms(
      `LervIT Alert [${input.severity.toUpperCase()}]\n${message}`,
    );

    return { message, smsSent, sentAt };
  }

  private async sendSms(text: string): Promise<boolean> {
    const to = process.env.JOHN_PHONE_NUMBER;
    const apiKey = process.env.TELNYX_API_KEY;
    const from = process.env.TELNYX_SMS_FROM;

    if (!to || !apiKey || !from) {
      logger.warn(
        { hasTo: !!to, hasApiKey: !!apiKey, hasFrom: !!from },
        'Xavier: SMS skipped — missing JOHN_PHONE_NUMBER, TELNYX_API_KEY, or TELNYX_SMS_FROM',
      );
      return false;
    }

    try {
      const response = await fetch('https://api.telnyx.com/v2/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to, text }),
      });

      if (!response.ok) {
        const body = await response.text();
        logger.error({ status: response.status, body }, 'Xavier: Telnyx SMS failed');
        return false;
      }
      return true;
    } catch (err) {
      logger.error({ err }, 'Xavier: Telnyx SMS threw');
      return false;
    }
  }
}

export const xavier = new XavierAgent();
