/**
 * Reid Calloway (DOCOPS) mover email templates.
 *
 * All Reid outbound emails share the same LervIT-branded shell (header,
 * status banner, body, signature, footer) so movers get a consistent look
 * across receipt → verified → clarification → under-review → rejected.
 *
 * Public API: buildReidEmail(type, data) → { subject, html, text }
 *   - html: full <!DOCTYPE> document, safe to pass straight to Resend.
 *   - text: plain-text alternative (multipart/alternative fallback).
 *
 * All user-provided strings (name, docLabel, reason, irregularities) are
 * HTML-escaped before interpolation.
 */

const APP_BASE_URL = (process.env.APP_BASE_URL ?? 'https://app.lervit.com').trim();

export type ReidEmailType =
  | 'receipt'
  | 'approved'
  | 'document_approved'
  | 'clarification'
  | 'under_review'
  | 'rejected';

export interface ReidEmailData {
  firstName: string;
  docLabel: string;
  irregularities?: string[];
  reason?: string;
}

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

// ── html escaping ──────────────────────────────────────────

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── partials ───────────────────────────────────────────────

interface BannerSpec {
  bg: string;
  icon: string;
  text: string;
  title: string;
}

function renderStep(index: number, label: string, color: string): string {
  return `
    <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:8px;">
      <tr>
        <td width="28" style="vertical-align:top;padding-top:2px;">
          <div style="width:24px;height:24px;background:${color};border-radius:50%;font-size:11px;font-weight:700;color:#FFFFFF;text-align:center;line-height:24px;">${index}</div>
        </td>
        <td style="padding-left:12px;font-size:14px;color:#475569;line-height:1.5;">
          ${escapeHtml(label)}
        </td>
      </tr>
    </table>`;
}

function renderSteps(steps: string[], color = '#2563EB'): string {
  return steps.map((s, i) => renderStep(i + 1, s, color)).join('');
}

function renderBanner(spec: BannerSpec): string {
  return `
    <tr>
      <td style="background:${spec.bg};padding:20px 40px;text-align:center;">
        <div style="font-size:32px;margin-bottom:8px;line-height:1;">${spec.icon}</div>
        <div style="font-size:18px;font-weight:700;color:${spec.text};letter-spacing:-0.3px;">
          ${escapeHtml(spec.title)}
        </div>
      </td>
    </tr>`;
}

function renderShell(opts: {
  subject: string;
  banner: BannerSpec;
  firstName: string;
  body: string;
}): string {
  const { subject, banner, firstName, body } = opts;

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
                Document Operations
              </div>
            </td>
          </tr>

          ${renderBanner(banner)}

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
                      src="${APP_BASE_URL}/avatars/reid-calloway.png"
                      alt="Reid Calloway"
                      width="44"
                      height="44"
                      style="width:44px;height:44px;border-radius:50%;object-fit:cover;display:block;"
                    />
                  </td>
                  <td style="vertical-align:middle;">
                    <div style="font-size:14px;font-weight:600;color:#0F172A;">
                      Reid Calloway
                    </div>
                    <div style="font-size:12px;color:#64748B;">
                      Document Operations &middot; LervIT Technologies
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:#F1F5F9;border-radius:0 0 12px 12px;padding:24px 40px;text-align:center;">
              <p style="margin:0 0 12px;font-size:12px;color:#94A3B8;">
                This is an automated message &mdash; please do not reply to this email.
              </p>
              <p style="margin:0 0 12px;font-size:12px;color:#64748B;">
                <a href="${APP_BASE_URL}/profile/documents" style="color:#2563EB;text-decoration:none;font-weight:500;">Update Documents</a>
                &nbsp;&middot;&nbsp;
                <a href="${APP_BASE_URL}/dashboard" style="color:#2563EB;text-decoration:none;font-weight:500;">Dashboard</a>
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

// ── per-type body renderers ────────────────────────────────

function receiptBody(data: ReidEmailData): string {
  const docLabelSafe = escapeHtml(data.docLabel);
  const steps = [
    'Document received',
    'Reid reviews your document',
    'You receive approval or feedback',
    'Account activated for dispatch',
  ];

  return `
    <div style="background:#F8FAFC;border-left:4px solid #2563EB;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px;">
      <div style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">
        Document Type
      </div>
      <div style="font-size:16px;font-weight:600;color:#0F172A;">
        ${docLabelSafe}
      </div>
    </div>

    <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
      We&#39;ve received your document and our verification system is reviewing it now. You&#39;ll hear from us within <strong>4 hours</strong>.
    </p>

    <div style="margin-bottom:24px;">
      <div style="font-size:13px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px;">
        What happens next
      </div>
      ${renderSteps(steps)}
    </div>`;
}

function approvedBody(_data: ReidEmailData): string {
  return `
    <div style="background:#ECFDF5;border:1px solid #6EE7B7;border-radius:8px;padding:20px;margin-bottom:24px;text-align:center;">
      <div style="font-size:36px;margin-bottom:8px;line-height:1;">&#127881;</div>
      <div style="font-size:16px;font-weight:700;color:#065F46;">
        You&#39;re verified and ready to go!
      </div>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td width="48%" style="padding:12px;background:#F8FAFC;border-radius:8px;text-align:center;">
          <div style="font-size:20px;line-height:1;">&#9989;</div>
          <div style="font-size:12px;font-weight:600;color:#065F46;margin-top:4px;">
            Document Verified
          </div>
        </td>
        <td width="4%"></td>
        <td width="48%" style="padding:12px;background:#F8FAFC;border-radius:8px;text-align:center;">
          <div style="font-size:20px;line-height:1;">&#128666;</div>
          <div style="font-size:12px;font-weight:600;color:#065F46;margin-top:4px;">
            Eligible for Jobs
          </div>
        </td>
      </tr>
    </table>

    <div style="text-align:center;margin-bottom:24px;">
      <a href="${APP_BASE_URL}/dashboard" style="display:inline-block;background:#2563EB;color:#FFFFFF;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;letter-spacing:-0.2px;">
        View Your Dashboard &rarr;
      </a>
    </div>

    <p style="margin:0;font-size:14px;color:#64748B;text-align:center;">
      Update your availability in the app to start receiving job offers.
    </p>`;
}

function documentApprovedBody(data: ReidEmailData): string {
  const docLabelSafe = escapeHtml(data.docLabel);

  return `
    <div style="background:#ECFDF5;border:1px solid #6EE7B7;border-radius:8px;padding:20px;margin-bottom:24px;text-align:center;">
      <div style="font-size:36px;margin-bottom:8px;line-height:1;">&#9989;</div>
      <div style="font-size:16px;font-weight:700;color:#065F46;">
        Document Verified
      </div>
    </div>

    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      Your <strong>${docLabelSafe}</strong> has been successfully verified.
    </p>

    <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
      This document is now on file. Once all required documents are verified, your account will be fully activated for dispatch.
    </p>

    <div style="text-align:center;margin-bottom:8px;">
      <a href="${APP_BASE_URL}/profile/documents" style="display:inline-block;background:#2563EB;color:#FFFFFF;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;letter-spacing:-0.2px;">
        View Document Status &rarr;
      </a>
    </div>`;
}

function clarificationBody(data: ReidEmailData): string {
  const docLabelSafe = escapeHtml(data.docLabel);
  const irregularities = Array.isArray(data.irregularities) ? data.irregularities : [];

  const issueRows = irregularities
    .map(
      (issue, i) => `
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:8px;">
        <tr>
          <td width="24" style="vertical-align:top;color:#F59E0B;font-weight:700;font-size:14px;">
            ${i + 1}.
          </td>
          <td style="font-size:14px;color:#78350F;line-height:1.5;">
            ${escapeHtml(issue)}
          </td>
        </tr>
      </table>`,
    )
    .join('');

  const resolutionSteps = [
    'Address the items listed above',
    'Re-upload your document from your profile',
    'Reid will re-review within 4 hours',
  ];

  return `
    <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.6;">
      We reviewed your <strong>${docLabelSafe}</strong> and need a few things clarified before we can approve it.
    </p>

    <div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:8px;padding:20px;margin-bottom:24px;">
      <div style="font-size:13px;font-weight:700;color:#92400E;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">
        Items to address
      </div>
      ${issueRows || '<div style="font-size:14px;color:#78350F;">See details from our audit team.</div>'}
    </div>

    <div style="background:#F8FAFC;border-radius:8px;padding:20px;margin-bottom:24px;">
      <div style="font-size:13px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">
        How to resolve
      </div>
      ${renderSteps(resolutionSteps, '#F59E0B')}
    </div>

    <div style="background:#FEF2F2;border-radius:8px;padding:12px 16px;margin-bottom:24px;text-align:center;">
      <span style="font-size:13px;color:#991B1B;font-weight:500;">
        &#9200; Please re-upload within <strong>48 hours</strong> to avoid account delays
      </span>
    </div>

    <div style="text-align:center;">
      <a href="${APP_BASE_URL}/profile/documents" style="display:inline-block;background:#F59E0B;color:#FFFFFF;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;">
        Re-upload Document &rarr;
      </a>
    </div>`;
}

function underReviewBody(_data: ReidEmailData): string {
  return `
    <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.6;">
      Your document has been flagged for additional review by our compliance team. This is a standard secondary check &mdash; no action is required from you.
    </p>

    <div style="background:#F8FAFC;border-radius:8px;padding:20px;margin-bottom:24px;">
      <div style="font-size:13px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px;">
        Timeline
      </div>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:8px;">
        <tr>
          <td width="28" style="vertical-align:top;font-size:16px;">&#128269;</td>
          <td style="padding-left:12px;font-size:14px;color:#475569;line-height:1.5;">
            Document received and initial audit complete
          </td>
        </tr>
      </table>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:8px;">
        <tr>
          <td width="28" style="vertical-align:top;font-size:16px;">&#9203;</td>
          <td style="padding-left:12px;font-size:14px;color:#475569;line-height:1.5;">
            Additional review in progress
          </td>
        </tr>
      </table>
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td width="28" style="vertical-align:top;font-size:16px;">&#128231;</td>
          <td style="padding-left:12px;font-size:14px;color:#475569;line-height:1.5;">
            You&#39;ll be notified by email within 24 hours
          </td>
        </tr>
      </table>
    </div>

    <p style="margin:0;font-size:14px;color:#64748B;text-align:center;">
      We appreciate your patience.
    </p>`;
}

function rejectedBody(data: ReidEmailData): string {
  const reason = data.reason ?? 'Document did not meet our verification requirements.';
  const nextSteps = [
    'Review the rejection reason above',
    'Obtain a valid replacement document',
    'Re-upload from your profile',
  ];

  return `
    <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.6;">
      After careful review, we were unable to accept your <strong>${escapeHtml(data.docLabel)}</strong>.
    </p>

    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:20px;margin-bottom:24px;">
      <div style="font-size:13px;font-weight:700;color:#991B1B;margin-bottom:8px;">
        Reason for rejection
      </div>
      <div style="font-size:14px;color:#7F1D1D;line-height:1.6;">
        ${escapeHtml(reason)}
      </div>
    </div>

    <div style="background:#F8FAFC;border-radius:8px;padding:20px;margin-bottom:24px;">
      <div style="font-size:13px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">
        Next steps
      </div>
      ${renderSteps(nextSteps, '#EF4444')}
    </div>

    <div style="text-align:center;margin-bottom:24px;">
      <a href="${APP_BASE_URL}/profile/documents" style="display:inline-block;background:#EF4444;color:#FFFFFF;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;">
        Upload New Document &rarr;
      </a>
    </div>

    <div style="background:#F8FAFC;border-radius:8px;padding:16px;text-align:center;">
      <div style="font-size:13px;color:#64748B;margin-bottom:4px;">
        Need help? Our team is here.
      </div>
      <a href="mailto:support@lervit.com" style="color:#2563EB;font-weight:600;font-size:14px;text-decoration:none;">
        support@lervit.com
      </a>
    </div>`;
}

// ── plain-text alternatives ────────────────────────────────

function receiptText(data: ReidEmailData): string {
  return [
    `Hi ${data.firstName},`,
    '',
    `We've received your ${data.docLabel} and our verification system is reviewing it now.`,
    `You'll hear from us within 4 hours.`,
    '',
    'What happens next:',
    '  1. Document received',
    '  2. Reid reviews your document',
    '  3. You receive approval or feedback',
    '  4. Account activated for dispatch',
    '',
    `Manage documents: ${APP_BASE_URL}/profile/documents`,
    '',
    '— Reid Calloway, Document Operations, LervIT Technologies',
  ].join('\n');
}

function approvedText(data: ReidEmailData): string {
  return [
    `Hi ${data.firstName},`,
    '',
    `Great news — your ${data.docLabel} has been verified.`,
    '',
    '  ✓ Document Verified',
    '  ✓ Eligible for Jobs',
    '',
    `View your dashboard: ${APP_BASE_URL}/dashboard`,
    '',
    'Update your availability in the app to start receiving job offers.',
    '',
    '— Reid Calloway, Document Operations, LervIT Technologies',
  ].join('\n');
}

function documentApprovedText(data: ReidEmailData): string {
  return [
    `Hi ${data.firstName},`,
    '',
    `Your ${data.docLabel} has been successfully verified.`,
    '',
    'This document is now on file. Once all required documents are verified,',
    'your account will be fully activated for dispatch.',
    '',
    `View document status: ${APP_BASE_URL}/profile/documents`,
    '',
    '— Reid Calloway, Document Operations, LervIT Technologies',
  ].join('\n');
}

function clarificationText(data: ReidEmailData): string {
  const issues = (data.irregularities ?? []).map((s, i) => `  ${i + 1}. ${s}`).join('\n');
  return [
    `Hi ${data.firstName},`,
    '',
    `We reviewed your ${data.docLabel} and need a few things clarified before we can approve it.`,
    '',
    'Items to address:',
    issues || '  (See details from our audit team.)',
    '',
    'How to resolve:',
    '  1. Address the items listed above',
    '  2. Re-upload your document from your profile',
    '  3. Reid will re-review within 4 hours',
    '',
    'Please re-upload within 48 hours to avoid account delays.',
    '',
    `Re-upload: ${APP_BASE_URL}/profile/documents`,
    '',
    '— Reid Calloway, Document Operations, LervIT Technologies',
  ].join('\n');
}

function underReviewText(data: ReidEmailData): string {
  return [
    `Hi ${data.firstName},`,
    '',
    'Your document has been flagged for additional review by our compliance team.',
    'This is a standard secondary check — no action is required from you.',
    '',
    'Timeline:',
    '  • Document received and initial audit complete',
    '  • Additional review in progress',
    '  • You will be notified by email within 24 hours',
    '',
    'We appreciate your patience.',
    '',
    '— Reid Calloway, Document Operations, LervIT Technologies',
  ].join('\n');
}

function rejectedText(data: ReidEmailData): string {
  const reason = data.reason ?? 'Document did not meet our verification requirements.';
  return [
    `Hi ${data.firstName},`,
    '',
    `After careful review, we were unable to accept your ${data.docLabel}.`,
    '',
    `Reason: ${reason}`,
    '',
    'Next steps:',
    '  1. Review the rejection reason above',
    '  2. Obtain a valid replacement document',
    '  3. Re-upload from your profile',
    '',
    `Upload a new document: ${APP_BASE_URL}/profile/documents`,
    '',
    'Need help? Email support@lervit.com',
    '',
    '— Reid Calloway, Document Operations, LervIT Technologies',
  ].join('\n');
}

// ── public builder ─────────────────────────────────────────

export function buildReidEmail(type: ReidEmailType, data: ReidEmailData): BuiltEmail {
  switch (type) {
    case 'receipt': {
      const subject = `[LervIT] Document received — ${data.docLabel} under review`;
      const html = renderShell({
        subject,
        banner: { bg: '#EFF6FF', icon: '&#128196;', text: '#1D4ED8', title: 'Document Received' },
        firstName: data.firstName,
        body: receiptBody(data),
      });
      return { subject, html, text: receiptText(data) };
    }
    case 'approved': {
      const subject = `[LervIT] ✅ ${data.docLabel} verified — you're ready for dispatch`;
      const html = renderShell({
        subject,
        banner: { bg: '#ECFDF5', icon: '&#9989;', text: '#065F46', title: 'Document Verified!' },
        firstName: data.firstName,
        body: approvedBody(data),
      });
      return { subject, html, text: approvedText(data) };
    }
    case 'document_approved': {
      const subject = `[LervIT] ${data.docLabel} verified`;
      const html = renderShell({
        subject,
        banner: { bg: '#ECFDF5', icon: '&#9989;', text: '#065F46', title: 'Document Verified' },
        firstName: data.firstName,
        body: documentApprovedBody(data),
      });
      return { subject, html, text: documentApprovedText(data) };
    }
    case 'clarification': {
      const subject = `[LervIT] Action required — ${data.docLabel} needs clarification`;
      const html = renderShell({
        subject,
        banner: { bg: '#FFFBEB', icon: '&#9888;&#65039;', text: '#92400E', title: 'Action Required' },
        firstName: data.firstName,
        body: clarificationBody(data),
      });
      return { subject, html, text: clarificationText(data) };
    }
    case 'under_review': {
      const subject = `[LervIT] ${data.docLabel} under additional review`;
      const html = renderShell({
        subject,
        banner: { bg: '#EFF6FF', icon: '&#128269;', text: '#1D4ED8', title: 'Under Additional Review' },
        firstName: data.firstName,
        body: underReviewBody(data),
      });
      return { subject, html, text: underReviewText(data) };
    }
    case 'rejected': {
      const subject = `[LervIT] ${data.docLabel} not accepted — action required`;
      const html = renderShell({
        subject,
        banner: { bg: '#FEF2F2', icon: '&#10060;', text: '#991B1B', title: 'Document Not Accepted' },
        firstName: data.firstName,
        body: rejectedBody(data),
      });
      return { subject, html, text: rejectedText(data) };
    }
  }
}
