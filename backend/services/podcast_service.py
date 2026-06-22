import os
import time
import threading
import asyncio
import edge_tts
from google import genai

# Configuration
# __file__ is in backend/services/podcast_service.py
# We want to save to frontend/audio so Flask can serve it statically
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'frontend')
AUDIO_DIR = os.path.join(FRONTEND_DIR, 'audio')
CLEANUP_INTERVAL_SECONDS = 3600 # 1 hour

def init_audio_dir():
    if not os.path.exists(AUDIO_DIR):
        os.makedirs(AUDIO_DIR)

init_audio_dir()

def cleanup_old_audio_files():
    """Background task to clean up old audio files."""
    while True:
        try:
            current_time = time.time()
            if os.path.exists(AUDIO_DIR):
                for filename in os.listdir(AUDIO_DIR):
                    if filename.endswith('.mp3'):
                        file_path = os.path.join(AUDIO_DIR, filename)
                        # Remove files older than 1 hour
                        if os.path.isfile(file_path):
                            creation_time = os.path.getctime(file_path)
                            if (current_time - creation_time) > CLEANUP_INTERVAL_SECONDS:
                                try:
                                    os.remove(file_path)
                                    print(f"Cleaned up old podcast audio: {filename}")
                                except Exception as e:
                                    print(f"Failed to delete {filename}: {e}")
        except Exception as e:
            print(f"Error in podcast audio cleanup loop: {e}")
        
        # Sleep for an hour before checking again
        time.sleep(CLEANUP_INTERVAL_SECONDS)

# Start cleanup thread
cleanup_thread = threading.Thread(target=cleanup_old_audio_files, daemon=True)
cleanup_thread.start()

def generate_podcast_audio(api_key, text, language="English"):
    """
    Generates a podcast script using Gemini, converts it to speech using edge-tts,
    and saves it to the frontend/audio directory.
    Returns the URL path to the generated MP3 file.
    Migrated from deprecated google.generativeai to google.genai SDK.
    """
    client = genai.Client(api_key=api_key)

    # List available models and prefer flash variants for speed
    available_models = []
    for m in client.models.list():
        if hasattr(m, 'name') and 'gemini' in m.name.lower():
            available_models.append(m.name)

    # Sort: prefer 2.5-flash, then 1.5-flash, then other flash, then pro
    preferred_models = sorted(
        available_models,
        key=lambda m: (
            0 if '2.5-flash' in m else
            1 if '1.5-flash' in m else
            2 if 'flash' in m else
            3 if 'pro' in m else 4
        )
    )

    if not preferred_models:
        # Fallback to a known stable model
        preferred_models = ['gemini-1.5-flash']

    system_prompt = (
        "You are an expert podcast script writer. Convert the provided source text into a highly engaging, "
        "conversational, single-host podcast monologue. "
        "The script must be entirely in the requested language. Do not include sound effect notes or character names, "
        "just the pure spoken script. Make it informative, exciting, and accessible. "
        "CRITICAL: Keep the script EXTREMELY short and concise. Summarize the absolute core message in 3-4 sentences maximum (under 60 seconds of speaking time). Do not narrate the whole document."
    )
    
    user_prompt = f"Requested Language: {language}\n\nSource Text:\n{text}"
    
    script_text = ""
    last_error = ""
    
    for model_name in preferred_models:
        try:
            print(f"Attempting podcast generation with model: {model_name}")
            response = client.models.generate_content(
                model=model_name,
                contents=f"{system_prompt}\n\n{user_prompt}"
            )
            script_text = response.text.strip()
            if script_text:
                break
        except Exception as e:
            last_error = str(e)
            print(f"Model {model_name} failed: {last_error}")
            if "429" in last_error or "Quota exceeded" in last_error:
                print(f"Rate limited on {model_name}. Falling back to next model...")
                continue
            else:
                # If it's a different error (e.g. invalid key), fail immediately
                raise ValueError(f"Failed to generate podcast script: {last_error}")
                
    if not script_text:
        raise ValueError(f"All available Gemini models are currently rate-limited or failed. Last error: {last_error}")
        
    # Map language names to premium edge-tts neural voices
    lang_map = {
        'english': 'en-US-ChristopherNeural', # or en-US-AriaNeural
        'tamil': 'ta-IN-PallaviNeural',
        'hindi': 'hi-IN-SwaraNeural',
        'spanish': 'es-ES-ElviraNeural',
        'french': 'fr-FR-DeniseNeural',
        'german': 'de-DE-KatjaNeural',
        'telugu': 'te-IN-ShrutiNeural',
        'malayalam': 'ml-IN-SobhanaNeural',
        'kannada': 'kn-IN-SapnaNeural',
        'bengali': 'bn-IN-TanishaaNeural',
    }
    
    tts_voice = lang_map.get(language.lower(), 'en-US-AriaNeural')
    filename = f"podcast_{int(time.time())}.mp3"
    filepath = os.path.join(AUDIO_DIR, filename)

    async def _generate_audio():
        communicate = edge_tts.Communicate(script_text, tts_voice)
        await communicate.save(filepath)

    try:
        # Run the async edge-tts logic synchronously
        asyncio.run(_generate_audio())
    except Exception as e:
        print(f"edge-tts error: {e}")
        raise ValueError(f"Failed to generate audio file: {str(e)}")
        
    return f"/audio/{filename}"
