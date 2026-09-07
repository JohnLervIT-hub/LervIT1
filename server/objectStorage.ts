/**
 * Object Storage Service — Cloudflare R2 (S3-compatible)
 *
 * Runs against any S3-compatible backend via the AWS SDK. Configured for
 * Cloudflare R2 in production. Reads/writes travel over standard HTTPS; there
 * is no proxy sidecar or provider-specific dependency.
 *
 * Env:
 *   R2_ENDPOINT           https://<accountid>.r2.cloudflarestorage.com
 *   R2_BUCKET             destination bucket (single bucket for private + public)
 *   R2_ACCESS_KEY
 *   R2_SECRET
 *   R2_REGION             defaults to "auto" (R2)
 */

import { Response } from "express";
import { randomUUID } from "crypto";
import { PassThrough, Readable } from "stream";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// DB paths minted before the R2 migration were shaped as
//   `${LEGACY_GCS_BUCKET}/.private/uploads/<uuid>.<ext>`
// (see the pre-migration uploadBuffer). The migration script copied those
// objects to R2 under the object-name portion — i.e. `.private/uploads/<uuid>`.
// `resolveR2Candidates()` handles both the new-location key and the
// legacy `.private/` prefix so old records keep resolving.
const LEGACY_GCS_BUCKET = "replit-objstore-6a8aef56-1468-48fe-8766-aff0350d0678";
const LEGACY_PRIVATE_PREFIX = ".private/";
const UPLOAD_PREFIX = "uploads/";

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// Backwards-compat exports — kept so any lingering imports still resolve.
// The full ACL machinery from objectAcl.ts has been retired; the runtime
// serves everything under /objects/* as publicly cacheable (avatars, mover
// photos, vehicle photos), and compliance documents are served via signed
// URLs from getSignedDownloadUrl() rather than the /objects/* stream route.
export enum ObjectPermission {
  READ = "read",
  WRITE = "write",
}
export interface ObjectAclPolicy {
  owner: string;
  visibility: "public" | "private";
  aclRules?: Array<unknown>;
}

let cachedClient: S3Client | null = null;
let cachedBucket: string | null = null;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. Configure R2 credentials in the deployment environment.`);
  return v;
}

function s3(): S3Client {
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({
    region: process.env.R2_REGION || "auto",
    endpoint: requireEnv("R2_ENDPOINT"),
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY"),
      secretAccessKey: requireEnv("R2_SECRET"),
    },
    forcePathStyle: true,
  });
  return cachedClient;
}

function bucket(): string {
  if (cachedBucket) return cachedBucket;
  cachedBucket = requireEnv("R2_BUCKET");
  return cachedBucket;
}

function isNotFound(err: unknown): boolean {
  const anyErr = err as { name?: string; $metadata?: { httpStatusCode?: number } } | undefined;
  return anyErr?.$metadata?.httpStatusCode === 404 || anyErr?.name === "NoSuchKey" || anyErr?.name === "NotFound";
}

// Normalize an arbitrary caller-supplied path to a raw R2 key.
// Strips leading slashes and the legacy `${BUCKET}/` prefix if present.
function normalizeKey(pathOrKey: string): string {
  let key = pathOrKey.replace(/^\/+/, "");
  if (key.startsWith(`${LEGACY_GCS_BUCKET}/`)) {
    key = key.slice(LEGACY_GCS_BUCKET.length + 1);
  }
  return key;
}

// For a `/objects/<entity>` URL, return the list of R2 keys to try in order:
// the modern location (`<entity>`) and the legacy migrated location
// (`.private/<entity>`). First HEAD to return 200 wins.
function resolveR2Candidates(objectsPath: string): string[] {
  if (!objectsPath.startsWith("/objects/")) return [];
  const entity = objectsPath.slice("/objects/".length);
  return [entity, `${LEGACY_PRIVATE_PREFIX}${entity}`];
}

/**
 * Lightweight file handle returned by getObjectEntityFile / searchPublicObject.
 * Exposes the subset of the previous GCS `File` surface that callers use
 * (`download()`, `getMetadata()`, `createReadStream()`, `exists()`, `name`)
 * so upstream call sites did not need to change.
 */
export class R2ObjectFile {
  public readonly name: string;

  constructor(
    private readonly bucketName: string,
    public readonly key: string,
    private readonly cachedHead?: { contentType?: string; size?: number },
  ) {
    this.name = key;
  }

  async exists(): Promise<[boolean]> {
    try {
      await s3().send(new HeadObjectCommand({ Bucket: this.bucketName, Key: this.key }));
      return [true];
    } catch (err) {
      if (isNotFound(err)) return [false];
      throw err;
    }
  }

  async download(): Promise<[Buffer]> {
    const out = await s3().send(new GetObjectCommand({ Bucket: this.bucketName, Key: this.key }));
    const body = out.Body as Readable | null;
    if (!body) return [Buffer.alloc(0)];
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return [Buffer.concat(chunks)];
  }

  async getMetadata(): Promise<[{ contentType?: string; size?: number }]> {
    if (this.cachedHead) return [this.cachedHead];
    const head = await s3().send(new HeadObjectCommand({ Bucket: this.bucketName, Key: this.key }));
    return [{
      contentType: head.ContentType,
      size: head.ContentLength != null ? Number(head.ContentLength) : undefined,
    }];
  }

  createReadStream(): Readable {
    const pass = new PassThrough();
    s3()
      .send(new GetObjectCommand({ Bucket: this.bucketName, Key: this.key }))
      .then((out) => {
        const body = out.Body as Readable | null;
        if (!body) { pass.end(); return; }
        body.on("error", (err) => pass.destroy(err));
        body.pipe(pass);
      })
      .catch((err) => pass.destroy(err));
    return pass;
  }
}

export class ObjectStorageService {
  constructor() {}

  async searchPublicObject(filePath: string): Promise<R2ObjectFile | null> {
    const key = normalizeKey(filePath);
    try {
      const head = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
      return new R2ObjectFile(bucket(), key, {
        contentType: head.ContentType,
        size: head.ContentLength != null ? Number(head.ContentLength) : undefined,
      });
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async downloadObject(file: R2ObjectFile, res: Response, cacheTtlSec: number = 31536000) {
    try {
      const [metadata] = await file.getMetadata();
      const headers: Record<string, string> = {
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Cache-Control": `public, max-age=${cacheTtlSec}, immutable`,
      };
      if (metadata.size != null) headers["Content-Length"] = String(metadata.size);
      res.set(headers);

      const stream = file.createReadStream();
      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) res.status(500).json({ error: "Error streaming file" });
      });
      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) res.status(500).json({ error: "Error downloading file" });
    }
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const key = `${UPLOAD_PREFIX}${randomUUID()}`;
    return getSignedUrl(
      s3(),
      new PutObjectCommand({ Bucket: bucket(), Key: key }),
      { expiresIn: 900 },
    );
  }

  async getObjectEntityFile(objectPath: string): Promise<R2ObjectFile> {
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();
    const candidates = resolveR2Candidates(objectPath);
    let lastErr: unknown = null;
    for (const candidate of candidates) {
      try {
        const head = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: candidate }));
        return new R2ObjectFile(bucket(), candidate, {
          contentType: head.ContentType,
          size: head.ContentLength != null ? Number(head.ContentLength) : undefined,
        });
      } catch (err) {
        if (isNotFound(err)) { lastErr = err; continue; }
        throw err;
      }
    }
    if (lastErr) throw new ObjectNotFoundError();
    throw new ObjectNotFoundError();
  }

  normalizeObjectEntityPath(rawPath: string): string {
    // Legacy GCS-style presigned URL — collapse to /objects/<key-minus-.private>.
    if (rawPath.startsWith("https://storage.googleapis.com/")) {
      const url = new URL(rawPath);
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length < 2) return url.pathname;
      let key = parts.slice(1).join("/");
      if (key.startsWith(LEGACY_PRIVATE_PREFIX)) key = key.slice(LEGACY_PRIVATE_PREFIX.length);
      return `/objects/${key}`;
    }
    // R2 presigned URL — path shape is /<bucket>/<key>?...
    if (rawPath.startsWith("https://") && rawPath.includes(".r2.cloudflarestorage.com")) {
      const url = new URL(rawPath);
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length < 2) return url.pathname;
      let key = parts.slice(1).join("/");
      if (key.startsWith(LEGACY_PRIVATE_PREFIX)) key = key.slice(LEGACY_PRIVATE_PREFIX.length);
      return `/objects/${key}`;
    }
    return rawPath;
  }

  // Retained for API compatibility. ACL was previously read only to pick a
  // Cache-Control header; the R2 backend defaults everything under /objects/*
  // to public caching, so this is now a no-op that returns the normalized
  // path unchanged.
  async trySetObjectEntityAclPolicy(rawPath: string, _aclPolicy: ObjectAclPolicy): Promise<string> {
    return this.normalizeObjectEntityPath(rawPath);
  }

  // Retained for API compatibility. Every /objects/* resource is treated as
  // world-readable at the transport layer; sensitive assets (compliance docs,
  // call recordings) never travel through /objects/* — they use signed URLs
  // via getSignedDownloadUrl instead.
  async canAccessObjectEntity(_args: {
    userId?: string;
    objectFile: R2ObjectFile;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return true;
  }

  /**
   * Upload a buffer to a specific object key path (used for compliance docs,
   * call recordings, etc. that need a deterministic storage key). Returns the
   * same key string that was passed in — the caller persists it in the DB and
   * later obtains a signed GET URL via getSignedDownloadUrl().
   */
  async uploadFile(objectKey: string, buffer: Buffer, contentType: string): Promise<string> {
    const key = normalizeKey(objectKey);
    await s3().send(new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));
    return objectKey;
  }

  /**
   * Generate a short-lived signed GET URL for a stored object key.
   * Default TTL is 15 minutes — suitable for admin "View" clicks.
   */
  async getSignedDownloadUrl(objectKey: string, ttlSec = 900): Promise<string> {
    const key = normalizeKey(objectKey);
    return getSignedUrl(
      s3(),
      new GetObjectCommand({ Bucket: bucket(), Key: key }),
      { expiresIn: ttlSec },
    );
  }

  /**
   * Upload a buffer as a new randomly-keyed object under `uploads/`.
   * Returns the `/objects/uploads/<uuid>.<ext>` path that should be persisted
   * in the DB; the /objects/:path Express route resolves that back to the
   * `uploads/<uuid>.<ext>` R2 key at read time.
   */
  async uploadBuffer(
    buffer: Buffer,
    filename: string,
    contentType: string,
    _ownerId?: string,
  ): Promise<string> {
    const ext = filename.includes(".") ? filename.split(".").pop() : "jpg";
    const objectId = `${randomUUID()}.${ext}`;
    const key = `${UPLOAD_PREFIX}${objectId}`;
    await s3().send(new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: buffer,
      ContentType: contentType,
      Metadata: _ownerId ? { owner: _ownerId } : undefined,
    }));
    return `/objects/${key}`;
  }
}
