/**
 * BNPL (Buy Now Pay Later) Payment Flow - E2E Tests
 *
 * What these tests prove:
 *
 * 1. BNPL METHODS (API) — The PaymentIntent created for an unassigned booking
 *    includes afterpay_clearpay and klarna in payment_method_types, verified
 *    against the real Stripe test API.
 *
 * 2. REAL CONFIRM PATH (API) — The /confirm-payment server route correctly
 *    processes a PaymentIntent that has actually been confirmed on Stripe
 *    (via pm_card_visa in test mode), exercises the real Stripe-status check
 *    in server/routes.ts, updates booking.paymentStatus = 'succeeded'.
 *
 * 3. UNCONFIRMED PI REJECTED (API) — /confirm-payment returns 400 when the
 *    PaymentIntent has not yet succeeded on Stripe.
 *
 * 4. PAYMENT ELEMENT RENDERS (UI/mock) — PaymentElement mounts without JS
 *    errors on the payment page.
 *
 * 5. BNPL SUCCESS + DECLINED IN ONE CONTEXT (UI/mock) — Using a single
 *    mocked Stripe context, verifies:
 *    a. A simulated Afterpay succeed triggers /confirm-payment and redirects
 *       the customer to /my-bookings.
 *    b. A simulated declined payment (same context, new booking) shows the
 *       "Payment Failed" error toast and keeps the user on the payment page.
 *
 * 6. PAYMENT SETUP ERROR (UI, no Stripe JS) — When create-payment-intent
 *    fails, the page shows "Unable to load payment form" and a retry button
 *    without requiring Stripe JS to load.
 *
 * Backend dev endpoints (development mode only):
 *   POST /api/dev/create-test-user
 *   POST /api/dev/create-test-booking     (requires session)
 *   GET  /api/dev/payment-intent/:piId    (requires session)
 *   POST /api/dev/confirm-test-payment-intent  (requires session)
 *
 * Run:
 *   npx playwright test tests/e2e/payment-bnpl.spec.ts
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Stripe JS mock (UI tests only)
//
// Key notes:
// - @stripe/react-stripe-js v5 requires _registerWrapper + registerAppInfo
// - @stripe/stripe-js@8.5.2 checks window.Stripe.version against 'clover'
//   (its RELEASE_TRAIN constant) and warns if they differ, which can cause
//   inconsistent element mounting in test-mode keys. Set to 'clover' exactly.
// - window.__setStripeConfirmResult__(result) lets each test control the outcome.
// ---------------------------------------------------------------------------
export const STRIPE_MOCK_SCRIPT = `
(function () {
  var _confirmResult = { paymentIntent: { id: 'pi_test_bnpl_mock', status: 'succeeded' } };
  window.__setStripeConfirmResult__ = function (r) { _confirmResult = r; };
  window.__stripeConfirmCalled__ = false;

  function MockElements() { this._els = {}; }
  MockElements.prototype.create = function (type) {
    var self = this;
    var el = {
      mount: function (domEl) {
        var node = typeof domEl === 'string' ? document.querySelector(domEl) : domEl;
        if (node) {
          node.setAttribute('data-stripe-mock', type);
          node.innerHTML =
            '<div data-testid="stripe-mock-element" style="border:1px solid #ccc;padding:16px">' +
            '<span>Mock ' + type + ' (card / afterpay_clearpay / klarna)</span>' +
            '</div>';
        }
        return Promise.resolve();
      },
      unmount: function () {},
      on: function () { return this; },
      off: function () { return this; },
      update: function () {},
      destroy: function () {},
      collapse: function () {},
      focus: function () {},
      blur: function () {},
      clear: function () {},
    };
    self._els[type] = el;
    return el;
  };
  MockElements.prototype.getElement = function (t) { return this._els[t] || null; };
  MockElements.prototype.submit = function () { return Promise.resolve({ error: null }); };
  MockElements.prototype.fetchUpdates = function () { return Promise.resolve(); };
  MockElements.prototype.update = function () {};

  function MockStripe() {}
  // Required by @stripe/react-stripe-js v5 — absent → silent no-render
  MockStripe.prototype._registerWrapper = function () {};
  MockStripe.prototype.registerAppInfo = function () {};
  MockStripe.prototype.elements = function () { return new MockElements(); };
  MockStripe.prototype.confirmPayment = function () {
    window.__stripeConfirmCalled__ = true;
    return Promise.resolve(_confirmResult);
  };
  MockStripe.prototype.confirmCardPayment = function () { return Promise.resolve(_confirmResult); };
  MockStripe.prototype.retrievePaymentIntent = function () {
    return Promise.resolve({ paymentIntent: (_confirmResult.paymentIntent || { status: 'unknown' }) });
  };
  MockStripe.prototype.createPaymentMethod = function () {
    return Promise.resolve({ paymentMethod: { id: 'pm_mock' } });
  };
  MockStripe.prototype.createToken = function () { return Promise.resolve({ token: { id: 'tok_mock' } }); };
  MockStripe.prototype.createSource = function () { return Promise.resolve({ source: { id: 'src_mock' } }); };

  window.Stripe = function () { return new MockStripe(); };
  // Must match @stripe/stripe-js@8.5.2 RELEASE_TRAIN = 'clover'
  window.Stripe.version = 'clover';
})();
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function mockStripeJs(page: Page) {
  await page.addInitScript(STRIPE_MOCK_SCRIPT);
  await page.route('https://js.stripe.com/**', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: STRIPE_MOCK_SCRIPT });
  });
  await page.route('**/api/config/stripe-public-key', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ publicKey: 'pk_test_mock_playwright', isTestMode: true }),
    });
  });
}

async function createVerifiedCustomer(page: Page, suffix: string) {
  const email = `bnpl-${suffix}@playwright.test`;
  const password = 'PlaywrightTest1!';
  const resp = await page.request.post('/api/dev/create-test-user', {
    data: { name: `BNPL Tester ${suffix}`, email, password },
  });
  if (!resp.ok()) throw new Error(`create-test-user: ${resp.status()} ${await resp.text()}`);
  const user = await resp.json();
  return { email, password, id: user.id as string };
}

async function loginAs(page: Page, email: string, password: string) {
  const resp = await page.request.post('/api/auth/login', { data: { email, password } });
  if (!resp.ok()) throw new Error(`login: ${resp.status()} ${await resp.text()}`);
}

async function createTestBooking(page: Page): Promise<string> {
  const resp = await page.request.post('/api/dev/create-test-booking');
  if (!resp.ok()) throw new Error(`create-test-booking: ${resp.status()} ${await resp.text()}`);
  return (await resp.json()).id as string;
}

async function createPaymentIntent(page: Page, bookingId: string) {
  const resp = await page.request.post(`/api/bookings/${bookingId}/create-payment-intent`);
  if (!resp.ok()) throw new Error(`create-payment-intent: ${resp.status()} ${await resp.text()}`);
  const data = await resp.json();
  const clientSecret: string = data.clientSecret;
  const paymentIntentId = clientSecret.split('_secret_')[0];
  return { clientSecret, paymentIntentId };
}

/** Wait for the Stripe mock element to mount, with a generous timeout. */
async function waitForMockElement(page: Page, timeoutMs = 20_000) {
  await expect(page.locator('[data-testid="stripe-mock-element"]')).toBeVisible({ timeout: timeoutMs });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('BNPL Payment Flow', () => {

  // ── 1. BNPL METHODS (API) ────────────────────────────────────────────────
  test('PaymentIntent for unassigned booking includes afterpay_clearpay and klarna', async ({ page }) => {
    const suffix = `m-${Date.now()}`;
    const creds = await createVerifiedCustomer(page, suffix);
    await loginAs(page, creds.email, creds.password);
    const bookingId = await createTestBooking(page);
    const { paymentIntentId } = await createPaymentIntent(page, bookingId);

    const piResp = await page.request.get(`/api/dev/payment-intent/${paymentIntentId}`);
    expect(piResp.ok(), `PI retrieval failed: ${await piResp.text()}`).toBeTruthy();
    const pi = await piResp.json();

    expect(pi.payment_method_types, 'payment_method_types missing').toBeDefined();
    expect(pi.payment_method_types).toContain('card');
    expect(pi.payment_method_types, 'afterpay_clearpay missing for unassigned booking').toContain('afterpay_clearpay');
    expect(pi.payment_method_types, 'klarna missing for unassigned booking').toContain('klarna');
    expect(pi.currency).toBe('cad');
  });

  // ── 2. REAL CONFIRM PATH (API) ───────────────────────────────────────────
  test('real card confirm-payment exercises Stripe status check and marks booking as paid', async ({ page }) => {
    const suffix = `c-${Date.now()}`;
    const creds = await createVerifiedCustomer(page, suffix);
    await loginAs(page, creds.email, creds.password);
    const bookingId = await createTestBooking(page);
    const { paymentIntentId } = await createPaymentIntent(page, bookingId);

    // Confirm PI on Stripe using pm_card_visa (always succeeds in test mode)
    const confirmStripeResp = await page.request.post('/api/dev/confirm-test-payment-intent', {
      data: { paymentIntentId },
    });
    expect(confirmStripeResp.ok(), `Stripe confirm failed: ${await confirmStripeResp.text()}`).toBeTruthy();
    expect((await confirmStripeResp.json()).status).toBe('succeeded');

    // Call the real /confirm-payment route — exercises stripe.paymentIntents.retrieve check
    const confirmPaymentResp = await page.request.post(`/api/bookings/${bookingId}/confirm-payment`, {
      data: { paymentIntentId },
    });
    expect(confirmPaymentResp.ok(), `confirm-payment failed: ${await confirmPaymentResp.text()}`).toBeTruthy();

    // Verify booking is now marked paid in the database
    const bookingResp = await page.request.get(`/api/bookings/${bookingId}`);
    const booking = await bookingResp.json();
    expect(booking.paymentStatus, 'booking paymentStatus must be succeeded').toBe('succeeded');
  });

  // ── 3. UNCONFIRMED PI REJECTED (API) ─────────────────────────────────────
  test('confirm-payment returns 400 for a PaymentIntent not yet confirmed on Stripe', async ({ page }) => {
    const suffix = `u-${Date.now()}`;
    const creds = await createVerifiedCustomer(page, suffix);
    await loginAs(page, creds.email, creds.password);
    const bookingId = await createTestBooking(page);
    const { paymentIntentId } = await createPaymentIntent(page, bookingId);

    // Skip the Stripe confirm step — call /confirm-payment directly
    const resp = await page.request.post(`/api/bookings/${bookingId}/confirm-payment`, {
      data: { paymentIntentId },
    });
    expect(resp.status(), 'must reject unconfirmed PI with 400').toBe(400);
    expect((await resp.json()).error).toMatch(/not yet completed|Payment not/i);
  });

  // ── 4. PAYMENT ELEMENT RENDERS (UI/mock) ─────────────────────────────────
  test('payment page renders PaymentElement without JavaScript errors', async ({ page }) => {
    await mockStripeJs(page);

    const suffix = `r-${Date.now()}`;
    const creds = await createVerifiedCustomer(page, suffix);
    await loginAs(page, creds.email, creds.password);
    const bookingId = await createTestBooking(page);

    const jsErrors: string[] = [];
    page.on('pageerror', (err) => {
      if (!err.message.includes('ResizeObserver') && !err.message.includes('Non-Error')) {
        jsErrors.push(err.message);
      }
    });

    await page.goto(`/payment/${bookingId}`, { waitUntil: 'networkidle' });
    await expect(page.getByText('Complete Your Payment')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid="text-pickup-address"]')).toBeVisible();
    await expect(page.locator('[data-testid="text-dropoff-address"]')).toBeVisible();
    await waitForMockElement(page);
    await expect(page.locator('[data-testid="button-submit-payment"]')).toBeEnabled({ timeout: 10_000 });
    await expect(page.getByText(/Afterpay or Klarna/i)).toBeVisible();
    expect(jsErrors, `JS errors: ${jsErrors.join('; ')}`).toHaveLength(0);
  });

  // ── 5. BNPL SUCCESS + DECLINED IN ONE MOCK CONTEXT (UI/mock) ─────────────
  //
  // Both payment outcomes are exercised within the same browser context so the
  // Stripe mock module state is shared, avoiding the stripePromise singleton
  // staleness issue that arises when test 5 navigates to /my-bookings and a
  // separate context re-enters /payment/:id.
  test('mocked BNPL confirm succeeds then declined payment shows error toast', async ({ page }) => {
    await mockStripeJs(page);

    const suffix = `b-${Date.now()}`;
    const creds = await createVerifiedCustomer(page, suffix);
    await loginAs(page, creds.email, creds.password);

    // ── 5a: Afterpay succeed → /confirm-payment hit → /my-bookings ──────────
    const bookingIdA = await createTestBooking(page);
    let confirmHitA = false;
    await page.route(`**/api/bookings/${bookingIdA}/confirm-payment`, async (route) => {
      confirmHitA = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });

    await page.goto(`/payment/${bookingIdA}`, { waitUntil: 'networkidle' });
    await waitForMockElement(page);
    await expect(page.locator('[data-testid="button-submit-payment"]')).toBeEnabled({ timeout: 10_000 });

    await page.evaluate(() => {
      (window as any).__setStripeConfirmResult__({
        paymentIntent: { id: 'pi_test_afterpay', status: 'succeeded' },
      });
    });
    await page.locator('[data-testid="button-submit-payment"]').click();
    await expect.poll(() => confirmHitA, { timeout: 8_000, message: '/confirm-payment not called' }).toBe(true);
    await expect(page).toHaveURL(/\/my-bookings/, { timeout: 8_000 });

    // ── 5b: Navigate to a new booking's payment page in the SAME context ────
    // The Stripe mock persists because the React bundle keeps the same module
    // scope during SPA navigation. We navigate back to a payment page while the
    // mock is still registered, so confirmPayment remains stubbed.
    const bookingIdB = await createTestBooking(page);

    await page.goto(`/payment/${bookingIdB}`, { waitUntil: 'networkidle' });
    await waitForMockElement(page);
    await expect(page.locator('[data-testid="button-submit-payment"]')).toBeEnabled({ timeout: 10_000 });

    await page.evaluate(() => {
      (window as any).__setStripeConfirmResult__({
        error: { type: 'card_error', code: 'card_declined', message: 'Your card was declined.' },
      });
    });
    await page.locator('[data-testid="button-submit-payment"]').click();

    // Error toast appears
    await expect(page.getByText(/Payment Failed|card was declined/i)).toBeVisible({ timeout: 5_000 });
    // No redirect
    await page.waitForTimeout(2_500);
    expect(page.url()).toContain(`/payment/${bookingIdB}`);
  });

  // ── 6. PAYMENT SETUP ERROR (UI, no Stripe JS needed) ─────────────────────
  //
  // Tests the payment page's own error-handling UI: when create-payment-intent
  // fails (e.g. network error or bad booking state), the page shows
  // "Unable to load payment form" and a retry button.
  // This path does NOT require Stripe JS to load.
  test('payment setup failure shows error UI with retry button', async ({ page }) => {
    // Do NOT set up Stripe mock — this test checks the pre-Stripe error path.
    const suffix = `e-${Date.now()}`;
    const creds = await createVerifiedCustomer(page, suffix);
    await loginAs(page, creds.email, creds.password);
    const bookingId = await createTestBooking(page);

    // Intercept create-payment-intent to return a server-side error
    await page.route(`**/api/bookings/${bookingId}/create-payment-intent`, async (route: Route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Payment service temporarily unavailable' }),
      });
    });

    await page.goto(`/payment/${bookingId}`, { waitUntil: 'networkidle' });

    // Booking summary should render even when payment setup fails
    await expect(page.getByText('Complete Your Payment')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid="text-pickup-address"]')).toBeVisible();

    // Error state: no Stripe form, shows error message + retry button
    await expect(page.getByText('Unable to load payment form')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="button-retry-payment-setup"]')).toBeVisible();

    // Stripe PaymentElement should NOT have mounted (no clientSecret)
    await expect(page.locator('[data-testid="button-submit-payment"]')).not.toBeVisible();
  });
});
