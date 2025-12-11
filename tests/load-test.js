/**
 * LervIT Load Test Script
 * 
 * Simulates concurrent booking requests to identify bottlenecks.
 * 
 * Installation:
 *   npm install -g k6
 *   # OR use Docker: docker run -i grafana/k6 run - <load-test.js
 * 
 * Usage:
 *   k6 run tests/load-test.js
 *   k6 run --vus 20 --duration 60s tests/load-test.js
 * 
 * Options:
 *   --vus N         Number of virtual users (concurrent connections)
 *   --duration Xs   Test duration in seconds
 *   --env BASE_URL=https://your-app.replit.app
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const pricingDuration = new Trend('pricing_duration');
const moversDuration = new Trend('movers_list_duration');

// Test configuration
export const options = {
  // Simulate gradual ramp-up
  stages: [
    { duration: '10s', target: 10 },  // Ramp up to 10 users
    { duration: '30s', target: 25 },  // Ramp up to 25 users
    { duration: '30s', target: 50 },  // Peak at 50 users
    { duration: '10s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // 95% of requests under 2s
    errors: ['rate<0.1'],               // Error rate under 10%
    pricing_duration: ['p(95)<500'],    // Pricing API under 500ms
    movers_list_duration: ['p(95)<1000'], // Movers list under 1s
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

// Sample data for price estimation requests
const loadSizes = ['boxes', 'medium', 'large', 'apartment'];
const difficulties = ['easy', 'normal', 'hard'];
const distances = [5, 10, 15, 20, 25, 30];

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function () {
  // Group 1: Public endpoints (no auth required)
  group('Public Endpoints', () => {
    // Test 1: Get movers list
    let moversStart = Date.now();
    let moversRes = http.get(`${BASE_URL}/api/movers`);
    moversDuration.add(Date.now() - moversStart);
    
    check(moversRes, {
      'movers list status 200': (r) => r.status === 200,
      'movers list is array': (r) => {
        try {
          const data = JSON.parse(r.body);
          return Array.isArray(data);
        } catch {
          return false;
        }
      },
    });
    errorRate.add(moversRes.status !== 200);

    sleep(0.1);

    // Test 2: Price estimation (simulates booking flow)
    let pricingStart = Date.now();
    let pricingRes = http.post(
      `${BASE_URL}/api/calculate-price`,
      JSON.stringify({
        distance: randomChoice(distances),
        loadSize: randomChoice(loadSizes),
        pickupDifficulty: randomChoice(difficulties),
        dropoffDifficulty: randomChoice(difficulties),
        heavyItem: Math.random() > 0.7,
        numberOfMovers: Math.random() > 0.5 ? 2 : 1,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
    pricingDuration.add(Date.now() - pricingStart);

    check(pricingRes, {
      'pricing status 200': (r) => r.status === 200,
      'pricing has totalCost': (r) => {
        try {
          const data = JSON.parse(r.body);
          return typeof data.totalCost === 'number';
        } catch {
          return false;
        }
      },
    });
    errorRate.add(pricingRes.status !== 200);

    sleep(0.1);
  });

  // Group 2: Static assets (CDN simulation)
  group('Static Assets', () => {
    let homeRes = http.get(BASE_URL);
    check(homeRes, {
      'homepage loads': (r) => r.status === 200,
    });
    errorRate.add(homeRes.status !== 200);
  });

  // Simulate user think time between requests
  sleep(Math.random() * 2 + 0.5);
}

// Summary handler for pretty output
export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    vus_max: data.metrics.vus_max?.values?.max || 0,
    iterations: data.metrics.iterations?.values?.count || 0,
    http_reqs: data.metrics.http_reqs?.values?.count || 0,
    http_req_duration_avg: data.metrics.http_req_duration?.values?.avg?.toFixed(2) || 0,
    http_req_duration_p95: data.metrics.http_req_duration?.values['p(95)']?.toFixed(2) || 0,
    pricing_duration_avg: data.metrics.pricing_duration?.values?.avg?.toFixed(2) || 0,
    pricing_duration_p95: data.metrics.pricing_duration?.values['p(95)']?.toFixed(2) || 0,
    error_rate: ((data.metrics.errors?.values?.rate || 0) * 100).toFixed(2) + '%',
    passed: data.root_group?.checks?.reduce((sum, c) => sum + c.passes, 0) || 0,
    failed: data.root_group?.checks?.reduce((sum, c) => sum + c.fails, 0) || 0,
  };

  console.log('\n' + '='.repeat(60));
  console.log('                    LOAD TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Timestamp:          ${summary.timestamp}`);
  console.log(`Max VUs:            ${summary.vus_max}`);
  console.log(`Total Iterations:   ${summary.iterations}`);
  console.log(`Total HTTP Reqs:    ${summary.http_reqs}`);
  console.log('─'.repeat(60));
  console.log(`Avg Response Time:  ${summary.http_req_duration_avg}ms`);
  console.log(`P95 Response Time:  ${summary.http_req_duration_p95}ms`);
  console.log(`Pricing API Avg:    ${summary.pricing_duration_avg}ms`);
  console.log(`Pricing API P95:    ${summary.pricing_duration_p95}ms`);
  console.log(`Error Rate:         ${summary.error_rate}`);
  console.log('─'.repeat(60));
  console.log(`Checks Passed:      ${summary.passed}`);
  console.log(`Checks Failed:      ${summary.failed}`);
  console.log('='.repeat(60) + '\n');

  // Bottleneck Analysis
  console.log('📊 BOTTLENECK ANALYSIS:');
  
  if (parseFloat(summary.http_req_duration_p95) > 2000) {
    console.log('⚠️  High P95 latency detected. Consider:');
    console.log('    - Adding database connection pooling');
    console.log('    - Implementing response caching');
    console.log('    - Scaling compute resources');
  }
  
  if (parseFloat(summary.pricing_duration_p95) > 500) {
    console.log('⚠️  Pricing API slow. Consider:');
    console.log('    - Caching common price calculations');
    console.log('    - Optimizing pricing logic');
  }
  
  if (parseFloat(summary.error_rate) > 5) {
    console.log('❌ High error rate. Check:');
    console.log('    - Rate limiting configuration');
    console.log('    - Database connection limits');
    console.log('    - Memory/CPU constraints');
  }
  
  if (parseFloat(summary.http_req_duration_p95) < 500 && 
      parseFloat(summary.error_rate) < 1) {
    console.log('✅ Performance looks healthy for current load!');
  }

  console.log('\n📝 RECOMMENDATIONS:');
  console.log('1. For production, run with: k6 run --vus 50 --duration 5m');
  console.log('2. Monitor Neon database connections during peak load');
  console.log('3. Consider Stripe webhook retry handling under load');
  console.log('4. Add Redis caching for frequently accessed data');

  return {
    'stdout': '',
    'results.json': JSON.stringify(data, null, 2),
  };
}
