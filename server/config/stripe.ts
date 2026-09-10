/**
 * Stripe Configuration Module
 *
 * This module provides a centralized Stripe client configuration for the LervIT platform.
 * It supports both TEST and LIVE modes based on environment variables.
 *
 * REQUIRED ENVIRONMENT VARIABLES:
 * - STRIPE_SECRET_KEY: Your Stripe secret key (sk_live_... or sk_test_...)
 * - STRIPE_WEBHOOK_SECRET: Webhook signing secret for signature verification
 *
 * OPTIONAL ENVIRONMENT VARIABLES:
 * - VITE_STRIPE_PUBLIC_KEY: Publishable key for frontend (pk_live_... or pk_test_...)
 *
 * Boot behaviour: prior to this refactor, missing STRIPE_SECRET_KEY threw
 * synchronously at import time. That killed the process before any
 * uncaughtException handler existed and manifested as a silent Railway
 * container exit. The Stripe client is now lazy: `stripe` remains an
 * export of shape `Stripe`, but property access resolves through a Proxy
 * to a client constructed on first use. If the key is missing, the throw
 * happens at the first stripe.* call — which is inside a handler's
 * try/catch — instead of at module load.
 */

import Stripe from "stripe";
import { logger } from "../logger";

// In development mode, use testing keys if available
const isDevelopment = process.env.NODE_ENV === 'development';
const stripeSecretKey = isDevelopment && process.env.TESTING_STRIPE_SECRET_KEY
  ? process.env.TESTING_STRIPE_SECRET_KEY
  : process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  logger.warn('[stripe] STRIPE_SECRET_KEY is not set — Stripe API calls will throw at use time');
}
if (stripeSecretKey && stripeSecretKey.startsWith('pk_')) {
  logger.error(
    '[stripe] STRIPE_SECRET_KEY is a publishable key (pk_*). It must be a secret key (sk_*). ' +
    'Stripe API calls will throw at use time.',
  );
}

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (_stripe) return _stripe;
  if (!stripeSecretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  if (stripeSecretKey.startsWith('pk_')) {
    throw new Error(
      'STRIPE_SECRET_KEY must be a secret key (starts with sk_), not a publishable key (starts with pk_). Please update the secret.',
    );
  }
  _stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2024-10-28.acacia" as any,
  });
  return _stripe;
}

// Named export preserves the previous shape (`import { stripe } from ...`)
// so no call site needs to change. The first property access constructs
// (or throws) — importing this module is now zero-side-effect.
export const stripe = new Proxy({} as Stripe, {
  get: (_target, prop) => getStripe()[prop as keyof Stripe],
});

export const isLiveMode = stripeSecretKey?.startsWith('sk_live_') ?? false;
export const isTestMode = stripeSecretKey?.startsWith('sk_test_') ?? false;

export const STRIPE_CONFIG = {
  currency: 'cad' as const,
  country: 'CA' as const,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  isLive: isLiveMode,
  isTest: isTestMode,
};

/**
 * Platform commission rate - flat 15% for MVP
 */
export const PLATFORM_COMMISSION = {
  DEFAULT_PERCENT: 15.00,
  // MVP: Using flat 15% rate for all vehicle types
  // Future: Can add BY_VEHICLE_CLASS for tiered rates
};

/**
 * Calculate platform fee based on booking details
 * @param grossAmount - Total amount customer pays (in dollars)
 * @param _vehicleClass - Unused for MVP (flat 15% rate)
 * @returns Object with fee breakdown in cents
 */
export function calculatePlatformFee(
  grossAmount: number,
  _vehicleClass?: string
): {
  grossAmountCents: number;
  platformFeePercent: number;
  platformFeeCents: number;
  moverPayoutCents: number;
} {
  const grossAmountCents = Math.round(grossAmount * 100);

  // MVP: Flat 15% commission rate for all bookings
  const platformFeePercent = PLATFORM_COMMISSION.DEFAULT_PERCENT;

  const platformFeeCents = Math.round(grossAmountCents * (platformFeePercent / 100));
  const moverPayoutCents = grossAmountCents - platformFeeCents;

  return {
    grossAmountCents,
    platformFeePercent,
    platformFeeCents,
    moverPayoutCents,
  };
}

/**
 * Calculate mover payout from booking
 * @param grossAmount - Total amount customer pays (in dollars)
 * @param platformFeePercent - Platform fee percentage
 * @returns Mover payout amount in dollars
 */
export function calculateMoverPayout(
  grossAmount: number,
  platformFeePercent: number = PLATFORM_COMMISSION.DEFAULT_PERCENT
): number {
  return grossAmount * (1 - platformFeePercent / 100);
}

export default stripe;
