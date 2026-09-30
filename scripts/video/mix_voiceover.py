import os
import subprocess

VOICE_DIR = '/tmp/voiceover'
OUTPUT_VOICE_MASTER = '/tmp/smoke_monkey_voiceover_master.wav'
MUSIC_TRACK = '/tmp/smoke_monkey_soundtrack.wav'
FINAL_AUDIO_TRACK = '/tmp/smoke_monkey_master_audio.wav'

# Speeds and delay offsets (in milliseconds)
# Act 1: 0.5s (500ms), speed 1.05x -> ~5.7s (ends ~6.2s)
# Act 2: 7.3s (7300ms), speed 1.30x -> ~6.4s (ends ~13.7s)
# Act 3: 14.4s (14400ms), speed 1.10x -> ~6.8s (ends ~21.2s)
# Act 4: 24.4s (24400ms), speed 1.12x -> ~6.3s (ends ~30.7s)
# Act 5: 33.3s (33300ms), speed 1.20x -> ~5.4s (ends ~38.7s)

voice_schedule = [
    (f"{VOICE_DIR}/act1_final.mp3", 1.05, 500),
    (f"{VOICE_DIR}/act2_final.mp3", 1.30, 7300),
    (f"{VOICE_DIR}/act3_final.mp3", 1.10, 14400),
    (f"{VOICE_DIR}/act4_final.mp3", 1.12, 24400),
    (f"{VOICE_DIR}/act5_final.mp3", 1.20, 33300),
]

def build_voice_master():
    print("Building timed voiceover master with Google Voice clips...")
    
    # 1. First process each clip with atempo and convert to 48kHz stereo WAV
    processed_clips = []
    for idx, (path, tempo, delay_ms) in enumerate(voice_schedule):
        tmp_proc = f"/tmp/voiceover/proc_{idx}.wav"
        # atempo filter + volume boost + resampling to 48kHz stereo
        cmd = [
            'ffmpeg', '-y',
            '-i', path,
            '-filter:a', f'atempo={tempo},volume=1.4,aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=stereo',
            tmp_proc
        ]
        subprocess.run(cmd, check=True)
        processed_clips.append((tmp_proc, delay_ms))

    # 2. Delay each clip and mix together into a 40-second master voice track
    filter_complex = []
    inputs = []
    for idx, (tmp_path, delay_ms) in enumerate(processed_clips):
        inputs.extend(['-i', tmp_path])
        filter_complex.append(f"[{idx}:a]adelay={delay_ms}|{delay_ms}[v{idx}]")

    mix_inputs = "".join(f"[v{i}]" for i in range(len(processed_clips)))
    filter_complex.append(f"{mix_inputs}amix=inputs={len(processed_clips)}:normalize=0[voice_out]")

    cmd_mix = ['ffmpeg', '-y'] + inputs + [
        '-filter_complex', ";".join(filter_complex),
        '-map', '[voice_out]',
        '-t', '40.0',
        OUTPUT_VOICE_MASTER
    ]
    subprocess.run(cmd_mix, check=True)
    print(f"Voice master created: {OUTPUT_VOICE_MASTER}")

    # 3. Combine with background synth music (music at 0.55 volume, voice at 1.0 volume)
    print("Mixing voiceover with synth soundtrack...")
    final_mix_cmd = [
        'ffmpeg', '-y',
        '-i', MUSIC_TRACK,
        '-i', OUTPUT_VOICE_MASTER,
        '-filter_complex', '[0:a]volume=0.55[bgm];[1:a]volume=1.2[vox];[bgm][vox]amix=inputs=2:duration=first:dropout_transition=2[aout]',
        '-map', '[aout]',
        '-t', '40.0',
        FINAL_AUDIO_TRACK
    ]
    subprocess.run(final_mix_cmd, check=True)
    print(f"Final mixed audio track created: {FINAL_AUDIO_TRACK}")

if __name__ == '__main__':
    build_voice_master()
