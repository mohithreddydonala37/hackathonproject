/**
 * topicSelector.js
 * Deterministic TopicSelector.
 *
 * Maps candidate mission history → curriculum days → topic profile,
 * then produces a ranked list of interview topics.
 *
 * Selection rules (all deterministic — no LLM involvement):
 *   1. Candidate's own mission days are the primary pool.
 *   2. GAP/PROBE topics are prioritised for probing.
 *   3. DEVELOPING topics are included for depth exploration.
 *   4. STRONG topics are included for expert validation.
 *   5. UNSEEN curriculum days fill remaining slots for diversity.
 *   6. At least 4 unique curriculum days must be selectable.
 *   7. jobRole and yearsExperience weight topic priority.
 *   8. No fixed day sequence — sequence is candidate-driven.
 */

'use strict';

const { buildCandidateProfile } = require('./candidateProfiler');
const { getDay, getDayCompact, getAllDayNumbers } = require('./curriculumIndexer');

// ── Role-to-domain affinity weights ─────────────────────────────────────────
// Higher = more relevant to that role.
// Keys are lowercase substrings that appear in jobRole values.
const ROLE_AFFINITIES = {
  'data engineer'      : { embeddings: 2, retrieval: 2, deployment: 1 },
  'ai engineer'        : { agents: 2, mcp: 2, rag: 2, embeddings: 1 },
  'software engineer'  : { api: 2, backend: 2, deployment: 1 },
  'backend'            : { api: 2, backend: 2, streaming: 1 },
  'devops'             : { deployment: 3, monitoring: 3, docker: 3 },
  'architect'          : { agents: 2, deployment: 2, design: 2, mcp: 1 },
  'mobile'             : { api: 2, streaming: 1, frontend: 1 },
  'security'           : { security: 3, guardrails: 3 },
  'business analyst'   : { prompting: 2, evaluation: 1 },
  'marketing'          : { prompting: 2, chatbot: 1 },
  'hr'                 : { prompting: 2, chatbot: 1 },
  'ux'                 : { frontend: 2, chatbot: 1 },
  'intern'             : { fundamentals: 1 },
  'junior'             : { fundamentals: 1 },
  'legacy'             : { api: 1 },
  'it support'         : { fundamentals: 1 },
  'distinguished'      : { agents: 2, mcp: 2, security: 2 },
  'principal'          : { agents: 2, architecture: 2, deployment: 2 },
};

// Day-to-domain tags (maps curriculum day → searchable domain keywords)
const DAY_DOMAIN_TAGS = {
  1 : ['setup', 'tooling', 'fundamentals'],
  2 : ['setup', 'tooling', 'fundamentals'],
  3 : ['frontend', 'github', 'fundamentals'],
  4 : ['data', 'sql', 'structured'],
  5 : ['data', 'unstructured', 'processing'],
  6 : ['knowledge-base', 'data'],
  7 : ['embeddings', 'vectors', 'rag', 'ai_core'],
  8 : ['embeddings', 'vectors', 'rag', 'vector-db'],
  9 : ['embeddings', 'vector-db', 'rag'],
  10: ['retrieval', 'rag', 'matching'],
  11: ['rag', 'llm', 'api'],
  12: ['prompting', 'llm', 'fundamentals'],
  13: ['function-calling', 'structured-outputs', 'api', 'pydantic'],
  14: ['fine-tuning', 'llm'],
  15: ['fine-tuning', 'lora', 'llm'],
  16: ['api', 'backend', 'chatbot'],
  17: ['frontend', 'chatbot'],
  18: ['streaming', 'api', 'backend'],
  19: ['formatting', 'outputs', 'pydantic'],
  20: ['memory', 'context', 'chatbot'],
  21: ['agents', 'langchain', 'rag'],
  22: ['agents', 'multi-agent', 'orchestration'],
  23: ['mcp', 'agents', 'tools'],
  24: ['agents', 'mcp', 'integration'],
  25: ['evaluation', 'testing'],
  26: ['performance', 'cost', 'optimization'],
  27: ['security', 'guardrails', 'privacy'],
  28: ['deployment', 'docker', 'kubernetes'],
  29: ['monitoring', 'logging', 'observability'],
  30: ['production', 'testing', 'deployment'],
  31: ['capstone', 'demo', 'production'],
};

/**
 * Compute a role-relevance boost for a curriculum day.
 * Returns a number ≥ 0 (higher = more relevant to the candidate's role).
 */
function _roleBoost(dayNumber, jobRole) {
  const tags   = DAY_DOMAIN_TAGS[dayNumber] || [];
  const role   = (jobRole || '').toLowerCase();
  let   boost  = 0;

  for (const [roleKey, affinities] of Object.entries(ROLE_AFFINITIES)) {
    if (!role.includes(roleKey)) continue;
    for (const [domain, weight] of Object.entries(affinities)) {
      if (tags.some(t => t.includes(domain))) {
        boost += weight;
      }
    }
  }
  return boost;
}

/**
 * Map candidate profile → per-day topic records.
 *
 * Returns an array of:
 * { day, title, status, attempts, relevance, roleBoost }
 *
 * @param {object} profile - Output of buildCandidateProfile()
 * @returns {Array<object>}
 */
function mapCandidateToCurriculumTopics(profile) {
  const allDays = getAllDayNumbers();

  // Build a lookup from mission day → classified mission
  const missionByDay = new Map();
  for (const m of profile.classifiedMissions) {
    missionByDay.set(m.day, m);
  }

  return allDays.map(dayNumber => {
    const dayObj   = getDay(dayNumber);
    const mission  = missionByDay.get(dayNumber);
    const status   = mission ? mission.status : 'UNSEEN';
    const attempts = mission ? mission.attempts : 0;

    // Relevance: 1.0 if candidate has evidence for this day, 0.5 otherwise
    const hasEvidence = missionByDay.has(dayNumber);
    const relevance   = hasEvidence ? 1.0 : 0.5;

    return {
      day      : dayNumber,
      title    : dayObj ? dayObj.title : `Day ${dayNumber}`,
      status,
      attempts,
      relevance,
      roleBoost: _roleBoost(dayNumber, profile.jobRole),
    };
  });
}

/**
 * Compute a numeric priority score for a topic record.
 * Higher score = ask this topic earlier in the interview.
 *
 * Scoring factors:
 *   - GAP/PROBE     : highest base score (interview must surface gaps)
 *   - DEVELOPING    : medium base (probe for depth)
 *   - STRONG        : lower base (validate/confirm strength)
 *   - UNSEEN        : lowest base (breadth filler)
 *   - roleBoost     : additive weight based on job role affinity
 *   - experienceBoost: senior candidates get harder topics boosted
 */
function _computePriority(topicRecord, yearsExperience) {
  const STATUS_BASE = { GAP: 10, PROBE: 9, DEVELOPING: 6, STRONG: 4, UNSEEN: 2 };
  const base       = STATUS_BASE[topicRecord.status] || 2;
  const role       = topicRecord.roleBoost;
  const expBoost   = yearsExperience >= 10 ? 1 : 0; // senior candidates: add 1 to everything
  return base + role + expBoost;
}

/**
 * Produce a ranked topic list for interview planning.
 * Guarantees at least minDays unique curriculum days.
 *
 * @param {object} candidate - Raw candidate object
 * @param {{ minDays?: number, minQuestions?: number }} opts
 * @returns {{
 *   profile: object,
 *   topicMap: Array<object>,
 *   rankedTopics: Array<object>
 * }}
 */
function selectTopics(candidate, opts = {}) {
  const minDays      = opts.minDays      || 4;
  const minQuestions = opts.minQuestions || 8;

  const profile  = buildCandidateProfile(candidate);
  const topicMap = mapCandidateToCurriculumTopics(profile);

  // Score every day
  const scored = topicMap.map(t => ({
    ...t,
    score: _computePriority(t, profile.yearsExperience),
  }));

  // Sort: highest score first; tie-break by day number ascending
  scored.sort((a, b) => b.score - a.score || a.day - b.day);

  // Ensure coverage: take enough to satisfy minDays and minQuestions
  // (each ranked topic represents one or more question opportunities)
  const needed = Math.max(minDays, Math.ceil(minQuestions / 2));
  const rankedTopics = scored.slice(0, Math.max(needed, minDays));

  // Verify the selection covers at least minDays unique days
  const uniqueDays = new Set(rankedTopics.map(t => t.day));
  if (uniqueDays.size < minDays) {
    // Fill from remaining scored topics not yet included
    const extraCandidates = scored.filter(t => !uniqueDays.has(t.day));
    for (const extra of extraCandidates) {
      if (uniqueDays.size >= minDays) break;
      rankedTopics.push(extra);
      uniqueDays.add(extra.day);
    }
    rankedTopics.sort((a, b) => b.score - a.score || a.day - b.day);
  }

  return { profile, topicMap, rankedTopics };
}

module.exports = {
  mapCandidateToCurriculumTopics,
  selectTopics,
};
