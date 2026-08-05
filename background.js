// Background service worker for Gemini Text Improver Extension

// --- Constants ---
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_TIMEOUT_MS = 15000; // 15 seconds request timeout
const MAX_RETRYS = 2; // Retry once or twice on transient errors
const INITIAL_RETRY_DELAY_MS = 1000; // 1 second backoff starting delay

// --- Message Listener ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "IMPROVE_TEXT") {
    improveText(request.text, request.instruction, request.apiKey, request.model)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // asynchronous response
  }
  
  if (request.type === "CHECK_GRAMMAR") {
    checkGrammar(request.text, request.apiKey, request.model)
      .then(suggestions => sendResponse({ success: true, data: suggestions }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.type === "GENERATE_TEXT") {
    generateText(request.topic, request.agenda, request.purpose, request.apiKey, request.model)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === "OPEN_SETTINGS") {
    chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
    sendResponse({ success: true });
    return false;
  }
});

// --- Core API Helpers ---

/**
 * Parses the raw API error response safely.
 * @param {string} errText - Raw error response body
 * @returns {string} Human-readable error message
 */
function parseErrorResponse(errText) {
  let errMsg = "API error";
  try {
    const errJSON = JSON.parse(errText);
    if (errJSON.error?.message) {
      return errJSON.error.message;
    }
  } catch (e) {
    // Non-JSON response, rollback to raw text
  }
  return errText || errMsg;
}

/**
 * Performs fetch calls with timeout limits and transient error retries.
 * @param {string} url - Target fetch URL
 * @param {Object} options - Request options configuration
 * @param {number} retries - Number of remaining retry attempts
 * @param {number} backoff - Current delay before retry in milliseconds
 */
async function fetchWithTimeoutAndRetry(url, options, retries = MAX_RETRYS, backoff = INITIAL_RETRY_DELAY_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  
  const fetchOptions = {
    ...options,
    signal: controller.signal
  };

  try {
    const response = await fetch(url, fetchOptions);
    clearTimeout(id);

    // Try to recover when rate limits (429) or transient backend troubles (503, 504) happen
    if (!response.ok) {
      const isTransient = [429, 503, 504].includes(response.status);
      if (isTransient && retries > 0) {
        await new Promise(resolve => setTimeout(resolve, backoff));
        return fetchWithTimeoutAndRetry(url, options, retries - 1, backoff * 2);
      }

      // Final failure
      const errText = await response.text();
      const detailedMessage = parseErrorResponse(errText);
      throw new Error(`Gemini API Error (HTTP ${response.status}): ${detailedMessage}`);
    }

    return response;
  } catch (err) {
    clearTimeout(id);
    if (err.name === 'AbortError') {
      throw new Error(`Gemini API Request Timed Out (exceeded ${DEFAULT_TIMEOUT_MS / 1000}s limit). Please check your connection.`);
    }
    throw err;
  }
}

/**
 * High-level helper to trigger Gemini's API
 * @param {Object} params - Request options containing model, API Key, payload body, and endpoint
 */
async function callGeminiAPI({ model, apiKey, payload, endpoint = "generateContent" }) {
  if (!apiKey) {
    throw new Error("Missing Gemini API Key. Setup your credentials in the settings panel first.");
  }
  
  const cleanModel = model || "gemini-3.6-flash";
  const url = `${GEMINI_BASE_URL}/models/${cleanModel}:${endpoint}?key=${apiKey}`;

  const response = await fetchWithTimeoutAndRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  return await response.json();
}

// --- Specific Service Handlers ---

/**
 * 1. General rewrite helper
 */
async function improveText(text, instruction, apiKey, model) {
  const prompt = `You are a writing assistant. Rewrite the following text based on this instruction: "${instruction}".

Guidelines:
- Retain all information, key points, details, and relative length of the original text. Do NOT summarize, shorten, or turn the text into a minimal statement unless the instruction explicitly asks to condense or simplify it.
- Keep the structure and message as detailed and complete as the original text.

CRITICAL REQUIREMENT: Output ONLY the directly improved rewrite.
Do NOT wrap the output in quotes, do NOT add comments, explanations, markdown formatting (like "**Revised:**"), or introduction. Just output the revised text exactly as it should look.

Original Text:
${text}

Revised Text:`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 1000
    }
  };

  const result = await callGeminiAPI({ model, apiKey, payload });

  if (result.candidates?.[0]?.content?.parts?.[0]) {
    return result.candidates[0].content.parts[0].text.trim();
  } else {
    throw new Error("Invalid response format received from Gemini API.");
  }
}

/**
 * 2. Grammar check helper (Returns JSON List of suggestions)
 */
async function checkGrammar(text, apiKey, model) {
  const systemPrompt = `You are a strict, expert copy editor and proofreader.
Your task is to identify and correct ALL spelling, grammar, punctuation, typo, and style errors in the provided text.

For each error detected:
- 'original': the exact wrong substring from the text (case-sensitive).
- 'replacement': the corrected version of the substring.
- 'description': a short explanation of the change (e.g., "Change u to you").
- 'category': the category of the error (Correctness, Spelling, Punctuation, Style).

CRITICAL INSTRUCTIONS:
1. Do not ignore minor typos, chat shorthands, slang, or case errors.
2. Swap out chat abbreviations/typos for full correct English (e.g., 'u' -> 'you', 'r' -> 'are', 'halp' -> 'help', 'hellow' -> 'hello', 'plz' -> 'please', 'i' -> 'I').
3. Output MUST strictly fit the required JSON schema format.
4. If the text has no errors, you must return an empty list of errors.`;

  const payload = {
    contents: [{ parts: [{ text: text }] }],
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          errors: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                original: { type: "STRING" },
                replacement: { type: "STRING" },
                description: { type: "STRING" },
                category: { type: "STRING", enum: ["Correctness", "Spelling", "Punctuation", "Style"] }
              },
              required: ["original", "replacement", "description", "category"]
            }
          }
        },
        required: ["errors"]
      },
      maxOutputTokens: 2048
    }
  };

  const result = await callGeminiAPI({ model, apiKey, payload });

  if (result.candidates?.[0]?.content?.parts?.[0]) {
    let rawText = result.candidates[0].content.parts[0].text.trim();
    
    // Wipe MD blocks if returned
    if (rawText.startsWith("```")) {
      rawText = rawText.replace(/^```(json)?\s*/i, "");
      rawText = rawText.replace(/\s*```$/, "");
    }
    
    const repairedText = repairTruncatedJSON(rawText);
    try {
      const parsed = JSON.parse(repairedText);
      if (parsed && Array.isArray(parsed.errors)) {
        return parsed.errors;
      }
      if (Array.isArray(parsed)) {
        return parsed;
      }
      throw new Error("Structured API response is missing errors array");
    } catch (e) {
      throw new Error(`JSON Parsing Failed: ${e.message}. Raw output: ${rawText}`);
    }
  } else {
    throw new Error("Empty response received from Gemini API candidates.");
  }
}

/**
 * 3. Custom text generator helper
 */
async function generateText(topic, agenda, purpose, apiKey, model) {
  const prompt = `You are a writing assistant. Generate structured, high-quality text based on:
- Topic: ${topic}
- Agenda/Key points to cover: ${agenda}
- Intended Purpose/Format: ${purpose}

CRITICAL REQUIREMENT: Output ONLY the drafted document/text.
Do NOT write titles at the top, introductions like "Here is your email:", or footnotes. Output only the copy so it is immediately insertable.`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 1500
    }
  };

  const result = await callGeminiAPI({ model, apiKey, payload });

  if (result.candidates?.[0]?.content?.parts?.[0]) {
    return result.candidates[0].content.parts[0].text.trim();
  } else {
    throw new Error("Invalid response format received from Gemini API.");
  }
}

/**
 * 5. Robust JSON truncation repair utility
 * This function parses truncated or cut string blocks from Gemini
 * and automatically appends missing strings or enclosing brackets.
 */
function repairTruncatedJSON(jsonStr) {
  jsonStr = jsonStr.trim();
  
  try {
    JSON.parse(jsonStr);
    return jsonStr;
  } catch (e) {}

  let inString = false;
  let escaped = false;
  let stack = [];

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
    } else {
      if (char === '"') {
        inString = true;
      } else if (char === '{' || char === '[') {
        stack.push(char);
      } else if (char === '}') {
        if (stack[stack.length - 1] === '{') stack.pop();
      } else if (char === ']') {
        if (stack[stack.length - 1] === '[') stack.pop();
      }
    }
  }

  let repaired = jsonStr;
  if (inString) {
    repaired += '"';
  }

  // Close open brackets and braces in reverse order to balance the envelopes
  while (stack.length > 0) {
    const last = stack.pop();
    if (last === '{') {
      repaired += '}';
    } else if (last === '[') {
      repaired += ']';
    }
  }

  try {
    JSON.parse(repaired);
    return repaired;
  } catch (e) {
    return jsonStr; // fallback to original if repair fails
  }
}
