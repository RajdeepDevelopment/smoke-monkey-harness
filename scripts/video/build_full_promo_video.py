import os
import sys
import time
import math
import random
import subprocess
from PIL import Image, ImageDraw, ImageFont

# Set up canvas constants
W, H = 1920, 1080
FPS = 30
TOTAL_DURATION = 40.0
TOTAL_FRAMES = int(FPS * TOTAL_DURATION) # 1200 frames

# File paths
BRAND_ICON_PATH = '/Users/rajdeepsadhu/Desktop/Testing/RAG/smoke-monkey-landing/public/ChatGPT Image Sep 28, 2026, 01_15_59 AM.png'
ARCH_PATH = 'assets/smoke_monkey_trio_architecture.jpg'
LOOP_PATH = 'assets/smoke_monkey_phase_loop.jpg'
PAUSE_PATH = 'assets/smoke_monkey_interactive_pauses.jpg'

AUDIO_PATH = '/tmp/smoke_monkey_master_audio.wav'
OUT_VIDEO_SITE = '/Users/rajdeepsadhu/Desktop/Testing/RAG/smoke-monkey-harness/docs/site/smoke_monkey_promo_40s.mp4'
OUT_VIDEO_LANDING = '/Users/rajdeepsadhu/Desktop/Testing/RAG/smoke-monkey-landing/public/smoke_monkey_promo_40s.mp4'

# Fonts
FONT_TITLE_HERO = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 64, index=1)
FONT_TITLE = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 46, index=1)
FONT_SUBTITLE = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 28, index=0)
FONT_CARD_TITLE = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 24, index=1)
FONT_CARD_BODY = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 19, index=0)
FONT_LABEL = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 20, index=1)
FONT_LABEL_SM = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 16, index=1)

FONT_CODE = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 22, index=0)
FONT_CODE_BOLD = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 22, index=1)
FONT_CODE_SM = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 16, index=0)
FONT_CODE_LG = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 38, index=1)

# Color Palette (High-Tech Cyberpunk & Modern Dark Mode)
BG_DARK = (8, 11, 20)
BG_PANEL = (15, 20, 35)
CYAN_NEON = (0, 245, 212)
MAGENTA_NEON = (255, 42, 109)
AMBER_NEON = (255, 170, 0)
PURPLE_GLOW = (121, 40, 202)
GREEN_NEON = (0, 255, 136)
BLUE_VSCODE = (0, 122, 204)
TEXT_WHITE = (245, 247, 250)
TEXT_MUTED = (145, 155, 178)
TEXT_COMMENT = (106, 153, 85)
TEXT_KEYWORD = (255, 123, 114)
TEXT_STRING = (165, 214, 255)
TEXT_FUNC = (220, 220, 170)
TEXT_VAR = (121, 192, 255)

# Load base image assets
print("Loading visual assets...")
brand_icon_orig = Image.open(BRAND_ICON_PATH).convert('RGBA')
arch_img_orig = Image.open(ARCH_PATH).convert('RGB')
loop_img_orig = Image.open(LOOP_PATH).convert('RGB')
pause_img_orig = Image.open(PAUSE_PATH).convert('RGB')

# Pre-render static base background with cyber grid & stars for maximum performance
base_bg = Image.new('RGB', (W, H), BG_DARK)
draw_bg = ImageDraw.Draw(base_bg)
for x in range(0, W, 60):
    draw_bg.line([(x, 0), (x, H)], fill=(16, 23, 40), width=1)
for y in range(0, H, 60):
    draw_bg.line([(0, y), (W, y)], fill=(16, 23, 40), width=1)

# Pre-generate 50 particle positions
random.seed(1337)
particle_seeds = [(random.randint(0, W), random.randint(0, H), random.uniform(0.6, 2.2), random.randint(2, 4), i % 3) for i in range(50)]

def draw_dynamic_particles(draw, frame_idx):
    for bx, by, spd, sz, col_idx in particle_seeds:
        y = (by - frame_idx * spd) % H
        x = (bx + math.sin(frame_idx * 0.04 + bx) * 16) % W
        col = CYAN_NEON if col_idx == 0 else (AMBER_NEON if col_idx == 1 else PURPLE_GLOW)
        draw.ellipse([x, y, x + sz, y + sz], fill=col)

def draw_watermark(img, draw, frame_idx):
    # Sleek brand watermark top-right
    icon_sm = brand_icon_orig.resize((52, 52), Image.Resampling.LANCZOS)
    img.paste(icon_sm, (W - 275, 24), icon_sm)
    draw.text((W - 210, 28), "SMOKE MONKEY", font=FONT_LABEL, fill=TEXT_WHITE)
    draw.text((W - 210, 52), "HARNESS v1.3.1", font=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 13, index=1), fill=CYAN_NEON)
    # Active indicator pulse
    pulse = (math.sin(frame_idx * 0.15) + 1) / 2
    g_val = int(200 + 55 * pulse)
    draw.ellipse([W - 286, 44, W - 280, 50], fill=(0, g_val, 128))

# ==============================================================================
# SCENE 1: CINEMATIC INTRO & BRAND REVEAL (Frames 0 - 209 | 0.0s – 7.0s)
# ==============================================================================
def render_scene_1(frame_idx):
    img = base_bg.copy()
    draw = ImageDraw.Draw(img)
    draw_dynamic_particles(draw, frame_idx)

    cx, cy = W // 2, H // 2 - 75
    
    # Scale animation (zoom in slightly from 0 to 60)
    in_t = min(1.0, frame_idx / 45.0)
    eased_in = math.sin(in_t * math.pi / 2)
    
    pulse = 1.0 + 0.035 * math.sin(frame_idx * 0.1)
    icon_size = int(310 * pulse * (0.8 + 0.2 * eased_in))
    icon_resized = brand_icon_orig.resize((icon_size, icon_size), Image.Resampling.LANCZOS)
    
    # Glowing concentric rings with rotation effect
    ring_radius = int(icon_size * 0.58)
    draw.ellipse([cx - ring_radius, cy - ring_radius, cx + ring_radius, cy + ring_radius], 
                 outline=CYAN_NEON, width=3)
    ring_outer = ring_radius + 16
    draw.ellipse([cx - ring_outer, cy - ring_outer, cx + ring_outer, cy + ring_outer], 
                 outline=PURPLE_GLOW, width=2)
    
    # Orbiting energy nodes
    orbit_angle = frame_idx * 0.05
    for k in range(3):
        oa = orbit_angle + k * (2 * math.pi / 3)
        ox = cx + int(ring_outer * math.cos(oa))
        oy = cy + int(ring_outer * math.sin(oa))
        draw.ellipse([ox - 4, oy - 4, ox + 4, oy + 4], fill=CYAN_NEON)

    # Paste Mascot
    img.paste(icon_resized, (cx - icon_size // 2, cy - icon_size // 2), icon_resized)
    
    # Header & Titles
    draw.text((cx, cy + 215), "// PRODUCTION-GRADE AGENT INFRASTRUCTURE", font=FONT_CODE_SM, fill=CYAN_NEON, anchor="mm")
    draw.text((cx, cy + 280), "SMOKE MONKEY HARNESS", font=FONT_TITLE_HERO, fill=TEXT_WHITE, anchor="mm")
    draw.text((cx, cy + 340), "Autonomous TypeScript Agent Loop Runtime • Zero Runtime Dependencies", font=FONT_SUBTITLE, fill=TEXT_MUTED, anchor="mm")
    
    # 4 Feature Badges (Sequential appearance)
    badges = [
        ("0 DEPENDENCIES", CYAN_NEON, 30),
        ("NATIVE MCP CLIENT", GREEN_NEON, 60),
        ("JIT SKILL.md (-94% TOKENS)", AMBER_NEON, 90),
        ("6-PHASE STATE MACHINE", MAGENTA_NEON, 120)
    ]
    card_w = 265
    gap = 20
    total_w = 4 * card_w + 3 * gap
    start_x = (W - total_w) // 2
    for idx, (b_text, b_color, appear_frame) in enumerate(badges):
        if frame_idx >= appear_frame:
            bx = start_x + idx * (card_w + gap)
            by = H - 110
            # Pop-in bounce
            pop = min(1.0, (frame_idx - appear_frame) / 15.0)
            cur_by = int(by + (1.0 - pop) * 20)
            draw.rounded_rectangle([bx, cur_by, bx + card_w, cur_by + 46], radius=10, fill=(16, 23, 42), outline=b_color, width=2)
            draw.text((bx + card_w // 2, cur_by + 23), b_text, font=FONT_LABEL_SM, fill=TEXT_WHITE, anchor="mm")

    return img

# ==============================================================================
# SCENE 2: 3-PILLAR UNIFIED ARCHITECTURE (Frames 210 - 419 | 7.0s – 14.0s)
# ==============================================================================
def render_scene_2(frame_idx):
    img = base_bg.copy()
    draw = ImageDraw.Draw(img)
    draw_dynamic_particles(draw, frame_idx)
    draw_watermark(img, draw, frame_idx)

    # Section Title Header
    draw.text((90, 70), "UNIFIED 3-PILLAR ECOSYSTEM", font=FONT_TITLE, fill=TEXT_WHITE)
    draw.text((90, 120), "Frontend UI • Backend Engine • Model Context Protocol (MCP)", font=FONT_SUBTITLE, fill=CYAN_NEON)

    # Ken-Burns slow zoom on architecture diagram
    zoom_progress = (frame_idx - 210) / 210.0
    scale_factor = 1.0 + 0.04 * zoom_progress
    base_w, base_h = 1100, 614
    arch_w = int(base_w * scale_factor)
    arch_h = int(base_h * scale_factor)
    
    arch_scaled = arch_img_orig.resize((arch_w, arch_h), Image.Resampling.LANCZOS)
    # Center crop back to base_w, base_h
    crop_x = (arch_w - base_w) // 2
    crop_y = (arch_h - base_h) // 2
    arch_cropped = arch_scaled.crop((crop_x, crop_y, crop_x + base_w, crop_y + base_h))
    
    card_x, card_y = 90, 165
    draw.rounded_rectangle([card_x - 4, card_y - 4, card_x + base_w + 4, card_y + base_h + 4], radius=16, outline=CYAN_NEON, width=2)
    img.paste(arch_cropped, (card_x, card_y))

    # Right Side Pillar Highlights
    side_x = card_x + base_w + 40
    side_w = W - side_x - 90
    
    pillars = [
        ("01 / FRONTEND UI", "@smoke-monkey/ui", "Drop-in React chat interface\n14 themes • Synthetic transport\nLive tool execution cards", CYAN_NEON, 225),
        ("02 / BACKEND ENGINE", "@smoke-monkey/harness", "6-Phase Autonomous loop\nZero external dependencies\nFail-closed permissions & memory", GREEN_NEON, 275),
        ("03 / PROTOCOL LAYER", "@smoke-monkey/mcp", "Native MCP client & server\nStdio & HTTP SSE connectors\n22 development tools included", AMBER_NEON, 325)
    ]
    
    for idx, (p_num, p_pkg, p_desc, p_col, app_f) in enumerate(pillars):
        if frame_idx >= app_f:
            slide = min(1.0, (frame_idx - app_f) / 15.0)
            offset_x = int((1.0 - slide) * 35)
            cur_x = side_x + offset_x
            py = card_y + idx * 210
            draw.rounded_rectangle([cur_x, py, cur_x + side_w, py + 195], radius=14, fill=BG_PANEL, outline=p_col, width=2)
            draw.text((cur_x + 20, py + 22), p_num, font=FONT_LABEL_SM, fill=p_col)
            draw.text((cur_x + 20, py + 48), p_pkg, font=FONT_CODE_BOLD, fill=TEXT_WHITE)
            
            lines = p_desc.split('\n')
            for l_idx, line in enumerate(lines):
                draw.text((cur_x + 20, py + 90 + l_idx * 28), line, font=FONT_CARD_BODY, fill=TEXT_MUTED)

    # Bottom status banner
    draw.rounded_rectangle([90, H - 90, W - 90, H - 40], radius=10, fill=(14, 20, 36), outline=(40, 55, 90), width=1)
    draw.text((120, H - 65), "⚡ Plug-and-play modular design: use individual pillars or the full unified stack.", font=FONT_LABEL, fill=TEXT_WHITE, anchor="lm")
    draw.text((W - 120, H - 65), "MIT LICENSED", font=FONT_CODE_BOLD, fill=CYAN_NEON, anchor="rm")

    return img

# ==============================================================================
# SCENE 3: LIVE VS CODE TYPING & EXECUTION DEMO (Frames 420 - 719 | 14.0s – 24.0s)
# ==============================================================================
# Code text structure: list of lines, where each line is list of (token_text, color)
FULL_CODE_TOKENS = [
    [("import", TEXT_KEYWORD), (" { ", TEXT_WHITE), ("createAgent", TEXT_FUNC), (" } ", TEXT_WHITE), ("from", TEXT_KEYWORD), (" '@smoke-monkey/harness'", TEXT_STRING), (";", TEXT_WHITE)],
    [],
    [("// 1. Initialize autonomous agent with provider & tools", TEXT_COMMENT)],
    [("const", TEXT_KEYWORD), (" agent = ", TEXT_WHITE), ("createAgent", TEXT_FUNC), ("({", TEXT_WHITE)],
    [("  provider: ", TEXT_WHITE), ("'nvidia'", TEXT_STRING), (", // or openai, anthropic, ollama", TEXT_COMMENT)],
    [("  model: ", TEXT_WHITE), ("'nvidia/nemotron-3-super-120b-a12b'", TEXT_STRING), (",", TEXT_WHITE)],
    [("  apiKey: ", TEXT_WHITE), ("process", TEXT_VAR), (".env.", TEXT_WHITE), ("NVIDIA_API_KEY", TEXT_VAR), (",", TEXT_WHITE)],
    [("  workspacePath: ", TEXT_WHITE), ("process", TEXT_VAR), (".", TEXT_WHITE), ("cwd", TEXT_FUNC), ("(),", TEXT_WHITE)],
    [("});", TEXT_WHITE)],
    [],
    [("// 2. Run 6-phase autonomous mission loop", TEXT_COMMENT)],
    [("const", TEXT_KEYWORD), (" result = ", TEXT_WHITE), ("await", TEXT_KEYWORD), (" agent.", TEXT_WHITE), ("run", TEXT_FUNC), ("(", TEXT_WHITE), ("'Refactor auth to JWT & run tests'", TEXT_STRING), (");", TEXT_WHITE)],
    [("console", TEXT_VAR), (".", TEXT_WHITE), ("log", TEXT_FUNC), ("(result.", TEXT_WHITE), ("status", TEXT_VAR), ("); ", TEXT_WHITE), ("// => 'completed'", TEXT_COMMENT)],
]

# Calculate total characters across all code tokens
total_code_chars = 0
for line in FULL_CODE_TOKENS:
    for tok, _ in line:
        total_code_chars += len(tok)
    total_code_chars += 1 # newline

def render_scene_3(frame_idx):
    img = Image.new('RGB', (W, H), (14, 17, 26))
    draw = ImageDraw.Draw(img)
    draw_watermark(img, draw, frame_idx)

    # Header label
    draw.text((80, 50), "DEVELOPER EXPERIENCE: 20 LINES TO AN AUTONOMOUS AGENT", font=FONT_TITLE, fill=TEXT_WHITE)

    # VS Code Window frame
    win_x, win_y = 80, 105
    win_w, win_h = W - 160, H - 165
    draw.rounded_rectangle([win_x, win_y, win_x + win_w, win_y + win_h], radius=12, fill=(24, 26, 34), outline=(50, 60, 85), width=2)

    # Title bar
    draw.rounded_rectangle([win_x, win_y, win_x + win_w, win_y + 44], radius=12, fill=(30, 33, 44))
    # macOS window buttons
    draw.ellipse([win_x + 18, win_y + 14, win_x + 34, win_y + 30], fill=(255, 95, 86))
    draw.ellipse([win_x + 42, win_y + 14, win_x + 58, win_y + 30], fill=(255, 189, 46))
    draw.ellipse([win_x + 66, win_y + 14, win_x + 82, win_y + 30], fill=(39, 201, 63))
    draw.text((win_x + win_w // 2, win_y + 22), "smoke-monkey-harness — src/agent.ts — Visual Studio Code", font=FONT_LABEL_SM, fill=TEXT_MUTED, anchor="mm")

    # Left Activity Bar
    act_w = 54
    draw.rectangle([win_x, win_y + 44, win_x + act_w, win_y + win_h - 30], fill=(20, 22, 30))
    draw.text((win_x + 27, win_y + 70), "📁", font=FONT_LABEL, fill=TEXT_WHITE, anchor="mm")
    draw.text((win_x + 27, win_y + 120), "🔍", font=FONT_LABEL, fill=TEXT_MUTED, anchor="mm")
    draw.text((win_x + 27, win_y + 170), "🌿", font=FONT_LABEL, fill=TEXT_MUTED, anchor="mm")
    draw.text((win_x + 27, win_y + 220), "🧩", font=FONT_LABEL, fill=TEXT_MUTED, anchor="mm")

    # Sidebar (File Explorer)
    side_w = 260
    draw.rectangle([win_x + act_w, win_y + 44, win_x + act_w + side_w, win_y + win_h - 30], fill=(26, 29, 40))
    draw.text((win_x + act_w + 20, win_y + 65), "EXPLORER", font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 13, index=1), fill=TEXT_MUTED)
    
    files = [
        ("▼ SMOKE-MONKEY-PROJECT", True, CYAN_NEON),
        ("  ▶ .agents/skills", False, TEXT_MUTED),
        ("  ▼ src", True, TEXT_WHITE),
        ("    📄 agent.ts", False, CYAN_NEON),
        ("    📄 auth.ts", False, TEXT_MUTED),
        ("    📄 routes.ts", False, TEXT_MUTED),
        ("  📄 package.json", False, TEXT_MUTED),
        ("  📄 tsconfig.json", False, TEXT_MUTED),
    ]
    for f_idx, (f_name, is_open, f_col) in enumerate(files):
        fy = win_y + 95 + f_idx * 26
        if "agent.ts" in f_name:
            draw.rectangle([win_x + act_w, fy - 4, win_x + act_w + side_w, fy + 22], fill=(36, 44, 66))
        draw.text((win_x + act_w + 16, fy + 2), f_name, font=FONT_CODE_SM, fill=f_col)

    # Editor Tab Bar
    editor_x = win_x + act_w + side_w
    draw.rectangle([editor_x, win_y + 44, win_x + win_w, win_y + 82], fill=(22, 24, 32))
    tab_w = 170
    draw.rectangle([editor_x, win_y + 44, editor_x + tab_w, win_y + 82], fill=(30, 34, 48))
    draw.rectangle([editor_x, win_y + 80, editor_x + tab_w, win_y + 82], fill=BLUE_VSCODE)
    draw.text((editor_x + 20, win_y + 63), "TS", font=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 14, index=1), fill=BLUE_VSCODE, anchor="lm")
    draw.text((editor_x + 48, win_y + 63), "agent.ts", font=FONT_LABEL_SM, fill=TEXT_WHITE, anchor="lm")
    draw.text((editor_x + tab_w - 20, win_y + 63), "×", font=FONT_LABEL_SM, fill=TEXT_MUTED, anchor="mm")

    # Code Editor Pane
    code_h = 440
    draw.rectangle([editor_x, win_y + 82, win_x + win_w, win_y + 82 + code_h], fill=(18, 20, 28))

    # Typing Progress calculation (frames 420 to 540)
    typing_progress = min(1.0, max(0.0, (frame_idx - 420) / 120.0))
    chars_to_type = int(typing_progress * total_code_chars)
    
    # Blinking cursor condition
    cursor_on = ((frame_idx // 8) % 2 == 0)
    cursor_pos = None

    chars_printed = 0
    done_typing = False
    for l_idx, line in enumerate(FULL_CODE_TOKENS):
        ly = win_y + 105 + l_idx * 30
        draw.text((editor_x + 35, ly), str(l_idx + 1), font=FONT_CODE_SM, fill=(80, 90, 115), anchor="rm")
        cur_cx = editor_x + 55
        
        for token_text, token_color in line:
            if done_typing:
                break
            tok_len = len(token_text)
            if chars_printed + tok_len <= chars_to_type:
                # Full token fits
                draw.text((cur_cx, ly), token_text, font=FONT_CODE, fill=token_color)
                cur_cx += draw.textlength(token_text, font=FONT_CODE)
                chars_printed += tok_len
            else:
                # Partial token
                rem = chars_to_type - chars_printed
                if rem > 0:
                    sub_text = token_text[:rem]
                    draw.text((cur_cx, ly), sub_text, font=FONT_CODE, fill=token_color)
                    cur_cx += draw.textlength(sub_text, font=FONT_CODE)
                    chars_printed += rem
                cursor_pos = (cur_cx, ly)
                done_typing = True
                break
        chars_printed += 1 # newline
        if done_typing:
            break
            
    if cursor_pos is None:
        # At end of code
        cursor_pos = (cur_cx, win_y + 105 + (len(FULL_CODE_TOKENS) - 1) * 30)

    # Draw blinking cursor in editor if still in editor typing phase
    if frame_idx < 550 and cursor_on and cursor_pos:
        draw.rectangle([cursor_pos[0] + 2, cursor_pos[1] + 2, cursor_pos[0] + 4, cursor_pos[1] + 22], fill=CYAN_NEON)

    # Terminal Pane (Bottom)
    term_y = win_y + 82 + code_h
    term_h = win_h - (82 + code_h) - 30
    draw.rectangle([editor_x, term_y, win_x + win_w, term_y + term_h], fill=(14, 16, 22))
    
    # Terminal tabs
    draw.rectangle([editor_x, term_y, win_x + win_w, term_y + 36], fill=(20, 23, 32))
    draw.text((editor_x + 20, term_y + 18), "TERMINAL", font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 14, index=1), fill=TEXT_WHITE, anchor="lm")
    draw.text((editor_x + 120, term_y + 18), "OUTPUT", font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 14, index=0), fill=TEXT_MUTED, anchor="lm")
    draw.text((editor_x + 200, term_y + 18), "DEBUG CONSOLE", font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 14, index=0), fill=TEXT_MUTED, anchor="lm")
    draw.text((editor_x + 340, term_y + 18), "PROBLEMS", font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 14, index=0), fill=TEXT_MUTED, anchor="lm")

    # Terminal logs streaming in sequentially (frames 540 to 719)
    term_schedule = [
        ("$ pnpm add @smoke-monkey/harness && npx tsx src/agent.ts", CYAN_NEON, 545),
        ("⚡ [EXPLORE]  Inspecting workspace AST & auth routes in src/auth.ts...", TEXT_WHITE, 580),
        ("📋 [PLAN]     Formulated 3-step patch: JWT middleware, token signer, unit tests", AMBER_NEON, 615),
        ("🛠️  [EDIT]     Tool:write_file -> patched src/auth.ts (+42 lines, -18 lines)", GREEN_NEON, 650),
        ("🔍 [VERIFY]   Executing: pnpm test -> 14 passed (100% test suite green)", CYAN_NEON, 680),
        ("✨ [COMPLETE] Autonomous mission finished successfully in 3.84s!", GREEN_NEON, 700),
    ]
    for t_idx, (t_text, t_col, appear_f) in enumerate(term_schedule):
        if frame_idx >= appear_f:
            ty = term_y + 50 + t_idx * 26
            draw.text((editor_x + 24, ty), t_text, font=FONT_CODE_SM, fill=t_col)

    # Terminal cursor
    if frame_idx >= 545 and frame_idx < 715 and cursor_on:
        active_t_idx = sum(1 for _, _, af in term_schedule if frame_idx >= af)
        cur_ty = term_y + 50 + active_t_idx * 26
        draw.rectangle([editor_x + 24, cur_ty + 2, editor_x + 32, cur_ty + 18], fill=TEXT_WHITE)

    # VS Code Status Bar
    status_y = win_y + win_h - 30
    draw.rectangle([win_x, status_y, win_x + win_w, win_y + win_h], fill=BLUE_VSCODE)
    draw.text((win_x + 20, status_y + 15), "🌿 main*", font=FONT_LABEL_SM, fill=TEXT_WHITE, anchor="lm")
    draw.text((win_x + 120, status_y + 15), "✕ 0  ⚠ 0", font=FONT_LABEL_SM, fill=TEXT_WHITE, anchor="lm")
    draw.text((win_x + win_w - 240, status_y + 15), "Smoke Monkey: ACTIVE", font=FONT_LABEL_SM, fill=TEXT_WHITE, anchor="lm")
    draw.text((win_x + win_w - 40, status_y + 15), "UTF-8", font=FONT_LABEL_SM, fill=TEXT_WHITE, anchor="rm")

    return img

# ==============================================================================
# SCENE 4: 6-PHASE LOOP & THE 3 INTERACTIVE PAUSES (Frames 720 - 989 | 24.0s – 33.0s)
# ==============================================================================
def render_scene_4(frame_idx):
    img = base_bg.copy()
    draw = ImageDraw.Draw(img)
    draw_dynamic_particles(draw, frame_idx)
    draw_watermark(img, draw, frame_idx)

    # Header
    draw.text((90, 65), "THE 6-PHASE LOOP & SAFE HUMAN-IN-THE-LOOP", font=FONT_TITLE, fill=TEXT_WHITE)
    draw.text((90, 115), "Self-healing state machine with fail-closed permission gates", font=FONT_SUBTITLE, fill=CYAN_NEON)

    # Dual Card Layout
    card_w = 830
    card_h = 464
    card_y = 175
    
    # Left Card: 6-Phase Loop
    card1_x = 90
    loop_scaled = loop_img_orig.resize((card_w, card_h), Image.Resampling.LANCZOS)
    draw.rounded_rectangle([card1_x - 3, card_y - 3, card1_x + card_w + 3, card_y + card_h + 3], radius=14, outline=CYAN_NEON, width=2)
    img.paste(loop_scaled, (card1_x, card_y))

    # Right Card: 3 Interactive Pauses
    card2_x = W - card_w - 90
    pause_scaled = pause_img_orig.resize((card_w, card_h), Image.Resampling.LANCZOS)
    draw.rounded_rectangle([card2_x - 3, card_y - 3, card2_x + card_w + 3, card_y + card_h + 3], radius=14, outline=AMBER_NEON, width=2)
    img.paste(pause_scaled, (card2_x, card_y))

    # Dynamic Active Phase Indicator banner on left card
    phases = ["EXPLORE", "PLAN", "EDIT", "VERIFY", "RECOVER / COMPLETE"]
    phase_idx = min(4, int((frame_idx - 720) / (270.0 / len(phases))))
    active_phase = phases[phase_idx]
    
    p_box_w, p_box_h = 280, 40
    draw.rounded_rectangle([card1_x + 20, card_y + 20, card1_x + 20 + p_box_w, card_y + 20 + p_box_h], radius=8, fill=(16, 25, 45), outline=CYAN_NEON, width=2)
    draw.text((card1_x + 20 + p_box_w // 2, card_y + 20 + p_box_h // 2), f"ACTIVE: {active_phase}", font=FONT_CODE_BOLD, fill=CYAN_NEON, anchor="mm")

    # Bottom 3 Feature Detail Cards
    f_y = card_y + card_h + 35
    f_w = (W - 180 - 40) // 3
    features = [
        ("AUTONOMOUS RESILIENCE", "explore → plan → edit → verify → recover\nSelf-heals from runtime errors automatically\nZero runaway step guarantee with loop guards", CYAN_NEON),
        ("THE 3 INTERACTIVE PAUSES", "permission.required: user tool approval\nask_user.required: clarification prompts\nmcp.approval_required: external server gates", AMBER_NEON),
        ("94% TOKEN EFFICIENCY", "Two-tier Just-In-Time SKILL.md injection\nLoads skill bodies only when tools are triggered\nMulti-root discovery (.agents/skills, .claude/)", GREEN_NEON)
    ]
    for idx, (f_title, f_desc, f_col) in enumerate(features):
        fx = 90 + idx * (f_w + 20)
        draw.rounded_rectangle([fx, f_y, fx + f_w, f_y + 175], radius=12, fill=BG_PANEL, outline=f_col, width=2)
        draw.text((fx + 20, f_y + 20), f_title, font=FONT_CARD_TITLE, fill=f_col)
        lines = f_desc.split('\n')
        for l_idx, line in enumerate(lines):
            draw.text((fx + 20, f_y + 60 + l_idx * 28), line, font=FONT_CARD_BODY, fill=TEXT_WHITE)

    return img

# ==============================================================================
# SCENE 5: FINALE & DEVELOPER CALL TO ACTION (Frames 990 - 1199 | 33.0s – 40.0s)
# ==============================================================================
def render_scene_5(frame_idx):
    img = base_bg.copy()
    draw = ImageDraw.Draw(img)
    draw_dynamic_particles(draw, frame_idx)

    cx = W // 2
    
    # Brand Mascot Hero Centered Top with breathing pulse
    pulse = 1.0 + 0.04 * math.sin(frame_idx * 0.12)
    icon_size = int(210 * pulse)
    icon_resized = brand_icon_orig.resize((icon_size, icon_size), Image.Resampling.LANCZOS)
    img.paste(icon_resized, (cx - icon_size // 2, 60), icon_resized)

    # Radiant glowing ring around mascot
    draw.ellipse([cx - 122, 43, cx + 122, 287], outline=CYAN_NEON, width=2)
    draw.ellipse([cx - 138, 27, cx + 138, 303], outline=PURPLE_GLOW, width=1)

    # Title & Subtitle
    draw.text((cx, 315), "BUILD YOUR NEXT AI AGENT TODAY", font=FONT_TITLE_HERO, fill=TEXT_WHITE, anchor="mm")
    draw.text((cx, 370), "Production TypeScript Runtime • Framework Agnostic • MIT Licensed", font=FONT_SUBTITLE, fill=CYAN_NEON, anchor="mm")

    # Giant Developer Install Command Box
    box_w, box_h = 1000, 140
    box_x = (W - box_w) // 2
    box_y = 425
    draw.rounded_rectangle([box_x, box_y, box_x + box_w, box_y + box_h], radius=16, fill=(18, 25, 45), outline=CYAN_NEON, width=3)
    
    # Terminal Header in install box
    draw.text((box_x + 40, box_y + 35), "⚡ INSTALL VIA NPM OR PNPM:", font=FONT_LABEL_SM, fill=AMBER_NEON)
    draw.text((box_x + 40, box_y + 85), "$ npm install @smoke-monkey/harness", font=FONT_CODE_LG, fill=TEXT_WHITE)
    
    # Copy pill with pulse
    copy_pulse = (math.sin(frame_idx * 0.2) + 1) / 2
    copy_col = (int(0 + 50 * copy_pulse), 245, int(212 + 40 * copy_pulse))
    draw.text((box_x + box_w - 50, box_y + 85), "📋 COPY", font=FONT_LABEL, fill=copy_col, anchor="rm")

    # Alternative install note
    draw.text((cx, box_y + box_h + 30), "Also available on GitHub Packages: @rajdeepdevelopment/smoke-monkey-harness", font=FONT_LABEL_SM, fill=TEXT_MUTED, anchor="mm")

    # Two Main Link Cards (GitHub Repo & Documentation Site)
    link_w = 480
    link_h = 170
    link_y = 650

    # GitHub Card
    gh_x = cx - link_w - 20
    draw.rounded_rectangle([gh_x, link_y, gh_x + link_w, link_y + link_h], radius=14, fill=BG_PANEL, outline=(90, 115, 170), width=2)
    draw.text((gh_x + 30, link_y + 30), "⭐ GITHUB REPOSITORY", font=FONT_LABEL, fill=AMBER_NEON)
    draw.text((gh_x + 30, link_y + 68), "github.com/RajdeepDevelopment", font=FONT_CARD_TITLE, fill=TEXT_WHITE)
    draw.text((gh_x + 30, link_y + 102), "/smoke-monkey-harness", font=FONT_CARD_TITLE, fill=CYAN_NEON)
    draw.text((gh_x + 30, link_y + 138), "Star the repo • Fork • Contribute", font=FONT_CARD_BODY, fill=TEXT_MUTED)

    # Docs Card
    doc_x = cx + 20
    draw.rounded_rectangle([doc_x, link_y, doc_x + link_w, link_y + link_h], radius=14, fill=BG_PANEL, outline=CYAN_NEON, width=2)
    draw.text((doc_x + 30, link_y + 30), "🌐 INTERACTIVE DOCS & SIMULATOR", font=FONT_LABEL, fill=GREEN_NEON)
    draw.text((doc_x + 30, link_y + 70), "smoke-monkey-harness", font=FONT_CARD_TITLE, fill=TEXT_WHITE)
    draw.text((doc_x + 30, link_y + 104), ".vercel.app", font=FONT_CARD_TITLE, fill=CYAN_NEON)
    draw.text((doc_x + 30, link_y + 138), "10 Chapters • Live browser simulator", font=FONT_CARD_BODY, fill=TEXT_MUTED)

    # Bottom Tagline
    draw.text((cx, H - 70), "SMOKE MONKEY HARNESS • DEVELOPED BY RAJDEEP DEVELOPMENT • MIT LICENSE", font=FONT_LABEL_SM, fill=TEXT_MUTED, anchor="mm")

    # Smooth fade out to black at the end (last 35 frames: 1165 to 1199)
    if frame_idx >= 1165:
        fade = (frame_idx - 1165) / 34.0
        black_overlay = Image.new('RGB', (W, H), (0, 0, 0))
        img = Image.blend(img, black_overlay, fade)

    return img

# ==============================================================================
# MAIN RENDERER & FFMPEG PIPE
# ==============================================================================
def render_full_video():
    print(f"Starting 40-second promotional video generation ({TOTAL_FRAMES} frames @ {FPS} fps)...")
    t_start = time.time()
    
    # Transition ranges (12 frames = 0.4s crossfades)
    T_LEN = 12
    
    temp_video_only = '/tmp/promo_video_novideo.mp4'

    ffmpeg_cmd = [
        'ffmpeg', '-y',
        '-f', 'rawvideo',
        '-vcodec', 'rawvideo',
        '-s', f'{W}x{H}',
        '-pix_fmt', 'rgb24',
        '-r', str(FPS),
        '-i', '-',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-b:v', '9M',
        '-pix_fmt', 'yuv420p',
        temp_video_only
    ]

    proc = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)

    for f in range(TOTAL_FRAMES):
        # Determine active scene & transitions
        if f < 210 - T_LEN:
            frame_img = render_scene_1(f)
        elif f < 210:
            # Crossfade Scene 1 -> Scene 2
            alpha = (f - (210 - T_LEN)) / float(T_LEN)
            s1 = render_scene_1(f)
            s2 = render_scene_2(f)
            frame_img = Image.blend(s1, s2, alpha)
        elif f < 420 - T_LEN:
            frame_img = render_scene_2(f)
        elif f < 420:
            # Crossfade Scene 2 -> Scene 3
            alpha = (f - (420 - T_LEN)) / float(T_LEN)
            s2 = render_scene_2(f)
            s3 = render_scene_3(f)
            frame_img = Image.blend(s2, s3, alpha)
        elif f < 720 - T_LEN:
            frame_img = render_scene_3(f)
        elif f < 720:
            # Crossfade Scene 3 -> Scene 4
            alpha = (f - (720 - T_LEN)) / float(T_LEN)
            s3 = render_scene_3(f)
            s4 = render_scene_4(f)
            frame_img = Image.blend(s3, s4, alpha)
        elif f < 990 - T_LEN:
            frame_img = render_scene_4(f)
        elif f < 990:
            # Crossfade Scene 4 -> Scene 5
            alpha = (f - (990 - T_LEN)) / float(T_LEN)
            s4 = render_scene_4(f)
            s5 = render_scene_5(f)
            frame_img = Image.blend(s4, s5, alpha)
        else:
            frame_img = render_scene_5(f)

        proc.stdin.write(frame_img.tobytes())
        
        if f % 120 == 0 or f == TOTAL_FRAMES - 1:
            sec = f / FPS
            fps_so_far = (f + 1) / max(0.001, (time.time() - t_start))
            print(f"Rendered frame {f}/{TOTAL_FRAMES} ({sec:.1f}s / {TOTAL_DURATION}s) - {fps_so_far:.1f} fps")

    proc.stdin.close()
    proc.wait()
    t_video_done = time.time()
    print(f"Video stream encoded in {t_video_done - t_start:.2f}s!")

    # Merge Video with Synchronized Audio Track
    print("Muxing video with 40-second audio soundtrack...")
    os.makedirs(os.path.dirname(OUT_VIDEO_SITE), exist_ok=True)
    os.makedirs(os.path.dirname(OUT_VIDEO_LANDING), exist_ok=True)

    mux_cmd = [
        'ffmpeg', '-y',
        '-i', temp_video_only,
        '-i', AUDIO_PATH,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '256k',
        '-shortest',
        OUT_VIDEO_SITE
    ]
    subprocess.run(mux_cmd, check=True)
    
    # Copy to landing page public directory as well
    subprocess.run(['cp', OUT_VIDEO_SITE, OUT_VIDEO_LANDING], check=True)
    
    total_time = time.time() - t_start
    print(f"SUCCESS! Final 40-second promotional video created in {total_time:.2f}s!")
    print(f"  Docs site destination: {OUT_VIDEO_SITE}")
    print(f"  Landing page destination: {OUT_VIDEO_LANDING}")

if __name__ == '__main__':
    render_full_video()
