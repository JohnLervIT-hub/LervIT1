/**
 * Canva Connect API provider — OAuth authorization and token lifecycle.
 *
 * Docs:
 *   - Authentication: https://www.canva.dev/docs/connect/authentication/
 *   - API reference:  https://www.canva.dev/docs/connect/api-reference/
 *
 * Env vars (set on the Railway LervIT1 service):
 *   - CANVA_CLIENT_ID     (Canva app client id)
 *   - CANVA_CLIENT_SECRET (Canva app client secret)
 *   - CANVA_ACCESS_TOKEN  (optional — a hand-pasted token, used only as a
 *                          fallback when nothing has been connected yet)
 *
 * The redirect URL below must also be registered on the Canva app:
 *   canva.dev → LervIT Marketing → Outside Canva → Redirect URLs
 *   → https://app.lervit.com/api/canva/callback
 *
 * Two constraints from Canva shape this file:
 *
 *   1. PKCE (S256) is mandatory, not optional — an /authorize request without
 *      code_challenge is rejected. The verifier is minted per attempt and
 *      parked in the admin's session until the callback returns.
 *   2. Access tokens are short-lived (Canva returns expires_in) and refresh
 *      tokens are single-use — each refresh issues a new one. So both are
 *      persisted to app_settings and rewritten on every exchange; a token
 *      sitting in an env var would go stale within hours and could not renew
 *      itself.
 */

import { createHash, randomBytes } from 'crypto';
import { inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { appSettings } from '@shared/schema';
import { logger } from '../logger';
import { getBaseUrl } from '../utils/urls';

const AUTHORIZE_URL = 'https://www.canva.com/api/oauth/authorize';
const TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token';

/** Scopes Ember needs: read/write designs and assets, read brand templates. */
export const CANVA_SCOPES = [
  'design:content:read',
  'design:content:write',
  'asset:read',
  'asset:write',
  'brandtemplate:content:read',
  'brandtemplate:meta:read',
];

const SETTING_ACCESS_TOKEN = 'canva_access_token';
const SETTING_REFRESH_TOKEN = 'canva_refresh_token';
const SETTING_EXPIRES_AT = 'canva_token_expires_at';

// Renew this far ahead of the stated expiry, so a call that starts just under
// the wire does not land on a token that died mid-request.
const REFRESH_SKEW_MS = 5 * 60 * 1000;

interface CanvaTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

export interface CanvaConnectionResult {
  expiresIn: number;
  scope?: string;
  hasRefreshToken: boolean;
}

class CanvaProvider {
  // Read lazily rather than in the constructor: this module is imported at
  // boot, and a missing var should surface at call time with a usable message
  // instead of freezing an empty string into the instance.
  private get clientId(): string {
    return process.env.CANVA_CLIENT_ID ?? '';
  }

  private get clientSecret(): string {
    return process.env.CANVA_CLIENT_SECRET ?? '';
  }

  /** Where Canva sends the admin back. Must match a registered redirect URL. */
  get redirectUri(): string {
    return `${getBaseUrl()}/api/canva/callback`;
  }

  /** PKCE verifier — 43-128 chars of base64url per RFC 7636. */
  createCodeVerifier(): string {
    return randomBytes(48).toString('base64url');
  }

  private codeChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
  }

  /** Step 1 — the Canva login URL to send the admin to. */
  buildAuthorizeUrl(state: string, codeVerifier: string): string {
    if (!this.clientId) {
      throw new Error('CANVA_CLIENT_ID not set');
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: CANVA_SCOPES.join(' '),
      code_challenge: this.codeChallenge(codeVerifier),
      code_challenge_method: 'S256',
      state,
    });

    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  private async requestToken(body: URLSearchParams): Promise<CanvaTokenResponse> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('CANVA_CLIENT_ID / CANVA_CLIENT_SECRET not set');
    }

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        // Canva authenticates the client with Basic auth, not body params.
        Authorization:
          'Basic ' +
          Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64'),
      },
      body,
    });

    const data = (await response.json().catch(() => ({}))) as CanvaTokenResponse;

    if (!response.ok || !data.access_token) {
      // Only the error fields are surfaced — the body of a successful-looking
      // response carries live tokens and must not reach the logs.
      const detail = [data.error, data.error_description].filter(Boolean).join(': ');
      throw new Error(
        `Canva token request failed (${response.status})${detail ? `: ${detail}` : ''}`,
      );
    }

    return data;
  }

  /** Step 2 — trade the callback's code for tokens and store them. */
  async exchangeCodeForToken(
    code: string,
    codeVerifier: string,
  ): Promise<CanvaConnectionResult> {
    const data = await this.requestToken(
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
        redirect_uri: this.redirectUri,
      }),
    );

    await this.storeTokens(data);

    return {
      expiresIn: data.expires_in ?? 0,
      scope: data.scope,
      hasRefreshToken: !!data.refresh_token,
    };
  }

  private async storeTokens(data: CanvaTokenResponse): Promise<void> {
    const now = new Date();
    const rows = [
      { key: SETTING_ACCESS_TOKEN, value: data.access_token!, updatedAt: now },
      {
        key: SETTING_EXPIRES_AT,
        value: new Date(now.getTime() + (data.expires_in ?? 0) * 1000).toISOString(),
        updatedAt: now,
      },
    ];

    // Canva rotates the refresh token on each exchange. If a response omits
    // it, keep the one already stored rather than blanking a live credential.
    if (data.refresh_token) {
      rows.push({
        key: SETTING_REFRESH_TOKEN,
        value: data.refresh_token,
        updatedAt: now,
      });
    }

    await db
      .insert(appSettings)
      .values(rows)
      .onConflictDoUpdate({
        target: appSettings.key,
        set: {
          value: sql`excluded.value`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  private async readSettings(keys: string[]): Promise<Record<string, string>> {
    const rows = await db
      .select({ key: appSettings.key, value: appSettings.value })
      .from(appSettings)
      .where(inArray(appSettings.key, keys));

    return Object.fromEntries(
      rows
        .filter((row): row is { key: string; value: string } => row.value !== null)
        .map((row) => [row.key, row.value]),
    );
  }

  private async refresh(refreshToken: string): Promise<string> {
    const data = await this.requestToken(
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    );

    await this.storeTokens(data);
    logger.info({ expiresIn: data.expires_in }, '[Canva] access token refreshed');

    return data.access_token!;
  }

  /**
   * A usable access token, renewed first if it is at or near expiry.
   *
   * Async by necessity: Canva's tokens expire in hours, so a synchronous
   * env-only read cannot keep the connection alive. CANVA_ACCESS_TOKEN still
   * works as a fallback for a token pasted in by hand, but such a token has
   * no refresh pair and will stop working when it expires.
   */
  async getAccessToken(): Promise<string> {
    const stored = await this.readSettings([
      SETTING_ACCESS_TOKEN,
      SETTING_REFRESH_TOKEN,
      SETTING_EXPIRES_AT,
    ]).catch((err) => {
      // A DB blip should fall through to the env fallback, not throw.
      logger.error({ err }, '[Canva] could not read stored tokens');
      return {} as Record<string, string>;
    });

    const accessToken = stored[SETTING_ACCESS_TOKEN];
    const expiresAt = stored[SETTING_EXPIRES_AT]
      ? Date.parse(stored[SETTING_EXPIRES_AT])
      : NaN;

    if (accessToken && Number.isFinite(expiresAt) && Date.now() < expiresAt - REFRESH_SKEW_MS) {
      return accessToken;
    }

    const refreshToken = stored[SETTING_REFRESH_TOKEN];
    if (refreshToken) {
      try {
        return await this.refresh(refreshToken);
      } catch (err) {
        logger.error(
          { err },
          '[Canva] token refresh failed — reconnect at /api/canva/auth',
        );
      }
    }

    const envToken = process.env.CANVA_ACCESS_TOKEN;
    if (envToken) {
      return envToken;
    }

    throw new Error(
      'CANVA_ACCESS_TOKEN not set. Visit /api/canva/auth to connect.',
    );
  }

  /** Whether a token is on file, for the admin UI. Never returns the token. */
  async getConnectionStatus(): Promise<{ connected: boolean; expiresAt: string | null }> {
    const stored = await this.readSettings([
      SETTING_ACCESS_TOKEN,
      SETTING_EXPIRES_AT,
    ]);

    return {
      connected: !!stored[SETTING_ACCESS_TOKEN] || !!process.env.CANVA_ACCESS_TOKEN,
      expiresAt: stored[SETTING_EXPIRES_AT] ?? null,
    };
  }
}

export const canvaProvider = new CanvaProvider();
