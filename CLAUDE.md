# meisterCODE

중앙마이스터 코드 사업부 저장소. 쥬얼리 이커머스 시안(`docs/`, GitHub Pages), 구글 앱스 스크립트 백엔드(`backend/apps-script/`), 사내 도구(`tools/`).

## YouTube 영상 확인 요청이 오면

대표님은 YouTube 링크를 자주 보내고 "확인해보고 도입 검토"를 요청한다. 클라우드 세션의 IP는 YouTube가 자주 막으므로 아래 순서로, 앞 단계가 막혀도 멈추지 말고 끝까지 진행한다.

1. `tools/yt-transcript/yt_transcript.py <URL> --summarize none` 실행
   - 자막을 얻으면 `out/<ID>/transcript.txt`를 읽고 요약
   - 차단돼도 제목·채널(oEmbed)과 YouTube가 자동 생성한 장면 이미지 3~4장(`thumb_*.jpg`)은 받아진다. 이미지는 Read로 직접 본다
2. 차단됐다면 Higgsfield MCP `video_analysis_create`(youtube_url)로 장면별 분석을 맡긴다
   - 대기열이 길 수 있으니 `send_later`로 4~5분 뒤 확인을 예약하고, 그동안 3번을 진행한다
3. 제목·채널로 웹 검색해 영상의 맥락(제품·도구·출처)을 확인한다
4. 결과를 모아 보고: 무엇을 확인했고 무엇을 못 봤는지(자막만/화면만/둘 다) 분명히 밝힌다

보고 형식: 영상 요약 → 과장·근거 부족한 주장 → 우리 회사(가드/코드/크루/클린 사업부)에 도입할 만한지와 구체적 적용안.

## 사이트 수정 후 화면 확인 (Chrome DevTools MCP)

`.mcp.json`에 `chrome-devtools` MCP가 등록되어 있다(`tools/mcp/chrome-devtools.mjs`가 실행). `docs/`를 고친 뒤에는 브라우저로 직접 열어 확인한다.

- 모든 페이지 도구는 `pageId`가 필요하다: `new_page`(url) → 결과의 `[selected]` 번호를 `pageId`로 사용
- 확인 순서: `new_page` → `list_console_messages`(오류) → `take_screenshot` → 모바일은 `emulate`/`resize_page`
- 클라우드 세션에서는 외부 이미지·폰트가 프록시 인증서 문제로 `ERR_CERT_AUTHORITY_INVALID`가 나며 안 보인다. 사이트 버그가 아니니 무시하고, 로컬 파일(`file:///.../docs/...`)의 레이아웃·스크립트 오류만 판단한다
