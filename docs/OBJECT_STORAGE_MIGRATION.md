# Object Storage Migration Plan
## Replit Sidecar → Cloudflare R2 (or AWS S3)

**Blocking issue:** `server/objectStorage.ts` authenticates to Google Cloud Storage
via a local sidecar that Replit injects at `http://127.0.0.1:1106`. This sidecar
does not exist on Railway, Vercel, or any other host. The server will fail to start
(or silently fail every upload) on non-Replit infrastructure until this is replaced.

---

## Recommended target: Cloudflare R2

R2 is S3-compatible, has no egress fees, and a generous free tier (10 GB storage,
1 M Class-A ops/month). It is the lowest-friction replacement for the existing setup.

AWS S3 works identically — the only difference is the endpoint URL and credentials.
The code changes below are the same for either provider.

---

## What the current code does

| Operation | Entry point | Details |
|---|---|---|
| Private file upload | `POST /api/objects/upload` → `getObjectEntityUploadURL()` | Returns a pre-signed PUT URL; client uploads directly |
| Private file read | `GET /objects/:path` → `getObjectEntityFile()` | Streams file from GCS through Express |
| Public file read | `GET /public-objects/:path` → `searchPublicObject()` | Searches configured public GCS paths |
| Image uploads (vision) | `POST /api/uploads/images` → multer → `uploadBuffer()` | Buffers to disk, then pushes to GCS |

All of these go through `ObjectStorageService` in `server/objectStorage.ts`.

---

## Migration steps

### 1. Create R2 (or S3) bucket

```
# Cloudflare dashboard → R2 → Create bucket
# Name: lervit-private
# (optionally a second bucket: lervit-public for public assets)
```

Create an API token with **Object Read & Write** on those buckets.
Note the **Account ID**, **Access Key ID**, and **Secret Access Key**.

### 2. Add environment variables

```bash
# .env (and Railway / Vercel dashboard)
S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com   # R2 endpoint
S3_BUCKET_PRIVATE=lervit-private
S3_BUCKET_PUBLIC=lervit-public                              # optional
S3_ACCESS_KEY_ID=<key>
S3_SECRET_ACCESS_KEY=<secret>
S3_REGION=auto                                              # R2 uses "auto"; S3 uses e.g. "us-east-1"
```

Remove `PRIVATE_OBJECT_DIR` and `PUBLIC_OBJECT_SEARCH_PATHS` once migration is complete.

### 3. Install the AWS SDK (S3-compatible)

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

### 4. Replace `server/objectStorage.ts`

Replace the GCS `Storage` client with an S3 client:

```typescript
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const s3 = new S3Client({
  region: process.env.S3_REGION || 'auto',
  endpoint: process.env.S3_ENDPOINT,           // required for R2
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

const PRIVATE_BUCKET = process.env.S3_BUCKET_PRIVATE!;
const PUBLIC_BUCKET  = process.env.S3_BUCKET_PUBLIC ?? PRIVATE_BUCKET;
```

Key method replacements:

| Old (GCS sidecar) | New (S3) |
|---|---|
| `signObjectURL({ method: 'PUT', ttlSec })` | `getSignedUrl(s3, new PutObjectCommand({ Bucket, Key }), { expiresIn })` |
| `file.createReadStream().pipe(res)` | `s3.send(new GetObjectCommand(...))` then pipe `Body` |
| `objectStorageClient.bucket(b).file(k).exists()` | `s3.send(new HeadObjectCommand({ Bucket, Key }))` (catches NoSuchKey) |
| `uploadBuffer(buffer, path, contentType)` | `s3.send(new PutObjectCommand({ Bucket, Key, Body, ContentType }))` |

### 5. Migrate existing files

```bash
# Use rclone to copy GCS bucket → R2
rclone copy gcs:lervit-private r2:lervit-private --progress

# Or use the GCS → S3 migration tool in the Cloudflare dashboard
```

### 6. Update routes that reference old paths

`server/routes.ts` serves files via `/objects/:path` and `/public-objects/:path`.
These routes call `ObjectStorageService` — they will work unchanged after step 4
as long as the method signatures are preserved.

`server/vision-engine-v2.ts` fetches images from `/objects/...` paths via HTTP.
No change needed there; it goes through the Express route.

### 7. Remove sidecar env vars

Once all uploads are confirmed working on R2, remove from all environments:
- `PRIVATE_OBJECT_DIR`
- `PUBLIC_OBJECT_SEARCH_PATHS`

And delete the Replit Object Storage bucket to avoid stale data confusion.

---

## Effort estimate

| Step | Time |
|---|---|
| Create bucket + credentials | 15 min |
| Replace objectStorage.ts | 2–3 hours |
| Migrate existing files with rclone | 30 min |
| Smoke-test uploads + reads | 1 hour |
| **Total** | **~1 day** |

---

## Files affected

- `server/objectStorage.ts` — full replacement of auth + client
- `server/objectAcl.ts` — may need review; GCS-specific ACL concepts map to S3 ACLs or bucket policies
- `.env.example` — add S3_* vars, remove old GCS vars
- `server/routes.ts` — no changes expected if ObjectStorageService interface is preserved
