/**
 * testPhase18EvidenceDebrief.js
 * Regression tests for evidence-grounded, deduplicated, senior-level interview debrief report generation.
 */

'use strict';

const assert = require('assert');
const { normalizeFeedbackReport, createInitialSessionState } = require('./interviewPlanner');
const { validateInterviewResponse } = require('./validator');

function runEvidenceDebriefTests() {
  console.log('═════════════════════════════════════════════════');
  console.log('🧪 Running Phase 18 Evidence-Grounded Debrief Regression Tests...');
  console.log('═════════════════════════════════════════════════\n');

  let passed = 0;

  const candidate = {
    member: { id: 'CAND-EV-001', name: 'Alex Turner', jobRole: 'Backend Software Engineer', yearsExperience: 4, education: 'BS Computer Science' },
    missions: [],
    signals: { commitDays: 22, missionsCompleted: 29 }
  };

  const state = createInitialSessionState(candidate);

  // ─────────────────────────────────────────────
  // Test A: Duplicate-strength prevention & topic deduplication
  // ─────────────────────────────────────────────
  console.log('▶ Test A: Duplicate-strength prevention');
  const rawDuplicates = {
    summary: 'Alex Turner demonstrated solid system architecture capabilities.',
    strengths: [
      'Embedding Systems: Demonstrated understanding of embedding-model consistency and vector indexing.',
      'Embedding Systems: Demonstrated understanding of embedding-model consistency and vector indexing.',
      'embedding systems: demonstrated understanding of embedding model consistency and vector indexing'
    ],
    gaps: ['Production Operations: Could deepen hands-on experience with Kubernetes deployment.'],
    next: ['Load-test vector retrieval and profile latency, memory usage, and cost.']
  };

  const reportA = normalizeFeedbackReport(rawDuplicates, state);
  assert.strictEqual(reportA.strengths.length, 1, 'Duplicate strengths must be collapsed to 1 unique bullet');
  console.log(`  ✅ Deduplicated 3 identical strength variations down to 1 item`);
  passed++;

  // ─────────────────────────────────────────────
  // Test B: Evidence-based strength formatting [Competency]: [Evidence]
  // ─────────────────────────────────────────────
  console.log('\n▶ Test B: Evidence-based strength formatting');
  state.evaluationRecords = [
    { topic: 'Embeddings Explained', rating: 'STRONG', questionType: 'CONCEPT' },
    { topic: 'Embeddings Explained', rating: 'STRONG', questionType: 'ARCHITECTURE' },
    { topic: 'Embeddings Explained', rating: 'STRONG', questionType: 'DEEP_DIVE' }
  ];

  const reportB = normalizeFeedbackReport(null, state);
  assert(reportB.strengths[0].includes('Embeddings Explained'), 'Strength must include topic title');
  assert(reportB.strengths[0].includes(':'), 'Strength must contain colon delimiter [Competency]: [Evidence]');
  console.log(`  ✅ Formatted Strength: "${reportB.strengths[0]}"`);
  passed++;

  // ─────────────────────────────────────────────
  // Test C: Evidence-based gap formatting [Area]: [Gap]
  // ─────────────────────────────────────────────
  console.log('\n▶ Test C: Evidence-based weakness generation');
  state.evaluationRecords.push({ topic: 'Model Context Protocol (MCP)', rating: 'WEAK', questionType: 'DEEP_DIVE' });

  const reportC = normalizeFeedbackReport(null, state);
  assert(reportC.gaps.some(g => g.includes('Model Context Protocol')), 'Gap must reference weak topic');
  assert(reportC.gaps[0].includes(':'), 'Gap must contain colon delimiter [Area]: [Gap]');
  console.log(`  ✅ Formatted Gap: "${reportC.gaps[0]}"`);
  passed++;

  // ─────────────────────────────────────────────
  // Test D: Recommendation mapping
  // ─────────────────────────────────────────────
  console.log('\n▶ Test D: Recommendation mapping to weaknesses');
  assert(Array.isArray(reportC.next) && reportC.next.length >= 1, 'Next steps must be a non-empty array');
  assert(reportC.next.length <= 3, 'Next steps capped at maximum 3 actionable recommendations');
  console.log(`  ✅ Recommendations generated: ${reportC.next.length} actionable items`);
  passed++;

  // ─────────────────────────────────────────────
  // Test E: Empty/insufficient evidence handling
  // ─────────────────────────────────────────────
  console.log('\n▶ Test E: Empty evidence handling without manufactured unasked weaknesses');
  const cleanState = createInitialSessionState(candidate);
  cleanState.evaluationRecords = [{ topic: 'Embeddings Explained', rating: 'STRONG', questionType: 'CONCEPT' }];

  const reportE = normalizeFeedbackReport(null, cleanState);
  assert(reportE.gaps.length <= 3, 'Gaps must remain bounded');
  assert(!reportE.gaps.some(g => g.includes('commit days')), 'Gaps must not mention active commit days');
  console.log(`  ✅ Clean default gap: "${reportE.gaps[0]}"`);
  passed++;

  // ─────────────────────────────────────────────
  // Test F: Repeated interview topics consolidation
  // ─────────────────────────────────────────────
  console.log('\n▶ Test F: Repeated interview topics consolidation');
  const multiTurnState = createInitialSessionState(candidate);
  multiTurnState.evaluationRecords = [
    { topic: 'Full-Stack Integration', rating: 'STRONG', questionType: 'CONCEPT' },
    { topic: 'Full-Stack Integration', rating: 'STRONG', questionType: 'APPLICATION' },
    { topic: 'Full-Stack Integration', rating: 'STRONG', questionType: 'DEEP_DIVE' },
    { topic: 'Full-Stack Integration', rating: 'STRONG', questionType: 'TRADEOFF' }
  ];

  const reportF = normalizeFeedbackReport(null, multiTurnState);
  assert.strictEqual(reportF.strengths.length, 1, '4 turns on Full-Stack Integration must consolidate into 1 strength bullet');
  assert(reportF.strengths[0].includes('Full-Stack Integration'), 'Consolidated bullet must reference competency');
  console.log(`  ✅ Consolidated 4 repeated turns into 1 strength: "${reportF.strengths[0]}"`);
  passed++;

  // ─────────────────────────────────────────────
  // Test G: Organizer API response contract compliance
  // ─────────────────────────────────────────────
  console.log('\n▶ Test G: Organizer API response contract compliance');
  const fullResponse = {
    reply: 'Interview completed. Thank you for your time and detailed answers.',
    done: true,
    feedback: reportF
  };

  const validation = validateInterviewResponse(fullResponse);
  assert.strictEqual(validation.valid, true, `Response contract must be valid: ${validation.error}`);
  console.log(`  ✅ Organizer API Contract Validation: PASS`);
  passed++;

  console.log('\n=================================================');
  console.log(`🎉 ALL ${passed}/7 PHASE 18 EVIDENCE-DEBRIEF TESTS PASSED!`);
  console.log('=================================================\n');
}

if (require.main === module) {
  runEvidenceDebriefTests();
}

module.exports = { runEvidenceDebriefTests };
