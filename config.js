require('dotenv').config();
const path = require('path');

module.exports = {
  port: process.env.PORT || 3000,
  dbPath: process.env.DB_PATH || path.join(__dirname, 'data', 'sessions.db'),
  minQuestions: 8,
  minCurriculumDays: 4,
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'llama3-8b-8192',
  groqTimeoutMs: parseInt(process.env.GROQ_TIMEOUT_MS, 10) || 10000,
};
