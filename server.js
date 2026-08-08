const express = require('express');
const cors = require('cors');
const config = require('./config');
const { getDbConnection } = require('./db');
const { validateInterviewRequest, validateInterviewResponse } = require('./validator');
const sessionService = require('./sessionService');
const { createInitialSessionState, processSessionTurn, generateInitialGreeting } = require('./interviewPlanner');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

const { getAllCandidates } = require('./dataLoader');

// Initialize DB schema on startup
getDbConnection();

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'AI Interview Agent Backend' });
});

// GET /api/candidates (Candidate selection endpoint)
app.get('/api/candidates', (req, res) => {
  const candidates = getAllCandidates();
  res.json({ candidates });
});

// PRIMARY ROUTE: POST /api/interview
app.post('/api/interview', async (req, res, next) => {
  try {
    // 1. Request Validation
    const validation = validateInterviewRequest(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const { sessionId, candidate, message } = req.body;

    // 2. INITIAL REQUEST (Candidate provided)
    if (candidate) {
      const existingSession = await sessionService.getSession(sessionId);
      if (existingSession) {
        return res.status(400).json({ error: 'Session already exists' });
      }

      const state = createInitialSessionState(candidate);
      const greeting = await generateInitialGreeting(state);
      const candidateId = state.candidateSnapshot.id;

      await sessionService.createSession(sessionId, candidateId, state);

      const responsePayload = { reply: greeting, done: false, currentTopic: state.currentTopic };
      
      // Response Validation
      const respVal = validateInterviewResponse(responsePayload);
      if (!respVal.valid) {
        return res.status(500).json({ error: `Internal Schema Error: ${respVal.error}` });
      }

      return res.status(200).json(responsePayload);
    }

    // 3. CONVERSATION REQUEST (Message provided)
    const sessionRecord = await sessionService.getSession(sessionId);

    // UNKNOWN SESSION HANDLING
    if (!sessionRecord) {
      return res.status(400).json({ error: 'Unknown sessionId' });
    }

    const state = sessionRecord.state;

    // If session already completed
    if (state.interviewStatus === 'COMPLETED') {
      const completedPayload = {
        reply: "Interview has already been completed.",
        done: true,
        feedback: state.finalFeedback
      };
      return res.status(200).json(completedPayload);
    }

    // Process Turn
    const turnResult = await processSessionTurn(state, message);

    // Persist Updated State to SQLite
    if (turnResult.done) {
      await sessionService.completeSession(sessionId, turnResult.feedback, state);
    } else {
      await sessionService.updateSession(sessionId, state);
    }

    // Response Validation
    const respVal = validateInterviewResponse(turnResult);
    if (!respVal.valid) {
      return res.status(500).json({ error: `Internal Schema Error: ${respVal.error}` });
    }

    return res.status(200).json(turnResult);
  } catch (err) {
    next(err);
  }
});

// Centralized Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Centralized Error Handler:', err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: err.message || 'Internal Server Error'
  });
});

// Start Server if invoked directly
if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`=================================================`);
    console.log(`🚀 AI Interview Agent API running on port ${config.port}`);
    console.log(`👉 Endpoint: POST http://localhost:${config.port}/api/interview`);
    console.log(`=================================================`);
  });
}

module.exports = app;
