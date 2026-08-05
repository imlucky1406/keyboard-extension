// content.js - Grammarly-like AI Assistant Content Script

(function () {
  // Prevent duplicate injection
  if (window.__geminiTextImproverLoaded) return;
  window.__geminiTextImproverLoaded = true;

  // Extension configurations
  let config = {
    apiKey: "",
    model: "gemini-3.6-flash",
    enableOnFocus: true,
    enableOnSelection: true,
    auditMode: "auto",
    myVoice: {
      formality: "Neutral",
      tones: ["Confident"]
    }
  };

  // State management
  let activeElement = null;
  let lastActiveElement = null;
  let activeSuggestions = [];
  let currentSuggestionIndex = 0;
  let checkDebounceTimer = null;
  let isWidgetOpen = false;
  let generatedResultText = "";
  let apiError = "";
  let selectedText = "";
  let isSelectionMode = false;
  let lastAuditedText = "";
  let isAuditLoading = false;
  const auditCache = new Map();

  const BULB_PRESETS = [
    {
      id: "quickcorrect",
      title: "Quick Correct",
      desc: "Correct grammar & spelling errors strictly",
      icon: "💡",
      textColor: "#f43f5e",
      iconHTML: `
        <svg viewBox="0 0 24 24" style="width: 13px; height: 13px; display: block;">
          <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z" fill="currentColor"/>
        </svg>
      `,
      prompt: "Check spelling and grammar. Correct all spelling, grammar, punctuation, and wording errors. Do NOT add any extra introductory text, notes, warnings, or comments. Return ONLY the final corrected text. Preserve the original sentence structures, length, tone, and formatting as closely as possible."
    },
    {
      id: "improve",
      title: "Improve it",
      desc: "Polish grammar & flow",
      icon: "🪄",
      textColor: "#0ea5e9",
      iconHTML: `🪄`,
      prompt: "Improve grammar, spelling, flow and polish this text. Maintain the original message."
    },
    {
      id: "professional",
      title: "Professional Tone",
      desc: "Convert text to formal business style",
      icon: "💼",
      textColor: "#3b82f6",
      iconHTML: `💼`,
      prompt: "Convert this text into a professional, polite, and formal business tone."
    },
    {
      id: "casual",
      title: "Casual Tone",
      desc: "Convert text to warm conversational style",
      icon: "👋",
      textColor: "#10b981",
      iconHTML: `👋`,
      prompt: "Convert this text into a friendly, warm, casual, and conversational tone."
    },
    {
      id: "genz",
      title: "Gen Z Tone",
      desc: "Translate using Gen Z slang fr fr",
      icon: "💀",
      textColor: "#ec4899",
      iconHTML: `💀`,
      prompt: "Convert this text into a Gen Z tone using popular slang like 'fr fr', 'no cap', 'bet', 'slay', 'lowkey', 'skibidi', etc., while keeping the original meaning."
    },
    {
      id: "concise",
      title: "Make Concise",
      desc: "Condense to be clean, brief, and punchy",
      icon: "📝",
      textColor: "#eab308",
      iconHTML: `📝`,
      prompt: "Condense this text to make it clean, brief, concise, and punchy."
    },
    {
      id: "simplify",
      title: "Simplify & Format",
      desc: "Clean problem statements",
      icon: "📋",
      textColor: "#06b6d4",
      iconHTML: `📋`,
      prompt: "Format this text into a clean, understandable, and well-structured statement. Use bullet points and appropriate spacing, but keep the statement exactly as it is without truncating or making it minimal."
    },
    {
      id: "objections",
      title: "Counterarguments",
      desc: "Find weak areas or objections",
      icon: "⚖️",
      textColor: "#8b5cf6",
      iconHTML: `⚖️`,
      prompt: "Analyze this statement and politely suggest 2-3 counterarguments, potential weak areas, or objections, structured clearly."
    }
  ];

  function updateBulbButtonIcon() {
    if (typeof pillLeftBtn === "undefined" || !pillLeftBtn) return;
    const preset = BULB_PRESETS.find(p => p.id === (config.activeBulbPreset || "quickcorrect")) || BULB_PRESETS[0];
    const sparkCircle = pillLeftBtn.querySelector(".teal-spark-circle");
    if (sparkCircle) {
      if (!sparkCircle.style.animation.includes("spin")) {
        sparkCircle.innerHTML = preset.iconHTML;
        if (preset.id === "quickcorrect") {
          sparkCircle.style.backgroundColor = "var(--g-teal)";
          sparkCircle.style.color = "white";
          const svgEl = sparkCircle.querySelector("svg");
          if (svgEl) {
            svgEl.style.width = "13px";
            svgEl.style.height = "13px";
            svgEl.style.fill = "white";
          }
        } else {
          sparkCircle.style.backgroundColor = "transparent";
          sparkCircle.style.color = "inherit";
          sparkCircle.style.fontSize = "14px";
          sparkCircle.style.lineHeight = "1";
        }
      }
    }
    updatePillCounter();
  }

  // Load storage config
  function loadConfig() {
    chrome.storage.local.get({
      geminiApiKey: "",
      geminiModel: "gemini-3.6-flash",
      enableOnFocus: true,
      enableOnSelection: true,
      auditMode: "auto",
      activeBulbPreset: "quickcorrect",
      myVoice: {
        formality: "Neutral",
        tones: ["Confident"]
      }
    }, (items) => {
      config.apiKey = items.geminiApiKey;
      config.model = items.geminiModel;
      config.enableOnFocus = items.enableOnFocus;
      config.enableOnSelection = items.enableOnSelection;
      config.auditMode = items.auditMode || "auto";
      config.activeBulbPreset = items.activeBulbPreset || "quickcorrect";
      config.myVoice = items.myVoice;
      
      updateBulbButtonIcon();
    });
  }
  loadConfig();

  // Storage changes listener
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.geminiApiKey) {
      config.apiKey = changes.geminiApiKey.newValue;
      apiError = ""; // Clear errors on key reconfig
    }
    if (changes.geminiModel) config.model = changes.geminiModel.newValue;
    if (changes.enableOnFocus) config.enableOnFocus = changes.enableOnFocus.newValue;
    if (changes.enableOnSelection) config.enableOnSelection = changes.enableOnSelection.newValue;
    if (changes.auditMode) config.auditMode = changes.auditMode.newValue;
    if (changes.activeBulbPreset) {
      config.activeBulbPreset = changes.activeBulbPreset.newValue || "quickcorrect";
      updateBulbButtonIcon();
    }
    
    updateBulbButtonIcon();
  });

  // Create isolated Shadow DOM
  const shadowHost = document.createElement("div");
  shadowHost.id = "gemini-improver-root";
  shadowHost.style.position = "absolute";
  shadowHost.style.top = "0";
  shadowHost.style.left = "0";
  shadowHost.style.zIndex = "2147483647"; 
  document.body.appendChild(shadowHost);

  const shadowRoot = shadowHost.attachShadow({ mode: "open" });

  // CSS Styles for Grammarly Design Mockup
  const style = document.createElement("style");
  style.textContent = `
    :host {
      --g-teal: #11a683;
      --g-teal-dark: #0d8569;
      --g-red: #e02424;
      --g-gray: #4c5e70;
      --g-light-gray: #e6ecf0;
      --bg-white: #ffffff;
      --text-dark: #0e1e24;
      --text-muted: #7c8c9a;
      
      --font-stack: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --shadow-widget: 0 12px 30px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.04);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: var(--font-stack);
    }

    /* Floating Capsule Pill inside Textareas */
    .capsule-pill {
      position: fixed;
      display: flex;
      align-items: center;
      background: white;
      border: 1px solid #dce4e8;
      border-radius: 20px;
      padding: 4px 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      z-index: 2147483647;
      opacity: 0;
      pointer-events: none;
      transform: scale(0.9);
      transition: opacity 0.25s, transform 0.25s, border-color 0.2s;
      height: 32px;
      cursor: default;
    }

    .capsule-pill.visible {
      opacity: 1;
      pointer-events: auto;
      transform: scale(1);
    }

    .selection-pill-label {
      font-size: 11.5px;
      font-weight: 600;
      color: var(--g-teal);
      margin-left: 6px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 140px;
    }

    .capsule-pill:hover {
      border-color: #bbc7cf;
    }

    .pill-group-left {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
    }

    .teal-spark-circle {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background-color: var(--g-teal);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.2s;
    }

    .teal-spark-circle:hover {
      background-color: var(--g-teal-dark);
    }

    .teal-spark-circle svg {
      width: 11px;
      height: 11px;
      fill: white;
    }

    .red-count-badge {
      background: var(--g-red);
      color: white;
      font-size: 11px;
      font-weight: 700;
      min-width: 16px;
      height: 16px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
      box-shadow: 0 1px 3px rgba(224, 36, 36, 0.4);
    }
    
    .green-check {
      color: var(--g-teal);
      font-size: 12px;
      font-weight: bold;
    }

    .pill-divider {
      width: 1px;
      height: 16px;
      background-color: #dce4e8;
      margin: 0 8px;
    }

    .pill-add-btn {
      background: none;
      border: none;
      color: var(--g-gray);
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      transition: background-color 0.2s, color 0.2s;
    }

    .pill-add-btn:hover {
      background-color: var(--g-light-gray);
      color: var(--text-dark);
    }

    /* Main Grammarly suggestions / Generator Card overlay */
    .g-widget {
      position: fixed;
      width: 330px;
      max-height: 480px; /* Constrain overall height */
      background: var(--bg-white);
      border: 1px solid #dce4e8;
      border-radius: 12px;
      box-shadow: var(--shadow-widget);
      z-index: 2147483647;
      color: var(--text-dark);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      opacity: 0;
      pointer-events: none;
      transform: translateY(8px) scale(0.96);
      transition: opacity 0.2s ease, transform 0.2s ease;
    }

    .widget-body-container {
      overflow-y: auto; /* Enable scroll bars for long content */
      max-height: 410px; /* Constrain body height to leave space for header */
    }

    .g-widget.visible {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0) scale(1);
    }

    /* Widget Header */
    .widget-header {
      padding: 12px 14px;
      border-bottom: 1px solid #f1f4f6;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .widget-logo-badge {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background-color: var(--g-teal);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 12px;
    }

    .widget-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--text-dark);
      flex: 1;
    }

    .widget-count-badge {
      background: var(--g-light-gray);
      color: var(--g-gray);
      font-weight: 600;
      font-size: 11px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 4px;
    }

    .header-icons {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .header-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 14px;
      padding: 2px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.2s;
    }

    .header-btn:hover {
      color: var(--text-dark);
    }

    /* Suggestions card body */
    .suggestions-body {
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .suggestion-category-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.4px;
    }
    
    .cat-correctness {
      color: var(--g-red);
    }
    
    .cat-clarity {
      color: #0284c7;
    }

    .cat-icon-shield {
      width: 14px;
      height: 14px;
      background-size: contain;
    }

    /* Text preview snippet matching live Grammarly format */
    .suggestion-text-preview {
      font-size: 13px;
      line-height: 1.5;
      padding: 10px 12px;
      background: #f8fafc;
      border-radius: 8px;
      border: 1px solid #f1f5f9;
      color: var(--text-muted);
      min-height: 48px;
    }

    .diff-removed {
      text-decoration: line-through;
      color: var(--text-muted);
      margin-right: 6px;
      background-color: rgba(244, 63, 94, 0.08);
      padding: 1px 3px;
      border-radius: 2px;
    }

    .diff-added {
      color: var(--text-dark);
      font-weight: 700;
      margin-right: 4px;
      border-bottom: 2px solid var(--g-teal);
      background-color: rgba(17, 166, 131, 0.08);
      padding: 1.5px 3.5px;
      border-radius: 3px;
    }

    /* Suggestions Action footer buttons */
    .suggestion-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 6px;
    }

    .action-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn-accept {
      background: var(--g-teal);
      color: white;
      border: none;
      border-radius: 20px;
      padding: 8px 18px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .btn-accept:hover {
      background-color: var(--g-teal-dark);
    }

    .btn-dismiss {
      background: none;
      border: none;
      color: var(--g-gray);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      padding: 8px 10px;
      border-radius: 4px;
    }

    .btn-dismiss:hover {
      text-decoration: underline;
      color: var(--text-dark);
    }

    .paging-section {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--text-muted);
      font-weight: 500;
    }

    .paging-arrow {
      background: none;
      border: none;
      color: var(--g-gray);
      cursor: pointer;
      padding: 4px 6px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      font-size: 10px;
    }

    .paging-arrow:hover {
      background: var(--g-light-gray);
      color: var(--text-dark);
    }
    
    .paging-arrow:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    /* No errors view card */
    .clean-result-wrapper {
      padding: 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 8px;
    }
    
    .clean-icon {
      font-size: 28px;
      animation: bounce 2s infinite;
    }
    
    .clean-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--text-dark);
    }
    
    .clean-desc {
      font-size: 12px;
      color: var(--text-muted);
    }

    /* --- AI WRITER CARD PANEL --- */
    .generator-body {
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .form-group label {
      font-size: 11px;
      font-weight: 600;
      color: var(--g-gray);
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }

    .g-input, .g-textarea, .g-select {
      width: 100%;
      background: white;
      border: 1px solid #dce4e8;
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 12px;
      color: var(--text-dark);
      outline: none;
      transition: border-color 0.2s;
    }

    .g-input:focus, .g-textarea:focus, .g-select:focus {
      border-color: var(--g-teal);
    }

    .g-textarea {
      resize: vertical;
      min-height: 56px;
    }

    .btn-generate {
      background: var(--g-teal);
      color: white;
      border: none;
      border-radius: 6px;
      padding: 10px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      text-align: center;
      transition: background-color 0.2s;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .btn-generate:hover {
      background-color: var(--g-teal-dark);
    }

    /* Generator Result Block */
    .generator-result-wrapper {
      display: flex;
      flex-direction: column;
      gap: 10px;
      border-top: 1px solid #f1f4f6;
      padding-top: 12px;
      margin-top: 4px;
    }

    .result-textarea {
      width: 100%;
      height: 120px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px;
      font-size: 11.5px;
      line-height: 1.4;
      color: var(--text-dark);
      outline: none;
      resize: vertical;
    }

    .result-actions {
      display: flex;
      gap: 6px;
    }

    .btn-secondary {
      background: #f1f4f6;
      color: var(--g-gray);
      border: 1px solid #dce4e8;
      padding: 8px 14px;
      border-radius: 6px;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      flex: 1;
      text-align: center;
    }

    .btn-secondary:hover {
      background-color: var(--g-light-gray);
      color: var(--text-dark);
    }

    .btn-insert {
      background: var(--g-teal);
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 11.5px;
      font-weight: 700;
      cursor: pointer;
      flex: 2;
      text-align: center;
    }

    .btn-insert:hover {
      background-color: var(--g-teal-dark);
    }

    /* Preset List Styling */
    .preset-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 12px 0 16px 0;
    }
    
    .preset-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 8px;
      background: #fafafa;
      border: 1px solid #f0f0f0;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    
    .preset-item:hover {
      background: #f1f8f6;
      border-color: rgba(17, 166, 131, 0.25);
    }
    
    .preset-item.active {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      background: #f8fafc;
      border-color: var(--g-teal);
      cursor: default;
    }
    
    .preset-icon {
      font-size: 15px;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      background: #ffffff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    
    .preset-content {
      display: flex;
      flex-direction: column;
      gap: 2px;
      text-align: left;
    }
    
    .preset-title {
      font-size: 12px;
      font-weight: 600;
      color: #1e293b;
    }
    
    .preset-desc {
      font-size: 10.5px;
      color: #64748b;
    }
    
    /* Bottom search bar */
    .writer-prompt-bar {
      position: relative;
      display: flex;
      align-items: center;
      margin-top: 12px;
      background: #ffffff;
      border: 1.5px solid #e2e8f0;
      border-radius: 20px;
      padding: 4px 12px;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    
    .writer-prompt-bar:focus-within {
      border-color: var(--g-teal);
      box-shadow: 0 0 0 3px rgba(17, 166, 131, 0.1);
    }
    
    .prompt-bar-input {
      flex: 1;
      border: none;
      background: transparent;
      outline: none;
      font-size: 12px;
      color: #1e293b;
      padding: 6px 0;
    }
    
    .prompt-bar-input::placeholder {
      color: #94a3b8;
    }
    
    .prompt-bar-submit-btn {
      background: var(--g-teal);
      color: white;
      border: none;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 10px;
      font-weight: bold;
      transition: background 0.15s;
    }
    
    .prompt-bar-submit-btn:hover {
      background: var(--g-teal-dark);
    }

    /* Voice Settings Styling */
    .voice-container {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 4px 6px;
      text-align: left;
    }
    
    .voice-title {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 2px;
    }
    
    .voice-subtitle {
      font-size: 11px;
      color: #64748b;
      margin-bottom: 6px;
    }
    
    .voice-row-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    
    .voice-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 20px;
      background: #fafafa;
      border: 1px solid #e2e8f0;
      font-size: 11.5px;
      color: #334155;
      cursor: pointer;
      transition: all 0.15s;
      user-select: none;
    }
    
    .voice-pill:hover {
      background: #f1f5f9;
      border-color: #cbd5e1;
    }
    
    .voice-pill.selected {
      background: #effaf6;
      border-color: var(--g-teal);
      color: var(--g-teal);
      font-weight: 600;
    }
    
    .voice-input-text {
      width: 100%;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 12px;
      color: #334155;
      outline: none;
      transition: border-color 0.2s;
    }
    
    .voice-input-text:focus {
      border-color: var(--g-teal);
    }
    
    .voice-bottom-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 8px;
    }
    
    .btn-voice-close {
      background: transparent;
      color: #64748b;
      border: none;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    
    .btn-voice-close:hover {
      color: #0f172a;
    }
    
    .btn-voice-save {
      background: var(--g-teal);
      color: white;
      border: none;
      border-radius: 6px;
      padding: 8px 16px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.15s;
    }
    
    .btn-voice-save:hover {
      background: var(--g-teal-dark);
    }

    /* Processing AI Loader */
    .ai-spinner-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      padding: 20px 0;
    }

    .ai-spinner {
      width: 24px;
      height: 24px;
      border: 2.5px solid rgba(17, 166, 131, 0.15);
      border-top-color: var(--g-teal);
      border-radius: 50%;
      animation: spin 0.85s linear infinite;
    }
    
    .error-box {
      background-color: rgba(224, 36, 36, 0.05);
      border: 1px solid rgba(224, 36, 36, 0.15);
      color: var(--g-red);
      font-size: 11.5px;
      padding: 8px 10px;
      border-radius: 6px;
      line-height: 1.4;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-4px); }
    }
  `;
  shadowRoot.appendChild(style);

  // --- FLOATING TRIGGER CAPSULE PILL ---
  const pill = document.createElement("div");
  pill.className = "capsule-pill";
  pill.innerHTML = `
    <div class="pill-group-left" title="Click to Quick Correct Grammar & Spelling">
      <div class="teal-spark-circle">
        <svg viewBox="0 0 24 24">
          <!-- Spark character icon path -->
          <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z" fill="white"/>
        </svg>
      </div>
      <div class="selection-pill-label" style="display: none;">Rewrite selection</div>
      <div class="red-count-badge" style="display: none;">0</div>
      <div class="green-check" style="display: none;">✓</div>
    </div>
    <div class="pill-divider"></div>
    <button class="pill-add-btn" title="AI Writer (Generate Text by Topic/Agenda)">+</button>
  `;
  shadowRoot.appendChild(pill);

  const pillLeftBtn = pill.querySelector(".pill-group-left");
  const pillRedBadge = pill.querySelector(".red-count-badge");
  const pillGreenCheck = pill.querySelector(".green-check");
  const pillAddBtn = pill.querySelector(".pill-add-btn");


  // --- OVERLAY WIDGET INTERFACE CARD ---
  const widget = document.createElement("div");
  widget.className = "g-widget";
  // Card layout
  widget.innerHTML = `
    <div class="widget-header">
      <div class="widget-logo-badge">G</div>
      <div class="widget-title">Review suggestions</div>
      <div class="widget-count-badge" style="display: none;">0</div>
      <div class="header-icons" style="display: flex; align-items: center; gap: 4px;">
        <button class="header-btn voice-btn" title="My voice settings" style="font-size: 12px; font-weight: bold; line-height: 1; padding: 2px 4px;">‖|ı</button>
        <button class="header-btn cog-btn" title="Open Settings">⚙️</button>
        <button class="header-btn close-btn" title="Close Widget">✕</button>
      </div>
    </div>
    <div class="widget-body-container">
      <!-- suggestions tab or generator tab inserted dynamically here -->
    </div>
  `;
  shadowRoot.appendChild(widget);

  const wgTitle = widget.querySelector(".widget-title");
  const wgCountBadge = widget.querySelector(".widget-count-badge");
  const wgCloseBtn = widget.querySelector(".close-btn");
  const wgCogBtn = widget.querySelector(".cog-btn");
  const wgVoiceBtn = widget.querySelector(".voice-btn");
  const wgBodyContainer = widget.querySelector(".widget-body-container");

  // Prevent widget clicks from losing caret focus
  shadowRoot.addEventListener("mousedown", (e) => {
    // Exclude input boxes from preventing default focus action
    const tag = e.target.tagName;
    if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
      e.preventDefault();
    }
  });

  // --- CONTROLLER LOGIC ENGINE ---

  // Check if target is a supported textarea or text input
  function isEditable(el) {
    if (!el) return false;
    const nodeName = el.tagName.toUpperCase();
    if (nodeName === "TEXTAREA") return true;
    if (nodeName === "INPUT") {
      const type = (el.type || "").toLowerCase();
      return ["text", "search", "email", "url", "tel"].includes(type);
    }
    const ce = el.getAttribute("contenteditable");
    if (ce !== null && ce !== "false") return true;
    if (el.isContentEditable) return true;
    const role = el.getAttribute("role");
    if (role === "textbox") return true;
    return false;
  }

  // Find the closest ancestor that is editable (essential for contenteditable sub-spans in WhatsApp Web)
  function getClosestEditable(el) {
    if (!el) return null;
    let current = el;
    while (current) {
      if (isEditable(current)) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  // Get active text selection safely from input/textarea or page contenteditables
  function getSelectedTextFromElement(el) {
    if (!el) return "";
    const nodeName = el.tagName.toUpperCase();
    if (nodeName === "INPUT" || nodeName === "TEXTAREA") {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      if (start !== undefined && end !== undefined && start !== end) {
        return el.value.substring(start, end).trim();
      }
    } else {
      const sel = window.getSelection();
      if (sel && sel.toString().trim().length > 0) {
        if (el.contains(sel.anchorNode)) {
          return sel.toString().trim();
        }
      }
    }
    return "";
  }

  // Selection change checker
  function handleTextSelection() {
    if (!config.enableOnSelection || isWidgetOpen || !activeElement) return;
    
    setTimeout(() => {
      const selText = getSelectedTextFromElement(activeElement);
      if (selText.length > 4) {
        selectedText = selText;
        isSelectionMode = true;
        
        const selLabel = pill.querySelector(".selection-pill-label");
        if (selLabel) {
          selLabel.textContent = `Rewrite selection (${selText.length}ch)`;
          selLabel.style.display = "block";
        }
        pillRedBadge.style.display = "none";
        pillGreenCheck.style.display = "none";
        
        positionCapsulePill();
      } else {
        if (isSelectionMode) {
          isSelectionMode = false;
          selectedText = "";
          
          const selLabel = pill.querySelector(".selection-pill-label");
          if (selLabel) {
            selLabel.style.display = "none";
          }
          updatePillCounter();
          positionCapsulePill();
        }
      }
    }, 20);
  }

  // Retrieve input content
  function getElementText(el) {
    if (!el) return "";
    return el.tagName.toUpperCase() === "INPUT" || el.tagName.toUpperCase() === "TEXTAREA" 
      ? el.value 
      : el.innerText;
  }

  // Helper to find a text node containing target text inside contenteditable
  function findTextNode(el, targetText) {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while (node = walk.nextNode()) {
      if (node.textContent.includes(targetText)) {
        return node;
      }
    }
    return null;
  }

  // Swap target characters with corrections
  function replaceText(original, replacement) {
    if (!lastActiveElement) return;
    
    // Maintain target focus
    lastActiveElement.focus();

    if (lastActiveElement.tagName.toUpperCase() === "INPUT" || lastActiveElement.tagName.toUpperCase() === "TEXTAREA") {
      const val = lastActiveElement.value;
      const index = val.indexOf(original);
      
      if (index !== -1) {
        lastActiveElement.value = val.substring(0, index) + replacement + val.substring(index + original.length);
        
        // Relocate cursor position
        const newCursorPos = index + replacement.length;
        lastActiveElement.selectionStart = newCursorPos;
        lastActiveElement.selectionEnd = newCursorPos;
        
        // Alert frameworks
        lastActiveElement.dispatchEvent(new Event("input", { bubbles: true }));
        lastActiveElement.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } else {
      // Contenteditable selection replacement using execCommand to trigger React/DraftJS listeners
      try {
        const textNode = findTextNode(lastActiveElement, original);
        if (textNode) {
          const offset = textNode.textContent.indexOf(original);
          const range = document.createRange();
          range.setStart(textNode, offset);
          range.setEnd(textNode, offset + original.length);
          
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          
          document.execCommand("insertText", false, replacement);
        } else {
          // Fallback to innerText swap if structure is unusual
          const val = lastActiveElement.innerText;
          const index = val.indexOf(original);
          if (index !== -1) {
            lastActiveElement.innerText = val.substring(0, index) + replacement + val.substring(index + original.length);
            lastActiveElement.dispatchEvent(new Event("input", { bubbles: true }));
            lastActiveElement.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
      } catch (err) {
        console.error("TextNode swap failed, fallback to direct swap: ", err);
        const val = lastActiveElement.innerText;
        const index = val.indexOf(original);
        if (index !== -1) {
          lastActiveElement.innerText = val.substring(0, index) + replacement + val.substring(index + original.length);
          lastActiveElement.dispatchEvent(new Event("input", { bubbles: true }));
          lastActiveElement.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    }
  }

  // Safe messaging wrapper to catch extension context invalidation
  function safeSendMessage(message, callback) {
    try {
      if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.id) {
        throw new Error("Extension context invalidated. Please reload the webpage.");
      }
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          if (callback) callback({ success: false, error: "Extension was reloaded. Please refresh the page." });
          return;
        }
        if (callback) callback(response);
      });
    } catch (err) {
      if (callback) callback({ success: false, error: "Extension was reloaded. Please refresh the page." });
    }
  }

  // Update capsule badges
  function updatePillCounter() {
    if (isSelectionMode) return; // Keep label visible during selection mode

    pillRedBadge.style.display = "none";
    pillGreenCheck.style.display = "none";
    pillLeftBtn.setAttribute("title", "Click to Quick Correct Grammar & Spelling, or highlight text to rewrite");
  }

  // Position Capsule Pill overlay fixed near the bottom right of inputs
  function positionCapsulePill() {
    if (!config.enableOnFocus || !activeElement || isWidgetOpen) {
      pill.classList.remove("visible");
      return;
    }

    const rect = activeElement.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 24) {
      pill.classList.remove("visible");
      return;
    }

    const buttonHeight = 32;
    const buttonWidth = pill.offsetWidth || 56;
    const margin = 6;

    const pillTop = rect.bottom - buttonHeight - margin;
    const pillLeft = rect.right - buttonWidth - margin;

    pill.style.top = `${pillTop}px`;
    pill.style.left = `${pillLeft}px`;
    pill.classList.add("visible");
  }

  // Position the Suggestions card overlay next to the capsule badge
  function positionWidget() {
    if (!activeElement) return;
    const rect = activeElement.getBoundingClientRect();
    const width = 330;
    
    // Default coordinates: aligned underneath text fields
    let top = rect.bottom + 8;
    let left = rect.right - width;

    // Boundary corrections bounds
    left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
    top = Math.max(12, Math.min(top, window.innerHeight - 480 - 12));

    widget.style.top = `${top}px`;
    widget.style.left = `${left}px`;
  }

  // Hide Capsule
  function hideCapsulePill() {
    pill.classList.remove("visible");
  }

  // --- WINDOW FOCUS/INPUT ACTIONS BINDERS ---

  document.addEventListener("focus", (e) => {
    const editable = getClosestEditable(e.target);
    if (editable) {
      activeElement = editable;
      lastActiveElement = editable;
      setTimeout(positionCapsulePill, 40);
    }
  }, true);

  // Click handler so clicking active contenteditable areas targets them immediately
  document.addEventListener("click", (e) => {
    const editable = getClosestEditable(e.target);
    if (editable) {
      activeElement = editable;
      lastActiveElement = editable;
      setTimeout(positionCapsulePill, 40);
    }
  }, true);

  document.addEventListener("blur", (e) => {
    setTimeout(() => {
      const editable = getClosestEditable(e.target);
      if (activeElement === editable && activeElement !== null && !isWidgetOpen) {
        activeElement = null;
        hideCapsulePill();
      }
    }, 180);
  }, true);

  document.addEventListener("input", (e) => {
    const editable = getClosestEditable(e.target);
    if (activeElement === editable && activeElement !== null) {
      positionCapsulePill();
    }
  });

  document.addEventListener("mouseup", (e) => {
    handleTextSelection();
  });

  document.addEventListener("keyup", (e) => {
    handleTextSelection();
  });

  window.addEventListener("scroll", () => {
    positionCapsulePill();
    if (isWidgetOpen) positionWidget();
  });

  window.addEventListener("resize", () => {
    positionCapsulePill();
    if (isWidgetOpen) positionWidget();
  });

  // --- ACTIONS - OPEN WIDGET VIEWS ---

  function openSuggestionsView() {
    isWidgetOpen = true;
    hideCapsulePill();
    wgTitle.textContent = "Review suggestions";
    
    positionWidget();
    widget.classList.add("visible");
    currentSuggestionIndex = 0;
    
    renderSuggestionsBody();
  }

  function openSelectionRefinedView() {
    isWidgetOpen = true;
    hideCapsulePill();
    wgTitle.textContent = "Refine selection";
    wgCountBadge.style.display = "none";
    
    positionWidget();
    widget.classList.add("visible");
    
    renderSelectionRefinedBody();
  }

  function openGeneratorView() {
    isWidgetOpen = true;
    hideCapsulePill();
    wgTitle.textContent = "AI writer draft";
    wgCountBadge.style.display = "none";

    positionWidget();
    widget.classList.add("visible");

    renderGeneratorBody();
  }

  function openQuickCorrectView(originalText, correctedText) {
    isWidgetOpen = true;
    hideCapsulePill();
    
    positionWidget();
    widget.classList.add("visible");
    
    renderQuickCorrectBody(originalText, correctedText);
  }

  function renderQuickCorrectBody(originalText, correctedText) {
    updateHeader("quickcorrect");

    wgBodyContainer.innerHTML = `
      <div class="generator-body" style="padding: 12px 14px;">
        <div class="form-group" style="margin-bottom: 12px;">
          <label style="font-size: 11.5px; font-weight: 600; color: var(--g-gray); margin-bottom: 4px;">Original Text</label>
          <div style="font-size: 12px; color: #64748b; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; max-height: 80px; overflow-y: auto; line-height: 1.4; white-space: pre-wrap; font-style: italic;">"${originalText}"</div>
        </div>

        <div class="form-group" style="margin-bottom: 12px;">
          <label style="font-size: 11.5px; font-weight: 600; color: var(--g-gray); margin-bottom: 4px;">Quick Correct Result</label>
          <textarea class="result-textarea" id="g-quickcheck-out" style="height: 110px; width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; font-size: 12.5px; resize: vertical; line-height: 1.4; outline: none;"></textarea>
        </div>

        <div class="result-actions" style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 15px;">
          <button class="btn-secondary" id="g-quickcheck-btn-deny" style="padding: 8px 16px; font-size: 12px; border-radius: 6px; cursor: pointer;">Deny</button>
          <button class="btn-insert" id="g-quickcheck-btn-accept" style="padding: 8px 16px; font-size: 12px; border-radius: 6px; cursor: pointer;">Accept</button>
        </div>
      </div>
    `;

    const denyBtn = wgBodyContainer.querySelector("#g-quickcheck-btn-deny");
    const acceptBtn = wgBodyContainer.querySelector("#g-quickcheck-btn-accept");
    const resultOut = wgBodyContainer.querySelector("#g-quickcheck-out");
    
    resultOut.value = correctedText;

    denyBtn.addEventListener("click", () => {
      closeWidget();
    });

    acceptBtn.addEventListener("click", () => {
      const finalText = resultOut.value;
      if (finalText && finalText !== originalText) {
        replaceText(originalText, finalText);
      }
      closeWidget();
    });
  }

  function closeWidget() {
    widget.classList.remove("visible");
    isWidgetOpen = false;
    generatedResultText = "";
    lastAuditedText = "";
    
    // Restore focus to input elements
    if (lastActiveElement) {
      activeElement = lastActiveElement;
      setTimeout(positionCapsulePill, 50);
    }
  }

  wgCloseBtn.addEventListener("click", () => {
    closeWidget();
  });

  wgCogBtn.addEventListener("click", () => {
    // Launch Chrome settings tab in background safely
    safeSendMessage({ action: "OPEN_SETTINGS" });
  });

  wgVoiceBtn.addEventListener("click", () => {
    if (isWidgetOpen) {
      renderMyVoiceBody();
    }
  });

  pillLeftBtn.addEventListener("click", () => {
    if (isSelectionMode) {
      openSelectionRefinedView();
    } else {
      runActiveBulbPreset();
    }
  });

  pillAddBtn.addEventListener("click", () => {
    openGeneratorView();
  });

  function runActiveBulbPreset() {
    if (!config.apiKey) {
      alert("Gemini API Key is missing! Opening settings page to set it up.");
      safeSendMessage({ action: "OPEN_SETTINGS" });
      return;
    }

    const targetElement = activeElement || lastActiveElement;
    if (!targetElement) return;

    const originalText = getElementText(targetElement).trim();
    if (!originalText) return;

    const sparkCircle = pillLeftBtn.querySelector(".teal-spark-circle");
    if (!sparkCircle) return;

    // Guard against multi-click while animation is active
    if (sparkCircle.style.animation.includes("spin")) return;

    const activeId = config.activeBulbPreset || "quickcorrect";
    const preset = BULB_PRESETS.find(p => p.id === activeId) || BULB_PRESETS[0];

    const originalHTML = sparkCircle.innerHTML;
    sparkCircle.innerHTML = "⏳";
    sparkCircle.style.animation = "spin 1s linear infinite";
    const oldTitle = pillLeftBtn.getAttribute("title");
    pillLeftBtn.setAttribute("title", `Running ${preset.title}...`);

    safeSendMessage({
      type: "IMPROVE_TEXT",
      text: originalText,
      instruction: preset.prompt,
      apiKey: config.apiKey,
      model: config.model
    }, (response) => {
      // Restore bulb icon state
      sparkCircle.innerHTML = originalHTML;
      sparkCircle.style.animation = "none";
      pillLeftBtn.setAttribute("title", oldTitle);

      if (response && response.success && response.data) {
        const correctedText = response.data.trim();
        openQuickCorrectView(originalText, correctedText);
      } else {
        const errorMsg = response && response.error ? response.error : `Failed to run ${preset.title}.`;
        alert(`Gemini Quick Correct Error:\n${errorMsg}`);
      }
    });
  }

  // --- RENDERING ROUTINES ---

  // 1.5 SELECTION REFINED VIEW
  function renderSelectionRefinedBody() {
    // 1. Check if API Key is configured
    if (!config.apiKey) {
      wgBodyContainer.innerHTML = `
        <div class="clean-result-wrapper">
          <div class="clean-icon">🔑</div>
          <div class="clean-title">API Key Required</div>
          <div class="clean-desc">To improve your grammar and spelling using Gemini AI, you must save an API Key first.</div>
          <button class="btn-insert" style="margin-top: 12px; width: auto;" id="btn-open-settings-req-ref">Configure Key</button>
        </div>
      `;
      wgBodyContainer.querySelector("#btn-open-settings-req-ref").addEventListener("click", () => {
        safeSendMessage({ action: "OPEN_SETTINGS" });
      });
      return;
    }

    // Build the dynamic presets list
    let presetsHTML = "";
    BULB_PRESETS.forEach(p => {
      presetsHTML += `
        <div class="preset-item" data-preset="${p.id}">
          <div style="display: flex; align-items: center; gap: 12px; width: 100%;">
            <div class="preset-icon" style="color: ${p.textColor}; font-size: 15px; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: #ffffff; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
              ${p.id === 'quickcorrect' ? p.iconHTML : p.icon}
            </div>
            <div class="preset-content">
              <span class="preset-title" style="font-weight: 600; font-size: 12px; color: #1e293b;">${p.title}</span>
              <span class="preset-desc" style="font-size: 10.5px; color: #64748b;">${p.desc}</span>
            </div>
          </div>
        </div>
      `;
    });

    wgBodyContainer.innerHTML = `
      <div class="generator-body" style="text-align: left; padding: 4px 6px;">
        <div class="form-group" style="margin-bottom: 12px;">
          <label style="font-size: 11.5px; font-weight: 600; color: var(--g-gray); margin-bottom: 4px;">Selected Text</label>
          <div style="font-size: 11.5px; color: var(--text-dark); background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; max-height: 80px; overflow-y: auto; font-style: italic; line-height: 1.4;">
            "${selectedText}"
          </div>
        </div>

        <h3 class="preset-header-main" style="margin: 0; font-size: 13px; font-weight: 700; color: #0f172a;">Rewrite Selection</h3>
        <p class="preset-header-sub" style="margin: 4px 0 12px 0; font-size: 11px; color: #64748b;">Choose a preset rewrite action</p>

        <div class="preset-list">
          ${presetsHTML}
        </div>

        <!-- Loader box -->
        <div class="ai-spinner-box" id="g-refine-loader" style="display: none; padding: 10px 0;">
          <div class="ai-spinner"></div>
          <span style="font-size: 11px; color: var(--g-gray);">Gemini is rewriting...</span>
        </div>

        <!-- Error block -->
        <div class="error-box" id="g-refine-error" style="display: none; margin-top: 10px;"></div>

        <!-- Result Preview box -->
        <div class="generator-result-wrapper" id="g-refine-result-card" style="display: none; margin-top: 10px;">
          <label style="font-size: 11px; font-weight: 600; color: var(--g-gray)">Improved Output</label>
          <textarea class="result-textarea" id="g-refine-result-out" style="height: 100px;"></textarea>
          <div class="result-actions">
            <button class="btn-secondary" id="g-refine-btn-cancel">Cancel</button>
            <button class="btn-insert" id="g-refine-btn-insert">Replace Selection</button>
          </div>
        </div>
      </div>
    `;

    const presetItems = wgBodyContainer.querySelectorAll(".preset-item");
    const loader = wgBodyContainer.querySelector("#g-refine-loader");
    const errorBox = wgBodyContainer.querySelector("#g-refine-error");
    const resultCard = wgBodyContainer.querySelector("#g-refine-result-card");
    const resultOut = wgBodyContainer.querySelector("#g-refine-result-out");
    const cancelBtn = wgBodyContainer.querySelector("#g-refine-btn-cancel");
    const insertBtn = wgBodyContainer.querySelector("#g-refine-btn-insert");

    presetItems.forEach(item => {
      item.addEventListener("click", () => {
        const type = item.getAttribute("data-preset");

        // Remove active class from all other items first
        presetItems.forEach(pi => pi.classList.remove("active"));

        // Add active style, append loader/results directly inside the clicked preset item!
        item.classList.add("active");
        item.appendChild(loader);
        item.appendChild(errorBox);
        item.appendChild(resultCard);

        const activePreset = BULB_PRESETS.find(p => p.id === type);
        if (!activePreset) return;

        triggerRefineTask(selectedText, activePreset.prompt);
      });
    });

    cancelBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      resultCard.style.display = "none";
      presetItems.forEach(pi => pi.classList.remove("active"));
    });

    insertBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const editedText = resultOut.value.trim();
      if (editedText && lastActiveElement) {
        lastActiveElement.focus();
        const nodeName = lastActiveElement.tagName.toUpperCase();
        if (nodeName === "INPUT" || nodeName === "TEXTAREA") {
          const val = lastActiveElement.value;
          const start = lastActiveElement.selectionStart;
          const end = lastActiveElement.selectionEnd;
          lastActiveElement.value = val.substring(0, start) + editedText + val.substring(end);
          
          lastActiveElement.selectionStart = start + editedText.length;
          lastActiveElement.selectionEnd = start + editedText.length;

          lastActiveElement.dispatchEvent(new Event("input", { bubbles: true }));
          lastActiveElement.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          try {
            document.execCommand("insertText", false, editedText);
          } catch (e) {
            console.error("Selection replace failed: ", e);
            lastActiveElement.innerText = editedText;
            lastActiveElement.dispatchEvent(new Event("input", { bubbles: true }));
            lastActiveElement.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
      }
      closeWidget();
    });

    function triggerRefineTask(sourceText, taskInstruction) {
      errorBox.style.display = "none";
      resultCard.style.display = "none";
      loader.style.display = "flex";

      setTimeout(() => {
        loader.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 50);

      const finalInstruction = taskInstruction + getVoiceStylePrompt();

      safeSendMessage({
        type: "IMPROVE_TEXT",
        text: sourceText,
        instruction: finalInstruction,
        apiKey: config.apiKey,
        model: config.model
      }, (response) => {
        loader.style.display = "none";
        if (response && response.success) {
          resultOut.value = response.data;
          resultCard.style.display = "flex";
          setTimeout(() => {
            resultCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
            resultOut.focus();
          }, 50);
        } else {
          errorBox.textContent = response && response.error ? response.error : "Failed connection.";
          errorBox.style.display = "block";
          setTimeout(() => {
            errorBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }, 50);
        }
      });
    }
  }

  // 1. SUGGESTIONS VIEWER VIEW (Replaced with Writing Guide)
  function renderSuggestionsBody() {
    wgCountBadge.style.display = "none";
    wgBodyContainer.innerHTML = `
      <div class="clean-result-wrapper" style="text-align: left; padding: 16px;">
        <div class="clean-icon" style="text-align: center; font-size: 28px; margin-bottom: 8px;">💡</div>
        <div class="clean-title" style="text-align: center; margin-bottom: 12px; font-size: 15px;">Gemini Writing Guide</div>
        <div style="font-size: 12.5px; color: var(--g-gray-dark); line-height: 1.5; display: flex; flex-direction: column; gap: 10px;">
          <div>
            <strong>✨ Rewrite Selections:</strong><br>
            Drag your cursor to highlight/select any part of your text, then click the <strong>💡 Rewrite</strong> capsule button to rewrite, shorten, or change its tone.
          </div>
          <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 6px 0;">
          <div>
            <strong>➕ AI Response Drafter:</strong><br>
            Click the <strong>+</strong> button on the floating capsule to draft messages or emails from scratch using custom agendas and topics.
          </div>
        </div>
        <button class="btn-insert btn-secondary" style="margin-top: 15px; width: 100%;" id="btn-close-guide">Understood</button>
      </div>
    `;
    wgBodyContainer.querySelector("#btn-close-guide").addEventListener("click", closeWidget);
  }

  // 2. AI DRAFT GENERATOR VIEW
  function renderGeneratorBody() {
    updateHeader("generator");
    const rawInputValue = lastActiveElement ? getElementText(lastActiveElement).trim() : "";

    const activeId = config.activeBulbPreset || "quickcorrect";
    let bulbSelectorHTML = `
      <div class="active-bulb-selector" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; margin-bottom: 12px;">
        <div style="font-size: 11.5px; font-weight: 700; color: #334155; margin-bottom: 6px; display: flex; align-items: center; gap: 4px;">
          <span>📌 Assign Action to Bulb Icon:</span>
        </div>
        <div style="display: flex; gap: 5px; flex-wrap: wrap;">
    `;
    
    BULB_PRESETS.forEach(p => {
      const isActive = (p.id === activeId);
      const bg = isActive ? "var(--g-teal)" : "#f1f5f9";
      const color = isActive ? "white" : "#475569";
      const border = isActive ? "none" : "1px solid #cbd5e1";
      bulbSelectorHTML += `
        <button class="preset-assign-btn" data-id="${p.id}" style="display: flex; align-items: center; gap: 4px; padding: 4px 8px; font-size: 11px; border-radius: 20px; background: ${bg}; color: ${color}; border: ${border}; cursor: pointer; transition: all 0.2s; font-weight: ${isActive ? 'bold' : 'normal'}">
          <span style="font-size: 11px; width: 12px; height: 12px; display: flex; align-items: center; justify-content: center;">${p.icon}</span>
          <span>${p.title}</span>
        </button>
      `;
    });
    
    bulbSelectorHTML += `
        </div>
      </div>
    `;

    // Build the dynamic presets list
    let presetsHTML = "";
    BULB_PRESETS.forEach(p => {
      presetsHTML += `
        <div class="preset-item" data-preset="${p.id}">
          <div style="display: flex; align-items: center; gap: 12px; width: 100%;">
            <div class="preset-icon" style="color: ${p.textColor}; font-size: 15px; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: #ffffff; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
              ${p.id === 'quickcorrect' ? p.iconHTML : p.icon}
            </div>
            <div class="preset-content">
              <span class="preset-title" style="font-weight: 600; font-size: 12px; color: #1e293b;">${p.title}</span>
              <span class="preset-desc" style="font-size: 10.5px; color: #64748b;">${p.desc}</span>
            </div>
          </div>
        </div>
      `;
    });

    presetsHTML += `
      <div class="preset-item" data-preset="more">
        <div style="display: flex; align-items: center; gap: 12px; width: 100%;">
          <div class="preset-icon" style="color: #f59e0b; font-size: 15px; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: #ffffff; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">⏳</div>
          <div class="preset-content">
            <span class="preset-title" style="font-weight: 600; font-size: 12px; color: #1e293b;">More templates...</span>
            <span class="preset-desc" style="font-size: 10.5px; color: #64748b;">Status checks, extensions, excused leave</span>
          </div>
        </div>
      </div>
    `;

    wgBodyContainer.innerHTML = `
      <div class="generator-body" style="text-align: left; padding: 4px 6px;">
        ${bulbSelectorHTML}

        <h3 class="preset-header-main" style="margin: 0; font-size: 15px; font-weight: 700; color: #0f172a;">What do you want to do?</h3>
        <p class="preset-header-sub" style="margin: 4px 0 12px 0; font-size: 11.5px; color: #64748b;">Here are some ideas</p>

        <div class="preset-list">
          ${presetsHTML}
        </div>

        <!-- Custom Templates Subform (hidden initially) -->
        <div id="sub-template-form" style="display: none; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; margin-bottom: 12px; background: #fafafa;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span id="sub-form-title" style="font-size: 11px; font-weight: 700; color: #475569;">Configure Template</span>
            <span id="btn-close-subform" style="cursor: pointer; font-size: 11px; color: #94a3b8;">✕</span>
          </div>
          <div class="form-group" style="margin-bottom: 8px;">
            <label style="font-size: 9.5px; font-weight: 600; color: #64748b;">Subject</label>
            <input type="text" id="g-topic" class="g-input" style="padding: 6px 8px; font-size: 11px;">
          </div>
          <div class="form-group" style="margin-bottom: 8px;">
            <label style="font-size: 9.5px; font-weight: 600; color: #64748b;">Key Details</label>
            <textarea id="g-agenda" class="g-textarea" style="min-height: 44px; padding: 6px 8px; font-size: 11px;"></textarea>
          </div>
          <input type="hidden" id="g-purpose" value="Structured Template">
          <button class="btn-generate" id="g-sub-btn-submit" style="padding: 8px 12px; font-size: 11px; font-weight: 600;">Draft Template</button>
        </div>

        <!-- Custom Instruction Bar -->
        <div class="writer-prompt-bar">
          <input type="text" class="prompt-bar-input" id="writer-custom-prompt" placeholder="Tell us to...">
          <button class="prompt-bar-submit-btn" id="writer-prompt-submit" title="Send instruction">➔</button>
        </div>

        <!-- Loader box -->
        <div class="ai-spinner-box" id="g-loader" style="display: none; padding: 10px 0;">
          <div class="ai-spinner"></div>
          <span style="font-size: 11px; color: var(--g-gray);">Gemini is drafting...</span>
        </div>

        <!-- Error block -->
        <div class="error-box" id="g-error" style="display: none; margin-top: 10px;"></div>

        <!-- Result Preview box -->
        <div class="generator-result-wrapper" id="g-result-card" style="display: none; margin-top: 10px;">
          <label style="font-size: 11px; font-weight: 600; color: var(--g-gray)">Draft Output</label>
          <textarea class="result-textarea" id="g-result-out" style="height: 120px;"></textarea>
          <div class="result-actions">
            <button class="btn-secondary" id="g-btn-cancel">Cancel</button>
            <button class="btn-insert" id="g-btn-insert">Insert Draft</button>
          </div>
        </div>
      </div>
    `;

    // Elements
    const presetItems = wgBodyContainer.querySelectorAll(".preset-item");
    const subForm = wgBodyContainer.querySelector("#sub-template-form");
    const subFormTitle = wgBodyContainer.querySelector("#sub-form-title");
    const fTopic = wgBodyContainer.querySelector("#g-topic");
    const fAgenda = wgBodyContainer.querySelector("#g-agenda");
    const fPurpose = wgBodyContainer.querySelector("#g-purpose");
    const subSubmit = wgBodyContainer.querySelector("#g-sub-btn-submit");
    const closeSub = wgBodyContainer.querySelector("#btn-close-subform");

    const customInput = wgBodyContainer.querySelector("#writer-custom-prompt");
    const customSubmit = wgBodyContainer.querySelector("#writer-prompt-submit");

    const loader = wgBodyContainer.querySelector("#g-loader");
    const errorBox = wgBodyContainer.querySelector("#g-error");
    const resultCard = wgBodyContainer.querySelector("#g-result-card");
    const resultOut = wgBodyContainer.querySelector("#g-result-out");
    const cancelBtn = wgBodyContainer.querySelector("#g-btn-cancel");
    const insertBtn = wgBodyContainer.querySelector("#g-btn-insert");

    // Assign Buttons Setup
    const assignBtns = wgBodyContainer.querySelectorAll(".preset-assign-btn");
    assignBtns.forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const selectedId = btn.getAttribute("data-id");
        chrome.storage.local.set({ activeBulbPreset: selectedId }, () => {
          config.activeBulbPreset = selectedId;
          updateBulbButtonIcon();
          renderGeneratorBody();
        });
      });
    });

    // Close subform
    closeSub.addEventListener("click", () => {
      subForm.style.display = "none";
    });

    // Preset Clicks
    presetItems.forEach(item => {
      item.addEventListener("click", () => {
        const type = item.getAttribute("data-preset");

        // Remove active class from all other items first
        presetItems.forEach(pi => pi.classList.remove("active"));

        if (type === "more") {
          subForm.style.display = "block";
          subFormTitle.textContent = "More Writing Templates";
          fTopic.value = "Project Deadline Extension Request";
          fAgenda.value = "Need 2 more days because database API indexing issues slowed down our testing.";
          fPurpose.value = "Email Message";

          // Re-append loader/results to bottom of generator body
          const genBody = wgBodyContainer.querySelector(".generator-body");
          genBody.appendChild(loader);
          genBody.appendChild(errorBox);
          genBody.appendChild(resultCard);

          setTimeout(() => { wgBodyContainer.scrollTop = wgBodyContainer.scrollHeight; }, 50);
          return;
        }

        // Add active style, append loader/results directly inside the clicked preset item!
        item.classList.add("active");
        item.appendChild(loader);
        item.appendChild(errorBox);
        item.appendChild(resultCard);

        const activePreset = BULB_PRESETS.find(p => p.id === type) || BULB_PRESETS[0];
        triggerRewriteTask(rawInputValue, activePreset.prompt);
      });
    });

    // Click Custom Prompt bar
    customSubmit.addEventListener("click", executeCustomPrompt);
    customInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        executeCustomPrompt();
      }
    });

    function executeCustomPrompt() {
      const val = customInput.value.trim();
      if (!val) return;
      triggerRewriteTask(rawInputValue, val);
    }

    subSubmit.addEventListener("click", () => {
      const topicVal = fTopic.value.trim();
      const agendaVal = fAgenda.value.trim();
      if (!topicVal || !agendaVal) {
        errorBox.textContent = "Please fill out topic and key details.";
        errorBox.style.display = "block";
        return;
      }
      
      triggerTemplateTask(topicVal, agendaVal, fPurpose.value);
    });

    // Main Rewrite Task runner helper
    function triggerRewriteTask(sourceText, taskInstruction) {
      if (!sourceText) {
        errorBox.textContent = "No text found inside active editor to rewrite.";
        errorBox.style.display = "block";
        return;
      }
      if (!config.apiKey) {
        errorBox.textContent = "API key missing. Save one in popup settings first.";
        errorBox.style.display = "block";
        return;
      }

      errorBox.style.display = "none";
      resultCard.style.display = "none";
      subForm.style.display = "none";
      loader.style.display = "flex";
      
      setTimeout(() => {
        loader.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 50);

      const finalInstruction = taskInstruction + getVoiceStylePrompt();

      safeSendMessage({
        type: "IMPROVE_TEXT",
        text: sourceText,
        instruction: finalInstruction,
        apiKey: config.apiKey,
        model: config.model
      }, (response) => {
        loader.style.display = "none";
        if (response && response.success) {
          resultOut.value = response.data;
          resultCard.style.display = "flex";
          setTimeout(() => {
            resultCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
            resultOut.focus();
          }, 50);
        } else {
          errorBox.textContent = response && response.error ? response.error : "Failed connection.";
          errorBox.style.display = "block";
          setTimeout(() => {
            errorBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }, 50);
        }
      });
    }

    // Main Template Draft generator runner helper
    function triggerTemplateTask(topic, agenda, purpose) {
      if (!config.apiKey) {
        errorBox.textContent = "API key missing. Save one in settings first.";
        errorBox.style.display = "block";
        return;
      }

      errorBox.style.display = "none";
      resultCard.style.display = "none";
      subForm.style.display = "none";
      loader.style.display = "flex";
      
      setTimeout(() => {
        loader.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 50);

      const finalTopic = topic + getVoiceStylePrompt();

      safeSendMessage({
        type: "GENERATE_TEXT",
        topic: finalTopic,
        agenda: agenda,
        purpose: purpose,
        apiKey: config.apiKey,
        model: config.model
      }, (response) => {
        loader.style.display = "none";
        if (response && response.success) {
          resultOut.value = response.data;
          resultCard.style.display = "flex";
          setTimeout(() => {
            resultCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
            resultOut.focus();
          }, 50);
        } else {
          errorBox.textContent = response && response.error ? response.error : "Failed generating templates.";
          errorBox.style.display = "block";
          setTimeout(() => {
            errorBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }, 50);
        }
      });
    }

    cancelBtn.addEventListener("click", () => {
      closeWidget();
    });

    insertBtn.addEventListener("click", () => {
      const editedDraftText = resultOut.value.trim();
      if (editedDraftText && lastActiveElement) {
        lastActiveElement.focus();
        if (lastActiveElement.tagName.toUpperCase() === "INPUT" || lastActiveElement.tagName.toUpperCase() === "TEXTAREA") {
          lastActiveElement.value = editedDraftText;
          lastActiveElement.dispatchEvent(new Event("input", { bubbles: true }));
          lastActiveElement.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          try {
            const range = document.createRange();
            range.selectNodeContents(lastActiveElement);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            document.execCommand("insertText", false, editedDraftText);
          } catch (err) {
            lastActiveElement.innerText = editedDraftText;
            lastActiveElement.dispatchEvent(new Event("input", { bubbles: true }));
            lastActiveElement.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
      }
      closeWidget();
    });
  }

  // --- VOICE & HEADERS CONTROLLER HELPERS ---
  
  function getVoiceStylePrompt() {
    if (!config.myVoice) return "";
    const { formality, tones } = config.myVoice;
    const toneStr = tones && tones.length > 0 ? tones.join(", ") : "Neutral";
    return `\n\nWriting style instructions:
- Formality level: ${formality}
- Tone attributes: ${toneStr}
Apply these voice settings seamlessly to the output. Do NOT include metadata or introduction.`;
  }

  function updateHeader(view) {
    if (view === "voice") {
      wgTitle.innerHTML = `<span id="wg-back-arrow" style="cursor: pointer; margin-right: 8px; font-weight: bold; font-size: 13px;">←</span> My voice`;
      wgCountBadge.style.display = "none";
      wgVoiceBtn.style.display = "none";
      wgCogBtn.style.display = "none";
      
      const backBtn = widget.querySelector("#wg-back-arrow");
      if (backBtn) {
        backBtn.addEventListener("click", () => {
          openGeneratorView();
        });
      }
    } else {
      if (view === "suggestions") {
        wgTitle.textContent = "Review suggestions";
        wgCountBadge.style.display = "flex";
      } else if (view === "quickcorrect") {
        wgTitle.textContent = "Quick Correct";
        wgCountBadge.style.display = "none";
      } else {
        wgTitle.textContent = "AI writer draft";
        wgCountBadge.style.display = "none";
      }
      
      wgVoiceBtn.style.display = "inline-flex";
      wgCogBtn.style.display = "inline-flex";
    }
  }

  function renderMyVoiceBody() {
    updateHeader("voice");
    
    const voice = config.myVoice || {
      formality: "Neutral",
      tones: ["Confident"]
    };
    
    wgBodyContainer.innerHTML = `
      <div class="voice-container">
        <div>
          <div class="voice-title" style="font-size: 11.5px; font-weight: 600; color: #64748b;">Formality</div>
          <div class="voice-row-pills" style="margin-top: 6px;" id="v-formality-group">
            <div class="voice-pill ${voice.formality === "Casual" ? "selected" : ""}" data-val="Casual">👕 Casual</div>
            <div class="voice-pill ${voice.formality === "Neutral" ? "selected" : ""}" data-val="Neutral">😐 Neutral</div>
            <div class="voice-pill ${voice.formality === "Formal" ? "selected" : ""}" data-val="Formal">👔 Formal</div>
          </div>
        </div>

        <div>
          <div class="voice-title" style="font-size: 11.5px; font-weight: 600; color: #64748b;">Tone</div>
          <div class="voice-subtitle" style="font-size: 10px; color: #94a3b8; margin-top: 2px;">Select up to 3</div>
          <div class="voice-row-pills" style="margin-top: 6px;" id="v-tones-group">
            <div class="voice-pill ${voice.tones.includes("Personable") ? "selected" : ""}" data-val="Personable">😇 Personable</div>
            <div class="voice-pill ${voice.tones.includes("Confident") ? "selected" : ""}" data-val="Confident">🤝 Confident</div>
            <div class="voice-pill ${voice.tones.includes("Empathetic") ? "selected" : ""}" data-val="Empathetic">😇 Empathetic</div>
            <div class="voice-pill ${voice.tones.includes("Engaging") ? "selected" : ""}" data-val="Engaging">🤩 Engaging</div>
            <div class="voice-pill ${voice.tones.includes("Witty") ? "selected" : ""}" data-val="Witty">😜 Witty</div>
            <div class="voice-pill ${voice.tones.includes("Direct") ? "selected" : ""}" data-val="Direct">🎯 Direct</div>
          </div>
        </div>

        <div style="font-size: 10.5px; font-style: italic; color: #94a3b8; margin-top: 4px;">
          These voice settings will apply to any text you generate.
        </div>

        <div class="voice-bottom-actions">
          <button class="btn-voice-close" id="btn-v-close">Close</button>
          <button class="btn-voice-save" id="btn-v-save">Use this voice</button>
        </div>
      </div>
    `;

    const formalityGroup = wgBodyContainer.querySelector("#v-formality-group");
    const tonesGroup = wgBodyContainer.querySelector("#v-tones-group");
    
    let selectedFormality = voice.formality;
    let selectedTones = [...voice.tones];

    // Formality toggle
    formalityGroup.addEventListener("click", (e) => {
      const pillEl = e.target.closest(".voice-pill");
      if (pillEl) {
        formalityGroup.querySelectorAll(".voice-pill").forEach(p => p.classList.remove("selected"));
        pillEl.classList.add("selected");
        selectedFormality = pillEl.getAttribute("data-val");
      }
    });

    // Tones toggle (max 3 selection)
    tonesGroup.addEventListener("click", (e) => {
      const pillEl = e.target.closest(".voice-pill");
      if (pillEl) {
        const val = pillEl.getAttribute("data-val");
        if (selectedTones.includes(val)) {
          selectedTones = selectedTones.filter(t => t !== val);
          pillEl.classList.remove("selected");
        } else {
          if (selectedTones.length >= 3) {
            const oldest = selectedTones.shift();
            const oldestPill = tonesGroup.querySelector(`.voice-pill[data-val="${oldest}"]`);
            if (oldestPill) oldestPill.classList.remove("selected");
          }
          selectedTones.push(val);
          pillEl.classList.add("selected");
        }
      }
    });

    wgBodyContainer.querySelector("#btn-v-close").addEventListener("click", () => {
      openGeneratorView();
    });

    wgBodyContainer.querySelector("#btn-v-save").addEventListener("click", () => {
      const updatedVoice = {
        formality: selectedFormality,
        tones: selectedTones
      };
      
      config.myVoice = updatedVoice;
      chrome.storage.local.set({ myVoice: updatedVoice }, () => {
        openGeneratorView();
      });
    });
  }

})();
