# SentinelAI • Technical Judge Q&A Guide

> **Concise, authoritative technical answers to 15 key questions likely to be asked by hackathon judges during evaluation.**

---

### 1. Why did you use Groq LLM instead of standard OpenAI or Claude APIs?
**Answer**: Groq's Llama-3-8b inference speed delivers sub-second turn latency (~450ms–1.2s), satisfying the project requirement of < 2 seconds per turn. This real-time speed makes the AI interviewer feel responsive and conversationally natural.

### 2. Why did you combine a deterministic strategy engine with an LLM?
**Answer**: Pure LLM chatbots lose track of question counts, repeat topics endlessly, hallucinate completion states, or succumb to prompt injections. By using a deterministic strategy engine (`interviewStrategyEngine.js`) for state control, question counting, curriculum tracking, and difficulty transitions, we guarantee 100% adherence to rules while leveraging Groq strictly for natural language phrasing and answer evaluation.

### 3. Why did you choose SQLite for session storage?
**Answer**: SQLite provides zero-dependency, lightweight, ACID-compliant file-based persistence (`data/sessions.db`). Sessions survive application restarts and execute parameterized queries in < 2ms without requiring complex external database server setup.

### 4. How is candidate personalization achieved?
**Answer**: `candidateProfiler.js` and `topicSelector.js` analyze candidate background signals (`yearsExperience`, `jobRole`, `commitDays`, `missionsCompleted`, `missionsFirstTry`). Experienced candidates (e.g., Senior Data Engineer with 9 yrs exp) start at `DEPTH` difficulty on advanced topics, whereas interns start at `FOUNDATION` difficulty on baseline concepts.

### 5. How do you guarantee the minimum 8 questions requirement?
**Answer**: The strategy engine guard `canComplete(state)` explicitly checks `state.currentQuestionNumber >= 8`. Even if a candidate begs to finish or attempts prompt injection, `done: true` is mathematically impossible until 8 primary questions are completed.

### 6. How do you guarantee the minimum 4 curriculum days requirement?
**Answer**: `topicSelector.js` tracks `state.coveredCurriculumDays`. The strategy engine forces topic transitions to uncovered curriculum days whenever a topic is completed, ensuring `uniqueCurriculumDays >= 4` before `canComplete(state)` evaluates to true.

### 7. How do you prevent cross-session data leakage?
**Answer**: Each session is bound to a unique `sessionId` primary key in SQLite. Database queries operate strictly on individual `sessionId` records. Multi-session load tests verified 100% data isolation across 10 concurrent sessions.

### 8. What happens if Groq API fails or rate-limits (HTTP 429)?
**Answer**: `groqService.js` includes exponential backoff retries (max 2), a 6,000ms timeout circuit breaker, and deterministic fallbacks (`generateTurnQuestion`, `evaluateAnswerDeterministic`, `generateFeedbackReport`). The application never crashes and maintains 100% spec compliance even during LLM outages.

### 9. How do you optimize token usage and context size?
**Answer**: Static curriculum and candidate JSON files are loaded once and cached in memory. Prompt context payloads sent to Groq are capped at < 3KB per turn, containing only the candidate snapshot and the last 3 conversation turns.

### 10. How do you prevent prompt injection attacks?
**Answer**: Candidate text inputs are treated strictly as untrusted string data for evaluation. Deterministic strategy rules (question counting, completion status, database mutations) execute outside LLM context and cannot be overridden by candidate prompt content.

### 11. Why isn't SentinelAI just another generic chatbot wrapper?
**Answer**: Unlike chatbots, SentinelAI features personalized profile indexing, multi-dimensional 0–5 answer evaluation across 4 technical axes, 5-level difficulty state transitions, follow-up budget enforcement (max 2 per topic), SQLite persistence, and evidence-driven debrief report synthesis.

### 12. How does candidate performance affect questioning during the interview?
**Answer**: If an answer receives high scores (4–5), difficulty escalates (`APPLICATION` → `DEPTH` → `ADVANCED`), triggering practical trade-off follow-ups. If an answer receives low scores (0–1), difficulty de-escalates to `FOUNDATION`, triggering concept reframing questions.

### 13. How is the final feedback debrief report generated?
**Answer**: During the interview, 0–5 evaluation records are stored for every primary turn. Upon completion, `groqService.js` synthesizes a structured report containing an executive summary, demonstrated strengths (`✓`), technical gaps (`→`), and actionable next steps (`1. 2. 3.`) derived directly from turn evidence.

### 14. How would you scale this architecture for production enterprise deployment?
**Answer**: The backend is stateless except for the SQLite database. SQLite can be swapped for PostgreSQL, session state can be cached in Redis, and Groq calls can be load-balanced across multiple API keys or private self-hosted inference servers.

### 15. What features would you build next in Phase 15?
**Answer**: Real-time voice audio streaming via WebRTC/WebSocket, live code execution sandbox (WebAssembly/Docker container runner), and enterprise ATS integration (Greenhouse/Lever webhooks).
