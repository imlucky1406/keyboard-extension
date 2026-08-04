// Background service worker for Gemini Text Improver Extension

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

// 1. General rewrite helper
async function improveText(text, instruction, apiKey, model = "gemini-3.6-flash") {
  if (!apiKey) {
    throw new Error("Missing Gemini API Key. Please click the extension icon to set it up.");
  }

  const prompt = `You are a writing assistant. Rewrite the following text based on this instruction: "${instruction}".

Guidelines:
- Retain all information, key points, details, and relative length of the original text. Do NOT summarize, shorten, or turn the text into a minimal statement unless the instruction explicitly asks to condense or simplify it.
- Keep the structure and message as detailed and complete as the original text.

CRITICAL REQUIREMENT: Output ONLY the directly improved rewrite.
Do NOT wrap the output in quotes, do NOT add comments, explanations, markdown formatting (like "**Revised:**"), or introduction. Just output the revised text exactly as it should look.

Original Text:
${text}

Revised Text:`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 1000
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    let errMsg = "API error";
    try {
      const errJSON = JSON.parse(errText);
      errMsg = errJSON.error.message || errMsg;
    } catch (e) {
      errMsg = errText || errMsg;
    }
    throw new Error(`Gemini API Error: ${errMsg}`);
  }

  const result = await response.json();
  if (result.candidates?.[0]?.content?.parts?.[0]) {
    return result.candidates[0].content.parts[0].text.trim();
  } else {
    throw new Error("Invalid response format received from Gemini API.");
  }
}

// 2. Grammar check helper (Returns JSON List of suggestions)
async function checkGrammar(text, apiKey, model = "gemini-3.6-flash") {
  if (!apiKey) {
    throw new Error("Missing Gemini API Key. Please click the extension icon to set it up.");
  }

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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
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
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    let errMsg = "API error";
    try {
      const errJSON = JSON.parse(errText);
      errMsg = errJSON.error.message || errMsg;
    } catch (e) {
       errMsg = errText || errMsg;
    }
    throw new Error(`Gemini API Error: ${errMsg}`);
  }

  const result = await response.json();
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

// 3. Custom text generator helper
async function generateText(topic, agenda, purpose, apiKey, model = "gemini-3.6-flash") {
  if (!apiKey) {
    throw new Error("Missing Gemini API Key. Please click the extension icon to set it up.");
  }

  const prompt = `You are a writing assistant. Generate structured, high-quality text based on:
- Topic: ${topic}
- Agenda/Key points to cover: ${agenda}
- Intended Purpose/Format: ${purpose}

CRITICAL REQUIREMENT: Output ONLY the drafted document/text.
Do NOT write titles at the top, introductions like "Here is your email:", or footnotes. Output only the copy so it is immediately insertable.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 1500
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    let errMsg = "API error";
    try {
      const errJSON = JSON.parse(errText);
      errMsg = errJSON.error.message || errMsg;
    } catch (e) {
      errMsg = errText || errMsg;
    }
    throw new Error(`Gemini API Error: ${errMsg}`);
  }

  const result = await response.json();
  if (result.candidates?.[0]?.content?.parts?.[0]) {
    return result.candidates[0].content.parts[0].text.trim();
  } else {
    throw new Error("Invalid response format received from Gemini API.");
  }
}

// 5. Robust JSON truncation repair utility
function repairTruncatedJSON(jsonStr) {
  jsonStr = jsonStr.trim();
  
  // Try parsing directly first
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

  // Close open brackets and braces in reverse order
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
