# meisterCODE — 작업 메모

정적 쥬얼리 이커머스 시안(`docs/`, GitHub Pages)과 Apps Script 백엔드(`backend/apps-script/`).
톤: 하이주얼리 럭셔리(Graff 스타일), 다크 배경 + 골드 포인트, Cormorant Garamond / Noto Serif KR.

## 디자인 스킬 (`.claude/skills/`, 출처: github.com/Leonxlnx/taste-skill, MIT)

| 스킬 | 언제 |
| --- | --- |
| `redesign-existing-projects` | 기존 페이지 개선. 먼저 진단 → 기존 스택(바닐라 HTML/CSS/JS) 유지한 채 부분 수정 |
| `design-taste-frontend` | 새 섹션·새 페이지. 다이얼: 랜딩 `DESIGN_VARIANCE 7 / MOTION_INTENSITY 5 / VISUAL_DENSITY 4` |
| `high-end-visual-design` | 고급감 규칙. 이 사이트는 "Editorial Luxury" 계열로 적용 |

충돌 시 우선순위: 기존 브랜드(로고·색·폰트) > redesign 규칙 > taste 규칙.
스킬이 Tailwind/React를 전제로 쓴 부분은 바닐라 CSS로 옮겨서 적용한다(프레임워크 도입 금지).

## 화면 검증 (Playwright)

UI를 고쳤으면 "다 됐다"고 하기 전에 브라우저로 직접 확인한다.
- 데스크톱 1440×900, 모바일 390×844 두 크기로 스크린샷
- 콘솔 에러, 가로 스크롤(`scrollWidth > innerWidth`) 여부 확인
- 클라우드 세션: Chromium·playwright 기본 설치됨(`/opt/node22/lib/node_modules/playwright`). 단, 외부 CDN(구글폰트·unsplash·pexels)은 샌드박스 인증서 문제로 안 불러와지므로 레이아웃·에러 확인 용도로만 본다.
- 로컬: `claude mcp add playwright -s user -- npx @playwright/mcp@latest`
