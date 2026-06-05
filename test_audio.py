# Test script to verify librosa and noisereduce processing
import os
import numpy as np
import soundfile as sf
from voice_processor import pitch_shift_and_stretch, enhance_audio

def run_tests():
    print("Initializing verification tests...")
    
    # 1. Create a synthetic test audio file (1 second, 440Hz sine wave + noise)
    sr = 22050
    duration = 2.0  # seconds
    t = np.arange(int(sr * duration)) / sr
    
    # Clean tone
    clean_signal = np.sin(2 * np.pi * 440 * t)
    
    # Add stationary background noise
    noise = np.random.normal(0, 0.25, len(t))
    noisy_signal = clean_signal + noise
    
    # Normalize
    noisy_signal = noisy_signal / np.max(np.abs(noisy_signal))
    
    test_original = "test_original.wav"
    test_enhanced = "test_enhanced.wav"
    test_changed = "test_changed.wav"
    
    try:
        # Save synthetic original
        sf.write(test_original, noisy_signal, sr)
        print(f"-> Created test original file: {test_original}")
        
        # 2. Test Audio Enhancer (Noise reduction)
        print("-> Testing enhance_audio...")
        enhance_audio(test_original, test_enhanced)
        assert os.path.exists(test_enhanced), "Enhanced file not created!"
        enhanced_size = os.path.getsize(test_enhanced)
        print(f"   Success! Enhanced audio saved to {test_enhanced} ({enhanced_size} bytes)")
        
        # 3. Test Voice Changer (Pitch Shift, Speed, Preset)
        print("-> Testing pitch_shift_and_stretch (Robot Preset, Speed 1.2x, Pitch +4)...")
        pitch_shift_and_stretch(test_original, test_changed, pitch_steps=4, speed_rate=1.2, tone_preset='robot')
        assert os.path.exists(test_changed), "Changed file not created!"
        changed_size = os.path.getsize(test_changed)
        print(f"   Success! Changed audio saved to {test_changed} ({changed_size} bytes)")
        
        print("\nAll automated audio tests passed successfully!")
        
    except Exception as e:
        print(f"\nVerification failed: {e}")
        raise e
    finally:
        # Cleanup temporary files
        for f in [test_original, test_enhanced, test_changed]:
            if os.path.exists(f):
                try:
                    os.remove(f)
                except Exception as cleanup_err:
                    print(f"Cleanup warning: could not remove {f} ({cleanup_err})")

if __name__ == '__main__':
    run_tests()
