/**
 * Document Viewer Component
 * Handles PDF loading, rendering, navigation, and text selection
 */

const docContainer = document.getElementById('doc-container');
const fileUpload = document.getElementById('file-upload');
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const zoomLevelSpan = document.querySelector('.zoom-level');

let currentPdf = null;
let currentScale = 1.0;
let pdfDoc = null;
window.currentFile = null; // To keep track of the loaded file for hashing
window.hasTextLayer = false;

// Handle file upload
fileUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 1. Try to upload to backend secure workspace if logged in
    let backendStored = false;
    let newUrlStr = '';
    try {
        const apiBase = window.API_BASE_URL || (typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://localhost:5000');
        const formData = new FormData();
        formData.append('file', file);
        
        async function attemptUpload(formDataToUpload) {
            try {
                const res = await fetch(`${apiBase}/api/files/upload`, {
                    method: 'POST',
                    body: formDataToUpload,
                    credentials: 'include'
                });
                const data = await res.json();
                
                if (res.status === 409 && data.status === 'warning') {
                    // Use NexusUI to prompt user (ensure NexusUI is available or fallback to native confirm)
                    const confirmFn = (typeof NexusUI !== 'undefined') ? NexusUI.confirm.bind(NexusUI) : async (msg) => window.confirm(msg);
                    if (await confirmFn(data.message)) {
                        formDataToUpload.append('force_eviction', 'true');
                        return await attemptUpload(formDataToUpload);
                    } else {
                        return null; // Cancelled
                    }
                } else if (res.ok) {
                    return data;
                } else {
                    console.error("Backend upload returned error:", data.error);
                    return null;
                }
            } catch (err) {
                console.error("Network error during backend upload:", err);
                return null;
            }
        }

        const data = await attemptUpload(formData);
        
        if (data && data.file) {
            const newUrl = new URL(window.location);
            newUrl.searchParams.delete('doc');
            newUrl.searchParams.delete('upload');
            newUrl.searchParams.set('url', data.file.file_path_or_url);
            newUrl.searchParams.set('name', data.file.file_name);
            window.history.pushState({ path: newUrl.href }, '', newUrl.href);
            newUrlStr = newUrl.href;
            backendStored = true;
        }
    } catch(err) {
        console.error("Backend secure upload failed, falling back to local history:", err);
    }

    // 2. Local fallback if backend upload was skipped or failed
    if (!backendStored) {
        try {
            if (window.NexusStorage) {
                const docId = await window.NexusStorage.saveDocument(file);
                const newUrl = new URL(window.location);
                newUrl.searchParams.delete('upload');
                newUrl.searchParams.set('doc', docId);
                window.history.pushState({ path: newUrl.href }, '', newUrl.href);
            }
        } catch(err) {
            console.error("Failed to save to local history", err);
        }
    }

    if (file.type === 'application/pdf') {
        renderPdf(file);
    } else if (file.name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        renderDocx(file);
    } else if (file.type.startsWith('image/')) {
        renderImage(file);
    } else {
        alert('Only PDF, DOCX, and Image files are supported!');
    }
});

async function renderImage(file) {
    pdfDoc = null; // Clear previous PDF
    window.hasTextLayer = false;
    window.currentFile = file;
    
    docContainer.innerHTML = '';
    
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.style.maxWidth = '100%';
    img.style.boxShadow = 'var(--shadow-md)';
    img.style.marginBottom = '24px';
    
    const pageWrapper = document.createElement('div');
    pageWrapper.className = 'pdf-page page';
    pageWrapper.dataset.pageNum = 1;
    pageWrapper.style.position = 'relative';
    pageWrapper.style.textAlign = 'center';
    
    // Hidden canvas for OCR extraction
    const canvas = document.createElement('canvas');
    canvas.style.display = 'none'; 
    const ctx = canvas.getContext('2d');
    
    img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);
        
        document.dispatchEvent(new CustomEvent('documentLoaded', {
            detail: { file: file, numPages: 1, hasTextLayer: false }
        }));
    };
    
    pageWrapper.appendChild(img);
    pageWrapper.appendChild(canvas);
    docContainer.appendChild(pageWrapper);
}

async function renderDocx(file) {
    pdfDoc = null; // Clear previous PDF
    window.hasTextLayer = true; // Native text layer!
    window.currentFile = file;
    
    docContainer.innerHTML = '<div style="padding: 24px; text-align: center;"><i class="fa-solid fa-circle-notch fa-spin"></i> Converting DOCX...</div>';
    
    try {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
        
        docContainer.innerHTML = '';
        
        const pageWrapper = document.createElement('div');
        pageWrapper.className = 'pdf-page page docx-page';
        pageWrapper.dataset.pageNum = 1;
        
        // Add basic padding and professional typography for docx content
        pageWrapper.style.padding = '40px 60px';
        pageWrapper.style.textAlign = 'left';
        pageWrapper.style.lineHeight = '1.8';
        pageWrapper.style.fontSize = '16px';
        pageWrapper.style.backgroundColor = 'var(--surface-color)';
        pageWrapper.style.color = 'var(--text-color)';
        
        pageWrapper.innerHTML = result.value; // The generated HTML
        docContainer.appendChild(pageWrapper);
        
        // Update OCR Badge
        const badge = document.getElementById('ocr-status-badge');
        if (badge) {
            badge.textContent = 'Native Text';
            badge.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
            badge.style.color = '#10b981';
            badge.style.border = '1px solid rgba(16, 185, 129, 0.25)';
        }
        
        document.dispatchEvent(new CustomEvent('documentLoaded', {
            detail: { file: file, numPages: 1, hasTextLayer: true }
        }));
        
    } catch (err) {
        console.error("Mammoth error:", err);
        docContainer.innerHTML = '<div style="padding: 24px; color: red;">Failed to read DOCX file.</div>';
    }
}

async function renderPdf(file) {
    try {
        // Clear empty state and loading
        docContainer.innerHTML = '<div style="padding: 24px; text-align: center;">Loading document...</div>';
        
        // Convert file to ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        
        // Load PDF using pdf.js
        pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        window.pdfDoc = pdfDoc;
        
        // Clear container completely
        docContainer.innerHTML = '';
        window.hasTextLayer = false;
        window.currentFile = file;
        
        // Render all pages (lazy loading can be added for large PDFs)
        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
            await renderPage(pageNum);
        }
        
        // Dispatch event when done
        document.dispatchEvent(new CustomEvent('documentLoaded', {
            detail: { file: file, numPages: pdfDoc.numPages, hasTextLayer: window.hasTextLayer }
        }));
        
    } catch (error) {
        console.error('Error loading PDF:', error);
        docContainer.innerHTML = `<div class="empty-state"><h3>Error Loading Document</h3><p>${error.message}</p></div>`;
    }
}

async function renderPage(pageNum) {
    if (!pdfDoc) return;
    
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: currentScale });

    // Create wrapper for the page
    const pageWrapper = document.createElement('div');
    pageWrapper.className = 'pdf-page page'; // added 'page' class which pdf_viewer.css uses
    pageWrapper.style.position = 'relative';
    pageWrapper.style.marginBottom = '24px';
    pageWrapper.style.boxShadow = 'var(--shadow-md)';
    pageWrapper.dataset.pageNum = pageNum;
    // CRITICAL: Explicitly constrain the wrapper to the viewport dimensions
    pageWrapper.style.width = `${viewport.width}px`;
    pageWrapper.style.height = `${viewport.height}px`;

    // Create canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    canvas.style.display = 'block';
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    
    // Create text layer
    const textLayer = document.createElement('div');
    textLayer.className = 'textLayer';
    textLayer.style.width = `${viewport.width}px`;
    textLayer.style.height = `${viewport.height}px`;
    // Supply CSS variable expected by pdf_viewer.min.css in v3.x
    textLayer.style.setProperty('--scale-factor', viewport.scale);

    pageWrapper.appendChild(canvas);
    pageWrapper.appendChild(textLayer);
    docContainer.appendChild(pageWrapper);

    // Render Canvas
    const renderContext = {
        canvasContext: ctx,
        viewport: viewport
    };

    await page.render(renderContext).promise;

    // Render Text Layer
    const textContent = await page.getTextContent();
    if (textContent.items.length > 0) {
        window.hasTextLayer = true;
    }
    
    pdfjsLib.renderTextLayer({
        textContentSource: textContent,
        container: textLayer,
        viewport: viewport,
        textDivs: []
    });
}

// Zoom functionality (rudimentary: re-renders)
zoomInBtn.addEventListener('click', () => {
    currentScale += 0.2;
    updateZoom();
});

zoomOutBtn.addEventListener('click', () => {
    if (currentScale > 0.4) {
        currentScale -= 0.2;
        updateZoom();
    }
});

function updateZoom() {
    zoomLevelSpan.textContent = Math.round(currentScale * 100) + '%';
    if (pdfDoc) {
        // Simple re-render logic. Could be optimized.
        const file = window.currentFile;
        if (file) renderPdf(file);
    }
}

function getMimeTypeFromName(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'pdf') return 'application/pdf';
    if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (ext === 'png') return 'image/png';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    return '';
}

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const docId = params.get('doc');
    const docUrl = params.get('url');
    const docName = params.get('name') || 'Document';

    if (docUrl) {
        docContainer.innerHTML = '<div style="padding: 24px; text-align: center;"><i class="fa-solid fa-circle-notch fa-spin"></i> Downloading document from secure workspace...</div>';
        try {
            const apiBase = window.API_BASE_URL || (typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://localhost:5000');
            const targetUrl = docUrl.startsWith('http') ? docUrl : (apiBase + docUrl);
            
            const response = await fetch(targetUrl, { credentials: 'include' });
            if (!response.ok) {
                throw new Error(`Failed to fetch secure file: ${response.status} ${response.statusText}`);
            }
            const blob = await response.blob();
            const mimeType = blob.type || getMimeTypeFromName(docName);
            const file = new File([blob], docName, { type: mimeType });
            
            if (mimeType === 'application/pdf' || docName.toLowerCase().endsWith('.pdf')) {
                renderPdf(file);
            } else if (docName.toLowerCase().endsWith('.docx') || mimeType.includes('wordprocessingml')) {
                renderDocx(file);
            } else if (mimeType.startsWith('image/')) {
                renderImage(file);
            } else {
                renderPdf(file);
            }
        } catch(err) {
            console.error("Failed to load document from secure workspace URL", err);
            docContainer.innerHTML = `<div class="empty-state"><h3>Access Denied or Error Loading File</h3><p>${err.message}</p></div>`;
        }
    } else if (docId && window.NexusStorage) {
        try {
            const file = await window.NexusStorage.getDocument(docId);
            if (file) {
                if (file.type === 'application/pdf') {
                    renderPdf(file);
                } else if (file.name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                    renderDocx(file);
                } else if (file.type.startsWith('image/')) {
                    renderImage(file);
                }
            } else {
                console.warn("Document not found in local history.");
            }
        } catch(err) {
            console.error("Failed to load document", err);
        }
    }

    // Trigger file input dialog if page is loaded with request to upload
    if (params.get('upload') === 'true' && fileUpload) {
        fileUpload.click();
    }
});
