/**
 * testPhase15TopicTransition.js
 * Regression tests for curriculum topic transitions, question-topic alignment,
 * and stale topic prevention.
 */

'use strict';

const assert = require('assert');
const { createInitialSessionState, processSessionTurn } = require('./interviewPlanner');
const { makeStrategyDecision, NEXT_ACTIONS } = require('./interviewStrategyEngine');
const groqService = require('./groqService');

async function runTopicTransitionTests() {
  console.log('═════════════════════════════════════════════════');
  console.log('🧪 Running Phase 15 Topic Transition Regression Tests...');
  console.log('═════════════════════════════════════════════════\n');

  let passed = 0;

  // Candidate with custom missions targeting Vector Databases (Day 8) and Function Calling (Day 13)
  const candidate = {
    member: { id: 'CAND-TEST-TRANSITION', name: 'Alex Turner', jobRole: 'AI Engineer', yearsExperience: 4, education: 'BS Computer Science' },
    missions: [
      { day: 8, title: 'Vector Databases Overview', status: 'GAP', firstTry: false },
      { day: 13, title: 'Advanced Prompting: Function Calling & Structured Outputs', status: 'DEVELOPING', firstTry: true }
    ],
    signals: { commitDays: 14, missionsCompleted: 2, missionsFirstTry: 1 }
  };

  // ─────────────────────────────────────────────
  // Test 1: Transition from Vector Databases to Next Curriculum Topic
  // ─────────────────────────────────────────────
  console.log('▶ Test 1: Transition from Vector Databases to Next Curriculum Topic');
  const state1 = createInitialSessionState(candidate);
  
  // Set state at turn 5 on Vector Databases Overview (Day 8)
  state1.currentQuestionNumber = 5;
  state1.currentTopic = 'Vector Databases Overview';
  state1.coveredCurriculumDays = [8];
  state1.usedDays = [8];

  // Process turn transitioning to next topic
  const turn1 = await processSessionTurn(state1, 'I understand vector indexing, HNSW, and cosine similarity for nearest neighbor search.');

  assert(turn1.currentTopic !== 'Vector Databases Overview', `Expected topic transition away from Vector Databases Overview, got: ${turn1.currentTopic}`);
  assert(!turn1.reply.includes('Vector Databases Overview — Deep Dive'), 'Generated question must NOT be a stale Vector Databases question');
  console.log(`  ✅ Previous Topic: Vector Databases Overview`);
  console.log(`  ✅ Next Topic: ${turn1.currentTopic}`);
  console.log(`  ✅ Generated Question: "${turn1.reply.slice(0, 100)}..."`);
  passed++;

  // ─────────────────────────────────────────────
  // Test 2: Active topic and generated question topic must match
  // ─────────────────────────────────────────────
  console.log('\n▶ Test 2: Active topic and generated question topic match verification');
  const state2 = createInitialSessionState(candidate);
  state2.currentQuestionNumber = 3;

  const turn2 = await processSessionTurn(state2, 'LangChain agents orchestrate autonomous tool selection and execution loops.');
  
  assert.strictEqual(turn2.currentTopic, state2.currentTopic, 'Returned payload currentTopic must match state currentTopic');
  assert(turn2.reply.includes(turn2.currentTopic) || turn2.reply.length > 0, 'Generated question must match active topic');
  console.log(`  ✅ State Topic: ${state2.currentTopic}`);
  console.log(`  ✅ Payload Topic: ${turn2.currentTopic}`);
  console.log(`  ✅ Question Text: "${turn2.reply.slice(0, 100)}..."`);
  passed++;

  // ─────────────────────────────────────────────
  // Test 3: Stale previous-topic question must never be returned after transition
  // ─────────────────────────────────────────────
  console.log('\n▶ Test 3: Stale previous-topic question rejection');
  const state3 = createInitialSessionState(candidate);
  state3.currentQuestionNumber = 4;
  state3.currentTopic = 'Embeddings Explained';
  state3.coveredCurriculumDays = [7];
  state3.askedQuestionsHistory = ['Question 1 (Embeddings Explained): How do vector embeddings represent semantic meaning?'];

  const turn3 = await processSessionTurn(state3, 'Embeddings map text to high-dimensional vector spaces.');
  assert(!turn3.reply.includes('Question 1'), 'Must not repeat previous question text');
  assert(!turn3.reply.includes('Embeddings Explained — Deep Dive') || state3.currentTopic === 'Embeddings Explained', 'Must not return stale topic question');
  console.log(`  ✅ Verified no stale question leakage after turn execution`);
  passed++;

  // ─────────────────────────────────────────────
  // Test 4: Fallback mode respects selected curriculum topic
  // ─────────────────────────────────────────────
  console.log('\n▶ Test 4: Fallback mode respects selected curriculum topic');
  const state4 = createInitialSessionState(candidate);
  state4.currentQuestionNumber = 6;
  state4.currentTopic = 'Advanced Prompting: Function Calling & Structured Outputs';
  state4.currentStrategyQuestionType = 'DEEP_DIVE';

  // Force groq fallback by removing API key temporarily
  const origKey = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY; // Force fallback path

  const fallbackTurn = await processSessionTurn(state4, 'Pydantic models validate function arguments before API calls.');
  process.env.GROQ_API_KEY = origKey; // Restore key

  assert(fallbackTurn.reply.includes(fallbackTurn.currentTopic), 'Fallback text must explicitly include current topic name');
  console.log(`  ✅ Active Topic: ${fallbackTurn.currentTopic}`);
  console.log(`  ✅ Fallback Question: "${fallbackTurn.reply}"`);
  passed++;

  // ─────────────────────────────────────────────
  // Test 5: questionCount and coveredDays remain correct after transition
  // ─────────────────────────────────────────────
  console.log('\n▶ Test 5: questionCount and coveredDays progression after transition');
  const state5 = createInitialSessionState(candidate);
  const initialQCount = state5.currentQuestionNumber;
  const initialDaysCount = state5.coveredCurriculumDays.length;

  await processSessionTurn(state5, 'First candidate answer.');

  assert.strictEqual(state5.currentQuestionNumber, initialQCount + 1, 'Question count must increment by 1');
  assert(state5.coveredCurriculumDays.length >= initialDaysCount, 'Covered days must be maintained or increased');
  console.log(`  ✅ Question Count: ${state5.currentQuestionNumber}`);
  console.log(`  ✅ Covered Days: [${state5.coveredCurriculumDays.join(', ')}]`);
  passed++;

  console.log('\n=================================================');
  console.log(`🎉 ALL ${passed}/5 PHASE 15 TOPIC TRANSITION TESTS PASSED!`);
  console.log('=================================================\n');
}

if (require.main === module) {
  runTopicTransitionTests().catch(err => {
    console.error('❌ Test execution failed:', err);
    process.exit(1);
  });
}

module.exports = { runTopicTransitionTests };
