import { writeFileSync, mkdirSync } from 'node:fs';
import { buildReidEmail, type ReidEmailType, type ReidEmailData } from '../server/lib/reidEmailTemplates.js';

const OUT = '/tmp/reid-preview';
mkdirSync(OUT, { recursive: true });

const samples: Array<{ type: ReidEmailType; data: ReidEmailData; label: string }> = [
  {
    type: 'receipt',
    label: 'Receipt (blue)',
    data: { firstName: 'Jordan', docLabel: "Driver's License" },
  },
  {
    type: 'approved',
    label: 'Approved (green)',
    data: { firstName: 'Jordan', docLabel: "Driver's License" },
  },
  {
    type: 'clarification',
    label: 'Clarification (amber)',
    data: {
      firstName: 'Jordan',
      docLabel: 'Vehicle Insurance',
      irregularities: [
        'Expiry date is not clearly visible in the photo',
        'Policy holder name does not match your account name',
        'Coverage amount appears to be below the $2M minimum',
      ],
    },
  },
  {
    type: 'under_review',
    label: 'Under Review (blue)',
    data: { firstName: 'Jordan', docLabel: 'Commercial Auto Policy' },
  },
  {
    type: 'rejected',
    label: 'Rejected (red)',
    data: {
      firstName: 'Jordan',
      docLabel: "Driver's License",
      reason: 'Document is expired. Please upload a currently valid government-issued ID.',
    },
  },
];

const cards: string[] = [];
for (const { type, label, data } of samples) {
  const email = buildReidEmail(type, data);
  writeFileSync(`${OUT}/${type}.html`, email.html);
  writeFileSync(`${OUT}/${type}.txt`, email.text);
  cards.push(
    `<a class="card" href="${type}.html" target="preview">` +
      `<div class="ttl">${label}</div>` +
      `<div class="sub">${email.subject.replace(/</g, '&lt;')}</div>` +
      `</a>`,
  );
}

const index = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Reid Email Templates</title>
<style>
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0f172a;color:#e2e8f0;display:grid;grid-template-columns:320px 1fr;height:100vh;}
  aside{padding:24px;overflow:auto;border-right:1px solid #1e293b;}
  aside h1{margin:0 0 4px;font-size:18px;}
  aside p{margin:0 0 20px;font-size:12px;color:#94a3b8;}
  .card{display:block;background:#1e293b;border-radius:10px;padding:14px 16px;margin-bottom:10px;text-decoration:none;color:#e2e8f0;border:1px solid transparent;transition:border-color .15s;}
  .card:hover{border-color:#2563EB;}
  .ttl{font-weight:600;font-size:14px;}
  .sub{font-size:11px;color:#94a3b8;margin-top:4px;line-height:1.4;}
  main{background:#f8fafc;}
  iframe{width:100%;height:100%;border:0;background:#f8fafc;}
</style></head>
<body>
  <aside>
    <h1>Reid Email Templates</h1>
    <p>Sample data · firstName: Jordan</p>
    ${cards.join('\n    ')}
  </aside>
  <main><iframe name="preview" src="receipt.html"></iframe></main>
</body></html>`;

writeFileSync(`${OUT}/index.html`, index);
console.log(`Wrote 5 templates + index.html to ${OUT}`);
console.log(`Open: file://${OUT}/index.html`);
