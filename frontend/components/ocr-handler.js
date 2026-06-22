/**
 * OCR Handler Component
 * Manages document hashing, canvas extraction, communication with backend OCR API, and UI state
 */

window.currentDocHash = null;
let currentNumPages = 0;
let isOcrProcessing = false;

// Listen for document loaded event
document.addEventListener('documentLoaded', async (e) => {
    const { file, numPages, hasTextLayer } = e.detail;
    currentNumPages = numPages;
    
    // Hash the file content for reliable caching
    window.currentDocHash = await hashFile(file);
    
    updateBadge(hasTextLayer);
    
    // Reset OCR UI
    document.getElementById('ocr-progress-text').textContent = 'Ready for Scan';
    const container = document.getElementById('ocr-results-container');
    container.innerHTML = `
        <div class="empty-state sm">
            <i class="fa-solid fa-expand" style="font-size: 32px; color: var(--border-color); margin-bottom: 12px;"></i>
            <p>Click "OCR Scan" to extract text from scanned PDFs or images.</p>
        </div>
    `;
});

function updateBadge(hasTextLayer) {
    const badge = document.getElementById('ocr-status-badge');
    badge.style.display = 'inline-block';
    if (hasTextLayer) {
        badge.textContent = '✓ Text Layer Available';
        badge.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
        badge.style.color = '#10b981';
        badge.style.border = '1px solid rgba(16, 185, 129, 0.25)';
    } else {
        badge.textContent = '⚠ OCR Recommended';
        badge.style.backgroundColor = 'rgba(245, 158, 11, 0.1)';
        badge.style.color = '#f59e0b';
        badge.style.border = '1px solid rgba(245, 158, 11, 0.25)';
    }
}

// Cryptographic hash for document ID
async function hashFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

document.getElementById('ocr-scan-btn').addEventListener('click', async () => {
    if (!window.currentDocHash || isOcrProcessing) return;
    
    isOcrProcessing = true;
    
    // Open OCR Tab
    const tabBtn = document.querySelector('.tab[data-target="ocr-tab"]');
    if (tabBtn) tabBtn.click();
    
    const progressText = document.getElementById('ocr-progress-text');
    const container = document.getElementById('ocr-results-container');
    container.innerHTML = '';
    
    progressText.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Preparing OCR...';
    
    let totalExtracted = 0;
    let totalConfidence = 0;
    let pagesProcessed = 0;
    
    for (let pageNum = 1; pageNum <= currentNumPages; pageNum++) {
        progressText.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Scanning Page ${pageNum} of ${currentNumPages}...`;
        
        let blob;
        if (window.pdfDoc) {
            // Render high-res canvas specifically for OCR (scale 3.0 for max accuracy)
            try {
                const page = await window.pdfDoc.getPage(pageNum);
                const viewport = page.getViewport({ scale: 3.0 });
                const ocrCanvas = document.createElement('canvas');
                ocrCanvas.width = viewport.width;
                ocrCanvas.height = viewport.height;
                const ctx = ocrCanvas.getContext('2d');
                await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                blob = await new Promise(resolve => ocrCanvas.toBlob(resolve, 'image/png', 1.0));
            } catch (err) {
                console.error('High-res render failed, falling back:', err);
                const pageWrapper = document.querySelector(`.pdf-page[data-page-num="${pageNum}"]`);
                if (pageWrapper) {
                    const canvas = pageWrapper.querySelector('canvas');
                    if (canvas) blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                }
            }
        } else {
            // It's an image file
            const pageWrapper = document.querySelector(`.pdf-page[data-page-num="${pageNum}"]`);
            if (!pageWrapper) continue;
            const canvas = pageWrapper.querySelector('canvas');
            if (!canvas) continue;
            blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        }
        
        if (!blob) {
            console.warn(`Could not extract blob for page ${pageNum}`);
            continue;
        }
        
        // Prepare FormData
        const formData = new FormData();
        formData.append('image', blob, `page_${pageNum}.png`);
        formData.append('document_id', window.currentDocHash);
        formData.append('page_number', pageNum);
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/ocr/page`, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            
            if (data.success && data.text) {
                pagesProcessed++;
                const confScore = data.confidence ? Math.round(data.confidence * 100) : 0;
                totalConfidence += confScore;
                
                let warningHtml = '';
                if (confScore > 0 && confScore < 70) {
                    warningHtml = `<span style="color: #f59e0b; font-size: 12px; margin-left: 8px;"><i class="fa-solid fa-triangle-exclamation"></i> Low Confidence (${confScore}%)</span>`;
                } else if (confScore >= 70) {
                    warningHtml = `<span style="color: #10b981; font-size: 12px; margin-left: 8px;"><i class="fa-solid fa-check"></i> ${confScore}%</span>`;
                }

                // Append text to container
                const pageBlock = document.createElement('div');
                pageBlock.style.marginBottom = '24px';
                pageBlock.innerHTML = `
                    <h4 style="color: var(--accent-secondary); margin-bottom: 8px; border-bottom: 1px solid var(--border-color); padding-bottom: 4px; display: flex; align-items: center;">
                        Page ${pageNum} ${warningHtml}
                    </h4>
                    <p style="white-space: pre-wrap;">${data.text}</p>
                `;
                container.appendChild(pageBlock);
                
                // Scroll to bottom
                container.scrollTop = container.scrollHeight;
                totalExtracted += data.text.trim().split(/\s+/).length;
            } else if (data.success && !data.text) {
                const pageBlock = document.createElement('div');
                pageBlock.style.marginBottom = '24px';
                pageBlock.innerHTML = `
                    <h4 style="color: var(--accent-secondary); margin-bottom: 8px; border-bottom: 1px solid var(--border-color); padding-bottom: 4px;">Page ${pageNum}</h4>
                    <p style="color: var(--text-secondary); font-style: italic;">[No text detected]</p>
                `;
                container.appendChild(pageBlock);
            }
        } catch (error) {
            console.error(`Error processing page ${pageNum}:`, error);
        }
    }
    
    // Update Badge to Blue
    const badge = document.getElementById('ocr-status-badge');
    badge.textContent = '✓ OCR Processed';
    badge.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
    badge.style.color = '#3b82f6';
    badge.style.border = '1px solid rgba(59, 130, 246, 0.25)';
    
    const finalAvgConf = pagesProcessed > 0 ? Math.round(totalConfidence / pagesProcessed) : 0;
    progressText.innerHTML = `<strong>OCR Complete</strong> - Scanned: ${currentNumPages} pages | Words: ${totalExtracted} | Avg Confidence: ${finalAvgConf}%`;
    isOcrProcessing = false;
});

document.getElementById('ocr-copy-btn').addEventListener('click', () => {
    const container = document.getElementById('ocr-results-container');
    const text = container.innerText;
    navigator.clipboard.writeText(text).then(() => {
        alert('OCR Text copied to clipboard!');
    });
});
