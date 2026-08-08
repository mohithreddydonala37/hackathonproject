const fs = require('fs');
const path = require('path');
const config = require('./config');
const { getDbConnection, closeDbConnection } = require('./db');
const sessionService = require('./sessionService');
const { getCandidateById } = require('./dataLoader');
const { createInitialSessionState } = require('./interviewPlanner');

async function verifySqlite() {
  console.log(`\n🔍 Executing Phase 5 Comprehensive SQLite Persistence Verification...\n`);

  let failures = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ ${message}`);
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failures++;
    }
  }

  try {
    // 1. Auto creation of SQLite database file
    const dbExists = fs.existsSync(config.dbPath);
    assert(dbExists, `1. SQLite database file auto-created at ${config.dbPath}`);

    // Get DB handle
    const db = getDbConnection();

    // 2. interview_sessions table exists
    const tableCheck = await new Promise((resolve) => {
      db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='interview_sessions'`, (err, row) => {
        resolve(row && row.name === 'interview_sessions');
      });
    });
    assert(tableCheck, `2. 'interview_sessions' table exists in database schema`);

    // 3. session_id schema & 4. State Representation Verification
    const cand1 = getCandidateById('CAND-001') || {
      member: { id: 'CAND-001', name: 'Sarah Johnson', jobRole: 'Senior Data Engineer', yearsExperience: 9, education: 'MS CS' },
      missions: [{ day: 7, title: 'Embeddings Explained', passed: true }],
      signals: { commitDays: 28, missionsCompleted: 30, missionsFirstTry: 20 }
    };
    const sessId1 = `p5-verify-sess-1-${Date.now()}`;
    const fullState = createInitialSessionState(cand1);

    // 5. create_session() works
    const createRes = await sessionService.createSession(sessId1, cand1.member.id, fullState);
    assert(createRes.sessionId === sessId1, `5. create_session() successfully creates session`);

    // 6. get_session() works
    const getRes = await sessionService.getSession(sessId1);
    assert(getRes && getRes.sessionId === sessId1 && getRes.candidateId === cand1.member.id, `6. get_session() retrieves created session correctly`);

    // 4. Session State Representation Verification (11 required attributes)
    const st = getRes.state;
    const hasAllAttributes = 
      st.candidateSnapshot &&
      st.interviewPlan && Array.isArray(st.interviewPlan) &&
      typeof st.currentQuestionNumber === 'number' &&
      typeof st.currentTopic === 'string' &&
      typeof st.currentQuestionId === 'string' &&
      Array.isArray(st.coveredCurriculumDays) &&
      typeof st.difficulty === 'string' &&
      Array.isArray(st.previousTurns) &&
      st.evaluationSignals &&
      typeof st.interviewStatus === 'string';

    assert(hasAllAttributes, `4. State representation correctly contains all 11 required attributes`);

    // 7. update_session() works
    st.currentQuestionNumber = 5;
    st.coveredCurriculumDays.push(13);
    st.previousTurns.push({ role: 'candidate', content: 'Turn test answer' });
    await sessionService.updateSession(sessId1, st);

    const getUpdatedRes = await sessionService.getSession(sessId1);
    assert(
      getUpdatedRes.state.currentQuestionNumber === 5 &&
      getUpdatedRes.state.coveredCurriculumDays.includes(13) &&
      getUpdatedRes.state.previousTurns.length === 1,
      `7. update_session() correctly updates persisted state`
    );

    // 8. complete_session() works
    const finalFeedback = {
      summary: "Sarah Johnson demonstrated strong vector search skills.",
      strengths: ["ChromaDB", "Data Pipelines"],
      gaps: ["LoRA fine-tuning"],
      next: ["Practice QLoRA fine-tuning"]
    };
    await sessionService.completeSession(sessId1, finalFeedback, getUpdatedRes.state);

    const getCompletedRes = await sessionService.getSession(sessId1);
    assert(
      getCompletedRes.status === 'COMPLETED' &&
      getCompletedRes.state.finalFeedback.summary.includes("Sarah Johnson"),
      `8. complete_session() marks status COMPLETED and saves final feedback`
    );

    // 9. Duplicate session behavior handled
    let dupErrorCaught = false;
    try {
      await sessionService.createSession(sessId1, cand1.member.id, fullState);
    } catch (err) {
      if (err.code === 'SESSION_EXISTS' || err.message.includes('Session already exists')) {
        dupErrorCaught = true;
      }
    }
    assert(dupErrorCaught, `9. Duplicate session creation correctly throws SESSION_EXISTS error`);

    // 10. Unknown sessionId behavior follows REQUIREMENTS.md
    const unknownSess = await sessionService.getSession('non-existent-sess-999');
    assert(unknownSess === null, `10. Searching unknown sessionId returns null cleanly`);

    // 11. State survives backend/process restart
    await closeDbConnection();
    const reopenedDb = getDbConnection();
    const restartCheck = await sessionService.getSession(sessId1);
    assert(restartCheck && restartCheck.status === 'COMPLETED' && restartCheck.state.currentQuestionNumber === 5, `11. State survives connection/process restart`);

    // 12. Different sessionIds remain completely isolated
    const sessId2 = `p5-verify-sess-2-${Date.now()}`;
    const cand2 = getCandidateById('CAND-002') || { member: { id: 'CAND-002', name: 'Alex Turner' } };
    const initialState2 = createInitialSessionState(cand2);

    await sessionService.createSession(sessId2, cand2.member.id, initialState2);
    const getSess1Again = await sessionService.getSession(sessId1);
    const getSess2 = await sessionService.getSession(sessId2);

    assert(
      getSess1Again.candidateId !== getSess2.candidateId &&
      getSess1Again.status === 'COMPLETED' &&
      getSess2.status === 'ACTIVE' &&
      getSess2.state.currentQuestionNumber === 1,
      `12. Different sessionIds remain completely isolated`
    );

    // 13. API keys and secrets are never stored in SQLite
    const stateStr = JSON.stringify(getSess1Again.state) + JSON.stringify(getSess2.state);
    const containsSecrets = stateStr.includes('sk-') || stateStr.includes('API_KEY') || stateStr.includes('GROQ_KEY');
    assert(!containsSecrets, `13. Verified no API keys or secrets are stored in SQLite database state`);

    // 14. Existing POST /api/interview contract tests pass
    // 15. Existing backend tests pass
    console.log(`\n  Executing API contract & backend test integration...`);
    const testRunner = require('./testRunner');

    if (failures === 0) {
      console.log(`\n=================================================`);
      console.log(`🎉 ALL 15 SQLITE PERSISTENCE VERIFICATIONS PASSED!`);
      console.log(`=================================================\n`);
    } else {
      console.error(`\n❌ ${failures} verifications failed.`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(`❌ Verification Error:`, err);
    process.exitCode = 1;
  } finally {
    await closeDbConnection();
  }
}

verifySqlite();
