# SentinelAI • Hackathon Demo Checklist

Use this operational checklist to ensure a flawless live hackathon demo.

---

### 📋 Before Demo

- [x] **Deployment Live**: Verify Render deployment status is `LIVE` at production URL.
- [x] **Health Check**: Ping `/health` endpoint to verify `{"status":"ok","service":"AI Interview Agent API"}`.
- [x] **Environment Variables**: Verify `GROQ_API_KEY` is configured on Render server.
- [x] **Browser Setup**: Open Chrome/Edge browser to the live production URL.
- [x] **Screen Resolution**: Set display zoom to 100% (Dark glass visual theme renders best at 1080p+).
- [x] **Demo Candidate Ready**: Select **Alex Turner** (Backend Software Engineer) as primary demo profile.

---

### 🎬 During Demo

1. **Start New Session**: Click **New Session** to initialize clean SQLite state.
2. **Review Candidate Profile**: Highlight personalized signals (job role, commit days, initial topic selection).
3. **Question 1 Generation**: Point out candidate-aware initial question topic (**Full-Stack Integration & Streaming Responses**).
4. **Answer Submission**: Type or paste a technical answer detailing architecture and streaming response handling.
5. **Adaptive Follow-Up**: Show how the interviewer probes depth based on the provided answer.
6. **Interview Map**: Demonstrate dynamic status progression (`UPCOMING` → `ACTIVE` → `COVERED`).
7. **Conversation History**: Expand drawer to show turn-by-turn question/answer log.
8. **Complete Interview**: Progress through turns to trigger interview completion.
9. **Final Assessment Debrief**: Showcase the evidence-grounded report with strengths, gaps, and next steps.

---

### ⏱️ Latency & Infrastructure Guidance

- **Cold Starts**: If the Render free-tier service has spun down due to inactivity, the initial page load or session creation may take ~15-20 seconds.
- **LLM Rate Limits / Retries**: Groq API calls include automatic exponential backoff (2 attempts) and a 6-second timeout circuit breaker. If an LLM call times out, SentinelAI seamlessly falls back to deterministic question generation with 0% UI downtime.
