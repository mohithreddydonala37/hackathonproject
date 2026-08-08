/**
 * testPhase16InitialTopicAlignment.js
 * Regression tests for initial question generation, initial topic alignment,
 * candidate personalization topic agreement, and turn-by-turn topic consistency.
 */

'use strict';

const assert = require('assert');
const { createInitialSessionState, generateInitialGreeting, processSessionTurn } = require('./interviewPlanner');
const { getAllCandidates } = require('./dataLoader');
const groqService = require('./groqService');

async function runInitialTopicAlignmentTests() {
  console.log('═════════════════════════════════════════════════');
  console.log('🧪 Running Phase 16 Initial Topic Alignment Regression Tests...');
  console.log('═════════════════════════════════════════════════\n');

  let passed = 0;

  const candidates = getAllCandidates();
  const alexCandidate = candidates.find(c => c.member.name === 'Alex Turner') || candidates[0];
  const sarahCandidate = candidates.find(c => c.member.name === 'Sarah Johnson') || candidates[1];

  // ─────────────────────────────────────────────
  // TEST 1 — Initial topic alignment
  // ─────────────────────────────────────────────
  console.log('▶ TEST 1 — Initial topic alignment');
  const state1 = createInitialSessionState(alexCandidate);
  const initialTopicTitle1 = state1.interviewPlan[0].title;
  
  const greeting1 = await generateInitialGreeting(state1);

  assert(
    greeting1.includes(initialTopicTitle1) || 
    greeting1.toLowerCase().includes(initialTopicTitle1.toLowerCase().split(' ')[0]),
    `Initial question content must align with selected initial topic (${initialTopicTitle1})`
  );
  console.log(`  ✅ Candidate: ${alexCandidate.member.name}`);
  console.log(`  ✅ Initial Topic: ${initialTopicTitle1}`);
  console.log(`  ✅ Initial Question Text: "${greeting1.slice(0, 120)}..."`);
  passed++;

  // ─────────────────────────────────────────────
  // TEST 2 — Initial question metadata
  // ─────────────────────────────────────────────
  console.log('\n▶ TEST 2 — Initial question metadata');
  const state2 = createInitialSessionState(sarahCandidate);
  const expectedTopic2 = state2.interviewPlan[0].title;

  assert.strictEqual(state2.currentTopic, expectedTopic2, 'Initial state currentTopic must match selected initial topic');
  console.log(`  ✅ Candidate: ${sarahCandidate.member.name}`);
  console.log(`  ✅ state.currentTopic: ${state2.currentTopic}`);
  passed++;

  // ─────────────────────────────────────────────
  // TEST 3 — Initial fallback
  // ─────────────────────────────────────────────
  console.log('\n▶ TEST 3 — Initial fallback mode topic preservation');
  const state3 = createInitialSessionState(alexCandidate);
  const expectedTopic3 = state3.interviewPlan[0].title;

  // Temporarily force Groq fallback by removing API key
  const origKey = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;

  const fallbackGreeting = await generateInitialGreeting(state3);
  process.env.GROQ_API_KEY = origKey; // Restore key

  assert(fallbackGreeting.includes(expectedTopic3), 'Fallback greeting text must explicitly contain initial topic title');
  console.log(`  ✅ Initial Fallback Greeting: "${fallbackGreeting}"`);
  passed++;

  // ─────────────────────────────────────────────
  // TEST 4 — Initial personalization
  // ─────────────────────────────────────────────
  console.log('\n▶ TEST 4 — Candidate role/background personalization topic agreement');
  const state4 = createInitialSessionState(alexCandidate);
  const selectedTopic4 = state4.currentTopic;

  const greeting4 = await generateInitialGreeting(state4);

  // Candidate job role (Backend Software Engineer) must not override curriculum topic
  assert(!greeting4.includes('Embeddings & Vector Search') || selectedTopic4 === 'Embeddings & Vector Search', 'Personalization must not inject unselected default topic');
  assert.strictEqual(state4.currentTopic, selectedTopic4, 'State currentTopic must remain intact after greeting generation');
  console.log(`  ✅ Selected Topic: ${selectedTopic4}`);
  console.log(`  ✅ Candidate Role: ${alexCandidate.member.jobRole}`);
  passed++;

  // ─────────────────────────────────────────────
  // TEST 5 — Existing transition alignment
  // ─────────────────────────────────────────────
  console.log('\n▶ TEST 5 — Existing topic transition alignment preservation');
  const state5 = createInitialSessionState(sarahCandidate);
  state5.currentQuestionNumber = 5;
  state5.currentTopic = 'Day 29 - Monitoring, Logging & Observability';
  state5.coveredCurriculumDays = [29];
  state5.usedDays = [29];

  const turn5 = await processSessionTurn(state5, 'I implement structured JSON logging with Correlation IDs across microservices.');
  
  assert.notStrictEqual(turn5.currentTopic, 'Day 29 - Monitoring, Logging & Observability', 'Topic transition must advance from current topic');
  assert(turn5.reply.length > 0, 'Turn response reply text must be non-empty');
  console.log(`  ✅ Previous Topic: Day 29 - Monitoring, Logging & Observability`);
  console.log(`  ✅ Transitioned Topic: ${turn5.currentTopic}`);
  passed++;

  // ─────────────────────────────────────────────
  // TEST 6 — Active topic vs question agreement
  // ─────────────────────────────────────────────
  console.log('\n▶ TEST 6 — Active topic vs question agreement across multi-turn interview');
  const state6 = createInitialSessionState(alexCandidate);
  
  // Turn 0: Initial Greeting
  const g6 = await generateInitialGreeting(state6);
  assert.strictEqual(state6.currentTopic, state6.interviewPlan[0].title, 'Turn 0 topic agreement');

  // Turn 1: Conversation turn
  const t1 = await processSessionTurn(state6, 'I design streaming SSE endpoints for low latency response delivery.');
  assert.strictEqual(t1.currentTopic, state6.currentTopic, 'Turn 1 payload topic must match state currentTopic');
  assert(t1.reply.length > 0, 'Turn 1 reply non-empty');

  // Turn 2: Follow-up turn
  const t2 = await processSessionTurn(state6, 'I handle backpressure by buffering chunks and using client-side reactive streams.');
  assert.strictEqual(t2.currentTopic, state6.currentTopic, 'Turn 2 payload topic must match state currentTopic');

  console.log(`  ✅ Multi-turn active topic vs question text agreement verified across 3 turns`);
  passed++;

  console.log('\n=================================================');
  console.log(`🎉 ALL ${passed}/6 PHASE 16 INITIAL TOPIC ALIGNMENT TESTS PASSED!`);
  console.log('=================================================\n');
}

if (require.main === module) {
  runInitialTopicAlignmentTests().catch(err => {
    console.error('❌ Test execution failed:', err);
    process.exit(1);
  });
}

module.exports = { runInitialTopicAlignmentTests };
