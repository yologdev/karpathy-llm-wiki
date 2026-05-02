#!/bin/bash
# .yoyo/scripts/setup-agent.sh — Shared setup for all agent scripts.
# Source this at the top of each agent script:
#   source "$(dirname "$0")/setup-agent.sh"
#
# Provides:
#   $REPO, $MODEL, $DATE, $SESSION_TIME, $BOT_LOGIN, $BOT_SLUG
#   $SYSTEM_FILE, $SHARED_SKILLS, $TIMEOUT_CMD
#   $BOUNDARY_NONCE, $BOUNDARY_BEGIN, $BOUNDARY_END
#   $PROTECTED_PATHS
#   run_agent()           — run yoyo with identity + skills
#   check_protected_files() — detect modifications to protected files
#   sanitize_issue_content() — strip HTML comments + boundary markers

set -euo pipefail

# ── Auto-detect repo from git remote ──
if [ -z "${REPO:-}" ]; then
    REPO=$(git remote get-url origin 2>/dev/null | sed -E 's|.*github\.com[:/]||;s|\.git$||' || echo "")
    if [ -z "$REPO" ]; then
        echo "ERROR: Could not detect REPO. Set REPO env var."
        exit 1
    fi
fi

MODEL="${MODEL:-claude-opus-4-6}"
BOT_LOGIN="${BOT_LOGIN:-yoyo[bot]}"
BOT_SLUG="${BOT_SLUG:-yoyo}"
DATE=$(date +%Y-%m-%d)
SESSION_TIME=$(date +%H:%M)

# Security nonce for content boundary markers
BOUNDARY_NONCE=$(python3 -c "import os; print(os.urandom(16).hex())") || {
    echo "ERROR: python3 required for security nonce generation."
    exit 1
}
BOUNDARY_BEGIN="[BOUNDARY-${BOUNDARY_NONCE}-BEGIN]"
BOUNDARY_END="[BOUNDARY-${BOUNDARY_NONCE}-END]"

# ── Preflight: check yoyo binary ──
if ! command -v yoyo &>/dev/null; then
    echo "ERROR: yoyo binary not found on PATH."
    exit 1
fi

# ── Download yoyo's identity + skills from yoyo-evolve ──
echo "→ Downloading yoyo identity + skills from yoyo-evolve..."
YOYO_EVOLVE_DIR="/tmp/yoyo-evolve"
SHARED_SKILLS="/tmp/yoyo-skills"
IDENTITY_DIR=".yoyo/identity"
SYSTEM_FILE=""

rm -rf "$YOYO_EVOLVE_DIR" "$SHARED_SKILLS"
mkdir -p "$YOYO_EVOLVE_DIR" "$IDENTITY_DIR"

if gh api "repos/yologdev/yoyo-evolve/tarball/main" > /tmp/yoyo-evolve.tar.gz 2>/dev/null; then
    tar xzf /tmp/yoyo-evolve.tar.gz -C "$YOYO_EVOLVE_DIR" --strip-components=1
    rm -f /tmp/yoyo-evolve.tar.gz

    if [ -f "$YOYO_EVOLVE_DIR/scripts/yoyo_context.sh" ]; then
        YOYO_REPO="$YOYO_EVOLVE_DIR" source "$YOYO_EVOLVE_DIR/scripts/yoyo_context.sh"
        echo "$YOYO_CONTEXT" > "$IDENTITY_DIR/SOUL.md"
        SYSTEM_FILE="$IDENTITY_DIR/SOUL.md"
        echo "  Identity loaded ($(wc -l < "$IDENTITY_DIR/SOUL.md" | tr -d ' ') lines)"
    else
        echo "  WARNING: yoyo_context.sh not found, running without identity"
    fi

    if [ -d "$YOYO_EVOLVE_DIR/skills" ]; then
        cp -r "$YOYO_EVOLVE_DIR/skills" "$SHARED_SKILLS"
        rm -rf "$SHARED_SKILLS/evolve" "$SHARED_SKILLS/release" "$SHARED_SKILLS/family" "$SHARED_SKILLS/_journal.md"
        echo "  Skills loaded: $(ls "$SHARED_SKILLS" | tr '\n' ' ')"
    fi

    rm -rf "$YOYO_EVOLVE_DIR"
else
    echo "  WARNING: Failed to download yoyo-evolve. Running with local skills only."
    rm -f /tmp/yoyo-evolve.tar.gz
fi

# ── Timeout command (cross-platform) ──
TIMEOUT_CMD="timeout"
if ! command -v timeout &>/dev/null; then
    if command -v gtimeout &>/dev/null; then
        TIMEOUT_CMD="gtimeout"
    else
        TIMEOUT_CMD=""
        echo "WARNING: No timeout command found. Agent calls will have no time limit."
    fi
fi

# ── Helper: run agent ──
run_agent() {
    local timeout_val="$1"
    local prompt_file="$2"
    local log_file="$3"
    local extra_flags="${4:-}"

    local exit_code=0
    # shellcheck disable=SC2086
    ${TIMEOUT_CMD:+$TIMEOUT_CMD "$timeout_val"} yoyo \
        --model "$MODEL" \
        ${SYSTEM_FILE:+--system-file "$SYSTEM_FILE"} \
        --skills .yoyo/skills \
        ${SHARED_SKILLS:+--skills "$SHARED_SKILLS"} \
        $extra_flags \
        < "$prompt_file" 2>&1 | tee "$log_file" || exit_code=$?

    return "$exit_code"
}

# ── Protected files ──
PROTECTED_PATHS="llm-wiki.md yopedia-concept.md YOYO.md .github/workflows/ .yoyo/scripts/ .yoyo/config.toml .yoyo/.gitignore .yoyo/skills/grow/ .yoyo/skills/communicate/ .yoyo/skills/research/"

check_protected_files() {
    local base_sha="$1"
    local protected=""
    protected=$(git diff --name-only "$base_sha"..HEAD -- $PROTECTED_PATHS 2>/dev/null || true)
    local staged
    staged=$(git diff --cached --name-only -- $PROTECTED_PATHS 2>/dev/null || true)
    [ -n "$staged" ] && protected="${protected}${protected:+
}${staged}"
    local unstaged
    unstaged=$(git diff --name-only -- $PROTECTED_PATHS 2>/dev/null || true)
    [ -n "$unstaged" ] && protected="${protected}${protected:+
}${unstaged}"
    echo "$protected"
}

# ── Helper: sanitize issue content ──
sanitize_issue_content() {
    python3 -c "
import sys, re
bb, be = sys.argv[1], sys.argv[2]
text = sys.stdin.read()
text = re.sub(r'<!--.*?-->', '', text, flags=re.DOTALL)
text = text.replace(bb, '[marker-stripped]').replace(be, '[marker-stripped]')
print(text)
" "$BOUNDARY_BEGIN" "$BOUNDARY_END"
}

# ── Helper: commit and push journal changes ──
commit_and_push_journal() {
    local message="$1"
    git add .yoyo/journal.md 2>/dev/null || true
    if ! git diff --cached --quiet 2>/dev/null; then
        git commit -m "$message"
        git pull --rebase origin main 2>/dev/null || true
        git push || echo "WARNING: Failed to push journal update"
    fi
}

echo "=== Agent Session ($DATE $SESSION_TIME) ==="
echo "Repo: $REPO | Model: $MODEL"
