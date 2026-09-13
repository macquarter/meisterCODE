#!/usr/bin/env node
/**
 * 의존성 없는 정적 검사기.
 *
 * 이 저장소는 빌드 도구 없이 브라우저가 그대로 읽는 클래식 스크립트와
 * Apps Script(.gs)로만 이루어져 있어서, 문법 오류가 배포 후에야 드러난다.
 * 여기서는 커밋 전에 잡을 수 있는 두 가지만 확인한다.
 *   1) 모든 JS/GS 파일이 클래식 스크립트로 파싱되는지
 *   2) 병합 충돌 표시가 남아 있지 않은지
 */
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SKIP_DIRS = new Set([".git", "node_modules", ".claude"]);
const SCRIPT_EXTS = new Set([".js", ".gs", ".mjs"]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(ROOT);
const problems = [];

for (const file of files) {
  const rel = relative(ROOT, file);
  const ext = extname(file);
  let src;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    continue; // 바이너리 등 읽을 수 없는 파일은 건너뛴다
  }

  // 1) 문법 검사.
  //    .js/.gs 는 브라우저와 Apps Script가 읽는 방식 그대로 클래식 스크립트로 컴파일한다.
  //    .mjs 는 ES 모듈이라 vm.Script로 파싱할 수 없어 `node --check`에 맡긴다.
  if (SCRIPT_EXTS.has(ext)) {
    if (ext === ".mjs") {
      const res = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
      if (res.status !== 0) problems.push(`${rel}: ${(res.stderr || "").trim().split("\n")[0]}`);
    } else {
      try {
        new vm.Script(src, { filename: rel });
      } catch (err) {
        problems.push(`${rel}: ${err.message}`);
      }
    }
  }

  // 2) 병합 충돌 표시
  const conflict = src.split("\n").findIndex((l) => /^(<{7}|>{7}) /.test(l));
  if (conflict !== -1) problems.push(`${rel}:${conflict + 1}: 병합 충돌 표시가 남아 있습니다`);
}

const checked = files.filter((f) => SCRIPT_EXTS.has(extname(f))).length;
if (problems.length) {
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(`\nlint 실패: ${problems.length}건 (스크립트 ${checked}개 검사)`);
  process.exit(1);
}
console.log(`lint 통과: 스크립트 ${checked}개, 전체 ${files.length}개 파일 검사`);
