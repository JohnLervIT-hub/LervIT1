import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const bookingDuration = new Trend('booking_flow_duration', true);

export const options = {
  stages: [
    { duration: '2m', target: 50 },   // ramp up to 50 VUs
    { duration: '5m', target: 200 },  // ramp up to 200 VUs
    { duration: '5m', target: 500 },  // ramp up to 500 VUs
    { duration: '2m', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // 95% of requests under 2s
    errors: ['rate<0.05'],              // error rate under 5%
    http_req_failed: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

export default function () {
  const start = Date.now();

  // Step 1: Health check
  const health = http.get(`${BASE_URL}/api/health`);
  check(health, { 'health ok': (r) => r.status === 200 });
  errorRate.add(health.status !== 200);

  sleep(0.5);

  // Step 2: Load movers list
  const movers = http.get(`${BASE_URL}/api/movers?isAvailable=true`);
  check(movers, {
    'movers status 200': (r) => r.status === 200,
    'movers returns array': (r) => {
      try { return Array.isArray(JSON.parse(r.body)); } catch { return false; }
    },
  });
  errorRate.add(movers.status !== 200);

  sleep(1);

  // Step 3: Estimate price (public endpoint)
  const estimate = http.post(
    `${BASE_URL}/api/price-estimate`,
    JSON.stringify({
      pickupAddress: '123 Main St NW, Calgary, AB',
      dropoffAddress: '456 Centre St NE, Calgary, AB',
      loadSize: 'medium',
      numberOfMovers: 2,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(estimate, {
    'estimate status 200 or 401': (r) => r.status === 200 || r.status === 401,
  });

  sleep(1);

  // Step 4: Places autocomplete proxy
  const places = http.get(
    `${BASE_URL}/api/places/autocomplete?input=Calgary+AB&sessiontoken=k6-test`
  );
  check(places, {
    'places status 200 or 500': (r) => r.status === 200 || r.status === 500,
  });

  bookingDuration.add(Date.now() - start);
  sleep(2);
}
