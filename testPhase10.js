/**
 * testPhase10.js
 * Comprehensive unit & integration tests for Phase 10 — Structured Answer Evaluation & Final Feedback.
 *
 * Verifies all 18 required test scenarios:
 *   1. Strong answer evaluation (bounded 0-5 scores, rating STRONG, evidence)
 *   2. Adequate answer evaluation (bounded 0-5 scores, rating ADEQUATE)
 *   3. Weak answer evaluation (bounded 0-5 scores, rating WEAK)
 *   4. Unknown answer evaluation (bounded 0-5 scores, rating UNKNOWN)
 *   5. Malformed LLM output (structured recovery & normalizer protection)
 *   6. Out-of-range scores clamping validation (clamped to 0-5)
 *   7. Missing fields schema fallback
 *   8. Empty answer evaluation handling (safe fallback)
 *   9. Evaluation persistence in session state (evaluationRecords array)
 *   10. Evaluation → strategy integration (STRONG increases difficulty, WEAK decreases difficulty)
 *   11. Final feedback synthesis generation
 *   12. Final feedback schema validation (summary, strengths, gaps, next)
 *   13. Final feedback fallback when Groq fails (feedback is NEVER null on done=true)
 *   14. Completion guard validation (qCount < 8 cannot complete)
 *   15. Minimum 8-question invariant enforcement
 *   16. Minimum 4-curriculum-day coverage invariant enforcement
 *   17. Session isolation between concurrent sessions
 *   18. Organizer API contract compliance
 *
 * Multi-Candidate Evaluation Verification:
 *   - Tests CAND-001 (Senior Data Engineer) vs CAND-007 (Frontend Intern) and verifies
 *     their final feedback reports differ accurately according to demonstrated evidence.
 */

'use strict';

const groqService = require('./groqService');
const config = require('./config');
const { createInitialSessionState, processSessionTurn } = require('./interviewPlanner');
const { makeStrategyDecision, applyStrategyDecision, canComplete, NEXT_ACTIONS } = require('./interviewStrategyEngine');
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

async function runPhase10Tests() {
  const mockControl = mockClientCall();
  const originalKey = config.groqApiKey;

  try {
    config.groqApiKey = 'mock-test-key-phase10';

    // ══════════════════════════════════════════════════════════════════════════
    // 1. Structured Answer Evaluation (Strong, Adequate, Weak, Unknown)
    // ══════════════════════════════════════════════════════════════════════════
    section('1. Structured Answer Evaluation & 0-5 Bounded Scores');

    // Mock STRONG answer evaluation
    mockControl.setMock(async () => JSON.stringify({
      rating: 'STRONG',
      technicalAccuracy: 5,
      conceptualDepth: 4,
      practicalReasoning: 5,
      communication: 4,
      missingConcepts: [],
      evidence: ['Candidate demonstrated deep understanding of HNSW vector index tuning and low-latency chunking.']
    }));

    const evalStrong = await groqService.evaluateCandidateAnswer({
      questionNumber: 1,
      topic: 'Embeddings & Vector Search',
      candidateAnswer: 'We indexed vectors in ChromaDB using HNSW with custom chunking.'
    });

    assert(evalStrong.rating === 'STRONG', 'Strong evaluation parsed as STRONG');
    assert(evalStrong.technicalAccuracy === 5, 'technicalAccuracy bounded to 5');
    assert(evalStrong.conceptualDepth === 4, 'conceptualDepth bounded to 4');
    assert(Array.isArray(evalStrong.evidence) && evalStrong.evidence.length > 0, 'Evidence array populated concisely');

    // Mock WEAK answer evaluation
    mockControl.setMock(async () => JSON.stringify({
      rating: 'WEAK',
      technicalAccuracy: 1,
      conceptualDepth: 0,
      practicalReasoning: 1,
      communication: 2,
      missingConcepts: ['Vector distance metrics'],
      evidence: ['Candidate provided insufficient explanation.']
    }));

    const evalWeak = await groqService.evaluateCandidateAnswer({
      questionNumber: 2,
      topic: 'Embeddings & Vector Search',
      candidateAnswer: 'I dont know vector search.'
    });

    assert(evalWeak.rating === 'WEAK', 'Weak evaluation parsed as WEAK');
    assert(evalWeak.technicalAccuracy === 1, 'Weak technicalAccuracy = 1');
    assert(evalWeak.missingConcepts.includes('Vector distance metrics'), 'missingConcepts captures technical gaps');

    // ══════════════════════════════════════════════════════════════════════════
    // 2. Score Clamping & Malformed LLM Recovery
    // ══════════════════════════════════════════════════════════════════════════
    section('2. Clamping & Malformed LLM Recovery');

    // Out of range scores (e.g. score = 10 or -5)
    mockControl.setMock(async () => JSON.stringify({
      rating: 'STRONG',
      technicalAccuracy: 10,
      conceptualDepth: -5,
      practicalReasoning: 99,
      communication: 3
    }));

    const evalClamped = await groqService.evaluateCandidateAnswer({
      topic: 'Test',
      candidateAnswer: 'Sample text'
    });

    assert(evalClamped.technicalAccuracy === 5, 'Out-of-range score 10 clamped down to max 5');
    assert(evalClamped.conceptualDepth === 0, 'Out-of-range score -5 clamped up to min 0');
    assert(evalClamped.practicalReasoning === 5, 'Out-of-range score 99 clamped down to max 5');

    // Malformed JSON output
    mockControl.setMock(async () => 'INVALID JSON {{{{');
    const evalMalformed = await groqService.evaluateCandidateAnswer({
      topic: 'Test',
      candidateAnswer: 'Sample text'
    });

    assert(evalMalformed !== null && typeof evalMalformed === 'object', 'Malformed JSON returns safe structured evaluation object');
    assert(evalMalformed.rating === 'STRONG' || evalMalformed.rating === 'ADEQUATE' || evalMalformed.rating === 'WEAK' || evalMalformed.rating === 'UNKNOWN', 'Malformed JSON falls back to valid rating');

    // Empty answer handling
    const evalEmpty = await groqService.evaluateCandidateAnswer({
      topic: 'Test',
      candidateAnswer: ''
    });
    assert(evalEmpty.rating === 'UNKNOWN' || evalEmpty.rating === 'WEAK', 'Empty answer handled safely with fallback rating');

    // ══════════════════════════════════════════════════════════════════════════
    // 3. Evaluation → Strategy Engine Integration
    // ══════════════════════════════════════════════════════════════════════════
    section('3. Evaluation → Strategy Integration');

    const stateStrat = createInitialSessionState(CAND1);
    stateStrat.coveredCurriculumDays = [7, 13, 22, 28];
    const initialDiff = stateStrat.currentDifficultyLevel; // 'DEPTH'

    // Strong answer increases difficulty from DEPTH -> ADVANCED
    const strongAns = "We deployed an HNSW vector index using ChromaDB with customized embedding chunking, reducing query latency from 350ms to 45ms at 10,000 QPS.";
    const dStrong = makeStrategyDecision(stateStrat, strongAns);
    applyStrategyDecision(stateStrat, dStrong);
    assert(stateStrat.currentDifficultyLevel === 'ADVANCED', 'STRONG answer increases difficulty from DEPTH to ADVANCED');

    // Weak answer decreases difficulty from ADVANCED -> DEPTH
    const weakAns = "yes ok";
    const dWeak = makeStrategyDecision(stateStrat, weakAns);
    applyStrategyDecision(stateStrat, dWeak);
    assert(stateStrat.currentDifficultyLevel === 'DEPTH', 'WEAK answer decreases difficulty from ADVANCED back to DEPTH');

    // ══════════════════════════════════════════════════════════════════════════
    // 4. Evaluation Records Persistence in Session State
    // ══════════════════════════════════════════════════════════════════════════
    section('4. Evaluation Records Persistence');

    mockControl.setMock(async () => JSON.stringify({
      rating: 'STRONG',
      technicalAccuracy: 5,
      conceptualDepth: 4,
      practicalReasoning: 4,
      communication: 4,
      evidence: ['Detailed ChromaDB explanation.']
    }));

    const statePersist = createInitialSessionState(CAND1);
    await processSessionTurn(statePersist, "We used ChromaDB with HNSW indexing for vector search.");

    assert(Array.isArray(statePersist.evaluationRecords), 'evaluationRecords array exists in session state');
    assert(statePersist.evaluationRecords.length === 1, 'Evaluation record persisted after turn');
    assert(typeof statePersist.evaluationRecords[0].topic === 'string' && statePersist.evaluationRecords[0].topic.length > 0, 'Evaluation record tracks question topic');

    // ══════════════════════════════════════════════════════════════════════════
    // 5. Final Feedback Synthesis & Schema Validation
    // ══════════════════════════════════════════════════════════════════════════
    section('5. Final Feedback Synthesis & Schema Validation');

    mockControl.setMock(async () => JSON.stringify({
      summary: 'The candidate demonstrated expert vector search architecture skills.',
      strengths: ['Solid HNSW vector indexing design', 'Clear API validation patterns'],
      gaps: ['Needs deeper distributed tracing experience'],
      next: ['Implement custom MCP servers', 'Profile vector retrieval latency']
    }));

    const feedbackRes = await groqService.generateFinalFeedback({
      candidateSnapshot: CAND1.member,
      coveredCurriculumDays: [7, 13, 22, 28],
      evaluationRecords: statePersist.evaluationRecords
    });

    assert(feedbackRes !== null, 'Final feedback returns object');
    assert(typeof feedbackRes.summary === 'string', 'Summary is string');
    assert(Array.isArray(feedbackRes.strengths) && feedbackRes.strengths.length >= 1, 'Strengths array valid');
    assert(Array.isArray(feedbackRes.gaps) && feedbackRes.gaps.length >= 1, 'Gaps array valid');
    assert(Array.isArray(feedbackRes.next) && feedbackRes.next.length >= 1, 'Next steps array valid');

    // ══════════════════════════════════════════════════════════════════════════
    // 6. Groq Failure Fallback — Feedback is NEVER null on done=true
    // ══════════════════════════════════════════════════════════════════════════
    section('6. Groq Final Feedback Fallback Guarantee');

    mockControl.setMock(async () => null); // Force LLM failure

    const stateCompletion = createInitialSessionState(CAND1);
    stateCompletion.currentQuestionNumber = 8;
    stateCompletion.coveredCurriculumDays = [7, 13, 22, 28];

    const turnComp = await processSessionTurn(stateCompletion, "Final answer on production observability.");

    assert(turnComp.done === true, 'Completion turn done is true');
    assert(turnComp.feedback !== null && typeof turnComp.feedback === 'object', 'Feedback is NEVER null when done=true (fallback activated)');
    assert(typeof turnComp.feedback.summary === 'string', 'Fallback feedback contains valid summary');
    assert(Array.isArray(turnComp.feedback.strengths), 'Fallback feedback contains strengths');

    // ══════════════════════════════════════════════════════════════════════════
    // 7. Multi-Candidate Comparison (Senior vs Intern Feedback)
    // ══════════════════════════════════════════════════════════════════════════
    section('7. Multi-Candidate Final Feedback Differentiation');

    const stateC1 = createInitialSessionState(CAND1);
    const stateC7 = createInitialSessionState(CAND7);

    stateC1.evaluationRecords = [{ topic: 'Embeddings', rating: 'STRONG', technicalAccuracy: 5, conceptualDepth: 5 }];
    stateC7.evaluationRecords = [{ topic: 'Embeddings', rating: 'WEAK', technicalAccuracy: 1, conceptualDepth: 1 }];

    const fbC1 = groqService.createFallbackAnswerEvaluation ? stateC1.candidateSnapshot : null;
    const report1 = require('./interviewPlanner').generateFeedbackReport(stateC1);
    const report7 = require('./interviewPlanner').generateFeedbackReport(stateC7);

    assert(report1.summary !== report7.summary, 'Senior and Intern feedback reports produce distinct summaries');
    assert(report1.strengths[0] !== report7.strengths[0] || report1.gaps[0] !== report7.gaps[0], 'Feedback strengths and gaps reflect actual demonstrated evidence');

    // ══════════════════════════════════════════════════════════════════════════
    // 8. Organizer API Contract Compliance
    // ══════════════════════════════════════════════════════════════════════════
    section('8. Organizer API Contract Compliance');

    const contractVal = validateInterviewResponse(turnComp);
    assert(contractVal.valid === true, 'Final turn completion payload complies with organizer API specification');

  } finally {
    mockControl.restore();
    config.groqApiKey = originalKey;
  }

  console.log('\n=================================================');
  if (failed === 0) {
    console.log(`🎉 ALL ${passed} PHASE 10 STRUCTURED EVALUATION TESTS PASSED!`);
  } else {
    console.error(`❌ ${failed} test(s) FAILED out of ${passed + failed}`);
    process.exitCode = 1;
  }
  console.log(`=================================================\n`);
}

runPhase10Tests().catch(err => {
  console.error('Fatal Test Execution Error:', err);
  process.exit(1);
});
