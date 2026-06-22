from flask import Blueprint, request, jsonify
from services.ocr_service import process_image, process_pdf_page

ocr_bp = Blueprint('ocr', __name__)

@ocr_bp.route('/api/ocr/image', methods=['POST'])
def ocr_image():
    if 'image' not in request.files:
        return jsonify({'success': False, 'error': 'No image provided'}), 400
    
    file = request.files['image']
    if file.filename == '':
        return jsonify({'success': False, 'error': 'No selected file'}), 400

    try:
        image_bytes = file.read()
        text, confidence = process_image(image_bytes)
        return jsonify({
            'success': True,
            'text': text,
            'confidence': confidence
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@ocr_bp.route('/api/ocr/page', methods=['POST'])
def ocr_pdf_page():
    if 'image' not in request.files:
        return jsonify({'success': False, 'error': 'No image provided'}), 400
    
    document_id = request.form.get('document_id')
    page_number = request.form.get('page_number')
    
    if not document_id or not page_number:
        return jsonify({'success': False, 'error': 'document_id and page_number are required'}), 400
        
    try:
        page_number = int(page_number)
    except ValueError:
        return jsonify({'success': False, 'error': 'page_number must be an integer'}), 400

    file = request.files['image']
    
    try:
        image_bytes = file.read()
        text, confidence, cached = process_pdf_page(document_id, page_number, image_bytes)
        return jsonify({
            'success': True,
            'page': page_number,
            'text': text,
            'confidence': confidence,
            'cached': cached
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
