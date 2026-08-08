#!/usr/bin/env bash
# 렌더링용 웹폰트 내려받기 (폰트 바이너리는 저장소에 커밋하지 않는다)
#   bash fonts/fetch.sh
set -euo pipefail
cd "$(dirname "$0")"

PRE="https://raw.githubusercontent.com/orioncactus/pretendard/main/packages/pretendard/dist/web/static/woff2"
for w in Regular Medium SemiBold Bold ExtraBold Black; do
  [ -f "Pretendard-$w.woff2" ] || curl -fsS -O "$PRE/Pretendard-$w.woff2"
done

# Fraunces (영문 포인트) — Google Fonts CSS를 받아 로컬 경로로 치환
# fraunces.css 는 저장소에 커밋되어 있으므로, 실제 폰트 파일 유무로 판단한다
if [ ! -f fraunces-1.woff2 ]; then
  curl -fsS -A "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36" \
    "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,900&display=swap" \
    -o fraunces-src.css
  python3 - <<'PY'
import re
css = open('fraunces-src.css').read()
for n, u in enumerate(sorted(set(re.findall(r'https://fonts\.gstatic\.com[^)]*', css))), 1):
    import urllib.request; urllib.request.urlretrieve(u, f'fraunces-{n}.woff2')
    css = css.replace(u, f'./fraunces-{n}.woff2')
open('fraunces.css', 'w').write(css)
PY
fi

echo "폰트 준비 완료: $(ls *.woff2 | wc -l)개"
