import wave
import struct
import math
import random

SAMPLE_RATE = 48000
TOTAL_DURATION = 40.0
TOTAL_SAMPLES = int(SAMPLE_RATE * TOTAL_DURATION)

def generate_soundtrack(output_wav_path):
    print("Generating 40-second synchronized soundtrack...")
    
    # Track buffers (left and right channels)
    left = [0.0] * TOTAL_SAMPLES
    right = [0.0] * TOTAL_SAMPLES
    
    bpm = 120.0
    spb = 60.0 / bpm # 0.5s per beat
    
    # 1. Kick Drum function
    def add_kick(start_time, strength=0.7):
        start_idx = int(start_time * SAMPLE_RATE)
        kick_dur = 0.25 # seconds
        kick_samples = int(kick_dur * SAMPLE_RATE)
        for i in range(kick_samples):
            idx = start_idx + i
            if idx >= TOTAL_SAMPLES:
                break
            t = i / SAMPLE_RATE
            env = math.exp(-14.0 * t)
            freq = 140.0 * math.exp(-22.0 * t) + 45.0
            val = math.sin(2 * math.pi * freq * t) * env * strength
            left[idx] += val
            right[idx] += val

    # 2. Snare / Clap function
    def add_snare(start_time, strength=0.45):
        start_idx = int(start_time * SAMPLE_RATE)
        snare_dur = 0.2
        snare_samples = int(snare_dur * SAMPLE_RATE)
        for i in range(snare_samples):
            idx = start_idx + i
            if idx >= TOTAL_SAMPLES:
                break
            t = i / SAMPLE_RATE
            env = math.exp(-18.0 * t)
            noise = (random.random() * 2.0 - 1.0) * env * 0.7
            tone = math.sin(2 * math.pi * 200.0 * t) * math.exp(-25.0 * t) * 0.3
            val = (noise + tone) * strength
            left[idx] += val
            right[idx] += val

    # 3. Hi-Hat function
    def add_hihat(start_time, strength=0.18):
        start_idx = int(start_time * SAMPLE_RATE)
        hh_dur = 0.06
        hh_samples = int(hh_dur * SAMPLE_RATE)
        for i in range(hh_samples):
            idx = start_idx + i
            if idx >= TOTAL_SAMPLES:
                break
            t = i / SAMPLE_RATE
            env = math.exp(-55.0 * t)
            noise = (random.random() * 2.0 - 1.0) * env * strength
            left[idx] += noise * 0.8
            right[idx] += noise * 1.2

    # 4. Keyboard Typing Click function (authentic mechanical switch clack)
    def add_type_click(start_time, strength=0.25):
        start_idx = int(start_time * SAMPLE_RATE)
        dur = 0.03
        samples = int(dur * SAMPLE_RATE)
        pitch = random.uniform(1600, 3200)
        pan = random.uniform(-0.3, 0.3)
        for i in range(samples):
            idx = start_idx + i
            if idx >= TOTAL_SAMPLES:
                break
            t = i / SAMPLE_RATE
            env = math.exp(-90.0 * t)
            tone = math.sin(2 * math.pi * pitch * t) * env
            noise = (random.random() * 2.0 - 1.0) * env * 0.5
            val = (tone + noise) * strength
            left[idx] += val * (1.0 - pan)
            right[idx] += val * (1.0 + pan)

    # 5. Bass Synth Note function
    def add_bass_note(start_time, duration, freq, strength=0.35):
        start_idx = int(start_time * SAMPLE_RATE)
        note_samples = int(duration * SAMPLE_RATE)
        for i in range(note_samples):
            idx = start_idx + i
            if idx >= TOTAL_SAMPLES:
                break
            t = i / SAMPLE_RATE
            # Attack-Decay-Sustain envelope
            if t < 0.02:
                env = t / 0.02
            else:
                env = math.exp(-3.0 * (t - 0.02)) * 0.85 + 0.15
            # Sawtooth approximation with slight detune
            s1 = math.sin(2 * math.pi * freq * t)
            s2 = math.sin(4 * math.pi * freq * t) * 0.5
            s3 = math.sin(6 * math.pi * freq * t) * 0.25
            sub = math.sin(2 * math.pi * (freq * 0.5) * t) * 0.6
            val = (s1 + s2 + s3 + sub) * env * strength
            left[idx] += val
            right[idx] += val

    # 6. Melodic Synth / Arp function
    def add_synth_note(start_time, duration, freq, pan=0.0, strength=0.2):
        start_idx = int(start_time * SAMPLE_RATE)
        note_samples = int(duration * SAMPLE_RATE)
        for i in range(note_samples):
            idx = start_idx + i
            if idx >= TOTAL_SAMPLES:
                break
            t = i / SAMPLE_RATE
            env = math.exp(-4.5 * t)
            # Bell/pluck harmonic
            val = (math.sin(2 * math.pi * freq * t) +
                   0.4 * math.sin(4 * math.pi * freq * t) +
                   0.2 * math.sin(6 * math.pi * freq * t)) * env * strength
            left[idx] += val * (1.0 - pan)
            right[idx] += val * (1.0 + pan)

    # 7. Cinematic Riser / Swoosh
    def add_riser(start_time, duration=2.0, strength=0.35):
        start_idx = int(start_time * SAMPLE_RATE)
        riser_samples = int(duration * SAMPLE_RATE)
        for i in range(riser_samples):
            idx = start_idx + i
            if idx >= TOTAL_SAMPLES:
                break
            t = i / SAMPLE_RATE
            progress = t / duration
            freq = 150.0 + 850.0 * (progress ** 2)
            env = (progress ** 1.8) * strength
            val = math.sin(2 * math.pi * freq * t) * env
            left[idx] += val * (1.0 - progress * 0.5)
            right[idx] += val * (0.5 + progress * 0.5)

    # 8. Ambient Drone / Pad (0 - 40s)
    pad_freqs = [146.83, 220.0, 293.66, 369.99] # D3, A3, D4, F#4 chord
    for i in range(TOTAL_SAMPLES):
        t = i / SAMPLE_RATE
        # Master fade in (0 - 1.5s) and fade out (38.5 - 40s)
        fade = 1.0
        if t < 1.5:
            fade = t / 1.5
        elif t > 38.5:
            fade = max(0.0, (40.0 - t) / 1.5)
        
        # Subtle chorus pad
        pad_val = 0.0
        for pf in pad_freqs:
            lfo = 1.0 + 0.003 * math.sin(2 * math.pi * 0.4 * t)
            pad_val += math.sin(2 * math.pi * pf * lfo * t) * 0.035
        left[i] += pad_val * fade
        right[i] += pad_val * fade

    # Schedule Beats & Rhythm
    # Act 1 (0 - 7s): Ambient build, kick starts at 3.0s, riser at 5.0s
    for beat in range(6, 14): # 3.0s to 7.0s
        t = beat * spb
        add_kick(t, strength=0.6)
        if beat % 2 == 1:
            add_hihat(t + 0.25, strength=0.12)
    add_riser(5.0, duration=2.0, strength=0.3)

    # Act 2 (7 - 14s): Driving beat & bassline (3-Pillars Architecture)
    bass_scale_1 = [73.42, 73.42, 87.31, 98.0, 73.42, 73.42, 110.0, 98.0] # D2, F2, G2, A2
    for beat in range(14, 28): # 7.0s to 14.0s
        t = beat * spb
        add_kick(t, strength=0.7)
        if beat % 2 == 1:
            add_snare(t, strength=0.45)
        add_hihat(t + 0.25, strength=0.18)
        note_freq = bass_scale_1[(beat - 14) % len(bass_scale_1)]
        add_bass_note(t, spb * 0.85, note_freq, strength=0.32)
        # Melodic arp
        arp_freq = note_freq * 4.0
        add_synth_note(t + 0.125, 0.2, arp_freq, pan=-0.3, strength=0.15)
        add_synth_note(t + 0.375, 0.2, arp_freq * 1.25, pan=0.3, strength=0.15)
    add_riser(12.5, duration=1.5, strength=0.3)

    # Act 3 (14 - 24s): VS Code Typing Demo
    # Typing clicks matching on-screen typing
    cur_t = 14.2
    for _ in range(75):
        cur_t += random.uniform(0.08, 0.14)
        if cur_t >= 23.5:
            break
        add_type_click(cur_t, strength=random.uniform(0.18, 0.3))

    # Beat continues with clean tech rhythm
    bass_scale_2 = [73.42, 73.42, 82.41, 73.42, 98.0, 87.31, 73.42, 110.0]
    for beat in range(28, 48): # 14.0s to 24.0s
        t = beat * spb
        add_kick(t, strength=0.65)
        if beat % 2 == 1:
            add_snare(t, strength=0.4)
        add_hihat(t + 0.25, strength=0.16)
        note_freq = bass_scale_2[(beat - 28) % len(bass_scale_2)]
        add_bass_note(t, spb * 0.75, note_freq, strength=0.28)
        # Subtle tech blip on beat
        if beat % 4 == 0:
            add_synth_note(t, 0.3, 880.0, pan=0.4, strength=0.18)
    add_riser(22.2, duration=1.8, strength=0.35)

    # Act 4 (24 - 33s): Full Power 6-Phase Loop & Interactive 3 Pauses
    bass_scale_3 = [98.0, 98.0, 110.0, 130.81, 146.83, 130.81, 110.0, 98.0]
    for beat in range(48, 66): # 24.0s to 33.0s
        t = beat * spb
        add_kick(t, strength=0.8)
        if beat % 2 == 1:
            add_snare(t, strength=0.5)
        add_hihat(t + 0.125, strength=0.15)
        add_hihat(t + 0.25, strength=0.22)
        add_hihat(t + 0.375, strength=0.15)
        note_freq = bass_scale_3[(beat - 48) % len(bass_scale_3)]
        add_bass_note(t, spb * 0.9, note_freq, strength=0.36)
        # Dynamic melody
        mel_notes = [587.33, 659.25, 783.99, 880.0] # D5, E5, G5, A5
        add_synth_note(t, 0.25, mel_notes[(beat * 3) % 4], pan=(beat % 2 - 0.5), strength=0.22)
    add_riser(31.2, duration=1.8, strength=0.4)

    # Act 5 (33 - 40s): Climax & Call to Action (Big chords & deep punch)
    add_kick(33.0, strength=0.95)
    add_bass_note(33.0, 4.0, 73.42, strength=0.45)
    for beat in range(66, 78): # 33.0s to 39.0s
        t = beat * spb
        add_kick(t, strength=0.75)
        if beat % 2 == 1:
            add_snare(t, strength=0.45)
        add_hihat(t + 0.25, strength=0.18)
        add_bass_note(t, spb * 0.8, 73.42 if beat < 72 else 55.0, strength=0.32)
        # Final celebratory synth arps
        add_synth_note(t + 0.15, 0.3, 587.33, pan=-0.2, strength=0.2)
        add_synth_note(t + 0.35, 0.3, 880.0, pan=0.2, strength=0.2)

    # Final Sub Hit on CTA
    add_kick(36.5, strength=0.85)

    # Normalize audio buffer to prevent any clipping (-1.0 dB target = ~0.89)
    max_val = 0.00001
    for i in range(TOTAL_SAMPLES):
        # Global fade out over last 1.2 seconds
        t = i / SAMPLE_RATE
        if t > 38.8:
            fade = max(0.0, (40.0 - t) / 1.2)
            left[i] *= fade
            right[i] *= fade
        max_val = max(max_val, abs(left[i]), abs(right[i]))

    gain = 0.89 / max_val
    print(f"Max peak: {max_val:.3f}, applying gain {gain:.3f}")

    # Write WAV file
    with wave.open(output_wav_path, 'wb') as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2) # 16-bit
        wav.setframerate(SAMPLE_RATE)
        
        chunk_size = 48000
        for chunk_start in range(0, TOTAL_SAMPLES, chunk_size):
            chunk_end = min(TOTAL_SAMPLES, chunk_start + chunk_size)
            chunk_bytes = bytearray()
            for i in range(chunk_start, chunk_end):
                l_sample = int(max(-32767, min(32767, left[i] * gain * 32767)))
                r_sample = int(max(-32767, min(32767, right[i] * gain * 32767)))
                chunk_bytes.extend(struct.pack('<hh', l_sample, r_sample))
            wav.writeframes(chunk_bytes)

    print(f"Audio soundtrack created successfully: {output_wav_path}")

if __name__ == '__main__':
    generate_soundtrack('/tmp/smoke_monkey_soundtrack.wav')
