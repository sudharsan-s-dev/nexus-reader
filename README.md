# 📚 NEXUS READER

![Version](https://img.shields.io/badge/version-1.0-blue.svg)
![Python](https://img.shields.io/badge/python-3.9+-yellow.svg)
![Flask](https://img.shields.io/badge/framework-Flask-lightgrey.svg)
![Database](https://img.shields.io/badge/database-SQLite-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Status](https://img.shields.io/badge/status-Active-success.svg)

An **AI Smart Document Reader** designed to enhance the reading and studying experience by providing intelligent, context-aware tools directly on top of your documents. 
The system features a highly interactive **split-screen workspace** where users can view documents on one side and interact with AI tools, translations, study guides, and personal notes on the other.

It ensures:
* Frictionless reading and comprehension
* Instant translations and definitions
* AI-driven explanations and podcast generation
* Seamless note-taking

---

## 🎯 PROJECT OBJECTIVE

The goal of Nexus Reader is to **redefine how students and professionals interact with digital documents**.

Traditional PDF readers are static, requiring users to constantly switch between browser tabs for dictionary lookups, translations, Wikipedia summaries, or AI prompts. This leads to:
* Loss of focus
* Fragmented reading experience
* Inefficient study sessions

**Nexus Reader** solves this by integrating a smart popup toolbar that contextually processes highlighted text and returns intelligent insights natively within the document view.

---

## 🏗 SYSTEM ARCHITECTURE

```text
User Web Browser (Vanilla JS + HTML5)
        │
        │ Highlight Text / Upload PDF
        ▼
Flask Web Server (Backend API)
        │
        │ Process Request & API Routing
        ▼
External Services & AI (Gemini, Wikipedia, Edge-TTS)
        │
        │ Data Processing & Generation
        ▼
Database (SQLite)
        │
        ▼
Knowledge Panel / Audio Playback
```

---

## 🌟 CORE FEATURES

### 📖 SMART READING WORKSPACE

| Feature                    | Description                                                               |
| -------------------------- | ------------------------------------------------------------------------- |
| 🌗 **Dark / Light Theme**  | Beautifully designed modes utilizing CSS variables for seamless toggling. |
| 🪟 **Split-Screen Layout** | Adjust document vs. notes width using a draggable resizer.                |
| 📄 **PDF Engine**          | Integrates Mozilla's PDF.js to render documents natively on HTML5 Canvas. |
| 📝 **Rich-Text Notes**     | Dedicated notes panel allowing basic formatting and anchor links.         |

---

### 🧠 AI & CONTEXTUAL TOOLS

| Feature                    | Description                                                               |
| -------------------------- | ------------------------------------------------------------------------- |
| ✨ **Smart Selection**     | Highlighting text triggers a floating toolbar with smart actions.         |
| 🌍 **Translate**           | Translates text into various languages instantly.                         |
| 📚 **Dictionary & Wiki**   | Fetches live definitions and Wikipedia summaries for keywords.            |
| 🤖 **AI Explanations**     | Uses Google Gemini to simplify and explain complex text.                  |
| 🎧 **Text-to-Speech**      | Uses native Web Speech API and Edge-TTS to read text aloud smoothly.      |
| 🎙 **Podcast Generation**  | Converts document text into an engaging 2-speaker podcast.                |
| 🎓 **Study Materials**     | Automatically generates flashcards, MCQs, and summaries.                  |

---

## 🛠 TECHNOLOGY STACK

### Backend
* Python
* Flask Framework
* Google GenAI SDK
* Edge-TTS

### Frontend
* HTML5
* CSS3 (Vanilla + Custom Variables)
* JavaScript (Vanilla ES6+)
* PDF.js

### Database
* SQLite (Local Storage for Notes and Files)

### APIs & Integrations
* Google Gemini API (AI generation)
* Free Dictionary API
* Wikipedia REST API
* Deep-Translator

---

## 🚀 QUICK START GUIDE

### 1️⃣ Prerequisites

Install the following:
* Python **3.9+**
* Pip Package Manager
* Git

---

### 2️⃣ Installation

```bash
# Clone repository
git clone https://github.com/sudharsan-s-dev/nexus-reader.git

# Enter project directory
cd nexus-reader

# Create virtual environment (Backend)
cd backend
python -m venv .venv

# Activate environment
# Windows:
.venv\Scripts\activate
# Mac/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

---

### 3️⃣ Environment Setup

Set your Gemini API Key as an environment variable or create a `.env` file in the `backend/` directory:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

---

### 4️⃣ Run the Application

You will need to run the backend and frontend simultaneously.

**Terminal 1 (Backend):**
```bash
cd backend
python app.py
# Runs on http://127.0.0.1:5000
```

**Terminal 2 (Frontend):**
```bash
cd frontend
python -m http.server 8000
# Runs on http://localhost:8000
```

Open your browser and navigate to: `http://localhost:8000`

---

## 📊 FUTURE ENHANCEMENTS

Possible improvements for future versions:
* ☁ **Cloud Syncing** for user profiles and notes.
* 📱 **Progressive Web App (PWA)** capabilities.
* 🤖 **RAG (Retrieval-Augmented Generation)** for querying entire documents.
* 🌍 **Multi-language UI** support.

---

## 🤝 CONTRIBUTING

Contributions are welcome.

Steps:
1. Fork the repository
2. Create a new branch
3. Commit your changes
4. Push the branch
5. Submit a Pull Request

---

## 📄 LICENSE

This project is licensed under the **MIT License**.

See the `LICENSE` file for details.

---

## 👨‍💻 DEVELOPER

**Sudharsan S**  
Full Stack Developer
