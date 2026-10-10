# MiroFish — 시장 반응 리허설 (회사 컴퓨터용)

[MiroFish](https://github.com/666ghj/MiroFish)는 자료(보도자료·제안서·공지문 등)를 넣으면 그 안의 인물·조직을 뽑아
**수십~수백 명의 AI 가상 인물**을 만들고, 가상의 SNS(트위터·레딧 형태)에서 서로 글을 쓰고 반응하게 한 뒤
"어떻게 퍼지고 어떤 반응이 나올지" 보고서로 정리해 주는 오픈소스 도구입니다.

- 온라인 체험(설치 없이): https://666ghj.github.io/mirofish-demo/
- 실제 시장 조사를 대신하지는 못합니다. **"이런 반응도 나올 수 있겠다"를 미리 보는 브레인스토밍 도구**로 쓰세요.

## 우리 회사에서 쓰는 법

| 사업부 | 넣을 자료 (seed) | 물어볼 것 |
|---|---|---|
| 가드 | 신규 서비스 소개문, 요금표 | "아파트 관리소장·입주민 대표는 이 제안에 어떻게 반응할까? 가장 많이 나올 반대 이유는?" |
| 클린 | 할인 이벤트 공지 | "이 공지가 맘카페·지역 커뮤니티에서 어떻게 퍼질까? 오해가 생길 문구는?" |
| 코드 | 쥬얼리 사이트 VIP 살롱 소개 | "고가 주얼리 고객이 '초대 코드 전용' 방식을 어떻게 받아들일까?" |
| 공통 | 지원사업 사업계획서 요약 | "심사위원 관점에서 가장 먼저 지적될 약점은?" |

`scenarios/` 폴더에 바로 채워 쓰는 양식이 있습니다.

## 주의할 점 (설치 전에 꼭 읽기)

1. **비용**: 가상 인물이 많고 대화가 길수록 AI 호출이 폭증합니다. 동시에 최대 30건씩 호출합니다.
   - Gemini **무료 한도로는 한도 초과(429)가 자주 납니다.** 처음엔 인물 수를 적게, 라운드는 **10~20회 이하**로 짧게 돌리세요.
   - 제대로 쓰려면 Google AI Studio에서 결제(요금제)를 켜야 합니다.
2. **자료가 외부로 나갑니다**: 넣은 자료는 Google(Gemini)과 Zep(미국 클라우드, 기억 저장용)으로 전송됩니다.
   **고객 개인정보·계약서 원문·주민번호 등은 넣지 마세요.** 공개해도 되는 수준으로 다듬은 요약만 넣습니다.
3. **라이선스(AGPL-3.0)**: 회사 내부에서 쓰는 것은 문제없습니다. 다만 MiroFish를 고쳐서 **외부 고객에게 서비스로 제공**하면
   고친 소스를 공개해야 합니다. 그래서 이 저장소에는 MiroFish 코드를 넣지 않고, 설치할 때 따로 받습니다.
4. **결과는 AI의 추측입니다**: 가상 인물의 반응은 실제 여론이 아닙니다. 보고서 내용은 아이디어로만 쓰고, 중요한 결정은 실제 고객 의견으로 확인하세요.

## 설치 (처음 한 번)

### 준비물
- **Node.js 18 이상**: https://nodejs.org (LTS 버전)
- **Python 3.11 또는 3.12** (3.13은 안 됨): https://www.python.org/downloads/
- **uv** (Python 패키지 관리자)
  - Windows PowerShell: `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`
  - macOS: `brew install uv`

### 키 2개
| 키 | 어디서 | 비고 |
|---|---|---|
| `LLM_API_KEY` | 이미 발급한 Gemini 키 ([AI Studio](https://aistudio.google.com/apikey)) | 가상 인물들의 두뇌 |
| `ZEP_API_KEY` | https://app.getzep.com 가입 → API Keys | 가상 인물들의 기억 저장소. 월 무료 한도 있음 |

### 설치 명령
```bash
# 1) MiroFish 받기 (meisterCODE 폴더 밖, 예: 문서 폴더에서)
git clone https://github.com/666ghj/MiroFish.git
cd MiroFish

# 2) 우리 회사용 설정 파일 복사 후 키 2개 채우기
#    (meisterCODE/tools/mirofish/env.example → MiroFish/.env)
cp ../meisterCODE/tools/mirofish/env.example .env      # Windows: copy ..\meisterCODE\tools\mirofish\env.example .env

# 3) 설치 (몇 분 걸림)
npm run setup:all

# 4) 실행
npm run dev
```
브라우저에서 **http://localhost:3000** 을 열면 됩니다. 끝낼 때는 터미널에서 `Ctrl + C`.

## 사용 순서

1. `scenarios/` 양식 하나를 골라 빈칸을 채우고, 그 파일을 MiroFish 화면에 업로드합니다.
2. 예측 요청에는 양식 맨 아래 "MiroFish에 입력할 질문"을 그대로 붙여 넣습니다.
3. **처음에는 라운드를 10~20회로 짧게** 돌려 비용과 결과를 확인합니다.
4. 보고서가 나오면 Claude에게 붙여 넣고 "이 결과에서 실제로 확인해 볼 만한 것만 3개 골라줘"라고 하면 정리해 드립니다.

## 문제가 생기면

| 증상 | 원인·해결 |
|---|---|
| `429` / `RESOURCE_EXHAUSTED` | Gemini 무료 한도 초과. 라운드·인물 수를 줄이거나 결제를 켜세요 |
| `ZEP_API_KEY 未配置` (중국어 오류) | `.env`에 Zep 키가 비어 있음 |
| 화면이 중국어 | 화면의 언어 선택에서 English로 바꾸세요. 한국어 메뉴는 아직 없어서 보고서도 영어로 나옵니다 → Claude에게 붙여 넣어 번역·정리 |
| Python 버전 오류 | 3.11 또는 3.12를 설치하세요 |
