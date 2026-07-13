#!/usr/bin/env bash
# install-gstack.sh — manual installer for the gstack harness.
#
# The SessionStart hook (.claude/hooks/gstack-bootstrap.sh) runs this same
# install automatically. Use this script when you want to install gstack by
# hand — for example after a network outage, or on a local (non-web) machine.
#
# Installs gstack globally into ~/.claude/skills/gstack and registers its
# skills (/qa, /review, /ship, /browse, ...) with Claude Code.

set -euo pipefail

GSTACK_DIR="${HOME}/.claude/skills/gstack"
GSTACK_REPO="https://github.com/garrytan/gstack.git"

if ! command -v bun >/dev/null 2>&1; then
  echo "Error: bun is required. Install it from https://bun.sh and re-run." >&2
  exit 1
fi

if [ -d "${GSTACK_DIR}/bin" ]; then
  echo "gstack already installed at ${GSTACK_DIR}. Updating..."
  ( cd "${GSTACK_DIR}" && git pull --ff-only || true )
else
  mkdir -p "$(dirname "${GSTACK_DIR}")"
  git clone --single-branch --depth 1 "${GSTACK_REPO}" "${GSTACK_DIR}"
fi

# --team: auto-update each session.  --no-prefix: short commands (/qa not /gstack-qa).
( cd "${GSTACK_DIR}" && ./setup --team --no-prefix )

echo ""
echo "gstack installed. Available skills include:"
echo "  /qa         run the QA test harness (browser test -> find bugs -> fix -> regress)"
echo "  /qa-only    report bugs without changing code"
echo "  /review     staff-engineer code review"
echo "  /ship       sync, test, push, open PR"
echo "  /investigate root-cause debugging"
echo "  /browse     real Chromium browsing with screenshots"
