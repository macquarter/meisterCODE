# 디자인 MCP 설정 — 적용 완료

## 먼저 바로잡을 것 두 가지

### ① "클로드디자인"이라는 제품은 없습니다

디자인브리프에 *"클로드코드(또는 클로드디자인)에서 붙여넣으면 됩니다"* 라고 적혀 있었는데,
**Claude Design이라는 별도 제품이나 MCP 서버는 존재하지 않습니다.**

Claude로 디자인 작업을 할 때 실제로 쓰는 것은 이 셋 중 하나입니다:

| 방법 | 정체 | 우리 상황 |
|---|---|---|
| **Claude Code + HTML→PNG** | 지금 `크몽/` 폴더에서 하는 방식 | **이미 돌아가고 있음** |
| **Figma MCP** | Figma 파일을 읽고/쓰는 MCP 서버 | Figma를 쓸 때만 의미 있음 |
| **Artifacts (claude.ai)** | 브라우저에서 바로 렌더되는 HTML | 파일로 안 떨어져서 납품엔 부적합 |

### ② `/plugin` 이 안 되는 이유

```
/plugin install mcp-server-dev@claude-plugins-official
→ /plugin isn't available in this environment.
```

`/plugin` 은 **로컬 Claude Code CLI 전용 명령**입니다.
지금 이 세션은 클라우드(웹)에서 돌고 있어서 플러그인 설치 명령이 없습니다.
로컬 터미널에서 `claude` 를 띄우면 그때는 됩니다.

그리고 `mcp-server-dev` 는 **MCP 서버를 새로 만들 때 쓰는 개발 도구**지, 디자인 도구가 아닙니다.
우리가 필요한 건 그게 아닙니다.

---

## 적용한 것

프로젝트 루트에 `.mcp.json` 을 만들었습니다. **프로젝트 범위**라 저장소에 커밋되고,
이 레포를 여는 사람은 같은 도구를 자동으로 갖게 됩니다.

```json
{
  "mcpServers": {
    "figma": {
      "type": "http",
      "url": "https://mcp.figma.com/mcp"
    },
    "chrome-devtools": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"]
    }
  }
}
```

`.claude/settings.json` 으로 승인도 미리 걸어뒀습니다:

```json
{ "enabledMcpjsonServers": ["figma", "chrome-devtools"] }
```

### 붙인 서버가 하는 일

| 서버 | 전송 | 하는 일 |
|---|---|---|
| **figma** | HTTP (원격) | Figma 파일을 코드로 읽어오고, 반대로 코드를 Figma로 밀어넣음 |
| **chrome-devtools** | stdio (로컬) | 실제 크롬을 띄워 렌더 결과를 스크린샷·콘솔·네트워크까지 확인 |

### 첫 실행

로컬 터미널에서 이 레포를 열고:

```bash
claude                 # 워크스페이스 신뢰 대화상자 수락
/mcp                   # 서버 상태 확인 + Figma 로그인(OAuth)
```

Figma는 첫 연결 때 `/mcp` 에서 인증을 거칩니다.

### CLI로 직접 추가하고 싶다면

`.mcp.json` 을 손으로 안 쓰고 명령으로 추가하는 방법입니다.

```bash
# 프로젝트 범위 (팀 공유, .mcp.json 에 기록)
claude mcp add --transport http figma --scope project https://mcp.figma.com/mcp

# 로컬 범위 (나만, ~/.claude.json 에 기록)
claude mcp add --transport stdio chrome-devtools -- npx -y chrome-devtools-mcp@latest

# 확인 / 삭제
claude mcp list
claude mcp get figma
claude mcp remove figma
```

> **stdio 서버는 `--` 뒤에 실행 명령을 씁니다.** `--` 가 없으면 Claude가 서버의 플래그를
> 자기 옵션으로 파싱하려다 실패합니다.

### 범위 3가지

| 범위 | 로드 위치 | 팀 공유 | 저장 위치 |
|---|---|---|---|
| `local` (기본) | 현재 프로젝트만 | ✗ | `~/.claude.json` |
| `project` | 현재 프로젝트만 | ✅ 버전관리 | 프로젝트 루트 `.mcp.json` |
| `user` | 모든 프로젝트 | ✗ | `~/.claude.json` |

### API 키가 필요한 서버를 붙일 때

키를 파일에 박지 말고 환경변수로 빼세요. `.mcp.json` 은 커밋되는 파일입니다.

```json
{
  "mcpServers": {
    "some-api": {
      "type": "http",
      "url": "${API_BASE_URL:-https://api.example.com}/mcp",
      "headers": { "Authorization": "Bearer ${API_KEY}" }
    }
  }
}
```

`${VAR}` 와 `${VAR:-기본값}` 이 `command` · `args` · `env` · `url` · `headers` 에서 확장됩니다.

---

## 솔직한 판단 — 지금 이게 필요한가

**당장은 아닙니다.** 이유를 적어둡니다.

1. **우리 파이프라인은 이미 돌아갑니다.** `크몽/render.js` 가 Playwright로 HTML을 PNG로 뽑습니다.
   chrome-devtools MCP가 하는 "브라우저 띄워서 확인"을 이미 하고 있습니다.

2. **디자인 소스가 Figma가 아닙니다.** 드라이브 톤앤매너 폴더의 파일명이
   `AIDrawing_..._MiriCanvas.png` 인 걸로 보아 **미리캔버스**를 쓰고 계십니다.
   미리캔버스는 MCP 서버가 없습니다. Figma로 갈아타지 않는 한 figma 서버는 놀게 됩니다.

3. **1인 운영에 서버가 늘면 관리 대상이 늘어납니다.** 붙여만 두고 안 쓰면 세션 시작이 느려지고
   도구 목록만 복잡해집니다.

### 그래서 이렇게 쓰시면 됩니다

- **Figma로 갈아탈 계획이 있다** → 지금 설정 그대로 두세요. 바로 씁니다.
- **미리캔버스 계속 쓴다** → `.mcp.json` 에서 `figma` 항목만 지우세요.
  chrome-devtools는 남겨도 손해는 없습니다.
- **둘 다 안 쓴다** → `.mcp.json` 과 `.claude/settings.json` 을 지우면 원래대로 돌아갑니다.
  지금 방식(HTML 고치고 `node render.js`)이 제일 단순합니다.

---

## 출처

- [Claude Code MCP 문서 (한국어)](https://code.claude.com/docs/ko/mcp)
- [Figma 원격 MCP 서버 설치](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/)
- [chrome-devtools-mcp (npm)](https://www.npmjs.com/package/chrome-devtools-mcp)
