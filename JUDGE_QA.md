# SentinelAI • Hackathon Judge Q&A Guide

Detailed responses to 15 key technical and architectural questions judges may ask.

---

### 1. What problem are you solving?
**CURRENT IMPLEMENTATION**: Traditional technical interview screening is either static and rigid (multiple-choice or fixed question lists) or handled by unconstrained AI chatbots that lose track of state, repeat topics, or hallucinate candidate capabilities. SentinelAI solves this by pairing deterministic strategy guardrails with Groq LLM natural language phrasing to deliver adaptive, candidate-aware technical interviews with evidence-grounded evaluation.

---

### 2. Why is this different from ChatGPT / generic wrappers?
**CURRENT IMPLEMENTATION**: Generic ChatGPT wrappers put the LLM in charge of the conversation state, leading to missing question counters, infinite loops, and prompt injection vulnerabilities. SentinelAI uses a **deterministic state machine** (`interviewStrategyEngine.js`). The LLM is used strictly as a natural language generation and evaluation engine. The strategy engine controls topic selection, difficulty escalation, follow-up budgets (max 2 per topic), and interview completion criteria (8+ questions, 4+ curriculum days).

---

### 3. How does adaptive questioning work?
**CURRENT IMPLEMENTATION**: After every candidate response, `groqService.evaluateCandidateAnswer` scores the response across 4 dimensions (0–5 scores). Based on the rating (`STRONG`, `ADEQUATE`, `WEAK`, `UNKNOWN`), `interviewStrategyEngine.js` decides the next action:
- `STRONG`: Escalates difficulty (`APPLICATION` → `DEPTH` → `ARCHITECTURE`) and probes trade-offs.
- `WEAK`: Reframes concepts or asks clarifying questions.
- `MAX_FOLLOWUPS`: Transitions to the next top-ranked curriculum competency.

---

### 4. How do you prevent repetitive questions?
**CURRENT IMPLEMENTATION**: SentinelAI maintains an `askedQuestionsHistory` array in the SQLite session state. Every candidate answer is checked against previous question topics. In addition, canonical key string deduplication ensures no duplicate questions or strengths are generated across turns.

---

### 5. How do you evaluate candidate answers?
**CURRENT IMPLEMENTATION**: Answers are evaluated against 4 bounded criteria: Technical Accuracy (0–5), Conceptual Depth (0–5), Practical Reasoning (0–5), and Communication (0–5). Evaluators extract observable evidence statements from the candidate's text. If LLM calls fail, a fallback word-count and keyword heuristic evaluator provides bounded fallback scores.

---

### 6. How do you prevent hallucinated evaluations?
**CURRENT IMPLEMENTATION**: SentinelAI's prompt rules strictly require evidence to be derived ONLY from observable candidate statements. Furthermore, `interviewPlanner.js` normalizes all feedback through `normalizeFeedbackReport`, which strips unverified claims (such as commit-day claims) and formats strengths as `[Competency]: [specific evidence demonstrated]`.

---

### 7. Why did you choose Groq?
**CURRENT IMPLEMENTATION**: Groq Cloud provides ultra-fast inference latency using LPU (Language Processing Unit) hardware running Llama 3 8B. Sub-500ms LLM response times ensure a real-time conversational flow during technical interviews.

---

### 8. How does streaming work?
**CURRENT IMPLEMENTATION**: Frontend responses render smoothly as full structured JSON payloads containing interviewer replies, active topic metadata, and turn counters.
**FUTURE SCALING PLAN**: Implement Server-Sent Events (SSE) streaming (`text/event-stream`) directly from Groq to stream token-by-token question text to the frontend.

---

### 9. How would this scale to thousands of interviews?
**CURRENT IMPLEMENTATION**: SQLite with WAL (Write-Ahead Logging) supports high-concurrency read/write throughput for session states. Sessions are fully isolated by `sessionId`.
**FUTURE SCALING PLAN**: Replace SQLite with PostgreSQL or Redis for session caching, deploy stateless Express workers behind an ALB load balancer, and place Groq LLM API requests into a Redis-backed queue (BullMQ).

---

### 10. How do you handle LLM failures?
**CURRENT IMPLEMENTATION**: `groqService.js` includes a 6-second timeout circuit breaker and automatic 2-attempt retry logic. If Groq API returns HTTP 429 rate limits or invalid JSON, SentinelAI seamlessly falls back to deterministic curriculum question templates with 100% API contract compliance and 0% downtime.

---

### 11. How do you protect API keys?
**CURRENT IMPLEMENTATION**: `GROQ_API_KEY` is loaded strictly on the server-side via `process.env`. Frontend bundles contain zero secrets. Error handlers and debrief normalizers strip any potential API key patterns from outputs.

---

### 12. How would you add RAG?
**CURRENT IMPLEMENTATION**: Questions are selected from structured curriculum JSON files (`data/curriculum.json`).
**FUTURE SCALING PLAN**: Ingest company engineering documentation, GitHub repositories, and architectural ADRs into a vector database (e.g. pgvector or Pinecone) to ground technical questions in company-specific codebases.

---

### 13. How would you add MCP (Model Context Protocol)?
**CURRENT IMPLEMENTATION**: Technical topics cover MCP concepts in curriculum Day 31.
**FUTURE SCALING PLAN**: Build an MCP tool server allowing SentinelAI to dynamically fetch candidate GitHub code commits, PR reviews, and live coding sandbox outputs during the interview.

---

### 14. How would you support multiple LLM providers?
**CURRENT IMPLEMENTATION**: Groq Llama 3 is integrated via `groqService.js`.
**FUTURE SCALING PLAN**: Implement a unified `LLMProvider` interface with adapters for Groq, OpenAI, Anthropic, and Ollama (local offline models).

---

### 15. How would you improve the system in production?
**CURRENT IMPLEMENTATION**: Full end-to-end interview flow, SQLite state persistence, candidate profiler, 406 test assertions, Render deployment.
**FUTURE SCALING PLAN**: Add live audio webRTC speech-to-text, real-time code editor integration (Monaco Editor), and automated multi-interviewer consensus scoring.
