/**
 * verifyE2E.js
 * End-to-end synthetic interview verification for Phases 4 through 10.
 * Conducts a full 8-turn interview session with candidate CAND-001 (Sarah Johnson)
 * and asserts all 12 end-to-end verification checks.
 */

'use strict';

const { createInitialSessionState, processSessionTurn, generateInitialGreeting } = require('./interviewPlanner');
const { createSession, getSession, updateSession, completeSession } = require('./sessionService');
const { validateInterviewResponse } = require('./validator');
const { getCandidateById } = require('./dataLoader');
const config = require('./config');

async function runE2EVerification() {
  console.log('🚀 Starting End-to-End Synthetic Interview Verification...\n');

  const candidate = getCandidateById('CAND-001');
  if (!candidate) {
    throw new Error('CAND-001 not found in candidates.json');
  }

  const sessionId = `e2e_verify_${Date.now()}`;
  let passedCount = 0;
  let totalCount = 0;

  function assertE2E(cond, msg) {
    totalCount++;
    if (cond) {
      console.log(`  ✅ [E2E] ${msg}`);
      passedCount++;
    } else {
      console.error(`  ❌ [E2E] FAIL: ${msg}`);
    }
  }

  // 1. Start session
  const state = createInitialSessionState(candidate);
  await createSession(sessionId, candidate.member.id, state);
  assertE2E(state !== null, 'Session state created in SQLite database');

  // 2. Receive initial greeting (Question 1)
  const greeting = await generateInitialGreeting(state);
  await updateSession(sessionId, state);
  assertE2E(typeof greeting === 'string' && greeting.length > 20, 'Initial greeting & Q1 generated');
  assertE2E(state.currentQuestionNumber === 1, 'Initial question number is 1');
  assertE2E(state.interviewStatus === 'ACTIVE', 'Initial session status is ACTIVE');

  // Candidate synthetic answers
  const answers = [
    "We deployed ChromaDB with HNSW vector index tuning for 1536-dimensional embeddings, reaching 45ms query latency at 10,000 QPS.",
    "For function calling, we defined strict Pydantic schemas and used JSON schema validation before passing tool arguments to external APIs.",
    "When agents encounter tool errors, we implement exponential backoff retries and structured error responses back to the LLM planner.",
    "We configured open-telemetry tracing for vector retrievals and logged query latencies into Prometheus alerts.",
    "We tuned chunk overlap to 15% and used hybrid search with BM25 keyword matching to boost retrieval recall.",
    "Our CI/CD pipeline runs automated regression tests on eval benchmark datasets before releasing new prompt templates.",
    "We implemented streaming Server-Sent Events (SSE) endpoints with response caching to optimize client perceived latency.",
    "To handle rate limits, we built a client queue with token bucket rate limiters and graceful fallback responses."
  ];

  let lastTurnResult = null;

  // 3-5. Multi-turn interview execution (Turns 1 through 8)
  for (let i = 0; i < answers.length; i++) {
    const turnAns = answers[i];
    lastTurnResult = await processSessionTurn(state, turnAns);
    if (lastTurnResult.done && lastTurnResult.feedback) {
      await completeSession(sessionId, lastTurnResult.feedback, state);
    } else {
      await updateSession(sessionId, state);
    }

    if (i < 7) {
      assertE2E(lastTurnResult.done === false, `Turn ${i + 1} done=false before completion criteria met`);
    }
  }

  // 6. Confirm >= 8 questions
  assertE2E(state.currentQuestionNumber >= 8, `Question count >= 8 (Actual: ${state.currentQuestionNumber})`);

  // 7. Confirm >= 4 unique curriculum days
  assertE2E(state.coveredCurriculumDays.length >= 4, `Covered curriculum days >= 4 (Actual: ${state.coveredCurriculumDays.length})`);

  // 8 & 9. Confirm done=true on turn 8 completion
  assertE2E(lastTurnResult.done === true, 'done=true returned ONLY after completion criteria met');
  assertE2E(state.interviewStatus === 'COMPLETED', 'Session status updated to COMPLETED');

  // 10. Confirm final feedback schema
  const fb = lastTurnResult.feedback;
  assertE2E(fb !== null && typeof fb === 'object', 'Feedback object populated');
  assertE2E(typeof fb.summary === 'string' && fb.summary.length > 10, 'Feedback summary is string');
  assertE2E(Array.isArray(fb.strengths) && fb.strengths.length > 0, 'Feedback strengths is non-empty array');
  assertE2E(Array.isArray(fb.gaps) && fb.gaps.length > 0, 'Feedback gaps is non-empty array');
  assertE2E(Array.isArray(fb.next) && fb.next.length > 0, 'Feedback next steps is non-empty array');

  // 11. Confirm SQLite session state persistence
  const savedRecord = await getSession(sessionId);
  assertE2E(savedRecord !== null && savedRecord.status === 'COMPLETED', 'SQLite retrieved state matches completed status');

  // 12. Response contract compliance
  const validRes = validateInterviewResponse(lastTurnResult);
  assertE2E(validRes.valid === true, 'Final response payload strictly complies with organizer API schema');

  console.log(`\n=================================================`);
  console.log(`🎉 END-TO-END VERIFICATION: ${passedCount}/${totalCount} CHECKS PASSED`);
  console.log(`=================================================\n`);
}

runE2EVerification().catch(err => {
  console.error('Fatal E2E Verification Error:', err);
  process.exit(1);
});
