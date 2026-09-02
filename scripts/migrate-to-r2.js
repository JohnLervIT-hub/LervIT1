/**
 * One-time migration: copy every object from the Replit GCS Object Storage
 * bucket to Cloudflare R2. Runs in the Replit shell where the sidecar at
 * http://127.0.0.1:1106 is available to authenticate GCS reads.
 *
 * Idempotent: any object already present in R2 with the same size is skipped,
 * so the script can be re-run after transient failures without re-uploading
 * everything.
 *
 * Required env:
 *   R2_ENDPOINT           e.g. https://<accountid>.r2.cloudflarestorage.com
 *   R2_BUCKET             R2 bucket name (destination)
 *   R2_ACCESS_KEY         R2 API token access key
 *   R2_SECRET             R2 API token secret
 *
 * Usage:
 *   node scripts/migrate-to-r2.js
 */

import { Storage } from '@google-cloud/storage';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

// Mirrors the auth block in server/objectStorage.ts so this script runs
// standalone under plain node without pulling in the TS module graph.
const REPLIT_SIDECAR_ENDPOINT = 'http://127.0.0.1:1106';
const SOURCE_BUCKET = 'replit-objstore-6a8aef56-1468-48fe-8766-aff0350d0678';

const requiredEnv = ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY', 'R2_SECRET'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`[migrate-to-r2] FATAL: ${key} is not set.`);
    process.exit(1);
  }
}

const gcs = new Storage({
  credentials: {
    audience: 'replit',
    subject_token_type: 'access_token',
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: 'external_account',
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: 'json', subject_token_field_name: 'access_token' },
    },
    universe_domain: 'googleapis.com',
  },
  projectId: '',
});

const s3 = new S3Client({
  region: process.env.R2_REGION || 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET,
  },
});

const R2_BUCKET = process.env.R2_BUCKET;

async function existsInR2(key, expectedSize) {
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    if (typeof expectedSize === 'number' && Number.isFinite(expectedSize)) {
      return head.ContentLength === expectedSize;
    }
    return true;
  } catch (err) {
    const status = err?.$metadata?.httpStatusCode;
    if (err?.name === 'NotFound' || status === 404) return false;
    throw err;
  }
}

async function streamToBuffer(readable) {
  const chunks = [];
  for await (const chunk of readable) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function formatBytes(n) {
  if (!Number.isFinite(n)) return '?';
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(2)}MB`;
}

async function migrate() {
  const bucket = gcs.bucket(SOURCE_BUCKET);

  console.log(`[migrate-to-r2] Source: gs://${SOURCE_BUCKET}`);
  console.log(`[migrate-to-r2] Target: s3://${R2_BUCKET} (${process.env.R2_ENDPOINT})`);
  console.log('[migrate-to-r2] Listing source objects...');

  const [files] = await bucket.getFiles({ autoPaginate: true });
  const total = files.length;
  console.log(`[migrate-to-r2] Found ${total} object(s). Starting copy.`);

  let scanned = 0;
  let copied = 0;
  let skipped = 0;
  let failed = 0;
  let bytesCopied = 0;
  const failures = [];
  const startedAt = Date.now();

  for (const file of files) {
    scanned += 1;
    const key = file.name;                              // preserve full path as R2 key
    const size = Number(file.metadata.size ?? 0);
    const contentType = file.metadata.contentType || 'application/octet-stream';
    const tag = `[${scanned}/${total}]`;

    try {
      if (await existsInR2(key, size)) {
        skipped += 1;
        console.log(`${tag} SKIP  ${key}  (${formatBytes(size)}, already in R2)`);
        continue;
      }

      const buffer = await streamToBuffer(file.createReadStream());

      await s3.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }));

      copied += 1;
      bytesCopied += buffer.length;
      console.log(`${tag} COPY  ${key}  (${formatBytes(buffer.length)}, ${contentType})`);
    } catch (err) {
      failed += 1;
      const message = err?.message ?? String(err);
      failures.push({ key, error: message });
      console.error(`${tag} FAIL  ${key}: ${message}`);
    }
  }

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log('');
  console.log(`[migrate-to-r2] Done in ${elapsedSec}s.`);
  console.log(`[migrate-to-r2] Scanned: ${scanned}  Copied: ${copied} (${formatBytes(bytesCopied)})  Skipped: ${skipped}  Failed: ${failed}`);

  if (failures.length > 0) {
    console.log('[migrate-to-r2] Failure details:');
    for (const f of failures) console.log(`  - ${f.key}: ${f.error}`);
    process.exit(1);
  }
}

migrate().catch((err) => {
  console.error('[migrate-to-r2] Fatal:', err?.stack ?? err);
  process.exit(1);
});
