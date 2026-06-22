/**
 * Study Guide Component
 * Handles the generation of MCQs, Viva, 16-Mark questions, etc., using the backend Gemini API.
 */

// Initialize Settings Modal logic
document.addEventListener('DOMContentLoaded', () => {
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettings = document.getElementById('close-settings');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const apiKeyInput = document.getElementById('gemini-api-key');

    // Load saved key
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
        apiKeyInput.value = savedKey;
    }

    settingsBtn.addEventListener('click', () => {
        settingsModal.classList.remove('hidden');
    });

    closeSettings.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });

    saveSettingsBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (key) {
            localStorage.setItem('gemini_api_key', key);
            settingsModal.classList.add('hidden');
            alert('API Key saved securely to your browser!');
        } else {
            alert('Please enter a valid API Key.');
        }
    });
});

// Study Guide Logic
const studyContainer = document.getElementById('study-results-container');
const actionButtons = document.querySelectorAll('.study-action-btn');

let studyFlashcards = [];
let studyFlashcardIndex = 0;

async function getDocumentText(scope) {
    if (scope === 'Selection') {
        const sel = window.getSelection().toString().trim();
        if (!sel) throw new Error("Please highlight some text in the document first.");
        return sel;
    } 
    else if (scope === 'Page') {
        // Find visible page
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
        // Collect all text from all pages
        const pages = document.querySelectorAll('.pdf-page');
        let allText = "";
        pages.forEach(p => allText += (p.innerText || p.textContent) + "\n\n");
        if (!allText.trim()) throw new Error("Document is empty.");
        return allText;
    }
}

actionButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
        const apiKey = localStorage.getItem('gemini_api_key');
        if (!apiKey) {
            alert("Please add your Gemini API Key in Settings first.");
            document.getElementById('settings-btn').click();
            return;
        }

        const type = btn.dataset.type;
        const scope = document.getElementById('study-scope').value;
        const count = document.getElementById('study-count').value;
        const difficulty = document.getElementById('study-difficulty').value;

        try {
            const textToProcess = await getDocumentText(scope);
            
            // Loading State (Pulsing Skeleton)
            studyContainer.innerHTML = `
                <div class="skeleton-loader">
                    <div class="skeleton-line title"></div>
                    <div class="skeleton-line"></div>
                    <div class="skeleton-line"></div>
                    <div class="skeleton-line short"></div>
                    <div class="skeleton-line"></div>
                </div>
            `;

            // We can reuse currentDocHash from ocr-handler if it exists and is not null, otherwise generate a random one
            const docId = (typeof currentDocHash !== 'undefined' && currentDocHash) ? currentDocHash : 'doc_' + Date.now();

            const res = await fetch(`${API_BASE_URL}/api/study/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: apiKey,
                    text: textToProcess,
                    type: type,
                    count: parseInt(count),
                    difficulty: difficulty,
                    scope: scope,
                    document_id: docId
                })
            });

            const responseData = await res.json();
            
            if (!responseData.success) {
                throw new Error(responseData.error || "Failed to generate study materials.");
            }

            renderStudyMaterials(type, responseData.data);

        } catch (error) {
            studyContainer.innerHTML = `
                <div class="empty-state sm">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size: 32px; color: #ef4444; margin-bottom: 12px;"></i>
                    <p style="color: #ef4444;">Error generating materials.</p>
                    <p style="font-size: 12px; margin-top: 8px;">${error.message}</p>
                </div>
            `;
        }
    });
});

function renderStudyMaterials(type, data) {
    studyContainer.innerHTML = '';
    
    if (type === 'Flashcard') {
        studyFlashcards = data || [];
        studyFlashcardIndex = 0;
        
        if (studyFlashcards.length === 0) {
            studyContainer.innerHTML = `
                <div class="empty-state sm">
                    <i class="fa-solid fa-circle-exclamation" style="font-size: 32px; color: #ef4444; margin-bottom: 12px;"></i>
                    <p>No flashcards could be generated from the selected content.</p>
                </div>
            `;
            return;
        }
        
        renderStudyFlashcard();
        return;
    }
    
    if (type === 'Summary') {
        const html = `
            <div class="study-card">
                <h3 style="color: var(--accent-primary); margin-bottom: 12px;">Document Summary</h3>
                <p style="margin-bottom: 16px;">${data.overview}</p>
                <h4 style="margin-bottom: 8px;">Key Points:</h4>
                <ul style="padding-left: 20px;">
                    ${data.key_points.map(pt => `<li style="margin-bottom: 4px;">${pt}</li>`).join('')}
                </ul>
            </div>
        `;
        studyContainer.innerHTML = html;
        return;
    }
    
    if (type === 'MCQ') {
        let html = '<h3 style="color: var(--accent-primary); margin-bottom: 16px;">Multiple Choice Questions</h3>';
        data.forEach((q, idx) => {
            html += `
                <div class="study-card" style="margin-bottom: 24px; padding: 16px; border: 1px solid var(--border-color); border-radius: 8px;">
                    <p style="font-weight: 600; margin-bottom: 12px;">${idx + 1}. ${q.question}</p>
                    <div class="mcq-options-container" data-answer="${q.answer.replace(/"/g, '&quot;')}" style="display: flex; flex-direction: column; gap: 8px;">
                        ${q.options.map((opt, oIdx) => `
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 8px; border-radius: 4px; border: 1px solid transparent; transition: all 0.2s;">
                                <input type="radio" name="q${idx}" value="${opt.replace(/"/g, '&quot;')}" onchange="window.checkMCQAnswer(this)">
                                <span>${opt}</span>
                            </label>
                        `).join('')}
                    </div>
                    <div class="mcq-feedback hidden" style="margin-top: 16px; padding: 12px; border-radius: 4px; border-left: 4px solid transparent;">
                    </div>
                </div>
            `;
        });
        studyContainer.innerHTML = html;
        return;
    }

    // For Viva, Interview, 2-Mark, 16-Mark (Q&A Accordion style)
    let html = `<h3 style="color: var(--accent-primary); margin-bottom: 16px;">${type} Questions</h3>`;
    data.forEach((q, idx) => {
        // Render with marked.js if loaded, otherwise fallback to simple breaks
        const formattedAnswer = typeof marked !== 'undefined' ? marked.parse(q.answer) : q.answer.replace(/\n/g, '<br>');
        html += `
            <div class="study-card" style="margin-bottom: 16px; border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">
                <div class="qa-question" style="padding: 16px; background: var(--bg-surface); cursor: pointer; display: flex; justify-content: space-between; align-items: center;" onclick="this.nextElementSibling.classList.toggle('hidden');">
                    <span style="font-weight: 600;">Q${idx + 1}: ${q.question}</span>
                    <i class="fa-solid fa-chevron-down" style="color: var(--text-secondary);"></i>
                </div>
                <div class="qa-answer hidden" style="padding: 16px; border-top: 1px solid var(--border-color); background: var(--bg-panel);">
                    ${formattedAnswer}
                </div>
            </div>
        `;
    });
    studyContainer.innerHTML = html;
}

window.checkMCQAnswer = function(radio) {
    const container = radio.closest('.mcq-options-container');
    const correctAnswer = container.getAttribute('data-answer');
    const feedbackDiv = container.nextElementSibling;
    const labels = container.querySelectorAll('label');
    const radios = container.querySelectorAll('input[type="radio"]');
    
    // Disable all radios in this group
    radios.forEach(r => r.disabled = true);
    
    const isCorrect = radio.value === correctAnswer;
    
    // Highlight options
    labels.forEach(label => {
        const input = label.querySelector('input');
        if (input.value === correctAnswer) {
            label.style.background = 'rgba(16, 185, 129, 0.1)';
            label.style.borderColor = '#10b981';
        } else if (input.checked && !isCorrect) {
            label.style.background = 'rgba(239, 68, 68, 0.1)';
            label.style.borderColor = '#ef4444';
        } else {
            label.style.opacity = '0.5';
        }
    });
    
    feedbackDiv.classList.remove('hidden');
    if (isCorrect) {
        feedbackDiv.innerHTML = '<strong>Correct!</strong> Well done.';
        feedbackDiv.style.background = 'rgba(16, 185, 129, 0.1)';
        feedbackDiv.style.color = '#10b981';
        feedbackDiv.style.borderLeftColor = '#10b981';
    } else {
        feedbackDiv.innerHTML = `<strong>Incorrect.</strong> The correct answer is: ${correctAnswer}`;
        feedbackDiv.style.background = 'rgba(239, 68, 68, 0.1)';
        feedbackDiv.style.color = '#ef4444';
        feedbackDiv.style.borderLeftColor = '#ef4444';
    }
};

function renderStudyFlashcard() {
    if (studyFlashcards.length === 0) return;
    const card = studyFlashcards[studyFlashcardIndex];
    
    function escapeHTML(str) {
        if (!str) return '';
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    studyContainer.innerHTML = `
        <h3 style="color: var(--accent-primary); margin-bottom: 16px; text-align: center;">Interactive Flashcards</h3>
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 250px; width: 100%;">
            <!-- Flip Card Container -->
            <div class="flashcard-container" id="study-flashcard" style="width: 100%; max-width: 460px; height: 200px; margin: 10px auto;">
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
            <div class="flashcard-controls" style="margin-top: 15px;">
                <button class="flashcard-nav-btn" id="study-prev-card-btn" ${studyFlashcardIndex === 0 ? 'disabled' : ''}>
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                <span style="font-size: 14px; font-weight: 600; color: var(--text-secondary);">
                    ${studyFlashcardIndex + 1} of ${studyFlashcards.length}
                </span>
                <button class="flashcard-nav-btn" id="study-next-card-btn" ${studyFlashcardIndex === studyFlashcards.length - 1 ? 'disabled' : ''}>
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
            </div>
        </div>
    `;

    // Flip Card Action
    const cardEl = document.getElementById('study-flashcard');
    if (cardEl) {
        cardEl.addEventListener('click', () => {
            cardEl.classList.toggle('flipped');
        });
    }

    // Navigation actions
    document.getElementById('study-prev-card-btn').addEventListener('click', () => {
        if (studyFlashcardIndex > 0) {
            studyFlashcardIndex--;
            renderStudyFlashcard();
        }
    });

    document.getElementById('study-next-card-btn').addEventListener('click', () => {
        if (studyFlashcardIndex < studyFlashcards.length - 1) {
            studyFlashcardIndex++;
            renderStudyFlashcard();
        }
    });
}
