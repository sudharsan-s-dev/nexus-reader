/**
 * Podcast Guide Component
 * Manages AI audio podcast generation using backend gTTS and HTML5 Audio playback.
 */

document.addEventListener('DOMContentLoaded', () => {
    const generateBtn = document.getElementById('generate-podcast-btn');
    const container = document.getElementById('podcast-results-container');
    const speedSelect = document.getElementById('podcast-speed');
    const languageSelect = document.getElementById('podcast-language'); // We need to add this to reader.html if not present, or assume English if missing

    if (!generateBtn || !container) return;

    let currentAudioUrl = null;

    // Helper to get text from the document viewer
    async function getDocumentText() {
        // Since we removed scope dropdown, we default to the whole document
        const pages = document.querySelectorAll('.pdf-page');
        let allText = "";
        pages.forEach(p => allText += (p.innerText || p.textContent) + "\n\n");
        if (!allText.trim()) throw new Error("Document is empty or text could not be extracted.");
        return allText;
    }

    generateBtn.addEventListener('click', async () => {
        const apiKey = localStorage.getItem('gemini_api_key');
        if (!apiKey) {
            alert("Please add your Gemini API Key in Settings first.");
            document.getElementById('settings-btn').click();
            return;
        }

        const language = languageSelect ? languageSelect.value : 'English';

        // Loading state with pulsing equalizer
        generateBtn.disabled = true;
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; gap: 20px;">
                <div style="font-size: 14px; color: var(--text-secondary); font-weight: 500;">
                    Generating ${language} Podcast...
                </div>
                <div class="equalizer-loader" style="display: flex; gap: 4px; height: 40px; align-items: flex-end;">
                    <div class="bar" style="width: 6px; background: var(--primary-color); border-radius: 3px; animation: pulse-bar 1s ease-in-out infinite;"></div>
                    <div class="bar" style="width: 6px; background: var(--primary-color); border-radius: 3px; animation: pulse-bar 1s ease-in-out infinite 0.2s;"></div>
                    <div class="bar" style="width: 6px; background: var(--primary-color); border-radius: 3px; animation: pulse-bar 1s ease-in-out infinite 0.4s;"></div>
                    <div class="bar" style="width: 6px; background: var(--primary-color); border-radius: 3px; animation: pulse-bar 1s ease-in-out infinite 0.1s;"></div>
                    <div class="bar" style="width: 6px; background: var(--primary-color); border-radius: 3px; animation: pulse-bar 1s ease-in-out infinite 0.3s;"></div>
                </div>
                <style>
                    @keyframes pulse-bar {
                        0%, 100% { height: 10px; }
                        50% { height: 40px; }
                    }
                </style>
            </div>
        `;

        try {
            const textToProcess = await getDocumentText();
            const apiBase = window.API_BASE_URL || (typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://localhost:5000');
            
            const res = await fetch(`${apiBase}/api/generate_podcast`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: apiKey,
                    text: textToProcess,
                    language: language
                })
            });

            const result = await res.json();
            if (!res.ok || !result.success) {
                throw new Error(result.error || "Generation request failed");
            }

            currentAudioUrl = `${apiBase}${result.audio_url}`;
            renderAudioPlayer(currentAudioUrl);

        } catch (err) {
            console.error("Podcast generation error:", err);
            container.innerHTML = `
                <div class="empty-state sm">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size: 32px; color: #ef4444; margin-bottom: 12px;"></i>
                    <p>Failed to generate podcast.</p>
                    <p style="font-size: 12px; margin-top: 8px; color: #ef4444;">${err.message}</p>
                </div>
            `;
        } finally {
            generateBtn.disabled = false;
        }
    });

    function renderAudioPlayer(url) {
        container.innerHTML = `
            <div class="study-card" style="padding: 24px; border: 1px solid var(--border-color); border-radius: 12px; background: var(--bg-surface); display: flex; flex-direction: column; gap: 16px; align-items: center; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                    <div style="width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(135deg, var(--primary-color), var(--secondary-color)); display: flex; align-items: center; justify-content: center; color: white; font-size: 24px; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
                        <i class="fa-solid fa-headphones"></i>
                    </div>
                    <div style="font-size: 16px; font-weight: 600; color: var(--text-primary);">Your AI Podcast is Ready</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">Powered by Gemini & gTTS</div>
                </div>
                
                <audio id="podcast-audio-player" controls style="width: 100%; outline: none; border-radius: 30px; margin-top: 8px;">
                    <source src="${url}" type="audio/mpeg">
                    Your browser does not support the audio element.
                </audio>
            </div>
        `;

        const player = document.getElementById('podcast-audio-player');
        
        // Handle speed control
        if (speedSelect) {
            player.playbackRate = parseFloat(speedSelect.value);
            
            speedSelect.addEventListener('change', () => {
                if (player) {
                    player.playbackRate = parseFloat(speedSelect.value);
                }
            });
        }
        
        // Optional: auto-play
        // player.play();
    }
});
