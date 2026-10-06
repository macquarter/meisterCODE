#!/usr/bin/env python3
"""YouTube 자막 추출 → (없으면) 음성 받아쓰기 → AI 요약.

내 컴퓨터(가정·사무실 인터넷)에서 실행하는 것을 전제로 한다.
클라우드 서버 IP는 YouTube가 봇으로 막는 경우가 많다.

순서:
  1. yt-dlp 자막 (android → ios → tv → web 클라이언트 순)
  2. youtube-transcript-api
  3. 자막이 "없으면" 음성 받기 → faster-whisper(로컬) 또는 Groq Whisper
     자막이 "막혔으면" 음성도 막히므로 받아쓰기로 넘어가지 않고 안내 후 종료
  4. Claude 요약 (선택: GPT·Gemini 교차 확인)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

PLAYER_CLIENTS = ["android", "ios", "tv", "web"]

BLOCK_PATTERNS = [
    "not a bot", "sign in to confirm", "429", "too many requests",
    "ipblocked", "requestblocked", "403", "forbidden", "page needs to be reloaded",
]

DEFAULT_PROMPT = """아래는 YouTube 영상의 자막입니다. 한국어로 정리해 주세요.

1. 한 줄 요약
2. 핵심 내용 (타임스탬프와 함께 5~10개)
3. 영상 속 주장 중 근거가 약하거나 확인이 필요한 것
4. 실제로 적용해 볼 만한 점

자막은 자동 생성이라 오타·잘못 들은 단어가 있을 수 있습니다. 문맥으로 바로잡아 읽어 주세요."""


class Blocked(Exception):
    """YouTube가 현재 네트워크(IP)를 막음."""


@dataclass
class Transcript:
    source: str
    language: str | None
    lines: list[tuple[float, str]] = field(default_factory=list)

    def as_text(self) -> str:
        return "\n".join(f"[{fmt_ts(t)}] {s}" for t, s in self.lines)


def fmt_ts(sec: float) -> str:
    sec = int(sec)
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def is_blocked(err: BaseException | str) -> bool:
    text = f"{type(err).__name__} {err}".lower() if isinstance(err, BaseException) else err.lower()
    return any(p in text for p in BLOCK_PATTERNS)


def video_id_of(url: str) -> str:
    m = re.search(r"(?:v=|youtu\.be/|shorts/|live/|embed/)([\w-]{11})", url)
    if m:
        return m.group(1)
    if re.fullmatch(r"[\w-]{11}", url):
        return url
    raise SystemExit(f"YouTube 주소에서 영상 ID를 찾지 못했습니다: {url}")


def parse_vtt(path: Path) -> list[tuple[float, str]]:
    """자동 자막 VTT는 같은 문장이 여러 번 겹쳐 나오므로 중복을 걷어낸다."""
    lines: list[tuple[float, str]] = []
    start = 0.0
    last = ""
    for raw in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"(\d+):(\d\d):(\d\d)\.\d+\s+-->", raw)
        if m:
            h, mi, s = map(int, m.groups())
            start = h * 3600 + mi * 60 + s
            continue
        text = re.sub(r"<[^>]+>", "", raw).strip()
        if not text or text == last or text.startswith(("WEBVTT", "Kind:", "Language:", "NOTE")):
            continue
        last = text
        lines.append((start, text))
    return lines


# ---------------------------------------------------------------- 1. yt-dlp 자막

class _QuietLogger:
    """yt-dlp 자체 오류 출력을 끈다. 오류는 예외로 받아 여기서 분류해 보여준다."""

    def debug(self, msg): pass
    def info(self, msg): pass
    def warning(self, msg): pass
    def error(self, msg): pass


def ydl_opts(workdir: Path, cookies_browser: str | None, **extra) -> dict:
    opts = {
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "logger": _QuietLogger(),
        "outtmpl": str(workdir / "%(id)s.%(ext)s"),
        **extra,
    }
    if cookies_browser:
        opts["cookiesfrombrowser"] = (cookies_browser,)
    return opts


def try_ytdlp_captions(url: str, langs: list[str], workdir: Path,
                       cookies_browser: str | None) -> tuple[Transcript | None, dict]:
    """반환: (자막 또는 None, 영상 정보). 자막이 원래 없으면 (None, info)."""
    from yt_dlp import YoutubeDL

    wanted = [x for l in langs for x in (l, f"{l}-orig")]
    blocked_errors = []
    for client in PLAYER_CLIENTS:
        log(f"  · yt-dlp 자막 시도 (player_client={client})")
        opts = ydl_opts(
            workdir, cookies_browser,
            skip_download=True, writesubtitles=True, writeautomaticsub=True,
            ignore_no_formats_error=True,  # 영상 포맷이 막혀도 자막은 받을 수 있음
            subtitleslangs=wanted, subtitlesformat="vtt",
            extractor_args={"youtube": {"player_client": [client]}},
        )
        try:
            with YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=True)
        except Exception as e:  # yt-dlp는 DownloadError 하나로 다 감싼다
            if is_blocked(e):
                blocked_errors.append(f"{client}: {str(e).splitlines()[0][:120]}")
                continue
            log(f"    실패: {str(e).splitlines()[0][:160]}")
            continue

        if not info.get("subtitles") and not info.get("automatic_captions"):
            return None, info  # 자막 자체가 없음 — 다른 클라이언트도 결과 같음

        for lang in wanted:
            f = workdir / f"{info['id']}.{lang}.vtt"
            if f.exists():
                manual = lang in (info.get("subtitles") or {})
                src = f"yt-dlp:{client}:{'manual' if manual else 'auto'}"
                return Transcript(src, lang, parse_vtt(f)), info
        log(f"    {client}: 요청한 언어({','.join(langs)}) 자막 없음")
        return None, info

    if blocked_errors:
        raise Blocked("; ".join(blocked_errors))
    return None, {}


# ---------------------------------------------------------------- 2. youtube-transcript-api

def try_transcript_api(video_id: str, langs: list[str]) -> Transcript | None:
    from youtube_transcript_api import YouTubeTranscriptApi

    log("  · youtube-transcript-api 시도")
    try:
        fetched = YouTubeTranscriptApi().fetch(video_id, languages=langs)
    except Exception as e:
        if is_blocked(e):
            raise Blocked(f"youtube-transcript-api: {type(e).__name__}") from e
        log(f"    실패: {type(e).__name__}")
        return None
    lines = [(s.start, s.text.replace("\n", " ").strip()) for s in fetched.snippets if s.text.strip()]
    return Transcript("youtube-transcript-api", fetched.language_code, lines)


# ---------------------------------------------------------------- 3. 음성 → 받아쓰기

def download_audio(url: str, workdir: Path, cookies_browser: str | None) -> Path:
    """ffmpeg 없이 받을 수 있는 원본 음성(m4a/webm)을 그대로 받는다."""
    from yt_dlp import YoutubeDL

    log("  · 음성 다운로드")
    opts = ydl_opts(workdir, cookies_browser, format="bestaudio[ext=m4a]/bestaudio",
                    outtmpl=str(workdir / "audio.%(ext)s"))
    try:
        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
            return Path(ydl.prepare_filename(info))
    except Exception as e:
        if is_blocked(e):
            raise Blocked(f"음성 다운로드: {str(e).splitlines()[0][:120]}") from e
        raise


def transcribe_groq(audio: Path, lang: str | None) -> Transcript:
    import requests

    log("  · Groq Whisper 받아쓰기")
    with audio.open("rb") as fh:
        r = requests.post(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {os.environ['GROQ_API_KEY']}"},
            files={"file": (audio.name, fh)},
            data={"model": "whisper-large-v3", "response_format": "verbose_json",
                  **({"language": lang} if lang else {})},
            timeout=600,
        )
    r.raise_for_status()
    data = r.json()
    lines = [(seg["start"], seg["text"].strip()) for seg in data.get("segments", [])]
    return Transcript("whisper:groq", data.get("language", lang), lines)


def transcribe_local(audio: Path, lang: str | None, model_size: str) -> Transcript:
    from faster_whisper import WhisperModel

    log(f"  · faster-whisper 받아쓰기 (모델 {model_size}, 처음 실행 시 모델 다운로드)")
    model = WhisperModel(model_size, device="auto", compute_type="default")
    segments, info = model.transcribe(str(audio), language=lang, vad_filter=True)
    lines = []
    for seg in segments:
        lines.append((seg.start, seg.text.strip()))
        print(f"\r    {fmt_ts(seg.end)} 까지 처리", end="", file=sys.stderr, flush=True)
    print(file=sys.stderr)
    return Transcript(f"whisper:local:{model_size}", info.language, lines)


GROQ_MAX_BYTES = 25 * 1024 * 1024


def transcribe(audio: Path, lang: str | None, engine: str, model_size: str) -> Transcript:
    if engine == "auto":
        engine = "groq" if os.environ.get("GROQ_API_KEY") and audio.stat().st_size <= GROQ_MAX_BYTES else "local"
    if engine == "groq":
        if audio.stat().st_size > GROQ_MAX_BYTES:
            log("    파일이 25MB를 넘어 Groq 대신 로컬 받아쓰기로 전환")
            return transcribe_local(audio, lang, model_size)
        return transcribe_groq(audio, lang)
    return transcribe_local(audio, lang, model_size)


# ---------------------------------------------------------------- 4. AI 요약

def build_user_message(meta: dict, tr: Transcript, prompt: str) -> str:
    head = f"제목: {meta.get('title', '')}\n채널: {meta.get('channel', '')}\n주소: {meta.get('url', '')}\n"
    return f"{prompt}\n\n{head}\n<transcript source=\"{tr.source}\">\n{tr.as_text()}\n</transcript>"


def summarize_claude(message: str) -> str:
    import anthropic

    client = anthropic.Anthropic()
    # fallbacks="default": 안전 분류기가 거절하면 서버가 다른 모델로 자동 재시도
    with client.beta.messages.stream(
        model=os.environ.get("CLAUDE_MODEL", "claude-opus-5-5"),
        max_tokens=16000,
        thinking={"type": "adaptive"},
        output_config={"effort": "medium"},
        betas=["server-side-fallback-2026-07-01"],
        extra_body={"fallbacks": "default"},
        messages=[{"role": "user", "content": message}],
    ) as stream:
        resp = stream.get_final_message()
    if resp.stop_reason == "refusal":
        raise RuntimeError("Claude가 이 요청을 거절했습니다")
    return "".join(b.text for b in resp.content if b.type == "text")


def summarize_gpt(message: str) -> str:
    from openai import OpenAI

    model = os.environ.get("OPENAI_MODEL")
    if not model:
        raise RuntimeError("OPENAI_MODEL 환경변수에 사용할 모델 이름을 넣어 주세요")
    resp = OpenAI().responses.create(model=model, input=message)
    return resp.output_text


def summarize_gemini(message: str) -> str:
    from google import genai

    model = os.environ.get("GEMINI_MODEL")
    if not model:
        raise RuntimeError("GEMINI_MODEL 환경변수에 사용할 모델 이름을 넣어 주세요")
    with genai.Client() as client:  # 변수로 붙잡지 않으면 응답 전에 연결이 닫힌다
        return client.models.generate_content(model=model, contents=message).text


SUMMARIZERS = {"claude": summarize_claude, "gpt": summarize_gpt, "gemini": summarize_gemini}


# ---------------------------------------------------------------- 막혔을 때 우회

def fetch_oembed(url: str) -> dict:
    """oEmbed(제목·채널)는 영상 페이지가 막혀도 대개 열린다."""
    import requests

    try:
        r = requests.get("https://www.youtube.com/oembed",
                         params={"url": url, "format": "json"}, timeout=20)
        r.raise_for_status()
        d = r.json()
        return {"title": d.get("title"), "channel": d.get("author_name")}
    except Exception as e:
        log(f"  · oEmbed 실패: {type(e).__name__}")
        return {}


def save_thumbnails(vid: str, workdir: Path) -> list[Path]:
    """YouTube가 자동으로 뽑아 둔 장면 3장(영상 25%·50%·75% 지점)과 대표 썸네일."""
    import requests

    saved = []
    for name in ("hqdefault", "hq1", "hq2", "hq3"):
        try:
            r = requests.get(f"https://i.ytimg.com/vi/{vid}/{name}.jpg", timeout=20)
        except Exception:
            continue
        if r.status_code == 200 and len(r.content) > 2000:
            p = workdir / f"thumb_{name}.jpg"
            p.write_bytes(r.content)
            saved.append(p)
    return saved


def gemini_models() -> list[str]:
    """GEMINI_MODEL은 쉼표로 여러 개를 줄 수 있다. 앞 모델이 과부하면 다음 모델로."""
    models = [m.strip() for m in os.environ.get("GEMINI_MODEL", "").split(",") if m.strip()]
    if not models:
        raise RuntimeError("GEMINI_MODEL 환경변수에 사용할 모델 이름을 넣어 주세요")
    return models


def gemini_watch_youtube(url: str, prompt: str, model: str) -> str:
    """Gemini API는 YouTube 주소를 직접 받아 영상을 본다 (Google 서버가 영상을 가져감)."""
    from google import genai
    from google.genai import types

    with genai.Client() as client:  # 변수로 붙잡지 않으면 응답 전에 연결이 닫힌다
        resp = client.models.generate_content(
            model=model,
            contents=types.Content(parts=[
                types.Part(file_data=types.FileData(file_uri=url)),
                types.Part(text=prompt + "\n\n먼저 영상의 대사·내레이션을 타임스탬프와 함께 받아 적은 뒤 정리해 주세요."),
            ]),
        )
        return resp.text


def handle_blocked(url: str, vid: str, workdir: Path, prompt: str) -> int:
    """자막·음성이 막혔을 때 쓸 수 있는 것을 최대한 건진다."""
    log("\n[우회] 막히지 않는 경로로 가능한 정보 수집")
    meta = {"url": url, "id": vid, "blocked": True, **fetch_oembed(url)}
    thumbs = save_thumbnails(vid, workdir)
    meta["thumbnails"] = [p.name for p in thumbs]
    (workdir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"  ✓ 제목: {meta.get('title')} / 채널: {meta.get('channel')}")
    log(f"  ✓ 장면 이미지 {len(thumbs)}장 → {workdir}")

    if os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"):
        log("  · Gemini에 YouTube 주소를 직접 넘겨 영상 분석")
        import time

        text, err = None, None
        try:
            models = gemini_models()
        except RuntimeError as e:
            models, err = [], e
        for model in models:
            for wait in (0, 10, 30):  # 503(과부하)·429(한도)는 잠시 뒤 재시도
                if wait:
                    log(f"    {model}: 일시적 오류로 {wait}초 뒤 재시도")
                    time.sleep(wait)
                try:
                    text = gemini_watch_youtube(url, prompt, model)
                    break
                except Exception as e:
                    err = e
                    if not re.search(r"\b(503|429|500)\b|UNAVAILABLE|RESOURCE_EXHAUSTED", str(e)):
                        break
            if text is not None:
                log(f"  ✓ 사용 모델: {model}")
                break
            log(f"    {model} 실패 → 다음 모델")
        if text is None:
            log(f"  ✗ Gemini 영상 분석 실패: {err}")
        else:
            out = workdir / "summary_gemini_video.md"
            out.write_text(text, encoding="utf-8")
            log(f"  ✓ Gemini 영상 분석 → {out}")
            print(text)
            return 0
    else:
        log("  · GEMINI_API_KEY를 .env에 넣으면 막혔을 때도 Gemini가 영상을 직접 보고 요약합니다")
    log(BLOCK_HELP)
    return 2


# ---------------------------------------------------------------- 실행

BLOCK_HELP = """
YouTube가 지금 이 네트워크(IP)를 막고 있습니다. 자막·음성 모두 같은 곳에서 받으므로
받아쓰기로 넘어가도 똑같이 실패합니다. 아래 중 하나를 해 보세요.

  1) 잠시(수십 분) 뒤 다시 실행 — 일시적인 429 제한이면 풀립니다
  2) VPN을 끄거나 다른 네트워크(휴대폰 테더링 등)에서 실행
  3) 브라우저 로그인 정보 사용:  --cookies-from-browser chrome
     (회사 대표 계정 대신 별도 YouTube 계정을 권장합니다)
"""


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def main() -> int:
    load_dotenv(Path(__file__).with_name(".env"))

    ap = argparse.ArgumentParser(description="YouTube 자막 추출 + AI 요약")
    ap.add_argument("url", help="YouTube 주소 또는 영상 ID")
    ap.add_argument("--lang", default="ko,en", help="자막 언어 우선순위 (기본: ko,en)")
    ap.add_argument("--out", default="out", help="결과 저장 폴더 (기본: out)")
    ap.add_argument("--summarize", default="claude",
                    help="요약할 AI, 쉼표로 여러 개: claude,gpt,gemini / 요약 안 함: none")
    ap.add_argument("--prompt", help="요약 지시문 (기본: 한국어 요약·검증 포인트)")
    ap.add_argument("--whisper", choices=["auto", "local", "groq"], default="auto",
                    help="받아쓰기 엔진 (기본 auto: GROQ_API_KEY 있으면 groq)")
    ap.add_argument("--whisper-model", default="small",
                    help="로컬 받아쓰기 모델 크기: tiny/base/small/medium/large-v3 (기본 small)")
    ap.add_argument("--cookies-from-browser", metavar="BROWSER",
                    help="막혔을 때 브라우저 로그인 정보 사용 (chrome, edge, firefox, safari)")
    ap.add_argument("--force-whisper", action="store_true", help="자막이 있어도 받아쓰기 사용")
    args = ap.parse_args()

    langs = [l.strip() for l in args.lang.split(",") if l.strip()]
    vid = video_id_of(args.url)
    url = f"https://www.youtube.com/watch?v={vid}"
    workdir = Path(args.out) / vid
    workdir.mkdir(parents=True, exist_ok=True)

    tr: Transcript | None = None
    info: dict = {}
    try:
        if not args.force_whisper:
            log("[1/3] 자막 찾는 중")
            ytdlp_blocked: Blocked | None = None
            try:
                tr, info = try_ytdlp_captions(url, langs, workdir, args.cookies_from_browser)
            except Blocked as e:
                ytdlp_blocked = e  # 다른 경로는 통할 수 있으니 바로 포기하지 않음
            if tr is None:
                tr = try_transcript_api(vid, langs)
            if tr is None and ytdlp_blocked:
                raise ytdlp_blocked
        if tr is None:
            log("[2/3] 자막이 없어 음성을 받아 받아쓰기")
            audio = download_audio(url, workdir, args.cookies_from_browser)
            tr = transcribe(audio, langs[0] if langs else None, args.whisper, args.whisper_model)
    except Blocked as e:
        log(f"\n✗ 차단됨: {e}")
        return handle_blocked(url, vid, workdir, args.prompt or DEFAULT_PROMPT)

    if not tr.lines:
        log("✗ 자막을 얻지 못했습니다")
        return 1

    meta = {
        "url": url, "id": vid,
        "title": info.get("title"), "channel": info.get("channel"),
        "duration": info.get("duration"), "upload_date": info.get("upload_date"),
        "transcript_source": tr.source, "transcript_language": tr.language,
    }
    (workdir / "transcript.txt").write_text(tr.as_text(), encoding="utf-8")
    (workdir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"✓ 자막 확보: {tr.source} ({len(tr.lines)}줄) → {workdir / 'transcript.txt'}")

    targets = [t.strip() for t in args.summarize.split(",") if t.strip() and t.strip() != "none"]
    if targets:
        log(f"[3/3] 요약: {', '.join(targets)}")
    message = build_user_message(meta, tr, args.prompt or DEFAULT_PROMPT)
    failed = 0
    for name in targets:
        fn = SUMMARIZERS.get(name)
        if not fn:
            log(f"  ✗ 알 수 없는 AI: {name}")
            failed += 1
            continue
        try:
            text = fn(message)
        except Exception as e:
            log(f"  ✗ {name} 실패: {e}")
            failed += 1
            continue
        out = workdir / f"summary_{name}.md"
        out.write_text(text, encoding="utf-8")
        log(f"  ✓ {name} → {out}")
        if len(targets) == 1:
            print(text)
    return 1 if failed and failed == len(targets) else 0


if __name__ == "__main__":
    sys.exit(main())
