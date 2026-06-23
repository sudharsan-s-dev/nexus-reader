from flask import Blueprint, request, jsonify, g
import sqlite3
import os
from werkzeug.utils import secure_filename
from routes.auth_routes import login_required

file_bp = Blueprint('files', __name__)
DB_PATH = os.environ.get('DB_PATH', os.path.abspath(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'storage', 'nexus_reader.db')))
UPLOAD_BASE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'storage', 'uploads')

MAX_FILE_LIMIT = 10

# Helper to ensure user storage path exists and returns it safely
def get_user_storage_path(user_id):
    # Sanitize user_id to prevent path traversal
    safe_user_id = secure_filename(user_id)
    user_dir = os.path.join(UPLOAD_BASE_DIR, safe_user_id)
    if not os.path.exists(user_dir):
        os.makedirs(user_dir, exist_ok=True)
    return user_dir

@file_bp.route('/api/files/upload', methods=['POST'])
@login_required
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part found in request'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    # Sanitize the file name to prevent directory traversal
    filename = secure_filename(file.filename)
    user_id = g.user_id

    # Create safe user-specific storage path
    user_dir = get_user_storage_path(user_id)
    file_path = os.path.join(user_dir, filename)

    try:
        # Pre-Upload Evaluation: Check active file count and perform FIFO cleanup
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Count current files for the user
            cursor.execute('SELECT COUNT(*) as count FROM user_files WHERE user_id = ?', (user_id,))
            row = cursor.fetchone()
            current_count = row['count'] if row else 0
            
            # FIFO Eviction Loop
            if current_count >= MAX_FILE_LIMIT:
                force_eviction = request.form.get('force_eviction') == 'true'
                
                # Find the oldest file (order by uploaded_at ascending or file_id ascending)
                cursor.execute('''
                    SELECT file_id, file_name 
                    FROM user_files 
                    WHERE user_id = ? 
                    ORDER BY uploaded_at ASC, file_id ASC 
                    LIMIT 1
                ''', (user_id,))
                oldest_file = cursor.fetchone()
                
                if oldest_file:
                    if not force_eviction:
                        return jsonify({
                            'status': 'warning',
                            'message': f"Upload limit reached ({MAX_FILE_LIMIT} files). Uploading this file will delete your oldest document: '{oldest_file['file_name']}'. Do you wish to proceed?",
                            'oldest_file': oldest_file['file_name']
                        }), 409
                        
                    old_file_id = oldest_file['file_id']
                    old_file_name = oldest_file['file_name']
                    old_physical_path = os.path.join(user_dir, old_file_name)
                    
                    # Defensively delete physical file
                    try:
                        if os.path.exists(old_physical_path):
                            os.remove(old_physical_path)
                    except OSError as oe:
                        print(f"Warning: Failed to physically delete {old_physical_path}: {oe}")
                        # Continue anyway to ensure database is cleared
                        
                    # Delete the database record
                    cursor.execute('DELETE FROM user_files WHERE file_id = ?', (old_file_id,))
                    # Also clean up any generated notes associated with the old file's document hash if needed
                    # Not strictly requested, but good practice. We'll stick strictly to user_files for now.
                    conn.commit()
                    
        # Save new file to filesystem
        file.save(file_path)
        file_size = os.path.getsize(file_path)

        # Write new entry to database
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO user_files (user_id, file_name, file_path_or_url, file_size)
                VALUES (?, ?, ?, ?)
            ''', (user_id, filename, '', file_size))
            file_id = cursor.lastrowid
            
            # Now set the actual secure download path using the inserted ID
            relative_path_or_url = f"/api/files/download/{file_id}"
            cursor.execute('UPDATE user_files SET file_path_or_url = ? WHERE file_id = ?', (relative_path_or_url, file_id))
            conn.commit()

        return jsonify({
            'message': 'File uploaded successfully. Storage cap maintained.',
            'file': {
                'file_id': file_id,
                'file_name': filename,
                'file_size': file_size,
                'file_path_or_url': relative_path_or_url
            }
        }), 201

    except Exception as e:
        return jsonify({'error': f'Failed to upload file: {str(e)}'}), 500

@file_bp.route('/api/files/list', methods=['GET'])
@login_required
def list_files():
    user_id = g.user_id

    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('''
                SELECT file_id, file_name, file_path_or_url, file_size, uploaded_at 
                FROM user_files 
                WHERE user_id = ? 
                ORDER BY uploaded_at DESC
            ''', (user_id,))
            rows = cursor.fetchall()

            files = []
            for r in rows:
                files.append({
                    'file_id': r['file_id'],
                    'file_name': r['file_name'],
                    'file_size': r['file_size'],
                    'file_path_or_url': r['file_path_or_url'],
                    'uploaded_at': r['uploaded_at']
                })

        return jsonify({'files': files}), 200

    except Exception as e:
        return jsonify({'error': f'Failed to list files: {str(e)}'}), 500

@file_bp.route('/api/files/delete/<int:file_id>', methods=['DELETE'])
@login_required
def delete_file(file_id):
    user_id = g.user_id
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Check if file belongs to user
            cursor.execute('SELECT file_name FROM user_files WHERE file_id = ? AND user_id = ?', (file_id, user_id))
            file_record = cursor.fetchone()
            
            if not file_record:
                return jsonify({'error': 'File not found or unauthorized'}), 404
                
            file_name = file_record['file_name']
            user_dir = get_user_storage_path(user_id)
            physical_path = os.path.join(user_dir, file_name)
            
            # Delete physical file
            try:
                if os.path.exists(physical_path):
                    os.remove(physical_path)
            except OSError as oe:
                print(f"Warning: Failed to physically delete {physical_path}: {oe}")
                
            # Delete database record
            cursor.execute('DELETE FROM user_files WHERE file_id = ?', (file_id,))
            conn.commit()
            
        return jsonify({'message': 'File deleted successfully'}), 200
        
    except Exception as e:
        return jsonify({'error': f'Failed to delete file: {str(e)}'}), 500

@file_bp.route('/api/files/download/<int:file_id>', methods=['GET'])
@login_required
def download_file(file_id):
    from flask import send_from_directory
    user_id = g.user_id
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('SELECT file_name, user_id FROM user_files WHERE file_id = ?', (file_id,))
            row = cursor.fetchone()

            if not row:
                return jsonify({'error': 'File not found'}), 404
            
            # Strict isolation check
            if row['user_id'] != user_id:
                return jsonify({'error': 'Access denied: Unauthorized access to this file'}), 403

            filename = row['file_name']
            user_dir = get_user_storage_path(user_id)
            
            return send_from_directory(user_dir, filename, as_attachment=False)
    except Exception as e:
        return jsonify({'error': f'Failed to download file: {str(e)}'}), 500

@file_bp.route('/api/notes/save', methods=['POST'])
@login_required
def save_notes():
    data = request.json or {}
    document_id = data.get('document_id', '').strip()
    content = data.get('content', '')

    if not document_id:
        return jsonify({'error': 'document_id is required'}), 400

    user_id = g.user_id

    try:
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO user_notes (user_id, document_id, content, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id, document_id) DO UPDATE SET
                    content = excluded.content,
                    updated_at = CURRENT_TIMESTAMP
            ''', (user_id, document_id, content))
            conn.commit()
        return jsonify({'message': 'Notes saved successfully'}), 200
    except Exception as e:
        return jsonify({'error': f'Failed to save notes: {str(e)}'}), 500

@file_bp.route('/api/notes/load', methods=['GET'])
@login_required
def load_notes():
    document_id = request.args.get('document_id', '').strip()

    if not document_id:
        return jsonify({'error': 'document_id is required'}), 400

    user_id = g.user_id

    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('''
                SELECT content FROM user_notes 
                WHERE user_id = ? AND document_id = ?
            ''', (user_id, document_id))
            row = cursor.fetchone()

            content = row['content'] if row else ''
        return jsonify({'content': content}), 200
    except Exception as e:
        return jsonify({'error': f'Failed to load notes: {str(e)}'}), 500
