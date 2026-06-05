import os
import uuid
import json
import requests
from flask import Flask, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

# Import audio processing functions
from voice_processor import pitch_shift_and_stretch, enhance_audio

# Load environment variables
load_dotenv()

app = Flask(__name__, static_folder='static', static_url_path='')

# Configuration
UPLOAD_FOLDER = os.path.join('static', 'uploads')
PROCESSED_FOLDER = os.path.join('static', 'processed')
CLONED_VOICES_FILE = 'cloned_voices.json'

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['PROCESSED_FOLDER'] = PROCESSED_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload size

# Create directories if they don't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(PROCESSED_FOLDER, exist_ok=True)

# Helper: load cloned voices list
def load_cloned_voices():
    if os.path.exists(CLONED_VOICES_FILE):
        try:
            with open(CLONED_VOICES_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            return []
    return []

# Helper: save cloned voices list
def save_cloned_voices(voices):
    try:
        with open(CLONED_VOICES_FILE, 'w') as f:
            json.dump(voices, f, indent=4)
    except Exception as e:
        print(f"Failed to save cloned voices: {e}")

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/api/voices', methods=['GET'])
def get_voices():
    """Retrieve available voices (default + cloned)."""
    # Standard ElevenLabs and OpenAI voices
    default_voices = [
        {"id": "21m00Tcm4TlvDq8ikWAM", "name": "Rachel (Female/Calm)", "provider": "elevenlabs"},
        {"id": "AZnzlk1XvdvUeBnXmlld", "name": "Domi (Female/Energetic)", "provider": "elevenlabs"},
        {"id": "EXAVITQu4vr4xnSDxMaL", "name": "Bella (Female/Whisper)", "provider": "elevenlabs"},
        {"id": "ErXwobaYiN019PkySvjV", "name": "Antoni (Male/Narrator)", "provider": "elevenlabs"},
        {"id": "TxGEqn7nUaNZpxGP9DkZ", "name": "Liam (Male/Professional)", "provider": "elevenlabs"},
        {"id": "alloy", "name": "Alloy (Neutral/Balanced)", "provider": "openai"},
        {"id": "echo", "name": "Echo (Male/Warm)", "provider": "openai"},
        {"id": "fable", "name": "Fable (Male/Dramatic)", "provider": "openai"},
        {"id": "onyx", "name": "Onyx (Male/Deep)", "provider": "openai"},
        {"id": "shimmer", "name": "Shimmer (Female/Professional)", "provider": "openai"}
    ]
    
    cloned_voices = load_cloned_voices()
    return jsonify({
        "success": True,
        "default": default_voices,
        "cloned": cloned_voices
    })

@app.route('/api/tts', methods=['POST'])
def text_to_speech():
    """Convert text to speech using ElevenLabs, OpenAI, or Demo Fallback."""
    data = request.json or {}
    text = data.get('text', '').strip()
    voice_id = data.get('voice_id', 'alloy')
    provider = data.get('provider', 'openai')
    
    if not text:
        return jsonify({"success": False, "error": "Text is required"}), 400
        
    elevenlabs_key = os.getenv('ELEVENLABS_API_KEY') or data.get('elevenlabs_key')
    openai_key = os.getenv('OPENAI_API_KEY') or data.get('openai_key')
    
    output_filename = f"tts_{uuid.uuid4().hex}.mp3"
    output_path = os.path.join(app.config['PROCESSED_FOLDER'], output_filename)
    
    # Check if this is a custom cloned voice
    cloned_voices = load_cloned_voices()
    cloned_voice = next((v for v in cloned_voices if v['id'] == voice_id), None)
    
    # Define fallback behaviour if API keys are missing or provider is mocked
    is_cloned_mock = cloned_voice and cloned_voice.get('is_mock', False)
    
    if (provider == 'elevenlabs' and not elevenlabs_key) or (provider == 'openai' and not openai_key) or is_cloned_mock:
        # DEMO MODE / FALLBACK
        print("Using Mock / Demo Mode for TTS")
        
        # If it's a mock cloned voice, we generate sound based on the uploaded sample
        if cloned_voice and os.path.exists(cloned_voice.get('sample_path', '')):
            # Simulate a TTS output by processing the voice sample
            # Pitch shift slightly or stretch to make it sound unique
            try:
                pitch_shift_and_stretch(
                    cloned_voice['sample_path'], 
                    output_path, 
                    pitch_steps=2, 
                    speed_rate=0.95
                )
                return jsonify({
                    "success": True,
                    "audio_url": f"/processed/{output_filename}",
                    "mode": "demo_clone",
                    "message": "Demo Mode: TTS simulated from your cloned voice sample."
                })
            except Exception as e:
                print(f"Failed to generate mock TTS from sample: {e}")
                
        # Basic Demo Fallback: return a synthetic notification chime or standard audio
        # For simplicity, we can create a simple synthetic beep/hum using numpy
        # or load a pre-existing asset. Let's synthesize a pleasant sci-fi speech melody!
        try:
            import numpy as np
            import soundfile as sf
            sr = 22050
            duration = 3.0
            t = np.arange(int(sr * duration)) / sr
            # Create a simple synthetic vocal melody (formant synthesis simulation)
            f0 = 150  # fundamental freq
            # Create vocal-like harmonics (vowel-like)
            y = np.sin(2 * np.pi * f0 * t) * 0.5
            y += np.sin(2 * np.pi * f0 * 2 * t) * 0.25
            y += np.sin(2 * np.pi * f0 * 3 * t) * 0.125
            # Add an LFO to make it sound like speech intonation
            lfo = 1.0 + 0.15 * np.sin(2 * np.pi * 3.5 * t)
            y = y * lfo
            # Normalize and write
            y = y / np.max(np.abs(y))
            sf.write(output_path, y, sr)
            
            return jsonify({
                "success": True,
                "audio_url": f"/processed/{output_filename}",
                "mode": "demo_synthesized",
                "message": "Demo Mode: API keys missing. Synthesized mock audio returned."
            })
        except Exception as e:
            return jsonify({"success": False, "error": f"Demo synthesis failed: {str(e)}"}), 500
            
    # ElevenLabs API Integration
    if provider == 'elevenlabs':
        try:
            url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
            headers = {
                "Accept": "audio/mpeg",
                "Content-Type": "application/json",
                "xi-api-key": elevenlabs_key
            }
            payload = {
                "text": text,
                "model_id": "eleven_monolingual_v1",
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.75
                }
            }
            response = requests.post(url, json=payload, headers=headers)
            if response.status_code == 200:
                with open(output_path, 'wb') as f:
                    f.write(response.content)
                return jsonify({"success": True, "audio_url": f"/processed/{output_filename}"})
            else:
                return jsonify({"success": False, "error": f"ElevenLabs API Error: {response.text}"}), response.status_code
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500
            
    # OpenAI API Integration
    elif provider == 'openai':
        try:
            url = "https://api.openai.com/v1/audio/speech"
            headers = {
                "Authorization": f"Bearer {openai_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": "tts-1",
                "input": text,
                "voice": voice_id
            }
            response = requests.post(url, json=payload, headers=headers)
            if response.status_code == 200:
                with open(output_path, 'wb') as f:
                    f.write(response.content)
                return jsonify({"success": True, "audio_url": f"/processed/{output_filename}"})
            else:
                return jsonify({"success": False, "error": f"OpenAI API Error: {response.text}"}), response.status_code
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500
            
    return jsonify({"success": False, "error": "Invalid provider"}), 400

@app.route('/api/clone', methods=['POST'])
def clone_voice():
    """Upload audio sample to clone a voice."""
    if 'file' not in request.files:
        return jsonify({"success": False, "error": "No file uploaded"}), 400
        
    file = request.files['file']
    voice_name = request.form.get('name', '').strip()
    
    if not voice_name:
        voice_name = f"Cloned Voice {uuid.uuid4().hex[:6]}"
        
    if file.filename == '':
        return jsonify({"success": False, "error": "No selected file"}), 400
        
    # Save the original file
    filename = secure_filename(file.filename)
    unique_prefix = uuid.uuid4().hex
    saved_filename = f"clone_{unique_prefix}_{filename}"
    sample_path = os.path.join(app.config['UPLOAD_FOLDER'], saved_filename)
    file.save(sample_path)
    
    elevenlabs_key = os.getenv('ELEVENLABS_API_KEY') or request.form.get('elevenlabs_key')
    
    # Fallback to Mock/Demo Mode if no ElevenLabs key is available
    if not elevenlabs_key:
        # Mock Cloning
        voice_id = f"mock_{uuid.uuid4().hex}"
        cloned_info = {
            "id": voice_id,
            "name": f"{voice_name} (Cloned - Demo)",
            "provider": "elevenlabs",
            "is_mock": True,
            "sample_path": sample_path
        }
        
        voices = load_cloned_voices()
        voices.append(cloned_info)
        save_cloned_voices(voices)
        
        return jsonify({
            "success": True,
            "voice": cloned_info,
            "message": "Demo Mode: Voice cloned locally without API key."
        })
        
    # Real ElevenLabs Voice Cloning
    try:
        url = "https://api.elevenlabs.io/v1/voices/add"
        headers = {
            "xi-api-key": elevenlabs_key
        }
        data = {
            "name": voice_name,
            "description": "Voice cloned via Ai voice bu kero platform."
        }
        # Open file for multipart post
        with open(sample_path, 'rb') as f:
            files = {
                "files": (filename, f, "audio/mpeg")
            }
            response = requests.post(url, headers=headers, data=data, files=files)
            
        if response.status_code == 200:
            result = response.json()
            voice_id = result.get('voice_id')
            cloned_info = {
                "id": voice_id,
                "name": voice_name,
                "provider": "elevenlabs",
                "is_mock": False,
                "sample_path": sample_path
            }
            
            voices = load_cloned_voices()
            voices.append(cloned_info)
            save_cloned_voices(voices)
            
            return jsonify({"success": True, "voice": cloned_info})
        else:
            return jsonify({"success": False, "error": f"ElevenLabs API Error: {response.text}"}), response.status_code
            
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/change', methods=['POST'])
def change_voice():
    """Modify audio pitch, speed, and tone using librosa."""
    if 'file' not in request.files:
        return jsonify({"success": False, "error": "No file uploaded"}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({"success": False, "error": "No selected file"}), 400
        
    pitch_steps = int(request.form.get('pitch', 0))
    speed_rate = float(request.form.get('speed', 1.0))
    tone_preset = request.form.get('tone', None)  # None, robot, radio, bass, treble, helium, giant
    
    # Save original
    filename = secure_filename(file.filename)
    unique_id = uuid.uuid4().hex
    input_filename = f"original_{unique_id}_{filename}"
    output_filename = f"changed_{unique_id}_{filename}"
    
    input_path = os.path.join(app.config['UPLOAD_FOLDER'], input_filename)
    output_path = os.path.join(app.config['PROCESSED_FOLDER'], output_filename)
    
    file.save(input_path)
    
    # Run librosa audio processing
    try:
        pitch_shift_and_stretch(
            input_path=input_path,
            output_path=output_path,
            pitch_steps=pitch_steps,
            speed_rate=speed_rate,
            tone_preset=tone_preset
        )
        
        # Return URLs
        return jsonify({
            "success": True,
            "original_url": f"/uploads/{input_filename}",
            "processed_url": f"/processed/{output_filename}"
        })
    except Exception as e:
        return jsonify({"success": False, "error": f"Audio processing failed: {str(e)}"}), 500

@app.route('/api/enhance', methods=['POST'])
def enhance():
    """Enhance audio (noise cancellation, volume leveling) using noisereduce and normalization."""
    if 'file' not in request.files:
        return jsonify({"success": False, "error": "No file uploaded"}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({"success": False, "error": "No selected file"}), 400
        
    # Save original
    filename = secure_filename(file.filename)
    unique_id = uuid.uuid4().hex
    input_filename = f"original_{unique_id}_{filename}"
    output_filename = f"enhanced_{unique_id}_{filename}"
    
    input_path = os.path.join(app.config['UPLOAD_FOLDER'], input_filename)
    output_path = os.path.join(app.config['PROCESSED_FOLDER'], output_filename)
    
    file.save(input_path)
    
    # Run enhancement
    try:
        enhance_audio(input_path=input_path, output_path=output_path)
        
        # Return URLs
        return jsonify({
            "success": True,
            "original_url": f"/uploads/{input_filename}",
            "processed_url": f"/processed/{output_filename}"
        })
    except Exception as e:
        return jsonify({"success": False, "error": f"Audio enhancement failed: {str(e)}"}), 500

# Route to serve processed and uploaded audio files directly
@app.route('/uploads/<filename>')
def serve_uploads(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/processed/<filename>')
def serve_processed(filename):
    return send_from_directory(app.config['PROCESSED_FOLDER'], filename)

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
