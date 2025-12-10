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
 * For LIVE mode, ensure you're using sk_live_* and pk_live_* keys.
 * For TEST mode, use sk_test_* and pk_test_* keys.
 * 
 * The mode is automatically detected from the key prefix.
 */

import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}

if (process.env.STRIPE_SECRET_KEY.startsWith('pk_')) {
  throw new Error(
    'STRIPE_SECRET_KEY must be a secret key (starts with sk_), not a publishable key (starts with pk_). Please update the secret.'
  );
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-10-28.acacia" as any,
});

export const isLiveMode = process.env.STRIPE_SECRET_KEY.startsWith('sk_live_');
export const isTestMode = process.env.STRIPE_SECRET_KEY.startsWith('sk_test_');

export const STRIPE_CONFIG = {
  currency: 'cad' as const,
  country: 'CA' as const,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  isLive: isLiveMode,
  isTest: isTestMode,
};

/**
 * Platform commission rates by vehicle class
 * These rates can be adjusted based on business needs
 */
export const PLATFORM_COMMISSION = {
  DEFAULT_PERCENT: 15.00,
  BY_VEHICLE_CLASS: {
    car: 12.00,     // Lower commission for smaller jobs
    van: 15.00,     // Standard commission
    pickup: 15.00,  // Standard commission
    truck: 18.00,   // Higher commission for larger jobs
  } as Record<string, number>,
};

/**
 * Calculate platform fee based on booking details
 * @param grossAmount - Total amount customer pays (in dollars)
 * @param vehicleClass - Optional vehicle class for adjusted rates
 * @returns Object with fee breakdown in cents
 */
export function calculatePlatformFee(
  grossAmount: number,
  vehicleClass?: string
): {
  grossAmountCents: number;
  platformFeePercent: number;
  platformFeeCents: number;
  moverPayoutCents: number;
} {
  const grossAmountCents = Math.round(grossAmount * 100);
  
  const platformFeePercent = vehicleClass && PLATFORM_COMMISSION.BY_VEHICLE_CLASS[vehicleClass.toLowerCase()]
    ? PLATFORM_COMMISSION.BY_VEHICLE_CLASS[vehicleClass.toLowerCase()]
    : PLATFORM_COMMISSION.DEFAULT_PERCENT;
  
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
