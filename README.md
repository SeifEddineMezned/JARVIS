<div align="center">

# J.A.R.V.I.S. · Iron Man Mode

### Talk to your PC. It talks back, sees your screen, moves your mouse, and builds things for you.

<img src="assets/hud-ironman.png" alt="J.A.R.V.I.S. holographic HUD" width="100%">

![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D6?logo=windows&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)
![Free AI](https://img.shields.io/badge/AI-100%25%20free%20tiers-00e5ff)
![Offline](https://img.shields.io/badge/Ollama-offline%20%26%20unlimited-black?logo=ollama)
![License](https://img.shields.io/badge/license-Apache%202.0-green)

**[Quick start](#-quick-start-2-minutes)** · **[Free AI keys](#-free-ai-keys)** · **[What to say](#%EF%B8%8F-things-to-say)** · **[How it works](#-how-it-works)** · **[Troubleshooting](#%EF%B8%8F-troubleshooting)**

</div>

---

## ✨ What it does

| | |
|---|---|
| 🎙️ **Voice in, voice out** | Say *"Jarvis, …"*. It answers in a British AI voice, in English, French or Arabic. |
| 🖱️ **Controls your PC** | Opens apps, types, clicks buttons it *sees*, scrolls, uses shortcuts, and controls media and windows. |
| 👁️ **Sees your screen** | *"What's on my screen?"* · *"Click the blue Sign-in button"*: a targeting reticle locks on, then it clicks. |
| 📷 **Sees *you*** | *"What am I holding?"*: the webcam feed appears in the HUD, targeting boxes lock onto objects, and Jarvis answers with a joke. |
| 😏 **Has a personality** | Witty British butler, helpful first and funny second. Edit `personality.md` and it changes on your next sentence. |
| 🏗️ **Builds apps live** | *"Build a snake game"*: you watch the code stream in the HUD, then it opens in VS Code and the browser. |
| 🎤 **Presents like a human** | *"Present it"*: it scrolls slide by slide, points with the mouse, clicks the buttons, and narrates. |
| 🎨 **Reshapes itself** | *"Go Iron Man mode"* / *"turn green"*: the whole interface and the desktop effects recolor live. |
| 🧠 **Never runs out** | Chains every free AI you give it (Gemini, Groq, OpenRouter, Mistral, GitHub, Ollama) and switches automatically. |

<div align="center">
<img src="assets/themes.gif" alt="Live theme switching" width="80%">
<br><sub><i>"Jarvis, go Hulk mode." Every color in the HUD is live.</i></sub>
</div>

---

## 🚀 Quick start (2 minutes)

> **You need:** Windows 10/11 · [Python 3.10+](https://www.python.org/downloads/) (tick **"Add python.exe to PATH"**) · Microsoft Edge or Chrome · a microphone

**1. Download.** Click the green **Code** button, choose **Download ZIP**, and extract it. Or:
```bash
git clone https://github.com/<your-username>/<this-repo>.git
```

**2. Double-click `start.bat`.** The first time, it installs everything (about 1 minute) and opens your settings file in Notepad.

**3. Paste one free key** (see the next section), save, close Notepad, and **double-click `start.bat` again**.

**4.** The HUD opens. Click **INITIALIZE**, click **Allow** for the microphone, and say:

> ### *"Jarvis, show me what you can do."*

---

## 🔑 Free AI keys

Paste **at least one** into `.env`. **Add more to get more free requests:** Jarvis chains all of them and switches the moment one is busy or out of quota (watch the **NEURAL CORES** panel).

| Provider | Free tier\* | Card? | Get a key (≈1 min) |
|---|---|:-:|---|
| ⭐ **Google Gemini** | ~20 requests/day **per model** (Jarvis rotates 6 models). Best screen vision. | No | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| ⭐ **Groq** | ~1,000+ requests/day, extremely fast | No | [console.groq.com/keys](https://console.groq.com/keys) |
| **OpenRouter** | 50 requests/day on free models | No | [openrouter.ai/keys](https://openrouter.ai/keys) |
| **Mistral** | free "Experiment" plan | No (phone) | [console.mistral.ai/api-keys](https://console.mistral.ai/api-keys) |
| **GitHub Models** | ~50–150 requests/day with any GitHub account | No | [github.com/settings/personal-access-tokens](https://github.com/settings/personal-access-tokens) (permission `models:read`) |
| 🏠 **Ollama** (local) | **Unlimited · offline · private** | — | [ollama.com](https://ollama.com), then `ollama pull qwen3:8b` and set `OLLAMA_MODEL=qwen3:8b` |

<sub>\*Free tiers change often. Check each provider's page. One voice command uses about 2–4 requests.</sub>

**Recommended:** `GEMINI_API_KEY` + `GROQ_API_KEY`, both free with no card.

```ini
# .env  (git-ignored: never commit it!)
GEMINI_API_KEY=AIza...
GROQ_API_KEY=gsk_...
OLLAMA_MODEL=qwen3:8b     # optional: unlimited local fallback
```

---

## 🗣️ Things to say

Start with **"Jarvis, …"**, or hold **SPACE** and just talk.

| Try this | What happens |
|---|---|
| *"How's my computer doing?"* | Live CPU / RAM / disk / top processes |
| *"What's the weather in Tunis?"* | Live weather |
| *"Show me what you can do."* | Takes over the mouse and draws an arc reactor in the air |
| *"Go Iron Man mode."* · *"Turn green."* · *"Minimal mode."* | The whole HUD transforms live |
| *"Open Paint and draw a star."* | Opens Paint, maximizes it, draws |
| *"Play Back in Black on YouTube."* · *"Pause it."* · *"Volume down."* | Media control |
| *"Build a landing page for a coffee shop called Stark Brew."* | Code streams in the HUD, then opens in VS Code + browser |
| *"Build a 5-slide presentation about AI agents."* then *"Present it."* | Scrolls, points, clicks and narrates each slide |
| *"Make it dark mode with a pricing section."* | Edits what it built |
| *"Write a Python script for the first 20 Fibonacci numbers and run it."* | Writes the file and runs it in PowerShell |
| *"What's on my screen?"* · *"Click the search box."* | Screen vision + targeted click |
| *"What am I holding?"* · *"How many fingers am I holding up?"* · *"Read what's on this paper."* | Webcam vision with targeting boxes |
| *"Tell me about yourself."* · *"I'm so tired."* | Personality: expect sarcasm, served politely |

**Controls:** `SPACE` hold to talk · `ESC` stop talking / stop the presentation · **slam the mouse into a screen corner** = emergency stop.
Showcase mode (themes cycle automatically): open `http://localhost:8765/#autoboot-demo-cycle`.

---

## 🧩 How it works

```mermaid
flowchart LR
    A[🎙️ You speak] -->|Web Speech API| B[HUD<br/>browser]
    B -->|WebSocket| C[server.py]
    C --> D{{brain.py<br/>agent loop}}
    D <-->|failover chain| E[(Gemini · Groq · OpenRouter<br/>Mistral · GitHub · Ollama)]
    D -->|function calls| F[tools.py<br/>mouse · keyboard · apps<br/>files · vision · builder]
    F --> G[🖥️ Your PC]
    F --> H[overlay.py<br/>reticle · scan · frame]
    F <-->|bridge.js| I[📄 Pages Jarvis built]
    C -->|edge-tts neural voice| B
```

| File | What it does |
|---|---|
| `brain.py` | The agent loop: the AI decides which tools to call, chains steps, never repeats itself, fails over between providers |
| `providers.py` | One interface for Gemini + any OpenAI-compatible API. Adding a provider takes about 5 lines. |
| `tools.py` | Every capability is a plain Python function + a JSON schema |
| `overlay.py` | Transparent, click-through window that draws effects over your real desktop |
| `server.py` | FastAPI + WebSockets, neural voice, telemetry, page bridge |
| `static/` | The HUD (canvas arc reactor, voice, live theming) and `bridge.js` for presenting pages |

### Add your own power in 30 seconds

```python
# tools.py
def tell_joke(ctx, topic: str = "robots") -> dict:
    return {"joke": f"Why did the {topic} cross the road? To get to the other API."}

TOOLS["tell_joke"] = (tell_joke, "Tell a joke about a topic.", {"topic": {"type": "string"}}, [])
```
Restart, then say *"Jarvis, tell me a joke about Python."* The AI discovers the new tool by itself.

---

## 🛠️ Troubleshooting

| Problem | Fix |
|---|---|
| `Python 3.10 or newer is required` | Install Python from python.org with **"Add python.exe to PATH"** ticked |
| Windows says "Windows protected your PC" | **More info → Run anyway** (it's a plain `.bat` file, so you can read it first) |
| Jarvis doesn't hear me | Use **Edge or Chrome**, click **Allow** for the mic, check the **MIC** chip. Hold **SPACE** to talk without the wake word. |
| The grey text says `heard: "…"` | The mic works, but you didn't start with "Jarvis". Say it first, or hold SPACE. |
| "This HUD is on standby" | Another Jarvis window is open. Only one listens at a time. Click to take control. |
| "Out of free quota" | Add another free key to `.env` (Groq is the most generous) or set `OLLAMA_MODEL` |
| Jarvis clicks the wrong spot | Make sure the target is visible on your **main** monitor. Gemini gives the most accurate vision. |
| Something goes wrong mid-action | **Slam the mouse into a screen corner** (fail-safe), or press **ESC** |
| "Camera unavailable" | Click **Allow** for the camera in the HUD (asked the first time), and close other apps using the webcam (Zoom, Teams…) |

**Safety:** Jarvis only runs while `start.bat` is open, refuses obviously destructive commands, and asks before closing unsaved work. Your keys stay in your local `.env`.

**Privacy:** the webcam turns on **only** when you ask Jarvis to look at you. A single snapshot is sent to your AI provider (nothing is recorded), and the camera switches off after 20 seconds. Screenshots for screen vision work the same way.

---

<div align="center">

Built on **[OpenJarvis](https://github.com/open-jarvis/OpenJarvis)** · Voice by **edge-tts** · Licensed **Apache 2.0**

<sub>Fan-made educational project. Not affiliated with Marvel or Disney.</sub>

</div>
