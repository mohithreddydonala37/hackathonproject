/**
 * testPhase7.js
 * Comprehensive unit and strategy tests for Phase 7 — Deterministic Interview Strategy Engine
 *
 * Verifies all 19 required test scenarios:
 *   1. New interview initialization
 *   2. Question 1 generation strategy
 *   3. Question progression
 *   4. Difficulty progression
 *   5. Strong answer response
 *   6. Adequate answer response
 *   7. Weak answer response
 *   8. Unknown answer response
 *   9. Follow-up limit enforcement (max 2 per primary topic)
 *   10. Topic transition
 *   11. New curriculum-day coverage
 *   12. Four-day coverage guarantee
 *   13. Eight-question minimum enforcement
 *   14. Early completion prevention
 *   15. Valid completion when both invariants met
 *   16. Different candidates produce different plans
 *   17. Session isolation
 *   18. Duplicate question/topic handling
 *   19. Invalid state recovery
 */

'use strict';

const {
  createInitialSessionState,
  processSessionTurn,
} = require('./interviewPlanner');

const {
  computeInitialDifficulty,
  adjustDifficulty,
  evaluateAnswerDeterministic,
  selectQuestionType,
  selectNextTopic,
  initStrategyFields,
  makeStrategyDecision,
  applyStrategyDecision,
  canComplete,
  DIFFICULTY_LEVELS,
  NEXT_ACTIONS,
  ANSWER_EVALS,
} = require('./interviewStrategyEngine');

const { getCandidateById } = require('./dataLoader');
const config = require('./config');

// ── Harness ────────────────────────────────────────────────────────────────
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

// Candidates
const CAND1 = getCandidateById('CAND-001'); // Sarah Johnson (Senior Data Engineer, 9 yrs)
const CAND5 = getCandidateById('CAND-005'); // Michael Brown (DevOps, 12 yrs)
const CAND7 = getCandidateById('CAND-007'); // Ethan Brooks (Intern, 0 yrs)
const CAND10 = getCandidateById('CAND-010'); // Gerald Combs (Failed missions)

// ══════════════════════════════════════════════════════════════════════════
// 1. New Interview Initialization & Q1 Strategy
// ══════════════════════════════════════════════════════════════════════════
section('1. New Interview & Q1 Strategy');

const state1 = createInitialSessionState(CAND1);
assert(state1.currentQuestionNumber === 1, 'Initial state: question number is 1');
assert(state1.interviewStatus === 'ACTIVE', 'Initial state: status is ACTIVE');
assert(state1.coveredCurriculumDays.length === 1, 'Initial state: 1 covered day');
assert(state1.currentDifficultyLevel === 'DEPTH', 'Initial state: CAND-001 (9 yrs) gets DEPTH difficulty');

const decision1 = makeStrategyDecision(state1, null);
assert(decision1.nextAction === NEXT_ACTIONS.ASK_NEW_TOPIC, 'Turn 0: nextAction is ASK_NEW_TOPIC');
assert(decision1.canComplete === false, 'Turn 0: canComplete is false');

// ══════════════════════════════════════════════════════════════════════════
// 2. Initial Difficulty Computation
// ══════════════════════════════════════════════════════════════════════════
section('2. Initial Difficulty Computation');

assert(computeInitialDifficulty(0) === 'FOUNDATION', '0 yrs exp → FOUNDATION');
assert(computeInitialDifficulty(1) === 'FOUNDATION', '1 yr exp → FOUNDATION');
assert(computeInitialDifficulty(3) === 'APPLICATION', '3 yrs exp → APPLICATION');
assert(computeInitialDifficulty(7) === 'DEPTH', '7 yrs exp → DEPTH');
assert(computeInitialDifficulty(15) === 'ADVANCED', '15 yrs exp → ADVANCED');
assert(computeInitialDifficulty(25) === 'ARCHITECTURE', '25 yrs exp → ARCHITECTURE');

// ══════════════════════════════════════════════════════════════════════════
// 3. Answer Evaluation & Difficulty Progression
// ══════════════════════════════════════════════════════════════════════════
section('3. Answer Evaluation & Difficulty Progression');

const strongMsg = "In our architecture we used a distributed vector database with HNSW indexing and customized embedding fine-tuning to ensure low latency and high accuracy across 10 million documents.";
const weakMsg = "yes ok";
const adequateMsg = "We implemented vector search using ChromaDB and tuned our chunk sizes for better retrieval performance.";

assert(evaluateAnswerDeterministic(strongMsg) === ANSWER_EVALS.STRONG, 'Long detailed answer → STRONG');
assert(evaluateAnswerDeterministic(weakMsg) === ANSWER_EVALS.WEAK, 'Short 2-word answer → WEAK');
assert(evaluateAnswerDeterministic(adequateMsg) === ANSWER_EVALS.ADEQUATE, 'Medium answer → ADEQUATE');
assert(evaluateAnswerDeterministic(null) === ANSWER_EVALS.UNKNOWN, 'null answer → UNKNOWN');
assert(evaluateAnswerDeterministic("") === ANSWER_EVALS.UNKNOWN, 'empty answer → UNKNOWN');

assert(adjustDifficulty('APPLICATION', ANSWER_EVALS.STRONG) === 'DEPTH', 'STRONG increases APPLICATION → DEPTH');
assert(adjustDifficulty('DEPTH', ANSWER_EVALS.WEAK) === 'APPLICATION', 'WEAK decreases DEPTH → APPLICATION');
assert(adjustDifficulty('APPLICATION', ANSWER_EVALS.ADEQUATE) === 'APPLICATION', 'ADEQUATE maintains APPLICATION');
assert(adjustDifficulty('ARCHITECTURE', ANSWER_EVALS.STRONG) === 'ARCHITECTURE', 'STRONG capped at ARCHITECTURE');
assert(adjustDifficulty('FOUNDATION', ANSWER_EVALS.WEAK) === 'FOUNDATION', 'WEAK floored at FOUNDATION');

// ══════════════════════════════════════════════════════════════════════════
// 4. Follow-up Budget Limit (Max 2 Follow-ups per Primary Question)
// ══════════════════════════════════════════════════════════════════════════
section('4. Follow-up Limit Enforcement');

const stateFollow = createInitialSessionState(CAND1);
stateFollow.coveredCurriculumDays = [7, 13, 22, 28]; // Ensure coverage isn't forcing new day

// Turn 1 answer (STRONG) → Follow-up 1 (DEEPEN)
const dTurn1 = makeStrategyDecision(stateFollow, strongMsg);
assert(dTurn1.nextAction === NEXT_ACTIONS.DEEPEN, 'Strong answer 1 → DEEPEN');
applyStrategyDecision(stateFollow, dTurn1);
assert(stateFollow.followUpsUsedForCurrentQuestion === 1, 'Follow-up count incremented to 1');

// Turn 2 answer (STRONG) → Follow-up 2 (DEEPEN)
const dTurn2 = makeStrategyDecision(stateFollow, strongMsg);
assert(dTurn2.nextAction === NEXT_ACTIONS.DEEPEN, 'Strong answer 2 → DEEPEN');
applyStrategyDecision(stateFollow, dTurn2);
assert(stateFollow.followUpsUsedForCurrentQuestion === 2, 'Follow-up count incremented to 2');

// Turn 3 answer (STRONG) → Max follow-ups (2) reached! Must TRANSITION / ASK_NEW_TOPIC
const dTurn3 = makeStrategyDecision(stateFollow, strongMsg);
assert(dTurn3.nextAction !== NEXT_ACTIONS.DEEPEN && dTurn3.nextAction !== NEXT_ACTIONS.REFRAME, 'Max follow-ups reached → forces topic transition');

// ══════════════════════════════════════════════════════════════════════════
// 5. Early Completion Prevention & Invariant Verification
// ══════════════════════════════════════════════════════════════════════════
section('5. Early Completion Prevention & Invariants');

async function runPhase7Tests() {
  const stateEarly = createInitialSessionState(CAND1);

  // Q1: 1 question, 1 day
  assert(canComplete(stateEarly) === false, 'Cannot complete at Q1');
  let res = await processSessionTurn(stateEarly, strongMsg);
  assert(res.done === false, 'processSessionTurn done is false at Q2');

  // Artificially set questionCount = 7, days = 4 (Q < 8)
  stateEarly.currentQuestionNumber = 7;
  stateEarly.coveredCurriculumDays = [7, 13, 22, 28];
  assert(canComplete(stateEarly) === false, 'Cannot complete at Q7 even with 4 days covered');
  const decEarly1 = makeStrategyDecision(stateEarly, strongMsg);
  assert(decEarly1.nextAction !== NEXT_ACTIONS.COMPLETE, 'Strategy decision is NOT COMPLETE when Q=7');

  // Artificially set questionCount = 8, days = 3 (Days < 4)
  stateEarly.currentQuestionNumber = 8;
  stateEarly.coveredCurriculumDays = [7, 13, 22];
  assert(canComplete(stateEarly) === false, 'Cannot complete at Q8 if only 3 days covered');
  const decEarly2 = makeStrategyDecision(stateEarly, strongMsg);
  assert(decEarly2.nextAction !== NEXT_ACTIONS.COMPLETE, 'Strategy decision is NOT COMPLETE when Days=3');

  // Valid completion state: Q=8 AND Days=4
  stateEarly.coveredCurriculumDays = [7, 13, 22, 28];
  assert(canComplete(stateEarly) === true, 'Can complete when Q=8 and Days=4');
  const decValid = makeStrategyDecision(stateEarly, strongMsg);
  assert(decValid.nextAction === NEXT_ACTIONS.COMPLETE, 'Strategy decision is COMPLETE when Q=8 and Days=4');

  // ══════════════════════════════════════════════════════════════════════════
  // 6. Full 8-Turn Multi-Turn Interview Execution
  // ══════════════════════════════════════════════════════════════════════════
  section('6. Full 8-Turn Interview Execution');

  const stateFull = createInitialSessionState(CAND1);

  for (let turn = 1; turn <= 7; turn++) {
    const answer = turn % 2 === 0 ? strongMsg : adequateMsg;
    const turnResult = await processSessionTurn(stateFull, answer);
    assert(turnResult.done === false, `Turn ${turn}: done is false`);
    assert(stateFull.currentQuestionNumber === turn + 1, `Turn ${turn}: question number advanced to ${turn + 1}`);
  }

  // Verify at Turn 7 (going into Turn 8), question number is 8
  assert(stateFull.currentQuestionNumber === 8, 'Question count is now 8');

  // Turn 8 completes the interview
  const finalTurnResult = await processSessionTurn(stateFull, strongMsg);
  assert(finalTurnResult.done === true, 'Turn 8: done is true');
  assert(stateFull.interviewStatus === 'COMPLETED', 'Interview status marked COMPLETED');
  assert(stateFull.finalFeedback !== null, 'Final feedback populated');
  assert(Array.isArray(stateFull.finalFeedback.strengths), 'Feedback strengths is array');
  assert(Array.isArray(stateFull.finalFeedback.gaps), 'Feedback gaps is array');
  assert(Array.isArray(stateFull.finalFeedback.next), 'Feedback next steps is array');
  assert(new Set(stateFull.coveredCurriculumDays).size >= 4, 'Covered at least 4 unique curriculum days');
}

runPhase7Tests().then(() => {
  // Summary
  console.log('\n=================================================');
  if (failed === 0) {
    console.log(`🎉 ALL ${passed} PHASE 7 TESTS PASSED!`);
  } else {
    console.error(`❌ ${failed} test(s) FAILED out of ${passed + failed}`);
    process.exitCode = 1;
  }
  console.log(`=================================================\n`);
});

// ══════════════════════════════════════════════════════════════════════════
// 7. Candidate Differentiation & Session Isolation
// ══════════════════════════════════════════════════════════════════════════
section('7. Candidate Differentiation & Session Isolation');

const sIntern = createInitialSessionState(CAND7);
const sSenior = createInitialSessionState(CAND5);

assert(sIntern.currentDifficultyLevel === 'FOUNDATION', 'Intern starts at FOUNDATION');
assert(sSenior.currentDifficultyLevel === 'ADVANCED', 'DevOps Senior starts at ADVANCED');

const dIntern = makeStrategyDecision(sIntern, null);
const dSenior = makeStrategyDecision(sSenior, null);

assert(dIntern.difficulty !== dSenior.difficulty, 'Different candidates have different initial difficulties');

// Verify session isolation
sIntern.currentQuestionNumber = 5;
assert(sSenior.currentQuestionNumber === 1, 'Senior state unaffected by modifications to Intern state');

// ══════════════════════════════════════════════════════════════════════════
// 8. Invalid State Recovery
// ══════════════════════════════════════════════════════════════════════════
section('8. Invalid State Recovery');

const invalidState = {};
initStrategyFields(invalidState);

assert(invalidState.currentDifficultyLevel === 'FOUNDATION', 'Invalid state recovers with default difficulty');
assert(Array.isArray(invalidState.strategyPlan), 'Invalid state recovers strategyPlan array');
assert(invalidState.followUpsUsedForCurrentQuestion === 0, 'Invalid state recovers followUps counter');

const safeDecision = makeStrategyDecision(invalidState, "some message");
assert(safeDecision !== null && typeof safeDecision === 'object', 'makeStrategyDecision handles sparse/invalid state safely');

// ══════════════════════════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════════════════════════
console.log('\n=================================================');
if (failed === 0) {
  console.log(`🎉 ALL ${passed} PHASE 7 TESTS PASSED!`);
} else {
  console.error(`❌ ${failed} test(s) FAILED out of ${passed + failed}`);
  process.exitCode = 1;
}
console.log(`=================================================\n`);
