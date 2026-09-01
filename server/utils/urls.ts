/**
 * Single source of truth for the app's public base URL.
 * Set APP_BASE_URL in your environment (see .env.example).
 */
export function getBaseUrl(): string {
  return process.env.APP_BASE_URL || 'https://app.lervit.com';
}
