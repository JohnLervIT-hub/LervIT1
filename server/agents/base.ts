/**
 * BaseAgent — foundation for autonomous agents (APEX, CLOSER-D, RETAIN, etc.).
 *
 * Every agent extends this class, implements execute(), and gets:
 *   - Anthropic client (shared)
 *   - Automatic agent_logs row on every action (success or failure)
 *   - Automatic business_events emit on success (`agent.<code>.<action>`)
 *   - callClaude() convenience for one-shot Claude calls
 *
 * Logging + event emission are non-blocking — a failed insert must never
 * bubble up as an agent failure.
 */

import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db';
import { agentLogs } from '@shared/schema';
import { emitEvent } from '../events';
import { logger } from '../logger';

export type AgentStatus = 'success' | 'failure' | 'skipped';

export interface AgentRunOptions {
  /** When true, agents run all checks and build the outreach payload but skip
   *  actually sending email/SMS. Used by the admin Preview button. */
  dryRun?: boolean;
}

export abstract class BaseAgent {
  abstract name: string; // e.g. "APEX"
  abstract code: string; // e.g. "apex"

  protected client = new Anthropic();

  async run(
    action: string,
    input: Record<string, any> = {},
    options: AgentRunOptions = {},
  ): Promise<any> {
    const startTime = Date.now();
    let status: AgentStatus = 'success';
    let output: any = null;
    let thrown: Error | null = null;

    try {
      output = await this.execute(action, input, options);
      // Dry runs don't emit an event — they didn't do anything.
      if (!options.dryRun) {
        await emitEvent(
          `agent.${this.code}.${action}`,
          'agent',
          this.name,
          { input, output },
          'agent',
        );
      }
      return output;
    } catch (err) {
      status = 'failure';
      thrown = err instanceof Error ? err : new Error(String(err));
      throw thrown;
    } finally {
      const durationMs = Date.now() - startTime;
      // Non-blocking log — never crash the agent for a logging failure.
      db.insert(agentLogs).values({
        agentName: this.name,
        agentCode: this.code,
        action,
        input: options.dryRun ? { ...input, _dryRun: true } : input,
        output: status === 'success' ? output : { error: thrown?.message ?? null },
        status,
        durationMs,
      }).catch((logErr) => {
        logger.error(
          { logErr, agentCode: this.code, action, status },
          'Failed to persist agent_logs row',
        );
      });
    }
  }

  protected abstract execute(
    action: string,
    input: Record<string, any>,
    options?: AgentRunOptions,
  ): Promise<any>;

  protected async callClaude(
    systemPrompt: string,
    userMessage: string,
    model: string = 'claude-sonnet-4-6',
    maxTokens: number = 1000,
  ): Promise<string> {
    const response = await this.client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const first = response.content[0];
    return first && first.type === 'text' ? first.text : '';
  }
}
