import type { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { adminAuditLog } from "@shared/schema";
import { logEvent } from "../logger";

// Keys whose values must never be written to the audit log. Matched
// case-insensitively; nested objects/arrays are traversed. If a match is
// found, the value is replaced with the string "[REDACTED]".
const SENSITIVE_KEY_RE = /(password|secret|token|apikey|api_key|otp|verificationcode|verification_code|stripekey)/i;

// Cap the stored request body so an attacker cannot fill the log by POSTing
// a huge payload. 8 KB is enough for realistic admin mutations.
const MAX_BODY_BYTES = 8 * 1024;

function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 6) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY_RE.test(k) ? "[REDACTED]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function serializeBody(body: unknown): string | null {
  if (!body || (typeof body === "object" && Object.keys(body as object).length === 0)) {
    return null;
  }
  try {
    const json = JSON.stringify(redact(body));
    if (json.length > MAX_BODY_BYTES) {
      return json.slice(0, MAX_BODY_BYTES) + '..."[TRUNCATED]"';
    }
    return json;
  } catch {
    return '"[UNSERIALIZABLE]"';
  }
}

// Best-effort resource extraction from the URL. For /api/admin/users/abc123
// this returns { resourceType: "users", resourceId: "abc123" }. For
// /api/admin/verification/item/abc it returns { resourceType: "verification",
// resourceId: "abc" }. Good enough for grep/filter without being perfect.
function parseResource(url: string): { resourceType: string | null; resourceId: string | null } {
  const path = url.split("?")[0];
  const parts = path.split("/").filter(Boolean); // ["api","admin","users","abc123"]
  const adminIdx = parts.indexOf("admin");
  if (adminIdx === -1 || adminIdx === parts.length - 1) {
    return { resourceType: null, resourceId: null };
  }
  const resourceType = parts[adminIdx + 1] ?? null;
  const remainder = parts.slice(adminIdx + 2);
  // Prefer the first UUID-shaped or long-token-shaped segment as the ID.
  const idLike = remainder.find((seg) => /^[0-9a-f-]{8,}$/i.test(seg)) ?? remainder[0] ?? null;
  return { resourceType, resourceId: idLike };
}

// Client IP. `trust proxy` is set in server/index.ts so req.ip already
// honours X-Forwarded-For, but fall back to socket if that is missing.
function clientIp(req: Request): string | null {
  return req.ip || req.socket?.remoteAddress || null;
}

/**
 * Logs every mutating (POST/PATCH/PUT/DELETE) request that reaches
 * /api/admin/*. Rejected requests (401/403 from requireAdmin) are still
 * logged so we can see attempted access. GETs are skipped to keep the
 * log signal-heavy. The audit-log read endpoint itself is skipped so
 * viewing the log doesn't create meta-log entries.
 *
 * Insert is fire-and-forget: an audit failure never blocks the response.
 */
export function adminAuditMiddleware(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();
  if (req.path.startsWith("/audit-log")) return next();

  // Snapshot request state before the handler mutates it.
  const path = req.originalUrl.split("?")[0];
  const { resourceType, resourceId } = parseResource(path);
  const bodyJson = serializeBody(req.body);
  const ip = clientIp(req);
  const userAgent = req.get("user-agent") ?? null;

  res.on("finish", () => {
    // Only log if the request reached an authenticated admin. If requireAdmin
    // rejected the caller, adminId is unknown and there is nothing meaningful
    // to associate the row with.
    const adminUser = (req as any).user;
    if (!adminUser || adminUser.role !== "admin") return;

    // Fire-and-forget. Never await, never throw into the request path.
    db.insert(adminAuditLog).values({
      adminId: adminUser.id,
      method,
      path,
      resourceType,
      resourceId,
      requestBody: bodyJson,
      statusCode: res.statusCode,
      ipAddress: ip,
      userAgent,
    }).catch((err) => {
      logEvent.error("admin_audit_write", err, { path, statusCode: res.statusCode });
    });
  });

  next();
}
