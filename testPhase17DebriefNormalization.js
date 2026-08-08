/**
 * testPhase17DebriefNormalization.js
 * Regression tests for Interview Assessment Debrief report normalization,
 * deduplication, evidence grounding, and commit-day metric removal.
 */

'use strict';

const assert = require('assert');
const { normalizeFeedbackReport, createInitialSessionState } = require('./interviewPlanner');
const { validateInterviewResponse } = require('./validator');

function runDebriefNormalizationTests() {
  console.log('═════════════════════════════════════════════════');
  console.log('🧪 Running Phase 17 Debrief Report Normalization Regression Tests...');
  console.log('═════════════════════════════════════════════════\n');

  let passed = 0;

  const sampleCandidate = {
    member: { id: 'CAND-TEST-DEBRIEF', name: 'Alex Turner', jobRole: 'Backend Software Engineer', yearsExperience: 4, education: 'BS Computer Science' },
    missions: [],
    signals: { commitDays: 22, missionsCompleted: 29, missionsFirstTry: 10 }
  };

  const baseState = createInitialSessionState(sampleCandidate);

  // ─────────────────────────────────────────────
  // Test A: Exact duplicate string deduplication
  // ─────────────────────────────────────────────
  console.log('▶ Test A: Exact duplicate string deduplication');
  const rawA = {
    summary: 'Alex Turner demonstrated strong capability.',
    strengths: [
      'Demonstrated strong technical depth in Embeddings Explained.',
      'Demonstrated strong technical depth in Embeddings Explained.'
    ],
    gaps: [
      'Needs deeper understanding in Model Context Protocol.',
      'Needs deeper understanding in Model Context Protocol.'
    ],
    next: ['Practice MCP server implementation.', 'Practice MCP server implementation.']
  };

  const reportA = normalizeFeedbackReport(rawA, baseState);
  assert.strictEqual(reportA.strengths.length, 1, `Expected 1 deduplicated strength, got ${reportA.strengths.length}`);
  assert.strictEqual(reportA.gaps.length, 1, `Expected 1 deduplicated gap, got ${reportA.gaps.length}`);
  assert.strictEqual(reportA.next.length, 1, `Expected 1 deduplicated recommendation, got ${reportA.next.length}`);
  console.log(`  ✅ Strengths Count: ${reportA.strengths.length} ("${reportA.strengths[0]}")`);
  passed++;

  // ─────────────────────────────────────────────
  // Test B: Case & punctuation difference deduplication
  // ─────────────────────────────────────────────
  console.log('\n▶ Test B: Case and punctuation difference deduplication');
  const rawB = {
    summary: 'Alex Turner demonstrated strong capability.',
    strengths: [
      'Demonstrated strong technical depth in Embeddings Explained.',
      'demonstrated strong technical depth in embeddings explained',
      'DEMONSTRATED STRONG TECHNICAL DEPTH IN EMBEDDINGS EXPLAINED!'
    ],
    gaps: ['Needs deeper understanding in Model Context Protocol.'],
    next: ['Practice MCP server implementation.']
  };

  const reportB = normalizeFeedbackReport(rawB, baseState);
  assert.strictEqual(reportB.strengths.length, 1, `Expected 1 case-normalized strength, got ${reportB.strengths.length}`);
  console.log(`  ✅ Deduplicated case variations down to 1 item`);
  passed++;

  // ─────────────────────────────────────────────
  // Test C: Multiple turns from same competency -> 1 consolidated strength
  // ─────────────────────────────────────────────
  console.log('\n▶ Test C: Multiple turns from same competency consolidation');
  const stateC = createInitialSessionState(sampleCandidate);
  stateC.evaluationRecords = [
    { topic: 'Embeddings Explained', rating: 'STRONG', questionType: 'CONCEPT' },
    { topic: 'Embeddings Explained', rating: 'STRONG', questionType: 'APPLICATION' },
    { topic: 'Embeddings Explained', rating: 'STRONG', questionType: 'DEEP_DIVE' },
    { topic: 'Embeddings Explained', rating: 'STRONG', questionType: 'ARCHITECTURE' }
  ];

  const reportC = normalizeFeedbackReport(null, stateC);
  assert.strictEqual(reportC.strengths.length, 1, '4 turns on Embeddings Explained must consolidate into 1 strength bullet');
  assert(reportC.strengths[0].includes('Embeddings Explained'), 'Strength must reference competency name');
  assert(reportC.strengths[0].includes('across') || reportC.strengths[0].includes('architecture'), 'Strength must aggregate evidence aspects');
  console.log(`  ✅ Consolidated 4 turns into single bullet: "${reportC.strengths[0]}"`);
  passed++;

  // ─────────────────────────────────────────────
  // Test D: Multiple distinct competencies -> unique competency strengths
  // ─────────────────────────────────────────────
  console.log('\n▶ Test D: Distinct competencies produce unique competency strengths');
  const stateD = createInitialSessionState(sampleCandidate);
  stateD.evaluationRecords = [
    { topic: 'Embeddings Explained', rating: 'STRONG', questionType: 'CONCEPT' },
    { topic: 'Chatbot Backend & API Integration', rating: 'STRONG', questionType: 'APPLICATION' },
    { topic: 'Advanced Prompting: Function Calling & Structured Outputs', rating: 'STRONG', questionType: 'DEEP_DIVE' }
  ];

  const reportD = normalizeFeedbackReport(null, stateD);
  assert.strictEqual(reportD.strengths.length, 3, '3 distinct strong competencies must produce 3 unique strength bullets');
  console.log(`  ✅ Produced 3 distinct competency bullets:`);
  reportD.strengths.forEach(s => console.log(`     - ${s}`));
  passed++;

  // ─────────────────────────────────────────────
  // Test E: Empty evidence handling (no manufactured gaps)
  // ─────────────────────────────────────────────
  console.log('\n▶ Test E: Empty evidence handling without manufactured fake gaps');
  const stateE = createInitialSessionState(sampleCandidate);
  stateE.evaluationRecords = [
    { topic: 'Embeddings Explained', rating: 'STRONG', questionType: 'CONCEPT' }
  ];

  const reportE = normalizeFeedbackReport(null, stateE);
  assert(reportE.gaps.length <= 3, 'Gaps capped at <= 3 items');
  assert(!reportE.gaps.some(g => g.includes('commit days')), 'Gaps must not contain commit day metrics');
  console.log(`  ✅ Clean evidence-based gap generated: "${reportE.gaps[0]}"`);
  passed++;

  // ─────────────────────────────────────────────
  // Test F: Removal of "active commit days" claim
  // ─────────────────────────────────────────────
  console.log('\n▶ Test F: Removal of "active commit days" cohort claims');
  const rawF = {
    summary: 'Alex Turner completed 8 technical turns and maintained 22 active commit days in the cohort.',
    strengths: ['Completed cohort missions with 22 active commit days.'],
    gaps: ['Could further deepen hands-on exposure to production deployment.'],
    next: ['Practice MCP server implementation.']
  };

  const reportF = normalizeFeedbackReport(rawF, baseState);
  assert(!reportF.summary.includes('active commit days'), 'Executive summary must NOT mention active commit days');
  assert(!reportF.strengths.some(s => s.includes('active commit days')), 'Strengths must NOT mention active commit days');
  console.log(`  ✅ Factual Summary: "${reportF.summary}"`);
  passed++;

  // ─────────────────────────────────────────────
  // Test G: Organizer API response contract compliance
  // ─────────────────────────────────────────────
  console.log('\n▶ Test G: Organizer API response contract compliance');
  const fullPayload = {
    reply: 'Interview completed. Thank you for your time and detailed answers.',
    done: true,
    feedback: reportD
  };

  const validation = validateInterviewResponse(fullPayload);
  assert.strictEqual(validation.valid, true, `Payload with normalized feedback must pass validation: ${validation.error}`);
  console.log(`  ✅ Organizer API response validation: PASS`);
  passed++;

  console.log('\n=================================================');
  console.log(`🎉 ALL ${passed}/7 PHASE 17 DEBRIEF NORMALIZATION TESTS PASSED!`);
  console.log('=================================================\n');
}

if (require.main === module) {
  runDebriefNormalizationTests();
}

module.exports = { runDebriefNormalizationTests };
