# Gemini Text Improver Chrome Extension 🚀

An elegant, high-performance, and distraction-free Chrome writing assistant powered by Google's Gemini models. It hooks directly into your browser's text inputs (like WhatsApp Web, Slack, Gmail, or any text editor) to audit spelling, fix grammar, rewrite selections, and generate drafts from prompts—all while utilizing smart rate-limiting strategies to optimize Gemini API usage.

---

## ✨ Features

### 1. **Inline Floating Capsule Pill** 💊
- **Non-Intrusive Design**: Automatically attaches to the bottom-right corner of your active input box.
- **Visual Feedback**:
  - **`🔍` Magnifying Glass**: Prompting you to manually scan your text (runs 0 API requests while writing).
  - **`⏳` Spinning Hourglass**: Runs a dynamic in-badge spin animation when an active AI check is in progress.
  - **Red Counter Badge**: Instantly displays the number of errors discovered (e.g. `2`, `3`).
  - **`✓` Green Checkmark**: Satisfies you that your text is 100% clean.

### 2. **Double Action Check Modes** ⚙️
- **Automatic Mode**: Triggers only when you complete sentences (using `.`, `?`, `!`, or Enter `\n`). Avoids mid-sentence API spamming.
- **Manual Mode (Click-to-Scan)**: Complete silent mode. The extension remains passive until you click the capsule badge. It then runs a background scan of your text, keeping the interface empty of annoying popups until errors are found.

### 3. **Interactive Suggestions Widget** 📝
- Click on the error count badge to open the Suggestion Board.
- Displays cards for **Correctness**, **Spelling**, **Punctuation**, and **Style** corrections with explanations.
- Single-click to apply a suggestion directly into your textarea, or dismiss cards you want to ignore.

### 4. **Rewrite Selection & AI Writer** ✍️
- **Rewrite Selection**: Highlight text to rewrite it in custom tones.
- **AI Writer (`+` button)**: Draft structured, high-quality messages or emails based on a target topic, agenda, and purpose in seconds.

### 5. **Self-Healing API Parser** 🛠️
- Includes an internal **JSON Repair Utility**. If Gemini outputs a response that gets truncated due to rate limits or transit cuts, the parser automatically identifies open strings, arrays, or braces, and closes them (`}]}`) to ensure successful suggestion parsing.

---

## 🛠️ Supported Gemini Models

* **Gemini 3 Flash Generation**: Optimized for efficiency and speed.
  * `gemini-3.6-flash` (Default)
  * `gemini-3.5-flash`
  * `gemini-3.5-flash-lite`
* **High Reasoning (Advanced Pro)**: Deep reasoning capabilities.
  * `gemini-3.1-pro-preview`
* **Older Generation Models**: Stable, legacy options.
  * `gemini-2.5-flash`
  * `gemini-2.5-pro`

---

## 📂 Project Structure

```bash
├── manifest.json       # Extension manifest (v3 config)
├── background.js       # Background script (handles Gemini API fetches and JSON repair)
├── content.js          # Injected script (attaches capsule badge to text boxes, handles UI actions)
├── popup.html          # Settings UI page
├── popup.js            # Settings JS logic (saves mode, apiKey, and model preferences)
├── popup.css           # Styling for settings interface
└── README.md           # This document
```

---

## 🚀 Installation & Setup

1. **Clone or Download** this repository to a folder on your computer.
2. Open **Google Chrome** and navigate to `chrome://extensions`.
3. In the top-right corner, toggle **Developer mode** to ON.
4. Click **Load unpacked** in the top-left corner.
5. Select the `Keyboard_extension` folder containing the files.
6. Access the **Gemini Text Improver** popup settings from your Google Chrome header extension bar:
   - Enter your **Gemini API Key** (Get one from [Google AI Studio](https://aistudio.google.com/)).
   - Choose your preferred **Gemini Model**.
   - Set **Spell Check Mode** to `Manual` or `Automatic`.
   - Click **Save Settings**!
7. **Refresh** any tab containing a text input field (e.g. WhatsApp, Slack, etc.) and write away! 

---

## 🔒 Privacy & API Optimization

* **Local Storage**: Your API Key and preferences are stored exclusively on your local machine using Chrome's secure storage API.
* **Token Care**: Employs an internal 100-entry `auditCache` to prevent re-submitting requests for texts that you previously checked, conserving your API limits.
