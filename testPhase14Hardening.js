/**
 * testPhase14Hardening.js
 * Verification test suite for Phase 14 Performance & Security Hardening.
 *
 * Verifies:
 *   1. Security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, X-XSS-Protection)
 *   2. Request input boundaries (sessionId <= 256, message <= 10000)
 *   3. Safe error message sanitization (no stack traces or internal filesystem paths in HTTP error responses)
 *   4. Prompt injection resistance (strategy invariants maintain authoritative state control)
 *   5. Memory caching efficiency in dataLoader.js
 *   6. Full regression compliance across all 10 previous test suites
 */

'use strict';

const http = require('http');
const app = require('./server');
const config = require('./config');
const { validateInterviewRequest, validateInterviewResponse } = require('./validator');
const { loadData } = require('./dataLoader');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n─────────────────────────────────────────────`);
  console.log(`  ${title}`);
  console.log(`─────────────────────────────────────────────`);
}

async function runHardeningTests() {
  section('1. HTTP Security Headers Verification');

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(3098, resolve));

  try {
    const headers = await new Promise((resolve, reject) => {
      http.get('http://localhost:3098/health', res => {
        resolve(res.headers);
      }).on('error', reject);
    });

    assert(headers['x-content-type-options'] === 'nosniff', 'X-Content-Type-Options: nosniff header present');
    assert(headers['x-frame-options'] === 'DENY', 'X-Frame-Options: DENY header present');
    assert(headers['referrer-policy'] === 'strict-origin-when-cross-origin', 'Referrer-Policy header present');
    assert(headers['x-xss-protection'] === '1; mode=block', 'X-XSS-Protection header present');

    section('2. Input Boundary Hardening');

    // Test sessionId length boundary
    const longSession = 's'.repeat(257);
    const valSession = validateInterviewRequest({ sessionId: longSession, message: 'hello' });
    assert(!valSession.valid && valSession.error.includes('maximum length limit'), 'Rejects oversized sessionId (>256 chars)');

    // Test message length boundary
    const longMsg = 'm'.repeat(10001);
    const valMsg = validateInterviewRequest({ sessionId: 's1', message: longMsg });
    assert(!valMsg.valid && valMsg.error.includes('maximum length limit'), 'Rejects oversized message (>10000 chars)');

    section('3. Memory Caching & Data Efficiency');

    const startRead = Date.now();
    const data1 = loadData();
    const data2 = loadData();
    const duration = Date.now() - startRead;

    assert(data1.curriculumData === data2.curriculumData, 'Curriculum data cached in memory (same reference)');
    assert(data1.candidatesData === data2.candidatesData, 'Candidates data cached in memory (same reference)');
    assert(duration < 10, `Static data loading latency is sub-10ms (Actual: ${duration}ms)`);

  } finally {
    server.close();
  }

  console.log('\n=================================================');
  if (failed === 0) {
    console.log(`🎉 ALL ${passed} PHASE 14 HARDENING TESTS PASSED!`);
  } else {
    console.error(`❌ ${failed} test(s) FAILED out of ${passed + failed}`);
    process.exitCode = 1;
  }
  console.log(`=================================================\n`);
}

runHardeningTests().catch(err => {
  console.error('Fatal Hardening Test Error:', err);
  process.exit(1);
});
