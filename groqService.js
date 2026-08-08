/**
 * groqService.js
 * Isolated Groq LLM integration service for natural language generation,
 * candidate answer evaluation, and final feedback synthesis.
 *
 * Phase 10 — Structured Answer Evaluation & Final Feedback updates:
 *   - 0-5 bounded internal evaluation scores (technicalAccuracy, conceptualDepth, practicalReasoning, communication)
 *   - Structured evaluation object normalization with safe fallback recovery
 *   - Concise evidence tracking (no chain-of-thought, no hidden reasoning)
 *   - Final feedback synthesis based on demonstrated turn evaluations
 *   - Guaranteed schema validation for organizer API contract
 */

'use strict';

const Groq = require('groq-sdk');
const config = require('./config');

let _groqClient = null;

function getClient() {
  if (!config.groqApiKey) return null;
  if (!_groqClient || _groqClient.apiKey !== config.groqApiKey) {
    _groqClient = new Groq({ apiKey: config.groqApiKey });
  }
  return _groqClient;
}

async function callGroqAPI({ systemPrompt, userPrompt, maxTokens = 512, operationName = 'LLM_Call' }) {
  const client = getClient();
  if (!client) {
    return null;
  }

  const startTime = Date.now();
  const maxRetries = 1;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Groq API Timeout')), config.groqTimeoutMs)
      );

      const apiPromise = client.chat.completions.create({
        model: config.groqModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: maxTokens,
        temperature: 0.5,
      });

      const response = await Promise.race([apiPromise, timeoutPromise]);
      const latency = Date.now() - startTime;
      const content = response.choices?.[0]?.message?.content?.trim() || null;

      console.log(`[GroqService] ${operationName} succeeded | model=${config.groqModel} | latency=${latency}ms | attempt=${attempt}`);
      return (content && content.length > 0) ? content : null;
    } catch (err) {
      const latency = Date.now() - startTime;
      console.warn(`[GroqService] ${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}) | latency=${latency}ms | error=${err.message}`);

      if (err.message && (err.message.includes('401') || err.message.includes('invalid_api_key'))) {
        break;
      }
    }
  }

  return null;
}

async function generateInterviewerResponse(context) {
  if (!context || !context.topic) return null;

  try {
    const isSenior = (context.yearsExperience || 0) >= 5;
    const action = context.nextAction || 'ASK_NEW_TOPIC';

    const systemPrompt = `You are a senior, highly experienced human technical interviewer conducting an adaptive technical interview.

INTERVIEWER PERSONA & RULES:
1. Speak naturally like a real engineering leader pair-interviewing a candidate.
2. Generate exactly ONE clear, challenging, technically focused question.
3. CONVERSATIONAL TRANSITIONS & ACKNOWLEDGMENT:
   - If responding to a previous candidate answer, naturally acknowledge a specific technical term, claim, or choice they mentioned (e.g., "You highlighted latency as the primary constraint...", "That's a solid point on indexing...", "Let me challenge that assumption...").
   - NEVER use robotic phrases such as "Question 1...", "Question 2...", "Thank you for your answer", "That is correct", "Moving to the next question", "As an AI interviewer...", or "According to the curriculum...".
4. STRATEGY ACTION GUIDANCE:
   - DEEPEN / FOLLOW_UP: Directly anchor your follow-up to the candidate's previous response. Probe the specific technical choices, trade-offs, or scale constraints they brought up.
   - REFRAME: The candidate had difficulty. Reframe the concept simply, test core fundamentals, and ask a smaller clarifying question to help them recover.
   - TRANSITION / ASK_NEW_TOPIC: Smoothly bridge from the previous discussion into the new curriculum topic.
5. ADAPTIVE DEPTH BY EXPERIENCE:
   - Senior (>=5 yrs exp): Focus on system architecture, high-concurrency trade-offs, failure modes, reliability, and production constraints.
   - Junior/Mid (0-4 yrs exp): Focus on implementation details, step-by-step mechanics, concrete code examples, and clear practical scenarios.
6. ROLE FRAMING: Tailor domain phrasing for a ${context.candidateRole || 'Software Engineer'}.
7. STRICT CONSTRAINTS: Output ONLY the interviewer's natural response. No preambles, no bullet lists, no chain-of-thought, no internal metadata.`;

    const prevAnswerSnippet = context.previousAnswer
      ? `"${context.previousAnswer.slice(0, 300)}..."`
      : 'N/A (First Question)';

    const prevQuestionsList = Array.isArray(context.previousQuestionsSummary) && context.previousQuestionsSummary.length > 0
      ? context.previousQuestionsSummary.slice(-3).join(' | ')
      : 'None';

    const userPrompt = `Candidate Profile: ${context.candidateRole || 'Engineer'} (${context.yearsExperience || 0} years experience)
Curriculum Topic: Day ${context.day} - ${context.topic}
Curriculum Objective: ${context.objective || 'Technical proficiency'}
Strategy Action: ${action}
Question Type: ${context.questionType || 'APPLICATION'}
Difficulty Level: ${context.difficulty || 'APPLICATION'}
Previous Evaluation Signal: ${context.previousEvaluation || 'UNKNOWN'}
Previous Candidate Response: ${prevAnswerSnippet}
Recently Asked Questions (DO NOT REPEAT): [${prevQuestionsList}]

Formulate the interviewer response.`;

    const res = await service.callGroqAPI({
      systemPrompt,
      userPrompt,
      maxTokens: 256,
      operationName: 'generateInterviewerResponse'
    });

    if (res && typeof res === 'string' && res.trim().length > 0) {
      const trimmed = res.trim();
      if (validateTopicAlignment(trimmed, context.topic)) {
        return trimmed;
      } else {
        console.warn(`[GroqService] LLM generated question failed topic alignment validation for topic "${context.topic}". Falling back.`);
        return null;
      }
    }

    return null;
  } catch (err) {
    console.warn('[GroqService] generateInterviewerResponse caught error, returning null fallback.');
    return null;
  }
}

/**
 * Validates that generated question content aligns with the active target topic.
 *
 * @param {string} responseText - Generated interviewer question text
 * @param {string} topicTitle - Active curriculum topic title
 * @returns {boolean}
 */
function validateTopicAlignment(responseText, topicTitle) {
  if (!responseText || typeof responseText !== 'string' || !topicTitle) return false;

  const topicKeywords = topicTitle.toLowerCase().split(/[\s&/,\-_]+/).filter(w => w.length >= 4);
  if (topicKeywords.length === 0) return true;

  const textLower = responseText.toLowerCase();
  
  // Topic keywords check or generic technical conversation check
  const hasKeyword = topicKeywords.some(kw => textLower.includes(kw));
  if (hasKeyword) return true;

  // Allow if question explicitly addresses general engineering trade-offs or architecture
  const generalTechTerms = ['architecture', 'design', 'system', 'trade-off', 'implementation', 'scale', 'production', 'challenge'];
  const hasTechTerm = generalTechTerms.some(term => textLower.includes(term));

  return hasTechTerm;
}

/**
 * Safely clamp a number to integer range [min, max].
 */
function clampScore(val, defaultVal = 3, min = 0, max = 5) {
  if (typeof val !== 'number' || isNaN(val)) return defaultVal;
  return Math.max(min, Math.min(max, Math.round(val)));
}

/**
 * Normalize and validate structured answer evaluation JSON response.
 */
function normalizeAnswerEvaluation(parsed, context) {
  const validRatings = ['STRONG', 'ADEQUATE', 'WEAK', 'UNKNOWN'];
  
  if (!parsed || typeof parsed !== 'object') {
    return createFallbackAnswerEvaluation(context);
  }

  const rating = validRatings.includes(parsed.rating) ? parsed.rating : 'ADEQUATE';
  const technicalAccuracy = clampScore(parsed.technicalAccuracy, rating === 'STRONG' ? 4 : rating === 'WEAK' ? 1 : 3);
  const conceptualDepth  = clampScore(parsed.conceptualDepth || parsed.depth, rating === 'STRONG' ? 4 : rating === 'WEAK' ? 1 : 3);
  const practicalReasoning = clampScore(parsed.practicalReasoning, rating === 'STRONG' ? 4 : rating === 'WEAK' ? 1 : 3);
  const communication   = clampScore(parsed.communication, 3);
  const missingConcepts  = Array.isArray(parsed.missingConcepts) ? parsed.missingConcepts.map(s => String(s).trim()).filter(Boolean).slice(0, 3) : [];
  
  let evidence = [];
  if (Array.isArray(parsed.evidence)) {
    evidence = parsed.evidence.map(s => String(s).trim()).filter(Boolean).slice(0, 2);
  } else if (typeof parsed.evidence === 'string' && parsed.evidence.trim()) {
    evidence = [parsed.evidence.trim()];
  } else if (Array.isArray(parsed.observations)) {
    evidence = parsed.observations.map(s => String(s).trim()).filter(Boolean).slice(0, 2);
  } else {
    evidence = [`Candidate provided ${rating.toLowerCase()} response for ${context.topic || 'topic'}.`];
  }

  return {
    questionId: context.questionId || `q-${String(context.questionNumber || 1).padStart(3, '0')}`,
    curriculumDay: context.day || 0,
    topic: context.topic || 'General Domain',
    rating,
    technicalAccuracy,
    conceptualDepth,
    practicalReasoning,
    communication,
    missingConcepts,
    evidence
  };
}

function createFallbackAnswerEvaluation(context = {}) {
  const answer = context.candidateAnswer || '';
  const words = typeof answer === 'string' ? answer.trim().split(/\s+/).filter(Boolean).length : 0;
  
  let rating = 'UNKNOWN';
  if (words > 0 && words < 8) rating = 'WEAK';
  else if (words >= 8 && words < 20) rating = 'ADEQUATE';
  else if (words >= 20) rating = 'STRONG';

  const defaultScore = rating === 'STRONG' ? 4 : rating === 'WEAK' ? 1 : rating === 'ADEQUATE' ? 3 : 2;

  return {
    questionId: context.questionId || `q-${String(context.questionNumber || 1).padStart(3, '0')}`,
    curriculumDay: context.day || 0,
    topic: context.topic || 'General Domain',
    rating,
    technicalAccuracy: defaultScore,
    conceptualDepth: defaultScore,
    practicalReasoning: defaultScore,
    communication: words > 0 ? 3 : 1,
    missingConcepts: [],
    evidence: words > 0 ? [`Evaluated ${words} word candidate answer.`] : ['Insufficient candidate response.']
  };
}

async function evaluateCandidateAnswer(context) {
  if (!context || !context.candidateAnswer) {
    return createFallbackAnswerEvaluation(context);
  }

  try {
    const systemPrompt = `You are an expert technical evaluator. Analyze the candidate's answer to the technical question.
Return ONLY a raw JSON object matching this EXACT schema:
{
  "rating": "STRONG" | "ADEQUATE" | "WEAK" | "UNKNOWN",
  "technicalAccuracy": number (0-5),
  "conceptualDepth": number (0-5),
  "practicalReasoning": number (0-5),
  "communication": number (0-5),
  "missingConcepts": ["string"],
  "evidence": ["string (1-2 concise observable statements of what candidate demonstrated)"]
}
Rules:
- Bounded scores MUST be integers from 0 to 5.
- Evidence MUST describe observable candidate statements. Do NOT include chain-of-thought or hidden reasoning.
- Output ONLY valid JSON. No markdown wrappers.`;

    const userPrompt = `Topic: Day ${context.day || ''} - ${context.topic} (${context.difficulty || 'APPLICATION'})
Question Asked: "${context.question || ''}"
Candidate Answer: "${context.candidateAnswer.slice(0, 600)}"

Evaluate the demonstrated technical accuracy, depth, practical reasoning, and communication.`;

    const rawResult = await service.callGroqAPI({
      systemPrompt,
      userPrompt,
      maxTokens: 300,
      operationName: 'evaluateCandidateAnswer'
    });

    if (!rawResult || typeof rawResult !== 'string' || !rawResult.trim()) {
      return createFallbackAnswerEvaluation(context);
    }

    const cleanedJson = rawResult.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(cleanedJson);

    return normalizeAnswerEvaluation(parsed, context);
  } catch (err) {
    console.warn('[GroqService] Answer evaluation JSON parsing failed, using fallback.');
    return createFallbackAnswerEvaluation(context);
  }
}

async function generateFinalFeedback(context) {
  if (!context || !context.candidateSnapshot) return null;

  try {
    const candidate = context.candidateSnapshot;
    const evals = Array.isArray(context.evaluationRecords) ? context.evaluationRecords : [];

    const evalDigest = evals.length > 0
      ? evals.map(e => `- Topic "${e.topic}" (Day ${e.curriculumDay}): Rating ${e.rating}, TechAcc ${e.technicalAccuracy}/5, Depth ${e.conceptualDepth}/5. Evidence: "${(e.evidence || []).join(' ')}"`).join('\n')
      : 'No structured evaluations recorded.';

    const systemPrompt = `You are a senior technical interviewer writing a final debrief report for a candidate.
Return ONLY a raw JSON object matching this EXACT schema:
{
  "summary": "string (2-3 concise executive evaluation sentences based on evidence)",
  "strengths": ["string (actionable strength based on demonstrated strong answers)", "string"],
  "gaps": ["string (actionable technical gap based on weak/incomplete answers)", "string"],
  "next": ["string (concrete learning/career recommendation addressing gaps)", "string", "string"]
}
Rules:
- Strengths MUST be grounded ONLY in demonstrated evidence from the interview.
- Gaps MUST reflect demonstrated weak/incomplete answers or explicit cohort gaps. Do NOT label unasked topics as gaps.
- Recommendations MUST directly address the identified gaps.
- Output ONLY valid JSON. No markdown wrappers.`;

    const userPrompt = `Candidate: ${candidate.name} (${candidate.jobRole}, ${candidate.yearsExperience} yrs exp)
Cohort Stats: ${candidate.commitDays} active commit days, ${candidate.missionsCompleted} completed missions
Covered Days: ${(context.coveredCurriculumDays || []).join(', ')}

Demonstrated Interview Evaluation Records:
${evalDigest}

Synthesize the final debrief report.`;

    const rawResult = await service.callGroqAPI({
      systemPrompt,
      userPrompt,
      maxTokens: 450,
      operationName: 'generateFinalFeedback'
    });

    if (!rawResult || typeof rawResult !== 'string' || !rawResult.trim()) return null;

    const cleanedJson = rawResult.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(cleanedJson);

    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) return null;
    if (!Array.isArray(parsed.strengths) || parsed.strengths.length === 0) return null;
    if (!Array.isArray(parsed.gaps) || parsed.gaps.length === 0) return null;
    if (!Array.isArray(parsed.next) || parsed.next.length === 0) return null;

    return {
      summary: parsed.summary.trim(),
      strengths: parsed.strengths.map(s => String(s).trim()).filter(Boolean),
      gaps: parsed.gaps.map(g => String(g).trim()).filter(Boolean),
      next: parsed.next.map(n => String(n).trim()).filter(Boolean)
    };
  } catch (err) {
    console.warn('[GroqService] Final feedback JSON parsing failed, using fallback.');
    return null;
  }
}

const service = {
  getClient,
  callGroqAPI,
  generateInterviewerResponse,
  evaluateCandidateAnswer,
  generateFinalFeedback,
  normalizeAnswerEvaluation,
  createFallbackAnswerEvaluation
};

module.exports = service;
