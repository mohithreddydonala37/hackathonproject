function validateInterviewRequest(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object.' };
  }

  const { sessionId, candidate, message } = body;

  if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '') {
    return { valid: false, error: 'sessionId is required in request body.' };
  }

  if (sessionId.length > 256) {
    return { valid: false, error: 'sessionId exceeds maximum length limit of 256 characters.' };
  }

  if (!candidate && message === undefined) {
    return { valid: false, error: 'Either candidate (to start) or message (to continue) must be provided.' };
  }

  if (candidate && (typeof candidate !== 'object' || candidate === null)) {
    return { valid: false, error: 'candidate must be a valid object.' };
  }

  if (message !== undefined) {
    if (typeof message !== 'string') {
      return { valid: false, error: 'message must be a string.' };
    }
    if (message.length > 10000) {
      return { valid: false, error: 'message exceeds maximum length limit of 10000 characters.' };
    }
  }

  return { valid: true };
}

function validateInterviewResponse(response) {
  if (!response || typeof response !== 'object') {
    return { valid: false, error: 'Response must be a JSON object.' };
  }

  if (typeof response.reply !== 'string' || response.reply.trim() === '') {
    return { valid: false, error: 'reply must be a non-empty string.' };
  }

  if (typeof response.done !== 'boolean') {
    return { valid: false, error: 'done must be a boolean.' };
  }

  if (response.done === true) {
    const fb = response.feedback;
    if (!fb || typeof fb !== 'object') {
      return { valid: false, error: 'Feedback object is required when done is true.' };
    }

    if (typeof fb.summary !== 'string' || fb.summary.trim() === '') {
      return { valid: false, error: 'feedback.summary must be a non-empty string.' };
    }

    if (!Array.isArray(fb.strengths) || fb.strengths.some(s => typeof s !== 'string')) {
      return { valid: false, error: 'feedback.strengths must be an array of strings.' };
    }

    if (!Array.isArray(fb.gaps) || fb.gaps.some(g => typeof g !== 'string')) {
      return { valid: false, error: 'feedback.gaps must be an array of strings.' };
    }

    if (!Array.isArray(fb.next) || fb.next.some(n => typeof n !== 'string')) {
      return { valid: false, error: 'feedback.next must be an array of strings.' };
    }
  }

  return { valid: true };
}

module.exports = {
  validateInterviewRequest,
  validateInterviewResponse
};
