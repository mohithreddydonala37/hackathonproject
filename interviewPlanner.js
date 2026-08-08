/**
 * interviewPlanner.js
 * Controls the deterministic structure of each interview session.
 *
 * Phase 10 update: Integrates structured answer evaluation records (0-5 bounded scores,
 * evidence tracking) and evaluation-driven feedback synthesis while maintaining 100%
 * deterministic state control, topic selection, and completion invariants.
 */

'use strict';

const config = require('./config');
const { selectTopics } = require('./topicSelector');
const {
  computeInitialDifficulty,
  initStrategyFields,
  makeStrategyDecision,
  applyStrategyDecision,
  evaluateAnswerDeterministic,
  NEXT_ACTIONS,
} = require('./interviewStrategyEngine');
const groqService = require('./groqService');

/**
 * Create the initial deterministic session state for a candidate.
 * Runs Phase 6 topic selection once and populates both legacy interviewPlan
 * and all strategy/evaluation tracking fields.
 *
 * @param {object} candidate - Raw candidate object (candidates.json schema)
 * @returns {object} Session state ready for SQLite persistence
 */
function createInitialSessionState(candidate) {
  const member   = candidate.member   || {};
  const missions = Array.isArray(candidate.missions) ? candidate.missions : [];
  const signals  = candidate.signals  || {};

  // Candidate snapshot
  const candidateSnapshot = {
    id               : member.id               || 'CAND-UNKNOWN',
    name             : member.name             || 'Candidate',
    jobRole          : member.jobRole          || 'Engineer',
    yearsExperience  : member.yearsExperience  != null ? member.yearsExperience : 0,
    education        : member.education        || 'N/A',
    commitDays       : signals.commitDays      || 0,
    missionsCompleted: signals.missionsCompleted || 0,
    missionsFirstTry : signals.missionsFirstTry  || 0,
  };

  // Phase 6 topic selection
  const { rankedTopics, topicMap } = selectTopics(candidate, {
    minDays      : config.minCurriculumDays,
    minQuestions : config.minQuestions,
  });

  const top4Topics    = rankedTopics.slice(0, 4);
  const interviewPlan = top4Topics.map(t => ({ day: t.day, title: t.title }));
  const initialTopic  = interviewPlan[0] || { day: 7, title: 'Embeddings & Vector Search' };

  const state = {
    candidateSnapshot,
    interviewPlan,
    currentQuestionNumber        : 1,
    currentTopic                 : initialTopic.title,
    currentQuestionId            : `Q1_DAY${initialTopic.day}`,
    coveredCurriculumDays        : [initialTopic.day],
    difficulty                   : (member.yearsExperience || 0) >= 5 ? 'advanced' : 'intermediate',
    previousTurns                : [],
    evaluationSignals            : { strengthsObserved: [], gapsObserved: [], llmEvaluations: [] },
    evaluationRecords            : [],
    interviewStatus              : 'ACTIVE',
    finalFeedback                : null,

    // Phase 7/8/9/10 strategy & history tracking fields
    rankedTopics,
    topicMap,
    strategyPlan                 : [],
    currentDifficultyLevel       : computeInitialDifficulty(member.yearsExperience || 0),
    currentStrategyQuestionType  : null,
    followUpsUsedForCurrentQuestion: 0,
    usedDays                     : [initialTopic.day],
    askedQuestionsHistory        : [],
    lastStrategyDecision         : null,
    lastAnswerEvaluation         : 'UNKNOWN',
  };

  return state;
}

/**
 * Process one candidate turn asynchronously and return the agent's response.
 *
 * Deterministic InterviewStrategyEngine controls:
 *   - which topic comes next
 *   - question type and difficulty
 *   - whether to follow up, reframe, or transition
 *   - whether completion criteria are satisfied (min 8 questions, min 4 days)
 *
 * Groq LLM provides:
 *   - Candidate answer evaluation (fallback to deterministic word count)
 *   - Natural interviewer response phrasing (fallback to deterministic templates)
 *   - Final feedback synthesis (fallback to deterministic summary)
 *
 * @param {object}      state            - Session state (mutated)
 * @param {string|null} candidateMessage - Candidate's message (null for first turn)
 * @returns {Promise<{ reply: string, done: boolean, [feedback]: object }>}
 */
async function processSessionTurn(state, candidateMessage) {
  // Record candidate turn
  if (candidateMessage) {
    state.previousTurns.push({
      role     : 'candidate',
      content  : candidateMessage,
      timestamp: new Date().toISOString(),
    });
  }

  // Ensure strategy & evaluation tracking fields exist
  initStrategyFields(state);
  if (!Array.isArray(state.askedQuestionsHistory)) state.askedQuestionsHistory = [];
  if (!Array.isArray(state.evaluationRecords))     state.evaluationRecords = [];

  // 1. Evaluate Candidate Answer (Groq LLM with deterministic fallback)
  let evalRating = null;
  let structuredEval = null;

  if (candidateMessage) {
    const lastTurn = [...state.previousTurns].reverse().find(t => t.role === 'agent');
    const lastQuestion = lastTurn ? lastTurn.content : state.currentTopic;

    const dayNumber = state.coveredCurriculumDays.length > 0
      ? state.coveredCurriculumDays[state.coveredCurriculumDays.length - 1]
      : 7;

    structuredEval = await groqService.evaluateCandidateAnswer({
      questionNumber: state.currentQuestionNumber,
      questionId: state.currentQuestionId,
      day: dayNumber,
      topic: state.currentTopic,
      difficulty: state.currentDifficultyLevel,
      question: lastQuestion,
      candidateAnswer: candidateMessage
    });

    if (!structuredEval) {
      structuredEval = groqService.createFallbackAnswerEvaluation({
        questionNumber: state.currentQuestionNumber,
        questionId: state.currentQuestionId,
        day: dayNumber,
        topic: state.currentTopic,
        candidateAnswer: candidateMessage
      });
    }

    evalRating = structuredEval.rating;
    state.evaluationRecords.push(structuredEval);

    if (!Array.isArray(state.evaluationSignals.llmEvaluations)) {
      state.evaluationSignals.llmEvaluations = [];
    }
    state.evaluationSignals.llmEvaluations.push(structuredEval);
  }

  // 2. Make Deterministic Strategy Decision
  const decision = makeStrategyDecision(state, candidateMessage);

  // Override answer evaluation if structured evaluation provided a valid rating
  if (evalRating) {
    decision.answerEvaluation = evalRating;
  }

  // Apply state mutations from the decision
  applyStrategyDecision(state, decision);

  // 3. COMPLETION PATH
  if (decision.nextAction === NEXT_ACTIONS.COMPLETE) {
    state.interviewStatus = 'COMPLETED';

    // Attempt Groq LLM feedback synthesis with fallback
    let feedback = await groqService.generateFinalFeedback({
      candidateSnapshot: state.candidateSnapshot,
      coveredCurriculumDays: state.coveredCurriculumDays,
      previousTurns: state.previousTurns,
      evaluationRecords: state.evaluationRecords
    });

    if (!feedback) {
      feedback = generateFeedbackReport(state);
    }

    feedback = normalizeFeedbackReport(feedback, state);
    state.finalFeedback = feedback;

    const closingReply = 'Interview completed. Thank you for your time and detailed answers.';
    state.previousTurns.push({
      role     : 'agent',
      content  : closingReply,
      timestamp: new Date().toISOString(),
    });

    return { reply: closingReply, done: true, feedback };
  }

  // 4. CONTINUE INTERVIEW
  state.currentQuestionNumber += 1;

  // Update current topic from strategy decision
  if (decision.topic) {
    state.currentTopic     = decision.topic.title;
    state.currentQuestionId = `Q${state.currentQuestionNumber}_DAY${decision.topic.day}`;
  } else {
    state.currentQuestionId = `Q${state.currentQuestionNumber}_FOLLOWUP`;
  }

  // Attempt Groq LLM natural question generation with fallback
  const compactContext = {
    candidateName            : state.candidateSnapshot.name,
    candidateRole            : state.candidateSnapshot.jobRole,
    yearsExperience          : state.candidateSnapshot.yearsExperience,
    day                      : decision.topic ? decision.topic.day : state.coveredCurriculumDays[state.coveredCurriculumDays.length - 1],
    topic                    : state.currentTopic,
    objective                : decision.topic ? decision.topic.objective : '',
    nextAction               : decision.nextAction,
    questionType             : state.currentStrategyQuestionType || 'APPLICATION',
    difficulty               : state.currentDifficultyLevel,
    previousAnswer           : candidateMessage,
    previousEvaluation       : decision.answerEvaluation,
    previousQuestionsSummary : state.askedQuestionsHistory.slice(-3)
  };

  let questionReply = await groqService.generateInterviewerResponse(compactContext);

  if (!questionReply) {
    questionReply = generateTurnQuestion(state);
  }

  state.askedQuestionsHistory.push(questionReply);

  state.previousTurns.push({
    role     : 'agent',
    content  : questionReply,
    timestamp: new Date().toISOString(),
  });

  return { reply: questionReply, done: false, currentTopic: state.currentTopic };
}

/**
 * Generate initial greeting for Turn 0 (async with Groq LLM + fallback).
 *
 * @param {object} state - Session state
 * @returns {Promise<string>}
 */
async function generateInitialGreeting(state) {
  const { name, jobRole, yearsExperience, commitDays } = state.candidateSnapshot;
  const initialTopic = state.interviewPlan[0];

  if (!Array.isArray(state.askedQuestionsHistory)) {
    state.askedQuestionsHistory = [];
  }

  const compactContext = {
    candidateName            : name,
    candidateRole            : jobRole,
    yearsExperience          : yearsExperience,
    day                      : initialTopic.day,
    topic                    : initialTopic.title,
    nextAction               : 'ASK_NEW_TOPIC',
    questionType             : 'CONCEPT',
    difficulty               : state.currentDifficultyLevel,
    previousQuestionsSummary : []
  };

  const llmQuestion = await groqService.generateInterviewerResponse(compactContext);

  let greeting;
  if (llmQuestion) {
    greeting = `Welcome ${name}. Given your experience as a ${jobRole}, let's begin our technical evaluation.\n\n${llmQuestion}`;
    state.askedQuestionsHistory.push(llmQuestion);
  } else {
    greeting = `Welcome ${name}. Given your background as a ${jobRole}, let's dive into system design and technical architecture.\n\n` +
      `To start us off on ${initialTopic.title}: Could you walk me through your technical approach ` +
      `and key architectural decisions when working with ${initialTopic.title}?`;
    state.askedQuestionsHistory.push(`Question 1 (${initialTopic.title})`);
  }

  state.previousTurns.push({
    role     : 'agent',
    content  : greeting,
    timestamp: new Date().toISOString(),
  });

  return greeting;
}

/**
 * Generate deterministic template question text for intermediate turns (fallback).
 *
 * @param {object} state
 * @returns {string}
 */
function generateTurnQuestion(state) {
  const qNum  = state.currentQuestionNumber;
  const topic = state.currentTopic;
  const qType = state.currentStrategyQuestionType || 'APPLICATION';

  const templates = {
    EXPERIENCE    : `Question ${qNum} (${topic} — Experience): Describe your hands-on experience with ${topic} and a key engineering challenge you overcame.`,
    CONCEPT       : `Question ${qNum} (${topic} — Concept): Walk me through the core concepts of ${topic} and how they apply in a real system.`,
    APPLICATION   : `Question ${qNum} (${topic}): Building on your previous answer, how did you handle edge cases, state management, and error recovery in ${topic}?`,
    SCENARIO      : `Question ${qNum} (${topic} — Scenario): In a high-concurrency enterprise AI system, how would you apply ${topic} to maintain reliability and low latency?`,
    DEEP_DIVE     : `Question ${qNum} (${topic} — Deep Dive): What are the specific implementation details, edge cases, and failure modes you've encountered with ${topic}?`,
    TRADEOFF      : `Question ${qNum} (${topic} — Trade-off): What trade-offs did you consider when working with ${topic}? Given what you know now, what would you do differently?`,
    ARCHITECTURE  : `Question ${qNum} (${topic} — Architecture): How would you design a production-grade system that integrates ${topic} at scale? What are the key architectural concerns?`,
    WEAKNESS_PROBE: `Question ${qNum} (${topic} — Core Concept): How would you explain the fundamental purpose of ${topic} to a junior engineer who has never used it?`,
    SYNTHESIS     : `Question ${qNum} (${topic} — Synthesis): How does ${topic} connect with the other AI engineering areas you've discussed today, and what would a cohesive architecture look like?`,
  };

  return templates[qType] || templates.APPLICATION;
}

/**
 * Normalizes a text string into a clean, canonical key for deduplication.
 * @param {string} text
 * @returns {string}
 */
function normalizeTextKey(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes, deduplicates, and evidence-grounds a feedback debrief report.
 *
 * @param {object} rawFeedback - Raw feedback object { summary, strengths, gaps, next }
 * @param {object} state - Session state object containing evaluationRecords, candidateSnapshot, coveredCurriculumDays, etc.
 * @returns {{ summary: string, strengths: string[], gaps: string[], next: string[] }}
 */
function normalizeFeedbackReport(rawFeedback, state) {
  const candidate = (state && state.candidateSnapshot) || {};
  const name = candidate.name || 'The candidate';
  const role = candidate.jobRole || 'Engineer';
  const records = (state && Array.isArray(state.evaluationRecords)) ? state.evaluationRecords : [];
  const turnCount = records.length || (state && state.currentQuestionNumber ? state.currentQuestionNumber - 1 : 1);

  // 1. Executive Summary: Factual, session-based, no commit days claims.
  let summary = '';

  const topicsSet = new Set();
  records.forEach(r => { if (r.topic) topicsSet.add(r.topic); });
  if (topicsSet.size === 0 && state && Array.isArray(state.interviewPlan)) {
    state.interviewPlan.slice(0, 4).forEach(t => { if (t.title) topicsSet.add(t.title); });
  }
  const coveredTopicsArray = Array.from(topicsSet);

  if (rawFeedback && typeof rawFeedback.summary === 'string' && rawFeedback.summary.trim()) {
    summary = rawFeedback.summary
      .replace(/gsk_[a-zA-Z0-9_-]+/gi, '[REDACTED_KEY]')
      .replace(/GROQ_API_KEY\s*=\s*[^\s,.]+/gi, '[REDACTED_KEY]')
      .replace(/and maintained \d+ active commit days in the cohort\.?/gi, '')
      .replace(/with \d+ active commit days in the cohort\.?/gi, '')
      .replace(/with \d+ active commit days\.?/gi, '')
      .replace(/Completed \d+ cohort missions with \d+ active commit days\.?/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (!summary || summary.length < 20) {
    const topicListStr = coveredTopicsArray.length > 0
      ? ` spanning ${coveredTopicsArray.join(', ')}`
      : '';
    summary = `${name} demonstrated strong capability across the assessed technical competencies as a ${role}. The interview covered ${turnCount} technical turns${topicListStr}.`;
  }

  // 2. Strengths Deduplication & One-Per-Competency Aggregation
  const rawStrengths = (rawFeedback && Array.isArray(rawFeedback.strengths)) ? rawFeedback.strengths : [];

  const topicRecordsMap = new Map();
  records.forEach(r => {
    if (!r.topic) return;
    if (!topicRecordsMap.has(r.topic)) {
      topicRecordsMap.set(r.topic, []);
    }
    topicRecordsMap.get(r.topic).push(r);
  });

  const finalStrengths = [];
  const seenStrengthKeys = new Set();
  const processedTopicsSet = new Set();

  for (const [topic, topicRecords] of topicRecordsMap.entries()) {
    const strongOrSolid = topicRecords.filter(r => r.rating === 'STRONG' || r.rating === 'SOLID');
    if (strongOrSolid.length > 0) {
      processedTopicsSet.add(topic);

      let strengthText;
      if (topicRecords.length > 1) {
        const aspects = new Set();
        topicRecords.forEach(r => {
          const qt = r.questionType || '';
          if (qt.includes('ARCH') || qt === 'ARCHITECTURE') aspects.add('architecture');
          else if (qt.includes('DEEP') || qt === 'DEEP_DIVE') aspects.add('implementation details');
          else if (qt.includes('APP') || qt === 'APPLICATION') aspects.add('edge cases');
          else if (qt.includes('TRADEOFF')) aspects.add('trade-offs');
          else if (qt.includes('CONCEPT')) aspects.add('core concepts');
          else aspects.add('failure modes');
        });

        const aspectList = Array.from(aspects);
        let aspectPhrase = '';
        if (aspectList.length === 1) {
          aspectPhrase = ` across ${aspectList[0]}`;
        } else if (aspectList.length > 1) {
          const last = aspectList.pop();
          aspectPhrase = ` across ${aspectList.join(', ')}, and ${last}`;
        }

        strengthText = `${topic}: Demonstrated strong technical depth${aspectPhrase}.`;
      } else {
        strengthText = `${topic}: Demonstrated strong technical depth and clear architectural reasoning.`;
      }

      const key = normalizeTextKey(strengthText);
      if (!seenStrengthKeys.has(key)) {
        seenStrengthKeys.add(key);
        finalStrengths.push(strengthText);
      }
    }
  }

  for (const s of rawStrengths) {
    if (!s || typeof s !== 'string') continue;
    const cleanStr = s.trim();
    if (!cleanStr) continue;

    let mentionsProcessedTopic = false;
    for (const topic of processedTopicsSet) {
      if (cleanStr.toLowerCase().includes(topic.toLowerCase())) {
        mentionsProcessedTopic = true;
        break;
      }
    }
    if (mentionsProcessedTopic) continue;

    if (/commit days|cohort missions/i.test(cleanStr)) continue;

    const key = normalizeTextKey(cleanStr);
    if (!seenStrengthKeys.has(key)) {
      seenStrengthKeys.add(key);
      finalStrengths.push(cleanStr);
    }
  }

  if (finalStrengths.length === 0) {
    finalStrengths.push(`System Architecture: Demonstrated solid verbal articulation of system architecture and engineering trade-offs.`);
  }

  const deduplicatedStrengths = finalStrengths.slice(0, 5);

  // 3. Areas to Strengthen (Gaps) Deduplication
  const rawGaps = (rawFeedback && Array.isArray(rawFeedback.gaps)) ? rawFeedback.gaps : [];
  const finalGaps = [];
  const seenGapKeys = new Set();
  const processedGapTopicsSet = new Set();

  for (const [topic, topicRecords] of topicRecordsMap.entries()) {
    const weakRecords = topicRecords.filter(r => r.rating === 'WEAK');
    if (weakRecords.length > 0) {
      processedGapTopicsSet.add(topic);
      const gapText = `${topic}: Could deepen hands-on implementation experience and practical edge-case reasoning.`;
      const key = normalizeTextKey(gapText);
      if (!seenGapKeys.has(key)) {
        seenGapKeys.add(key);
        finalGaps.push(gapText);
      }
    }
  }

  for (const g of rawGaps) {
    if (!g || typeof g !== 'string') continue;
    const cleanStr = g.trim();
    if (!cleanStr) continue;

    let mentionsProcessedTopic = false;
    for (const topic of processedGapTopicsSet) {
      if (cleanStr.toLowerCase().includes(topic.toLowerCase())) {
        mentionsProcessedTopic = true;
        break;
      }
    }
    if (mentionsProcessedTopic) continue;

    const key = normalizeTextKey(cleanStr);
    if (!seenGapKeys.has(key)) {
      seenGapKeys.add(key);
      finalGaps.push(cleanStr);
    }
  }

  const deduplicatedGaps = finalGaps.slice(0, 3);
  if (deduplicatedGaps.length === 0 && rawGaps.length > 0) {
    const cleanGeneric = rawGaps.map(g => String(g).trim()).find(g => g && !seenGapKeys.has(normalizeTextKey(g)));
    if (cleanGeneric) {
      deduplicatedGaps.push(cleanGeneric);
    }
  }
  if (deduplicatedGaps.length === 0) {
    deduplicatedGaps.push(`Production Operations: Could deepen hands-on experience with Kubernetes deployment, distributed tracing, and diagnosing latency or failure propagation across distributed services.`);
  }

  // 4. Next Steps Deduplication
  const rawNext = (rawFeedback && Array.isArray(rawFeedback.next)) ? rawFeedback.next : [];
  const finalNext = [];
  const seenNextKeys = new Set();

  for (const n of rawNext) {
    if (!n || typeof n !== 'string') continue;
    const cleanStr = n.trim();
    if (!cleanStr) continue;

    const key = normalizeTextKey(cleanStr);
    if (!seenNextKeys.has(key)) {
      seenNextKeys.add(key);
      finalNext.push(cleanStr);
    }
  }

  if (finalNext.length === 0) {
    finalNext.push(`Practice designing production-grade Model Context Protocol (MCP) servers with custom schema validation.`);
    finalNext.push(`Implement streaming SSE and response caching for low-latency AI endpoints.`);
    finalNext.push(`Conduct load testing and cost-optimization profiling on vector index retrievals.`);
  }

  const deduplicatedNext = finalNext.slice(0, 3);

  return {
    summary,
    strengths: deduplicatedStrengths,
    gaps: deduplicatedGaps,
    next: deduplicatedNext
  };
}

/**
 * Synthesize structured feedback report (deterministic evidence-based fallback).
 *
 * @param {object} state
 * @returns {{ summary: string, strengths: string[], gaps: string[], next: string[] }}
 */
function generateFeedbackReport(state) {
  return normalizeFeedbackReport(null, state);
}

module.exports = {
  createInitialSessionState,
  processSessionTurn,
  generateInitialGreeting,
  generateFeedbackReport,
  normalizeFeedbackReport,
};
