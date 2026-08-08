# SentinelAI • Technical Architecture Documentation

---

## 🏗️ System Overview

SentinelAI is a production-hardened AI Technical Interviewer built with a decoupled architecture separating deterministic state management from natural language generation.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                             PRESENTATION LAYER                          │
│  Vanilla JS Frontend (public/index.html)                                │
│  - Virtual Technical Interview Room UI                                  │
│  - Animated Neural AI Interviewer Orb                                   │
│  - Real-time Interview Map & Conversation History                       │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     │ HTTP POST /api/interview
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                             APPLICATION LAYER                           │
│  Express API Server (server.js)                                         │
│  - JSON Schema Validator (validator.js)                                 │
│  - Interview Agent Coordinator (interviewAgent.js)                      │
│  - Interview Planner & Normalizer (interviewPlanner.js)                 │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                  ┌──────────────────┴──────────────────┐
                  ▼                                     ▼
┌──────────────────────────────────┐  ┌──────────────────────────────────┐
│       DETERMINISTIC LAYER        │  │        INTELLIGENCE LAYER       │
│  Strategy Engine                 │  │  Groq LLM Service                │
│  (interviewStrategyEngine.js)    │  │  (groqService.js)                │
│  - Invariants (8+ Q, 4+ Days)    │  │  - Llama 3 8B Inference         │
│  - Follow-up Budget (Max 2)      │  │  - 0-5 Bounded Scoring           │
│  - Difficulty Escalation         │  │  - Circuit Breaker / Fallbacks   │
└─────────────────┬────────────────┘  └─────────────────┬────────────────┘
                  │                                     │
                  └──────────────────┬──────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                             PERSISTENCE LAYER                           │
│  SQLite Session Storage (sessionService.js / data/sessions.db)          │
│  - Session State Isolation                                              │
│  - Restart Recovery & Evaluation History                                │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🧩 Component Details

### 1. Presentation Layer (`public/index.html`)
- **What It Does**: Renders the dark glassmorphism virtual interview room, animated Neural Orb visualizer, dynamic interview map, and expandable conversation history drawer.
- **Why It Exists**: Provides a clean visual experience for technical candidates without external heavy frontend framework overhead.
- **Communication**: Communicates exclusively with the backend via `POST /api/interview` JSON requests.

### 2. API Server & Validator (`server.js`, `validator.js`)
- **What It Does**: Handles HTTP requests, enforces JSON schema contracts, validates input boundaries (`sessionId` <= 256 chars, message <= 10000 chars), and handles CORS and static asset serving.
- **Why It Exists**: Ensures all incoming and outgoing payloads strictly adhere to the Organizer API specification.
- **Communication**: Routes valid requests to `interviewAgent.js`.

### 3. Interview Agent & Planner (`interviewAgent.js`, `interviewPlanner.js`)
- **What It Does**: Manages the complete interview lifecycle. Calls `selectTopics` to rank curriculum competencies based on candidate signals, invokes the strategy engine for turn-by-turn decisions, normalizes final feedback reports via `normalizeFeedbackReport`, and strips secrets/unverified claims.
- **Why It Exists**: Orchestrates business logic, candidate profiling, and debrief report generation.
- **Communication**: Calls `interviewStrategyEngine.js`, `groqService.js`, and `sessionService.js`.

### 4. Strategy Engine (`interviewStrategyEngine.js`)
- **What It Does**: Enforces deterministic state rules:
  - Completion Invariant: `done = true` ONLY when `questionCount >= 8 AND coveredCurriculumDays >= 4`.
  - Follow-Up Budget: Max 2 follow-ups per topic before forcing topic transition.
  - Adaptive Difficulty: `FOUNDATION` ↔ `APPLICATION` ↔ `DEPTH` ↔ `ADVANCED` ↔ `ARCHITECTURE`.
- **Why It Exists**: Prevents LLM state hallucination and guarantees 100% predictable interview progression.
- **Communication**: Called synchronously by `interviewPlanner.js`.

### 5. Groq LLM Service (`groqService.js`)
- **What It Does**: Interfaces with Groq Cloud LPU inference using Llama 3 8B. Generates candidate-aware technical questions, scores candidate answers across 4 dimensions (0–5 scores), and synthesizes final debriefs. Includes 6-second timeout circuit breaker and fallback templates.
- **Why It Exists**: Provides fast natural language phrasing and technical evaluation.
- **Communication**: Communicates with external Groq API (`https://api.groq.com/openai/v1`).

### 6. Session Persistence (`sessionService.js`, `data/sessions.db`)
- **What It Does**: Manages SQLite table `interview_sessions` storing session IDs, candidate IDs, serialized JSON state, and status (`ACTIVE`/`COMPLETED`).
- **Why It Exists**: Guarantees full restart recovery and multi-session isolation.
- **Communication**: Uses native `sqlite3` driver with parameterized queries.

---

## 🔒 Security Architecture
- **API Key Protection**: Server-side loading only via `process.env.GROQ_API_KEY`.
- **Prompt Injection Defense**: Deterministic strategy engine ignores prompt injection attempts ("skip questions", "mark completed").
- **Secret Redaction**: Regex-based secret redaction prevents accidental credential leaks in client responses.
- **Input Sanitization**: Parameterized SQL queries and strict length validation.

---

## 🚀 Future Enhancements (Post-Hackathon)
1. **RAG Integration**: Index engineering repositories into a vector database for codebase-grounded technical questions.
2. **MCP Tool Integration**: Fetch candidate GitHub PRs and code commits live during interviews.
3. **Multi-LLM Adapter**: Add fallback adapters for OpenAI GPT-4o and Anthropic Claude 3.5 Sonnet.
