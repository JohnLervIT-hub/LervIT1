/**
 * AgentEventBus — in-process pub/sub for autonomous agents.
 *
 * Separate from business_events (which is the durable audit log). This bus is
 * for orchestration: emit an event, N handlers fire in parallel, failures are
 * isolated so one broken agent can't break the others.
 */

import { logger } from '../logger';

type EventHandler = (data: any) => Promise<void>;

class AgentEventBus {
  private handlers = new Map<string, EventHandler[]>();

  private stats = {
    eventsEmitted: 0,
    handlersRun: 0,
    errors: 0,
  };

  subscribe(eventType: string, handler: EventHandler, agentName: string): void {
    const existing = this.handlers.get(eventType) ?? [];
    this.handlers.set(eventType, [...existing, handler]);

    logger.info(
      {
        eventType,
        agentName,
        totalHandlers: existing.length + 1,
      },
      `[EventBus] ${agentName} subscribed to ${eventType}`,
    );
  }

  async emit(eventType: string, data: any, sourceAgent: string): Promise<void> {
    const handlers = this.handlers.get(eventType) ?? [];

    if (handlers.length === 0) {
      logger.debug(
        { eventType, sourceAgent },
        '[EventBus] No handlers for event',
      );
      return;
    }

    this.stats.eventsEmitted++;

    logger.info(
      {
        eventType,
        sourceAgent,
        handlerCount: handlers.length,
        data,
      },
      `[EventBus] Emitting ${eventType}`,
    );

    const results = await Promise.allSettled(handlers.map((h) => h(data)));

    for (const result of results) {
      if (result.status === 'rejected') {
        this.stats.errors++;
        logger.error(
          { eventType, error: result.reason },
          '[EventBus] Handler failed',
        );
      } else {
        this.stats.handlersRun++;
      }
    }
  }

  getStats() {
    return {
      ...this.stats,
      registeredEvents: Array.from(this.handlers.keys()),
      totalHandlers: Array.from(this.handlers.values()).reduce(
        (sum, h) => sum + h.length,
        0,
      ),
    };
  }
}

export const agentEventBus = new AgentEventBus();
