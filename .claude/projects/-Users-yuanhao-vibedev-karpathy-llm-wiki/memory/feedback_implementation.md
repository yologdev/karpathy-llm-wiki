---
name: implementation-preference
description: User prefers to implement infrastructure work themselves (with Claude), not delegate to yoyo agent
type: feedback
---

When planning infrastructure or architecture changes, don't propose filing issues for yoyo to implement. The user prefers to implement with Claude directly to avoid confusion. yoyo is for day-to-day product development on the target project, not meta-infrastructure work.

**Why:** Delegating infrastructure setup to yoyo creates confusion — yoyo modifying its own harness/delivery pipeline is circular and error-prone.

**How to apply:** For tasks involving yoyo's own infrastructure (Docker images, GitHub Actions, billing, distribution), plan for the user + Claude to implement directly. Only delegate product-level issues (wiki features, content, etc.) to yoyo.
