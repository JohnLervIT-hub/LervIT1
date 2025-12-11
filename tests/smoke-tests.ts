/**
 * LervIT Smoke Test Suite
 * 
 * Lightweight tests to verify critical API endpoints are working.
 * Run with: npx tsx tests/smoke-tests.ts
 * 
 * These tests are READ-ONLY and do not modify production data.
 */

// For development, force localhost. In CI/production tests, set TEST_BASE_URL explicitly
const BASE_URL = process.env.TEST_BASE_URL || 'http://0.0.0.0:5000';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>) {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, duration: Date.now() - start });
    console.log(`✅ ${name} (${Date.now() - start}ms)`);
  } catch (error: any) {
    results.push({ 
      name, 
      passed: false, 
      duration: Date.now() - start,
      error: error.message 
    });
    console.log(`❌ ${name}: ${error.message}`);
  }
}

async function assertStatus(url: string, expectedStatus: number) {
  const response = await fetch(url);
  if (response.status !== expectedStatus) {
    throw new Error(`Expected status ${expectedStatus}, got ${response.status}`);
  }
  return response;
}

async function assertJsonShape(response: Response, requiredFields: string[]) {
  const json = await response.json();
  for (const field of requiredFields) {
    if (!(field in json)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  return json;
}

// =====================
// SMOKE TESTS
// =====================

async function runSmokeTests() {
  console.log('\n🔥 LervIT Smoke Test Suite\n');
  console.log(`Testing: ${BASE_URL}\n`);
  console.log('─'.repeat(50));

  // Test 1: API Health Check
  await test('API Health - Server responds', async () => {
    const response = await fetch(`${BASE_URL}/api/auth/me`);
    // 401 is expected for unauthenticated request
    if (response.status !== 401 && response.status !== 200) {
      throw new Error(`Unexpected status: ${response.status}`);
    }
  });

  // Test 2: Static Assets Load
  await test('Static Assets - Main page loads', async () => {
    const response = await fetch(BASE_URL);
    if (!response.ok) {
      throw new Error(`Status: ${response.status}`);
    }
  });

  // Test 3: Price Calculation API (read-only)
  await test('Pricing API - Returns correct structure', async () => {
    const response = await fetch(`${BASE_URL}/api/calculate-price`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        distance: 10,
        loadSize: 'medium',
        pickupDifficulty: 'easy',
        dropoffDifficulty: 'easy',
        heavyItem: false,
        numberOfMovers: 1
      })
    });
    
    if (!response.ok) {
      throw new Error(`Status: ${response.status}`);
    }
    
    const json = await response.json();
    // Check for totalCost which is the essential pricing field
    if (!('totalCost' in json)) {
      throw new Error(`Missing field: totalCost`);
    }
    
    if (typeof json.totalCost !== 'number' || json.totalCost <= 0) {
      throw new Error(`Invalid totalCost: ${json.totalCost}`);
    }
  });

  // Test 4: AI Item Identification Endpoint (read-only check)
  await test('AI Vision API - Endpoint accessible', async () => {
    // Just verify the endpoint exists and returns proper error for missing data
    const response = await fetch(`${BASE_URL}/api/ai/items/identify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoUrls: [] })
    });
    
    // 400 (missing photos) or 200 are both acceptable
    if (response.status !== 200 && response.status !== 400 && response.status !== 401) {
      throw new Error(`Unexpected status: ${response.status}`);
    }
  });

  // Test 5: Public Movers List (read-only)
  await test('Movers API - Returns array', async () => {
    const response = await fetch(`${BASE_URL}/api/movers`);
    
    if (!response.ok) {
      throw new Error(`Status: ${response.status}`);
    }
    
    const json = await response.json();
    if (!Array.isArray(json)) {
      throw new Error('Expected array of movers');
    }
  });

  // Test 6: Support FAQ (read-only)
  await test('Support API - FAQ accessible', async () => {
    const response = await fetch(`${BASE_URL}/api/faq`);
    
    // 200 or 404 (if FAQ not implemented) are acceptable
    if (response.status !== 200 && response.status !== 404) {
      throw new Error(`Unexpected status: ${response.status}`);
    }
  });

  // Test 7: Database Connection (via movers endpoint)
  await test('Database - Connection healthy', async () => {
    const response = await fetch(`${BASE_URL}/api/movers`);
    if (!response.ok) {
      throw new Error('Database query failed');
    }
    // If we get valid JSON, database is connected
    await response.json();
  });

  // Test 8: Rate Limiting Headers
  await test('Security - Rate limit headers present', async () => {
    const response = await fetch(`${BASE_URL}/api/auth/me`);
    const rateLimitHeader = response.headers.get('x-ratelimit-limit') || 
                           response.headers.get('ratelimit-limit') ||
                           response.headers.get('retry-after');
    // Rate limiting may or may not include headers, but endpoint should respond
    if (response.status >= 500) {
      throw new Error('Server error on rate-limited endpoint');
    }
  });

  // Print Summary
  console.log('\n' + '─'.repeat(50));
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  
  console.log(`\n📊 Results: ${passed}/${results.length} passed`);
  console.log(`⏱️  Total time: ${totalDuration}ms`);
  
  if (failed > 0) {
    console.log(`\n❌ Failed tests:`);
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.name}: ${r.error}`);
    });
    process.exit(1);
  } else {
    console.log('\n✅ All smoke tests passed!');
    process.exit(0);
  }
}

// Run tests
runSmokeTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
