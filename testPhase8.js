/**
 * testPhase8.js
 * Comprehensive unit & integration tests for Phase 8 — Groq LLM Integration.
 *
 * Verifies all 13 required test scenarios using isolated mocks:
 *   1. Successful Groq request
 *   2. Missing API key handling (triggers fallback safely)
 *   3. API Timeout handling
 *   4. Rate limit / 429 error handling
 *   5. Network failure error handling
 *   6. Malformed JSON structured output recovery
 *   7. Empty LLM response recovery
 *   8. Interviewer generation
 *   9. Structured answer evaluation validation
 *   10. Structured final feedback schema validation
 *   11. Deterministic fallback activation
 *   12. Session state preservation after LLM failure
 *   13. Organizer API contract compliance
 */

'use strict';

const groqService = require('./groqService');
const config = require('./config');
const { createInitialSessionState, processSessionTurn } = require('./interviewPlanner');
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

async function runPhase8Tests() {
  const mockControl = mockClientCall();
  const originalKey = config.groqApiKey;

  try {
    // ══════════════════════════════════════════════════════════════════════════
    // 1. Missing API Key & Deterministic Fallback Activation
    // ══════════════════════════════════════════════════════════════════════════
    section('1. Missing API Key & Deterministic Fallbacks');

    config.groqApiKey = ''; // Simulate missing API key

    const fallbackQ = await groqService.generateInterviewerResponse({
      topic: 'Embeddings',
      questionType: 'CONCEPT',
      difficulty: 'DEPTH'
    });
    assert(fallbackQ === null, 'Missing API key returns null for interviewer response (triggers fallback)');

    const fallbackEval = await groqService.evaluateCandidateAnswer({
      topic: 'Embeddings',
      question: 'What is vector search?',
      candidateAnswer: 'Vector search matches embeddings using cosine distance.',
      difficulty: 'DEPTH'
    });
    assert(fallbackEval !== null && (fallbackEval.rating === 'UNKNOWN' || fallbackEval.rating === 'STRONG' || fallbackEval.rating === 'ADEQUATE' || fallbackEval.rating === 'WEAK'), 'Missing API key returns structured fallback evaluation object');

    const fallbackFb = await groqService.generateFinalFeedback({
      candidateSnapshot: { name: 'Test', jobRole: 'Engineer', yearsExperience: 5 }
    });
    assert(fallbackFb === null, 'Missing API key returns null for final feedback');

    // Enable mock key for mock tests
    config.groqApiKey = 'mock-test-key-for-unit-tests';

    // ══════════════════════════════════════════════════════════════════════════
    // 2. Successful Groq Request & Interviewer Generation
    // ══════════════════════════════════════════════════════════════════════════
    section('2. Successful Groq Request & Interviewer Generation');

    mockControl.setMock(async ({ operationName }) => {
      if (operationName === 'generateInterviewerResponse') {
        return 'Could you explain how vector similarity search handles high-dimensional embedding spaces under heavy query volume?';
      }
      return null;
    });

    const mockQ = await groqService.generateInterviewerResponse({
      candidateRole: 'Senior Data Engineer',
      yearsExperience: 9,
      day: 7,
      topic: 'Embeddings Explained',
      questionType: 'DEEP_DIVE',
      difficulty: 'DEPTH'
    });

    assert(typeof mockQ === 'string' && mockQ.length > 10, 'Interviewer generation returns natural question string');
    assert(mockQ.includes('vector similarity search'), 'Interviewer question contains domain terms');

    // ══════════════════════════════════════════════════════════════════════════
    // 3. Structured Answer Evaluation & Validation
    // ══════════════════════════════════════════════════════════════════════════
    section('3. Structured Answer Evaluation & Validation');

    mockControl.setMock(async ({ operationName }) => {
      if (operationName === 'evaluateCandidateAnswer') {
        return JSON.stringify({
          rating: 'STRONG',
          technicalAccuracy: 5,
          conceptualDepth: 4,
          practicalReasoning: 5,
          communication: 4,
          missingConcepts: ['HNSW graph tuning'],
          evidence: ['Demonstrated clear understanding of vector indexes']
        });
      }
      return null;
    });

    const evalResult = await groqService.evaluateCandidateAnswer({
      topic: 'Embeddings Explained',
      question: 'Explain vector search.',
      candidateAnswer: 'We indexed vectors in ChromaDB using HNSW for fast nearest neighbor lookup.',
      difficulty: 'DEPTH'
    });

    assert(evalResult !== null, 'Structured answer evaluation returns object');
    assert(evalResult.rating === 'STRONG', 'Rating correctly parsed as STRONG');
    assert(evalResult.technicalAccuracy === 5, 'technicalAccuracy score parsed and bounded correctly');
    assert(Array.isArray(evalResult.missingConcepts), 'missingConcepts is valid array');

    // ══════════════════════════════════════════════════════════════════════════
    // 4. Structured Final Feedback Validation
    // ══════════════════════════════════════════════════════════════════════════
    section('4. Structured Final Feedback Schema Validation');

    mockControl.setMock(async ({ operationName }) => {
      if (operationName === 'generateFinalFeedback') {
        return JSON.stringify({
          summary: 'The candidate displayed expert system design capabilities across vector search and agent workflows.',
          strengths: ['Strong grasp of vector indexing', 'Solid API design principles'],
          gaps: ['Limited hands-on Docker deployment'],
          next: ['Implement custom MCP tools', 'Conduct load testing on vector endpoints', 'Optimize prompt caching']
        });
      }
      return null;
    });

    const fbResult = await groqService.generateFinalFeedback({
      candidateSnapshot: { name: 'Sarah Johnson', jobRole: 'Senior Data Engineer', yearsExperience: 9 },
      coveredCurriculumDays: [7, 13, 22, 28],
      previousTurns: [{ role: 'candidate', content: 'I built RAG endpoints using FastAPI.' }]
    });

    assert(fbResult !== null, 'Final feedback synthesis returns object');
    assert(typeof fbResult.summary === 'string', 'Summary field is valid string');
    assert(Array.isArray(fbResult.strengths) && fbResult.strengths.length === 2, 'Strengths array valid');
    assert(Array.isArray(fbResult.gaps) && fbResult.gaps.length === 1, 'Gaps array valid');
    assert(Array.isArray(fbResult.next) && fbResult.next.length === 3, 'Next steps array valid');

    // ══════════════════════════════════════════════════════════════════════════
    // 5. Malformed JSON Output & Recovery
    // ══════════════════════════════════════════════════════════════════════════
    section('5. Malformed JSON & Empty Response Recovery');

    mockControl.setMock(async () => 'This is not valid JSON {{{');

    const malformedEval = await groqService.evaluateCandidateAnswer({
      topic: 'Test',
      candidateAnswer: 'Sample answer'
    });
    assert(malformedEval !== null && (malformedEval.rating === 'UNKNOWN' || malformedEval.rating === 'STRONG' || malformedEval.rating === 'ADEQUATE' || malformedEval.rating === 'WEAK'), 'Malformed JSON in evaluation returns safe fallback evaluation object');

    const malformedFb = await groqService.generateFinalFeedback({
      candidateSnapshot: { name: 'Test' }
    });
    assert(malformedFb === null, 'Malformed JSON in feedback returns null (activates fallback)');

    mockControl.setMock(async () => ''); // Empty response

    const emptyRes = await groqService.generateInterviewerResponse({ topic: 'Test' });
    assert(emptyRes === null, 'Empty LLM response returns null safely');

    // ══════════════════════════════════════════════════════════════════════════
    // 6. Network Error, Timeout & Rate Limit Failures
    // ══════════════════════════════════════════════════════════════════════════
    section('6. Network Error, Timeout & Rate Limit Handling');

    mockControl.setMock(async () => {
      throw new Error('429 Rate limit exceeded');
    });
    const rateLimitRes = await groqService.generateInterviewerResponse({ topic: 'Test' });
    assert(rateLimitRes === null, 'Rate limit (429) failure returns null gracefully without crashing');

    mockControl.setMock(async () => {
      throw new Error('Groq API Timeout');
    });
    const timeoutRes = await groqService.generateInterviewerResponse({ topic: 'Test' });
    assert(timeoutRes === null, 'Timeout failure returns null gracefully without crashing');

    mockControl.setMock(async () => {
      throw new Error('ECONNREFUSED Connection refused');
    });
    const networkRes = await groqService.generateInterviewerResponse({ topic: 'Test' });
    assert(networkRes === null, 'Network failure returns null gracefully without crashing');

    // ══════════════════════════════════════════════════════════════════════════
    // 7. Full Turn Integration & State Preservation After LLM Failure
    // ══════════════════════════════════════════════════════════════════════════
    section('7. Full Turn Integration & State Preservation');

    // Mock LLM failure during live turn processing
    mockControl.setMock(async () => null);

    const testCandidate = {
      member: { id: 'CAND-001', name: 'Sarah Johnson', jobRole: 'Senior Data Engineer', yearsExperience: 9 },
      missions: [{ day: 7, title: 'Embeddings Explained', passed: true }],
      signals: { commitDays: 28, missionsCompleted: 30, missionsFirstTry: 20 }
    };

    const state = createInitialSessionState(testCandidate);
    const initialQ = state.currentQuestionNumber;

    // Process turn with failed LLM -> fallback takes over
    const turnResult = await processSessionTurn(state, "We implemented vector search using ChromaDB.");

    assert(turnResult !== null && typeof turnResult.reply === 'string', 'Turn result returned valid reply string despite LLM failure');
    assert(turnResult.done === false, 'Turn result done is false');
    assert(state.currentQuestionNumber === initialQ + 1, 'Question number incremented correctly by strategy engine');
    assert(state.interviewStatus === 'ACTIVE', 'Session state remains ACTIVE and preserved');

    // Validate schema against organizer contract
    const contractVal = validateInterviewResponse(turnResult);
    assert(contractVal.valid === true, 'Response contract complies with organizer specification');

  } finally {
    mockControl.restore();
    config.groqApiKey = originalKey;
  }

  console.log('\n=================================================');
  if (failed === 0) {
    console.log(`🎉 ALL ${passed} PHASE 8 GROQ INTEGRATION TESTS PASSED!`);
  } else {
    console.error(`❌ ${failed} test(s) FAILED out of ${passed + failed}`);
    process.exitCode = 1;
  }
  console.log(`=================================================\n`);
}

runPhase8Tests().catch(err => {
  console.error('Fatal Test Execution Error:', err);
  process.exit(1);
});
