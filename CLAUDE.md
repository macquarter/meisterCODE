# meisterCODE

Static site published from `docs/` (GitHub Pages). See `배포설정.md` for deploy
settings (GH_USER, REPO).

## gstack harness (REQUIRED)

This repo uses [gstack](https://github.com/garrytan/gstack) — Garry Tan's
open-source Claude Code framework — as its AI-assisted-development and QA
harness. gstack ships specialist skills as slash commands; the **test harness**
is the `/qa` skill (drives a real Chromium browser: run flows → find bugs → fix
with atomic commits → re-verify → auto-generate regression tests).

### Auto-install

A SessionStart hook (`.claude/hooks/gstack-bootstrap.sh`) installs gstack into
`~/.claude/skills/gstack` at the start of every session. Claude Code on the web
runs in a fresh container each session, so this re-installs gstack automatically.
No action needed in normal sessions.

If gstack is missing (e.g. the bootstrap was offline), install it by hand:

```bash
bash scripts/install-gstack.sh
```

A PreToolUse hook (`.claude/hooks/check-gstack.sh`) blocks Skill use until
gstack is installed, so AI-assisted work always runs through the harness.

### Key skills

- `/qa` — **test harness**: browser test → find bugs → fix → re-verify → add regression tests
- `/qa-only` — report bugs without changing code
- `/review` — staff-engineer code review
- `/ship` — sync, test, push, open a PR
- `/investigate` — systematic root-cause debugging
- `/cso` — security review (OWASP Top 10 + STRIDE)
- `/browse` — real Chromium browsing with screenshots; **use `/browse` for all web browsing**

Use `~/.claude/skills/gstack/...` for gstack file paths (the global install path).

See `docs/gstack-harness.md` for the full integration write-up.
