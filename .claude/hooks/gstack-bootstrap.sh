#!/usr/bin/env bash
# gstack-bootstrap — SessionStart hook
#
# Ensures the gstack harness (https://github.com/garrytan/gstack) is installed
# globally at ~/.claude/skills/gstack at the start of every Claude Code session.
#
# Why a SessionStart hook? Claude Code on the web runs in a fresh, ephemeral
# container each session. gstack installs into ~/.claude (the home dir), which
# is NOT committed to the repo, so it disappears between sessions. This hook
# reinstalls it automatically so skills like /qa (the test harness), /review,
# /ship, and /browse are always available.
#
# Design rules:
#   - Idempotent: skips install if gstack is already present.
#   - Non-fatal: never exits non-zero, so a network outage can't break a
#     session. Failures are reported to stderr and as additionalContext.
#   - Locked: avoids concurrent installs from parallel session starts.

set -uo pipefail

GSTACK_DIR="${HOME}/.claude/skills/gstack"
GSTACK_REPO="https://github.com/garrytan/gstack.git"
LOCK_DIR="${HOME}/.claude/skills/.gstack-bootstrap.lock"

emit_context() {
  # SessionStart hooks may return JSON whose additionalContext is injected
  # into the model's context. Keep it short.
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' \
    "$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g')"
}

log() { printf 'gstack-bootstrap: %s\n' "$1" >&2; }

# Already installed? Done.
if [ -d "${GSTACK_DIR}/bin" ]; then
  log "gstack already installed at ${GSTACK_DIR}"
  emit_context "gstack harness is installed. Skills available: /qa (test harness), /qa-only, /review, /ship, /investigate, /browse, /cso. Use /qa to run the QA test harness and /browse for web browsing."
  exit 0
fi

# bun is required by gstack's setup.
if ! command -v bun >/dev/null 2>&1; then
  log "bun not found — cannot install gstack. Install bun, then re-run scripts/install-gstack.sh"
  emit_context "gstack harness is NOT installed (bun missing). Run scripts/install-gstack.sh after installing bun (https://bun.sh)."
  exit 0
fi

# Single-flight lock (mkdir is atomic). If another start is installing, bail.
if ! mkdir "${LOCK_DIR}" 2>/dev/null; then
  log "another bootstrap is in progress; skipping"
  exit 0
fi
trap 'rmdir "${LOCK_DIR}" 2>/dev/null || true' EXIT

mkdir -p "$(dirname "${GSTACK_DIR}")"

log "installing gstack into ${GSTACK_DIR} ..."
if ! git clone --single-branch --depth 1 "${GSTACK_REPO}" "${GSTACK_DIR}" >&2 2>&1; then
  log "git clone failed (offline?). Skipping — run scripts/install-gstack.sh later."
  rm -rf "${GSTACK_DIR}"
  emit_context "gstack harness install failed (clone error, likely offline). Re-run scripts/install-gstack.sh when network is available."
  exit 0
fi

# --team registers the auto-update SessionStart hook; --no-prefix gives short
# command names (/qa instead of /gstack-qa).
if ( cd "${GSTACK_DIR}" && ./setup --team --no-prefix ) >&2 2>&1; then
  log "gstack installed."
  emit_context "gstack harness installed successfully. Skills available: /qa (test harness), /qa-only, /review, /ship, /investigate, /browse, /cso. Use /qa to run the QA test harness."
else
  log "gstack setup failed. Re-run scripts/install-gstack.sh."
  emit_context "gstack harness clone succeeded but setup failed. Re-run scripts/install-gstack.sh."
fi

exit 0
