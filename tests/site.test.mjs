/**
 * docs/ 정적 사이트 스모크 테스트 (외부 의존성 없음, node:test 사용).
 *
 * 이 사이트는 번들러 없이 <script src> 여러 개를 순서대로 읽어 전역 변수를
 * 공유하는 구조라, 가장 흔한 사고는 다음 세 가지다.
 *   - HTML이 존재하지 않는 css/js/이미지 경로를 가리킴
 *   - 어떤 페이지가 전역을 쓰는 스크립트만 싣고 정의하는 스크립트는 빠뜨림
 *   - 상품 데이터의 필드가 빠져 렌더링 중 예외 발생
 * 브라우저를 띄우지 않고 이 세 가지를 잡는 것이 목표다.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "docs");
const JS_DIR = join(SITE, "js");

const pages = readdirSync(SITE).filter((f) => f.endsWith(".html")).sort();
const scriptFiles = readdirSync(JS_DIR).filter((f) => f.endsWith(".js")).sort();

/** HTML에서 로컬 파일을 가리키는 src/href 값만 추린다. */
function localRefs(html) {
  const refs = [];
  for (const m of html.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)) {
    const url = m[1].trim();
    if (/^(https?:)?\/\//.test(url)) continue;
    if (/^(data:|mailto:|tel:|#|javascript:)/.test(url)) continue;
    refs.push(url.split("?")[0].split("#")[0]);
  }
  return refs;
}

/** 페이지가 순서대로 싣는 로컬 스크립트 파일명 목록. */
function loadedScripts(html) {
  return [...html.matchAll(/<script[^>]+src\s*=\s*"([^"]+)"/g)]
    .map((m) => m[1])
    .filter((src) => src.startsWith("js/"))
    .map((src) => src.slice("js/".length));
}

/** 파일이 최상위(들여쓰기 없음)에서 정의하는 전역 이름들. IIFE 내부는 잡히지 않는다. */
function definedGlobals(src) {
  const names = new Set();
  for (const re of [
    /^(?:var|let|const)\s+([A-Za-z_$][\w$]*)/gm,
    /^function\s+([A-Za-z_$][\w$]*)/gm,
    /^window\.([A-Za-z_$][\w$]*)\s*=/gm,
  ]) {
    for (const m of src.matchAll(re)) names.add(m[1]);
  }
  return names;
}

const sources = Object.fromEntries(
  scriptFiles.map((f) => [f, readFileSync(join(JS_DIR, f), "utf8")]),
);
/** 전역 이름 -> 그것을 정의하는 파일 */
const owner = new Map();
for (const [file, src] of Object.entries(sources)) {
  for (const name of definedGlobals(src)) owner.set(name, file);
}

test("검사할 페이지와 스크립트가 실제로 존재한다", () => {
  assert.ok(pages.length > 0, "docs/ 에 HTML 페이지가 없습니다");
  assert.ok(scriptFiles.length > 0, "docs/js/ 에 스크립트가 없습니다");
  assert.ok(owner.size > 0, "전역 정의를 하나도 찾지 못했습니다 (검출 로직 확인 필요)");
});

test("HTML이 참조하는 로컬 파일이 모두 존재한다", () => {
  for (const page of pages) {
    const html = readFileSync(join(SITE, page), "utf8");
    for (const ref of localRefs(html)) {
      const target = resolve(SITE, ref);
      assert.ok(existsSync(target), `${page} -> ${ref} (없는 파일)`);
    }
  }
});

test("각 페이지는 자신이 쓰는 전역을 정의하는 스크립트를 먼저 싣는다", () => {
  for (const page of pages) {
    const html = readFileSync(join(SITE, page), "utf8");
    const loaded = loadedScripts(html);
    loaded.forEach((file, index) => {
      const src = sources[file];
      assert.ok(src !== undefined, `${page}가 없는 스크립트 js/${file}을 참조합니다`);
      for (const [name, definedIn] of owner) {
        if (definedIn === file) continue;
        if (!new RegExp(`\\b${name}\\b`).test(src)) continue;
        const at = loaded.indexOf(definedIn);
        assert.notEqual(at, -1, `${page}: js/${file}이 ${name}을 쓰는데 js/${definedIn}을 싣지 않습니다`);
        assert.ok(at < index, `${page}: js/${definedIn}이 js/${file}보다 뒤에 실려 ${name}이 아직 없습니다`);
      }
    });
  }
});

/** 클래식 스크립트를 가짜 window 샌드박스에서 실행해 전역을 꺼낸다. */
function runInSandbox(files) {
  const sandbox = {};
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const file of files) {
    new vm.Script(sources[file], { filename: file }).runInContext(sandbox);
  }
  return sandbox;
}

test("data.js의 상품 데이터가 렌더링에 필요한 필드를 갖춘다", () => {
  const { MEISTER_PRODUCTS, meisterWon } = runInSandbox(["data.js"]);

  assert.ok(Array.isArray(MEISTER_PRODUCTS), "MEISTER_PRODUCTS는 배열이어야 합니다");
  assert.ok(MEISTER_PRODUCTS.length > 0, "상품이 하나도 없습니다");

  const ids = new Set();
  for (const p of MEISTER_PRODUCTS) {
    const where = `상품 ${p && p.id}`;
    assert.equal(typeof p.id, "string", `${where}: id가 문자열이어야 합니다`);
    assert.ok(!ids.has(p.id), `${where}: id가 중복됩니다`);
    ids.add(p.id);

    assert.equal(typeof p.name, "string", `${where}: name 누락`);
    assert.equal(typeof p.cat, "string", `${where}: cat 누락`);
    assert.equal(typeof p.tagline, "string", `${where}: tagline 누락`);
    assert.equal(typeof p.price, "number", `${where}: price는 숫자여야 합니다`);
    assert.ok(p.price > 0, `${where}: price가 0 이하입니다`);
    assert.ok(Array.isArray(p.images) && p.images.length > 0, `${where}: images가 비어 있습니다`);
    assert.equal(typeof p.rating, "number", `${where}: rating은 숫자여야 합니다`);
    assert.equal(typeof p.reviewsCount, "number", `${where}: reviewsCount는 숫자여야 합니다`);
  }

  // salon.js / product.js가 가격 표시에 그대로 쓰는 함수.
  assert.equal(typeof meisterWon, "function", "meisterWon이 정의되지 않았습니다");
  assert.match(meisterWon(1234567), /\d/, "meisterWon이 숫자를 포함한 문자열을 돌려주지 않습니다");
});

test("config.js가 API_URL 계약을 지킨다", () => {
  const { MEISTER_CONFIG } = runInSandbox(["config.js"]);
  assert.ok(MEISTER_CONFIG, "window.MEISTER_CONFIG가 정의되지 않았습니다");
  assert.equal(
    typeof MEISTER_CONFIG.API_URL,
    "string",
    "API_URL은 문자열이어야 합니다 (비우면 데모 모드)",
  );
});
