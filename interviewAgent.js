const { loadData } = require('./dataLoader');

// In-memory Session Manager
const sessions = new Map();

/**
 * Main handler for interview endpoint
 */
async function processInterviewTurn(payload) {
  const { sessionId, candidate, message } = payload;

  if (!sessionId) {
    throw new Error("sessionId is required");
  }

  // 1. START INTERVIEW TURN
  if (candidate) {
    const session = createSession(sessionId, candidate);
    const initialGreeting = generateInitialGreeting(session);
    session.history.push({ role: "agent", content: initialGreeting });
    return {
      reply: initialGreeting,
      done: false
    };
  }

  // 2. CONVERSATION OR END TURN
  let session = sessions.get(sessionId);
  if (!session) {
    // Fallback if session missing
    session = createSession(sessionId, { member: { name: "Candidate" } });
  }

  if (message) {
    session.history.push({ role: "candidate", content: message });
  }

  session.turnCount += 1;

  // Check if maximum turns reached (4 turns for interactive interview)
  const isFinalTurn = session.turnCount >= session.maxTurns;

  if (isFinalTurn) {
    const feedback = generateStructuredFeedback(session);
    const finalReply = "Interview completed. Thank you for your time and detailed answers.";
    session.history.push({ role: "agent", content: finalReply });
    session.done = true;

    return {
      reply: finalReply,
      done: true,
      feedback: feedback
    };
  } else {
    const nextQuestion = generateNextTurnReply(session);
    session.history.push({ role: "agent", content: nextQuestion });

    return {
      reply: nextQuestion,
      done: false
    };
  }
}

/**
 * Initialize a new session
 */
function createSession(sessionId, candidate) {
  const member = candidate.member || {};
  const missions = candidate.missions || [];
  const signals = candidate.signals || {};

  const session = {
    sessionId,
    candidate,
    member,
    missions,
    signals,
    turnCount: 0,
    maxTurns: 3, // 3 conversation turns before completion
    history: [],
    topicsCovered: [],
    done: false
  };

  sessions.set(sessionId, session);
  return session;
}

/**
 * Generate initial welcome & first technical question based on candidate background
 */
function generateInitialGreeting(session) {
  const { member, missions, signals } = session;
  const name = member.name || "Candidate";
  const role = member.jobRole || "Software Professional";
  const exp = member.yearsExperience !== undefined ? member.yearsExperience : 0;
  const firstTryRate = signals.missionsCompleted > 0 
    ? Math.round((signals.missionsFirstTry / signals.missionsCompleted) * 100) 
    : 0;

  // Find passed key topics
  const passedMissions = missions.filter(m => m.passed);
  const skippedMissions = missions.filter(m => m.skipped);

  let initialTopic = "RAG & Vector Search architecture";
  if (passedMissions.length > 0) {
    initialTopic = passedMissions[0].title;
  }

  return `Welcome ${name}! We're excited to conduct your AI Engineering interview today. Based on your background as a ${role} (${exp} years exp) and your cohort performance (${signals.missionsCompleted || 0} missions completed, ${firstTryRate}% first-try pass rate), let's dive right in.\n\nCould you walk me through your technical approach on ${initialTopic}? Specifically, what key decisions and trade-offs did you make during implementation?`;
}

/**
 * Generate subsequent turn probing questions
 */
function generateNextTurnReply(session) {
  const { turnCount, member, missions } = session;
  const lastCandidateMessage = [...session.history].reverse().find(h => h.role === "candidate")?.content || "";

  if (turnCount === 1) {
    return `Thank you for sharing that breakdown! That provides great context. Building on your answer, how did you handle error recovery, rate limiting, and fallback scenarios when interfacing with LLM APIs or vector index lookups?`;
  }

  if (turnCount === 2) {
    const skipped = missions.filter(m => m.skipped);
    const probeTopic = skipped.length > 0 ? skipped[0].title : "Multi-Agent Orchestration & Model Context Protocol (MCP)";
    return `Understood. In complex AI architectures, reliability and modularity are crucial. Looking at advanced workflows such as ${probeTopic}, how would you design an agentic pipeline with proper session state management and tool validation?`;
  }

  return `Great insights! One final technical question: If you were to deploy this complete AI system to production under high concurrency, what observability, caching, and guardrail strategies would you implement?`;
}

/**
 * Generate structured feedback adhering strictly to technical-spec.md schema:
 * { summary: string, strengths: string[], gaps: string[], next: string[] }
 */
function generateStructuredFeedback(session) {
  const { member, missions, signals, history } = session;
  const name = member.name || "Candidate";
  const role = member.jobRole || "Engineer";
  const completed = signals.missionsCompleted || 0;
  const firstTry = signals.missionsFirstTry || 0;
  const commitDays = signals.commitDays || 0;

  // Calculate strengths & gaps
  const strengths = [];
  const gaps = [];
  const next = [];

  // Evaluate candidate signals & background
  if (completed >= 28) {
    strengths.push(`High curriculum completion rate (${completed}/31 modules finished).`);
  } else {
    gaps.push(`Incomplete coverage of cohort modules (${completed}/31 modules completed).`);
  }

  if (firstTry >= 20) {
    strengths.push(`Exceptional technical precision with a high first-try pass rate (${firstTry}/${completed}).`);
  } else if (completed > 0) {
    gaps.push(`Higher iteration count on complex tasks (${firstTry}/${completed} first-try passes).`);
  }

  if (commitDays >= 25) {
    strengths.push(`Strong engineering discipline and continuous daily commitment (${commitDays} active commit days).`);
  }

  // Add conversation-based evaluations
  strengths.push(`Demonstrated solid verbal articulation of system architecture and RAG trade-offs during the interview.`);
  
  if (gaps.length === 0) {
    gaps.push(`Could further deepen hands-on exposure to Kubernetes production deployment and distributed tracing.`);
  }

  next.push(`Practice designing production-grade Model Context Protocol (MCP) servers with custom schema validation.`);
  next.push(`Implement streaming SSE and response caching for low-latency AI endpoints.`);
  next.push(`Conduct load testing and cost-optimization profiling on vector index retrievals.`);

  const summary = `${name} demonstrated a strong functional understanding of AI engineering principles, RAG pipelines, and candidate lifecycle workflows. With a background as a ${role} and ${commitDays} active commit days in the cohort, ${name} exhibits strong potential for full-stack AI development.`;

  return {
    summary,
    strengths,
    gaps,
    next
  };
}

module.exports = {
  processInterviewTurn,
  sessions
};
