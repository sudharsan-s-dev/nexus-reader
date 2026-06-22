from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import requests
import os
import time
import threading
from deep_translator import GoogleTranslator
from deep_translator.exceptions import (
    TooManyRequests as TranslateTooManyRequests,
    RequestError as TranslateRequestError,
    ServerException as TranslateServerException,
    TranslationNotFound,
    NotValidLength,
    LanguageNotSupportedException,
)

# -------------------------------------------------------------------
# Simple TTL In-Memory Cache to reduce external API load under concurrency
# Prevents repeated identical queries from hammering external APIs
# -------------------------------------------------------------------
_cache = {}
_cache_lock = threading.Lock()
CACHE_TTL_SECONDS = 300  # Cache results for 5 minutes

def _cache_get(key):
    with _cache_lock:
        entry = _cache.get(key)
        if entry and (time.time() - entry['ts']) < CACHE_TTL_SECONDS:
            return entry['val']
    return None

def _cache_set(key, value):
    with _cache_lock:
        _cache[key] = {'val': value, 'ts': time.time()}
# Serve static files from the frontend folder
app = Flask(__name__, static_folder='../frontend', static_url_path='/')
# Enable CORS so the vanilla HTML frontend can make requests with credentials
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:8000", "http://127.0.0.1:8000", "http://localhost:5000", "http://127.0.0.1:5000"]}}, supports_credentials=True)
DB_PATH = 'nexus_reader.db'
def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        # Ensure tables exist
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT,
                document_name TEXT
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS ocr_documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id TEXT,
                page_number INTEGER,
                extracted_text TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Schema Migrations
        try:
            cursor.execute('ALTER TABLE ocr_documents ADD COLUMN raw_text TEXT')
        except sqlite3.OperationalError:
            pass # Column already exists
            
        try:
            cursor.execute('ALTER TABLE ocr_documents ADD COLUMN confidence_score REAL')
        except sqlite3.OperationalError:
            pass
            
        try:
            cursor.execute('ALTER TABLE ocr_documents ADD COLUMN metadata TEXT')
        except sqlite3.OperationalError:
            pass
            
        # New table for Study Guide
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS generated_study_materials (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id TEXT,
                material_type TEXT,
                difficulty TEXT,
                scope TEXT,
                content TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Authentication and User File tables
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                email TEXT UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_otps (
                email TEXT,
                otp_hash TEXT,
                expires_at TIMESTAMP,
                is_verified INTEGER DEFAULT 0
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_files (
                file_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                file_name TEXT,
                file_path_or_url TEXT,
                file_size INTEGER,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_notes (
                user_id TEXT,
                document_id TEXT,
                content TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, document_id),
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
        ''')
            
        conn.commit()
init_db()
from routes.ocr_routes import ocr_bp
from routes.study_routes import study_bp
from routes.auth_routes import auth_bp
from routes.file_routes import file_bp
app.register_blueprint(ocr_bp)
app.register_blueprint(study_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(file_bp)
@app.route('/')
def serve_frontend():
    return app.send_static_file('index.html')
@app.route('/api/meaning', methods=['GET'])
def get_meaning():
    word = request.args.get('word', '').strip()
    if not word:
        return jsonify({'error': 'Word is required'}), 400

    # Check cache first to avoid hammering external API under load
    cache_key = f'meaning:{word.lower()}'
    cached = _cache_get(cache_key)
    if cached:
        return jsonify(cached)

    try:
        # Bug fix: added timeout=8 to prevent 22s hangs under load
        response = requests.get(
            f'https://api.dictionaryapi.dev/api/v2/entries/en/{word}',
            timeout=8
        )
        if response.status_code == 200:
            data = response.json()
            meaning = data[0]['meanings'][0]['definitions'][0]['definition']
            result = {'meaning': meaning}
            _cache_set(cache_key, result)
            return jsonify(result)
        elif response.status_code == 429:
            return jsonify({'error': 'Dictionary API rate limit reached. Please try again shortly.'}), 429
        else:
            return jsonify({'meaning': 'Definition not found.'}), 404
    except requests.exceptions.Timeout:
        return jsonify({'error': 'Dictionary API timed out. Please try again.'}), 504
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/explain', methods=['POST'])
def explain_simply():
    data = request.json
    text = data.get('text', '')

    # Mock AI explanation
    explanation = f"Here is a simple explanation of what you highlighted: The concept '{text[:40]}...' fundamentally means that this process helps simplify complex information. (Note: This is a simulated AI response. Connect a real API key for production.)"

    return jsonify({'explanation': explanation})


@app.route('/api/translate', methods=['POST'])
def translate():
    data = request.json
    text = data.get('text', '')
    target_lang = data.get('lang', 'es')  # Default to Spanish

    if not text:
        return jsonify({'error': 'Text is required'}), 400

    # Check cache first — repeated identical translations don't need external API calls
    cache_key = f'translate:{target_lang}:{text[:200]}'
    cached = _cache_get(cache_key)
    if cached:
        return jsonify(cached)

    try:
        translated = GoogleTranslator(source='auto', target=target_lang).translate(text)
        result = {'translation': translated}
        _cache_set(cache_key, result)
        return jsonify(result)
    except TranslateTooManyRequests:
        return jsonify({'error': 'Translation service is temporarily busy. Please try again in a moment.'}), 429
    except TranslateServerException as e:
        return jsonify({'error': f'Translation server error: {str(e)}'}), 503
    except TranslateRequestError as e:
        return jsonify({'error': f'Translation request failed: {str(e)}'}), 503
    except TranslationNotFound:
        return jsonify({'error': 'Translation not found for the provided text.'}), 404
    except LanguageNotSupportedException:
        return jsonify({'error': f'Language "{target_lang}" is not supported.'}), 400
    except NotValidLength:
        return jsonify({'error': 'Text is too long or too short for translation.'}), 400
    except Exception as e:
        err_msg = str(e)
        if 'timeout' in err_msg.lower() or 'timed out' in err_msg.lower():
            return jsonify({'error': 'Translation service timed out. Please try again.'}), 504
        return jsonify({'error': f'Translation failed: {err_msg}'}), 500
@app.route('/api/wikipedia', methods=['GET'])
def fetch_wikipedia():
    import urllib.parse
    query = request.args.get('query', '').strip()
    if not query:
        return jsonify({'error': 'Query required'}), 400

    # Check cache first — Wikipedia queries are great candidates for caching
    cache_key = f'wikipedia:{query.lower().strip()}'
    cached = _cache_get(cache_key)
    if cached:
        return jsonify(cached)

    # Wikipedia API requires a descriptive User-Agent per their Terms of Service
    # https://www.mediawiki.org/wiki/API:Etiquette
    wiki_headers = {
        'User-Agent': 'NexusReader/1.0 (AI Smart Document Reader; https://github.com/nexus-reader) python-requests'
    }

    try:
        # First try a direct title lookup with proper URL encoding
        title = urllib.parse.quote(query.replace(' ', '_'))
        url = f'https://en.wikipedia.org/api/rest_v1/page/summary/{title}'
        response = requests.get(url, timeout=8, headers=wiki_headers)

        if response.status_code == 200:
            data = response.json()
            # Disambiguation pages have type='disambiguation' and no useful extract
            if data.get('type') == 'disambiguation' or not data.get('extract'):
                # Fall through to search fallback below
                pass
            else:
                result = {
                    'title': data.get('title'),
                    'summary': data.get('extract', 'No summary found.'),
                    'url': data.get('content_urls', {}).get('desktop', {}).get('page', '')
                }
                _cache_set(cache_key, result)
                return jsonify(result)

        # Fallback: use Wikipedia's OpenSearch API to find the best matching article
        search_url = 'https://en.wikipedia.org/w/api.php'
        search_params = {
            'action': 'opensearch',
            'search': query,
            'limit': 1,
            'namespace': 0,
            'format': 'json'
        }
        search_resp = requests.get(search_url, params=search_params, timeout=8, headers=wiki_headers)
        if search_resp.status_code == 200:
            search_data = search_resp.json()
            # opensearch returns [query, [titles], [descriptions], [urls]]
            titles = search_data[1] if len(search_data) > 1 else []
            if titles:
                best_title = urllib.parse.quote(titles[0].replace(' ', '_'))
                fallback_url = f'https://en.wikipedia.org/api/rest_v1/page/summary/{best_title}'
                fallback_resp = requests.get(fallback_url, timeout=8, headers=wiki_headers)
                if fallback_resp.status_code == 200:
                    data = fallback_resp.json()
                    result = {
                        'title': data.get('title'),
                        'summary': data.get('extract', 'No summary found.'),
                        'url': data.get('content_urls', {}).get('desktop', {}).get('page', '')
                    }
                    _cache_set(cache_key, result)
                    return jsonify(result)

        return jsonify({'error': 'Not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

from services.podcast_service import generate_podcast_audio

@app.route('/api/generate_podcast', methods=['POST'])
def generate_podcast_route():
    data = request.json
    api_key = data.get('api_key')
    text = data.get('text')
    language = data.get('language', 'English')
    
    if not api_key:
        return jsonify({'success': False, 'error': 'API Key is required.'}), 401
    if not text:
        return jsonify({'success': False, 'error': 'Document text is required.'}), 400
        
    try:
        audio_url = generate_podcast_audio(api_key, text, language)
        return jsonify({'success': True, 'audio_url': audio_url})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
