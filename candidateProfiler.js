/**
 * candidateProfiler.js
 * Deterministic CandidateProfiler.
 * Derives a structured profile from a raw candidate object (candidates.json schema).
 * Makes NO subjective quality judgments ("good", "bad", "smart", "weak", etc.).
 * Learning signals are interview-strategy inputs only.
 */

'use strict';

/**
 * Classify a single mission's performance status.
 *
 * STRONG     — passed, low attempts (1)
 * DEVELOPING — passed, multiple attempts (>1)
 * PROBE      — not passed (passed === false, not skipped)
 * GAP        — explicitly skipped
 * UNSEEN     — no evidence (should not appear here; used in mapping layer)
 *
 * @param {{ passed?: boolean, skipped?: boolean, attempts?: number }} mission
 * @returns {'STRONG'|'DEVELOPING'|'PROBE'|'GAP'}
 */
function classifyTopicPerformance(mission) {
  if (!mission) return 'UNSEEN';

  if (mission.skipped === true) return 'GAP';

  if (mission.passed === false) return 'PROBE';

  if (mission.passed === true) {
    const attempts = typeof mission.attempts === 'number' ? mission.attempts : 1;
    return attempts === 1 ? 'STRONG' : 'DEVELOPING';
  }

  // No usable evidence
  return 'UNSEEN';
}

/**
 * Build a complete deterministic profile from a raw candidate object.
 *
 * @param {object} candidate - One element from candidates.json
 * @returns {object} Structured candidate profile
 */
function buildCandidateProfile(candidate) {
  if (!candidate || !candidate.member) {
    throw new Error('Invalid candidate object: missing member field');
  }

  const member   = candidate.member   || {};
  const missions = Array.isArray(candidate.missions) ? candidate.missions : [];
  const signals  = candidate.signals  || {};

  // ── Member identifiers ────────────────────────────────────────────────────
  const id             = member.id             || 'UNKNOWN';
  const name           = member.name           || 'Candidate';
  const jobRole        = member.jobRole        || 'Not specified';
  const yearsExperience= typeof member.yearsExperience === 'number'
                           ? member.yearsExperience : 0;
  const education      = member.education      || 'Not specified';
  const status         = member.status         || 'UNKNOWN';

  // ── Signals ───────────────────────────────────────────────────────────────
  const commitDays          = typeof signals.commitDays          === 'number' ? signals.commitDays          : 0;
  const missionsCompleted   = typeof signals.missionsCompleted   === 'number' ? signals.missionsCompleted   : 0;
  const missionsFirstTry    = typeof signals.missionsFirstTry    === 'number' ? signals.missionsFirstTry    : 0;

  // ── Mission classification ────────────────────────────────────────────────
  const classifiedMissions = missions.map(m => ({
    day      : m.day,
    title    : m.title || '',
    attempts : typeof m.attempts === 'number' ? m.attempts : (m.skipped ? 0 : 1),
    passed   : m.passed  === true,
    skipped  : m.skipped === true,
    status   : classifyTopicPerformance(m),
  }));

  const completedDays  = classifiedMissions.filter(m => m.passed).map(m => m.day);
  const failedDays     = classifiedMissions.filter(m => !m.passed && !m.skipped && m.status === 'PROBE').map(m => m.day);
  const skippedDays    = classifiedMissions.filter(m => m.skipped).map(m => m.day);
  const strongDays     = classifiedMissions.filter(m => m.status === 'STRONG').map(m => m.day);
  const developingDays = classifiedMissions.filter(m => m.status === 'DEVELOPING').map(m => m.day);

  // Attempt-pattern analysis: count missions requiring ≥3 attempts
  const highAttemptMissions = classifiedMissions.filter(m => m.attempts >= 3);

  return {
    id,
    name,
    jobRole,
    yearsExperience,
    education,
    status,

    // Signals (raw numbers only; no interpretation)
    commitDays,
    missionsCompleted,
    missionsFirstTry,

    // Mission day sets
    completedDays,
    failedDays,
    skippedDays,
    strongDays,
    developingDays,
    highAttemptMissions,

    // Full classified mission list for downstream use
    classifiedMissions,
  };
}

module.exports = {
  classifyTopicPerformance,
  buildCandidateProfile,
};
