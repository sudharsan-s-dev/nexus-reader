/**
 * Selection Popup Component
 * Handles showing the tooltip when text is selected in the document viewer
 */

const popup = document.getElementById('selection-popup');
const docPanel = document.getElementById('doc-panel');
let currentSelection = '';

// Listen for selection changes in the document panel
document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    
    // Quick check if there is a selection
    if (!selection.isCollapsed && selection.toString().trim().length > 0) {
        // Debounce slightly to wait for the user to finish selecting
        clearTimeout(window.selectionTimeout);
        window.selectionTimeout = setTimeout(() => {
            handleSelection(selection);
        }, 300);
    } else {
        hidePopup();
    }
});

function handleSelection(selection) {
    // Make sure the selection is inside the document container or OCR results
    const isInsideDoc = docContainer.contains(selection.anchorNode);
    const ocrContainer = document.getElementById('ocr-results-container');
    const isInsideOcr = ocrContainer && ocrContainer.contains(selection.anchorNode);
    
    if (!isInsideDoc && !isInsideOcr) {
        hidePopup();
        return;
    }

    currentSelection = selection.toString().trim();

    // Get the bounding box of the selection
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Show popup positioned above the selection
    showPopup(rect.left + (rect.width / 2), rect.top);
}

function showPopup(x, y) {
    popup.classList.remove('hidden');
    
    // Calculate positioning, keep within screen bounds
    const popupWidth = popup.offsetWidth;
    const popupHeight = popup.offsetHeight;
    
    let top = y - popupHeight - 10;
    let left = x - (popupWidth / 2);
    
    if (top < 0) top = y + 20; // Show below if no room above
    if (left < 0) left = 10;
    if (left + popupWidth > window.innerWidth) left = window.innerWidth - popupWidth - 10;
    
    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;
}

function hidePopup() {
    popup.classList.add('hidden');
}

// Button actions
document.getElementById('btn-meaning').addEventListener('click', () => {
    fetchMeaning(currentSelection);
});

document.getElementById('btn-translate').addEventListener('click', () => {
    fetchTranslation(currentSelection);
});

document.getElementById('btn-explain').addEventListener('click', () => {
    fetchExplanation(currentSelection);
});

document.getElementById('btn-wikipedia').addEventListener('click', () => {
    openWikipedia(currentSelection);
});

document.getElementById('btn-listen').addEventListener('click', () => {
    startListening(currentSelection);
});

// Mock functions for knowledge integration (to be connected to backend)
async function fetchMeaning(text) {
    stopActiveSpeech();
    showKnowledgePanel();
    const container = document.getElementById('knowledge-container');
    container.innerHTML = `
        <div class="knowledge-card" style="padding: 16px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 16px;">
            <h3 style="margin-bottom: 8px; color: var(--accent-primary);"><i class="fa-solid fa-book"></i> Meaning</h3>
            <p><strong>${text}</strong></p>
            <p style="margin-top: 8px; color: var(--text-secondary);">Fetching definition from API...</p>
        </div>
    `;

    try {
        const res = await fetch(`${API_BASE_URL}/api/meaning?word=${encodeURIComponent(text)}`);
        const data = await res.json();
        if (data.error || !data.meaning) {
            container.innerHTML = `<div class="knowledge-card" style="padding: 16px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 16px;"><h3 style="margin-bottom: 8px; color: var(--accent-primary);"><i class="fa-solid fa-book"></i> Meaning</h3><p><strong>${text}</strong></p><p style="margin-top: 8px; color: var(--text-secondary);">${data.error || data.meaning}</p></div>`;
        } else {
            container.innerHTML = `<div class="knowledge-card" style="padding: 16px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 16px;"><h3 style="margin-bottom: 8px; color: var(--accent-primary);"><i class="fa-solid fa-book"></i> Meaning</h3><p><strong>${text}</strong></p><p style="margin-top: 8px;">${data.meaning}</p></div>`;
            
            // Also try to fetch wiki info
            fetchWiki(text, container);
        }
    } catch (e) {
        container.innerHTML = `<div class="knowledge-card" style="padding: 16px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 16px;"><p>Failed to connect to backend.</p></div>`;
    }
}

async function fetchWiki(text, container) {
    try {
        const res = await fetch(`${API_BASE_URL}/api/wikipedia?query=${encodeURIComponent(text)}`);
        const data = await res.json();
        if (data.summary) {
            container.innerHTML += `
            <div class="knowledge-card" style="padding: 16px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 16px;">
                <h3 style="margin-bottom: 8px; color: var(--accent-secondary);"><i class="fa-brands fa-wikipedia-w"></i> Wikipedia</h3>
                <p style="margin-bottom: 8px;">${data.summary}</p>
                <a href="${data.url}" target="_blank" style="font-size: 12px;"><i class="fa-solid fa-arrow-up-right-from-square"></i> Read more on Wikipedia</a>
            </div>`;
        }
    } catch (e) {
        // Silent fail for wiki
    }
}

async function openWikipedia(text) {
    stopActiveSpeech();
    if (!text) return;

    // 1. Open Wikipedia article in a new tab immediately
    const wikiSearchUrl = `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(text)}`;
    window.open(wikiSearchUrl, '_blank');

    // 2. Also show a preview card in the Knowledge panel
    showKnowledgePanel();
    const container = document.getElementById('knowledge-container');
    container.innerHTML = `
        <div class="knowledge-card wiki-preview-card" style="padding: 16px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 16px;">
            <h3 style="margin-bottom: 10px; color: var(--accent-secondary); display:flex; align-items:center; gap:8px;">
                <i class="fa-brands fa-wikipedia-w"></i> Wikipedia
            </h3>
            <p style="font-size: 13px; color: var(--text-secondary); font-style: italic; margin-bottom: 10px;">Searching: "${text}"</p>
            <div style="display:flex; gap:8px; align-items:center; justify-content:center; padding:16px;">
                <i class="fa-solid fa-circle-notch fa-spin" style="color:var(--accent-secondary);"></i>
                <span>Loading Wikipedia preview...</span>
            </div>
        </div>
    `;

    try {
        const res = await fetch(`${API_BASE_URL}/api/wikipedia?query=${encodeURIComponent(text)}`);
        const data = await res.json();

        if (data.summary) {
            container.innerHTML = `
                <div class="knowledge-card wiki-preview-card" style="padding: 16px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 16px;">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
                        <i class="fa-brands fa-wikipedia-w" style="font-size:20px; color:var(--accent-secondary);"></i>
                        <h3 style="margin:0; color:var(--accent-secondary);">${data.title}</h3>
                    </div>
                    <p style="line-height:1.65; margin-bottom:14px; font-size:14px;">${data.summary}</p>
                    <a href="${data.url}" target="_blank"
                       style="display:inline-flex; align-items:center; gap:6px; font-size:13px;
                              padding:6px 14px; border-radius:6px; text-decoration:none;
                              background:rgba(139,92,246,0.15); color:var(--accent-secondary);
                              border:1px solid rgba(139,92,246,0.35); transition:background 0.2s;"
                       onmouseover="this.style.background='rgba(139,92,246,0.28)'"
                       onmouseout="this.style.background='rgba(139,92,246,0.15)'">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> Open full article
                    </a>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="knowledge-card" style="padding: 16px; border: 1px solid var(--border-color); border-radius: 8px;">
                    <h3 style="color:var(--accent-secondary); margin-bottom:8px;"><i class="fa-brands fa-wikipedia-w"></i> Wikipedia</h3>
                    <p style="color:var(--text-secondary);">No Wikipedia article found for "${text}".</p>
                    <a href="${wikiSearchUrl}" target="_blank" style="font-size:13px; color:var(--accent-secondary);">Search on Wikipedia →</a>
                </div>`;
        }
    } catch(e) {
        container.innerHTML = `
            <div class="knowledge-card" style="padding: 16px; border: 1px solid var(--border-color); border-radius: 8px;">
                <p style="color:red;">Failed to fetch Wikipedia preview. <a href="${wikiSearchUrl}" target="_blank" style="color:var(--accent-secondary);">Open Wikipedia directly →</a></p>
            </div>`;
    }
}

async function fetchTranslation(text, lang = 'es') {
    stopActiveSpeech();
    showKnowledgePanel();
    const container = document.getElementById('knowledge-container');
    
    // We only want to show loading state if it's the first time
    if (!document.getElementById('lang-select')) {
        container.innerHTML = `<div class="knowledge-card" style="padding: 16px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 16px;">
            <h3 style="margin-bottom: 8px; color: var(--accent-primary);"><i class="fa-solid fa-language"></i> Translation</h3>
            <p style="margin-top: 8px; color: var(--text-secondary);">Translating: "${text}"...</p>
        </div>`;
    } else {
        document.getElementById('trans-result').innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Translating...`;
    }
    
    try {
        const res = await fetch(`${API_BASE_URL}/api/translate`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({text: text, lang: lang})
        });
        const data = await res.json();
        
        // Define popular languages for the dropdown
        const languages = [
            {code: 'es', name: 'Spanish'},
            {code: 'fr', name: 'French'},
            {code: 'de', name: 'German'},
            {code: 'it', name: 'Italian'},
            {code: 'hi', name: 'Hindi'},
            {code: 'zh-CN', name: 'Chinese (Simplified)'},
            {code: 'ja', name: 'Japanese'},
            {code: 'ru', name: 'Russian'},
            {code: 'ar', name: 'Arabic'},
            {code: 'ta', name: 'Tamil'},
            {code: 'ko', name: 'Korean'}
        ];
        
        let optionsHtml = languages.map(l => 
            `<option value="${l.code}" ${l.code === lang ? 'selected' : ''}>${l.name}</option>`
        ).join('');

        container.innerHTML = `<div class="knowledge-card" style="padding: 16px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <h3 style="color: var(--accent-primary); margin: 0;"><i class="fa-solid fa-language"></i> Translation</h3>
                <select id="lang-select" style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-panel); color: var(--text-primary); font-size: 12px; outline: none; cursor: pointer;">
                    ${optionsHtml}
                </select>
            </div>
            
            <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px; font-style: italic;">Original: "${text}"</p>
            <div style="padding: 12px; background: rgba(99, 102, 241, 0.05); border-radius: 6px; border-left: 3px solid var(--accent-primary);">
                <p id="trans-result" style="font-size: 15px; line-height: 1.5; color: var(--text-primary);">
                    ${data.error ? 'Error: ' + data.error : data.translation}
                </p>
            </div>
        </div>`;

        // Add event listener to select
        document.getElementById('lang-select').addEventListener('change', (e) => {
            fetchTranslation(text, e.target.value);
        });

    } catch(e) {
        container.innerHTML = `<div class="knowledge-card" style="padding: 16px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 16px;">
            <p style="color: red;">Failed to connect to backend.</p>
        </div>`;
    }
}

async function fetchExplanation(text) {
    stopActiveSpeech();
    showKnowledgePanel();
    const container = document.getElementById('knowledge-container');
    container.innerHTML = `
        <div class="knowledge-card" style="padding: 16px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 16px; background: rgba(99, 102, 241, 0.05);">
            <h3 style="margin-bottom: 8px; color: var(--accent-primary);"><i class="fa-solid fa-wand-magic-sparkles"></i> AI Explanation</h3>
            <p style="font-style: italic; margin-bottom: 8px;">"${text}"</p>
            <div style="display: flex; gap: 8px; align-items: center; justify-content: center; padding: 20px;">
                <i class="fa-solid fa-circle-notch fa-spin" style="color: var(--accent-primary);"></i>
                <span>Simplifying concept...</span>
            </div>
        </div>
    `;
    
    try {
        const res = await fetch(`${API_BASE_URL}/api/explain`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({text: text})
        });
        const data = await res.json();
        container.innerHTML = `
        <div class="knowledge-card" style="padding: 16px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 16px; background: rgba(99, 102, 241, 0.05);">
            <h3 style="margin-bottom: 8px; color: var(--accent-primary);"><i class="fa-solid fa-wand-magic-sparkles"></i> AI Explanation</h3>
            <p style="font-style: italic; margin-bottom: 12px; color: var(--text-secondary); border-left: 3px solid var(--accent-primary); padding-left: 8px;">"${text}"</p>
            <p style="line-height: 1.6;">${data.explanation}</p>
        </div>
        `;
    } catch(e) {
        container.innerHTML = `<p>Failed to connect to backend.</p>`;
    }
}

function showKnowledgePanel() {
    // Simulate clicking the knowledge tab
    const tabBtn = document.querySelector('.tab[data-target="knowledge-tab"]');
    if (tabBtn) tabBtn.click();
    hidePopup();
}

// === Text-to-Speech (TTS) Logic ===
let speechText = '';
let speechUtterance = null;
let currentCharIndex = 0;
let isPlaying = false;
let isPaused = false;
let selectedVoiceName = '';
let spansInfo = [];

function stopActiveSpeech() {
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    isPlaying = false;
    isPaused = false;
    currentCharIndex = 0;
    // Clear active styling if any
    const container = document.getElementById('speech-text-container');
    if (container) {
        container.querySelectorAll('.speech-word').forEach(el => {
            el.style.background = 'transparent';
            el.style.color = 'inherit';
        });
    }
}

function startListening(text) {
    stopActiveSpeech();
    if (!text) return;
    
    speechText = text;
    showKnowledgePanel();
    
    const container = document.getElementById('knowledge-container');
    container.innerHTML = `
        <div class="knowledge-card speech-card" style="padding: 16px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 16px; background: rgba(139, 92, 246, 0.05);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                <h3 style="color: var(--accent-secondary); margin: 0; display: flex; align-items: center; gap: 6px; font-size: 15px;"><i class="fa-solid fa-volume-high"></i> Read Aloud</h3>
                <select id="voice-select" style="padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-panel); color: var(--text-primary); font-size: 12px; outline: none; cursor: pointer; max-width: 210px;">
                    <option>Loading voices...</option>
                </select>
            </div>
            
            <div id="speech-text-container" style="line-height: 1.6; margin-bottom: 16px; font-size: 14px; padding: 12px; background: var(--bg-panel); border-radius: 6px; border: 1px solid var(--border-color); max-height: 180px; overflow-y: auto; text-align: left; word-break: break-word;">
                <!-- Word spans will be placed here -->
            </div>
            
            <div style="display: flex; gap: 10px; align-items: center;">
                <button id="btn-speech-play-pause" class="primary-btn" style="padding: 8px 16px; display: flex; align-items: center; gap: 6px; font-size: 13px; background: linear-gradient(135deg, var(--accent-secondary), var(--accent-primary)); border-radius: 6px; box-shadow: 0 4px 8px rgba(139, 92, 246, 0.25);">
                    <i class="fa-solid fa-pause"></i> Pause
                </button>
                <button id="btn-speech-stop" style="padding: 8px 16px; border-radius: 6px; background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); font-size: 13px; display: flex; align-items: center; gap: 6px; font-weight: 500; transition: all 0.2s;" onmouseover="this.style.background='rgba(239, 68, 68, 0.2)'" onmouseout="this.style.background='rgba(239, 68, 68, 0.1)'">
                    <i class="fa-solid fa-square"></i> Stop
                </button>
            </div>
        </div>
    `;

    // Tokenize text into spans to preserve punctuation and spaces, and wrap alphanumeric words
    const speechTextContainer = document.getElementById('speech-text-container');
    let html = '';
    let currentWordIndex = 0;
    spansInfo = [];
    const wordRegex = /[a-zA-Z0-9À-ÿ]+/g;
    let lastIdx = 0;
    let match;
    
    while ((match = wordRegex.exec(speechText)) !== null) {
        html += escapeHtml(speechText.slice(lastIdx, match.index));
        const wordId = `speech-word-${currentWordIndex}`;
        html += `<span id="${wordId}" class="speech-word" style="transition: all 0.1s ease;">${escapeHtml(match[0])}</span>`;
        spansInfo.push({
            start: match.index,
            end: wordRegex.lastIndex,
            id: wordId
        });
        currentWordIndex++;
        lastIdx = wordRegex.lastIndex;
    }
    html += escapeHtml(speechText.slice(lastIdx));
    speechTextContainer.innerHTML = html;

    // Populate voices select
    const voiceSelect = document.getElementById('voice-select');
    populateVoices(voiceSelect, selectedVoiceName);
    selectedVoiceName = voiceSelect.value;

    // Setup event listeners
    voiceSelect.addEventListener('change', () => {
        selectedVoiceName = voiceSelect.value;
        if (isPlaying) {
            // Cancel current utterance and start from the current character offset
            window.speechSynthesis.cancel();
            speakTextFromIndex(currentCharIndex);
        }
    });

    const playPauseBtn = document.getElementById('btn-speech-play-pause');
    playPauseBtn.addEventListener('click', () => {
        if (isPlaying && !isPaused) {
            // Pause
            window.speechSynthesis.cancel(); // cancel to avoid browser lockups
            isPaused = true;
            playPauseBtn.innerHTML = `<i class="fa-solid fa-play"></i> Play`;
        } else if (isPaused) {
            // Resume/Play from saved index
            isPaused = false;
            speakTextFromIndex(currentCharIndex);
            playPauseBtn.innerHTML = `<i class="fa-solid fa-pause"></i> Pause`;
        } else {
            // Start from beginning
            speakTextFromIndex(0);
            playPauseBtn.innerHTML = `<i class="fa-solid fa-pause"></i> Pause`;
        }
    });

    const stopBtn = document.getElementById('btn-speech-stop');
    stopBtn.addEventListener('click', () => {
        stopActiveSpeech();
        playPauseBtn.innerHTML = `<i class="fa-solid fa-play"></i> Play`;
    });

    // Start speaking immediately
    speakTextFromIndex(0);
}

function speakTextFromIndex(startIndex) {
    if (!window.speechSynthesis) return;
    
    window.speechSynthesis.cancel();
    
    const textToSpeak = speechText.substring(startIndex);
    if (!textToSpeak.trim()) {
        handleSpeechEnd();
        return;
    }
    
    speechUtterance = new SpeechSynthesisUtterance(textToSpeak);
    
    // Find selected voice
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.name === selectedVoiceName);
    if (voice) {
        speechUtterance.voice = voice;
    }
    
    speechUtterance.onboundary = (event) => {
        if (event.name === 'word') {
            const currentOffset = startIndex + event.charIndex;
            currentCharIndex = currentOffset;
            highlightSpokenWord(currentOffset);
        }
    };
    
    speechUtterance.onend = () => {
        // Only trigger end if we are actually at/near the end of text
        // and we weren't cancelled because of voice swap or pause
        if (isPlaying && !isPaused && currentCharIndex >= speechText.length - 15) {
            handleSpeechEnd();
        }
    };

    speechUtterance.onerror = (e) => {
        // If it was cancelled by voice change or pause, do not reset UI
        if (e.error !== 'interrupted') {
            console.error('Speech synthesis error:', e);
        }
    };
    
    isPlaying = true;
    window.speechSynthesis.speak(speechUtterance);
}

function handleSpeechEnd() {
    isPlaying = false;
    isPaused = false;
    currentCharIndex = 0;
    const playPauseBtn = document.getElementById('btn-speech-play-pause');
    if (playPauseBtn) {
        playPauseBtn.innerHTML = `<i class="fa-solid fa-play"></i> Play`;
    }
    // Remove highlight from all words
    const container = document.getElementById('speech-text-container');
    if (container) {
        container.querySelectorAll('.speech-word').forEach(el => {
            el.style.background = 'transparent';
            el.style.color = 'inherit';
        });
    }
}

function highlightSpokenWord(charIndex) {
    const container = document.getElementById('speech-text-container');
    if (!container) return;
    
    let activeSpanId = null;
    for (const span of spansInfo) {
        if (charIndex >= span.start && charIndex < span.end) {
            activeSpanId = span.id;
            break;
        }
    }
    
    // Fallback: nearest start
    if (!activeSpanId && spansInfo.length > 0) {
        let bestSpan = spansInfo[0];
        let minDiff = Math.abs(charIndex - bestSpan.start);
        for (const span of spansInfo) {
            const diff = Math.abs(charIndex - span.start);
            if (diff < minDiff) {
                minDiff = diff;
                bestSpan = span;
            }
        }
        activeSpanId = bestSpan.id;
    }
    
    container.querySelectorAll('.speech-word').forEach(el => {
        el.style.background = 'transparent';
        el.style.color = 'inherit';
    });
    
    if (activeSpanId) {
        const activeEl = document.getElementById(activeSpanId);
        if (activeEl) {
            activeEl.style.background = 'rgba(139, 92, 246, 0.25)';
            activeEl.style.color = 'var(--accent-secondary)';
            activeEl.style.borderRadius = '3px';
            activeEl.style.padding = '0 2px';
            activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

function populateVoices(selectEl, currentSelected) {
    if (!window.speechSynthesis) return;
    const voices = window.speechSynthesis.getVoices();
    
    // Sort voices by language then name
    const sortedVoices = [...voices].sort((a, b) => {
        if (a.lang < b.lang) return -1;
        if (a.lang > b.lang) return 1;
        return a.name.localeCompare(b.name);
    });

    selectEl.innerHTML = '';
    
    if (sortedVoices.length === 0) {
        selectEl.innerHTML = '<option value="">No voices found</option>';
        return;
    }

    sortedVoices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.name;
        option.textContent = `${voice.name} (${voice.lang})`;
        if (voice.name === currentSelected) {
            option.selected = true;
        }
        selectEl.appendChild(option);
    });

    // Fallback if the requested voice is not found or not set
    if (!currentSelected || !sortedVoices.some(v => v.name === currentSelected)) {
        // Try to find a default or English voice
        const englishVoice = sortedVoices.find(v => v.lang.startsWith('en') && v.default) || 
                            sortedVoices.find(v => v.lang.startsWith('en')) || 
                            sortedVoices[0];
        if (englishVoice) {
            selectEl.value = englishVoice.name;
        }
    }
}

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
        const voiceSelect = document.getElementById('voice-select');
        if (voiceSelect) {
            const currentSelected = voiceSelect.value || selectedVoiceName;
            populateVoices(voiceSelect, currentSelected);
        }
    };
}
