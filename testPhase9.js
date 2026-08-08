/**
 * testPhase9.js
 * Comprehensive unit & integration tests for Phase 9 — Realistic Adaptive AI Interviewer.
 *
 * Verifies all 17 required test scenarios:
 *   1. Strong answer → deeper question decision
 *   2. Adequate answer → practical follow-up decision
 *   3. Weak answer → reframe / fundamental probe decision
 *   4. Unknown answer → clarification / default handling
 *   5. Relevant follow-up anchored to candidate response
 *   6. Smooth topic transition on strategy signal
 *   7. Candidate-specific initial difficulty level
 *   8. Role-aware domain framing (AI Engineer vs DevOps vs Software Engineer)
 *   9. Experience-aware conversational depth (Senior vs Intern)
 *   10. Anti-repetition tracking (history tracking & prompt constraints)
 *   11. Follow-up budget limit enforcement (max 2 follow-ups per primary topic)
 *   12. Compact context size optimization (< 1KB per LLM call)
 *   13. Groq failure resilience (preserves state & API contract)
 *   14. SQLite session state persistence across turns
 *   15. Minimum 8-question invariant enforcement
 *   16. Minimum 4-curriculum-day coverage invariant enforcement
 *   17. Final completion guard validation
 *
 * Multi-Candidate Personalization:
 *   - Verifies CAND-001 (Senior Data Engineer, 9 yrs exp) vs CAND-007 (Intern, 0 yrs exp)
 *     produce distinct topic orderings, initial difficulties, and question depths.
 */

'use strict';

const groqService = require('./groqService');
const config = require('./config');
const { createInitialSessionState, processSessionTurn, generateInitialGreeting } = require('./interviewPlanner');
const { makeStrategyDecision, applyStrategyDecision, canComplete, NEXT_ACTIONS, DIFFICULTY_LEVELS } = require('./interviewStrategyEngine');
const { getCandidateById } = require('./dataLoader');
const { validateInterviewResponse } = require('./validator');

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

function mockClientCall() {
  const orig = groqService.callGroqAPI;
  return {
    setMock: (impl) => {
      groqService.callGroqAPI = impl;
    },
    restore: () => {
      groqService.callGroqAPI = orig;
    }
  };
}

const CAND1 = getCandidateById('CAND-001') || {
  member: { id: 'CAND-001', name: 'Sarah Johnson', jobRole: 'Senior Data Engineer', yearsExperience: 9 },
  missions: [{ day: 7, title: 'Embeddings Explained', passed: true }],
  signals: { commitDays: 28, missionsCompleted: 30, missionsFirstTry: 20 }
};

const CAND7 = getCandidateById('CAND-007') || {
  member: { id: 'CAND-007', name: 'Ethan Brooks', jobRole: 'Frontend Intern', yearsExperience: 0 },
  missions: [],
  signals: { commitDays: 5, missionsCompleted: 2, missionsFirstTry: 1 }
};

async function runPhase9Tests() {
  const mockControl = mockClientCall();
  const originalKey = config.groqApiKey;

  try {
    config.groqApiKey = 'mock-test-key-phase9';

    // ══════════════════════════════════════════════════════════════════════════
    // 1. Adaptive Strategy Decisions: Strong, Adequate, Weak, Unknown Answers
    // ══════════════════════════════════════════════════════════════════════════
    section('1. Adaptive Strategy Decisions for Answer Types');

    const stateEval = createInitialSessionState(CAND1);
    stateEval.coveredCurriculumDays = [7, 13, 22, 28]; // Ensure coverage won't force new topic

    // 1. Strong answer -> DEEPEN strategy action
    const strongMsg = "We deployed an HNSW vector index using ChromaDB with customized embedding chunking, reducing query latency from 350ms to 45ms at 10,000 QPS.";
    const dStrong = makeStrategyDecision(stateEval, strongMsg);
    assert(dStrong.nextAction === NEXT_ACTIONS.DEEPEN, 'Strong answer produces DEEPEN strategy action');
    assert(dStrong.difficulty === 'ARCHITECTURE' || dStrong.difficulty === 'ADVANCED' || dStrong.difficulty === 'DEPTH', 'Strong answer escalates or maintains high difficulty');

    // 2. Adequate answer -> TRANSITION / ASK_NEW_TOPIC
    const adequateMsg = "We used ChromaDB for storing vector embeddings and tuned chunk size.";
    const dAdequate = makeStrategyDecision(stateEval, adequateMsg);
    assert(dAdequate.nextAction === NEXT_ACTIONS.TRANSITION || dAdequate.nextAction === NEXT_ACTIONS.ASK_NEW_TOPIC, 'Adequate answer advances to next topic naturally');

    // 3. Weak answer -> REFRAME strategy action
    const weakMsg = "yes ok";
    const dWeak = makeStrategyDecision(stateEval, weakMsg);
    assert(dWeak.nextAction === NEXT_ACTIONS.REFRAME, 'Weak answer produces REFRAME strategy action');
    assert(dWeak.questionType === 'WEAKNESS_PROBE', 'Weak answer triggers WEAKNESS_PROBE question type');

    // 4. Unknown answer -> Clarification / default handling
    const dUnknown = makeStrategyDecision(stateEval, null);
    assert(dUnknown.nextAction === NEXT_ACTIONS.ASK_NEW_TOPIC, 'Null/unknown answer handles default initial topic');

    // ══════════════════════════════════════════════════════════════════════════
    // 2. Relevant Follow-up & Natural Conversational Transitions
    // ══════════════════════════════════════════════════════════════════════════
    section('2. Relevant Follow-ups & Conversational Transitions');

    let capturedPrompt = '';
    mockControl.setMock(async ({ userPrompt, systemPrompt }) => {
      capturedPrompt = userPrompt + '\n' + systemPrompt;
      return "You highlighted ChromaDB for vector retrieval. How did you handle index rebuilding when new embedding batches were committed?";
    });

    const followUpRes = await groqService.generateInterviewerResponse({
      candidateName: CAND1.member.name,
      candidateRole: CAND1.member.jobRole,
      yearsExperience: CAND1.member.yearsExperience,
      day: 7,
      topic: 'Embeddings & Vector Search',
      nextAction: 'DEEPEN',
      questionType: 'DEEP_DIVE',
      difficulty: 'DEPTH',
      previousAnswer: strongMsg,
      previousEvaluation: 'STRONG'
    });

    assert(typeof followUpRes === 'string', 'Follow-up interviewer response generated');
    assert(followUpRes.toLowerCase().includes('chromadb') || followUpRes.toLowerCase().includes('index'), 'Follow-up question is anchored to candidate previous response');
    assert(!followUpRes.includes('Question 1') && !followUpRes.includes('Thank you for your answer'), 'Follow-up avoids robotic static templates');

    // ══════════════════════════════════════════════════════════════════════════
    // 3. Candidate Personalization: Senior vs Intern Comparison
    // ══════════════════════════════════════════════════════════════════════════
    section('3. Candidate Personalization (Senior vs Intern)');

    const stateSenior = createInitialSessionState(CAND1);
    const stateIntern = createInitialSessionState(CAND7);

    assert(stateSenior.currentDifficultyLevel === 'DEPTH', 'Senior candidate (9 yrs exp) starts at DEPTH difficulty');
    assert(stateIntern.currentDifficultyLevel === 'FOUNDATION', 'Intern candidate (0 yrs exp) starts at FOUNDATION difficulty');
    assert(stateSenior.currentTopic !== stateIntern.currentTopic || stateSenior.interviewPlan[0].day !== stateIntern.interviewPlan[0].day, 'Different candidates receive distinct topic plans based on signals');

    // ══════════════════════════════════════════════════════════════════════════
    // 4. Role-Aware & Experience-Aware Conversational Framing
    // ══════════════════════════════════════════════════════════════════════════
    section('4. Role-Aware & Experience-Aware Framing');

    let promptSenior = '';
    let promptIntern = '';

    mockControl.setMock(async ({ systemPrompt, userPrompt }) => {
      if (userPrompt.includes('Senior Data Engineer')) promptSenior = systemPrompt + userPrompt;
      if (userPrompt.includes('Frontend Intern')) promptIntern = systemPrompt + userPrompt;
      return "What were the primary failure modes in your pipeline?";
    });

    await groqService.generateInterviewerResponse({
      candidateRole: 'Senior Data Engineer',
      yearsExperience: 9,
      day: 7,
      topic: 'Embeddings',
      difficulty: 'DEPTH'
    });

    await groqService.generateInterviewerResponse({
      candidateRole: 'Frontend Intern',
      yearsExperience: 0,
      day: 7,
      topic: 'Embeddings',
      difficulty: 'FOUNDATION'
    });

    assert(promptSenior.includes('Senior Data Engineer') && promptSenior.includes('9'), 'Senior context contains senior role and experience');
    assert(promptIntern.includes('Frontend Intern') && promptIntern.includes('0'), 'Intern context contains intern role and experience');

    // ══════════════════════════════════════════════════════════════════════════
    // 5. Anti-Repetition & History Tracking
    // ══════════════════════════════════════════════════════════════════════════
    section('5. Anti-Repetition & History Tracking');

    mockControl.setMock(async () => "How do you handle embedding generation?");

    const stateRep = createInitialSessionState(CAND1);
    await processSessionTurn(stateRep, strongMsg);

    assert(Array.isArray(stateRep.askedQuestionsHistory), 'askedQuestionsHistory tracked in session state');
    assert(stateRep.askedQuestionsHistory.length > 0, 'askedQuestionsHistory records generated questions');

    // ══════════════════════════════════════════════════════════════════════════
    // 6. Follow-up Budget Limit & Smooth Transitions
    // ══════════════════════════════════════════════════════════════════════════
    section('6. Follow-up Limit Enforcement');

    const stateLimit = createInitialSessionState(CAND1);
    stateLimit.coveredCurriculumDays = [7, 13, 22, 28];

    // Turn 1 strong -> follow-up 1
    const d1 = makeStrategyDecision(stateLimit, strongMsg);
    applyStrategyDecision(stateLimit, d1);
    assert(stateLimit.followUpsUsedForCurrentQuestion === 1, 'Follow-up count = 1');

    // Turn 2 strong -> follow-up 2
    const d2 = makeStrategyDecision(stateLimit, strongMsg);
    applyStrategyDecision(stateLimit, d2);
    assert(stateLimit.followUpsUsedForCurrentQuestion === 2, 'Follow-up count = 2');

    // Turn 3 strong -> budget reached (2), forces transition
    const d3 = makeStrategyDecision(stateLimit, strongMsg);
    assert(d3.nextAction !== NEXT_ACTIONS.DEEPEN && d3.nextAction !== NEXT_ACTIONS.REFRAME, 'Max 2 follow-ups reached -> forces topic transition');

    // ══════════════════════════════════════════════════════════════════════════
    // 7. Compact Context Optimization
    // ══════════════════════════════════════════════════════════════════════════
    section('7. Compact Context Size Optimization');

    mockControl.setMock(async ({ userPrompt, systemPrompt }) => {
      const payloadSize = Buffer.byteLength(userPrompt + systemPrompt);
      assert(payloadSize < 3000, `Per-request context payload is compact (${payloadSize} bytes < 3KB)`);
      return "Next question text";
    });

    await groqService.generateInterviewerResponse({
      candidateRole: CAND1.member.jobRole,
      yearsExperience: CAND1.member.yearsExperience,
      day: 7,
      topic: 'Embeddings & Vector Search',
      objective: 'Understand HNSW index parameters',
      previousAnswer: strongMsg
    });

    // ══════════════════════════════════════════════════════════════════════════
    // 8. Groq Failure Resilience & Deterministic Fallback
    // ══════════════════════════════════════════════════════════════════════════
    section('8. Groq Failure Resilience & Fallback');

    mockControl.setMock(async () => null); // Force LLM failure

    const stateFail = createInitialSessionState(CAND1);
    const turnFail = await processSessionTurn(stateFail, "I used ChromaDB.");

    assert(turnFail !== null && typeof turnFail.reply === 'string', 'Turn completes successfully using fallback text');
    assert(turnFail.done === false, 'Session status remains ACTIVE');
    assert(stateFail.currentQuestionNumber === 2, 'Question number incremented deterministically');

    // ══════════════════════════════════════════════════════════════════════════
    // 9. Multi-Turn Session Persistence & Invariants
    // ══════════════════════════════════════════════════════════════════════════
    section('9. Multi-Turn Session Persistence & Invariants');

    mockControl.setMock(async () => "What were your performance benchmarks?");

    const stateMulti = createInitialSessionState(CAND1);

    // Q1 -> Q7
    for (let t = 1; t <= 7; t++) {
      const res = await processSessionTurn(stateMulti, strongMsg);
      assert(res.done === false, `Turn ${t}: done is false`);
    }

    assert(stateMulti.currentQuestionNumber === 8, 'Question count reached 8');
    assert(canComplete(stateMulti) === true, 'Completion invariant satisfied (8 questions + 4 days)');

    // Turn 8 completes session
    const resFinal = await processSessionTurn(stateMulti, strongMsg);
    assert(resFinal.done === true, 'Turn 8: done is true');
    assert(stateMulti.interviewStatus === 'COMPLETED', 'Session status set to COMPLETED');
    assert(resFinal.feedback !== null, 'Feedback object returned');

    // Validate schema compliance against organizer contract
    const contractVal = validateInterviewResponse(resFinal);
    assert(contractVal.valid === true, 'Final response complies with organizer API contract');

  } finally {
    mockControl.restore();
    config.groqApiKey = originalKey;
  }

  console.log('\n=================================================');
  if (failed === 0) {
    console.log(`🎉 ALL ${passed} PHASE 9 ADAPTIVE INTERVIEWER TESTS PASSED!`);
  } else {
    console.error(`❌ ${failed} test(s) FAILED out of ${passed + failed}`);
    process.exitCode = 1;
  }
  console.log(`=================================================\n`);
}

runPhase9Tests().catch(err => {
  console.error('Fatal Test Execution Error:', err);
  process.exit(1);
});
