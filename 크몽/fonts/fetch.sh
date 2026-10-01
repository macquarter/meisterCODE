#!/usr/bin/env bash
# 렌더링용 웹폰트 내려받기 (폰트 바이너리는 저장소에 커밋하지 않는다)
#   bash fonts/fetch.sh
set -euo pipefail
cd "$(dirname "$0")"

PRE="https://raw.githubusercontent.com/orioncactus/pretendard/main/packages/pretendard/dist/web/static/woff2"
for w in Regular Medium SemiBold Bold ExtraBold Black; do
  [ -f "Pretendard-$w.woff2" ] || curl -fsS -O "$PRE/Pretendard-$w.woff2"
done

echo "폰트 준비 완료: $(ls *.woff2 | wc -l)개"
