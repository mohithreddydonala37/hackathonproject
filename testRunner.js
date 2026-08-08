const http = require('http');
const path = require('path');
const fs = require('fs');
const app = require('./server');
const { closeDbConnection, getDbConnection } = require('./db');
const sessionService = require('./sessionService');
const { getCandidateById } = require('./dataLoader');

const PORT = 3099;
let server;

function makeRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({ statusCode: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: responseData });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log(`\n🧪 Running Phase 4 Backend Foundation Integration Tests...\n`);

  server = app.listen(PORT, async () => {
    try {
      const testCandidate = getCandidateById('CAND-001') || {
        member: { id: 'CAND-001', name: 'Sarah Johnson', jobRole: 'Senior Data Engineer', yearsExperience: 9 },
        missions: [{ day: 7, title: 'Embeddings Explained', passed: true }],
        signals: { commitDays: 28, missionsCompleted: 30, missionsFirstTry: 20 }
      };

      const testSessionId = `test-sess-${Date.now()}`;

      // TEST 1: Valid Initial Request
      console.log(`▶ Test 1: Valid Initial Request (POST /api/interview)`);
      const res1 = await makeRequest('/api/interview', 'POST', {
        sessionId: testSessionId,
        candidate: testCandidate
      });
      console.log(`  Status: ${res1.statusCode}, Done: ${res1.body.done}`);
      if (res1.statusCode !== 200 || res1.body.done !== false || !res1.body.reply) {
        throw new Error(`Test 1 Failed: Expected 200 OK with done: false`);
      }
      console.log(`  ✅ Test 1 Passed!\n`);

      // TEST 2: Valid Conversation Request
      console.log(`▶ Test 2: Valid Conversation Request`);
      const res2 = await makeRequest('/api/interview', 'POST', {
        sessionId: testSessionId,
        message: "I designed the vector index using ChromaDB with cosine distance."
      });
      console.log(`  Status: ${res2.statusCode}, Done: ${res2.body.done}`);
      if (res2.statusCode !== 200 || res2.body.done !== false || !res2.body.reply) {
        throw new Error(`Test 2 Failed: Expected 200 OK with done: false`);
      }
      console.log(`  ✅ Test 2 Passed!\n`);

      // TEST 3: Invalid Request (Missing sessionId & Missing fields)
      console.log(`▶ Test 3: Invalid Request Handlers`);
      const res3a = await makeRequest('/api/interview', 'POST', { message: "Hello" });
      console.log(`  Missing sessionId Status: ${res3a.statusCode}, Error: "${res3a.body.error}"`);
      if (res3a.statusCode !== 400 || !res3a.body.error) {
        throw new Error(`Test 3a Failed: Expected 400 for missing sessionId`);
      }

      const res3b = await makeRequest('/api/interview', 'POST', { sessionId: "sess-empty" });
      console.log(`  Missing candidate/message Status: ${res3b.statusCode}, Error: "${res3b.body.error}"`);
      if (res3b.statusCode !== 400 || !res3b.body.error) {
        throw new Error(`Test 3b Failed: Expected 400 for missing candidate & message`);
      }
      console.log(`  ✅ Test 3 Passed!\n`);

      // TEST 4: Unknown Session Handling
      console.log(`▶ Test 4: Unknown Session Handling`);
      const res4 = await makeRequest('/api/interview', 'POST', {
        sessionId: `unknown-sess-99999`,
        message: "Can I continue?"
      });
      console.log(`  Status: ${res4.statusCode}, Error: "${res4.body.error}"`);
      if (res4.statusCode !== 400 || res4.body.error !== "Unknown sessionId") {
        throw new Error(`Test 4 Failed: Expected 400 with error 'Unknown sessionId'`);
      }
      console.log(`  ✅ Test 4 Passed!\n`);

      // TEST 5: SQLite Session Persistence Check
      console.log(`▶ Test 5: SQLite Session Persistence Verification`);
      const dbSession = await sessionService.getSession(testSessionId);
      if (!dbSession || dbSession.sessionId !== testSessionId || dbSession.status !== 'ACTIVE') {
        throw new Error(`Test 5 Failed: SQLite session persistence verification failed`);
      }
      console.log(`  Retrieved SQLite Candidate ID: ${dbSession.candidateId}`);
      console.log(`  Retrieved SQLite Status: ${dbSession.status}`);
      console.log(`  ✅ Test 5 Passed!\n`);

      // TEST 6: Response Schema Validation & Multi-Turn Completion
      console.log(`▶ Test 6: Response Schema & Multi-Turn Completion`);
      let finalRes = null;
      for (let turn = 2; turn <= 8; turn++) {
        finalRes = await makeRequest('/api/interview', 'POST', {
          sessionId: testSessionId,
          message: `Turn ${turn} response on technical architecture.`
        });
      }

      console.log(`  Final Turn Status: ${finalRes.statusCode}, Done: ${finalRes.body.done}`);
      console.log(`  Feedback Summary: "${finalRes.body.feedback?.summary.substring(0, 60)}..."`);
      
      const fb = finalRes.body.feedback;
      if (!finalRes.body.done || typeof fb?.summary !== 'string' || !Array.isArray(fb?.strengths) || !Array.isArray(fb?.gaps) || !Array.isArray(fb?.next)) {
        throw new Error(`Test 6 Failed: Final response feedback schema invalid`);
      }
      console.log(`  ✅ Test 6 Passed!\n`);

      // TEST 7: Duplicate Session Creation Handling
      console.log(`▶ Test 7: Duplicate Session Creation Handling`);
      const res7 = await makeRequest('/api/interview', 'POST', {
        sessionId: testSessionId,
        candidate: testCandidate
      });
      console.log(`  Status: ${res7.statusCode}, Error: "${res7.body.error}"`);
      if (res7.statusCode !== 400 || res7.body.error !== "Session already exists") {
        throw new Error(`Test 7 Failed: Expected 400 for duplicate session creation`);
      }
      console.log(`  ✅ Test 7 Passed!\n`);

      // TEST 8: Database Restart Persistence Verification
      console.log(`▶ Test 8: Database Restart Persistence Verification`);
      // Close database connection
      await closeDbConnection();
      // Re-open database connection
      getDbConnection();
      
      const restartedSession = await sessionService.getSession(testSessionId);
      if (!restartedSession || restartedSession.sessionId !== testSessionId || restartedSession.status !== 'COMPLETED') {
        throw new Error(`Test 8 Failed: Session data not preserved across database restart`);
      }
      console.log(`  Restart Preserved Status: ${restartedSession.status}`);
      console.log(`  Restart Preserved Turn Count: ${restartedSession.state.currentQuestionNumber}`);
      console.log(`  ✅ Test 8 Passed!\n`);

      console.log(`=================================================`);
      console.log(`🎉 ALL PHASE 4 BACKEND FOUNDATION TESTS PASSED!`);
      console.log(`=================================================\n`);
    } catch (err) {
      console.error(`❌ Verification Failed:`, err);
      process.exitCode = 1;
    } finally {
      server.close();
      await closeDbConnection();
    }
  });
}

runTests();
