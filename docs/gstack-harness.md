# gstack harness integration

This repo wires in [gstack](https://github.com/garrytan/gstack) — Garry Tan's
open-source Claude Code framework (MIT licensed) — as the project's test/QA and
AI-assisted-development harness.

gstack packages ~23 specialist skills and power tools as slash commands. The
**test harness** role is the `/qa` skill: it opens a real Chromium browser,
executes test flows, finds bugs, fixes them with atomic commits, re-verifies,
and auto-generates a regression test for every fix.

## Why a SessionStart hook

gstack installs into `~/.claude/skills/gstack` — the home directory, *not* the
repo. Claude Code on the web runs in a fresh, ephemeral container each session,
so a global install does not survive between sessions. To make gstack behave
like a committed-in harness, this repo installs it automatically at session
start.

## What's committed

| File | Purpose |
| --- | --- |
| `.claude/hooks/gstack-bootstrap.sh` | SessionStart hook — idempotently clones + runs `gstack/setup --team --no-prefix` if gstack is missing. Non-fatal (a network outage can't break a session) and lock-guarded against concurrent starts. |
| `.claude/hooks/check-gstack.sh` | PreToolUse (matcher `Skill`) — blocks skill use until gstack is installed, so work always runs through the harness. |
| `.claude/settings.json` | Registers both hooks and allows the Bash commands the bootstrap needs (`git clone`, `chmod`, `./setup`). |
| `scripts/install-gstack.sh` | Manual installer — same install the hook runs, for offline recovery or local (non-web) machines. |
| `CLAUDE.md` | Documents the harness and the key skills for any agent working in the repo. |

## Install model

gstack is installed in **team mode** (`./setup --team`), which registers
gstack's own auto-update SessionStart hook, and with `--no-prefix` so commands
are short (`/qa`, not `/gstack-qa`). The gstack tree itself is **not vendored**
into this repo — that is the install path gstack recommends, and it keeps the
repo small.

## Requirements

- `bun` v1.0+ (gstack's setup requires it). The bootstrap skips install with a
  clear message if bun is absent.
- Network access to `github.com` to clone gstack.

## Using the harness

```text
/qa            run the QA test harness on the app
/qa-only       report bugs without changing code
/review        staff-engineer code review
/ship          sync, test, push, open a PR
/investigate   root-cause debugging
/browse        real Chromium browsing with screenshots
```

## Opting out

- Disable enforcement only: remove the `PreToolUse` block from
  `.claude/settings.json`.
- Disable auto-install: remove the `SessionStart` block (skills then require a
  manual `bash scripts/install-gstack.sh`).
- Uninstall gstack globally: `~/.claude/skills/gstack/bin/gstack-uninstall`.
