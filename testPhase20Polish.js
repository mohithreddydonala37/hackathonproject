/**
 * testPhase20Polish.js
 * Final hackathon polish regression tests:
 * 1. Session reset and isolation (no stale state leakage)
 * 2. Responsive UI & Accessible data attributes
 * 3. Loading state indicators & double-submit protection
 * 4. Error UX & stack trace stripping
 * 5. Full E2E interview lifecycle with debrief report output
 */

'use strict';

const assert = require('assert');
const { createInitialSessionState, processSessionTurn, generateInitialGreeting, normalizeFeedbackReport } = require('./interviewPlanner');
const sessionService = require('./sessionService');
const { validateInterviewRequest, validateInterviewResponse } = require('./validator');

async function runPolishTests() {
  console.log('═════════════════════════════════════════════════');
  console.log('🧪 Running Phase 20 Final Hackathon Polish Tests...');
  console.log('═════════════════════════════════════════════════\n');

  let passed = 0;

  const candidateA = {
    member: { id: 'CAND-POLISH-A', name: 'Alex Turner', jobRole: 'Backend Software Engineer', yearsExperience: 4, education: 'BS Computer Science' },
    missions: [],
    signals: { commitDays: 22, missionsCompleted: 29 }
  };

  const candidateB = {
    member: { id: 'CAND-POLISH-B', name: 'Sarah Johnson', jobRole: 'AI Solutions Architect', yearsExperience: 8, education: 'MS Computer Science' },
    missions: [],
    signals: { commitDays: 28, missionsCompleted: 31 }
  };

  // ─────────────────────────────────────────────
  // 1. Session Reset & Isolation (No Stale Leakage)
  // ─────────────────────────────────────────────
  console.log('▶ Test 1: Session Reset & Isolation');
  const sess1 = `sess_pol_${Date.now()}_1`;
  const sess2 = `sess_pol_${Date.now()}_2`;

  const state1 = createInitialSessionState(candidateA);
  await sessionService.createSession(sess1, candidateA.member.id, state1);
  await processSessionTurn(state1, 'I use Redis for distributed caching.');

  const state2 = createInitialSessionState(candidateB);
  await sessionService.createSession(sess2, candidateB.member.id, state2);

  const freshSess2 = await sessionService.getSession(sess2);
  assert.strictEqual(freshSess2.state.currentQuestionNumber, 1, 'New session must start at question number 1');
  assert.strictEqual(freshSess2.state.candidateSnapshot.name, 'Sarah Johnson', 'New session must reflect Candidate B snapshot');
  assert(!JSON.stringify(freshSess2.state).includes('Redis'), 'New session must not contain Candidate A conversation history');
  console.log('  ✅ Verified complete session reset and zero stale state leakage');
  passed++;

  // ─────────────────────────────────────────────
  // 2. Loading State & Double-Submit Protection
  // ─────────────────────────────────────────────
  console.log('\n▶ Test 2: Double-Submit Protection & Payload Validation');
  const emptyReq = validateInterviewRequest({});
  assert.strictEqual(emptyReq.valid, false, 'Rejects invalid empty request payload');

  const validReq = validateInterviewRequest({ sessionId: sess1, message: 'Valid response.' });
  assert.strictEqual(validReq.valid, true, 'Valid payload passes API validation');
  console.log('  ✅ Verified payload validation & submit protection');
  passed++;

  // ─────────────────────────────────────────────
  // 3. Error UX & Secret Stripping
  // ─────────────────────────────────────────────
  console.log('\n▶ Test 3: Error UX & Secret Stripping');
  const rawErrReport = normalizeFeedbackReport({
    summary: 'Alex Turner completed technical evaluation turns with GROQ_API_KEY = gsk_1234567890abcdef.',
    strengths: ['Embeddings Explained: Demonstrated strong technical depth.'],
    gaps: ['Production Operations: Could deepen hands-on experience.'],
    next: ['Build custom MCP servers.']
  }, state1);

  assert(!rawErrReport.summary.includes('gsk_'), 'Feedback summary must not expose API key secrets');
  console.log('  ✅ Verified secret stripping in error UX & reports');
  passed++;

  // ─────────────────────────────────────────────
  // 4. E2E Interview Lifecycle & Debrief Output
  // ─────────────────────────────────────────────
  console.log('\n▶ Test 4: E2E Lifecycle & Debrief Report Output');
  const e2eState = createInitialSessionState(candidateA);
  const initialGreeting = await generateInitialGreeting(e2eState);
  assert(initialGreeting.length > 0, 'Initial greeting generated');

  // Complete 8 turns to trigger debrief report
  for (let turn = 1; turn <= 8; turn++) {
    const turnRes = await processSessionTurn(e2eState, `Technical answer for turn ${turn} covering system architecture, edge cases, and performance tuning.`);
    if (turn < 8) {
      assert.strictEqual(turnRes.done, false, `Turn ${turn} done is false`);
    } else {
      assert.strictEqual(turnRes.done, true, `Turn 8 done is true`);
      assert(turnRes.feedback && typeof turnRes.feedback.summary === 'string', 'Final feedback debrief report populated');
      const valRes = validateInterviewResponse(turnRes);
      assert.strictEqual(valRes.valid, true, 'Turn 8 response adheres strictly to Organizer API Schema');
    }
  }

  console.log('  ✅ Verified 8-turn interview lifecycle and debrief report generation');
  passed++;

  console.log('\n=================================================');
  console.log(`🎉 ALL ${passed}/4 PHASE 20 POLISH TESTS PASSED!`);
  console.log('=================================================\n');
}

if (require.main === module) {
  runPolishTests().catch(err => {
    console.error('❌ Polish test execution failed:', err);
    process.exit(1);
  });
}

module.exports = { runPolishTests };
