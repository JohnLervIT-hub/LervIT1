/**
 * One-time outreach: ask movers registered under a business name to switch
 * their account to their legal name.
 *
 * `users.name` is the mover's LEGAL name — document verification and Stripe
 * payouts both match against it, so a mover registered as
 * "Calgary Junk Removal Ltd" silently fails both. movers.display_name (added
 * in 0044) now carries the business name instead, so there is somewhere for it
 * to go.
 *
 * DRY RUN BY DEFAULT — matching mark-cold-sam-leads.ts. Pass --execute to
 * actually send. A bare run only ever prints.
 *
 * Re-running never double-sends: each send writes a
 * 'mover_name_correction_email' business event keyed to the user id, and that
 * event is checked first.
 *
 * Usage (local, needs DATABASE_URL + RESEND_API_KEY):
 *   npx tsx scripts/mover-name-correction.ts            # dry run
 *   npx tsx scripts/mover-name-correction.ts --execute   # sends
 *
 * Usage (Railway):
 *   railway run npx tsx scripts/mover-name-correction.ts [--execute]
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../server/db';
import { users, movers, businessEvents } from '../shared/schema';
import { sendResendEmail, EMAIL_SENDERS } from '../server/notifications';
import { escapeHtml } from '../server/lib/promptSanitizer';
import { getBaseUrl } from '../server/utils/urls';
import { looksLikeBusinessName, matchedBusinessKeywords } from '../shared/mover-name';

const DRY_RUN = !process.argv.includes('--execute');
const EVENT_TYPE = 'mover_name_correction_email';

async function main() {
  console.log(`\n=== mover-name-correction [${DRY_RUN ? 'DRY RUN' : 'EXECUTE'}] ===\n`);

  // Keyword matching happens in TS, not SQL: the shared helper is what the
  // signup warning uses, so the two can never disagree about what counts as a
  // business name.
  const moverRows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      displayName: movers.displayName,
    })
    .from(users)
    .leftJoin(movers, eq(movers.userId, users.id))
    .where(eq(users.role, 'mover'));

  const affected = moverRows.filter((r) => looksLikeBusinessName(r.name));

  console.log(`Movers scanned:  ${moverRows.length}`);
  console.log(`Business-looking: ${affected.length}\n`);

  if (affected.length === 0) {
    console.log('Nothing to do.\n');
    return;
  }

  for (const row of affected) {
    console.log(
      `  ${row.email.padEnd(36)} ${JSON.stringify(row.name).padEnd(34)} ` +
      `matched: ${matchedBusinessKeywords(row.name).join(', ')}` +
      `${row.displayName ? `  (display_name already set: ${JSON.stringify(row.displayName)})` : ''}`,
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
        eq(businessEvents.eventType, EVENT_TYPE),
        eq(businessEvents.entityType, 'user'),
        eq(businessEvents.entityId, row.userId),
      ))
      .limit(1);

    if (already) {
      skipped++;
      console.log(`  SKIP (already emailed)  ${row.email}`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`  WOULD SEND              ${row.email}`);
      continue;
    }

    const firstName = (row.name ?? 'there').split(/\s+/)[0];
    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px;">
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>Your LervIT mover account is registered under
        <strong>${escapeHtml(row.name)}</strong>, which looks like a business name
        rather than a person's legal name.</p>
      <p>We need your <strong>legal first and last name</strong> on the account because
        it has to match two things we check against government and banking records:</p>
      <ul>
        <li><strong>Document verification</strong> — your ID, licence and insurance are
          matched to the name on the account.</li>
        <li><strong>Payouts</strong> — our payment processor verifies your legal name
          before it can pay you.</li>
      </ul>
      <p>If either doesn't match, verification stalls and payouts can be held.</p>
      <p>You can fix this in under a minute, and you don't lose your business name —
        there's now a separate <strong>Business / display name</strong> field, and that
        is what customers see:</p>
      <p><a href="${settingsUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Update your profile</a></p>
      <p style="color:#555;font-size:14px;">Put your legal name in <em>Legal Full Name</em>
        and your business name in <em>Business / display name</em>.</p>
      <p>Questions? Just reply to this email.</p>
      <p>— The LervIT Team</p>
    </div>`;

    const text = [
      `Hi ${firstName},`,
      ``,
      `Your LervIT mover account is registered under "${row.name}", which looks like a`,
      `business name rather than a person's legal name.`,
      ``,
      `We need your legal first and last name on the account because it has to match`,
      `your verification documents and the name our payment processor verifies before`,
      `it can pay you. If either doesn't match, verification stalls and payouts can be held.`,
      ``,
      `You don't lose your business name — there's now a separate "Business / display`,
      `name" field, and that is what customers see.`,
      ``,
      `Update your profile: ${settingsUrl}`,
      ``,
      `Questions? Just reply to this email.`,
      ``,
      `— The LervIT Team`,
    ].join('\n');

    try {
      await sendResendEmail({
        from: EMAIL_SENDERS.TRANSACTIONAL,
        replyTo: 'support@lervit.com',
        to: row.email,
        subject: 'Action required: Update your LervIT profile to your legal name',
        html,
        text,
      });
    } catch (err) {
      console.error(`  FAILED                  ${row.email}:`, err);
      continue;
    }

    // Written only after a successful send, so a failure is retried next run.
    await db.insert(businessEvents).values({
      eventType: EVENT_TYPE,
      entityType: 'user',
      entityId: row.userId,
      payload: {
        name: row.name,
        matched: matchedBusinessKeywords(row.name),
      },
      source: 'admin',
    });

    sent++;
    console.log(`  SENT                    ${row.email}`);
  }

  console.log(`\n${DRY_RUN ? 'Would send' : 'Sent'}: ${DRY_RUN ? affected.length - skipped : sent}   Skipped (already emailed): ${skipped}\n`);
  if (DRY_RUN) console.log('Dry run — nothing was sent. Re-run with --execute to send.\n');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('mover-name-correction failed:', err);
    process.exit(1);
  });
