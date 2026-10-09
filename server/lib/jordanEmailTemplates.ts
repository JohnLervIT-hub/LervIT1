/**
 * Jordan Hayes (VETTER) mover-application email templates.
 *
 * Jordan's recruitment outreach is Claude-written per lead (see ../agents/jordan),
 * because every candidate signal is different. This file is the opposite case:
 * the post-submission confirmation is the same promise to every applicant, so it
 * is a deterministic template. A model-written receipt can drift on the one thing
 * that matters — the review timeline we are committing to — and it has no business
 * re-pitching a CTA to someone who already took it.
 *
 * Public API: buildMoverApplicationReceivedEmail(data) → { subject, html, text }
 *   - html: full <!DOCTYPE> document, safe to pass straight to Resend.
 *   - text: plain-text alternative (multipart/alternative fallback).
 *
 * Shell mirrors ./reidEmailTemplates so an applicant sees one LervIT look across
 * application receipt → document review → verified.
 *
 * All user-provided strings are HTML-escaped before interpolation.
 */

const APP_BASE_URL = (process.env.APP_BASE_URL ?? 'https://app.lervit.com').trim();

/** Business days we commit to in the receipt. Quoted in both html and text. */
export const APPLICATION_REVIEW_DAYS = 2;

export interface MoverApplicationEmailData {
  /** Applicant's first name. Callers pass a non-empty fallback ("there"). */
  firstName: string;
}

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Where an applicant goes next. Deliberately NOT /become-a-mover — they just
 * came from there, and a second "apply now" is what this template exists to
 * stop. Creating the mover account is the real next step: it is what the
 * onboarding wizard and Reid's document review both hang off.
 */
function moverSignupLink(): string {
  return `${APP_BASE_URL}/signup?role=mover`;
}

const NEXT_STEPS: string[] = [
  'Application received — no action needed from you right now',
  `Jordan reviews your vehicle and availability (within ${APPLICATION_REVIEW_DAYS} business days)`,
  'We call or email you to confirm the details',
  'Create your mover account, upload your documents, and start taking jobs',
];

function renderStep(index: number, label: string): string {
  return `
    <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:8px;">
      <tr>
        <td width="28" style="vertical-align:top;padding-top:2px;">
          <div style="width:24px;height:24px;background:#2563EB;border-radius:50%;font-size:11px;font-weight:700;color:#FFFFFF;text-align:center;line-height:24px;">${index}</div>
        </td>
        <td style="padding-left:12px;font-size:14px;color:#475569;line-height:1.5;">
          ${escapeHtml(label)}
        </td>
      </tr>
    </table>`;
}

function applicationReceivedBody(): string {
  const signupUrl = moverSignupLink();

  return `
    <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
      Thanks for applying to move with LervIT &mdash; your application is in and
      we&#39;ve got everything we need for now. Nothing else is required from you
      at this stage.
    </p>

    <div style="background:#F8FAFC;border-left:4px solid #2563EB;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px;">
      <div style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">
        Review Timeline
      </div>
      <div style="font-size:16px;font-weight:600;color:#0F172A;">
        Within ${APPLICATION_REVIEW_DAYS} business days
      </div>
    </div>

    <div style="margin-bottom:24px;">
      <div style="font-size:13px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px;">
        What happens next
      </div>
      ${NEXT_STEPS.map((label, i) => renderStep(i + 1, label)).join('')}
    </div>

    <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
      Want a head start? You can create your mover account now &mdash; it&#39;s the
      same account you&#39;ll use to upload documents and pick up jobs once
      you&#39;re approved.
    </p>

    <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:#2563EB;border-radius:8px;">
          <a
            href="${signupUrl}"
            style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;"
          >Create your mover account</a>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:15px;color:#475569;line-height:1.6;">
      Questions in the meantime? Just reply to this email and it comes straight
      to us.
    </p>`;
}

function applicationReceivedText(firstName: string): string {
  const steps = NEXT_STEPS.map((label, i) => `${i + 1}. ${label}`).join('\n');

  return `Hi ${firstName},

Thanks for applying to move with LervIT - your application is in and we've got
everything we need for now. Nothing else is required from you at this stage.

REVIEW TIMELINE: within ${APPLICATION_REVIEW_DAYS} business days

What happens next
${steps}

Want a head start? You can create your mover account now - it's the same account
you'll use to upload documents and pick up jobs once you're approved:
${moverSignupLink()}

Questions in the meantime? Just reply to this email and it comes straight to us.

Jordan
LervIT Team

LervIT Technologies Corp - Calgary, Alberta, Canada`;
}

interface BannerSpec {
  /** Background of the banner strip. */
  bg: string;
  /** HTML entity for the glyph. */
  icon: string;
  /** Title colour. */
  text: string;
  title: string;
}

function renderShell(opts: {
  subject: string;
  firstName: string;
  body: string;
  banner: BannerSpec;
}): string {
  const { subject, firstName, body, banner } = opts;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <tr>
            <td style="background:#0F172A;border-radius:12px 12px 0 0;padding:32px 40px;text-align:center;">
              <div style="font-size:28px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;">
                Lerv<span style="color:#2563EB;">IT</span>
              </div>
              <div style="font-size:12px;color:#94A3B8;margin-top:4px;letter-spacing:2px;text-transform:uppercase;">
                Mover Recruitment
              </div>
            </td>
          </tr>

          <tr>
            <td style="background:${banner.bg};padding:20px 40px;text-align:center;">
              <div style="font-size:28px;line-height:1;margin-bottom:6px;">${banner.icon}</div>
              <div style="font-size:16px;font-weight:700;color:${banner.text};">
                ${escapeHtml(banner.title)}
              </div>
            </td>
          </tr>

          <tr>
            <td style="background:#FFFFFF;padding:40px;">
              <p style="margin:0 0 24px;font-size:16px;color:#0F172A;font-weight:500;">
                Hi ${escapeHtml(firstName)},
              </p>

              ${body}

              <hr style="border:none;border-top:1px solid #E2E8F0;margin:32px 0;">

              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:12px;vertical-align:middle;">
                    <img
                      src="${APP_BASE_URL}/avatars/jordan-hayes.png"
                      alt="Jordan Hayes"
                      width="44"
                      height="44"
                      style="width:44px;height:44px;border-radius:50%;object-fit:cover;display:block;"
                    />
                  </td>
                  <td style="vertical-align:middle;">
                    <div style="font-size:14px;font-weight:600;color:#0F172A;">
                      Jordan
                    </div>
                    <div style="font-size:12px;color:#64748B;">
                      LervIT Team &middot; Mover Recruitment
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:#F1F5F9;border-radius:0 0 12px 12px;padding:24px 40px;text-align:center;">
              <p style="margin:0 0 12px;font-size:12px;color:#64748B;">
                <a href="${APP_BASE_URL}/mover-agreement" style="color:#2563EB;text-decoration:none;font-weight:500;">Mover Agreement</a>
                &nbsp;&middot;&nbsp;
                <a href="mailto:support@lervit.com" style="color:#2563EB;text-decoration:none;font-weight:500;">Get Support</a>
              </p>
              <p style="margin:0;font-size:11px;color:#94A3B8;">
                LervIT Technologies Corp &middot; Calgary, Alberta, Canada<br>
                &copy; 2026 LervIT. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Receipt for a submitted mover application. Solicited and transactional — the
 * applicant filled in the form seconds ago — so it carries no unsubscribe
 * footer and no recruitment CTA.
 */
export function buildMoverApplicationReceivedEmail(
  data: MoverApplicationEmailData,
): BuiltEmail {
  const firstName = data.firstName.trim() || 'there';
  const subject = `We received your LervIT application, ${firstName}!`;

  return {
    subject,
    html: renderShell({
      subject,
      firstName,
      body: applicationReceivedBody(),
      banner: { bg: '#EFF6FF', icon: '&#128221;', text: '#1D4ED8', title: 'Application Received' },
    }),
    text: applicationReceivedText(firstName),
  };
}

// ── delayed variant ────────────────────────────────────────

/**
 * "Sorry for the delay" receipt, for an applicant whose follow-up went wrong.
 *
 * Exists because the standard receipt commits to a review "within
 * ${APPLICATION_REVIEW_DAYS} business days" and reads as if the application
 * had just arrived. For the backfill cohort — people who applied weeks ago and
 * got the recruitment drip instead of a receipt — both of those are false, and
 * restating them as a fourth or fifth Jordan email would be worse than the
 * original miss. This one names the gap, drops the timeline promise, and
 * carries the same signup link.
 */
export interface DelayedApplicationEmailData {
  firstName: string;
  /** When they applied, already formatted for prose (e.g. "September 11"). */
  appliedOn: string;
}

function delayedBody(data: DelayedApplicationEmailData): string {
  const signupUrl = moverSignupLink();
  const appliedOn = escapeHtml(data.appliedOn);

  return `
    <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
      You applied to move with LervIT on <strong>${appliedOn}</strong>, and our
      follow-up went wrong: you got our recruiting emails instead of a straight
      answer about your application. That&#39;s on us, and I&#39;m sorry.
    </p>

    <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
      Your application is in and still active. Here&#39;s the link you should
      have had from the start &mdash; it&#39;s the account you&#39;ll use to
      upload your documents and pick up jobs.
    </p>

    <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:#2563EB;border-radius:8px;">
          <a
            href="${signupUrl}"
            style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;"
          >Create your mover account</a>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:15px;color:#475569;line-height:1.6;">
      If you&#39;d rather not go ahead, or you have any questions, just reply to
      this email &mdash; it comes straight to us.
    </p>`;
}

function delayedText(data: DelayedApplicationEmailData): string {
  return `Hi ${data.firstName},

You applied to move with LervIT on ${data.appliedOn}, and our follow-up went
wrong: you got our recruiting emails instead of a straight answer about your
application. That's on us, and I'm sorry.

Your application is in and still active. Here's the link you should have had
from the start - it's the account you'll use to upload your documents and pick
up jobs:
${moverSignupLink()}

If you'd rather not go ahead, or you have any questions, just reply to this
email - it comes straight to us.

Jordan
LervIT Team

LervIT Technologies Corp - Calgary, Alberta, Canada`;
}

export function buildMoverApplicationDelayedEmail(
  data: DelayedApplicationEmailData,
): BuiltEmail {
  const firstName = data.firstName.trim() || 'there';
  const subject = `Your LervIT application — sorry for the delay, ${firstName}`;

  return {
    subject,
    html: renderShell({
      subject,
      firstName,
      body: delayedBody({ ...data, firstName }),
      banner: { bg: '#FEF3C7', icon: '&#128172;', text: '#92400E', title: 'Still Active' },
    }),
    text: delayedText({ ...data, firstName }),
  };
}
