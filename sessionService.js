const { getDbConnection } = require('./db');

function createSession(sessionId, candidateId, state) {
  return new Promise((resolve, reject) => {
    const db = getDbConnection();
    const stateJson = JSON.stringify(state);
    const status = state.interviewStatus || 'ACTIVE';
    const now = new Date().toISOString();

    const sql = `
      INSERT INTO interview_sessions (session_id, candidate_id, state_json, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.run(sql, [sessionId, candidateId || null, stateJson, status, now, now], function (err) {
      if (err) {
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
          const error = new Error('Session already exists');
          error.code = 'SESSION_EXISTS';
          return reject(error);
        }
        return reject(err);
      }
      resolve({ sessionId, candidateId, status });
    });
  });
}

function getSession(sessionId) {
  return new Promise((resolve, reject) => {
    const db = getDbConnection();
    const sql = `SELECT session_id, candidate_id, state_json, status, created_at, updated_at FROM interview_sessions WHERE session_id = ?`;

    db.get(sql, [sessionId], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve(null);

      try {
        const state = JSON.parse(row.state_json);
        resolve({
          sessionId: row.session_id,
          candidateId: row.candidate_id,
          state,
          status: row.status,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}

function updateSession(sessionId, state) {
  return new Promise((resolve, reject) => {
    const db = getDbConnection();
    const stateJson = JSON.stringify(state);
    const status = state.interviewStatus || 'ACTIVE';
    const now = new Date().toISOString();

    const sql = `
      UPDATE interview_sessions
      SET state_json = ?, status = ?, updated_at = ?
      WHERE session_id = ?
    `;

    db.run(sql, [stateJson, status, now, sessionId], function (err) {
      if (err) return reject(err);
      if (this.changes === 0) {
        const error = new Error('Unknown sessionId');
        error.code = 'UNKNOWN_SESSION';
        return reject(error);
      }
      resolve({ sessionId, status });
    });
  });
}

function completeSession(sessionId, finalFeedback, state) {
  state.interviewStatus = 'COMPLETED';
  state.finalFeedback = finalFeedback;
  return updateSession(sessionId, state);
}

module.exports = {
  createSession,
  getSession,
  updateSession,
  completeSession
};
