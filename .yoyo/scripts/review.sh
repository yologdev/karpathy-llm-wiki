#!/bin/bash
# .yoyo/scripts/review.sh — Review agent: review PRs against acceptance criteria.
# Event-driven (triggered by PR opened/synchronize).
#
# Usage: ./review.sh <pr_number>
# Env: REPO, GH_TOKEN, ANTHROPIC_API_KEY

source "$(dirname "$0")/setup-agent.sh"

TIMEOUT="${TIMEOUT:-900}"  # 15 min
PR_NUMBER="${1:?Usage: review.sh <pr_number>}"

echo "→ Reviewing PR #$PR_NUMBER..."

# ── Fetch PR details ──
PR_JSON=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json title,body,headRefName,baseRefName,files,commits,author 2>/dev/null || true)
if [ -z "$PR_JSON" ] || [ "$PR_JSON" = "null" ]; then
    echo "  ERROR: Could not fetch PR #$PR_NUMBER."
    exit 1
fi

PR_TITLE=$(echo "$PR_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('title',''))" 2>/dev/null || echo "")
PR_BODY=$(echo "$PR_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('body','')[:3000])" 2>/dev/null || echo "")
PR_BRANCH=$(echo "$PR_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('headRefName',''))" 2>/dev/null || echo "")
PR_AUTHOR=$(echo "$PR_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('author',{}).get('login',''))" 2>/dev/null || echo "")

echo "  Title: $PR_TITLE"
echo "  Branch: $PR_BRANCH"
echo "  Author: $PR_AUTHOR"

# ── Get the diff ──
PR_DIFF=$(gh pr diff "$PR_NUMBER" --repo "$REPO" 2>/dev/null | head -c 15000 || true)

# ── Find linked issue ──
LINKED_ISSUE=""
ISSUE_BODY=""
if echo "$PR_BODY" | grep -qoP '[Cc]loses?\s+#\d+'; then
    LINKED_ISSUE=$(echo "$PR_BODY" | grep -oP '[Cc]loses?\s+#\K\d+' | head -1)
    ISSUE_BODY=$(gh issue view "$LINKED_ISSUE" --repo "$REPO" --json body --jq '.body' 2>/dev/null | head -c 3000 || true)
    echo "  Linked issue: #$LINKED_ISSUE"
fi

# ── Check if build passes on the branch ──
echo "→ Checking out PR branch for build verification..."
git fetch origin "$PR_BRANCH" 2>/dev/null || true
git checkout "origin/$PR_BRANCH" 2>/dev/null || git checkout "$PR_BRANCH" 2>/dev/null || true

BUILD_RESULT="not checked"
if [ -f package.json ]; then
    pnpm install --frozen-lockfile 2>/dev/null || pnpm install 2>/dev/null || true
    if pnpm build 2>&1 | tail -3; then
        BUILD_RESULT="passing"
    else
        BUILD_RESULT="failing"
    fi
fi

# ── Check for protected file modifications ──
PROTECTED_IN_DIFF=$(echo "$PR_DIFF" | grep -E '^\+\+\+ b/' | sed 's|^\+\+\+ b/||' || true)
PROTECTED_VIOLATIONS=""
for PATH_PATTERN in $PROTECTED_PATHS; do
    MATCH=$(echo "$PROTECTED_IN_DIFF" | grep "^${PATH_PATTERN}" || true)
    [ -n "$MATCH" ] && PROTECTED_VIOLATIONS="${PROTECTED_VIOLATIONS}${MATCH}\n"
done

# ── Build review prompt ──
PROMPT_FILE=$(mktemp)
cat > "$PROMPT_FILE" <<EOF
You are yoyo, reviewing a pull request for yopedia. Today is $DATE $SESSION_TIME.

=== YOUR TASK: CODE REVIEW ===

Review PR #$PR_NUMBER and decide: approve, request changes, or flag for human review.

**PR Title:** $PR_TITLE
**PR Author:** $PR_AUTHOR
**Branch:** $PR_BRANCH
**Build Status:** $BUILD_RESULT
${PROTECTED_VIOLATIONS:+
**⚠️ PROTECTED FILE VIOLATIONS:**
$(echo -e "$PROTECTED_VIOLATIONS")
}

${LINKED_ISSUE:+
**Linked Issue #$LINKED_ISSUE:**
$ISSUE_BODY
}

**PR Body:**
$PR_BODY

**Diff (truncated to 15KB):**
\`\`\`diff
$PR_DIFF
\`\`\`

=== REVIEW CRITERIA ===

1. **Acceptance Criteria** — if linked to an issue, does the PR satisfy all
   acceptance criteria listed in the issue body?

2. **Build passes** — build status is "$BUILD_RESULT". If failing, request changes.

3. **Protected files** — are any protected files modified? If so, request changes.
   Protected: $PROTECTED_PATHS

4. **Code quality:**
   - Does the code follow existing patterns in the codebase?
   - Are there obvious bugs, regressions, or security issues?
   - Are tests added for new functionality?
   - Is the scope appropriate (no unrelated changes)?

5. **Commit hygiene** — clear messages, atomic commits?

=== ACTIONS ===

Based on your review, do ONE of:

**If APPROVED (all criteria met):**
\`\`\`
gh pr comment $PR_NUMBER --repo $REPO --body "✅ Review passed. <brief summary of what looks good>"
\`\`\`
NOTE: We use a comment instead of \`--approve\` because the Build agent and Review
agent share the same GitHub App identity, and GitHub blocks PR authors from
approving their own PRs.

**If CHANGES NEEDED:**
\`\`\`
gh pr review $PR_NUMBER --repo $REPO --request-changes --body "<specific feedback on what to fix>"
\`\`\`
${LINKED_ISSUE:+Then re-queue the linked issue so the Build agent retries:
\`\`\`
gh issue edit $LINKED_ISSUE --repo $REPO --remove-label "in-progress" --add-label "ready"
gh issue comment $LINKED_ISSUE --repo $REPO --body "PR #$PR_NUMBER review requested changes. Re-queued for retry."
\`\`\`}

**If MERGE CONFLICT detected:**
First try to resolve:
\`\`\`
git checkout $PR_BRANCH
git pull --rebase origin main
git push --force-with-lease
\`\`\`
If rebase fails, comment on the PR:
\`\`\`
gh pr comment $PR_NUMBER --repo $REPO --body "Merge conflict detected. Rebase failed — re-queuing the linked issue."
\`\`\`

After approving, if the PR has no merge conflicts and build passes:
\`\`\`
gh pr merge $PR_NUMBER --repo $REPO --squash --auto
\`\`\`

Rules:
- Be specific in feedback. Point to exact lines/files.
- Don't nitpick style if it matches existing patterns.
- If the PR modifies protected files, always request changes — no exceptions.
- Only approve if you're confident the change is correct and complete.
EOF

# ── Run review agent ──
echo "→ Running review agent..."
AGENT_LOG=$(mktemp)
REVIEW_EXIT=0
run_agent "$TIMEOUT" "$PROMPT_FILE" "$AGENT_LOG" || REVIEW_EXIT=$?
rm -f "$PROMPT_FILE"

if [ "$REVIEW_EXIT" -eq 124 ]; then
    echo "  WARNING: Review agent timed out."
elif [ "$REVIEW_EXIT" -ne 0 ]; then
    echo "  WARNING: Review agent exited with code $REVIEW_EXIT."
fi
rm -f "$AGENT_LOG"

# Return to main
git checkout main 2>/dev/null || true

echo "=== Review session complete ==="
