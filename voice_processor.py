import os
import numpy as np
import soundfile as sf
from scipy.signal import butter, lfilter
import noisereduce as nr

# --- Custom Digital Signal Processing (DSP) Core ---
# Bypasses librosa DLL import blocks by using pure NumPy phase vocoder

def stft(y, n_fft=2048, hop_length=512):
    """Short-Time Fourier Transform in pure NumPy."""
    win = np.hanning(n_fft)
    y_pad = np.pad(y, n_fft // 2, mode='reflect')
    n_frames = 1 + (len(y_pad) - n_fft) // hop_length
    stft_matrix = np.empty((1 + n_fft // 2, n_frames), dtype=np.complex128)
    for t in range(n_frames):
        start = t * hop_length
        frame = y_pad[start:start + n_fft] * win
        stft_matrix[:, t] = np.fft.rfft(frame)
    return stft_matrix

def istft(stft_matrix, hop_length=512):
    """Inverse Short-Time Fourier Transform in pure NumPy."""
    n_bins = stft_matrix.shape[0]
    n_fft = 2 * (n_bins - 1)
    n_frames = stft_matrix.shape[1]
    win = np.hanning(n_fft)
    expected_len = n_fft + (n_frames - 1) * hop_length
    y = np.zeros(expected_len)
    win_sum = np.zeros(expected_len)
    
    for t in range(n_frames):
        start = t * hop_length
        spec = stft_matrix[:, t]
        frame = np.fft.irfft(spec)
        y[start:start + n_fft] += frame * win
        win_sum[start:start + n_fft] += win ** 2
        
    win_sum = np.where(win_sum > 1e-4, win_sum, 1.0)
    y /= win_sum
    return y[n_fft // 2 : -n_fft // 2]

def phase_vocoder(stft_matrix, rate, hop_length=512):
    """Phase Vocoder for time-stretching/pitch-shifting without metallic phasing."""
    n_bins, n_frames = stft_matrix.shape
    n_fft = 2 * (n_bins - 1)
    
    # Time steps for output
    time_steps = np.arange(0, n_frames - 1, rate)
    new_frames = len(time_steps)
    
    stretched_stft = np.zeros((n_bins, new_frames), dtype=np.complex128)
    
    # Phase accumulator
    phase_acc = np.angle(stft_matrix[:, 0])
    stretched_stft[:, 0] = stft_matrix[:, 0]
    
    # Expected phase advance per step
    omega = 2 * np.pi * hop_length * np.arange(n_bins) / n_fft
    
    for i, t in enumerate(time_steps[1:]):
        t_floor = int(np.floor(t))
        t_ceil = min(t_floor + 1, n_frames - 1)
        alpha = t - t_floor
        
        # Interpolate magnitude
        mag = (1 - alpha) * np.abs(stft_matrix[:, t_floor]) + alpha * np.abs(stft_matrix[:, t_ceil])
        
        # Calculate phase advance
        dphase = np.angle(stft_matrix[:, t_ceil]) - np.angle(stft_matrix[:, t_floor])
        dphase_dev = dphase - omega
        dphase_dev = np.mod(dphase_dev + np.pi, 2 * np.pi) - np.pi
        
        phase_advance = omega + dphase_dev
        phase_acc += phase_advance
        
        # Reconstruct complex bins
        stretched_stft[:, i + 1] = mag * np.exp(1j * phase_acc)
        
    return stretched_stft

def resample(y, num_samples):
    """Resamples the audio signal using linear interpolation (bypasses DLL compilation)."""
    if len(y) == 0:
        return y
    if len(y) == num_samples:
        return y
    return np.interp(
        np.linspace(0, len(y) - 1, num_samples),
        np.arange(len(y)),
        y
    )

def custom_time_stretch(y, rate):
    """Stretches audio playback speed while keeping the pitch constant."""
    if rate == 1.0 or len(y) == 0:
        return y
    spec = stft(y)
    spec_stretched = phase_vocoder(spec, rate)
    return istft(spec_stretched)

def custom_pitch_shift(y, n_steps):
    """Shifts the pitch of audio while keeping the speed constant."""
    if n_steps == 0 or len(y) == 0:
        return y
    # A positive shift step means shifting pitch up.
    # To shift pitch up, we time-stretch by a factor of 2^(-pitch/12) (which expands/shrinks it)
    # and then resample it back to original length (which shifts frequency back).
    rate = 2.0 ** (-n_steps / 12.0)
    y_stretched = custom_time_stretch(y, rate)
    return resample(y_stretched, len(y))

# --- Preset Tone Filters ---

def butter_bandpass(lowcut, highcut, fs, order=5):
    nyq = 0.5 * fs
    low = lowcut / nyq
    high = highcut / nyq
    b, a = butter(order, [low, high], btype='band')
    return b, a

def apply_bandpass_filter(data, lowcut, highcut, fs, order=5):
    b, a = butter_bandpass(lowcut, highcut, fs, order=order)
    return lfilter(b, a, data)

def apply_robot_effect(y, sr):
    """Robot voice modulator."""
    t = np.arange(len(y)) / sr
    carrier = np.sin(2 * np.pi * 80 * t)
    ring_mod = y * carrier
    
    # Metal delay / comb filter
    delay_samples = int(sr * 0.02)
    delay_signal = np.zeros_like(ring_mod)
    delay_signal[delay_samples:] = ring_mod[:-delay_samples]
    
    return 0.7 * ring_mod + 0.3 * delay_signal

def apply_radio_effect(y, sr):
    """Old telephone/AM radio voice."""
    try:
        filtered = apply_bandpass_filter(y, 300, 3400, sr, order=4)
        return np.tanh(filtered * 1.5)  # Saturation
    except Exception:
        return y

def apply_bass_boost(y, sr):
    """Low frequency boost (< 250Hz)."""
    try:
        nyq = 0.5 * sr
        low = 250 / nyq
        b, a = butter(2, low, btype='low')
        bass = lfilter(b, a, y)
        boosted = y + 0.6 * bass
        max_val = np.max(np.abs(boosted))
        return boosted / max_val if max_val > 0 else boosted
    except Exception:
        return y

def apply_treble_boost(y, sr):
    """High frequency boost (> 4000Hz)."""
    try:
        nyq = 0.5 * sr
        high = 4000 / nyq
        b, a = butter(2, high, btype='high')
        treble = lfilter(b, a, y)
        boosted = y + 0.6 * treble
        max_val = np.max(np.abs(boosted))
        return boosted / max_val if max_val > 0 else boosted
    except Exception:
        return y

# --- Primary API Functions ---

def pitch_shift_and_stretch(input_path, output_path, pitch_steps=0, speed_rate=1.0, tone_preset=None):
    """
    Transforms pitch, speed, and applies a tone preset filter on the audio file.
    Uses pure NumPy DSP instead of librosa to bypass AppLocker restrictions.
    """
    # Load audio using soundfile (safe from DLL block)
    y, sr = sf.read(input_path)
    if len(y.shape) > 1:
        y = np.mean(y, axis=1)  # Convert stereo to mono
        
    # Avoid processing if parameters are default and no preset
    if pitch_steps == 0 and speed_rate == 1.0 and not tone_preset:
        sf.write(output_path, y, sr)
        return
    
    # Apply tone preset mappings to pitch and speed or custom filters
    if tone_preset == 'helium':
        pitch_steps += 6
        speed_rate *= 1.15
    elif tone_preset == 'giant':
        pitch_steps -= 5
        speed_rate *= 0.85
        
    # Apply time stretching (Speed)
    if speed_rate != 1.0:
        y = custom_time_stretch(y, speed_rate)
        
    # Apply pitch shifting
    if pitch_steps != 0:
        y = custom_pitch_shift(y, pitch_steps)
        
    # Apply custom filter presets
    if tone_preset == 'robot':
        y = apply_robot_effect(y, sr)
    elif tone_preset == 'radio':
        y = apply_radio_effect(y, sr)
    elif tone_preset == 'bass':
        y = apply_bass_boost(y, sr)
    elif tone_preset == 'treble':
        y = apply_treble_boost(y, sr)
        
    # Normalize final audio output to avoid digital clipping
    max_val = np.max(np.abs(y))
    if max_val > 0:
        y = y / max_val
        
    # Save file
    sf.write(output_path, y, sr)

def enhance_audio(input_path, output_path):
    """
    Performs one-click studio-quality enhancement:
    1. Noise reduction via noisereduce
    2. Echo attenuation (subtle high-pass filtering + noise gating)
    3. Peak & RMS volume leveling (normalization)
    """
    # Load audio
    y, sr = sf.read(input_path)
    if len(y.shape) > 1:
        y = np.mean(y, axis=1)  # Convert stereo to mono
    
    # 1. Noise reduction using noisereduce (stationary noise filter)
    y_clean = nr.reduce_noise(y=y, sr=sr, prop_decrease=0.85)
    
    # 2. Echo attenuation and high-pass filtering (removes room rumble/low-end echo)
    try:
        nyq = 0.5 * sr
        low = 80 / nyq
        b, a = butter(2, low, btype='high')
        y_clean = lfilter(b, a, y_clean)
    except Exception:
        pass
        
    # Apply a subtle noise gate to silence echo trails in silence gaps
    win_length = int(0.02 * sr)
    peak_amp = np.max(np.abs(y_clean))
    threshold = 0.015 * peak_amp
    
    envelope = np.abs(y_clean)
    box = np.ones(win_length) / win_length
    smoothed_env = np.convolve(envelope, box, mode='same')
    
    gate_mask = np.where(smoothed_env < threshold, 0.15, 1.0)
    y_clean = y_clean * gate_mask
    
    # 3. Studio Volume Leveling (Peak Normalization to -1 dB)
    max_val = np.max(np.abs(y_clean))
    if max_val > 0:
        target_peak = 0.89  # -1 dB
        y_clean = y_clean * (target_peak / max_val)
        
    # Save enhanced audio
    sf.write(output_path, y_clean, sr)
