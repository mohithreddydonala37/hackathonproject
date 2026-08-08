/**
 * interviewStrategyEngine.js
 * Phase 7 — Deterministic Interview Strategy Engine
 *
 * Responsibilities:
 *   - Decide the next curriculum topic, question type, and difficulty.
 *   - Enforce completion invariants (min 8 questions + min 4 unique curriculum days).
 *   - Control follow-up limits (max 2 per primary question).
 *   - Prevent early completion under any input sequence.
 *   - Never call any LLM or external service.
 *
 * This module NEVER generates natural-language question text.
 * It only produces structured STRATEGY DECISIONS consumed by interviewPlanner.js.
 * Natural language generation (via Groq) is reserved for a future phase.
 */

'use strict';

const config = require('./config');
const { buildCandidateProfile }  = require('./candidateProfiler');
const { selectTopics }           = require('./topicSelector');
const { getDayCompact }          = require('./curriculumIndexer');

// ════════════════════════════════════════════════════════════════════════════
// Constants
// ════════════════════════════════════════════════════════════════════════════

/** Ordered difficulty progression (index 0 = easiest). */
const DIFFICULTY_LEVELS = [
  'FOUNDATION',
  'APPLICATION',
  'DEPTH',
  'ADVANCED',
  'ARCHITECTURE',
];

/** All supported question types. */
const QUESTION_TYPES = [
  'EXPERIENCE',
  'CONCEPT',
  'APPLICATION',
  'SCENARIO',
  'DEEP_DIVE',
  'TRADEOFF',
  'ARCHITECTURE',
  'WEAKNESS_PROBE',
  'SYNTHESIS',
];

/** All possible next-action values. */
const NEXT_ACTIONS = {
  ASK_NEW_TOPIC : 'ASK_NEW_TOPIC',
  FOLLOW_UP     : 'FOLLOW_UP',
  REFRAME       : 'REFRAME',
  DEEPEN        : 'DEEPEN',
  TRANSITION    : 'TRANSITION',
  COMPLETE      : 'COMPLETE',
};

/** Answer evaluation classifications (deterministic mock for this phase). */
const ANSWER_EVALS = {
  STRONG   : 'STRONG',
  ADEQUATE : 'ADEQUATE',
  WEAK     : 'WEAK',
  UNKNOWN  : 'UNKNOWN',
};

/** Maximum follow-up questions allowed per primary question. */
const MAX_FOLLOWUPS_PER_QUESTION = 2;

/**
 * Interview progression: maps question-number ranges to preferred question types.
 * Used by selectQuestionType() to vary the interview style over time.
 */
const PROGRESSION_STAGES = [
  { minQ: 1, maxQ: 1, preferred: ['EXPERIENCE', 'CONCEPT'] },
  { minQ: 2, maxQ: 2, preferred: ['CONCEPT', 'APPLICATION'] },
  { minQ: 3, maxQ: 4, preferred: ['APPLICATION', 'SCENARIO'] },
  { minQ: 5, maxQ: 6, preferred: ['DEEP_DIVE', 'TRADEOFF'] },
  { minQ: 7, maxQ: 7, preferred: ['WEAKNESS_PROBE', 'ARCHITECTURE'] },
  { minQ: 8, maxQ: 99, preferred: ['ARCHITECTURE', 'SYNTHESIS'] },
];

// ════════════════════════════════════════════════════════════════════════════
// Internal helpers
// ════════════════════════════════════════════════════════════════════════════

function _difficultyIndex(name) {
  const idx = DIFFICULTY_LEVELS.indexOf(name);
  return idx >= 0 ? idx : 1; // default APPLICATION
}

function _difficultyName(idx) {
  return DIFFICULTY_LEVELS[Math.max(0, Math.min(DIFFICULTY_LEVELS.length - 1, idx))];
}

// ════════════════════════════════════════════════════════════════════════════
// Public — deterministic functions
// ════════════════════════════════════════════════════════════════════════════

/**
 * Map years of experience to an initial difficulty level.
 * 0–1 yrs → FOUNDATION
 * 2–4 yrs → APPLICATION
 * 5–9 yrs → DEPTH
 * 10–19 yrs → ADVANCED
 * 20+ yrs → ARCHITECTURE
 *
 * @param {number} yearsExperience
 * @returns {string} DIFFICULTY_LEVELS member
 */
function computeInitialDifficulty(yearsExperience) {
  const yrs = typeof yearsExperience === 'number' ? yearsExperience : 0;
  if (yrs <= 1)  return 'FOUNDATION';
  if (yrs <= 4)  return 'APPLICATION';
  if (yrs <= 9)  return 'DEPTH';
  if (yrs <= 19) return 'ADVANCED';
  return 'ARCHITECTURE';
}

/**
 * Adjust difficulty based on the last answer evaluation.
 * STRONG  → +1 level (cap at ARCHITECTURE)
 * WEAK    → -1 level (floor at FOUNDATION)
 * Others  → unchanged
 *
 * @param {string} currentDifficulty
 * @param {string} answerEval  - ANSWER_EVALS member
 * @returns {string} new difficulty name
 */
function adjustDifficulty(currentDifficulty, answerEval) {
  const idx = _difficultyIndex(currentDifficulty);
  if (answerEval === ANSWER_EVALS.STRONG) return _difficultyName(idx + 1);
  if (answerEval === ANSWER_EVALS.WEAK)   return _difficultyName(idx - 1);
  return currentDifficulty;
}

/**
 * Deterministic mock answer evaluator.
 * Classification is based purely on word count — no LLM involved.
 * Groq-based evaluation will replace this in a future phase.
 *
 *  null / ''  → UNKNOWN
 *  < 8 words  → WEAK
 *  8–39 words → ADEQUATE
 *  ≥ 40 words → STRONG
 *
 * @param {string|null} message
 * @returns {string} ANSWER_EVALS member
 */
function evaluateAnswerDeterministic(message) {
  if (!message || typeof message !== 'string') return ANSWER_EVALS.UNKNOWN;
  const words = message.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0)  return ANSWER_EVALS.UNKNOWN;
  if (words < 8)    return ANSWER_EVALS.WEAK;
  if (words < 20)   return ANSWER_EVALS.ADEQUATE;
  return ANSWER_EVALS.STRONG;
}

/**
 * Select the appropriate question type based on interview stage,
 * topic performance status, and whether this is a follow-up question.
 *
 * @param {number} questionCount     - The CURRENT question number being processed
 * @param {string} currentDifficulty
 * @param {string} topicStatus       - 'STRONG'|'DEVELOPING'|'PROBE'|'GAP'|'UNSEEN'
 * @param {string} answerEval        - ANSWER_EVALS member
 * @param {boolean} isFollowUp
 * @returns {string} QUESTION_TYPES member
 */
function selectQuestionType(questionCount, currentDifficulty, topicStatus, answerEval, isFollowUp) {
  // Follow-up question types
  if (isFollowUp) {
    if (answerEval === ANSWER_EVALS.STRONG)   return 'DEEP_DIVE';
    if (answerEval === ANSWER_EVALS.WEAK)     return 'WEAKNESS_PROBE';
    if (answerEval === ANSWER_EVALS.ADEQUATE) return 'SCENARIO';
    return 'CONCEPT';
  }

  // Highest-difficulty level always gets architecture questions
  if (currentDifficulty === 'ARCHITECTURE') return 'ARCHITECTURE';

  // Gap/Probe topics always get probed
  if (topicStatus === 'GAP' || topicStatus === 'PROBE') return 'WEAKNESS_PROBE';

  // Stage-based preferred types
  const stage = PROGRESSION_STAGES.find(s => questionCount >= s.minQ && questionCount <= s.maxQ);
  if (stage) {
    const preferred = stage.preferred;
    // Strong topics get the deeper type when available
    if (topicStatus === 'STRONG' && preferred.includes('DEEP_DIVE'))    return 'DEEP_DIVE';
    if (topicStatus === 'DEVELOPING' && preferred.includes('TRADEOFF')) return 'TRADEOFF';
    return preferred[0];
  }

  return 'APPLICATION';
}

/**
 * Select the next topic from the ranked list.
 * Priority:
 *   1. Uncovered AND unused days (when coverage requirement is unmet)
 *   2. Uncovered days (when coverage requirement is unmet)
 *   3. Any unused day
 *   4. Fallback: first ranked topic (prevents null)
 *
 * @param {Array}  rankedTopics   - Phase 6 TopicSelector output
 * @param {Array}  usedDays       - Days used as primary question topics
 * @param {Array}  coveredDays    - Days added to coveredCurriculumDays
 * @param {number} minDaysRequired
 * @returns {object|null} topic entry from rankedTopics
 */
function selectNextTopic(rankedTopics, usedDays, coveredDays, minDaysRequired) {
  if (!rankedTopics || rankedTopics.length === 0) return null;

  const usedSet    = new Set(Array.isArray(usedDays)    ? usedDays    : []);
  const coveredSet = new Set(Array.isArray(coveredDays) ? coveredDays : []);
  const needCoverage = coveredSet.size < minDaysRequired;

  // 1. If coverage needed: prefer uncovered + unused
  if (needCoverage) {
    const fresh = rankedTopics.find(t => !usedSet.has(t.day) && !coveredSet.has(t.day));
    if (fresh) return fresh;

    // 2. Uncovered (even if used before as follow-up)
    const uncovered = rankedTopics.find(t => !coveredSet.has(t.day));
    if (uncovered) return uncovered;
  }

  // 3. Any unused day
  const unused = rankedTopics.find(t => !usedSet.has(t.day));
  if (unused) return unused;

  // 4. Fallback — cycle through ranked list from start
  return rankedTopics[0];
}

/**
 * Initialize Phase 7 strategy fields into an existing session state object.
 * Reads Phase 6 topic data from state.rankedTopics (already set by createInitialSessionState).
 * This function is safe to call on states loaded from SQLite — it only sets missing fields.
 *
 * @param {object} state - Session state to augment (mutated in place)
 */
function initStrategyFields(state) {
  if (state.strategyPlan                    === undefined) state.strategyPlan = [];
  if (state.currentDifficultyLevel          === undefined) {
    state.currentDifficultyLevel = computeInitialDifficulty(
      state.candidateSnapshot?.yearsExperience ?? 0
    );
  }
  if (state.currentStrategyQuestionType     === undefined) state.currentStrategyQuestionType = null;
  if (state.followUpsUsedForCurrentQuestion === undefined) state.followUpsUsedForCurrentQuestion = 0;
  if (state.usedDays                        === undefined) state.usedDays = [];
  if (state.lastStrategyDecision            === undefined) state.lastStrategyDecision = null;
  if (state.lastAnswerEvaluation            === undefined) state.lastAnswerEvaluation = ANSWER_EVALS.UNKNOWN;
}

/**
 * Check whether the session state satisfies both completion invariants.
 * MUST return false if either invariant is unmet.
 *
 * Invariants:
 *   questionCount >= config.minQuestions (8)
 *   uniqueCoveredDays >= config.minCurriculumDays (4)
 *
 * @param {object} state
 * @returns {boolean}
 */
function canComplete(state) {
  const minQ    = config.minQuestions      ?? 8;
  const minDays = config.minCurriculumDays ?? 4;

  const qCount     = typeof state.currentQuestionNumber === 'number' ? state.currentQuestionNumber : 0;
  const covered    = Array.isArray(state.coveredCurriculumDays) ? state.coveredCurriculumDays : [];
  const uniqueDays = new Set(covered).size;

  return qCount >= minQ && uniqueDays >= minDays;
}

/**
 * Core strategy decision function.
 *
 * Returns a StrategyDecision that tells interviewPlanner.js:
 *   - nextAction  : what to do next
 *   - topic       : which curriculum day/topic to address
 *   - questionType: which question style to use
 *   - difficulty  : the difficulty level for the next question
 *   - reason      : short operational explanation (NOT chain-of-thought)
 *   - canComplete : whether completion criteria are currently met
 *
 * INVARIANT: nextAction === 'COMPLETE' is ONLY returned when both
 * completion criteria are satisfied. This check is enforced first,
 * before any other logic runs.
 *
 * @param {object}      state            - Full session state with Phase 7 fields
 * @param {string|null} candidateMessage - Candidate's latest response (null = first turn)
 * @returns {object} StrategyDecision
 */
function makeStrategyDecision(state, candidateMessage) {
  const minQ    = config.minQuestions      ?? 8;
  const minDays = config.minCurriculumDays ?? 4;

  // Read state with defensive fallbacks
  const questionCount  = typeof state.currentQuestionNumber === 'number' ? state.currentQuestionNumber : 1;
  const coveredArr     = Array.isArray(state.coveredCurriculumDays) ? state.coveredCurriculumDays : [];
  const uniqueDaysSet  = new Set(coveredArr);
  const usedDays       = Array.isArray(state.usedDays) ? state.usedDays : [];
  const followUps      = typeof state.followUpsUsedForCurrentQuestion === 'number'
                           ? state.followUpsUsedForCurrentQuestion : 0;
  const currentDiff    = state.currentDifficultyLevel
                           || computeInitialDifficulty(state.candidateSnapshot?.yearsExperience ?? 0);
  const rankedTopics   = Array.isArray(state.rankedTopics) ? state.rankedTopics : [];
  const isFirstTurn    = !candidateMessage;

  // ── COMPLETION INVARIANT (checked first, unconditionally) ──────────────
  if (questionCount >= minQ && uniqueDaysSet.size >= minDays) {
    return {
      nextAction      : NEXT_ACTIONS.COMPLETE,
      topic           : null,
      questionType    : 'SYNTHESIS',
      difficulty      : currentDiff,
      reason          : `Completion criteria met: ${questionCount} questions, ${uniqueDaysSet.size} unique curriculum days covered.`,
      mustCoverNewDay : false,
      canComplete     : true,
      answerEvaluation: ANSWER_EVALS.UNKNOWN,
    };
  }

  // ── EVALUATE LAST ANSWER ───────────────────────────────────────────────
  const answerEval    = evaluateAnswerDeterministic(candidateMessage);
  const mustCoverNewDay = uniqueDaysSet.size < minDays;

  // Determine current topic entry for follow-up context
  const lastCoveredDay    = coveredArr.length > 0 ? coveredArr[coveredArr.length - 1] : null;
  const currentTopicEntry = rankedTopics.find(t => t.day === lastCoveredDay) || null;
  const topicStatus       = currentTopicEntry ? (currentTopicEntry.status || 'UNSEEN') : 'UNSEEN';

  // ── FOLLOW-UP DECISION ─────────────────────────────────────────────────
  // Follow-ups are only allowed when:
  //   (a) not the first turn
  //   (b) follow-up budget not exhausted
  //   (c) we do not NEED to cover a new curriculum day
  const canFollowUp = !isFirstTurn && followUps < MAX_FOLLOWUPS_PER_QUESTION && !mustCoverNewDay;

  if (canFollowUp && answerEval === ANSWER_EVALS.STRONG) {
    const newDiff = adjustDifficulty(currentDiff, answerEval);
    const qType   = selectQuestionType(questionCount, newDiff, topicStatus, answerEval, true);
    return {
      nextAction      : NEXT_ACTIONS.DEEPEN,
      topic           : currentTopicEntry ? _compactTopic(currentTopicEntry) : null,
      questionType    : qType,
      difficulty      : newDiff,
      reason          : 'Strong answer; increasing depth on current topic.',
      mustCoverNewDay,
      canComplete     : false,
      answerEvaluation: answerEval,
    };
  }

  if (canFollowUp && answerEval === ANSWER_EVALS.WEAK) {
    const newDiff = adjustDifficulty(currentDiff, answerEval);
    return {
      nextAction      : NEXT_ACTIONS.REFRAME,
      topic           : currentTopicEntry ? _compactTopic(currentTopicEntry) : null,
      questionType    : 'WEAKNESS_PROBE',
      difficulty      : newDiff,
      reason          : 'Weak answer; reframing to test core understanding.',
      mustCoverNewDay,
      canComplete     : false,
      answerEvaluation: answerEval,
    };
  }

  // ── SELECT NEXT TOPIC ──────────────────────────────────────────────────
  const nextTopic = selectNextTopic(rankedTopics, usedDays, coveredArr, minDays);
  const newDiff   = adjustDifficulty(currentDiff, answerEval);
  const nextTopicStatus = nextTopic ? (nextTopic.status || 'UNSEEN') : 'UNSEEN';
  const qType     = selectQuestionType(questionCount, newDiff, nextTopicStatus, answerEval, false);

  const nextAction = isFirstTurn
    ? NEXT_ACTIONS.ASK_NEW_TOPIC
    : mustCoverNewDay
      ? NEXT_ACTIONS.ASK_NEW_TOPIC
      : NEXT_ACTIONS.TRANSITION;

  const reason = mustCoverNewDay
    ? `Coverage required: only ${uniqueDaysSet.size}/${minDays} unique days covered so far.`
    : answerEval === ANSWER_EVALS.ADEQUATE
      ? 'Adequate answer; advancing to next priority topic.'
      : `Answer evaluated as ${answerEval}; transitioning to maintain interview breadth.`;

  return {
    nextAction,
    topic           : nextTopic ? _compactTopic(nextTopic) : null,
    questionType    : qType,
    difficulty      : newDiff,
    reason,
    mustCoverNewDay,
    canComplete     : false,
    answerEvaluation: answerEval,
  };
}

/**
 * Apply a strategy decision to the session state.
 * Mutates state — updates all Phase 7 tracking fields.
 * Safe to call multiple times — all mutations are idempotent where possible.
 *
 * @param {object} state    - Session state (mutated)
 * @param {object} decision - Output of makeStrategyDecision()
 */
function applyStrategyDecision(state, decision) {
  if (!state || !decision) return;

  // Update difficulty
  if (decision.difficulty) {
    state.currentDifficultyLevel = decision.difficulty;
  }

  // Update question type
  if (decision.questionType) {
    state.currentStrategyQuestionType = decision.questionType;
  }

  // Update follow-up counter and covered days
  if (decision.nextAction === NEXT_ACTIONS.DEEPEN ||
      decision.nextAction === NEXT_ACTIONS.REFRAME ||
      decision.nextAction === NEXT_ACTIONS.FOLLOW_UP) {
    state.followUpsUsedForCurrentQuestion = (state.followUpsUsedForCurrentQuestion || 0) + 1;
    // Follow-up: same topic day stays covered (no new day to add)

  } else if (decision.nextAction === NEXT_ACTIONS.ASK_NEW_TOPIC ||
             decision.nextAction === NEXT_ACTIONS.TRANSITION) {
    // New primary question → reset follow-up counter
    state.followUpsUsedForCurrentQuestion = 0;

    // Register this day as "used" (primary question slot consumed)
    if (decision.topic && typeof decision.topic.day === 'number') {
      if (!Array.isArray(state.usedDays)) state.usedDays = [];
      if (!state.usedDays.includes(decision.topic.day)) {
        state.usedDays.push(decision.topic.day);
      }
    }
  }

  // Add topic day to coveredCurriculumDays (for any non-COMPLETE action with a topic)
  if (decision.nextAction !== NEXT_ACTIONS.COMPLETE && decision.topic) {
    if (typeof decision.topic.day === 'number') {
      if (!Array.isArray(state.coveredCurriculumDays)) state.coveredCurriculumDays = [];
      if (!state.coveredCurriculumDays.includes(decision.topic.day)) {
        state.coveredCurriculumDays.push(decision.topic.day);
      }
    }
  }

  // Store a compact record of the last decision (no chain-of-thought)
  state.lastStrategyDecision = {
    nextAction  : decision.nextAction,
    questionType: decision.questionType,
    difficulty  : decision.difficulty,
    day         : decision.topic ? decision.topic.day : null,
    reason      : decision.reason,
  };

  state.lastAnswerEvaluation = decision.answerEvaluation || ANSWER_EVALS.UNKNOWN;

  // Append to strategy plan (not for COMPLETE)
  if (decision.nextAction !== NEXT_ACTIONS.COMPLETE) {
    if (!Array.isArray(state.strategyPlan)) state.strategyPlan = [];
    const qNum = (state.currentQuestionNumber || 0) + 1;
    state.strategyPlan.push({
      questionNumber: qNum,
      questionId    : `q-${String(qNum).padStart(3, '0')}`,
      day           : decision.topic ? decision.topic.day  : null,
      topic         : decision.topic ? decision.topic.title : null,
      objective     : decision.topic ? (decision.topic.objective || '') : null,
      type          : decision.questionType,
      difficulty    : decision.difficulty,
      reason        : decision.reason,
      status        : 'PENDING',
    });
  }
}

// ── Internal helper ────────────────────────────────────────────────────────

/** Build a compact topic object from a rankedTopic entry (for decision output). */
function _compactTopic(topicEntry) {
  const compact = getDayCompact(topicEntry.day);
  return {
    day      : topicEntry.day,
    title    : topicEntry.title,
    status   : topicEntry.status || 'UNSEEN',
    objective: compact ? (compact.objectives[0] || '') : '',
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Exports
// ════════════════════════════════════════════════════════════════════════════

module.exports = {
  // Constants
  DIFFICULTY_LEVELS,
  QUESTION_TYPES,
  NEXT_ACTIONS,
  ANSWER_EVALS,
  MAX_FOLLOWUPS_PER_QUESTION,

  // Core API
  computeInitialDifficulty,
  adjustDifficulty,
  evaluateAnswerDeterministic,
  selectQuestionType,
  selectNextTopic,
  initStrategyFields,
  makeStrategyDecision,
  applyStrategyDecision,
  canComplete,
};
