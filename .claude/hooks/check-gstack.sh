#!/bin/bash
# check-gstack — PreToolUse hook (matcher: Skill)
#
# Verifies the gstack harness is installed before any Skill runs. The
# SessionStart bootstrap (gstack-bootstrap.sh) normally installs it first,
# so this is a backstop for sessions where install was skipped (e.g. offline).
#
# Generated to match `gstack-team-init required`.

if [ ! -d "$HOME/.claude/skills/gstack/bin" ]; then
  cat >&2 <<'MSG'
BLOCKED: gstack is not installed globally.

gstack is required for AI-assisted work in this repo.

Install it:
  bash scripts/install-gstack.sh
  # or manually:
  git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
  cd ~/.claude/skills/gstack && ./setup --team --no-prefix

Then restart your AI coding tool.
MSG
  echo '{"permissionDecision":"deny","message":"gstack is required but not installed. See stderr for install instructions."}'
  exit 0
fi

echo '{}'
