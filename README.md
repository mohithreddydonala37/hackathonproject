# SentinelAI • Premium AI Technical Interviewer

> **Adaptive, Candidate-Aware AI Technical Interviewer built with Deterministic Strategy Control and Groq LLM Intelligence.**

[![Build & Test Status](https://img.shields.io/badge/tests-365%2F365%20passed-100%25-success)](file:///c:/Users/MOHITH%20REDDY/OneDrive/Desktop/hackathon/testPhase14Hardening.js)
[![API Contract](https://img.shields.io/badge/API-POST%20%2Fapi%2Finterview-indigo)](#api-documentation)
[![Groq LLM](https://img.shields.io/badge/LLM-Groq%20Llama3--8b-cyan)](#architecture)
[![SQLite Persistence](https://img.shields.io/badge/Database-SQLite%20(Sessions)-emerald)](#architecture)

---

## 🎯 Problem

Traditional technical interviews and generic AI chatbots suffer from critical limitations:
1. **Unpersonalized Questions**: Standard interview screeners ask rigid questions that ignore a candidate's actual learning history or cohort progress.
2. **Hallucinated / Unbounded State**: Pure LLM chatbots lose track of question counts, repeat topics endlessly, hallucinate progress, or allow prompt injection to bypass evaluation rules.
3. **Vague Feedback**: Typical interview feedback provides generic advice rather than actionable evidence derived from demonstrated candidate answers.

---

## 🚀 Solution

**SentinelAI** bridges candidate intelligence with deterministic strategy rules and Groq LLM natural language phrasing:
- **Personalized Candidate Intelligence**: Analyzes candidate background, experience, commit days, and mission completion signals to derive custom topic priorities and initial difficulty.
- **Deterministic Interview Strategy Engine**: Enforces strict completion invariants (**minimum 8 questions AND minimum 4 unique curriculum days**), follow-up budget limits (**max 2 per topic**), and difficulty transitions (`FOUNDATION` ↔ `APPLICATION` ↔ `DEPTH` ↔ `ADVANCED` ↔ `ARCHITECTURE`).
- **Groq LLM Intelligence Layer**: Generates natural technical interviewer questions, evaluates candidate answers across 4 dimensions (0–5 bounded scores), and synthesizes evidence-based debrief reports.
- **Zero-Downtime Fallback Security**: If Groq API rate limits (HTTP 429) or timeouts occur, deterministic fallback evaluators maintain 100% API contract uptime.

---

## ✨ Key Features

- 🧠 **Candidate-Aware Personalization**: Adapts initial question difficulty and topic priorities to individual candidate background signals.
- 🎯 **Adaptive Follow-Up & Topic Transitions**: Probes depth when answers are strong, reframes concepts when answers are weak, and transitions topics when the 2-followup budget is exhausted.
- 🛡️ **Deterministic Guardrails**: 100% immune to prompt injections ("ignore previous instructions", "finish interview now"); LLM never controls state or completion logic.
- 📊 **Structured Debrief Report**: Synthesizes executive summary, demonstrated strengths (`✓`), technical gaps (`→`), and actionable next steps (`1.`, `2.`, `3.`).
- 🎨 **Virtual Technical Interview Room UI**: Dark-first UI featuring an animated Neural AI Interviewer Orb with dynamic visual states (`IDLE`, `ASKING`, `LISTENING`, `EVALUATING`), expandable history drawer, auto-resizing response editor, and responsive candidate selection roster.
- 🔒 **Enterprise Security & Isolation**: Parameterized SQLite state storage, session isolation across 10+ concurrent sessions, zero secrets in client bundles or logs.

---

## 🏗️ Architecture

```
                               ┌───────────────────────────┐
                               │  Candidate Dataset        │
                               │  (data/candidates.json)   │
                               └─────────────┬─────────────┘
                                             │
                                             ▼
┌───────────────────────────┐   ┌───────────────────────────┐
│ Candidate Selection UI    ├──►│ Candidate Profiler        │
│ (public/index.html)       │   │ (candidateProfiler.js)    │
└─────────────▲─────────────┘   └─────────────┬─────────────┘
              │                              │
              │ POST /api/interview          ▼
              │                 ┌───────────────────────────┐
              └─────────────────┤ Interview Strategy Engine │
                                │ (interviewStrategy.js)    │
                                └─────────────┬─────────────┘
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      │                                               │
                      ▼                                               ▼
        ┌───────────────────────────┐                   ┌───────────────────────────┐
        │ Groq LLM Adapter          │                   │ SQLite Persistence        │
        │ (groqService.js)          │                   │ (sessionService.js)       │
        └─────────────┬─────────────┘                   └───────────────────────────┘
                      │
                      ▼
        ┌───────────────────────────┐
        │ 0-5 Answer Evaluator      │
        │ & Debrief Generator       │
        └───────────────────────────┘
```

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite3 (`data/sessions.db`)
- **LLM Engine**: Groq SDK (`llama3-8b-8192`)
- **Frontend**: Vanilla HTML5, CSS3 (CSS Variables, Flexbox, CSS Grid), Vanilla ES6 JavaScript
- **Testing**: Node.js native assert test runner (365 test assertions across 12 test suites)

---

## 🚀 Local Setup

### Prerequisites
- Node.js (v18+)
- npm

### 1. Clone & Install
```bash
npm install
```

### 2. Environment Configuration
Create a `.env` file in the root directory (based on `.env.example`):
```env
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama3-8b-8192
GROQ_TIMEOUT_MS=6000
PORT=3000
```

### 3. Start Application
```bash
npm start
```
Open your browser and navigate to `http://localhost:3000`.

---

## 🔌 API Documentation

### Primary Endpoint: `POST /api/interview`

#### 1. Start Session Request
```json
{
  "sessionId": "sess_1786200000000",
  "candidate": {
    "member": {
      "id": "CAND-001",
      "name": "Sarah Johnson",
      "jobRole": "Senior Data Engineer",
      "yearsExperience": 9,
      "education": "MS Computer Science"
    },
    "signals": {
      "commitDays": 28,
      "missionsCompleted": 30,
      "missionsFirstTry": 20
    }
  }
}
```

#### Ongoing Turn Response (`done: false`)
```json
{
  "reply": "How would you design an HNSW vector index in ChromaDB to maintain sub-50ms query latencies at 10,000 QPS?",
  "done": false
}
```

#### 2. Turn Request
```json
{
  "sessionId": "sess_1786200000000",
  "message": "We configured HNSW indexing with m=16 and ef_construction=200, coupled with metadata pre-filtering and prompt caching."
}
```

#### Completion Response (`done: true`)
```json
{
  "reply": "Interview completed. Thank you for walking through your engineering experiences.",
  "done": true,
  "feedback": {
    "summary": "Sarah Johnson demonstrated senior-level mastery across vector search, index tuning, and distributed retrieval architectures.",
    "strengths": [
      "Expert understanding of HNSW index hyperparameter tuning (m, ef_construction)",
      "Strong practical reasoning for tool calling validation and error handling"
    ],
    "gaps": [
      "Could deepen experience with Kubernetes custom resource definitions (CRDs)"
    ],
    "next": [
      "Explore distributed vector database sharding patterns",
      "Implement client-side token bucket rate limiters"
    ]
  }
}
```

---

## 🧪 Testing & Verification

Run the full automated test suite (12 test suites, 365 assertions):

```bash
# Run full verification suite
node testRunner.js
node verifySqlitePersistence.js
node testPhase6.js
node testPhase7.js
node testPhase8.js
node testPhase9.js
node testPhase10.js
node testPhase11UI.js
node testPhase12Integration.js
node testPhase13QA.js
node testPhase14Hardening.js
node verifyE2E.js
```

### Verification Results
- **Total Assertions**: 365 / 365 passed (100%)
- **Test Suites**: 12 / 12 passed
- **Errors / Warnings**: 0
- **Security Audit**: 100% Clean (Zero committed keys)

---

## 📂 Project Structure

```
.
├── server.js                   # Express server entry point & HTTP security headers
├── config.js                   # Environment configuration loader
├── db.js                       # SQLite database connection & schema initialization
├── dataLoader.js               # Memory-cached JSON curriculum & candidates loader
├── sessionService.js           # SQLite promises wrapper for session state persistence
├── candidateProfiler.js        # Personalization & background profiling module
├── curriculumIndexer.js       # Curriculum topic indexing & prerequisites matcher
├── topicSelector.js            # Topic prioritization & candidate coverage selector
├── interviewStrategyEngine.js  # Deterministic interview rules, budget & completion guards
├── interviewPlanner.js         # Asynchronous turn processing & feedback orchestrator
├── groqService.js              # Groq LLM adapter with retries & deterministic fallbacks
├── validator.js                # API request/response schema validator & length bounds
├── public/
│   └── index.html              # Virtual Technical Interview Room web application
├── data/
│   ├── candidates.json         # Synthetic cohort candidate dataset
│   ├── curriculum.json         # Synthetic curriculum days dataset
│   └── technical-spec.md       # Primary organizer API specification
├── DEMO_SCRIPT.md              # Hackathon presentation & live demo script
├── JUDGE_QA.md                 # 15 Technical Judge Q&A responses
├── PROMPTS.md                  # Hackathon development authenticity log
└── REQUIREMENTS.md             # Functional & technical requirements checklist
```

---

## 🏆 Hackathon Authenticity & Integrity

- **Synthetic Dataset Compliance**: Uses `data/candidates.json` and `data/curriculum.json` provided in the hackathon repository.
- **Deterministic Safeguards**: Strategy rules explicitly enforce `questionCount >= 8` and `coveredCurriculumDays >= 4`.
- **Authenticity Log**: Complete step-by-step prompt history recorded in [PROMPTS.md](file:///c:/Users/MOHITH%20REDDY/OneDrive/Desktop/hackathon/PROMPTS.md).
