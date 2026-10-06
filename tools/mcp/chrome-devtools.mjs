#!/usr/bin/env node
// Chrome DevTools MCP 실행기 (.mcp.json에서 호출)
// - 내 컴퓨터: 설치된 Chrome을 그대로 사용 (창이 보이는 모드)
// - Claude Code 클라우드 세션: 일반 Chrome이 없으므로 내장 Chromium을 화면 없이 사용
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const CLOUD_CHROMIUM = "/opt/pw-browsers/chromium";

const args = [
  "-y", "chrome-devtools-mcp@latest",
  "--isolated",              // 매번 빈 프로필로 시작 (개인 브라우저 기록·로그인과 분리)
  "--no-usage-statistics",   // Google로 사용 통계 전송 안 함
  "--no-performance-crux",   // 성능 측정 시 페이지 주소를 Google CrUX로 보내지 않음
];

const chromePath = process.env.CHROME_PATH || (existsSync(CLOUD_CHROMIUM) ? CLOUD_CHROMIUM : "");
if (chromePath) args.push("--executablePath", chromePath);
if (chromePath === CLOUD_CHROMIUM || process.env.CHROME_HEADLESS === "1") args.push("--headless");
// 클라우드 컨테이너는 root로 돌아 Chrome 샌드박스가 켜지지 않는다 (일회용 컨테이너에서만 해제)
if (chromePath === CLOUD_CHROMIUM && process.getuid?.() === 0) args.push("--chromeArg=--no-sandbox");

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(npx, args, { stdio: "inherit", shell: process.platform === "win32" });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
