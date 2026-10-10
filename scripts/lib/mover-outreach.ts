/**
 * Shared scaffolding for one-shot mover name-correction outreach.
 *
 * Both callers (business-name and single-word-name) do the same thing: scan
 * mover rows, filter on a shared predicate, skip anyone already emailed, and
 * either print or send. Only the predicate, the subject and the body differ,
 * so those are the parameters and everything else — the dry-run default and
 * the per-user idempotency guard — lives here where it cannot be forgotten.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../server/db';
import { users, movers, businessEvents } from '../../shared/schema';
import { sendResendEmail, EMAIL_SENDERS } from '../../server/notifications';
import { getBaseUrl } from '../../server/utils/urls';

export interface MoverRow {
  userId: string;
  name: string;
  email: string;
  displayName: string | null;
}

export interface MoverOutreachConfig {
  /** Shown in the run header. */
  scriptName: string;
  /** business_events.event_type for the per-user send guard. */
  eventType: string;
  subject: string;
  /** Which movers this outreach is for. */
  matches: (row: MoverRow) => boolean;
  /** Extra detail per row in the audit listing, e.g. which keywords matched. */
  describe?: (row: MoverRow) => string;
  buildEmail: (row: MoverRow, settingsUrl: string) => { html: string; text: string };
  /** Recorded on the guard event for later inspection. */
  payload?: (row: MoverRow) => Record<string, unknown>;
}

export async function runMoverOutreach(cfg: MoverOutreachConfig): Promise<void> {
  // DRY RUN BY DEFAULT. A bare run never sends.
  const dryRun = !process.argv.includes('--execute');
  console.log(`\n=== ${cfg.scriptName} [${dryRun ? 'DRY RUN' : 'EXECUTE'}] ===\n`);

  // Filtering happens in TS, not SQL, so the script and the client-side
  // warning share one definition and cannot drift apart.
  const moverRows: MoverRow[] = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      displayName: movers.displayName,
    })
    .from(users)
    .leftJoin(movers, eq(movers.userId, users.id))
    .where(eq(users.role, 'mover'));

  const affected = moverRows.filter(cfg.matches);

  console.log(`Movers scanned: ${moverRows.length}`);
  console.log(`Matched:        ${affected.length}\n`);

  if (affected.length === 0) {
    console.log('Nothing to do.\n');
    return;
  }

  for (const row of affected) {
    const extra = cfg.describe?.(row);
    console.log(
      `  ${row.email.padEnd(36)} ${JSON.stringify(row.name).padEnd(30)}` +
      `${extra ? `  ${extra}` : ''}` +
      `${row.displayName ? `  (display_name: ${JSON.stringify(row.displayName)})` : ''}`,
    );
  }
  console.log('');

  const settingsUrl = `${getBaseUrl()}/mover-settings`;
  let sent = 0;
  let skipped = 0;

  for (const row of affected) {
    const [already] = await db
      .select({ id: businessEvents.id })
      .from(businessEvents)
      .where(and(
        eq(businessEvents.eventType, cfg.eventType),
        eq(businessEvents.entityType, 'user'),
        eq(businessEvents.entityId, row.userId),
      ))
      .limit(1);

    if (already) {
      skipped++;
      console.log(`  SKIP (already emailed)  ${row.email}`);
      continue;
    }

    if (dryRun) {
      console.log(`  WOULD SEND              ${row.email}`);
      continue;
    }

    const { html, text } = cfg.buildEmail(row, settingsUrl);

    try {
      await sendResendEmail({
        from: EMAIL_SENDERS.TRANSACTIONAL,
        replyTo: 'support@lervit.com',
        to: row.email,
        subject: cfg.subject,
        html,
        text,
      });
    } catch (err) {
      console.error(`  FAILED                  ${row.email}:`, err);
      continue;
    }

    // Written only AFTER a successful send, so a transient Resend failure is
    // retried on the next run instead of being permanently marked as sent.
    await db.insert(businessEvents).values({
      eventType: cfg.eventType,
      entityType: 'user',
      entityId: row.userId,
      payload: { name: row.name, ...(cfg.payload?.(row) ?? {}) },
      source: 'admin',
    });

    sent++;
    console.log(`  SENT                    ${row.email}`);
  }

  const pending = affected.length - skipped;
  console.log(`\n${dryRun ? 'Would send' : 'Sent'}: ${dryRun ? pending : sent}   Skipped (already emailed): ${skipped}\n`);
  if (dryRun) console.log('Dry run — nothing was sent. Re-run with --execute to send.\n');
}
