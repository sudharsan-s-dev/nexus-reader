/**
 * Flashcards Guide Component
 * Manages the generation, rendering, and flip behavior of interactive study flashcards.
 */

document.addEventListener('DOMContentLoaded', () => {
    const generateBtn = document.getElementById('generate-flashcards-btn');
    const container = document.getElementById('flashcard-results-container');
    const scopeSelect = document.getElementById('flashcard-scope');
    const difficultySelect = document.getElementById('flashcard-difficulty');
    const countSelect = document.getElementById('flashcard-count');

    if (!generateBtn || !container) return;

    let currentCards = [];
    let currentIndex = 0;

    // Helper to get text from the viewer
    async function getDocumentText(scope) {
        if (scope === 'Selection') {
            const sel = window.getSelection().toString().trim();
            if (!sel) throw new Error("Please highlight some text in the document first.");
            return sel;
        } 
        else if (scope === 'Page') {
            const pages = document.querySelectorAll('.pdf-page');
            let visibleText = "";
            for (const page of pages) {
                const rect = page.getBoundingClientRect();
                if (rect.top >= 0 && rect.bottom <= window.innerHeight) {
                    visibleText = page.innerText || page.textContent;
                    break;
                }
            }
            if (!visibleText && pages.length > 0) visibleText = pages[0].innerText || pages[0].textContent;
            if (!visibleText.trim()) throw new Error("Could not extract text from the current page.");
            return visibleText;
        }
        else if (scope === 'Document') {
            const pages = document.querySelectorAll('.pdf-page');
            let allText = "";
            pages.forEach(p => allText += (p.innerText || p.textContent) + "\n\n");
            if (!allText.trim()) throw new Error("Document is empty.");
            return allText;
        }
        return "";
    }

    generateBtn.addEventListener('click', async () => {
        const apiKey = localStorage.getItem('gemini_api_key');
        if (!apiKey) {
            alert("Please add your Gemini API Key in Settings first.");
            document.getElementById('settings-btn').click();
            return;
        }

        const scope = scopeSelect.value;
        const count = countSelect.value;
        const difficulty = difficultySelect.value;

        // Loading state
        // Loading state (Pulsing Skeleton Card)
        container.innerHTML = `
            <div class="skeleton-loader" style="align-items: center;">
                <div class="skeleton-card" style="width: 100%; max-width: 460px; margin: 20px auto;"></div>
            </div>
        `;

        try {
            const textToProcess = await getDocumentText(scope);
            const apiBase = window.API_BASE_URL || (typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://localhost:5000');
            
            const res = await fetch(`${apiBase}/api/study/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: apiKey,
                    text: textToProcess,
                    type: 'Flashcard',
                    count: parseInt(count),
                    difficulty: difficulty,
                    scope: scope,
                    document_id: window.currentDocHash
                })
            });

            const result = await res.json();
            if (!res.ok || !result.success) {
                throw new Error(result.error || "Generation request failed");
            }

            currentCards = result.data || [];
            currentIndex = 0;

            if (currentCards.length === 0) {
                container.innerHTML = `
                    <div class="empty-state sm">
                        <i class="fa-solid fa-circle-exclamation" style="font-size: 32px; color: #ef4444; margin-bottom: 12px;"></i>
                        <p>No flashcards could be generated from the selected content.</p>
                    </div>
                `;
            } else {
                renderCurrentCard();
            }

        } catch (err) {
            console.error("Flashcards error:", err);
            container.innerHTML = `
                <div class="empty-state sm">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size: 32px; color: #ef4444; margin-bottom: 12px;"></i>
                    <p>Failed to generate flashcards.</p>
                    <p style="font-size: 12px; margin-top: 8px; color: #ef4444;">${err.message}</p>
                </div>
            `;
        }
    });

    function renderCurrentCard() {
        if (currentCards.length === 0) return;
        const card = currentCards[currentIndex];

        container.innerHTML = `
            <!-- Flip Card Container -->
            <div class="flashcard-container" id="active-flashcard">
                <div class="flashcard-inner">
                    <!-- Front Side -->
                    <div class="flashcard-front">
                        <div class="flashcard-content">${escapeHTML(card.question)}</div>
                        <div class="flashcard-hint"><i class="fa-solid fa-hand-pointer"></i> Click to reveal answer</div>
                    </div>
                    <!-- Back Side -->
                    <div class="flashcard-back">
                        <div class="flashcard-content">${escapeHTML(card.answer)}</div>
                        <div class="flashcard-hint"><i class="fa-solid fa-rotate-left"></i> Click to flip back</div>
                    </div>
                </div>
            </div>

            <!-- Navigation Controls -->
            <div class="flashcard-controls">
                <button class="flashcard-nav-btn" id="prev-card-btn" ${currentIndex === 0 ? 'disabled' : ''}>
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                <span style="font-size: 14px; font-weight: 600; color: var(--text-secondary);">
                    ${currentIndex + 1} of ${currentCards.length}
                </span>
                <button class="flashcard-nav-btn" id="next-card-btn" ${currentIndex === currentCards.length - 1 ? 'disabled' : ''}>
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
            </div>
        `;

        // Flip Card Action
        const cardEl = document.getElementById('active-flashcard');
        if (cardEl) {
            cardEl.addEventListener('click', () => {
                cardEl.classList.toggle('flipped');
            });
        }

        // Navigation actions
        document.getElementById('prev-card-btn').addEventListener('click', () => {
            if (currentIndex > 0) {
                currentIndex--;
                renderCurrentCard();
            }
        });

        document.getElementById('next-card-btn').addEventListener('click', () => {
            if (currentIndex < currentCards.length - 1) {
                currentIndex++;
                renderCurrentCard();
            }
        });
    }

    function escapeHTML(str) {
        if (!str) return '';
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});
