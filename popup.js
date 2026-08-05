// Popup controller for Gemini Text Improver Settings

document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const apiKeyInput = document.getElementById("api-key-input");
  const toggleKeyVisibilityBtn = document.getElementById("toggle-key-visibility");
  const saveKeyBtn = document.getElementById("save-key-btn");
  const keyStatusMsg = document.getElementById("key-status-msg");
  
  const modelSelect = document.getElementById("model-select");
  const toggleBubbleFocus = document.getElementById("toggle-bubble-focus");
  const toggleSelectionBubble = document.getElementById("toggle-selection-bubble");
  
  const testInput = document.getElementById("test-text-input");
  const runTestBtn = document.getElementById("run-test-btn");
  const testResultBox = document.getElementById("test-result-box");
  const testResultOutput = document.getElementById("test-result-output");

  // State
  let savedApiKey = "";

  // 1. Load initial settings
  chrome.storage.local.get(
    {
      geminiApiKey: "",
      geminiModel: "gemini-3.6-flash",
      enableOnFocus: true,
      enableOnSelection: true
    },
    (items) => {
      savedApiKey = items.geminiApiKey;
      if (savedApiKey) {
        apiKeyInput.value = savedApiKey;
        keyStatusMsg.textContent = "Gemini key is configured. Ready to rewrite!";
        keyStatusMsg.className = "status-msg success";
      } else {
        keyStatusMsg.textContent = "No key configured. Add one to enable the extension.";
        keyStatusMsg.className = "status-msg error";
      }
      
      modelSelect.value = items.geminiModel;
      toggleBubbleFocus.checked = items.enableOnFocus;
      toggleSelectionBubble.checked = items.enableOnSelection;
    }
  );

  // 2. Clear status msg on key typing
  apiKeyInput.addEventListener("input", () => {
    keyStatusMsg.textContent = "";
    keyStatusMsg.className = "status-msg";
  });

  // 3. Toggle password visibility
  toggleKeyVisibilityBtn.addEventListener("click", () => {
    if (apiKeyInput.type === "password") {
      apiKeyInput.type = "text";
      toggleKeyVisibilityBtn.textContent = "🙈";
      toggleKeyVisibilityBtn.title = "Hide Key";
    } else {
      apiKeyInput.type = "password";
      toggleKeyVisibilityBtn.textContent = "👁️";
      toggleKeyVisibilityBtn.title = "View Key";
    }
  });

  // 4. Save API Key
  saveKeyBtn.addEventListener("click", () => {
    const freshKey = apiKeyInput.value.trim();
    
    keyStatusMsg.textContent = "Saving...";
    keyStatusMsg.className = "status-msg loading";
    
    chrome.storage.local.set({ geminiApiKey: freshKey }, () => {
      savedApiKey = freshKey;
      if (freshKey) {
        keyStatusMsg.textContent = "API Key saved successfully!";
        keyStatusMsg.className = "status-msg success";
      } else {
        keyStatusMsg.textContent = "API Key removed.";
        keyStatusMsg.className = "status-msg error";
      }
      // Remove success notice after 3 seconds
      setTimeout(() => {
        if (savedApiKey) {
          keyStatusMsg.textContent = "Gemini key is configured. Ready to rewrite!";
          keyStatusMsg.className = "status-msg success";
        }
      }, 3000);
    });
  });

  // 5. Auto-save Toggles & Dropdown changes
  modelSelect.addEventListener("change", () => {
    chrome.storage.local.set({ geminiModel: modelSelect.value });
  });

  toggleBubbleFocus.addEventListener("change", () => {
    chrome.storage.local.set({ enableOnFocus: toggleBubbleFocus.checked });
  });

  toggleSelectionBubble.addEventListener("change", () => {
    chrome.storage.local.set({ enableOnSelection: toggleSelectionBubble.checked });
  });

  // 6. Test Live Gemini API Connection
  runTestBtn.addEventListener("click", () => {
    const keyToUse = savedApiKey || apiKeyInput.value.trim();
    if (!keyToUse) {
      alert("Please enter and save a Gemini API Key first.");
      return;
    }

    const textToTest = testInput.value.trim() || "i is happy";
    
    // Set UI to loading state
    runTestBtn.disabled = true;
    runTestBtn.textContent = "Testing...";
    testResultBox.classList.remove("hidden");
    testResultOutput.textContent = "Please wait, contacting Gemini API...";
    testResultOutput.style.color = "var(--text-muted)";

    // Send payload to background script
    chrome.runtime.sendMessage(
      {
        type: "IMPROVE_TEXT",
        text: textToTest,
        instruction: "Fix spelling and grammar mistakes, returning only the corrected sentence.",
        apiKey: keyToUse,
        model: modelSelect.value
      },
      (response) => {
        runTestBtn.disabled = false;
        runTestBtn.textContent = "Test AI";
        
        if (chrome.runtime.lastError) {
          testResultOutput.textContent = `Extension script link failed: ${chrome.runtime.lastError.message}`;
          testResultOutput.style.color = "var(--text-error)";
          return;
        }

        if (response && response.success) {
          testResultOutput.textContent = response.data;
          testResultOutput.style.color = "#10b981"; // Success Green
        } else {
          const errMessage = response ? response.error : "Unknown connection error occurred.";
          testResultOutput.textContent = `Connection Failed!\n${errMessage}`;
          testResultOutput.style.color = "var(--text-error)";
        }
      }
    );
  });
});
