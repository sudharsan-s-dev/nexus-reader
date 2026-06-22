/**
 * Notes Editor Component
 * Handles rich text editing and "insert location anchor" (deep link) features
 */

const editor = document.getElementById('notes-editor');
const addAnchorBtn = document.querySelector('.link-anchor-btn');
const toolbarBtns = document.querySelectorAll('.notes-toolbar .icon-btn:not(.link-anchor-btn)');

// Apply basic formatting
toolbarBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        const command = getCommandFromIcon(btn.querySelector('i').className);
        if (command) {
            document.execCommand(command, false, null);
            editor.focus();
        }
    });
});

function getCommandFromIcon(className) {
    if (className.includes('fa-bold')) return 'bold';
    if (className.includes('fa-italic')) return 'italic';
    if (className.includes('fa-list')) return 'insertUnorderedList';
    return null;
}

// Ensure editor content doesn't get messed up with raw divs
editor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        document.execCommand('insertLineBreak');
        e.preventDefault();
    }
});

// Intercept paste to strip messy HTML styling (like white backgrounds) and paste as plain text
editor.addEventListener('paste', (e) => {
    e.preventDefault();
    // Get text from clipboard
    const text = (e.originalEvent || e).clipboardData.getData('text/plain');
    // Insert text safely
    document.execCommand('insertText', false, text);
});

// Deep Link Anchor Logic
addAnchorBtn.addEventListener('click', () => {
    // Calculate current scroll position in the document viewer
    const container = document.getElementById('doc-container');
    const scrollPos = container.scrollTop;
    
    // Find visible page
    const pages = document.querySelectorAll('.pdf-page');
    let visiblePageNum = 1;
    let shortestDist = Number.MAX_VALUE;

    pages.forEach(page => {
        const topDist = Math.abs(page.offsetTop - scrollPos);
        if (topDist < shortestDist) {
            shortestDist = topDist;
            visiblePageNum = page.dataset.pageNum || 1;
        }
    });

    // Create the anchor HTML
    const anchorId = 'anchor-' + Date.now();
    const anchorHTML = `<span class="doc-anchor" contenteditable="false" data-scroll="${scrollPos}" data-page="${visiblePageNum}" title="Click to go to Page ${visiblePageNum}"><i class="fa-solid fa-location-crosshairs"></i> Page ${visiblePageNum}</span>&nbsp;`;
    
    // Insert into editor at caret position
    editor.focus();
    insertHtmlAtCaret(anchorHTML);
    
    attachAnchorListeners();
});

// Helper to insert HTML at cursor
function insertHtmlAtCaret(html) {
    let sel, range;
    if (window.getSelection) {
        sel = window.getSelection();
        if (sel.getRangeAt && sel.rangeCount) {
            range = sel.getRangeAt(0);
            range.deleteContents();
            
            const el = document.createElement("div");
            el.innerHTML = html;
            let frag = document.createDocumentFragment(), node, lastNode;
            while ( (node = el.firstChild) ) {
                lastNode = frag.appendChild(node);
            }
            range.insertNode(frag);
            
            if (lastNode) {
                range = range.cloneRange();
                range.setStartAfter(lastNode);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }
    }
}

// Function to attach click listeners to the anchors inside the editor
function attachAnchorListeners() {
    const anchors = editor.querySelectorAll('.doc-anchor');
    anchors.forEach(anchor => {
        // Remove old listener to avoid duplicates
        anchor.replaceWith(anchor.cloneNode(true));
    });
    
    // Re-select and add listener
    editor.querySelectorAll('.doc-anchor').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            e.preventDefault();
            const scrollPos = parseInt(anchor.dataset.scroll) || 0;
            const container = document.getElementById('doc-container');
            container.scrollTo({
                top: scrollPos,
                behavior: 'smooth'
            });
            
            // Highlight effect on the container to give feedback
            container.style.boxShadow = 'inset 0 0 0 2px var(--accent-primary)';
            setTimeout(() => {
                container.style.boxShadow = '';
            }, 500);
        });
    });
}

// Initial attachment
attachAnchorListeners();

// Re-attach listeners when editor content changes (e.g., pasting notes back)
editor.addEventListener('input', () => {
    // Debounce listener attachment and autosave
    clearTimeout(window.editorTimeout);
    window.editorTimeout = setTimeout(() => {
        attachAnchorListeners();
        if (window.currentDocHash) {
            saveNotes(window.currentDocHash, editor.innerHTML);
        }
    }, 500);
});

async function loadNotes(docHash) {
    const apiBase = window.API_BASE_URL || (typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://localhost:5000');
    try {
        const res = await fetch(`${apiBase}/api/notes/load?document_id=${encodeURIComponent(docHash)}`, { credentials: 'include' });
        if (res.ok) {
            const data = await res.json();
            const defaultNote = `
                <div style="color: var(--text-secondary); padding: 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; margin-bottom: 16px; font-family: var(--font-body);">
                    <h3 style="margin-top: 0; color: var(--text-primary); font-size: 15px; margin-bottom: 12px;"><i class="fa-solid fa-lightbulb" style="color: #eab308; margin-right: 8px;"></i>How to use Notes Effectively</h3>
                    <ul style="padding-left: 20px; line-height: 1.6; font-size: 13px; margin-bottom: 16px;">
                        <li><strong>Format text</strong> using the toolbar buttons above (Bold, Italic, Lists).</li>
                        <li><strong>Deep Links:</strong> Scroll to an important part of your PDF, then click <b><i class="fa-solid fa-link"></i> Add Anchor</b>. It inserts a clickable badge that brings you exactly back to that spot!</li>
                        <li><strong>Auto-save:</strong> Your notes are automatically and securely saved.</li>
                    </ul>
                    <p style="font-size: 12px; font-style: italic; opacity: 0.7; margin-bottom: 0;">(Select and delete this box to start writing your own notes)</p>
                </div><p><br></p>
            `;
            editor.innerHTML = data.content || defaultNote;
            attachAnchorListeners();
        }
    } catch(err) {
        console.error("Failed to load notes from secure workspace:", err);
    }
}

async function saveNotes(docHash, content) {
    const apiBase = window.API_BASE_URL || (typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://localhost:5000');
    try {
        await fetch(`${apiBase}/api/notes/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ document_id: docHash, content: content }),
            credentials: 'include'
        });
    } catch(err) {
        console.error("Failed to autosave notes:", err);
    }
}

document.addEventListener('documentLoaded', () => {
    // Wait for window.currentDocHash to be set by ocr-handler.js
    setTimeout(() => {
        if (window.currentDocHash) {
            loadNotes(window.currentDocHash);
        }
    }, 150);
});
