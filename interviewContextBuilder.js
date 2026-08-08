/**
 * interviewContextBuilder.js
 * Builds a compact LLM-ready interview context object.
 *
 * NEVER includes:
 *   - The full candidates.json
 *   - The full curriculum.json
 *   - Unrelated candidates
 *   - More than 3 objectives per topic
 *
 * The output is a token-efficient summary for Groq (Phase 7).
 */

'use strict';

const { selectTopics }  = require('./topicSelector');
const { getDayCompact } = require('./curriculumIndexer');

/**
 * Build a compact interview context for one candidate.
 *
 * @param {object} candidate - Raw candidate object (candidates.json element)
 * @param {{ minDays?: number, minQuestions?: number }} opts
 * @returns {object} Compact context ready for LLM prompt
 */
function buildInterviewContext(candidate, opts = {}) {
  const { profile, rankedTopics } = selectTopics(candidate, opts);

  // Partition topics by status
  const strengthTopics  = rankedTopics.filter(t => t.status === 'STRONG').map(t => t.title);
  const developingTopics= rankedTopics.filter(t => t.status === 'DEVELOPING').map(t => t.title);
  const probeTopics     = rankedTopics.filter(t => t.status === 'PROBE').map(t => t.title);
  const gapTopics       = rankedTopics.filter(t => t.status === 'GAP').map(t => t.title);
  const unseenTopics    = rankedTopics.filter(t => t.status === 'UNSEEN').map(t => t.title);

  // Build compact priority topics array (max 3 objectives each)
  const priorityTopics = rankedTopics.map(t => {
    const compact = getDayCompact(t.day);
    return {
      day       : t.day,
      topic     : t.title,
      status    : t.status,
      objectives: compact ? compact.objectives : [],
    };
  });

  return {
    candidate: {
      id        : profile.id,
      name      : profile.name,
      role      : profile.jobRole,
      experience: profile.yearsExperience,
      education : profile.education,
      commitDays: profile.commitDays,
    },
    missionSignals: {
      missionsCompleted: profile.missionsCompleted,
      missionsFirstTry : profile.missionsFirstTry,
      skippedDays      : profile.skippedDays,
      failedDays       : profile.failedDays,
    },
    strengthTopics,
    developingTopics,
    probeTopics,
    gapTopics,
    unseenTopics,
    priorityTopics,
    interviewMeta: {
      minQuestionsRequired: opts.minQuestions || 8,
      minDaysRequired     : opts.minDays      || 4,
      uniqueDaysCovered   : [...new Set(rankedTopics.map(t => t.day))],
    },
  };
}

module.exports = { buildInterviewContext };
