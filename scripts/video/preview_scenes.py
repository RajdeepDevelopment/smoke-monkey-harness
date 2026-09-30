import math
import random
from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080

# Paths
BRAND_ICON_PATH = '/Users/rajdeepsadhu/Desktop/Testing/RAG/smoke-monkey-landing/public/ChatGPT Image Sep 28, 2026, 01_15_59 AM.png'
ARCH_PATH = 'assets/smoke_monkey_trio_architecture.jpg'
LOOP_PATH = 'assets/smoke_monkey_phase_loop.jpg'
PAUSE_PATH = 'assets/smoke_monkey_interactive_pauses.jpg'

# Fonts
FONT_TITLE_HERO = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 64, index=1)
FONT_TITLE = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 48, index=1)
FONT_SUBTITLE = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 28, index=0)
FONT_HEADING = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 36, index=1)
FONT_CARD_TITLE = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 26, index=1)
FONT_CARD_BODY = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 20, index=0)
FONT_LABEL = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 20, index=1)
FONT_LABEL_SM = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 16, index=1)

FONT_CODE = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 22, index=0)
FONT_CODE_BOLD = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 22, index=1)
FONT_CODE_SM = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 17, index=0)
FONT_CODE_LG = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 38, index=1)

# Colors
BG_DARK = (8, 11, 20)
BG_PANEL = (15, 20, 35)
BG_CODE = (22, 27, 42)
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

# Load assets
brand_icon_orig = Image.open(BRAND_ICON_PATH).convert('RGBA')
arch_img_orig = Image.open(ARCH_PATH).convert('RGB')
loop_img_orig = Image.open(LOOP_PATH).convert('RGB')
pause_img_orig = Image.open(PAUSE_PATH).convert('RGB')

def draw_cyber_grid(draw, frame_idx):
    grid_spacing = 60
    offset_y = (frame_idx * 1.5) % grid_spacing
    for x in range(0, W, grid_spacing):
        draw.line([(x, 0), (x, H)], fill=(16, 23, 40), width=1)
    for y in range(0, H, grid_spacing):
        y_pos = y + offset_y
        if y_pos <= H:
            draw.line([(0, y_pos), (W, y_pos)], fill=(16, 23, 40), width=1)

def draw_particles(draw, frame_idx, seed=42):
    random.seed(seed)
    for i in range(35):
        base_x = random.randint(0, W)
        base_y = random.randint(0, H)
        speed = random.uniform(0.5, 2.0)
        size = random.randint(2, 4)
        y = (base_y - frame_idx * speed) % H
        x = (base_x + math.sin(frame_idx * 0.05 + i) * 15) % W
        color = CYAN_NEON if i % 3 == 0 else (AMBER_NEON if i % 3 == 1 else PURPLE_GLOW)
        draw.ellipse([x, y, x + size, y + size], fill=color)

def draw_watermark(img, draw, frame_idx):
    # Sleek brand watermark top-right
    icon_sm = brand_icon_orig.resize((52, 52), Image.Resampling.LANCZOS)
    img.paste(icon_sm, (W - 275, 24), icon_sm)
    draw.text((W - 210, 28), "SMOKE MONKEY", font=FONT_LABEL, fill=TEXT_WHITE)
    draw.text((W - 210, 52), "HARNESS v1.3.1", font=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 13, index=1), fill=CYAN_NEON)
    # Active indicator
    pulse = (math.sin(frame_idx * 0.15) + 1) / 2
    r_val = int(0 + 50 * pulse)
    g_val = int(200 + 55 * pulse)
    draw.ellipse([W - 286, 44, W - 280, 50], fill=(r_val, g_val, 128))

# ==============================================================================
# SCENE 1: CINEMATIC INTRO & BRAND REVEAL (0s - 7s | Frames 0 - 209)
# ==============================================================================
def render_scene_1(frame_idx=100):
    img = Image.new('RGB', (W, H), BG_DARK)
    draw = ImageDraw.Draw(img)
    draw_cyber_grid(draw, frame_idx)
    draw_particles(draw, frame_idx)

    cx, cy = W // 2, H // 2 - 75
    
    # Animated Brand Mascot
    pulse = 1.0 + 0.035 * math.sin(frame_idx * 0.1)
    icon_size = int(310 * pulse)
    icon_resized = brand_icon_orig.resize((icon_size, icon_size), Image.Resampling.LANCZOS)
    
    # Concentric glowing rings
    ring_radius = int(icon_size * 0.58)
    draw.ellipse([cx - ring_radius, cy - ring_radius, cx + ring_radius, cy + ring_radius], 
                 outline=CYAN_NEON, width=3)
    ring_outer = ring_radius + 16
    draw.ellipse([cx - ring_outer, cy - ring_outer, cx + ring_outer, cy + ring_outer], 
                 outline=PURPLE_GLOW, width=2)
    
    # Paste Mascot
    img.paste(icon_resized, (cx - icon_size // 2, cy - icon_size // 2), icon_resized)
    
    # Tech header
    draw.text((cx, cy + 215), "// PRODUCTION-GRADE AGENT INFRASTRUCTURE", font=FONT_CODE_SM, fill=CYAN_NEON, anchor="mm")
    draw.text((cx, cy + 280), "SMOKE MONKEY HARNESS", font=FONT_TITLE_HERO, fill=TEXT_WHITE, anchor="mm")
    draw.text((cx, cy + 340), "Build Autonomous Coding Agents in TypeScript • Zero Runtime Dependencies", font=FONT_SUBTITLE, fill=TEXT_MUTED, anchor="mm")
    
    # 4 Feature Badges
    badges = [
        ("0 DEPENDENCIES", CYAN_NEON),
        ("NATIVE MCP CLIENT", GREEN_NEON),
        ("JIT SKILL.md (-94% TOKENS)", AMBER_NEON),
        ("6-PHASE STATE MACHINE", MAGENTA_NEON)
    ]
    card_w = 265
    gap = 20
    total_w = 4 * card_w + 3 * gap
    start_x = (W - total_w) // 2
    for idx, (b_text, b_color) in enumerate(badges):
        bx = start_x + idx * (card_w + gap)
        by = H - 110
        draw.rounded_rectangle([bx, by, bx + card_w, by + 46], radius=10, fill=(16, 23, 42), outline=b_color, width=2)
        draw.text((bx + card_w // 2, by + 23), b_text, font=FONT_LABEL_SM, fill=TEXT_WHITE, anchor="mm")

    return img

# ==============================================================================
# SCENE 2: 3-PILLAR UNIFIED ARCHITECTURE (7s - 14s | Frames 210 - 419)
# ==============================================================================
def render_scene_2(frame_idx=315):
    img = Image.new('RGB', (W, H), BG_DARK)
    draw = ImageDraw.Draw(img)
    draw_cyber_grid(draw, frame_idx)
    draw_particles(draw, frame_idx)
    draw_watermark(img, draw, frame_idx)

    # Section Title Header
    draw.text((90, 70), "UNIFIED 3-PILLAR ECOSYSTEM", font=FONT_TITLE, fill=TEXT_WHITE)
    draw.text((90, 120), "Frontend UI • Backend Engine • Model Context Protocol (MCP)", font=FONT_SUBTITLE, fill=CYAN_NEON)

    # Center Visual: Architecture diagram framed in glassmorphism
    arch_w, arch_h = 1100, 614
    arch_scaled = arch_img_orig.resize((arch_w, arch_h), Image.Resampling.LANCZOS)
    
    card_x, card_y = 90, 165
    # Outer glow card
    draw.rounded_rectangle([card_x - 4, card_y - 4, card_x + arch_w + 4, card_y + arch_h + 4], radius=16, outline=CYAN_NEON, width=2)
    img.paste(arch_scaled, (card_x, card_y))

    # Right Side Pillar Highlights
    side_x = card_x + arch_w + 40
    side_w = W - side_x - 90
    
    pillars = [
        ("01 / FRONTEND UI", "@smoke-monkey/ui", "Drop-in React chat interface\n14 themes • Synthetic transport\nLive tool execution cards", CYAN_NEON),
        ("02 / BACKEND ENGINE", "@smoke-monkey/harness", "6-Phase Autonomous loop\nZero external dependencies\nFail-closed permissions & memory", GREEN_NEON),
        ("03 / PROTOCOL LAYER", "@smoke-monkey/mcp", "Native MCP client & server\nStdio & HTTP SSE connectors\n22 development tools included", AMBER_NEON)
    ]
    
    for idx, (p_num, p_pkg, p_desc, p_col) in enumerate(pillars):
        py = card_y + idx * 210
        draw.rounded_rectangle([side_x, py, side_x + side_w, py + 195], radius=14, fill=BG_PANEL, outline=p_col, width=2)
        draw.text((side_x + 20, py + 22), p_num, font=FONT_LABEL_SM, fill=p_col)
        draw.text((side_x + 20, py + 48), p_pkg, font=FONT_CODE_BOLD, fill=TEXT_WHITE)
        
        # Multiline description
        lines = p_desc.split('\n')
        for l_idx, line in enumerate(lines):
            draw.text((side_x + 20, py + 90 + l_idx * 28), line, font=FONT_CARD_BODY, fill=TEXT_MUTED)

    # Bottom status banner
    draw.rounded_rectangle([90, H - 90, W - 90, H - 40], radius=10, fill=(14, 20, 36), outline=(40, 55, 90), width=1)
    draw.text((120, H - 65), "⚡ Plug-and-play modular design: use individual pillars or the full unified stack.", font=FONT_LABEL, fill=TEXT_WHITE, anchor="lm")
    draw.text((W - 120, H - 65), "MIT LICENSED", font=FONT_CODE_BOLD, fill=CYAN_NEON, anchor="rm")

    return img

# ==============================================================================
# SCENE 3: LIVE VS CODE TYPING & EXECUTION DEMO (14s - 24s | Frames 420 - 719)
# ==============================================================================
def render_scene_3(frame_idx=620):
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
    # Activity bar icons (represented cleanly)
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
    # Active Tab
    tab_w = 170
    draw.rectangle([editor_x, win_y + 44, editor_x + tab_w, win_y + 82], fill=(30, 34, 48))
    draw.rectangle([editor_x, win_y + 80, editor_x + tab_w, win_y + 82], fill=BLUE_VSCODE) # Active line
    draw.text((editor_x + 20, win_y + 63), "TS", font=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 14, index=1), fill=BLUE_VSCODE, anchor="lm")
    draw.text((editor_x + 48, win_y + 63), "agent.ts", font=FONT_LABEL_SM, fill=TEXT_WHITE, anchor="lm")
    draw.text((editor_x + tab_w - 20, win_y + 63), "×", font=FONT_LABEL_SM, fill=TEXT_MUTED, anchor="mm")

    # Code Editor Pane
    code_h = 440
    draw.rectangle([editor_x, win_y + 82, win_x + win_w, win_y + 82 + code_h], fill=(18, 20, 28))

    # Code Lines (Syntax Highlighted)
    code_lines = [
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

    for l_idx, line in enumerate(code_lines):
        ly = win_y + 105 + l_idx * 30
        # Line number
        draw.text((editor_x + 35, ly), str(l_idx + 1), font=FONT_CODE_SM, fill=(80, 90, 115), anchor="rm")
        # Line text tokens
        cur_cx = editor_x + 55
        for token_text, token_color in line:
            draw.text((cur_cx, ly), token_text, font=FONT_CODE, fill=token_color)
            cur_cx += draw.textlength(token_text, font=FONT_CODE)

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

    # Terminal logs
    term_lines = [
        ("$ pnpm add @smoke-monkey/harness && npx tsx src/agent.ts", CYAN_NEON),
        ("⚡ [EXPLORE]  Inspecting workspace AST & auth routes in src/auth.ts...", TEXT_WHITE),
        ("📋 [PLAN]     Formulated 3-step patch: JWT middleware, token signer, unit tests", AMBER_NEON),
        ("🛠️  [EDIT]     Tool:write_file -> patched src/auth.ts (+42 lines, -18 lines)", GREEN_NEON),
        ("🔍 [VERIFY]   Executing: pnpm test -> 14 passed (100% test suite green)", CYAN_NEON),
        ("✨ [COMPLETE] Autonomous mission finished successfully in 3.84s!", GREEN_NEON),
    ]
    for t_idx, (t_text, t_col) in enumerate(term_lines):
        ty = term_y + 50 + t_idx * 26
        draw.text((editor_x + 24, ty), t_text, font=FONT_CODE_SM, fill=t_col)

    # VS Code Status Bar
    status_y = win_y + win_h - 30
    draw.rectangle([win_x, status_y, win_x + win_w, win_y + win_h], fill=BLUE_VSCODE)
    draw.text((win_x + 20, status_y + 15), "🌿 main*", font=FONT_LABEL_SM, fill=TEXT_WHITE, anchor="lm")
    draw.text((win_x + 120, status_y + 15), "✕ 0  ⚠ 0", font=FONT_LABEL_SM, fill=TEXT_WHITE, anchor="lm")
    draw.text((win_x + win_w - 240, status_y + 15), "Smoke Monkey: ACTIVE", font=FONT_LABEL_SM, fill=TEXT_WHITE, anchor="lm")
    draw.text((win_x + win_w - 40, status_y + 15), "UTF-8", font=FONT_LABEL_SM, fill=TEXT_WHITE, anchor="rm")

    return img

# ==============================================================================
# SCENE 4: 6-PHASE LOOP & THE 3 INTERACTIVE PAUSES (24s - 33s | Frames 720 - 989)
# ==============================================================================
def render_scene_4(frame_idx=850):
    img = Image.new('RGB', (W, H), BG_DARK)
    draw = ImageDraw.Draw(img)
    draw_cyber_grid(draw, frame_idx)
    draw_particles(draw, frame_idx)
    draw_watermark(img, draw, frame_idx)

    # Header
    draw.text((90, 65), "THE 6-PHASE LOOP & SAFE HUMAN-IN-THE-LOOP", font=FONT_TITLE, fill=TEXT_WHITE)
    draw.text((90, 115), "Self-healing state machine with fail-closed permission gates", font=FONT_SUBTITLE, fill=CYAN_NEON)

    # Dual Card Layout (Loop diagram on left, Interactive pauses diagram on right)
    card_w = 830
    card_h = 464
    card_y = 175
    
    # Left: 6-Phase Loop
    card1_x = 90
    loop_scaled = loop_img_orig.resize((card_w, card_h), Image.Resampling.LANCZOS)
    draw.rounded_rectangle([card1_x - 3, card_y - 3, card1_x + card_w + 3, card_y + card_h + 3], radius=14, outline=CYAN_NEON, width=2)
    img.paste(loop_scaled, (card1_x, card_y))

    # Right: 3 Interactive Pauses
    card2_x = W - card_w - 90
    pause_scaled = pause_img_orig.resize((card_w, card_h), Image.Resampling.LANCZOS)
    draw.rounded_rectangle([card2_x - 3, card_y - 3, card2_x + card_w + 3, card_y + card_h + 3], radius=14, outline=AMBER_NEON, width=2)
    img.paste(pause_scaled, (card2_x, card_y))

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
# SCENE 5: FINALE & DEVELOPER CALL TO ACTION (33s - 40s | Frames 990 - 1199)
# ==============================================================================
def render_scene_5(frame_idx=1080):
    img = Image.new('RGB', (W, H), BG_DARK)
    draw = ImageDraw.Draw(img)
    draw_cyber_grid(draw, frame_idx)
    draw_particles(draw, frame_idx)

    # Ambient center aura
    cx = W // 2
    
    # Brand Mascot Hero Centered Top
    icon_size = 210
    icon_resized = brand_icon_orig.resize((icon_size, icon_size), Image.Resampling.LANCZOS)
    img.paste(icon_resized, (cx - icon_size // 2, 60), icon_resized)

    # Mascot Glowing Ring
    draw.ellipse([cx - 120, 45, cx + 120, 285], outline=CYAN_NEON, width=2)

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
    draw.text((box_x + box_w - 50, box_y + 85), "📋 COPY", font=FONT_LABEL, fill=CYAN_NEON, anchor="rm")

    # Alternative install pill
    draw.text((cx, box_y + box_h + 30), "Also available on GitHub Packages: @rajdeepdevelopment/smoke-monkey-harness", font=FONT_LABEL_SM, fill=TEXT_MUTED, anchor="mm")

    # Two Main Link Cards (GitHub Repo & Documentation Site)
    link_w = 480
    link_h = 170
    link_y = 650

    # GitHub Card
    gh_x = cx - link_w - 20
    draw.rounded_rectangle([gh_x, link_y, gh_x + link_w, link_y + link_h], radius=14, fill=BG_PANEL, outline=(80, 100, 150), width=2)
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

    return img

if __name__ == '__main__':
    print("Generating preview frames...")
    render_scene_1().save('/tmp/preview_scene_1.png')
    render_scene_2().save('/tmp/preview_scene_2.png')
    render_scene_3().save('/tmp/preview_scene_3.png')
    render_scene_4().save('/tmp/preview_scene_4.png')
    render_scene_5().save('/tmp/preview_scene_5.png')
    print("All 5 preview frames saved to /tmp/preview_scene_*.png!")
