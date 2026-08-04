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

  // Load storage config
  function loadConfig() {
    chrome.storage.local.get({
      geminiApiKey: "",
      geminiModel: "gemini-3.6-flash",
      enableOnFocus: true,
      enableOnSelection: true,
      auditMode: "auto",
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
      config.myVoice = items.myVoice;
      
      updatePillCounter();
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
    
    updatePillCounter();
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
    <div class="pill-group-left" title="Click to review spelling and grammar">
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

  // Debounced live spell/grammar auditing trigger (immediate = true when sentence finishes or on focus)
  function handleInputAudit(text, immediate = false, force = false) {
    if (isWidgetOpen) return; // Freeze API checks while user is reviewing active widgets
    const trimmedText = text ? text.trim() : "";
    if (trimmedText.length < 3) {
      activeSuggestions = [];
      apiError = "";
      lastAuditedText = "";
      updatePillCounter();
      return;
    }

    // Block automatic audits if user has configured Manual Mode (bypass only on force)
    if (config.auditMode === "manual" && !force) {
      updatePillCounter();
      return;
    }

    // 1. Skip if text is exactly the same as the last audit (prevents click/focus duplicate triggers)
    if (trimmedText === lastAuditedText && !force) {
      return;
    }

    // 2. Fetch from local cache if matches (saves a lot of quota tokens)
    if (auditCache.has(trimmedText) && !force) {
      apiError = "";
      lastAuditedText = trimmedText;
      activeSuggestions = [...auditCache.get(trimmedText)];
      updatePillCounter();
      return;
    }

    if (!config.apiKey) {
      activeSuggestions = [];
      apiError = "";
      updatePillCounter();
      return;
    }

    clearTimeout(checkDebounceTimer);
    
    // Only run audit if user finishes a sentence (immediate) or manually requests it (force)
    if (!immediate && !force) {
      return;
    }

    const delay = 350; // Brief delay to ensure typing input is fully finished and bound
    checkDebounceTimer = setTimeout(() => {
      // Guard against value updates while debouncing
      if (activeElement && getElementText(activeElement).trim() !== trimmedText) return;
      isAuditLoading = true;
      updatePillCounter();

      safeSendMessage({
        type: "CHECK_GRAMMAR",
        text: trimmedText,
        apiKey: config.apiKey,
        model: config.model
      }, (response) => {
        isAuditLoading = false;
        if (response && response.success) {
          apiError = "";
          lastAuditedText = trimmedText;
          if (Array.isArray(response.data)) {
            activeSuggestions = response.data.filter(s => s.original && s.replacement);
            auditCache.set(trimmedText, [...activeSuggestions]);
            // Cap memory cache size to 100 entries
            if (auditCache.size > 100) {
              const firstKey = auditCache.keys().next().value;
              auditCache.delete(firstKey);
            }
            updatePillCounter();

            if (isWidgetOpen && wgTitle.textContent === "Review suggestions") {
              renderSuggestionsBody();
            }
          }
        } else {
          activeSuggestions = [];
          let rawErr = response && response.error ? response.error : "Failed connection to Gemini API.";
          // User friendly rate limit warning
          if (rawErr.includes("quota") || rawErr.includes("limit") || rawErr.includes("429")) {
            rawErr = "Rate limit reached. Please wait a moment before retrying. Google's Free Tier has structured limits per minute.";
          }
          apiError = rawErr;
          updatePillCounter();

          if (isWidgetOpen && wgTitle.textContent === "Review suggestions") {
            renderSuggestionsBody();
          }
        }
      });
    }, delay);
  }

  // Update capsule badges
  function updatePillCounter() {
    if (isSelectionMode) return; // Freeze badge state during selection Mode
    
    // Resolve audit text state
    const text = lastActiveElement ? getElementText(lastActiveElement).trim() : "";
    const hasScanned = (text === lastAuditedText);

    // 1. Missing API Key state
    if (!config.apiKey) {
      pillRedBadge.style.display = "none";
      pillGreenCheck.textContent = "⚙️"; 
      pillGreenCheck.style.display = "flex";
      pillGreenCheck.style.color = "var(--g-gray)";
      pillLeftBtn.setAttribute("title", "API key missing. Click to open settings.");
      return;
    }

    // 2. API Error state
    if (apiError) {
      pillRedBadge.style.display = "none";
      pillGreenCheck.textContent = "⚠️"; 
      pillGreenCheck.style.color = "var(--g-red)";
      pillGreenCheck.style.display = "flex";
      pillLeftBtn.setAttribute("title", `API Error: ${apiError}. Click for details.`);
      return;
    }

    // 2b. Audit Loading spinner state
    if (isAuditLoading) {
      pillRedBadge.style.display = "none";
      pillGreenCheck.textContent = "⏳";
      pillGreenCheck.style.display = "flex";
      pillGreenCheck.style.color = "var(--g-teal)";
      pillGreenCheck.style.animation = "spin 1s linear infinite";
      pillLeftBtn.setAttribute("title", "AI is scanning your text...");
      return;
    }

    // 3. Manual Mode & Unscanned state
    if (config.auditMode === "manual" && !hasScanned && text.length >= 3) {
      pillRedBadge.style.display = "none";
      pillGreenCheck.textContent = "🔍"; 
      pillGreenCheck.style.display = "flex";
      pillGreenCheck.style.color = "var(--g-gray)";
      pillGreenCheck.style.animation = "none";
      pillLeftBtn.setAttribute("title", "Click to check spelling and grammar");
      return;
    }

    // Restore default color
    if (pillGreenCheck) {
      pillGreenCheck.style.color = "var(--g-teal)";
      pillGreenCheck.style.animation = "none";
    }

    // 3. Normal corrections counts
    const len = activeSuggestions.length;
    if (len > 0) {
      pillRedBadge.textContent = len;
      pillRedBadge.style.display = "flex";
      pillGreenCheck.style.display = "none";
      pillLeftBtn.setAttribute("title", "Click to review spelling and grammar");
    } else {
      pillRedBadge.style.display = "none";
      pillGreenCheck.textContent = "✓";
      pillGreenCheck.style.display = "flex";
      pillLeftBtn.setAttribute("title", "All clean!");
    }
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
      if (editable !== lastActiveElement) {
        lastAuditedText = "";
      }
      activeElement = editable;
      lastActiveElement = editable;
      
      // Instantly run audit check (immediate = true)
      handleInputAudit(getElementText(activeElement), true);
      // Give DOM time to reflow so sizes are correct
      setTimeout(positionCapsulePill, 40);
    }
  }, true);

  // Click handler so clicking active contenteditable areas targets them immediately
  document.addEventListener("click", (e) => {
    const editable = getClosestEditable(e.target);
    if (editable) {
      if (editable !== lastActiveElement) {
        lastAuditedText = "";
      }
      activeElement = editable;
      lastActiveElement = editable;
      handleInputAudit(getElementText(activeElement), true);
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
      const text = getElementText(activeElement);
      positionCapsulePill();

      // Check if last character typed is punctuation indicating a sentence end
      const lastChar = text.slice(-1);
      const isSentenceEnd = [".", "?", "!", "\n"].includes(lastChar) || 
                            (text.length > 1 && [".", "?", "!"].includes(text.slice(-2, -1)) && lastChar === " ");
      
      handleInputAudit(text, isSentenceEnd);
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

  function closeWidget() {
    widget.classList.remove("visible");
    isWidgetOpen = false;
    generatedResultText = "";
    lastAuditedText = "";
    
    // Restore focus to input elements, and re-run spell audits
    if (lastActiveElement) {
      activeElement = lastActiveElement;
      // Re-trigger layout audit with immediate check
      handleInputAudit(getElementText(lastActiveElement), true);
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
    if (isAuditLoading) return; // Prevent double trigger while active check is running

    if (isSelectionMode) {
      openSelectionRefinedView();
    } else {
      // If we are in manual mode and haven't audited this text yet:
      const text = lastActiveElement ? getElementText(lastActiveElement).trim() : "";
      const hasScanned = (text === lastAuditedText);
      if (config.auditMode === "manual" && !hasScanned && text.length >= 3) {
        handleInputAudit(text, true, true);
        return; // Return immediately. The badge itself will spin, keeping the workspace clean.
      }
      openSuggestionsView();
    }
  });

  pillAddBtn.addEventListener("click", () => {
    openGeneratorView();
  });

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

    wgBodyContainer.innerHTML = `
      <div class="generator-body">
        <div class="form-group">
          <label>Selected Text</label>
          <div style="font-size: 11.5px; color: var(--text-dark); background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; max-height: 80px; overflow-y: auto; font-style: italic; line-height: 1.4;">
            "${selectedText}"
          </div>
        </div>

        <div class="form-group">
          <label>Choose Rewrite Action</label>
          <select id="g-refine-tone" class="g-select">
            <option value="polish">✨ Polish (Fix Grammar & Flow)</option>
            <option value="professional">💼 Professional Tone</option>
            <option value="casual">👋 Casual Tone</option>
            <option value="genz">💀 Gen Z Tone (no cap, fr fr)</option>
            <option value="concise">📝 Make Concise</option>
            <option value="simplify">📋 Simplify & Format Problem (for sharing)</option>
          </select>
        </div>

        <button class="btn-generate" id="g-refine-submit">
          <span>⚡</span>
          <span>Apply Rewrite</span>
        </button>

        <!-- Loader -->
        <div class="ai-spinner-box" id="g-refine-loader" style="display: none;">
          <div class="ai-spinner"></div>
          <span style="font-size: 11px; color: var(--g-gray);">Gemini is rewriting...</span>
        </div>

        <!-- Error box -->
        <div class="error-box" id="g-refine-error" style="display: none;"></div>

        <!-- Result Preview box -->
        <div class="generator-result-wrapper" id="g-refine-result-card" style="display: none;">
          <label style="font-size: 11px; font-weight: 600; color: var(--g-gray)">Improved Output</label>
          <textarea class="result-textarea" id="g-refine-result-out" style="height: 100px;"></textarea>
          <div class="result-actions">
            <button class="btn-secondary" id="g-refine-btn-cancel">Cancel</button>
            <button class="btn-insert" id="g-refine-btn-insert">Replace Selection</button>
          </div>
        </div>
      </div>
    `;

    const toneSelect = wgBodyContainer.querySelector("#g-refine-tone");
    const submitBtn = wgBodyContainer.querySelector("#g-refine-submit");
    const loader = wgBodyContainer.querySelector("#g-refine-loader");
    const errorBox = wgBodyContainer.querySelector("#g-refine-error");
    const resultCard = wgBodyContainer.querySelector("#g-refine-result-card");
    const resultOut = wgBodyContainer.querySelector("#g-refine-result-out");
    const cancelBtn = wgBodyContainer.querySelector("#g-refine-btn-cancel");
    const insertBtn = wgBodyContainer.querySelector("#g-refine-btn-insert");

    submitBtn.addEventListener("click", () => {
      const toneVal = toneSelect.value;
      let toneInstruction = "";
      if (toneVal === "polish") {
        toneInstruction = "Polish this text to make it grammatically correct and flow naturally. Ensure the output message is clear but maintains original meaning.";
      } else if (toneVal === "professional") {
        toneInstruction = "Convert this text into a professional, polite, and formal business tone.";
      } else if (toneVal === "casual") {
        toneInstruction = "Convert this text into a friendly, warm, casual, and conversational tone.";
      } else if (toneVal === "genz") {
        toneInstruction = "Convert this text into a Gen Z tone using popular slang like 'fr fr', 'no cap', 'bet', 'slay', 'lowkey', 'skibidi', etc., while keeping the original meaning.";
      } else if (toneVal === "concise") {
        toneInstruction = "Condense this text to make it clean, brief, concise, and punchy.";
      } else if (toneVal === "simplify") {
        toneInstruction = "Format this text into a clean, understandable, and well-structured statement. Use bullet points and appropriate spacing, but keep the statement exactly as it is without truncating or making it minimal.";
      }

      errorBox.style.display = "none";
      resultCard.style.display = "none";
      loader.style.display = "flex";
      submitBtn.disabled = true;

      safeSendMessage({
        type: "IMPROVE_TEXT",
        text: selectedText,
        instruction: toneInstruction,
        apiKey: config.apiKey,
        model: config.model
      }, (response) => {
        loader.style.display = "none";
        submitBtn.disabled = false;

        if (response && response.success) {
          resultOut.value = response.data;
          resultCard.style.display = "flex";
          setTimeout(() => { wgBodyContainer.scrollTop = wgBodyContainer.scrollHeight; }, 50);
        } else {
          const errMsg = response && response.error ? response.error : "Failed polishing selection.";
          errorBox.textContent = errMsg;
          errorBox.style.display = "block";
        }
      });
    });

    cancelBtn.addEventListener("click", () => {
      closeWidget();
    });

    insertBtn.addEventListener("click", () => {
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
  }

  // 1. SUGGESTIONS VIEWER VIEW
  function renderSuggestionsBody() {
    // 1. Check if API Key is configured
    if (!config.apiKey) {
      wgCountBadge.style.display = "none";
      wgBodyContainer.innerHTML = `
        <div class="clean-result-wrapper">
          <div class="clean-icon">🔑</div>
          <div class="clean-title">API Key Required</div>
          <div class="clean-desc">To improve your grammar and spelling using Gemini AI, you must save an API Key first.</div>
          <button class="btn-insert" style="margin-top: 12px; width: auto;" id="btn-open-settings-req">Configure Key</button>
        </div>
      `;
      wgBodyContainer.querySelector("#btn-open-settings-req").addEventListener("click", () => {
        safeSendMessage({ action: "OPEN_SETTINGS" });
      });
      return;
    }

    // 2. Check if there was an API connection error
    if (apiError) {
      wgCountBadge.style.display = "none";
      wgBodyContainer.innerHTML = `
        <div class="clean-result-wrapper">
          <div class="clean-icon">⚠️</div>
          <div class="clean-title">Gemini API Error</div>
          <div class="clean-desc" style="color: var(--g-red); font-size: 11.5px; line-height: 1.4;">${apiError}</div>
          <button class="btn-insert btn-secondary" style="margin-top: 12px; width: auto;" id="btn-retry-audit">Retry Audit</button>
        </div>
      `;
      wgBodyContainer.querySelector("#btn-retry-audit").addEventListener("click", () => {
        if (lastActiveElement) {
          apiError = "";
          handleInputAudit(getElementText(lastActiveElement), true, true);
        }
        closeWidget();
      });
      return;
    }

    wgCountBadge.style.display = "flex";
    wgCountBadge.textContent = activeSuggestions.length;

    if (activeSuggestions.length === 0) {
      wgCountBadge.style.display = "none";
      wgBodyContainer.innerHTML = `
        <div class="clean-result-wrapper">
          <div class="clean-icon">✨</div>
          <div class="clean-title">All clean!</div>
          <div class="clean-desc">No spelling or grammar errors found in this text.</div>
          <button class="btn-insert btn-secondary" style="margin-top: 10px; width: auto;" id="btn-close-clean">Done</button>
        </div>
      `;
      wgBodyContainer.querySelector("#btn-close-clean").addEventListener("click", closeWidget);
      return;
    }

    if (currentSuggestionIndex >= activeSuggestions.length) {
      currentSuggestionIndex = activeSuggestions.length - 1;
    }
    if (currentSuggestionIndex < 0) {
      currentSuggestionIndex = 0;
    }

    const currentItem = activeSuggestions[currentSuggestionIndex];
    const category = currentItem.category || "Correctness";
    const description = currentItem.description || "Correction suggestion";
    const oldText = currentItem.original;
    const newText = currentItem.replacement;

    // Snippet formatting matching live Grammarly layout: "hello Hello, how can you..."
    const fullText = getElementText(lastActiveElement);
    const wordIndex = fullText.indexOf(oldText);
    let previewHTML = "";
    
    if (wordIndex !== -1) {
      const restText = fullText.substring(wordIndex + oldText.length, wordIndex + oldText.length + 20);
      const suffix = restText.length === 20 ? restText + "..." : restText;
      previewHTML = `<span class="diff-removed">${oldText}</span><span class="diff-added">${newText}</span>${suffix}`;
    } else {
      // Fallback
      previewHTML = `<span class="diff-removed">${oldText}</span> ➜ <span class="diff-added">${newText}</span>`;
    }

    const isPrevDisabled = currentSuggestionIndex === 0 ? "disabled" : "";
    const isNextDisabled = currentSuggestionIndex === activeSuggestions.length - 1 ? "disabled" : "";

    wgBodyContainer.innerHTML = `
      <div class="suggestions-body">
        <div class="suggestion-category-row ${category.toLowerCase() === "style" ? "cat-clarity" : "cat-correctness"}">
          <span style="font-size: 13px;">🔴</span>
          <span>${category} · ${description}</span>
        </div>
        
        <div class="suggestion-text-preview">
          ${previewHTML}
        </div>

        <div class="suggestion-actions">
          <div class="action-group">
            <button class="btn-accept" id="btn-accept-sug">Accept</button>
            <button class="btn-dismiss" id="btn-dismiss-sug">Dismiss</button>
          </div>

          <div class="paging-section">
            <button class="paging-arrow btn-prev-arrow" ${isPrevDisabled}>◀</button>
            <span>${currentSuggestionIndex + 1} of ${activeSuggestions.length}</span>
            <button class="paging-arrow btn-next-arrow" ${isNextDisabled}>▶</button>
          </div>
        </div>
      </div>
    `;

    // Bind Button Event Actions
    const acceptBtn = wgBodyContainer.querySelector("#btn-accept-sug");
    const dismissBtn = wgBodyContainer.querySelector("#btn-dismiss-sug");
    const prevArrow = wgBodyContainer.querySelector(".btn-prev-arrow");
    const nextArrow = wgBodyContainer.querySelector(".btn-next-arrow");

    acceptBtn.addEventListener("click", () => {
      replaceText(oldText, newText);
      // Remove corrected suggestion
      activeSuggestions.splice(currentSuggestionIndex, 1);
      // Reposition and reload
      renderSuggestionsBody();
    });

    dismissBtn.addEventListener("click", () => {
      activeSuggestions.splice(currentSuggestionIndex, 1);
      renderSuggestionsBody();
    });

    prevArrow.addEventListener("click", () => {
      if (currentSuggestionIndex > 0) {
        currentSuggestionIndex--;
        renderSuggestionsBody();
      }
    });

    nextArrow.addEventListener("click", () => {
      if (currentSuggestionIndex < activeSuggestions.length - 1) {
        currentSuggestionIndex++;
        renderSuggestionsBody();
      }
    });
  }

  // 2. AI DRAFT GENERATOR VIEW
  function renderGeneratorBody() {
    updateHeader("generator");
    const rawInputValue = lastActiveElement ? getElementText(lastActiveElement).trim() : "";

    wgBodyContainer.innerHTML = `
      <div class="generator-body" style="text-align: left; padding: 4px 6px;">
        <h3 class="preset-header-main" style="margin: 0; font-size: 15px; font-weight: 700; color: #0f172a;">What do you want to do?</h3>
        <p class="preset-header-sub" style="margin: 4px 0 12px 0; font-size: 11.5px; color: #64748b;">Here are some ideas</p>

        <div class="preset-list">
          <div class="preset-item" data-preset="improve">
            <div class="preset-icon" style="color: #0ea5e9;">🪄</div>
            <div class="preset-content">
              <span class="preset-title">Improve it</span>
              <span class="preset-desc">Quickly polish grammar & spelling</span>
            </div>
          </div>
          
          <div class="preset-item" data-preset="simplify">
            <div class="preset-icon" style="color: #10b981;">📋</div>
            <div class="preset-content">
              <span class="preset-title">Simplify & Format</span>
              <span class="preset-desc">Understandable, clean problem statements</span>
            </div>
          </div>
          
          <div class="preset-item" data-preset="objections">
            <div class="preset-icon" style="color: #8b5cf6;">💡</div>
            <div class="preset-content">
              <span class="preset-title">Suggest counterarguments</span>
              <span class="preset-desc">Find weak areas or objections</span>
            </div>
          </div>

          <div class="preset-item" data-preset="more">
            <div class="preset-icon" style="color: #f59e0b;">⏳</div>
            <div class="preset-content">
              <span class="preset-title">More templates...</span>
              <span class="preset-desc">Status checks, extensions, excused leave</span>
            </div>
          </div>
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
        <div class="ai-spinner-box" id="g-loader" style="display: none;">
          <div class="ai-spinner"></div>
          <span style="font-size: 11px; color: var(--g-gray);">Gemini is drafting...</span>
        </div>

        <!-- Error block -->
        <div class="error-box" id="g-error" style="display: none;"></div>

        <!-- Result Preview box -->
        <div class="generator-result-wrapper" id="g-result-card" style="display: none;">
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

    // Close subform
    closeSub.addEventListener("click", () => {
      subForm.style.display = "none";
    });

    // Preset Clicks
    presetItems.forEach(item => {
      item.addEventListener("click", () => {
        const type = item.getAttribute("data-preset");
        
        if (type === "improve") {
          subForm.style.display = "none";
          triggerRewriteTask(rawInputValue, "Improve grammar, spelling, flow and polish this text. Maintain the original message.");
        } else if (type === "simplify") {
          subForm.style.display = "none";
          triggerRewriteTask(rawInputValue, "Format this text into a clean, understandable, and well-structured statement. Use bullet points and appropriate spacing, but keep the statement exactly as it is without truncating or making it minimal.");
        } else if (type === "objections") {
          subForm.style.display = "none";
          triggerRewriteTask(rawInputValue, "Analyze this statement and politely suggest 2-3 counterarguments, potential weak areas, or objections, structured clearly.");
        } else if (type === "more") {
          // Open more template subform configuration
          subForm.style.display = "block";
          subFormTitle.textContent = "More Writing Templates";
          fTopic.value = "Project Deadline Extension Request";
          fAgenda.value = "Need 2 more days because database API indexing issues slowed down our testing.";
          fPurpose.value = "Email Message";
          setTimeout(() => { wgBodyContainer.scrollTop = wgBodyContainer.scrollHeight; }, 50);
        }
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
          setTimeout(() => { wgBodyContainer.scrollTop = wgBodyContainer.scrollHeight; }, 50);
        } else {
          errorBox.textContent = response && response.error ? response.error : "Failed connection.";
          errorBox.style.display = "block";
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
          setTimeout(() => { wgBodyContainer.scrollTop = wgBodyContainer.scrollHeight; }, 50);
        } else {
          errorBox.textContent = response && response.error ? response.error : "Failed generating templates.";
          errorBox.style.display = "block";
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
