import easyocr
import sqlite3
import os
import io
import re
import json
from PIL import Image
from services.image_processor import preprocess_for_ocr
from spellchecker import SpellChecker
# Lazy initialization variables to prevent Gunicorn timeout on Render during startup
_reader = None
_spell = None
def get_reader():
    global _reader
    if _reader is None:
        print("Initializing EasyOCR... (This may take a moment)")
        _reader = easyocr.Reader(['en'], verbose=False)
        print("EasyOCR initialized successfully!")
    return _reader
def get_spellchecker():
    global _spell
    if _spell is None:
        from spellchecker import SpellChecker
        _spell = SpellChecker()
    return _spell
DB_PATH = 'nexus_reader.db'
def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn
def post_ocr_cleanup(raw_text):
    """
    Cleans up raw OCR output:
    1. Merges broken lines that belong to the same paragraph
    2. Smart formatting for numbered lists and colons
    3. AI Cleanup: Lightweight spell correction
    """
    # Merge broken lines: if a line doesn't end with a punctuation mark, merge it with the next
    cleaned = re.sub(r'([^\.\?!:\-])\n', r'\1 ', raw_text)
    
    # Formatting: Add newlines before numbered list items (e.g. " 5. ")
    cleaned = re.sub(r'(?<!\n)\s+(\d+\.\s)', r'\n\n\1', cleaned)
    
    # Formatting: Add newlines after colons followed by a space
    cleaned = re.sub(r':\s+([A-Z0-9])', r':\n\n\1', cleaned)
    
    # Formatting: Ensure sentences that look like standalone points are separated
    # Not overly aggressive to avoid breaking real paragraphs, just typical bullet-like cases
    
    # Remove excessive newlines
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
    
    # AI Cleanup: Lightweight spell correction while preserving whitespaces/newlines
    def correct_word(match):
        word = match.group(0)
        spell = get_spellchecker()
        corr = spell.correction(word)
        return corr if corr else word
        
    cleaned = re.sub(r'\b[a-zA-Z]{5,}\b', correct_word, cleaned)
    
    return cleaned.strip()
def process_image(image_bytes):
    """
    Process a single image, returning extracted text and confidence.
    """
    try:
        # Preprocess image with OpenCV
        processed_bytes = preprocess_for_ocr(image_bytes)
        
        # Read text with EasyOCR (paragraph=False to get confidence)
        # Optimized parameters for scanned documents
        reader = get_reader()
        results = reader.readtext(processed_bytes, text_threshold=0.7, low_text=0.4, mag_ratio=1.5, paragraph=False)
        
        if not results:
            return "", 0.0
            
        raw_text_parts = []
        total_confidence = 0.0
        
        for bbox, text, conf in results:
            raw_text_parts.append(text)
            total_confidence += conf
            
        raw_text = "\n".join(raw_text_parts)
        avg_confidence = total_confidence / len(results) if len(results) > 0 else 0.0
        
        # Apply Post-OCR Cleanup
        cleaned_text = post_ocr_cleanup(raw_text)
        
        return cleaned_text, avg_confidence
        
    except Exception as e:
        print(f"OCR Error: {str(e)}")
        raise e
def process_pdf_page(document_id, page_number, image_bytes):
    """
    Check cache for a PDF page, if not found, run OCR and cache it.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check cache
    cursor.execute('''
        SELECT extracted_text, confidence_score FROM ocr_documents 
        WHERE document_id = ? AND page_number = ?
    ''', (document_id, page_number))
    
    row = cursor.fetchone()
    
    if row:
        conn.close()
        # Return cached text, confidence, and True (cached flag)
        return row['extracted_text'], row['confidence_score'], True
        
    # If not cached, run OCR
    text, confidence = process_image(image_bytes)
    
    # Save to cache
    metadata = json.dumps({"engine": "EasyOCR", "preprocessed": True})
    cursor.execute('''
        INSERT INTO ocr_documents (document_id, page_number, extracted_text, raw_text, confidence_score, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (document_id, page_number, text, text, confidence, metadata))
    
    conn.commit()
    conn.close()
    
    return text, confidence, False
