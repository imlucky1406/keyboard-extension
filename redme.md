# Gemini Text Improver Chrome Extension 🚀

An elegant, selection-focused Chrome writing assistant powered by Google's Gemini models. It hooks directly into your browser's text inputs (like WhatsApp Web, Slack, Gmail, or any text editor) to rewrite selected text segments using built-in preset prompts and generate full drafts from key points—all while consuming 0 background API requests.

---

## ✨ Features

### 1. **Focus Capsule Pill** 💊
- **Zero Background Fetching**: No sentence checks, no background auto-requests. 100% of API calls are initiated directly by you.
- **Clean Two-Button Design**: Contains the **💡 Bulb button** and the **`+`** (Draft generator) button.
- **Customizable Quick Bulb Action**: Assign any preset prompt (e.g., Quick Correct, Improve text, Simplify & Format, Counterarguments) with their unique icons (`💡`, `🪄`, `📋`, `⚖️`) directly to the capsule Bulb button from the top of the `+` presets page. The button's avatar icon updates dynamically to match.
- **Fallback Selection Trigger**: If text is selected, clicking the bulb allows you to instantly rewrite the highlighted portion.

### 2. **Refine Selections with Built-In Presets** 💡
- Drag your cursor to highlight any part of your text.
- The bulb button expands to display **"Rewrite selection"**.
- Clicking it opens the Refinement panel, housing the **unified 8 writing presets** (Quick Correct, Polish/Improve, Professional, Casual, Gen Z, Concise, Simplify/Format, Counterarguments) with inline outputs and smooth scroll focus.

### 3. **Draft Builder (AI Writer View)** ➕
- Click the **`+`** badge to open the Draft Generator.
- **Unified 8 Presets List**: Select from the exact same 8 presets directly within this view, ensuring complete symmetry between selection-highlighting and draft-generation methods.
- **Inline Draft Previews**: Preset outputs are presented directly within the expanded prompt cards inside the generator list.
- **Smooth Scroll-into-View**: The viewport automatically scrolls dynamically to focus attention on the loader and draft result area.
- Select from templates or draft emails from scratch containing custom topic details and agendas.

### 4. **Self-Healing API Parser** 🛠️
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
├── popup.js            # Settings JS logic (saves API key and model preferences)
├── popup.css           # Styling for settings interface
└── redme.md            # This document
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
   - Click **Save Settings**!
7. **Refresh** any tab containing a text input field (e.g. WhatsApp, Slack, etc.) and write away! 

---

## 🔒 Privacy

* **Local Storage**: Your API Key and preferences are stored exclusively on your local machine using Chrome's secure storage API.
