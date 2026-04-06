#!/usr/bin/env python3
"""Generate a 55-second 'youtube poop' style timelapse video for the Self-Growing Karpathy LLM Wiki."""

import os
import shutil
import subprocess
from PIL import Image, ImageDraw, ImageFont

# --- Config ---
W, H = 1080, 1920  # Vertical (9:16) for mobile
FPS = 30
OUT_DIR = "/tmp/llm-wiki-video/frames"
AUDIO_OUT = "/tmp/llm-wiki-video"
FINAL = os.path.expanduser("~/vibedev/karpathy-llm-wiki/timelapse.mp4")

# Colors
BG = "#0d1117"        # GitHub dark
BG2 = "#161b22"       # Card bg
ACCENT = "#58a6ff"    # GitHub blue
GREEN = "#3fb950"     # GitHub green
YELLOW = "#d29922"
RED = "#f85149"
WHITE = "#e6edf3"
GRAY = "#8b949e"
DIMGRAY = "#484f58"

def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

# Try to load a monospace font
FONT_PATHS = [
    "/System/Library/Fonts/SFMono-Regular.otf",
    "/System/Library/Fonts/Menlo.ttc",
    "/System/Library/Fonts/Monaco.dfont",
    "/Library/Fonts/SF-Mono-Regular.otf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
]
FONT_BOLD_PATHS = [
    "/System/Library/Fonts/SFMono-Bold.otf",
    "/System/Library/Fonts/Menlo.ttc",
    "/Library/Fonts/SF-Mono-Bold.otf",
]

def find_font(paths):
    for p in paths:
        if os.path.exists(p):
            return p
    return None

MONO_PATH = find_font(FONT_PATHS)
BOLD_PATH = find_font(FONT_BOLD_PATHS) or MONO_PATH

def font(size, bold=False):
    path = BOLD_PATH if bold else MONO_PATH
    if path:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            pass
    return ImageFont.load_default()

def new_frame():
    return Image.new("RGB", (W, H), hex_to_rgb(BG))

def draw_text(draw, x, y, text, color=WHITE, size=28, bold=False, anchor=None):
    f = font(size, bold)
    draw.text((x, y), text, fill=hex_to_rgb(color), font=f, anchor=anchor)
    bbox = f.getbbox(text)
    return bbox[3] - bbox[1] if bbox else size

def draw_rounded_rect(draw, x, y, w, h, color, radius=16):
    draw.rounded_rectangle([x, y, x+w, y+h], radius=radius, fill=hex_to_rgb(color))

def draw_terminal_box(draw, x, y, w, h, lines, title=None):
    """Draw a terminal-style box with colored dots and text lines."""
    draw_rounded_rect(draw, x, y, w, h, BG2, radius=12)
    # Title bar dots
    dot_y = y + 16
    for i, c in enumerate(["#ff5f57", "#febc2e", "#28c840"]):
        draw.ellipse([x+16+i*24, dot_y, x+28+i*24, dot_y+12], fill=hex_to_rgb(c))
    if title:
        draw_text(draw, x+100, y+10, title, GRAY, 20)
    # Lines
    ly = y + 44
    for line_text, line_color in lines:
        if ly + 24 > y + h - 8:
            break
        draw_text(draw, x+16, ly, line_text, line_color, 20)
        ly += 28
    return ly

def draw_badge(draw, x, y, label, value, color=GREEN):
    f_sm = font(18)
    lw = f_sm.getlength(label) + 20
    vw = f_sm.getlength(value) + 20
    draw_rounded_rect(draw, x, y, lw, 28, DIMGRAY, radius=6)
    draw_text(draw, x+10, y+4, label, WHITE, 18)
    draw_rounded_rect(draw, x+lw, y, vw, 28, color, radius=6)
    draw_text(draw, x+lw+10, y+4, value, WHITE, 18)
    return lw + vw + 12

def draw_caption(draw, text, y=None):
    """Draw a centered caption bar at the bottom."""
    if y is None:
        y = H - 140
    f = font(26, bold=True)
    tw = f.getlength(text)
    bx = (W - tw) / 2 - 24
    draw_rounded_rect(draw, int(bx), y, int(tw + 48), 52, "#1f6feb", radius=10)
    draw_text(draw, W//2, y+12, text, WHITE, 26, bold=True, anchor="mt")

def draw_phase_indicator(draw, phases, active_idx, y=80):
    """Draw phase progress bar."""
    total_w = W - 120
    pw = total_w // len(phases)
    for i, (phase, icon) in enumerate(phases):
        x = 60 + i * pw
        if i < active_idx:
            c = GREEN
        elif i == active_idx:
            c = ACCENT
        else:
            c = DIMGRAY
        draw_rounded_rect(draw, x, y, pw-12, 48, c, radius=8)
        draw_text(draw, x + (pw-12)//2, y+12, f"{icon} {phase}", WHITE, 20, bold=(i==active_idx), anchor="mt")
    # Progress line
    if active_idx >= 0:
        fill_w = int((active_idx + 0.5) / len(phases) * total_w)
        draw.rectangle([60, y+52, 60+fill_w, y+56], fill=hex_to_rgb(GREEN))
        draw.rectangle([60+fill_w, y+52, 60+total_w, y+56], fill=hex_to_rgb(DIMGRAY))


# ============================================================
# SCENE GENERATORS — each returns list of PIL frames
# ============================================================

def scene_1_hero():
    """0-5s: Repo homepage hero."""
    frames = []
    for i in range(5 * FPS):
        img = new_frame()
        d = ImageDraw.Draw(img)

        # Fade in effect
        alpha = min(1.0, i / (FPS * 0.8))

        # Title
        y = 420
        draw_text(d, W//2, y, "The Self-Growing", GRAY, 36, anchor="mt")
        draw_text(d, W//2, y+50, "Karpathy LLM Wiki", WHITE, 52, bold=True, anchor="mt")

        # Tagline
        draw_text(d, W//2, y+140, "One prompt. Zero human code.", ACCENT, 30, anchor="mt")
        draw_text(d, W//2, y+180, "An AI agent ships production code", GRAY, 26, anchor="mt")
        draw_text(d, W//2, y+215, "every 4 hours — on its own.", GRAY, 26, anchor="mt")

        # Badges
        by = y + 290
        bx = 120
        bx += draw_badge(d, bx, by, "stars", "★", YELLOW)
        bx += draw_badge(d, bx, by, "commits", "63", GREEN)
        bx += draw_badge(d, bx, by, "growth", "passing", GREEN)

        # Pulsing dot
        if (i // 15) % 2 == 0:
            cx, cy = W//2 + 200, by + 14
            d.ellipse([cx-6, cy-6, cx+6, cy+6], fill=hex_to_rgb(GREEN))

        # Bottom caption
        if i > FPS * 2:
            draw_caption(d, "🌱 Started from one markdown file")

        # Watermark
        draw_text(d, W//2, H-60, "github.com/yologdev/karpathy-llm-wiki", DIMGRAY, 18, anchor="mt")

        frames.append(img)
    return frames

def scene_2_baseline_vs_now():
    """5-15s: Side by side baseline vs main."""
    frames = []

    baseline_files = [
        ("llm-wiki.md", "founding prompt"),
    ]

    now_files = [
        ("src/", "28 files"),
        ("src/app/", "pages & API routes"),
        ("src/lib/", "core logic"),
        ("src/components/", "React components"),
        (".yoyo/", "agent brain"),
        (".yoyo/journal.md", "7 sessions logged"),
        (".yoyo/learnings.md", "2 learnings"),
        (".yoyo/scripts/", "growth engine"),
        (".yoyo/skills/", "3 skills"),
        (".github/workflows/", "CI/CD"),
        ("README.md", "174 lines"),
        ("package.json", "Next.js 15"),
    ]

    for i in range(10 * FPS):
        img = new_frame()
        d = ImageDraw.Draw(img)

        # Title
        draw_text(d, W//2, 160, "From Seed to Product", WHITE, 42, bold=True, anchor="mt")

        # Left panel: BASELINE
        lx, ly = 40, 280
        draw_rounded_rect(d, lx, ly, W//2-60, 700, BG2, radius=12)
        draw_text(d, lx + (W//2-60)//2, ly+20, "baseline", RED, 28, bold=True, anchor="mt")
        draw_text(d, lx + (W//2-60)//2, ly+58, "1 commit", GRAY, 22, anchor="mt")

        # Single file with fade-in
        draw_text(d, lx+24, ly+120, "📄 llm-wiki.md", GRAY, 22)
        draw_text(d, lx+24, ly+155, "   (that's it)", DIMGRAY, 20)

        # Right panel: NOW
        rx = W//2 + 20
        draw_rounded_rect(d, rx, ly, W//2-60, 700, BG2, radius=12)
        draw_text(d, rx + (W//2-60)//2, ly+20, "main", GREEN, 28, bold=True, anchor="mt")
        draw_text(d, rx + (W//2-60)//2, ly+58, "63 commits", GRAY, 22, anchor="mt")

        # Staggered file reveal
        files_to_show = min(len(now_files), max(1, int((i / (10*FPS)) * (len(now_files) + 4))))
        fy = ly + 100
        for j in range(min(files_to_show, len(now_files))):
            fname, desc = now_files[j]
            icon = "📁" if fname.endswith("/") else "📄"
            c = WHITE if j < files_to_show else DIMGRAY
            draw_text(d, rx+16, fy, f"{icon} {fname}", c, 19)
            draw_text(d, rx+24, fy+26, desc, GRAY, 16)
            fy += 50

        # Stats bar at bottom
        sy = ly + 720
        draw_rounded_rect(d, 40, sy, W-80, 120, BG2, radius=12)
        stats = [
            ("4,270", "lines of code"),
            ("51", "files changed"),
            ("106", "tests passing"),
            ("7", "growth sessions"),
        ]
        sx = 80
        for val, label in stats:
            draw_text(d, sx, sy+16, val, GREEN, 32, bold=True)
            draw_text(d, sx, sy+56, label, GRAY, 18)
            sx += (W-120) // 4

        # Caption
        if i > 3 * FPS:
            draw_caption(d, "All written by an AI agent")

        frames.append(img)
    return frames

def scene_3_growth_session():
    """15-35s: Growth session timelapse."""
    frames = []

    phases = [("ASSESS", "🔍"), ("PLAN", "📋"), ("BUILD", "🔨"), ("COMMUNICATE", "📝")]

    # Phase data from actual session
    phase_content = {
        0: {  # ASSESS
            "title": "Assessment — Session 7",
            "lines": [
                ("$ pnpm build", ACCENT),
                ("✓ Build passes", GREEN),
                ("$ pnpm test", ACCENT),
                ("✓ 106 tests passing", GREEN),
                ("", WHITE),
                ("Reading founding vision...", GRAY),
                ("  llm-wiki.md", WHITE),
                ("Reading codebase...", GRAY),
                ("  28 files in src/", WHITE),
                ("  4,270 lines of TypeScript", WHITE),
                ("", WHITE),
                ("All 4 pillars operational:", GREEN),
                ("  ✓ Ingest (URL + text)", GREEN),
                ("  ✓ Query (cited answers)", GREEN),
                ("  ✓ Lint (health checks)", GREEN),
                ("  ✓ Browse (graph view)", GREEN),
                ("", WHITE),
                ("Gaps found:", YELLOW),
                ("  → NavHeader double-active bug", YELLOW),
                ("  → No path traversal guard", RED),
                ("  → Query can't save to wiki", YELLOW),
            ],
        },
        1: {  # PLAN
            "title": "Planning — 3 Tasks",
            "lines": [
                ("Comparing vision to codebase...", GRAY),
                ("", WHITE),
                ("Task 1: [HIGH]", GREEN),
                ("  Save query answers to wiki", WHITE),
                ("  closes query→wiki loop", GRAY),
                ("", WHITE),
                ("Task 2: [HIGH]", GREEN),
                ("  Path traversal protection", WHITE),
                ("  + empty slug guard", GRAY),
                ("  security hardening", RED),
                ("", WHITE),
                ("Task 3: [MEDIUM]", YELLOW),
                ("  Fix NavHeader active state", WHITE),
                ("  + improve home page links", GRAY),
                ("", WHITE),
                ("Writing SESSION_PLAN.md...", ACCENT),
                ("✓ Plan committed", GREEN),
            ],
        },
        2: {  # BUILD
            "title": "Building — Task by Task",
            "lines": [
                ("── Task 1/3 ──────────────", ACCENT),
                ("  Creating save/route.ts", WHITE),
                ("  Writing saveAnswerToWiki()", WHITE),
                ("  Adding 'Save to Wiki' button", WHITE),
                ("  + 71 lines of tests", GRAY),
                ("  $ pnpm build  ✓", GREEN),
                ("  $ pnpm test   ✓  (106 pass)", GREEN),
                ("  Evaluator: APPROVED ✓", GREEN),
                ("", WHITE),
                ("── Task 2/3 ──────────────", ACCENT),
                ("  Adding path validation", WHITE),
                ("  Blocking ../../../etc", RED),
                ("  Empty slug → 400", WHITE),
                ("  $ pnpm build  ✓", GREEN),
                ("  $ pnpm test   ✓", GREEN),
                ("  Evaluator: APPROVED ✓", GREEN),
                ("", WHITE),
                ("── Task 3/3 ──────────────", ACCENT),
                ("  Fixing NavHeader", WHITE),
                ("  Adding action links to home", WHITE),
                ("  $ pnpm build  ✓", GREEN),
                ("  Evaluator: APPROVED ✓", GREEN),
            ],
        },
        3: {  # COMMUNICATE
            "title": "Wrapping Up",
            "lines": [
                ("Writing journal entry...", GRAY),
                ("  Session 7: Polish, security,", WHITE),
                ("  and closing the query loop", WHITE),
                ("", WHITE),
                ("Checking learnings...", GRAY),
                ("  'Nothing here rises above", DIMGRAY),
                ("   standard practice.'", DIMGRAY),
                ("  → No new learnings.", GRAY),
                ("", WHITE),
                ("$ git push origin main", ACCENT),
                ("✓ Pushed 5 commits", GREEN),
                ("", WHITE),
                ("$ git tag grow-2026-04-06-15-24", ACCENT),
                ("✓ Tagged", GREEN),
                ("", WHITE),
                ("Syncing journal to yoyo-evolve...", GRAY),
                ("✓ Journal synced", GREEN),
                ("", WHITE),
                ("=== Growth session complete ===", GREEN),
            ],
        },
    }

    captions = [
        "🔍 yoyo reads the vision, checks the build",
        "📋 yoyo decides what's most impactful",
        "🔨 yoyo writes code, runs tests, evaluates",
        "📝 yoyo commits, tags, writes journal",
    ]

    total_duration = 20 * FPS  # 20 seconds
    phase_duration = total_duration // 4

    for i in range(total_duration):
        img = new_frame()
        d = ImageDraw.Draw(img)

        phase_idx = min(3, i // phase_duration)
        phase_progress = (i % phase_duration) / phase_duration

        # Phase indicator bar
        draw_phase_indicator(d, phases, phase_idx, y=100)

        # Session header
        draw_text(d, W//2, 200, "Growth Session #7", WHITE, 36, bold=True, anchor="mt")
        draw_text(d, W//2, 245, "2026-04-06 15:24 UTC", GRAY, 22, anchor="mt")

        # Terminal
        content = phase_content[phase_idx]
        lines_to_show = max(1, int(phase_progress * (len(content["lines"]) + 2)))
        visible_lines = content["lines"][:lines_to_show]

        draw_terminal_box(d, 40, 310, W-80, 900, visible_lines, title=content["title"])

        # Blinking cursor
        if (i // 8) % 2 == 0 and lines_to_show <= len(content["lines"]):
            cursor_y = 354 + min(lines_to_show, 28) * 28
            d.rectangle([56, cursor_y, 66, cursor_y+22], fill=hex_to_rgb(WHITE))

        # Stats ticker at bottom
        ty = 1280
        draw_rounded_rect(d, 40, ty, W-80, 80, BG2, radius=10)
        elapsed_min = int(phase_idx * 5 + phase_progress * 5)
        ticker_items = [
            f"⏱ {elapsed_min}min",
            f"📝 {min(5, phase_idx * 2 + int(phase_progress * 2))} commits",
            f"✅ 106 tests",
        ]
        tx = 80
        for item in ticker_items:
            draw_text(d, tx, ty+28, item, GRAY, 22)
            tx += 280

        # Caption
        draw_caption(d, captions[phase_idx], y=H-160)

        frames.append(img)
    return frames

def scene_4_commits_and_issues():
    """35-50s: Commit history + issues."""
    frames = []

    commits = [
        ("f1431d9", "growth session wrap-up", GREEN),
        ("9c23268", "Fix NavHeader + improve home page", WHITE),
        ("985a107", "Security: path traversal protection", RED),
        ("5019b88", "Save answer to wiki", ACCENT),
        ("42e8f35", "URL fetch safety + SPA navigation", WHITE),
        ("527d8cd", "Multi-page ingest + cross-refs", WHITE),
        ("752e7f1", "Index-first query optimization", WHITE),
        ("31963d7", "Interactive wiki graph view", ACCENT),
        ("5b92e54", "Fix cross-ref matching", WHITE),
        ("912f0dd", "URL ingestion with readability", WHITE),
        ("33696dd", "Migrate to Vercel AI SDK", ACCENT),
        ("c921e6d", "Lint UI page", WHITE),
        ("c99c874", "Lint operation — core + API", WHITE),
        ("3b394d6", "Persistent navigation header", WHITE),
        ("baba1fa", "Query operation with citations", ACCENT),
        ("832d06d", "Markdown rendering for wiki", WHITE),
        ("150f3b8", "Ingest UI form", WHITE),
        ("f5f52f3", "Ingest API + browse page", WHITE),
        ("1dede15", "Core library — wiki.ts + llm.ts", ACCENT),
        ("0d9dd45", "Scaffold Next.js 15 project", GREEN),
    ]

    issues = [
        ("#2", "CLOSED", "Migrate to Vercel AI SDK", GREEN),
        ("#1", "CLOSED", "Bootstrap: scaffold Next.js app", GREEN),
    ]

    total_duration = 15 * FPS

    for i in range(total_duration):
        img = new_frame()
        d = ImageDraw.Draw(img)

        progress = i / total_duration

        # Title
        draw_text(d, W//2, 140, "Commit History", WHITE, 38, bold=True, anchor="mt")
        draw_text(d, W//2, 190, "Every commit is the agent's work", GRAY, 24, anchor="mt")

        # Scrolling commit list
        scroll_offset = int(progress * 6)  # Slow scroll
        visible_start = scroll_offset
        cy = 280

        for j in range(visible_start, min(visible_start + 14, len(commits))):
            sha, msg, color = commits[j]
            entry_y = cy + (j - visible_start) * 62

            # Commit line
            draw_rounded_rect(d, 60, entry_y, W-120, 52, BG2, radius=8)
            draw_text(d, 80, entry_y+14, sha, YELLOW, 20)
            draw_text(d, 200, entry_y+14, msg[:38], color, 20)

            # "yoyo" author tag
            draw_rounded_rect(d, W-200, entry_y+10, 80, 30, "#1f6feb", radius=6)
            draw_text(d, W-160, entry_y+14, "yoyo", WHITE, 18, anchor="mt")

        # Issues section
        iy = 1200
        draw_text(d, W//2, iy, "Issues", WHITE, 32, bold=True, anchor="mt")
        draw_text(d, W//2, iy+42, "Filed by humans, solved by agent", GRAY, 22, anchor="mt")

        for j, (num, state, title, color) in enumerate(issues):
            ey = iy + 90 + j * 80
            draw_rounded_rect(d, 60, ey, W-120, 65, BG2, radius=10)
            # State badge
            draw_rounded_rect(d, 80, ey+16, 90, 32, GREEN, radius=6)
            draw_text(d, 125, ey+20, state, WHITE, 18, anchor="mt")
            draw_text(d, 185, ey+20, f"{num} {title[:30]}", WHITE, 20)

        # Caption
        draw_caption(d, "No human writes code here")

        frames.append(img)
    return frames

def scene_5_closer():
    """50-55s: Closing text overlay."""
    frames = []

    lines = [
        ("Zero human code.", WHITE, 48),
        ("", WHITE, 20),
        ("Grows every 4 hours.", GREEN, 42),
        ("", WHITE, 20),
        ("Started from Karpathy's", GRAY, 32),
        ("exact gist.", GRAY, 32),
    ]

    for i in range(5 * FPS):
        img = new_frame()
        d = ImageDraw.Draw(img)

        progress = i / (5 * FPS)

        # Center vertically
        total_h = sum(s + 10 for _, _, s in lines)
        y = (H - total_h) // 2 - 40

        # Fade lines in one by one
        lines_visible = min(len(lines), int(progress * (len(lines) + 2)))

        for j, (text, color, size) in enumerate(lines):
            if j < lines_visible and text:
                draw_text(d, W//2, y, text, color, size, bold=True, anchor="mt")
            y += size + 16

        # Seed emoji
        if progress > 0.6:
            draw_text(d, W//2, y + 60, "🌱", WHITE, 64, anchor="mt")

        # URL at bottom
        if progress > 0.3:
            draw_text(d, W//2, H-120, "github.com/yologdev", ACCENT, 24, anchor="mt")
            draw_text(d, W//2, H-85, "karpathy-llm-wiki", ACCENT, 28, bold=True, anchor="mt")

        # Built with yoyo
        draw_text(d, W//2, H-40, "Built with yoyo-evolve", DIMGRAY, 16, anchor="mt")

        frames.append(img)
    return frames


# ============================================================
# MAIN — generate all frames and encode with ffmpeg
# ============================================================

def main():
    # Clean up
    if os.path.exists(OUT_DIR):
        shutil.rmtree(OUT_DIR)
    os.makedirs(OUT_DIR, exist_ok=True)

    print("Generating frames...")

    scenes = [
        ("Scene 1: Hero", scene_1_hero),
        ("Scene 2: Baseline vs Now", scene_2_baseline_vs_now),
        ("Scene 3: Growth Session", scene_3_growth_session),
        ("Scene 4: Commits & Issues", scene_4_commits_and_issues),
        ("Scene 5: Closer", scene_5_closer),
    ]

    frame_idx = 0
    for name, gen_fn in scenes:
        print(f"  {name}...")
        scene_frames = gen_fn()
        for f in scene_frames:
            f.save(os.path.join(OUT_DIR, f"frame_{frame_idx:06d}.png"))
            frame_idx += 1
        print(f"    → {len(scene_frames)} frames ({len(scene_frames)/FPS:.1f}s)")

    total_secs = frame_idx / FPS
    print(f"\nTotal: {frame_idx} frames ({total_secs:.1f}s)")

    # Encode with ffmpeg
    print("\nEncoding video with ffmpeg...")
    cmd = [
        "ffmpeg", "-y",
        "-framerate", str(FPS),
        "-i", os.path.join(OUT_DIR, "frame_%06d.png"),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-crf", "18",
        "-preset", "slow",
        "-movflags", "+faststart",
        FINAL,
    ]
    subprocess.run(cmd, check=True)

    # Clean up frames
    shutil.rmtree(OUT_DIR)

    size_mb = os.path.getsize(FINAL) / (1024 * 1024)
    print(f"\n✅ Done! {FINAL} ({size_mb:.1f} MB, {total_secs:.0f}s)")

if __name__ == "__main__":
    main()
