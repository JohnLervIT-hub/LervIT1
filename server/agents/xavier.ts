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
import { JAILBREAK_PREAMBLE, sanitizeForPrompt } from '../lib/promptSanitizer';

const XAVIER_MODEL = 'claude-opus-4-6';

const CALGARY_TZ = 'America/Edmonton';

const APP_URL = process.env.APP_BASE_URL ?? 'https://app.lervit.com';

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
      `${JAILBREAK_PREAMBLE}

You are Xavier Cole, the AI CEO Agent for LervIT Technologies.
You generate concise daily operational briefs for John Eki, the founder.
Be direct, data-driven, and flag anything requiring his attention.
Format: plain text, no markdown, no emojis.`,
      `Generate today's LervIT brief based on this data:
<data>
${JSON.stringify(summary, null, 2)}
</data>

Include:
1. Revenue snapshot (today vs target)
2. Live operations: pending_dispatch (paid jobs awaiting a mover) and acceptance_rate
3. Mover supply health (online, available, inactive_7d)
4. Growth: abandoned.pending and abandoned.recovery_rate
5. Any alerts or escalations (sla_breaches, stuck_jobs, incidents)
6. Top 3 priorities for John today

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

    // Whitelist safe fields from escalation data — only primitive IDs and
    // sanitized free-text land in Claude's context. Prevents an attacker-
    // authored `notes` / `reason` field from prompt-injecting Xavier's SMS.
    const rawData = input.data ?? {};
    const safeEscalationData = {
      agentName: rawData.agentName,
      severity: rawData.severity,
      moverId: rawData.moverId,
      bookingId: rawData.bookingId,
      auditId: rawData.auditId,
      campaignId: rawData.campaignId,
      leadId: rawData.leadId,
      score: rawData.score,
      count: rawData.count,
      issue: sanitizeForPrompt(rawData.issue ?? '', 'notes'),
      reason: sanitizeForPrompt(rawData.reason ?? '', 'notes'),
      notes: sanitizeForPrompt(rawData.notes ?? '', 'notes'),
    };

    const safeIssue = sanitizeForPrompt(input.issue, 'notes');
    const safeAgentName = sanitizeForPrompt(input.agentName, 'name');

    const message = await this.callClaude(
      `${JAILBREAK_PREAMBLE}

You are Xavier Cole, AI CEO Agent for LervIT.
Craft a brief escalation alert for John Eki. Be specific and actionable.
Under 100 words. Plain text, no markdown.`,
      `Escalation from ${safeAgentName}:
<data>
Issue: ${safeIssue}
Severity: ${input.severity}
Data: ${JSON.stringify(safeEscalationData)}
</data>`,
      XAVIER_MODEL,
      300,
    );

    const links: string[] = [];
    const data = input.data ?? {};
    if (data.auditId) {
      links.push(`Audit: ${APP_URL}/admin/verification?auditId=${data.auditId}`);
    }
    if (data.moverId) {
      links.push(`Mover: ${APP_URL}/admin/verification?moverId=${data.moverId}`);
    }
    if (data.campaignId) {
      links.push(`Campaign: ${APP_URL}/admin/campaigns/${data.campaignId}`);
    }
    const messageWithLinks = links.length ? `${message}\n\n${links.join('\n')}` : message;

    const sentAt = new Date().toISOString();

    await emitEvent(
      'apex.escalation',
      'agent',
      this.code,
      { ...input, message: messageWithLinks, sentAt },
      'agent',
    );

    const smsSent = await this.sendSms(
      `LervIT Alert [${input.severity.toUpperCase()}]\n${messageWithLinks}`,
    );

    return { message: messageWithLinks, smsSent, sentAt };
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
