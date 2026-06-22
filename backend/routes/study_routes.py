from flask import Blueprint, request, jsonify
import sqlite3
import json
from services.study_service import generate_study_material

study_bp = Blueprint('study_bp', __name__)
DB_PATH = 'nexus_reader.db'

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

@study_bp.route('/api/study/generate', methods=['POST'])
def generate_study():
    data = request.json
    api_key = data.get('api_key')
    text = data.get('text')
    document_id = data.get('document_id')
    material_type = data.get('type')
    count = data.get('count', 5)
    difficulty = data.get('difficulty', 'Medium')
    scope = data.get('scope', 'Selection')
    
    if not api_key:
        return jsonify({'success': False, 'error': 'API Key is missing.'}), 401
    if not text:
        return jsonify({'success': False, 'error': 'No text provided for generation.'}), 400
        
    try:
        # Call Gemini via service
        generated_data = generate_study_material(api_key, text, material_type, count, difficulty)
        
        # Save to DB if document_id is provided
        if document_id:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO generated_study_materials 
                (document_id, material_type, difficulty, scope, content)
                VALUES (?, ?, ?, ?, ?)
            ''', (document_id, material_type, difficulty, scope, json.dumps(generated_data)))
            conn.commit()
            conn.close()
            
        return jsonify({
            'success': True,
            'data': generated_data
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@study_bp.route('/api/study/history', methods=['GET'])
def get_study_history():
    document_id = request.args.get('document_id')
    if not document_id:
        return jsonify({'success': False, 'error': 'document_id is required'}), 400
        
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT * FROM generated_study_materials 
            WHERE document_id = ? 
            ORDER BY created_at DESC
        ''', (document_id,))
        
        rows = cursor.fetchall()
        conn.close()
        
        history = []
        for row in rows:
            history.append({
                'id': row['id'],
                'material_type': row['material_type'],
                'difficulty': row['difficulty'],
                'scope': row['scope'],
                'content': json.loads(row['content']),
                'created_at': row['created_at']
            })
            
        return jsonify({'success': True, 'history': history})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
