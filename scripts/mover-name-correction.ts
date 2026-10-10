/**
 * One-time outreach: ask movers registered under a business name to switch
 * their account to their legal name.
 *
 * `users.name` is the mover's LEGAL name — document verification and Stripe
 * payouts both match against it, so a mover registered as
 * "Calgary Junk Removal Ltd" silently fails both. movers.display_name (0044)
 * now carries the business name instead, so there is somewhere for it to go.
 *
 * DRY RUN BY DEFAULT. Pass --execute to actually send. Re-running never
 * double-sends: see the guard in scripts/lib/mover-outreach.ts.
 *
 * Usage (local, needs DATABASE_URL + RESEND_API_KEY):
 *   npx tsx scripts/mover-name-correction.ts            # dry run
 *   npx tsx scripts/mover-name-correction.ts --execute   # sends
 *
 * Usage (Railway):
 *   railway run npx tsx scripts/mover-name-correction.ts [--execute]
 */

import { escapeHtml } from '../server/lib/promptSanitizer';
import { looksLikeBusinessName, matchedBusinessKeywords } from '../shared/mover-name';
import { runMoverOutreach } from './lib/mover-outreach';

runMoverOutreach({
  scriptName: 'mover-name-correction',
  eventType: 'mover_name_correction_email',
  subject: 'Action required: Update your LervIT profile to your legal name',
  matches: (row) => looksLikeBusinessName(row.name),
  describe: (row) => `matched: ${matchedBusinessKeywords(row.name).join(', ')}`,
  payload: (row) => ({ matched: matchedBusinessKeywords(row.name) }),
  buildEmail: (row, settingsUrl) => {
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

    return { html, text };
  },
})
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('mover-name-correction failed:', err);
    process.exit(1);
  });
