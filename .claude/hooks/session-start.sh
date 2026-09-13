#!/bin/bash
#
# SessionStart 훅 — Claude Code on the web 세션이 시작될 때 실행된다.
#
# 이 저장소는 번들러 없는 정적 사이트(docs/)와 Apps Script 백엔드로만 이루어져
# 있어 설치할 런타임 의존성이 없다. 그래서 이 훅이 하는 일은
#   1) 검사를 돌릴 Node가 실제로 있는지 확인하고
#   2) 나중에 의존성이 생기면 자동으로 설치하고
#   3) 세션 내내 쓸 환경 변수를 남기는 것
# 이다. 여러 번 실행해도 안전하며(idempotent), 입력을 요구하지 않는다.

set -euo pipefail

# 원격(웹) 세션에서만 동작한다. 로컬에서는 조용히 빠져나간다.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$PROJECT_DIR"

echo "[session-start] 프로젝트: $PROJECT_DIR"

# 1) Node 확인 — lint와 test 모두 Node 내장 기능만 쓴다.
if ! command -v node >/dev/null 2>&1; then
  echo "[session-start] 오류: node를 찾을 수 없습니다. lint와 test를 실행할 수 없습니다." >&2
  exit 1
fi
echo "[session-start] node $(node --version), npm $(npm --version 2>/dev/null || echo '없음')"

# node:test와 최신 문법을 쓰므로 Node 18 미만은 경고한다.
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "[session-start] 경고: node:test 러너는 Node 18 이상이 필요합니다 (현재 $NODE_MAJOR)." >&2
fi

# 2) 의존성 설치 — 지금은 없지만, package.json에 생기면 자동으로 설치된다.
#    컨테이너 상태가 훅 완료 후 캐시되므로 npm ci 대신 npm install을 쓴다.
if [ -f package.json ] && node -e '
  const p = require("./package.json");
  const n = Object.keys(p.dependencies || {}).length + Object.keys(p.devDependencies || {}).length;
  process.exit(n > 0 ? 0 : 1);
'; then
  echo "[session-start] npm install 실행 중..."
  npm install --no-audit --no-fund
else
  echo "[session-start] 설치할 npm 의존성 없음 (검사는 Node 내장 기능만 사용)"
fi

# 3) 세션 환경 변수 남기기.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo "export MEISTER_SITE_DIR=\"$PROJECT_DIR/docs\""
    echo "export MEISTER_PREVIEW_PORT=4173"
  } >> "$CLAUDE_ENV_FILE"
  echo "[session-start] 환경 변수 기록: MEISTER_SITE_DIR, MEISTER_PREVIEW_PORT"
fi

cat <<'USAGE'
[session-start] 준비 완료. 사용 가능한 명령:
  npm run lint    모든 JS/GS 문법 + 병합 충돌 표시 검사
  npm test        docs/ 정적 사이트 스모크 테스트 (node:test)
  npm run serve   http://localhost:4173 으로 docs/ 미리보기
USAGE
