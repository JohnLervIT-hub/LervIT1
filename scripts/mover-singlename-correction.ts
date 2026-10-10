/**
 * One-time outreach: ask movers whose profile has only one word in it to add
 * their last name.
 *
 * Document verification and Stripe payouts match the full legal name, so a
 * one-word profile stalls both. Most of these are honest omissions, so the
 * email is deliberately brief and non-accusatory.
 *
 * IMPORTANT: a mononym can be someone's complete legal name. Read the dry-run
 * listing before sending and flag anything that looks like a real one-word
 * legal name rather than emailing it.
 *
 * DRY RUN BY DEFAULT. Pass --execute to actually send. Re-running never
 * double-sends: see the guard in scripts/lib/mover-outreach.ts.
 *
 * Usage (local, needs DATABASE_URL + RESEND_API_KEY):
 *   npx tsx scripts/mover-singlename-correction.ts            # dry run
 *   npx tsx scripts/mover-singlename-correction.ts --execute   # sends
 *
 * Usage (Railway):
 *   railway run npx tsx scripts/mover-singlename-correction.ts [--execute]
 */

import { escapeHtml } from '../server/lib/promptSanitizer';
import { isSingleWordName } from '../shared/mover-name';
import { runMoverOutreach } from './lib/mover-outreach';

runMoverOutreach({
  scriptName: 'mover-singlename-correction',
  eventType: 'mover_singlename_correction_email',
  subject: 'Action required: Add your last name to your LervIT profile',
  matches: (row) => isSingleWordName(row.name),
  describe: () => 'single word',
  buildEmail: (row, settingsUrl) => {
    const firstName = (row.name ?? 'there').trim().split(/\s+/)[0];
    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px;">
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>Your LervIT mover profile currently shows just
        <strong>${escapeHtml(row.name)}</strong> — one name rather than a first and
        last name.</p>
      <p>We need both because your name is matched against your verification
        documents, and our payment processor verifies it before it can pay you. A
        partial name can hold up verification and payouts.</p>
      <p>It takes about a minute to update:</p>
      <p><a href="${settingsUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Update your profile</a></p>
      <p style="color:#555;font-size:14px;">If <em>${escapeHtml(row.name)}</em> is your
        full legal name as it appears on your ID, just reply and let us know — we'll
        note it on your account and nothing further is needed.</p>
      <p>— The LervIT Team</p>
    </div>`;

    const text = [
      `Hi ${firstName},`,
      ``,
      `Your LervIT mover profile currently shows just "${row.name}" — one name rather`,
      `than a first and last name.`,
      ``,
      `We need both because your name is matched against your verification documents,`,
      `and our payment processor verifies it before it can pay you. A partial name can`,
      `hold up verification and payouts.`,
      ``,
      `Update your profile: ${settingsUrl}`,
      ``,
      `If "${row.name}" is your full legal name as it appears on your ID, just reply and`,
      `let us know — we'll note it on your account and nothing further is needed.`,
      ``,
      `— The LervIT Team`,
    ].join('\n');

    return { html, text };
  },
})
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('mover-singlename-correction failed:', err);
    process.exit(1);
  });
