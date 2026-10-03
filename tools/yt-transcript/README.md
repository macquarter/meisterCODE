# YouTube 자막 추출 + AI 요약 (내 컴퓨터용)

YouTube 주소 하나로 **자막 → (없으면) 받아쓰기 → Claude 요약**까지 한 번에 처리합니다.
클라우드 서버는 YouTube가 봇으로 막는 경우가 많아, **내 컴퓨터(집·사무실 인터넷)에서 실행**하도록 만들었습니다.

```
YouTube 주소
  → ① yt-dlp 자막 (안드로이드 → 아이폰 → TV → 웹 방식 순서로 시도)
  → ② youtube-transcript-api
      ├ 성공          → 자막 확보
      ├ 자막이 원래 없음 → 음성 받기 → 받아쓰기(faster-whisper 또는 Groq) → 자막 확보
      └ YouTube가 막음  → 받아쓰기로 넘어가지 않고 해결 방법 안내 후 종료
  → ③ Claude 요약 (원하면 GPT·Gemini 교차 확인)
```

## 처음 한 번만: 설치

준비물: **Python 3.10 이상**, **Deno**(YouTube 접속에 필요한 계산을 yt-dlp가 대신 처리하는 데 씀)

| | Windows (PowerShell) | macOS (터미널) |
|---|---|---|
| Python | [python.org](https://www.python.org/downloads/)에서 설치 (설치 화면에서 "Add to PATH" 체크) | `brew install python` |
| Deno | `irm https://deno.land/install.ps1 \| iex` | `brew install deno` |

그다음 이 폴더에서:

```bash
# Windows
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

# macOS
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

마지막으로 `.env.example`을 `.env`로 복사하고 `ANTHROPIC_API_KEY`를 채웁니다.
API 키는 [Claude Console](https://console.anthropic.com/settings/keys)에서 발급합니다.

## 사용법

```bash
python yt_transcript.py "https://youtu.be/p4Mn6KFsSeM"
```

결과는 `out/<영상ID>/` 폴더에 저장됩니다.

| 파일 | 내용 |
|---|---|
| `transcript.txt` | `[mm:ss] 문장` 형식의 자막 |
| `meta.json` | 제목·채널·길이, 자막을 어디서 얻었는지 |
| `summary_claude.md` | Claude 요약 |

### 자주 쓰는 옵션

```bash
# 자막만 받고 요약은 안 함
python yt_transcript.py URL --summarize none

# 세 AI 교차 확인 (.env에 OpenAI·Gemini 키와 모델 이름 필요)
python yt_transcript.py URL --summarize claude,gpt,gemini

# 원하는 질문으로 요약
python yt_transcript.py URL --prompt "이 영상에서 소개한 도구들을 표로 정리하고, 우리 회사에 쓸 만한지 평가해줘"

# 영어 자막 우선
python yt_transcript.py URL --lang en,ko

# 받아쓰기 정확도 높이기 (느려짐)
python yt_transcript.py URL --whisper-model medium
```

전체 옵션: `python yt_transcript.py --help`

## "차단됨"이 뜰 때

YouTube가 지금 내 인터넷(IP)을 막은 상태입니다. 자막과 음성을 같은 곳에서 받기 때문에, 받아쓰기로 넘어가도 똑같이 실패합니다.

막혀도 도구가 자동으로 건지는 것:
- 제목·채널 (`meta.json`)
- YouTube가 자동으로 뽑아 둔 장면 이미지 3~4장 (`thumb_*.jpg`)
- `.env`에 `GEMINI_API_KEY`와 `GEMINI_MODEL`이 있으면: Gemini가 YouTube 주소를 직접 받아 영상을 보고 요약 (`summary_gemini_video.md`). Google 서버가 영상을 가져가므로 내 IP 차단과 무관합니다.

그래도 자막이 꼭 필요하면 아래 순서대로 해 보세요.

1. 수십 분 뒤 다시 실행합니다. 짧은 시간에 많이 요청해서 걸린 일시 제한(429)이면 풀립니다.
2. VPN을 끄거나 다른 네트워크(휴대폰 테더링 등)에서 실행합니다.
3. 브라우저에 로그인된 YouTube 정보를 씁니다: `--cookies-from-browser chrome` (edge, firefox, safari도 가능)
   - 계정 정지 위험이 있으니 **회사 대표 계정 말고 별도 YouTube 계정**을 쓰세요.

## 받아쓰기 엔진

| 엔진 | 언제 쓰나 | 비용·속도 |
|---|---|---|
| faster-whisper (기본) | `.env`에 `GROQ_API_KEY`가 없을 때 | 무료. 처음 실행 때 모델을 내려받음. 그래픽카드 없으면 30분 영상에 수 분 이상 |
| Groq Whisper | `GROQ_API_KEY`가 있고 음성 파일이 25MB 이하일 때 | 유료이지만 저렴하고 빠름 |

`--whisper local` 또는 `--whisper groq`로 직접 고를 수도 있습니다.

## 참고

- 요약 모델 기본값은 `claude-opus-5-5`입니다. 바꾸려면 `.env`에 `CLAUDE_MODEL=...`을 넣습니다.
- Claude가 내용을 거절하면 서버가 자동으로 다른 Claude 모델로 다시 시도하도록 설정되어 있습니다(`fallbacks: "default"`).
- GPT·Gemini는 모델 이름이 자주 바뀌어 기본값을 두지 않았습니다. `.env`의 `OPENAI_MODEL`, `GEMINI_MODEL`에 직접 넣어 주세요.
- 종료 코드: `0` 성공(차단됐지만 Gemini 영상 분석 성공 포함), `1` 자막 또는 요약 실패, `2` YouTube 차단
