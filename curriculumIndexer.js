/**
 * curriculumIndexer.js
 * Deterministic CurriculumIndexer.
 * Loads curriculum.json once at startup and exposes structured lookup functions.
 * Never sends the complete curriculum to any LLM.
 */

'use strict';

const { loadData } = require('./dataLoader');

// ── Module-level index (built once, never rebuilt) ─────────────────────────
let _dayIndex   = null; // Map<number, dayObject>
let _moduleIndex = null; // Map<number, moduleObject>

function _ensureIndexed() {
  if (_dayIndex) return; // already built

  const { curriculumData } = loadData();
  if (!curriculumData) throw new Error('curriculum.json could not be loaded');

  // Day index: day number → day object
  _dayIndex = new Map();
  for (const d of (curriculumData.days || [])) {
    _dayIndex.set(d.day, d);
  }

  // Module index: module number → module object (with resolved day objects)
  _moduleIndex = new Map();
  for (const mod of (curriculumData.modules || [])) {
    _moduleIndex.set(mod.n, {
      n    : mod.n,
      title: mod.title,
      days : mod.days,  // array of day numbers
    });
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Return the full day object for a given day number, or null if not found.
 * @param {number} dayNumber
 * @returns {object|null}
 */
function getDay(dayNumber) {
  _ensureIndexed();
  return _dayIndex.get(dayNumber) || null;
}

/**
 * Return an array of day objects for an array of day numbers.
 * Missing days are omitted (not null-padded).
 * @param {number[]} dayNumbers
 * @returns {object[]}
 */
function getDays(dayNumbers) {
  _ensureIndexed();
  return dayNumbers
    .map(n => _dayIndex.get(n))
    .filter(Boolean);
}

/**
 * Return all day objects whose title or objectives mention any keyword (case-insensitive).
 * @param {string} keyword
 * @returns {object[]}
 */
function searchTopics(keyword) {
  _ensureIndexed();
  if (!keyword) return [];
  const kw = keyword.toLowerCase();
  const results = [];
  for (const d of _dayIndex.values()) {
    const titleMatch = (d.title || '').toLowerCase().includes(kw);
    const objMatch   = (d.objectives || []).some(o => o.toLowerCase().includes(kw));
    const toolMatch  = (d.tools      || []).some(t => t.toLowerCase().includes(kw));
    if (titleMatch || objMatch || toolMatch) {
      results.push(d);
    }
  }
  return results.sort((a, b) => a.day - b.day);
}

/**
 * Return the objectives array for a given day, or [] if day not found.
 * @param {number} dayNumber
 * @returns {string[]}
 */
function getObjectives(dayNumber) {
  const d = getDay(dayNumber);
  return d ? (d.objectives || []) : [];
}

/**
 * Return the module object whose day range includes the given day, or null.
 * @param {number} dayNumber
 * @returns {object|null}
 */
function getModule(dayNumber) {
  _ensureIndexed();
  for (const mod of _moduleIndex.values()) {
    const [first, last] = mod.days;
    if (dayNumber >= first && dayNumber <= last) {
      return mod;
    }
  }
  return null;
}

/**
 * Return all day numbers present in the curriculum.
 * @returns {number[]}
 */
function getAllDayNumbers() {
  _ensureIndexed();
  return Array.from(_dayIndex.keys()).sort((a, b) => a - b);
}

/**
 * Return compact metadata for a day (title + objectives only, no tools).
 * Suitable for building LLM context without sending the full curriculum.
 * @param {number} dayNumber
 * @returns {object|null}
 */
function getDayCompact(dayNumber) {
  const d = getDay(dayNumber);
  if (!d) return null;
  return {
    day       : d.day,
    title     : d.title,
    objectives: (d.objectives || []).slice(0, 3), // max 3 objectives for token efficiency
  };
}

module.exports = {
  getDay,
  getDays,
  searchTopics,
  getObjectives,
  getModule,
  getAllDayNumbers,
  getDayCompact,
};
