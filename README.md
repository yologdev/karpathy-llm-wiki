# Karpathy LLM Wiki

**A product grown entirely by an AI agent from a single prompt.**

This repo starts with one file — [Andrej Karpathy's LLM Wiki pattern](llm-wiki.md) — and an autonomous coding agent called [yoyo](https://github.com/yologdev/yoyo) that reads the prompt, plans, builds, and ships. Every commit after the [`baseline`](https://github.com/yologdev/karpathy-llm-wiki/tree/baseline) tag was made by the agent. Features come in as GitHub issues. The agent implements them.

No human writes code here. Humans write issues.

---

## What's Being Built

An implementation of Karpathy's [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — a web app where an LLM incrementally builds and maintains a persistent wiki from your raw sources. Instead of RAG (re-derive everything per query), the LLM compiles knowledge once and keeps it current.

Three operations: **ingest** (add a source, update the wiki), **query** (ask questions, get cited answers), **lint** (health-check for contradictions and orphan pages).

## How It Works

```
┌──────────────────────────────────────────────────────────────┐
│                     GitHub Repository                        │
│                                                              │
│  llm-wiki.md          The founding prompt (immutable)        │
│  YOYO.md              Project context, tech stack, goals     │
│  .yoyo/               Agent harness (skills, scripts, logs)  │
│  src/                 Application code (written by yoyo)     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
         │                              ▲
         │ reads context                │ commits code
         ▼                              │
┌──────────────────────────────────────────────────────────────┐
│                     Growth Session                           │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │  Assessment  │→ │   Planning   │→ │   Implementation    │ │
│  │             │  │              │  │                     │ │
│  │ Read code   │  │ Pick issues  │  │ Write code          │ │
│  │ Check build │  │ Write tasks  │  │ Run build + tests   │ │
│  │ Review gaps │  │ Prioritize   │  │ Evaluate quality    │ │
│  │             │  │              │  │ Fix or revert       │ │
│  └─────────────┘  └──────────────┘  └─────────────────────┘ │
│                                                              │
│  Then: write journal, record learnings, respond to issues    │
└──────────────────────────────────────────────────────────────┘
         │                              ▲
         │ triggered by                 │ issues created by
         ▼                              │
┌──────────────────────────────────────────────────────────────┐
│                     GitHub Issues                            │
│                                                              │
│  agent-input       Feature requests (from humans)            │
│  agent-self        Tasks the agent files for itself          │
│  agent-help-wanted When the agent is blocked                 │
└──────────────────────────────────────────────────────────────┘
```

### The Growth Pipeline

Every 8 hours (or when an issue is labeled `agent-input`), a GitHub Actions workflow runs a multi-phase growth session:

**Phase A1: Assessment** — The agent reads the entire codebase, checks the build, reviews recent history, and writes a structured assessment of the project state.

**Phase A2: Planning** — A separate agent reads the assessment and open issues, then writes task files with specific implementation instructions. Up to 3 tasks per session.

**Phase B: Implementation** — For each task, a focused agent implements the changes. Every task goes through:

- **Build verification** — `pnpm build && pnpm lint && pnpm test` must pass. If it fails, a fix agent gets up to 5 attempts.
- **Evaluation** — An independent evaluator agent reviews the diff. If it rejects, a fix agent gets up to 3 attempts.
- **Protected files check** — The harness enforces that `llm-wiki.md`, workflows, scripts, and core skills are never modified.
- **Checkpoint-restart** — If the agent times out with partial progress, committed work is preserved and a new agent continues.
- **Revert on failure** — If all fix attempts fail, the task is cleanly reverted and an `agent-self` issue is filed for the next session.

**Phase C: Communication** — The agent writes a journal entry, records project-specific learnings, and responds to GitHub issues.

### Safety & Security

The agent runs with full code execution, so safety is enforced by the harness:

| Layer | What it does |
|-------|-------------|
| **Boundary nonces** | Issue content is wrapped in random, unpredictable markers. The agent can't be tricked into escaping the content boundary. |
| **Content sanitization** | HTML comments stripped, boundary markers replaced with `[marker-stripped]`. |
| **Security warnings** | Every prompt explicitly labels issue content as "UNTRUSTED USER INPUT". |
| **Author allowlist** | Only issues from approved GitHub users are processed. |
| **Protected files** | Founding prompt, workflow, scripts, config, and core skills — checked after every task. |
| **Build gate** | Every task must pass build + lint + tests. |
| **Evaluation gate** | Independent agent reviews each diff for correctness. |
| **Automatic revert** | Failed tasks roll back to a known-good commit. |

## Why This Setup Matters

Most "AI coding" today is interactive — you sit with the AI and pair-program. This project explores something different: **autonomous, issue-driven development**.

```
Interactive AI coding:              This project:

  Human: "add a button here"          Human: files issue #7
  AI: writes code                     ← 8 hours pass →
  Human: "no, move it left"           Agent: reads issue, plans,
  AI: rewrites code                     implements, tests, commits,
  Human: "looks good, commit"           responds to issue, writes
  AI: commits                           journal entry
                                      Human: reviews next morning
```

The human's job shifts from **directing each keystroke** to **curating the backlog**. You describe what you want at a high level. The agent figures out the rest — architecture, implementation, testing, documentation.

This is closer to managing a junior developer than to using a tool. You write clear issues. The agent does the work. You review the results. The feedback loop runs through GitHub, not through a chat window.

### What makes this different from "vibe coding"

Vibe coding is a human prompting an AI in a loop, accepting whatever comes out. This setup has structure:

1. **Persistent context** — The agent reads `YOYO.md`, the journal, and learnings every session. It knows what it built yesterday.
2. **Multi-agent pipeline** — Assessment, planning, implementation, and evaluation are separate agents. The planner can't execute code. The implementer can't skip evaluation.
3. **Mechanical verification** — Build, lint, and test gates are enforced by the shell script, not by asking the agent to check itself.
4. **Automatic revert** — Bad code doesn't ship. The harness rolls it back and files an issue.
5. **Compounding knowledge** — The journal and learnings files grow over time. The agent learns what works for this specific project.

The founding prompt is the seed. The harness is the soil. The issues are water and sunlight. The product grows.

## Project Structure

```
karpathy-llm-wiki/
├── llm-wiki.md                    # Founding prompt (immutable)
├── YOYO.md                        # Project context for the agent
├── README.md                      # You are here
├── .gitignore
├── .github/
│   └── workflows/
│       └── grow.yml               # GitHub Actions workflow
└── .yoyo/
    ├── config.toml                # Build/test/lint commands
    ├── journal.md                 # Session-by-session history
    ├── learnings.md               # Project-specific insights
    ├── scripts/
    │   ├── grow.sh                # Growth session orchestrator
    │   └── format_issues.py       # Issue sanitization + filtering
    └── skills/
        ├── grow/SKILL.md          # How to plan and implement
        ├── communicate/SKILL.md   # How to write journal + respond
        └── research/SKILL.md      # How to look things up
```

Everything under `src/` will be created by yoyo in its first growth session.

## Trigger a Growth Session

**Automatic:** Runs every 8 hours via cron.

**On issue:** Label any issue with `agent-input` and the workflow fires.

**Manual (CLI):**
```bash
# Run with default behavior (picks up open issues)
gh workflow run grow.yml --repo yologdev/karpathy-llm-wiki

# Run with a specific task
gh workflow run grow.yml --repo yologdev/karpathy-llm-wiki \
  -f task="Add dark mode to the browse page"
```

## Watch It Grow

- **Commits** — Every yoyo commit tells you what changed and why
- **Issues** — yoyo responds to issues with progress updates
- **Journal** — `.yoyo/journal.md` has session-by-session notes
- **Learnings** — `.yoyo/learnings.md` captures project-specific insights
- **Git history** — `git log --oneline` reads like a development timeline

The [`baseline`](https://github.com/yologdev/karpathy-llm-wiki/tree/baseline) tag marks the pure "one prompt" state. Everything after it is the agent's work.

## Built With

- [yoyo-evolve](https://github.com/yologdev/yoyo-evolve) — A self-evolving coding agent that grows itself in public, one session at a time

---

*This project is an experiment in autonomous software development. The question it asks: can you describe a product in a single prompt and have an AI agent build it — not in one shot, but incrementally, session by session, shaped by feedback through GitHub issues?*

*We think the answer is yes. Watch the git history to see for yourself.*
