# Quick Guide: Understanding Your Gemini API Limits 🚀

When using the **Gemini Text Improver** extension, the AI relies on a **Google AI Studio API Key** to check your spelling and generate text. To keep this service completely free, Google applies certain usage rules and speed limits to your free-tier key.

This guide explains how these limits work in simple, everyday language.

---

## 1. Speed Limits (Requests Per Minute)
Think of a **"Request"** as a single message sent to the AI. Every time the extension finishes checking a sentence or you click "Improve it," a request is sent to Google.

* **The limit:** **15 Requests per Minute** (for the default *Gemini 3.6 Flash* model).
* **What it means:** You can perform up to 15 edits or spelling audits every 60 seconds.
* **If you type very fast:** If you pause and trigger updates more than 15 times within one minute, Google will temporarily pause your key to protect their servers.

---

## 2. Daily Limits (Requests Per Day)
This is the total allowance of messages you are allowed to send to the AI in a single day.

* **The limit:** **1,500 Requests per Day**.
* **What it means:** You can use the extension for checkups and rewrites up to 1,500 times each day. For normal writing, emailing, and chatting, this is more than enough and very difficult to run out of.

---

## 3. What are "Tokens" and "Token Limits"?
The AI does not read text word-by-word. Instead, it breaks sentences down into small pieces called **Tokens**.
* A single word is typically **1 to 2 tokens**.
* The sentence *"Hello, how can I help you?"* is about **6 to 8 tokens**.
* **The limit:** **1,000,000 Tokens per Minute**.
* **What it means:** Because this limit is so massive, you will **never** hit the token limit using this extension. The speed limit (15 requests per minute) will always be the only limit you notice.

---

## 4. Reset Times: When Can You Re-Use the API?
If you see the **"Rate limit reached"** warning, don't worry! Your API key is not blocked or banned. It is just on a brief pause:

| Limit Type | Reset Time (How long to wait) | What to do |
| :--- | :--- | :--- |
| **Minute Limit** (15 requests/min) | **60 Seconds** (1 minute) | Wait 60 seconds and click **"Retry Audit"**. It will work instantly. |
| **Daily Limit** (1,500 requests/day) | **Midnight** (Pacific Time / PST) | Wait until the next day, or create/use a second free API key. |

---

## 5. Tips to Avoid Interruptions 💡
* **Type normally:** Since the extension waits 2 seconds after you pause typing to run a check, typing continuously rather than pausing after every single word prevents unnecessary requests.
* **Keep your text clean:** If you don't need active grammar checking on a page, you can temporarily click the extension icon and toggle "Active spelling checks" off.
* **Need more speed?** If you are a heavy writer write large articles and often hit limits, you can enable Billing on Google AI Studio. The pay-as-you-go tier is extremely cheap (typically costing just a few cents for thousands of sentences) and removes all speed limits.
