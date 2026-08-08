/**
 * testPhase6.js
 * Phase 6 Unit Tests — Deterministic Candidate + Curriculum Intelligence
 *
 * Tests:
 *   CandidateProfiler  — valid candidate, completed/failed/skipped/multi-attempt missions
 *   classifyTopicPerformance — STRONG / DEVELOPING / PROBE / GAP / UNSEEN
 *   CurriculumIndexer  — valid day, multiple days, invalid day, topic search
 *   TopicSelector      — role affinity, different candidates → different priorities,
 *                        GAP/PROBE surfaced, ≥4 unique days guaranteed
 *   InterviewContextBuilder — compact output, no full curriculum, no unrelated candidates
 */

'use strict';

const { classifyTopicPerformance, buildCandidateProfile } = require('./candidateProfiler');
const { getDay, getDays, searchTopics, getObjectives, getModule, getAllDayNumbers } = require('./curriculumIndexer');
const { selectTopics, mapCandidateToCurriculumTopics } = require('./topicSelector');
const { buildInterviewContext } = require('./interviewContextBuilder');
const { getCandidateById } = require('./dataLoader');

// ── Tiny test harness ──────────────────────────────────────────────────────
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

// ── Fixtures ───────────────────────────────────────────────────────────────

const STRONG_CANDIDATE = getCandidateById('CAND-001');   // Sarah Johnson — mixed STRONG/DEVELOPING/GAP
const ALL_STRONG_CANDIDATE = getCandidateById('CAND-018'); // Diane Foster — all attempts=1
const PROBE_CANDIDATE = getCandidateById('CAND-010');    // Gerald Combs  — has failed missions
const SKIP_HEAVY = getCandidateById('CAND-011');         // Mia Alvarez   — many skips
const INTERN_CANDIDATE = getCandidateById('CAND-007');   // Ethan Brooks  — intern, 0 yrs exp
const DEVOPS_CANDIDATE = getCandidateById('CAND-005');   // Michael Brown — DevOps
const ARCH_CANDIDATE = getCandidateById('CAND-015');     // Noah Kim      — Principal Architect

// ══════════════════════════════════════════════════════════════════════════
// 1. classifyTopicPerformance
// ══════════════════════════════════════════════════════════════════════════
section('1. classifyTopicPerformance');

assert(classifyTopicPerformance({ passed: true,  attempts: 1 }) === 'STRONG',     'passed + 1 attempt → STRONG');
assert(classifyTopicPerformance({ passed: true,  attempts: 3 }) === 'DEVELOPING', 'passed + 3 attempts → DEVELOPING');
assert(classifyTopicPerformance({ passed: false, attempts: 3 }) === 'PROBE',      'not passed → PROBE');
assert(classifyTopicPerformance({ skipped: true })              === 'GAP',         'skipped → GAP');
assert(classifyTopicPerformance(null)                           === 'UNSEEN',      'null mission → UNSEEN');
assert(classifyTopicPerformance(undefined)                      === 'UNSEEN',      'undefined mission → UNSEEN');
assert(classifyTopicPerformance({ passed: true, attempts: 2 })  === 'DEVELOPING', 'passed + 2 attempts → DEVELOPING');

// ══════════════════════════════════════════════════════════════════════════
// 2. CandidateProfiler — buildCandidateProfile
// ══════════════════════════════════════════════════════════════════════════
section('2. CandidateProfiler — buildCandidateProfile');

// 2a. Valid candidate: Sarah Johnson (CAND-001)
const p1 = buildCandidateProfile(STRONG_CANDIDATE);
assert(p1.id                === 'CAND-001',          'CAND-001: id extracted');
assert(p1.name              === 'Sarah Johnson',      'CAND-001: name extracted');
assert(p1.jobRole           === 'Senior Data Engineer','CAND-001: jobRole extracted');
assert(p1.yearsExperience   === 9,                   'CAND-001: yearsExperience = 9');
assert(p1.education         === 'MS Computer Science','CAND-001: education extracted');
assert(p1.commitDays        === 28,                  'CAND-001: commitDays = 28');
assert(p1.missionsCompleted === 30,                  'CAND-001: missionsCompleted = 30');
assert(p1.missionsFirstTry  === 20,                  'CAND-001: missionsFirstTry = 20');

// 2b. Completed missions (passed=true)
assert(p1.completedDays.includes(7),  'CAND-001: day 7 in completedDays');
assert(p1.completedDays.includes(22), 'CAND-001: day 22 in completedDays');

// 2c. Skipped missions → skippedDays
assert(p1.skippedDays.includes(29),   'CAND-001: day 29 in skippedDays (skipped)');
assert(!p1.completedDays.includes(29),'CAND-001: day 29 NOT in completedDays');

// 2d. Failed missions — CAND-010 Gerald Combs has passed:false
const p10 = buildCandidateProfile(PROBE_CANDIDATE);
assert(p10.failedDays.includes(8),    'CAND-010: day 8 in failedDays (passed:false)');
assert(p10.failedDays.includes(10),   'CAND-010: day 10 in failedDays (passed:false)');
assert(p10.failedDays.includes(22),   'CAND-010: day 22 in failedDays (passed:false)');

// 2e. Multiple attempts captured
const p4 = buildCandidateProfile(getCandidateById('CAND-004'));
assert(p4.highAttemptMissions.length > 0, 'CAND-004: highAttemptMissions non-empty');
const highAttemptDays = p4.highAttemptMissions.map(m => m.day);
assert(highAttemptDays.includes(8),  'CAND-004: day 8 had ≥3 attempts');
assert(highAttemptDays.includes(22), 'CAND-004: day 22 had ≥3 attempts');

// 2f. All-first-try candidate
const p18 = buildCandidateProfile(ALL_STRONG_CANDIDATE);
assert(p18.classifiedMissions.every(m => m.status === 'STRONG' || m.status === 'GAP' || m.status === 'PROBE'),
  'CAND-018: all missions are STRONG, GAP, or PROBE (none DEVELOPING)');
assert(p18.strongDays.includes(7),  'CAND-018: day 7 is STRONG');

// 2g. Error on missing member
let threw = false;
try { buildCandidateProfile({}); } catch(e) { threw = true; }
assert(threw, 'buildCandidateProfile throws on missing member');

// ══════════════════════════════════════════════════════════════════════════
// 3. CurriculumIndexer
// ══════════════════════════════════════════════════════════════════════════
section('3. CurriculumIndexer');

// 3a. Valid day lookup
const d7 = getDay(7);
assert(d7 !== null,                       'getDay(7) returns object');
assert(d7.day === 7,                      'getDay(7).day === 7');
assert(d7.title === 'Embeddings Explained','getDay(7).title correct');
assert(Array.isArray(d7.objectives),      'getDay(7).objectives is array');
assert(d7.objectives.length > 0,          'getDay(7) has objectives');

// 3b. Multiple day lookup
const multi = getDays([7, 13, 22, 28]);
assert(multi.length === 4,                'getDays([7,13,22,28]) returns 4 items');
assert(multi.map(d => d.day).includes(13),'getDays includes day 13');

// 3c. Invalid day
const dNull = getDay(99);
assert(dNull === null,                    'getDay(99) returns null');

const missing = getDays([99, 100]);
assert(missing.length === 0,              'getDays([99,100]) returns empty array');

// 3d. Topic search
const embResults = searchTopics('embedding');
assert(embResults.length > 0,             'searchTopics("embedding") finds results');
assert(embResults.some(d => d.day === 7), 'searchTopics("embedding") includes day 7');

const mcpResults = searchTopics('MCP');
assert(mcpResults.length > 0,             'searchTopics("MCP") finds results');
assert(mcpResults.some(d => d.day === 23),'searchTopics("MCP") includes day 23');

const noResults = searchTopics('zxqwerty');
assert(noResults.length === 0,            'searchTopics("zxqwerty") returns empty');

// 3e. getObjectives
const objs = getObjectives(13);
assert(Array.isArray(objs) && objs.length > 0, 'getObjectives(13) returns non-empty array');

const objsInvalid = getObjectives(999);
assert(Array.isArray(objsInvalid) && objsInvalid.length === 0, 'getObjectives(999) returns []');

// 3f. getModule
const mod7 = getModule(7);
assert(mod7 !== null,                                  'getModule(7) returns module');
assert(mod7.title === 'Embeddings & Vector Search',    'getModule(7) correct title');

// 3g. getAllDayNumbers
const allDays = getAllDayNumbers();
assert(Array.isArray(allDays) && allDays.length > 0,   'getAllDayNumbers returns array');
assert(allDays.includes(1) && allDays.includes(31),    'getAllDayNumbers spans day 1 to 31');

// ══════════════════════════════════════════════════════════════════════════
// 4. TopicSelector
// ══════════════════════════════════════════════════════════════════════════
section('4. TopicSelector');

// 4a. Different candidates produce different priorities
const { rankedTopics: rt1 } = selectTopics(STRONG_CANDIDATE);
const { rankedTopics: rt5 } = selectTopics(DEVOPS_CANDIDATE);
const top1 = rt1.slice(0, 4).map(t => t.day);
const top5 = rt5.slice(0, 4).map(t => t.day);
assert(JSON.stringify(top1) !== JSON.stringify(top5),
  'Different candidates produce different top-4 topic sequences');

// 4b. Role affects prioritisation — DevOps should surface deployment topics high
const devopsTopDays = rt5.slice(0, 6).map(t => t.day);
const deploymentDays = [28, 29, 30]; // Docker, Monitoring, Production
assert(deploymentDays.some(d => devopsTopDays.includes(d)),
  'DevOps candidate: deployment days appear in top-6 topics');

// 4c. GAP/PROBE topics present in ranked output for candidates that have them
const { rankedTopics: rtSkip } = selectTopics(SKIP_HEAVY_CAND());
const hasGap = rtSkip.some(t => t.status === 'GAP');
assert(hasGap, 'Candidate with skipped missions: GAP topics appear in ranked list');

const { rankedTopics: rtProbe } = selectTopics(PROBE_CANDIDATE);
const hasProbe = rtProbe.some(t => t.status === 'PROBE');
assert(hasProbe, 'Candidate with failed missions: PROBE topics appear in ranked list');

// 4d. STRONG topics present in ranked list for strong candidates
const hasStrong = rt1.some(t => t.status === 'STRONG');
assert(hasStrong, 'Strong candidate: STRONG topics in ranked list');

// 4e. Minimum 4 unique curriculum days guaranteed
const uniqueDays1 = new Set(rt1.map(t => t.day));
assert(uniqueDays1.size >= 4, 'CAND-001: at least 4 unique curriculum days in ranked list');

const uniqueDays5 = new Set(rt5.map(t => t.day));
assert(uniqueDays5.size >= 4, 'CAND-005: at least 4 unique curriculum days in ranked list');

const { rankedTopics: rtArch } = selectTopics(ARCH_CANDIDATE);
const uniqueDaysArch = new Set(rtArch.map(t => t.day));
assert(uniqueDaysArch.size >= 4, 'CAND-015: at least 4 unique curriculum days in ranked list');

// Helper to get CAND-011 (skip-heavy)
function SKIP_HEAVY_CAND() { return getCandidateById('CAND-011'); }

// 4f. Intern (0 yrs exp) and senior (28 yrs exp) produce different orderings
const { rankedTopics: rtIntern } = selectTopics(INTERN_CANDIDATE);
const { rankedTopics: rtSenior } = selectTopics(getCandidateById('CAND-008'));
const topInternDays = rtIntern.slice(0, 5).map(t => t.day);
const topSeniorDays = rtSenior.slice(0, 5).map(t => t.day);
assert(JSON.stringify(topInternDays) !== JSON.stringify(topSeniorDays),
  'Intern and senior candidate produce different topic orderings');

// ══════════════════════════════════════════════════════════════════════════
// 5. InterviewContextBuilder
// ══════════════════════════════════════════════════════════════════════════
section('5. InterviewContextBuilder');

const ctx1 = buildInterviewContext(STRONG_CANDIDATE);

// 5a. Only relevant information
assert(typeof ctx1 === 'object',                            'buildInterviewContext returns object');
assert(ctx1.candidate.id === 'CAND-001',                    'context: correct candidate id');
assert(ctx1.candidate.role === 'Senior Data Engineer',      'context: correct role');
assert(typeof ctx1.candidate.experience === 'number',       'context: experience is number');

// 5b. No complete curriculum (priorityTopics must not be all 31 days)
assert(Array.isArray(ctx1.priorityTopics),                  'context: priorityTopics is array');
assert(ctx1.priorityTopics.length < 31,                     'context: priorityTopics is NOT all 31 days (token efficient)');

// 5c. No unrelated candidates (context contains exactly one candidate)
assert(!ctx1.allCandidates,                                 'context: no allCandidates field');
assert(!ctx1.candidates,                                    'context: no candidates array');

// 5d. Topic categories present
assert(Array.isArray(ctx1.strengthTopics),                  'context: strengthTopics array');
assert(Array.isArray(ctx1.probeTopics),                     'context: probeTopics array');
assert(Array.isArray(ctx1.gapTopics),                       'context: gapTopics array');

// 5e. Gap topics for candidates who have them
assert(ctx1.gapTopics.length > 0,                           'CAND-001: gapTopics non-empty (day 29 skipped)');

// 5f. interviewMeta coverage guarantee
assert(ctx1.interviewMeta.minDaysRequired === 4,            'context: minDaysRequired = 4');
assert(ctx1.interviewMeta.minQuestionsRequired === 8,       'context: minQuestionsRequired = 8');
assert(ctx1.interviewMeta.uniqueDaysCovered.length >= 4,    'context: uniqueDaysCovered ≥ 4');

// 5g. Each priorityTopic has max 3 objectives (token efficiency)
const allObjs = ctx1.priorityTopics.flatMap(t => t.objectives);
assert(ctx1.priorityTopics.every(t => t.objectives.length <= 3),
  'context: no priorityTopic has more than 3 objectives (token-efficient)');

// 5h. Different candidates get different contexts
const ctx5 = buildInterviewContext(DEVOPS_CANDIDATE);
assert(ctx5.candidate.id !== ctx1.candidate.id,             'Different candidates → different contexts');
assert(JSON.stringify(ctx5.priorityTopics.map(t=>t.day)) !== JSON.stringify(ctx1.priorityTopics.map(t=>t.day)),
  'Different candidates → different priorityTopic sequences');

// 5i. Mission signals present
assert(typeof ctx1.missionSignals.missionsCompleted === 'number', 'context: missionSignals.missionsCompleted present');
assert(Array.isArray(ctx1.missionSignals.skippedDays),           'context: missionSignals.skippedDays is array');

// ══════════════════════════════════════════════════════════════════════════
// Results summary
// ══════════════════════════════════════════════════════════════════════════
console.log('\n=================================================');
if (failed === 0) {
  console.log(`🎉 ALL ${passed} PHASE 6 UNIT TESTS PASSED!`);
} else {
  console.error(`❌ ${failed} test(s) FAILED out of ${passed + failed}`);
  process.exitCode = 1;
}
console.log(`=================================================\n`);
