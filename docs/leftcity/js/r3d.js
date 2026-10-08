/* ═══════════════════════════════════════════
   LEFT CITY — 남겨진 도시 : 3D 그리개 (3d.html)
   원작 AFTERMATH 처럼 진짜 3D 로 그린다 — 기울어진 원근 카메라, 그림자를 드리우는 손전등,
   벽돌 건물 · 탈것 · 사람이 모두 입체 모형. 게임 규칙 · 지도 · 감염체 · HUD 는 2D 판과 같은 코드를 쓰고,
   game.js 의 render() 가 window.R3D 가 있으면 그리기만 여기로 넘긴다.

   좌표: 세계 (x, y) → 3D (x, 높이, y). 1 = 세계 1px. 카메라는 남쪽 위에서 북쪽을 내려다본다
   (2D 판과 같은 방향 — 남쪽 벽면이 보인다).
   지도는 가장자리가 이어 붙는다. 바닥 · 건물은 타일 좌표(이어 붙인 좌표)로 덩어리(16×16 칸)를 만들고,
   탈것 · 장식은 게임이 플레이어 곁의 사본으로 옮겨 두므로(reanchor) 매 프레임 그 자리에 놓는다.
   ═══════════════════════════════════════════ */
import * as THREE from '../vendor/three.module.min.js';
import { EffectComposer } from '../vendor/addons/EffectComposer.js';
import { RenderPass } from '../vendor/addons/RenderPass.js';
import { UnrealBloomPass } from '../vendor/addons/UnrealBloomPass.js';
import { ShaderPass } from '../vendor/addons/ShaderPass.js';
import { GLTFLoader } from '../vendor/addons/GLTFLoader.js';
import { clone as cloneSkinned } from '../vendor/addons/SkeletonUtils.js';
import { mergeGeometries } from '../vendor/addons/BufferGeometryUtils.js';

const R3D = { ok: false, failed: '' };
window.R3D = R3D;

/* ── 안 될 때는 2D 로 — WebGL2 가 없거나(오래된 기기 · 막힌 브라우저) 만들다 실패하면
   3D 를 접고 2D 판의 그리기로 돌아간다. 왜 그런지는 화면 위에 잠깐 알린다 ── */
function fail(why, e) {
  if (R3D.failed) return;
  R3D.ok = false;
  R3D.failed = why + (e ? ' — ' + String(e && e.message || e).slice(0, 160) : '');
  try { console.warn('[LEFT CITY 3D] 2D 로 전환:', R3D.failed); } catch (_) { /* 무시 */ }
  try { if (cv) cv.remove(); } catch (_) { /* 무시 */ }
  try { if (renderer) renderer.dispose(); } catch (_) { /* 무시 */ }
  document.documentElement.classList.add('r3d-off');
  const n = document.createElement('div');
  n.id = 'r3dNote';
  n.setAttribute('role', 'status');
  n.style.cssText = 'position:fixed;left:50%;top:calc(10px + env(safe-area-inset-top));transform:translateX(-50%);z-index:50;'
    + 'max-width:min(560px,calc(100vw - 32px));padding:9px 14px;background:rgba(7,9,12,.92);border:1px solid rgba(240,180,41,.5);'
    + 'border-radius:3px;font-size:12.5px;line-height:1.55;color:#e8e6e0;pointer-events:auto;cursor:pointer';
  const ko = why === 'webgl2' ? '이 기기 · 브라우저에서 WebGL2 를 쓸 수 없어 3D 대신 2D 로 실행합니다.'
    : why === 'lost' ? '그래픽 장치가 3D 화면을 놓쳐 2D 로 이어서 실행합니다.'
    : '3D 화면을 만들지 못해 2D 로 실행합니다.';
  n.innerHTML = '<b style="color:#f0b429">3D 판</b> ' + ko + '<br><small style="opacity:.6"></small>';
  n.querySelector('small').textContent = R3D.failed + ' · 누르면 닫힘';
  n.onclick = () => n.remove();
  document.body.appendChild(n);
  setTimeout(() => { try { n.remove(); } catch (_) { /* 무시 */ } }, 12000);
}
function hasGL2() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return false;
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return true;
  } catch (e) { return false; }
}

/* ── 설정 ── */
/** 간판 · 표지 글꼴 — 게임과 같은 Pretendard */
const LCF = window.LC_FONT || 'sans-serif';
const CH = 16;                         // 덩어리 한 변(칸)
const FLOOR_PX = 34;                   // 한 층 높이 (세계 px)
const HMUL = 1.12;                     // 2D 판의 건물 높이(BLD_H) → 3D 높이 배수 — 원작처럼 벽이 높게 선다
const BLD_H3 = 0.19;
const PITCH = 0.93;                    // 카메라 내려다보는 각 (라디안, 약 53°)
const DIST = 640;                      // 카메라 거리
const FOV = 38;
const HUMAN_H = 40;                    // 사람 키 (세계 px)

let renderer, scene, camera, cv, curWorld = null, composer = null, bloom = null, grade = null, beam = null, dust = null;
let hemi, moon, spot, spotTarget, muzzle, blast;
const chunks = new Map();
const tmpV = new THREE.Vector3(), XAXIS = new THREE.Vector3(1, 0, 0);

/* ═══════════ 재질 · 무늬 ═══════════ */
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

/** 높이 캔버스 → 법선 무늬(노멀맵). 밝을수록 높다 */
function normalFrom(hc, strength = 2) {
  const W = hc.width, H = hc.height, src = hc.getContext('2d').getImageData(0, 0, W, H).data;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), out = x.createImageData(W, H), o = out.data;
  const h = (i, j) => src[(((j + H) % H) * W + ((i + W) % W)) * 4] / 255;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const dx = (h(i + 1, j) - h(i - 1, j)) * strength, dy = (h(i, j + 1) - h(i, j - 1)) * strength;
    const l = 1 / Math.hypot(dx, dy, 1), k = (j * W + i) * 4;
    o[k] = (-dx * l * 0.5 + 0.5) * 255; o[k + 1] = (dy * l * 0.5 + 0.5) * 255; o[k + 2] = (l * 0.5 + 0.5) * 255; o[k + 3] = 255;
  }
  x.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = THREE.NoColorSpace;
  return t;
}
function dataTex(c) { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = THREE.NoColorSpace; return t; }
function cnv(W, H) { const c = document.createElement('canvas'); c.width = W; c.height = H; return [c, c.getContext('2d')]; }
/** 바닥 재질 한 벌 — 같은 난수로 색 · 거칠기 · 높이를 함께 그린다. 물웅덩이는 매끈하고(거칠기 낮음) 어둡고 평평하다 */
function groundSet(W, seed, paint) {
  const [ca, a] = cnv(W, W), [cr, r] = cnv(W, W), [ch, h] = cnv(W, W);
  r.fillStyle = '#000'; h.fillStyle = '#808080'; h.fillRect(0, 0, W, W);
  paint({ a, r, h, W, rnd: rng(seed) });
  const map = new THREE.CanvasTexture(ca); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 8;
  return { map, rough: dataTex(cr), normal: normalFrom(ch, 3) };
}
/** 물웅덩이 — 부드러운 가장자리의 얼룩 여러 겹 (fn 이 받는 k 는 0..1 짙기) */
function puddles(W, rnd, n, draw) {
  for (let i = 0; i < n; i++) {
    const cx = rnd() * W, cy = rnd() * W, rx = 16 + rnd() * W * 0.055, ry = rx * (0.35 + rnd() * 0.5), rot = rnd() * 3.14;
    for (let k = 0; k < 4; k++) {
      const ox = (rnd() - 0.5) * rx * 0.9, oy = (rnd() - 0.5) * ry * 0.9, s = 0.55 + rnd() * 0.5;
      for (const [dx, dy] of [[0, 0], [W, 0], [-W, 0], [0, W], [0, -W]]) draw(cx + ox + dx, cy + oy + dy, rx * s, ry * s, rot);
    }
  }
}
function blob(x, cx, cy, rx, ry, rot, inner, outer) {
  x.save(); x.translate(cx, cy); x.rotate(rot); x.scale(1, ry / rx);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, inner); g.addColorStop(0.6, inner); g.addColorStop(1, outer);
  x.fillStyle = g; x.beginPath(); x.arc(0, 0, rx, 0, 6.283); x.fill(); x.restore();
}

const TEX = {};
function makeTextures() {
  // 젖은 아스팔트 — 골재 요철 · 금 · 땜질 · 기름때, 군데군데 거울 같은 물웅덩이
  TEX.asphaltSet = groundSet(1024, 31, ({ a, r, h, W, rnd }) => {
    a.fillStyle = '#34363a'; a.fillRect(0, 0, W, W);
    r.fillStyle = 'rgb(150,150,150)'; r.fillRect(0, 0, W, W);
    for (let i = 0; i < 26; i++) { const x0 = rnd() * W, y0 = rnd() * W, w0 = 80 + rnd() * 260, h0 = 60 + rnd() * 200; a.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.1)'; a.fillRect(x0, y0, w0, h0); h.fillStyle = 'rgba(160,160,160,.25)'; h.fillRect(x0, y0, w0, h0); }
    for (let i = 0; i < 46000; i++) {
      const x0 = rnd() * W, y0 = rnd() * W, s = 1 + rnd() * 2, v = rnd();
      a.fillStyle = v < 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.07)'; a.fillRect(x0, y0, s, s);
      h.fillStyle = v < 0.5 ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.18)'; h.fillRect(x0, y0, s, s);
      if (v < 0.04) { r.fillStyle = 'rgba(255,255,255,.35)'; r.fillRect(x0, y0, s, s); }
    }
    a.lineCap = h.lineCap = 'round';
    for (let i = 0; i < 18; i++) {
      let cx = rnd() * W, cy = rnd() * W, an = rnd() * 6.28; const pts = [[cx, cy]];
      for (let j = 0; j < 9; j++) { an += (rnd() - 0.5) * 1.3; cx += Math.cos(an) * (10 + rnd() * 22); cy += Math.sin(an) * (10 + rnd() * 22); pts.push([cx, cy]); }
      for (const [ctx, col, lw] of [[a, 'rgba(0,0,0,.55)', 1.8], [h, 'rgba(0,0,0,.9)', 2.4]]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); pts.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); }
    }
    for (let i = 0; i < 10; i++) blob(a, rnd() * W, rnd() * W, 14 + rnd() * 30, 8 + rnd() * 16, rnd() * 3, 'rgba(8,8,10,.35)', 'rgba(8,8,10,0)');
    puddles(W, rnd, 14, (cx, cy, rx, ry, rot) => {
      blob(a, cx, cy, rx, ry, rot, 'rgba(6,8,12,.3)', 'rgba(6,8,12,0)');
      blob(r, cx, cy, rx, ry, rot, 'rgba(0,0,0,1)', 'rgba(0,0,0,0)');
      blob(h, cx, cy, rx, ry, rot, 'rgba(110,110,110,1)', 'rgba(110,110,110,0)');
    });
  });
  // 판석 보도 — 이음매 홈, 깨진 판, 젖은 얼룩
  TEX.sidewalkSet = groundSet(512, 97, ({ a, r, h, W, rnd }) => {
    a.fillStyle = '#5c5b54'; a.fillRect(0, 0, W, W);
    r.fillStyle = 'rgb(175,175,175)'; r.fillRect(0, 0, W, W);
    const S = 64;
    for (let i = 0; i < W / S; i++) for (let j = 0; j < W / S; j++) {
      const v = rnd(); a.fillStyle = v < 0.35 ? 'rgba(0,0,0,.1)' : v < 0.6 ? 'rgba(255,250,220,.05)' : 'rgba(0,0,0,0)'; a.fillRect(i * S, j * S, S, S);
      h.fillStyle = `rgba(${v < 0.5 ? 255 : 0},${v < 0.5 ? 255 : 0},${v < 0.5 ? 255 : 0},.12)`; h.fillRect(i * S + 2, j * S + 2, S - 4, S - 4);
      if (rnd() < 0.12) { a.strokeStyle = 'rgba(0,0,0,.45)'; h.strokeStyle = '#202020'; a.lineWidth = 1.2; h.lineWidth = 1.6; for (const c of [a, h]) { c.beginPath(); c.moveTo(i * S + rnd() * S, j * S); c.lineTo(i * S + rnd() * S, j * S + S * 0.5); c.lineTo(i * S + rnd() * S, j * S + S); c.stroke(); } }
    }
    for (let i = 0; i < 9000; i++) { const x0 = rnd() * W, y0 = rnd() * W, v = rnd(); a.fillStyle = v < 0.5 ? 'rgba(255,255,240,.06)' : 'rgba(0,0,0,.1)'; a.fillRect(x0, y0, 1.5, 1.5); h.fillStyle = v < 0.5 ? 'rgba(255,255,255,.3)' : 'rgba(0,0,0,.3)'; h.fillRect(x0, y0, 1.5, 1.5); }
    a.fillStyle = 'rgba(0,0,0,.4)'; h.fillStyle = '#303030';
    for (let k = 0; k < W; k += S) { a.fillRect(0, k, W, 2.5); a.fillRect(k, 0, 2.5, W); h.fillRect(0, k - 1, W, 4); h.fillRect(k - 1, 0, 4, W); }
    puddles(W, rnd, 4, (cx, cy, rx, ry, rot) => { blob(a, cx, cy, rx * 0.7, ry * 0.7, rot, 'rgba(10,12,16,.4)', 'rgba(10,12,16,0)'); blob(r, cx, cy, rx * 0.7, ry * 0.7, rot, 'rgba(20,20,20,1)', 'rgba(20,20,20,0)'); });
  });
  TEX.asphalt = TEX.asphaltSet.map; TEX.sidewalk = TEX.sidewalkSet.map;
  // 옥상 — 방수 시트의 이음매 · 얼룩 · 고인 물, 자갈
  TEX.roofSet = groundSet(512, 7, ({ a, r, h, W, rnd }) => {
    a.fillStyle = '#7e8084'; a.fillRect(0, 0, W, W);
    r.fillStyle = 'rgb(225,225,225)'; r.fillRect(0, 0, W, W);
    for (let i = 0; i < 140; i++) blob(a, rnd() * W, rnd() * W, 8 + rnd() * 40, 5 + rnd() * 24, rnd() * 3, rnd() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.12)', 'rgba(0,0,0,0)');
    for (let i = 0; i < 12000; i++) { const x0 = rnd() * W, y0 = rnd() * W, v = rnd(); a.fillStyle = v < 0.5 ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.05)'; a.fillRect(x0, y0, 1.6, 1.6); h.fillStyle = v < 0.5 ? 'rgba(255,255,255,.15)' : 'rgba(0,0,0,.15)'; h.fillRect(x0, y0, 1.6, 1.6); }
    for (let k = 0; k < W; k += 128) { a.fillStyle = 'rgba(0,0,0,.25)'; a.fillRect(0, k, W, 3); h.fillStyle = '#b0b0b0'; h.fillRect(0, k - 1, W, 5); a.fillStyle = 'rgba(0,0,0,.14)'; a.fillRect(k + 40, 0, 2, W); }
    puddles(W, rnd, 3, (cx, cy, rx, ry, rot) => { blob(a, cx, cy, rx * 0.6, ry * 0.6, rot, 'rgba(20,24,30,.5)', 'rgba(20,24,30,0)'); blob(r, cx, cy, rx * 0.6, ry * 0.6, rot, 'rgba(10,10,10,1)', 'rgba(10,10,10,0)'); });
  });
  TEX.roof = TEX.roofSet.map;

  TEX.plaza = canvasTex(256, 256, (x, W, H) => {
    const r = rng(53);
    x.fillStyle = '#56575a'; x.fillRect(0, 0, W, H);
    for (let row = 0; row < 8; row++) for (let c = -1; c < 5; c++) {
      const bx = c * 64 + (row & 1) * 32, v = r();
      x.fillStyle = v < 0.3 ? 'rgba(0,0,0,.1)' : v < 0.55 ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,0)'; x.fillRect(bx, row * 32, 64, 32);
      x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(bx, row * 32, 2, 32);
    }
    x.fillStyle = 'rgba(0,0,0,.35)'; for (let k = 0; k < H; k += 32) x.fillRect(0, k, W, 2);
  });
  TEX.grass = canvasTex(256, 256, (x, W, H) => {
    const r = rng(5);
    x.fillStyle = '#2c3a28'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 4000; i++) { x.fillStyle = r() < 0.5 ? 'rgba(140,170,110,.12)' : 'rgba(0,0,0,.15)'; x.fillRect(r() * W, r() * H, 1.5, 3); }
  });
  // 외벽 — 칸 하나(48px) = 무늬 128px 가로, 한 층(34px) = 96px 세로. 4칸 × 4층 묶음이라 창 불빛이 덜 반복된다.
  // 밝은 회색으로 그리고 정점 색(테마의 벽 색)으로 물들인다
  const facade = (brick, lit) => canvasTex(512, 384, (x, W, H) => {
    const r = rng(brick ? 11 : 23);
    x.fillStyle = lit ? '#000' : '#d8d4cc'; x.fillRect(0, 0, W, H);
    if (!lit) {
      if (brick) {
        for (let row = 0; row < H / 8; row++) {
          const off = (row & 1) * 11;
          for (let b = -1; b < W / 22 + 1; b++) {
            const v = r(); x.fillStyle = v < 0.3 ? 'rgba(0,0,0,.14)' : v < 0.55 ? 'rgba(255,230,210,.08)' : v < 0.6 ? 'rgba(0,0,0,.28)' : 'rgba(0,0,0,0)';
            x.fillRect(b * 22 + off, row * 8, 22, 8);
            x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect(b * 22 + off, row * 8, 2, 8);
          }
          x.fillStyle = 'rgba(0,0,0,.32)'; x.fillRect(0, row * 8 + 7, W, 1.5);
        }
      } else {
        for (let i = 0; i < 1600; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.07)'; x.fillRect(r() * W, r() * H, 2 + r() * 3, 2 + r() * 3); }
        for (let i = 0; i < 26; i++) { const sx = r() * W, sy = r() * H * 0.6, len = 40 + r() * 140; const g = x.createLinearGradient(0, sy, 0, sy + len); g.addColorStop(0, 'rgba(0,0,0,.16)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(sx, sy, 3 + r() * 6, len); }
        x.fillStyle = 'rgba(0,0,0,.12)'; for (let k = 0; k < H; k += 96) x.fillRect(0, k + 94, W, 2);
      }
    }
    const r2 = rng(77);
    for (let fl = 0; fl < 4; fl++) for (let t = 0; t < 4; t++) for (let k = 0; k < 2; k++) {
      const wx = t * 128 + 18 + k * 60, wy = fl * 96 + 22, ww = 32, wh = 50;
      const on = r2() < 0.07, broken = r2() < 0.12;
      if (lit) { if (on) { x.fillStyle = '#ffc070'; x.fillRect(wx, wy, ww, wh); x.fillStyle = 'rgba(80,40,10,.5)'; x.fillRect(wx + 15, wy, 2, wh); } continue; }
      x.fillStyle = 'rgba(235,232,220,.9)'; x.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);                // 창틀
      x.fillStyle = broken ? '#050607' : '#1a222c'; x.fillRect(wx, wy, ww, wh);                          // 유리
      if (!broken) { x.fillStyle = 'rgba(160,190,220,.25)'; x.fillRect(wx, wy, ww, wh * 0.3); }
      x.fillStyle = 'rgba(210,206,190,.9)'; x.fillRect(wx + 15, wy, 2, wh); x.fillRect(wx, wy + wh * 0.45, ww, 2);
      x.fillStyle = 'rgba(245,242,232,1)'; x.fillRect(wx - 6, wy + wh + 3, ww + 12, 5);                // 창턱
      x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(wx - 6, wy + wh + 8, ww + 12, 4);
    }
  });
  TEX.brick = facade(true, false); TEX.brickLit = facade(true, true);
  TEX.stucco = facade(false, false); TEX.stuccoLit = facade(false, true);
  // 1층 가게 앞 — 내린 셔터 · 유리문 · 차양. 4칸 묶음
  TEX.shop = canvasTex(512, 96, (x, W, H) => {
    const r = rng(41);
    x.fillStyle = '#d8d4cc'; x.fillRect(0, 0, W, H);
    for (let t = 0; t < 4; t++) {
      const bx = t * 128;
      if (r() < 0.45) {                                                  // 셔터
        x.fillStyle = '#9aa0a6'; x.fillRect(bx + 8, 18, 112, 78);
        x.fillStyle = 'rgba(0,0,0,.35)'; for (let k = 22; k < 96; k += 6) x.fillRect(bx + 8, k, 112, 1.5);
        if (r() < 0.5) { x.fillStyle = 'rgba(40,40,40,.6)'; x.font = '700 16px ' + LCF; x.fillText(['X', '/', '#', 'S'][(r() * 4) | 0], bx + 40 + r() * 40, 60); }
      } else {                                                           // 유리 가게
        x.fillStyle = '#141a20'; x.fillRect(bx + 10, 20, 108, 76);
        x.fillStyle = 'rgba(150,180,210,.2)'; x.fillRect(bx + 10, 20, 108, 10);
        x.fillStyle = '#c8c4bc'; x.fillRect(bx + 62, 20, 4, 76);
      }
      x.fillStyle = ['#7a2a24', '#2a4a6a', '#3a5a3a', '#6a5a2a'][(r() * 4) | 0]; x.fillRect(bx, 6, 128, 12);   // 차양
      x.fillStyle = 'rgba(0,0,0,.4)'; x.fillRect(bx, 18, 128, 3);
    }
  });
  // 불 켜진 가게 — 유리창 안쪽의 진열대 · 냉장고 · 계산대 실루엣. 이 무늬 자체가 빛난다
  TEX.shopLit = canvasTex(512, 96, (x, W, H) => {
    const r = rng(83);
    x.fillStyle = '#0a0b0c'; x.fillRect(0, 0, W, H);
    for (let t = 0; t < 4; t++) {
      const bx0 = t * 128, warm = r() < 0.5;
      const g = x.createLinearGradient(0, 20, 0, 96); g.addColorStop(0, warm ? '#ffd9a0' : '#e8f4ff'); g.addColorStop(1, warm ? '#c88a50' : '#9ab8d8');
      x.fillStyle = g; x.fillRect(bx0 + 6, 20, 116, 76);
      x.fillStyle = 'rgba(30,30,34,.75)';
      for (let k = 0; k < 4; k++) { const sx = bx0 + 12 + k * 28; x.fillRect(sx, 34, 20, 62); for (let q = 0; q < 4; q++) { x.fillStyle = ['rgba(200,60,50,.8)', 'rgba(60,120,200,.8)', 'rgba(230,200,60,.8)', 'rgba(60,160,90,.8)'][(k + q + t) % 4]; x.fillRect(sx + 2, 38 + q * 14, 16, 8); x.fillStyle = 'rgba(30,30,34,.75)'; } }
      x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(bx0 + 62, 20, 4, 76); x.fillRect(bx0 + 6, 56, 116, 2);
      x.fillStyle = 'rgba(255,255,255,.9)'; x.fillRect(bx0 + 6, 20, 116, 3);
    }
  });
  // 핏자국
  TEX.splat = canvasTex(128, 128, (x) => {
    const r = rng(101);
    const blob = (bx, by, rr, col) => { x.fillStyle = col; x.beginPath(); for (let i = 0; i <= 14; i++) { const a = i / 14 * 6.283, q = rr * (0.7 + r() * 0.5); i ? x.lineTo(bx + Math.cos(a) * q, by + Math.sin(a) * q) : x.moveTo(bx + Math.cos(a) * q, by + Math.sin(a) * q); } x.closePath(); x.fill(); };
    blob(56, 64, 26, '#3a0605'); for (let i = 0; i < 5; i++) blob(56 + (r() - 0.4) * 30, 64 + (r() - 0.5) * 30, 8 + r() * 12, '#420706');
    x.strokeStyle = '#3a0605'; x.lineCap = 'round';
    for (let i = 0; i < 7; i++) { const a = (r() - 0.5) * 1.3, len = 26 + r() * 36; x.lineWidth = 2 + r() * 4; x.beginPath(); x.moveTo(56 + Math.cos(a) * 18, 64 + Math.sin(a) * 18); x.lineTo(56 + Math.cos(a) * (18 + len), 64 + Math.sin(a) * (18 + len)); x.stroke(); }
    for (let i = 0; i < 30; i++) { const a = (r() - 0.5) * 2.4, d = 22 + r() * 40; x.fillStyle = '#3a0706'; x.beginPath(); x.arc(56 + Math.cos(a) * d, 64 + Math.sin(a) * d, 1 + r() * 2.5, 0, 6.283); x.fill(); }
  }, false);
  // 옷 — 천의 결. 감염체 옷에는 때 · 찢어진 구멍 · 핏자국과 흘러내린 자국
  const cloth = (seed, gore) => canvasTex(256, 256, (x, W, H) => {
    const r = rng(seed);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < W; i += 2) { x.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.04})`; x.fillRect(i, 0, 1, H); x.fillRect(0, i, W, 1); }
    for (let i = 0; i < 30; i++) blob(x, r() * W, r() * H, 10 + r() * 34, 6 + r() * 20, r() * 3, `rgba(40,32,22,${gore ? 0.35 : 0.12})`, 'rgba(40,32,22,0)');
    if (!gore) return;
    for (let i = 0; i < 9; i++) {
      const bx0 = r() * W, by0 = r() * H * 0.8, rr = 8 + r() * 22;
      blob(x, bx0, by0, rr, rr * (0.6 + r() * 0.4), r() * 3, 'rgba(70,6,5,.85)', 'rgba(70,6,5,0)');
      x.fillStyle = 'rgba(60,5,4,.7)'; for (let k = 0; k < 4; k++) { const dx = bx0 + (r() - 0.5) * rr, len = 10 + r() * 40; x.fillRect(dx, by0, 1.5 + r() * 2, len); }
    }
    x.fillStyle = 'rgba(8,8,8,.85)';
    for (let i = 0; i < 7; i++) { const cx = r() * W, cy = r() * H; x.beginPath(); for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28, q = 3 + r() * 9; k ? x.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q * 0.7) : x.moveTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q * 0.7); } x.fill(); }
  });
  TEX.cloth = cloth(3, false); TEX.rags = cloth(9, true);
  TEX.zskin = canvasTex(256, 256, (x, W, H) => {
    const r = rng(17);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 60; i++) blob(x, r() * W, r() * H, 6 + r() * 26, 4 + r() * 18, r() * 3, r() < 0.5 ? 'rgba(70,90,60,.3)' : 'rgba(60,30,50,.28)', 'rgba(0,0,0,0)');
    x.strokeStyle = 'rgba(50,20,40,.35)'; x.lineWidth = 1;
    for (let i = 0; i < 26; i++) { let cx = r() * W, cy = r() * H; x.beginPath(); x.moveTo(cx, cy); for (let k = 0; k < 6; k++) { cx += (r() - 0.5) * 22; cy += (r() - 0.5) * 22; x.lineTo(cx, cy); } x.stroke(); }
    for (let i = 0; i < 6; i++) blob(x, r() * W, r() * H, 6 + r() * 14, 4 + r() * 10, r() * 3, 'rgba(80,6,5,.8)', 'rgba(80,6,5,0)');
  });
  TEX.paper = canvasTex(64, 64, (x) => {
    x.clearRect(0, 0, 64, 64); const r = rng(5);
    x.fillStyle = '#6f6a5e'; x.beginPath(); x.moveTo(6 + r() * 6, 4); x.lineTo(58, 6 + r() * 6); x.lineTo(56 - r() * 6, 60); x.lineTo(4, 54 - r() * 8); x.closePath(); x.fill();
    x.fillStyle = 'rgba(60,60,60,.35)'; for (let i = 0; i < 9; i++) x.fillRect(12, 12 + i * 5, 30 + r() * 10, 1.5);
    x.fillStyle = 'rgba(80,70,50,.25)'; x.beginPath(); x.arc(40, 40, 12, 0, 6.28); x.fill();
  }, false);
  TEX.stripe = canvasTex(64, 64, (x) => { x.fillStyle = '#e8e4da'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#9a968e'; for (let k = 0; k < 64; k += 16) x.fillRect(k, 0, 8, 64); x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(0, 56, 64, 8); });
  TEX.star = canvasTex(64, 64, (x) => {
    x.clearRect(0, 0, 64, 64); x.translate(32, 32); x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) { x.rotate(Math.PI / 3 + (i % 2) * 0.2); const g = x.createLinearGradient(0, 0, 30, 0); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.beginPath(); x.moveTo(0, -3 + (i % 2)); x.lineTo(i % 2 ? 22 : 31, 0); x.lineTo(0, 3 - (i % 2)); x.fill(); }
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 14); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(-14, -14, 28, 28);
  }, false);
  TEX.dot = canvasTex(32, 32, (x) => { const g = x.createRadialGradient(16, 16, 0, 16, 16, 15); g.addColorStop(0, 'rgba(60,8,6,1)'); g.addColorStop(0.7, 'rgba(60,8,6,.8)'); g.addColorStop(1, 'rgba(60,8,6,0)'); x.fillStyle = g; x.fillRect(0, 0, 32, 32); }, false);
  TEX.glow = canvasTex(64, 64, (x) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 31); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); }, false);
  TEX.fence = canvasTex(64, 64, (x) => { x.clearRect(0, 0, 64, 64); x.strokeStyle = 'rgba(200,205,208,.9)'; x.lineWidth = 1.5; for (let k = -64; k < 128; k += 12) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + 64, 64); x.stroke(); x.beginPath(); x.moveTo(k + 64, 0); x.lineTo(k, 64); x.stroke(); } });
}

const MAT = {};
function makeMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const set = (S, o = {}) => Object.assign({ map: S.map, roughnessMap: S.rough, normalMap: S.normal, roughness: 1 }, o);
  MAT.asphalt = std(set(TEX.asphaltSet, { normalScale: new THREE.Vector2(0.18, 0.18), envMapIntensity: 1.8 }));   // 결은 약하게 — 손전등을 비스듬히 받으면 자갈 노이즈처럼 보였다   // 젖은 아스팔트 — 웅덩이는 거울처럼
  // 지역의 길 — 모래길(카이로) · 흙길(바라나시) · 돌길(베네치아) · 눈길(레이캬비크 · 남극). 세계 좌표 240 마다 되풀이
  {
    const street = (seed, base, draw, nk) => { const t = canvasTex(512, 512, (x, W, H) => { const r = rng(seed); x.fillStyle = base; x.fillRect(0, 0, W, H); draw(x, W, H, r); }); return [t, normalFrom(t.image, nk)]; };
    const [sand, sandN] = street(71, '#a8834f', (x, W, H, r) => {
      for (let i = 0; i < 2600; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,230,180,.08)' : 'rgba(80,50,20,.09)'; x.fillRect(r() * W, r() * H, 2 + r() * 3, 2 + r() * 3); }
      x.lineWidth = 2; for (let i = 0; i < 140; i++) { const sx = r() * W, sy = r() * H, l = 30 + r() * 60; x.strokeStyle = r() < 0.5 ? 'rgba(70,45,15,.22)' : 'rgba(255,230,190,.16)'; x.beginPath(); x.moveTo(sx, sy); x.bezierCurveTo(sx + l * 0.3, sy - 6, sx + l * 0.7, sy + 6, sx + l, sy); x.stroke(); }
      for (let k = 0; k < 2; k++) { const tx = 140 + k * 220; x.fillStyle = 'rgba(60,40,15,.16)'; x.fillRect(tx, 0, 16, H); x.fillRect(tx + 60, 0, 16, H); } }, 1.8);
    const [dirt, dirtN] = street(72, '#4e3c2a', (x, W, H, r) => {
      for (let i = 0; i < 60; i++) blob(x, r() * W, r() * H, 20 + r() * 60, 12 + r() * 30, r() * 3, r() < 0.5 ? 'rgba(30,20,12,.45)' : 'rgba(120,95,65,.3)', 'rgba(0,0,0,0)');
      for (let i = 0; i < 900; i++) { x.fillStyle = r() < 0.5 ? 'rgba(150,130,100,.35)' : 'rgba(20,14,8,.4)'; const s2 = 1 + r() * 4; x.fillRect(r() * W, r() * H, s2, s2); } }, 2.2);
    const [stone, stoneN] = street(73, '#57534d', (x, W, H, r) => {
      // 마세니 — 비스듬히 깐 커다란 회색 조면암 판석
      for (let row = 0; row < H / 48 + 1; row++) { const off = (row % 2) * 40; for (let c = -1; c < W / 80 + 1; c++) {
        const v = 70 + r() * 30; x.fillStyle = `rgb(${v},${v - 3},${v - 8})`; x.fillRect(c * 80 + off + 2, row * 48 + 2, 76, 44);
        for (let q = 0; q < 20; q++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.08)'; x.fillRect(c * 80 + off + 2 + r() * 72, row * 48 + 2 + r() * 40, 3, 3); } } }
      x.fillStyle = 'rgba(20,20,18,.9)'; }, 2.6);
    const [snow, snowN] = street(74, '#c9d2dc', (x, W, H, r) => {
      for (let i = 0; i < 50; i++) blob(x, r() * W, r() * H, 30 + r() * 70, 14 + r() * 30, r() * 3, r() < 0.6 ? 'rgba(150,170,195,.28)' : 'rgba(255,255,255,.35)', 'rgba(0,0,0,0)');
      for (let k = 0; k < 2; k++) { const tx = 120 + k * 230; x.fillStyle = 'rgba(110,125,145,.35)'; x.fillRect(tx, 0, 14, H); x.fillRect(tx + 58, 0, 14, H); for (let y = 0; y < H; y += 8) { x.fillStyle = 'rgba(80,95,115,.3)'; x.fillRect(tx, y, 14, 2); x.fillRect(tx + 58, y + 4, 14, 2); } }
      for (let i = 0; i < 40; i++) { const fx = r() * W, fy = r() * H; x.fillStyle = 'rgba(100,115,135,.35)'; x.beginPath(); x.ellipse(fx, fy, 3, 5, 0.3, 0, 6.283); x.fill(); x.beginPath(); x.ellipse(fx + 8, fy + 14, 3, 5, 0.3, 0, 6.283); x.fill(); } }, 1.4);
    MAT.st_sand = std({ map: sand, normalMap: sandN, roughness: 0.95, envMapIntensity: 0.15 });
    MAT.st_dirt = std({ map: dirt, normalMap: dirtN, roughness: 0.55, envMapIntensity: 1.3 });       // 몬순에 젖은 흙
    MAT.st_stone = std({ map: stone, normalMap: stoneN, roughness: 0.62, envMapIntensity: 0.7 });   // 젖은 돌길 — 판석마다 번쩍이지 않게 조금 거칠게
    MAT.st_snow = std({ map: snow, normalMap: snowN, roughness: 0.82, envMapIntensity: 0.3 });
    // 화성 흙 — 잔무늬 대신 큰 얼룩(먼지가 쌓인 곳 · 바람에 쓸린 곳)과 바람 결, 드문드문 돌. 결은 부드럽게(노멀 약하게)
    const [mars, marsN] = street(75, '#6e3020', (x, W, H, r) => {
      for (let i = 0; i < 14; i++) blob(x, r() * W, r() * H, 90 + r() * 140, 60 + r() * 100, r() * 3, r() < 0.5 ? 'rgba(150,70,40,.35)' : 'rgba(60,22,12,.3)', 'rgba(0,0,0,0)');
      x.lineWidth = 3; for (let i = 0; i < 26; i++) { const sx = r() * W, sy = r() * H, l = 80 + r() * 120; x.strokeStyle = r() < 0.5 ? 'rgba(170,85,50,.18)' : 'rgba(40,14,8,.16)'; x.beginPath(); x.moveTo(sx, sy); x.bezierCurveTo(sx + l * 0.3, sy - 10, sx + l * 0.7, sy + 10, sx + l, sy); x.stroke(); }
      for (let i = 0; i < 70; i++) { const px = r() * W, py = r() * H, rr = 2 + r() * 5; x.fillStyle = 'rgba(30,12,6,.55)'; x.beginPath(); x.ellipse(px + 1.5, py + 1.5, rr, rr * 0.8, 0, 0, 6.283); x.fill(); x.fillStyle = 'rgba(140,80,56,.9)'; x.beginPath(); x.ellipse(px, py, rr, rr * 0.8, 0, 0, 6.283); x.fill(); } }, 0.7);
    MAT.st_mars = std({ map: mars, normalMap: marsN, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.92, envMapIntensity: 0.12 });
  }
  // 보도 판석 — 젖은 판석 한 장 한 장이 손전등에 네모로 번쩍여 보급 상자처럼 보였다. 결을 거칠게(반사를 흐리게), 비침을 줄인다
  MAT.sidewalk = std(set(TEX.sidewalkSet, { normalScale: new THREE.Vector2(0.6, 0.6), roughness: 1.8, envMapIntensity: 0.35 }));
  MAT.curb = std({ color: 0x8a8a84, roughness: 0.8 });
  MAT.plaza = std({ map: TEX.plaza, normalMap: normalFrom(TEX.plaza.image, 1.2), roughness: 0.85, envMapIntensity: 0.45 });
  MAT.grass = std({ map: TEX.grass, roughness: 0.95 });
  // 강물 — 빗방울 결의 노멀맵을 흘려 보내 불빛 반사가 일렁인다
  TEX.waterN = (() => { const [c, x] = cnv(256, 256); const r = rng(61); x.fillStyle = '#808080'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 180; i++) blob(x, r() * 256, r() * 256, 6 + r() * 26, 3 + r() * 9, r() * 0.4, r() < 0.5 ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.22)', 'rgba(128,128,128,0)');
    return normalFrom(c, 2.5); })();
  MAT.water = std({ color: 0x0c1c24, emissive: 0x03090c, roughness: 0.1, metalness: 0.1, normalMap: TEX.waterN, normalScale: new THREE.Vector2(0.7, 0.7), envMapIntensity: 3 });
  MAT.bridge = std({ color: 0x4a4e54, roughness: 0.6 });
  // 지형 덮개 — 모래 · 얼음 · 얕은 물 · 용암 · 진흙. 칸마다 가장자리가 흐린 둥근 얼룩(데칼)을 돌려 겹쳐 놓아
  // 네모난 칸 모양이 아니라 자연스러운 웅덩이 · 모래톱이 된다(알파 지도)
  TEX.blobA = canvasTex(256, 256, (x, W, H) => { const r = rng(96); x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    const g = x.createRadialGradient(128, 128, 30, 128, 128, 126); g.addColorStop(0, '#fff'); g.addColorStop(0.55, '#eee'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'multiply'; for (let i = 0; i < 26; i++) { const a = r() * 6.283, d = 70 + r() * 50; blob(x, 128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 20 + r() * 26, 14 + r() * 20, a, 'rgba(0,0,0,.9)', 'rgba(0,0,0,0)'); } }, false);
  {
    const sandT = canvasTex(256, 256, (x, W, H) => { const r = rng(91); x.fillStyle = '#c49c62'; x.fillRect(0, 0, W, H);
      for (let i = 0; i < 70; i++) blob(x, r() * W, r() * H, 30 + r() * 50, 10 + r() * 18, -0.3, 'rgba(196,156,98,.85)', 'rgba(196,156,98,0)');
      x.strokeStyle = 'rgba(120,88,50,.35)'; x.lineWidth = 1.5; for (let i = 0; i < 40; i++) { const sx = r() * W, sy = r() * H; x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(sx + 14, sy - 6, sx + 30, sy - 2); x.stroke(); } });
    MAT.tSand = std({ map: sandT, alphaMap: TEX.blobA, transparent: true, roughness: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const iceT = canvasTex(256, 256, (x, W, H) => { const r = rng(92); x.fillStyle = 'rgba(170,205,230,.62)'; x.fillRect(0, 0, W, H);
      x.strokeStyle = 'rgba(240,250,255,.5)'; x.lineWidth = 1; for (let i = 0; i < 26; i++) { let px = r() * W, py = r() * H; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += (r() - 0.5) * 60; py += (r() - 0.5) * 60; x.lineTo(px, py); } x.stroke(); }
      for (let i = 0; i < 30; i++) blob(x, r() * W, r() * H, 10 + r() * 30, 6 + r() * 12, r(), 'rgba(255,255,255,.25)', 'rgba(255,255,255,0)'); });
    MAT.tIce = std({ map: iceT, alphaMap: TEX.blobA, transparent: true, roughness: 0.04, metalness: 0.1, envMapIntensity: 3.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    MAT.tFlood = std({ color: 0x0e2028, alphaMap: TEX.blobA, transparent: true, opacity: 0.88, roughness: 0.06, metalness: 0.1, normalMap: TEX.waterN, normalScale: new THREE.Vector2(0.5, 0.5), envMapIntensity: 3, depthWrite: false });
    const lavaA = canvasTex(256, 256, (x, W, H) => { const r = rng(93); x.fillStyle = '#1a120e'; x.fillRect(0, 0, W, H);
      for (let i = 0; i < 300; i++) { x.fillStyle = r() < 0.5 ? 'rgba(60,50,46,.5)' : 'rgba(0,0,0,.4)'; x.fillRect(r() * W, r() * H, 3 + r() * 8, 3 + r() * 8); } });
    const lavaE = canvasTex(256, 256, (x, W, H) => { const r = rng(94); x.fillStyle = '#000'; x.fillRect(0, 0, W, H); x.lineJoin = 'round';
      for (let i = 0; i < 18; i++) { let px = r() * W, py = r() * H; x.strokeStyle = '#ff6a14'; x.lineWidth = 3 + r() * 5; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (r() - 0.5) * 70; py += (r() - 0.5) * 70; x.lineTo(px, py); } x.stroke(); x.strokeStyle = '#ffd060'; x.lineWidth = 1.2; x.stroke(); } });
    MAT.tLava = std({ map: lavaA, alphaMap: TEX.blobA, transparent: true, depthWrite: false, emissive: 0xffffff, emissiveMap: lavaE, emissiveIntensity: 2.6, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 });
    const mudT = canvasTex(256, 256, (x, W, H) => { const r = rng(95); x.fillStyle = '#3a2818'; x.fillRect(0, 0, W, H);
      for (let i = 0; i < 50; i++) blob(x, r() * W, r() * H, 26 + r() * 40, 18 + r() * 26, r() * 3, 'rgba(58,40,24,.9)', 'rgba(58,40,24,0)');
      for (let i = 0; i < 30; i++) blob(x, r() * W, r() * H, 8 + r() * 14, 4 + r() * 6, r() * 3, 'rgba(120,100,80,.35)', 'rgba(120,100,80,0)'); });
    MAT.tMud = std({ map: mudT, alphaMap: TEX.blobA, transparent: true, roughness: 0.18, envMapIntensity: 1.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    // 화성 — 크레이터 바닥(어두운 붉은 흙) · 둘레(밝게 솟은 흙)
    const craterT = canvasTex(256, 256, (x, W, H) => { const r = rng(97); x.fillStyle = '#3a160c'; x.fillRect(0, 0, W, H);
      for (let i = 0; i < 400; i++) { x.fillStyle = r() < 0.5 ? 'rgba(120,50,30,.35)' : 'rgba(10,4,2,.35)'; x.fillRect(r() * W, r() * H, 2 + r() * 6, 2 + r() * 6); } });
    MAT.tCrater = std({ map: craterT, alphaMap: TEX.blobA, transparent: true, roughness: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    MAT.tRim = std({ color: 0x9a4a2a, alphaMap: TEX.blobA, transparent: true, roughness: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    MAT.rim = std({ color: 0x8a3e22, roughness: 0.95 });
    const bowlA = canvasTex(128, 128, (x, W, H) => { const g = x.createRadialGradient(64, 64, 4, 64, 64, 63); g.addColorStop(0, '#fff'); g.addColorStop(0.75, '#bbb'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, W, H); }, false);
    MAT.bowl = new THREE.MeshBasicMaterial({ color: 0x0a0302, alphaMap: bowlA, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  }
  MAT.paint = std({ color: 0xd8d6cc, roughness: 0.5 });
  MAT.yellow = std({ color: 0xc9a83a, roughness: 0.5 });
  // 벽면의 요철은 무늬의 밝기에서 — 줄눈이 들어가고 창이 안으로 꺼져 보인다
  MAT.brick = std({ map: TEX.brick, normalMap: normalFrom(TEX.brick.image, 2.2), vertexColors: true, roughness: 0.85, emissive: 0xffffff, emissiveMap: TEX.brickLit, emissiveIntensity: 0.95, envMapIntensity: 0.4 });
  MAT.stucco = std({ map: TEX.stucco, normalMap: normalFrom(TEX.stucco.image, 1.6), vertexColors: true, roughness: 0.85, emissive: 0xffffff, emissiveMap: TEX.stuccoLit, emissiveIntensity: 0.95, envMapIntensity: 0.4 });
  MAT.shop = std({ map: TEX.shop, vertexColors: true, roughness: 0.7 });
  MAT.shopLit = std({ map: TEX.shopLit, emissive: 0xffffff, emissiveMap: TEX.shopLit, emissiveIntensity: 0.62, roughness: 0.55, envMapIntensity: 0.4 });
  MAT.roof = std(set(TEX.roofSet, { vertexColors: true, envMapIntensity: 0.5, normalScale: new THREE.Vector2(0.5, 0.5) }));
  MAT.parapet = std({ color: 0x6a6c70, roughness: 0.85 });
  MAT.stone = std({ color: 0x77736a, roughness: 0.85 });
  MAT.rooftop = std({ color: 0x8a8e94, roughness: 0.7, map: TEX.roofSet.map, normalMap: TEX.roofSet.normal, normalScale: new THREE.Vector2(0.4, 0.4) });
  MAT.fence = std({ map: TEX.fence, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.6 });
  // 건물이 플레이어를 가리면 그 둘레를 체크무늬로 뚫어 비친다 (원작처럼 플레이어가 벽 뒤로 사라지지 않게)
  makeFacadeMats(std);
  AWN.forEach((c, i) => { ALIAS['awning' + i][1] = lin(c, 1.1); });
  MAT.detail = std({ vertexColors: true, roughness: 0.62, metalness: 0.25, map: TEX.roofSet.map });
  MAT.awning = std({ vertexColors: true, map: TEX.stripe, roughness: 0.75, side: THREE.DoubleSide });
  MAT.glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  MAT.cross = std({ color: 0x400000, emissive: 0xff2018, emissiveIntensity: 3.2 });
  MAT.rust = std({ color: 0x6a4a36, roughness: 0.8, metalness: 0.4, map: TEX.roofSet.map });
  MAT.metal = std({ color: 0x2a2d31, roughness: 0.45, metalness: 0.65 });
  MAT.fan = std({ color: 0x0c0d0f, roughness: 0.6 });
  MAT.ledge = std({ vertexColors: true, roughness: 0.8, map: TEX.roofSet.map });
  AWN.forEach((c, i) => { MAT['awning' + i] = std({ color: col(c, 1.1), map: TEX.stripe, roughness: 0.75, side: THREE.DoubleSide }); });
  MAT.door = std({ color: 0x3a3226, roughness: 0.7 });
  MAT.skyOff = std({ color: 0x1c242c, roughness: 0.1, metalness: 0.4 });
  MAT.skyOn = std({ color: 0x40382a, emissive: 0xffc88a, emissiveIntensity: 1.6, roughness: 0.2 });
  MAT.solar = std({ color: 0x1a2a44, roughness: 0.15, metalness: 0.5, envMapIntensity: 1.5 });
  MAT.lensOn = std({ color: 0xfff0d8, emissive: 0xffb868, emissiveIntensity: 4 });
  MAT.lensFlick = std({ color: 0xfff0d8, emissive: 0xffb868, emissiveIntensity: 7 });
  MAT.lensOff = std({ color: 0x3a3a38, roughness: 0.3 });
  const SEE_K = ['detail', 'awning', 'shopLit', 'cross', 'rust', ...FACADE_STYLES.map(st => 'f_' + st), 'brick', 'stucco', 'shop', 'roof', 'parapet', 'stone', 'rooftop', 'ledge', 'metal', 'fan', 'door', 'skyOff', 'skyOn', 'solar', ...AWN.map((_, i) => 'awning' + i)];
  for (const k in MAT) if (MAT[k].isMeshStandardMaterial) enhance(MAT[k], SEE_K.includes(k));
}
/* 값싼 빛 — 가로등 · 네온 간판 · 불 · 출구처럼 수십 개의 작은 빛은 진짜 점광원 대신
   모든 재질의 셰이더에 '빛 목록'으로 넣어 계산한다(시점 좌표, 반지름 안에서만). 젖은 면(거칠기 낮음)에는
   또렷한 반사 점이 생겨 웅덩이에 불빛이 비친다 */
const CL_MAX = 24;
const CL = { v: { value: Array.from({ length: CL_MAX }, () => new THREE.Vector4()) }, c: { value: Array.from({ length: CL_MAX }, () => new THREE.Vector3()) }, n: { value: 0 } };
function enhance(m, see, rim) {
  m.onBeforeCompile = sh => {
    sh.uniforms.uCLV = CL.v; sh.uniforms.uCLC = CL.c; sh.uniforms.uCLN = CL.n;
    let f = sh.fragmentShader.replace('void main() {', `uniform vec4 uCLV[${CL_MAX}]; uniform vec3 uCLC[${CL_MAX}]; uniform int uCLN;
void main() {`).replace('#include <opaque_fragment>', `{
      vec3 clAcc = vec3(0.0); vec3 clV = normalize(vViewPosition);
      float clR = roughnessFactor;
      float clSh = mix(8.0, 700.0, pow(1.0 - clR, 2.0)), clSk = pow(1.0 - clR, 3.0) * (clSh + 8.0) / 60.0;
      for (int i = 0; i < ${CL_MAX}; i++) { if (i >= uCLN) break;
        vec3 Lv = uCLV[i].xyz + vViewPosition; float d = length(Lv);
        float fo = clamp(1.0 - d / uCLV[i].w, 0.0, 1.0); if (fo <= 0.0) continue;
        fo *= fo; vec3 Ld = Lv / d;
        float ndl = max(dot(normal, Ld), 0.0);
        float sp = pow(max(dot(normal, normalize(Ld + clV)), 0.0), clSh) * clSk * step(0.0, dot(normal, Ld));
        clAcc += uCLC[i] * fo * (diffuseColor.rgb * ndl + sp);
      }
      outgoingLight += clAcc; }
    ${rim ? `outgoingLight += vec3(${rim}) * pow(1.0 - max(dot(normal, normalize(vViewPosition)), 0.0), 3.0);` : ''}
    #include <opaque_fragment>`);
    if (see) {
      sh.uniforms.uSeePos = SEE.pos; sh.uniforms.uSeeDepth = SEE.depth; sh.uniforms.uSeeRad = SEE.rad;
      f = 'uniform vec2 uSeePos; uniform float uSeeDepth; uniform float uSeeRad;\n' + f.replace('#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        { float d = length(gl_FragCoord.xy - uSeePos) / uSeeRad;
          if (d < 1.0 && gl_FragCoord.z < uSeeDepth) {
            float k = smoothstep(0.5, 1.0, d);
            vec2 a = floor(gl_FragCoord.xy);
            vec2 a2 = floor(a * 0.5);
            float b = fract(dot(a2, vec2(0.5, a2.y * 0.75))) * 0.25 + fract(dot(a, vec2(0.5, a.y * 0.75)));
            if (k <= b * 0.94 + 0.03) discard;
          } }`);
    }
    sh.fragmentShader = f;
  };
  m.customProgramCacheKey = () => (see ? 'cl-see' : 'cl') + (rim || '');
  return m;
}
const SEE = { pos: { value: new THREE.Vector2(-9999, -9999) }, depth: { value: 0 }, rad: { value: 120 } };
function seeThrough(m) { enhance(m, true); }

/* ═══════════ 세계 덩어리 — 바닥 · 건물 ═══════════ */
function bh(w, x, y) {
  const i = w.idx(x, y);
  const l = w.lot[i] || (((i % w.w) >> 2) * 31 + ((i / w.w | 0) >> 2) * 17 + 1);
  const base = BLD_H3 * (0.8 + ((Math.imul(l, 2654435761) >>> 0) % 6) * 0.1) * 480 * HMUL;
  const m = TALL[lotStyle(w, x, y).style] || 1;
  return m === 1 ? base : Math.round(base * m / FLOOR_PX) * FLOOR_PX + 4;
}
function wallMat3(w, x, y) {
  const i = w.idx(x, y);
  const lh = Math.imul(w.lot[i] || (x * 7 + y * 13), 2246822519) >>> 0;
  const m = w.theme.walls || [['#3a3d40', 0]];
  return m[(lh >>> 3) % m.length];
}
const colCache = new Map();
function col(hex, k = 1) {
  const key = hex + k;
  if (!colCache.has(key)) { const c = new THREE.Color(hex); c.multiplyScalar(k); colCache.set(key, c); }   // Color 는 sRGB 를 이미 선형으로 바꿔 둔다
  return colCache.get(key);
}

/** 사각형 모으개 — 재질마다 위치 · 법선 · UV · 색 배열 */
class Bucket {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; }
  quad(a, b, c, d, nrm, uv, color) {      // a,b,c,d 반시계(바깥에서 볼 때)
    const base = this.p.length / 3;
    for (const v of [a, b, c, d]) this.p.push(v[0], v[1], v[2]);
    for (let k = 0; k < 4; k++) this.n.push(nrm[0], nrm[1], nrm[2]);
    for (const t of uv) this.u.push(t[0], t[1]);
    const cc = color || WHITE;
    for (let k = 0; k < 4; k++) this.c.push(cc.r, cc.g, cc.b);
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  mesh(mat) {
    if (!this.i.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    return m;
  }
}
const WHITE = new THREE.Color(1, 1, 1);
/** 3D 지붕 — 방수 시트 · 콘크리트 · 녹슨 함석 */
const ROOFS3 = ['#7a7e84', '#6a6e72', '#83827a', '#5e6266', '#76706a', '#6e7478'];
/** 도시마다 옥상 빛깔 — 서울은 초록 방수 도료, 도쿄는 회색 콘크리트와 함석, 방콕 · 싱가포르는 붉은 기와빛과 흰 도장 */
const ROOFS_BY = {
  seoul: ['#5f7f62', '#6a8a6c', '#7a7e84', '#567458', '#6e7478', '#7d8a72'],
  tokyo: ['#7a7e84', '#6a6e72', '#83827a', '#8a8c88', '#5e6266', '#6f7a84'],
  bangkok: ['#8a6a58', '#9a8a76', '#7a7e84', '#a0786a', '#8c8476', '#6e7478'],
  singapore: ['#a8a69e', '#8a8c88', '#9a7a68', '#7a7e84', '#b0aca2', '#6f7a84'],
  base: ['#5e6656', '#6a6e62', '#7a7e74', '#585e52', '#6e7468', '#646a5e'],
  varanasi: ['#9a8a76', '#a89070', '#8a7e70', '#b09a80', '#7a7e84', '#a07a68'],
  cairo: ['#b8a07c', '#a8946e', '#c0aa86', '#9c8a6c', '#b0a288', '#a89878'],
  venice: ['#a8583a', '#b86848', '#9a4a30', '#a86a4a', '#8a4a34', '#b07050'],
  istanbul: ['#8a4a36', '#7a4230', '#9a5a40', '#6a3a2c', '#8a5040', '#a06048'],
  rio: ['#9a5a3a', '#b06a48', '#8a4a30', '#c07850', '#a0603e', '#7a7e84'],
  moscow: ['#8a3a2e', '#c8b89a', '#9a4a3a', '#d8d0c0', '#7a7e84', '#b0a090'],
  nairobi: ['#c87a50', '#e0c080', '#7a8a6a', '#b85a3a', '#d8d0c0', '#8a8e92'],
  mars: ['#c8ccd0', '#b8bcc0', '#d0d4d8', '#e8641a', '#aeb2b6', '#c8ccd0'],
  reykjavik: ['#d8dee4', '#a83a2a', '#d0d8de', '#3a5a7a', '#e0e4e8', '#5a6a5a'],
  antarctic: ['#e0e6ec', '#d8dee4', '#e8ecf0', '#d0d8e0', '#e4e8ec', '#dce2e8'],
};
/** 필지의 테두리 상자(세계마다 한 번 계산) — rect: 필지가 빈틈없는 네모인가 */
function lotBox(w, lot) {
  if (!lot) return null;
  if (!w._lotBox) {
    const M = new Map();
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
      const i = y * w.w + x, l = w.lot[i]; if (!l || w.deco[i] !== D_BUILDING) continue;
      let b = M.get(l); if (!b) M.set(l, b = { x0: x, y0: y, x1: x, y1: y, n: 0 });
      b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y); b.n++;
    }
    for (const b of M.values()) b.rect = b.n === (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1) && b.x1 - b.x0 < w.w / 2 && b.y1 - b.y0 < w.h / 2;
    w._lotBox = M;
  }
  return w._lotBox.get(lot) || null;
}
/** 우진각 지붕 — 긴 쪽으로 용마루, 네 경사면 */
function hipQuads(B, x0, z0, x1, z1, y, hgt, color) {
  const wd = x1 - x0, dp = z1 - z0, alongX = wd >= dp, ins = Math.min(wd, dp) / 2, Y = y + hgt;
  const r0 = alongX ? [x0 + ins, Y, (z0 + z1) / 2] : [(x0 + x1) / 2, Y, z0 + ins];
  const r1 = alongX ? [x1 - ins, Y, (z0 + z1) / 2] : [(x0 + x1) / 2, Y, z1 - ins];
  const a = [x0, y, z0], b = [x1, y, z0], c = [x1, y, z1], d = [x0, y, z1];
  const N = (p, q, r) => { const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2]; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, L = Math.hypot(nx, ny, nz) || 1; return [nx / L, ny / L, nz / L]; };
  const face = (p, q, r, s2) => { const n = N(p, s2, q); B.quad(p, s2, r, q, n[1] < 0 ? n.map(v => -v) : n, [[0, 0], [0, 1], [1, 1], [1, 0]], color); };
  if (alongX) { face(d, c, r1, r0); face(b, a, r0, r1); face(a, d, r0, r0); face(c, b, r1, r1); }
  else { face(a, d, r1, r0); face(c, b, r0, r1); face(b, a, r0, r0); face(d, c, r1, r1); }
}
/** 바닥 사각형 (y 높이) — UV 는 세계 좌표를 무늬 크기로 나눈 것이라 이웃 칸과 이어진다 */
/** 개미지옥 둘레의 흙둔덕 — 깔때기 가장자리에서 솟았다가 바깥으로 완만히 내려앉는 낮은 고리. 바닥과 같은 흙 무늬(세계 좌표 UV) */
function rimMesh(cx, cz, R, H) {
  const pts = [[R - 8, -3], [R, H * 0.55], [R + 14, H], [R + 34, H * 0.62], [R + 58, H * 0.15], [R + 74, -1.5]].map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, 56), P = geo.attributes.position, n = P.count;
  const uv = new Float32Array(n * 2), cl = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    uv[i * 2] = (P.getX(i) + cx) / 640; uv[i * 2 + 1] = -(P.getZ(i) + cz) / 640;
    const k = 0.95 + Math.max(0, P.getY(i)) / H * 0.18; cl[i * 3] = k; cl[i * 3 + 1] = k * 0.93; cl[i * 3 + 2] = k * 0.9;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.BufferAttribute(cl, 3));
  if (!MAT.pit) { MAT.pit = MAT.st_mars ? MAT.st_mars.clone() : new THREE.MeshStandardMaterial({ color: 0x6e3020, roughness: 0.95 }); MAT.pit.vertexColors = true; }
  const m = new THREE.Mesh(geo, MAT.pit); m.position.set(cx, 0, cz); m.receiveShadow = true; m.castShadow = true;
  return m;
}
/** 개미지옥 비탈 — 칸 하나를 5×5 로 나눠 깊이만큼 내린다. 이웃 칸이 구덩이가 아니면 그 모서리는 0 이라 바닥과 이어진다.
    법선은 깊이의 기울기로 — 칸 이음매에서 빛이 끊기지 않는다. 깊을수록 정점 색을 어둡게 */
function pitMesh(w, tl) {
  const T = TILE, S = 5, n = tl.length / 2, V = (S + 1) * (S + 1);
  const pos = new Float32Array(n * V * 3), nor = new Float32Array(n * V * 3), uv = new Float32Array(n * V * 2), cl = new Float32Array(n * V * 3), idx = [];
  const isPit = (x, y) => w.pitIdx[w.idx(x, y)] >= 0, e = 1e-3, hd = T / S / 2;
  const dep = (X, Z) => {
    const fx = X / T, fz = Z / T;
    if (!isPit(Math.floor(fx - e), Math.floor(fz - e)) || !isPit(Math.floor(fx + e), Math.floor(fz - e)) || !isPit(Math.floor(fx - e), Math.floor(fz + e)) || !isPit(Math.floor(fx + e), Math.floor(fz + e))) return 0;
    const q = w.pitAt(X, Z); return q ? q.depth : 0;
  };
  let v = 0;
  for (let t = 0; t < n; t++) {
    const X0 = tl[t * 2] * T, Z0 = tl[t * 2 + 1] * T, base = v;
    for (let j = 0; j <= S; j++) for (let i = 0; i <= S; i++, v++) {
      const X = X0 + i * T / S, Z = Z0 + j * T / S, d = dep(X, Z);
      const gx = (dep(X + hd, Z) - dep(X - hd, Z)) / (2 * hd), gz = (dep(X, Z + hd) - dep(X, Z - hd)) / (2 * hd), nl = Math.hypot(gx, 1, gz);
      pos[v * 3] = X; pos[v * 3 + 1] = -d + 0.6; pos[v * 3 + 2] = Z;
      nor[v * 3] = gx / nl; nor[v * 3 + 1] = 1 / nl; nor[v * 3 + 2] = gz / nl;
      uv[v * 2] = X / 640; uv[v * 2 + 1] = -Z / 640;
      const k = Math.min(1, d / 130), sh = 1 - 0.72 * Math.pow(k, 0.8);
      cl[v * 3] = sh; cl[v * 3 + 1] = sh * 0.9; cl[v * 3 + 2] = sh * 0.86;
    }
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const a = base + j * (S + 1) + i, b = a + 1, c = a + S + 1, d2 = c + 1;
      idx.push(a, c, b, b, c, d2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(cl, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  if (!MAT.pit) { MAT.pit = MAT.st_mars ? MAT.st_mars.clone() : new THREE.MeshStandardMaterial({ color: 0x6e3020, roughness: 0.95 }); MAT.pit.vertexColors = true; }
  const m = new THREE.Mesh(geo, MAT.pit); m.receiveShadow = true;
  return m;
}
function floorQuad(B, x0, z0, x1, z1, y, S, color) {
  B.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], [0, 1, 0], [[x0 / S, -z0 / S], [x0 / S, -z1 / S], [x1 / S, -z1 / S], [x1 / S, -z0 / S]], color);
}
/** 세로 벽 사각형 — (ax,az)→(bx,bz) 를 따라 y0..y1. 법선은 바깥쪽. UV: 가로 칸/4, 세로 층/4 */
function wallQuad(B, ax, az, bx, bz, y0, y1, nrm, color, u0, vScale = 1 / (FLOOR_PX * 4), uScale = 1 / (TILE * 4)) {
  const len = Math.hypot(bx - ax, bz - az);
  const ua = u0 * uScale, ub = (u0 + len) * uScale;
  B.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], nrm, [[ua, y0 * vScale], [ub, y0 * vScale], [ub, y1 * vScale], [ua, y1 * vScale]], color);
}

/** 덩어리 하나를 지금 다 짓는다(발밑 · 판 시작) */
function buildChunk(w, cx, cy) { const it = chunkSteps(w, cx, cy); let r; do r = it.next(); while (!r.done); return r.value; }
/** 덩어리 짓기를 줄 단위로 나눈다 — 한 덩어리에 15‒40ms(휴대폰은 그 몇 배)라 한 프레임에 지으면 걸을 때마다 멈칫했다.
    먼 덩어리는 프레임마다 몇 ms 씩만 이어 짓는다(syncChunks) */
function* chunkSteps(w, cx, cy) {
  const g = new THREE.Group();
  const B = {}, wrap = {};
  // 작은 재질들은 한 재질(정점 색)로 모은다 — 덩어리마다 그리기 호출이 30여 개에서 열 개 남짓으로 준다
  const get = k => {
    const al = ALIAS[k];
    if (!al) return B[k] || (B[k] = new Bucket());
    if (wrap[k]) return wrap[k];
    const real = B[al[0]] || (B[al[0]] = new Bucket()), tint = al[1];
    return (wrap[k] = { quad: (a, b, c, d, n, uv, color) => real.quad(a, b, c, d, n, uv, color || tint) });
  };
  const T = TILE, x0 = cx * CH, y0 = cy * CH;
  const deco = (x, y) => w.deco[w.idx(x, y)];
  const isB = (x, y) => deco(x, y) === D_BUILDING;
  const isRoadish = (x, y) => { const d = deco(x, y), gr = w.grid[w.idx(x, y)]; return gr === T_ROAD && (d === D_ASPHALT || d === D_PROP || d === D_RUBBLE); };
  const SW_H = 3, lamps = [], fires = [], clutter = [], marks = [], pits = [];
  for (let y = y0; y < y0 + CH; y++) { if (y > y0) yield; for (let x = x0; x < x0 + CH; x++) {
    const i = w.idx(x, y), d = w.deco[i], gr = w.grid[i];
    const X0 = x * T, Z0 = y * T, X1 = X0 + T, Z1 = Z0 + T;
    if (w.pitIdx && w.pitIdx[i] >= 0) { pits.push(x, y); continue; }     // 개미지옥 — 바닥 대신 깔때기 비탈(아래에서 한 번에)
    const tr = w.terr ? w.terr[i] : 0;
    if (tr && TERR_MAT[tr] && d !== D_BUILDING && d !== D_WATER && d !== D_BRIDGE) {
      const fy = (d === D_SIDEWALK ? SW_H : d === D_GRASS ? 1 : 0) + (tr === 3 ? 1.6 : 0.5) + (x & 1) * 0.05;
      // 칸보다 큰 둥근 얼룩을 해시로 돌리고 밀어 놓는다 — 이웃 얼룩과 겹쳐 한 덩어리가 된다
      const th = (Math.imul(x * 374761393 ^ y * 668265263, 2246822519) >>> 0), ang = (th % 628) / 100, hs = T * (0.92 + ((th >>> 9) % 30) / 100);
      const cx = X0 + T / 2 + (((th >>> 4) % 13) - 6), cz = Z0 + T / 2 + (((th >>> 7) % 13) - 6), ca = Math.cos(ang) * hs, sa = Math.sin(ang) * hs;
      get(TERR_MAT[tr]).quad([cx - ca + sa, fy, cz - sa - ca], [cx - ca - sa, fy, cz - sa + ca], [cx + ca - sa, fy, cz + sa + ca], [cx + ca + sa, fy, cz + sa - ca], [0, 1, 0], [[0, 0], [0, 1], [1, 1], [1, 0]]);
      if (tr === 4 && (Math.imul(x * 2654435761 ^ y * 40503, 2246822519) >>> 0) % 3 === 0) marks.push({ x: X0 + T / 2, y: 10, z: Z0 + T / 2, r: 110, c: [1, 0.36, 0.08], k: 1.1 });
    }
    // 물가 — 강 · 운하와 맞닿은 칸 가장자리에 밝은 돌 테두리(이스트리아석)
    if (d !== D_WATER && d !== D_BUILDING && d !== D_BRIDGE) {
      const ey = (d === D_SIDEWALK ? SW_H : 0) + 0.45, Cp = get('paint');
      if (deco(x, y - 1) === D_WATER) floorQuad(Cp, X0, Z0, X1, Z0 + 5, ey, 100);
      if (deco(x, y + 1) === D_WATER) floorQuad(Cp, X0, Z1 - 5, X1, Z1, ey, 100);
      if (deco(x - 1, y) === D_WATER) floorQuad(Cp, X0, Z0, X0 + 5, Z1, ey, 100);
      if (deco(x + 1, y) === D_WATER) floorQuad(Cp, X1 - 5, Z0, X1, Z1, ey, 100);
    }
    if (d === D_BUILDING) {
      const h = bh(w, x, y), LS = lotStyle(w, x, y), wc = col(LS.color, LS.k), brick = LS.brick;
      const wallK = LS.style === 'brick' || LS.style === 'stucco' ? LS.style : 'f_' + LS.style;
      const lot = w.lot[i];
      const RP = ROOFS_BY[w.theme.key] || ROOFS3, rc = col(RP[(lot || (x * 7 + y * 3)) % RP.length], w.theme.street === 'snow' ? 2.6 : 1.3);
      floorQuad(get('roof'), X0, Z0, X1, Z1, h, 300, rc);
      // 바깥 벽 — 이웃이 건물이 아니거나 낮으면 그 높이부터
      const sides = [[0, 1, X0, Z1, X1, Z1, [0, 0, 1]], [0, -1, X1, Z0, X0, Z0, [0, 0, -1]], [1, 0, X1, Z1, X1, Z0, [1, 0, 0]], [-1, 0, X0, Z0, X0, Z1, [-1, 0, 0]]];
      for (const [dx, dy, ax, az, bx, bz, n] of sides) {
        const hn = isB(x + dx, y + dy) ? bh(w, x + dx, y + dy) : 0;
        if (h <= hn + 0.5) continue;
        const uu = dx === 0 ? (dy > 0 ? X0 : -X1) : (dx > 0 ? -Z1 : Z0);
        if (hn === 0) {
          // 다섯 칸 중 하나 꼴로 아직 불이 켜진 가게 — 유리 안이 빛나고 보도에 빛이 쏟아진다
          const sh = (Math.imul(x * 668265263 ^ y * 374761393, 2246822519) >>> 0);
          const outsideD = deco(x + dx, y + dy);
          if (dy !== -1 && (outsideD === D_SIDEWALK || outsideD === D_PLAZA) && sh % 5 === 0) {
            wallQuad(get('shopLit'), ax, az, bx, bz, 0, FLOOR_PX, n, null, uu, 1 / FLOOR_PX);
            const mx = (ax + bx) / 2 + n[0] * 16, mz = (az + bz) / 2 + n[2] * 16, warm = (sh >>> 6) % 2;
            marks.push({ x: mx, y: 16, z: mz, r: 150, c: warm ? [1, 0.78, 0.5] : [0.82, 0.92, 1], k: 1.3 });
          } else wallQuad(get('shop'), ax, az, bx, bz, 0, FLOOR_PX, n, wc, uu, 1 / FLOOR_PX);
          wallQuad(get(wallK), ax, az, bx, bz, FLOOR_PX, h, n, wc, uu);
          if (dy !== -1) { facadeDetail(get, w, x, y, ax, az, bx, bz, n, h, wc, brick, lot, deco(x + dx, y + dy)); signBoards(get, w, x, y, ax, az, bx, bz, n, Math.floor(h / FLOOR_PX), deco(x + dx, y + dy)); }
        } else wallQuad(get(wallK), ax, az, bx, bz, hn, h, n, wc, uu);
        // 난간 — 지붕 가장자리를 둘러 낮은 벽
        const same = isB(x + dx, y + dy) && w.lot[w.idx(x + dx, y + dy)] === lot;
        if (!same) {
          const P = get('parapet'), ph = 6, t = 3, ix = -n[0] * t, iz = -n[2] * t;
          wallQuad(P, ax, az, bx, bz, h, h + ph, n, null, 0);
          wallQuad(P, bx + ix, bz + iz, ax + ix, az + iz, h, h + ph, [-n[0], 0, -n[2]], null, 0);
          P.quad([ax, h + ph, az], [bx, h + ph, bz], [bx + ix, h + ph, bz + iz], [ax + ix, h + ph, az + iz], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
        }
      }
      // 옥상 설비 — 필지 안쪽 칸마다 해시로
      const hh = (Math.imul(x * 2654435761 ^ y * 40503, 2246822519) >>> 0);
      // 경사 지붕(레이캬비크 골함석 집 · 베네치아 기와) — 필지가 네모면 그 모서리 칸에서 필지 전체를 덮는 우진각 지붕
      if (LS.style === 'nordic' || LS.style === 'palazzo') {
        const LB = lotBox(w, lot), lx = ((x % w.w) + w.w) % w.w, ly = ((y % w.h) + w.h) % w.h;
        if (LB && LB.rect) { if (lx === LB.x0 && ly === LB.y0) hipQuads(get('roof'), X0, Z0, X0 + (LB.x1 - LB.x0 + 1) * T, Z0 + (LB.y1 - LB.y0 + 1) * T, h + 0.5, Math.min(LB.x1 - LB.x0 + 1, LB.y1 - LB.y0 + 1) * T * (LS.style === 'nordic' ? 0.42 : 0.24), rc); continue; }
      }
      const inner = isB(x + 1, y) && isB(x - 1, y) && isB(x, y + 1) && isB(x, y - 1) && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => w.lot[w.idx(x + a, y + b)] === lot);
      if (inner) { if (!roofIcon(get, w, X0, Z0, h, hh, marks)) roofStuff(get, X0, Z0, h, hh); }
      else if (hh % 5 === 0) roofBox(get('rooftop'), X0 + 14, Z0 + 14, 12, 9, h, 7);
      continue;
    }
    if (d === D_WATER) {
      floorQuad(get('water'), X0, Z0, X1, Z1, -8, 200); bankWalls(w, get('curb'), x, y, X0, Z0, X1, Z1);
      // 운하의 계류 말뚝(브리콜라) — 물가 쪽에 줄무늬 기둥
      if (w.theme.canals) {
        const hp = (Math.imul(x * 2654435761 ^ y * 1597334677, 3266489917) >>> 0);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (hp % 4 || deco(x + dx, y + dy) === D_WATER || deco(x + dx, y + dy) === D_BRIDGE) continue;
          const px = X0 + T / 2 + dx * (T / 2 - 6) + dy * ((hp >>> 5) % 20 - 10), pz = Z0 + T / 2 + dy * (T / 2 - 6) + dx * ((hp >>> 5) % 20 - 10);
          for (let q = 0; q < 4; q++) cylB(get(q % 2 ? 'paint' : 'awning' + ((hp >>> 9) % 6)), px, pz, 1.8, -8 + q * 7, -1 + q * 7, 6, q === 3);
          break;
        }
      }
      continue;
    }
    if (d === D_BRIDGE) {
      floorQuad(get('bridge'), X0, Z0, X1, Z1, 0, 200);
      // 난간 — 물과 맞닿은 쪽에 낮은 콘크리트 벽과 기둥
      const wet = (a, b) => deco(x + a, y + b) === D_WATER, P = get('parapet');
      if (wet(0, 1)) { roofBox(P, X0, Z1 - 3, T, 3, 0, 9); }
      if (wet(0, -1)) { roofBox(P, X0, Z0, T, 3, 0, 9); }
      if (wet(1, 0)) { roofBox(P, X1 - 3, Z0, 3, T, 0, 9); }
      if (wet(-1, 0)) { roofBox(P, X0, Z0, 3, T, 0, 9); }
      continue;
    }
    if (d === D_GRASS) { floorQuad(get(w.theme.key === 'mars' ? 'st_mars' : 'grass'), X0, Z0, X1, Z1, 1, w.theme.key === 'mars' ? 640 : 200); continue; }
    if (d === D_PLAZA || d === D_LANDMARK) {
      floorQuad(get('plaza'), X0, Z0, X1, Z1, 0, 160);
      if (gr === T_WALL) lmBlock(get('stone'), w, x, y, X0, Z0, X1, Z1);
      else if (gr === T_WATER) fencePanel(get('fence'), w, x, y, X0, Z0, X1, Z1);
      continue;
    }
    if (d === D_SIDEWALK && w.theme.key === 'mars') { floorQuad(get('st_mars'), X0, Z0, X1, Z1, 0.6, 640); continue; }   // 화성엔 보도블록이 없다
    if (d === D_SIDEWALK) {
      floorQuad(get('sidewalk'), X0, Z0, X1, Z1, SW_H, 160);
      // 가로등 — 차도와 맞닿은 보도 칸마다 네 칸 간격, 팔을 차도 쪽으로 뻗는다
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        if (!isRoadish(x + dx, y + dy)) continue;
        const along = dy !== 0 ? x : y;
        if (((along % 4) + 4) % 4 !== 1) continue;
        const hsh = (Math.imul(x * 73856093 ^ y * 19349663, 2654435761) >>> 0) % 100;
        if (hsh < 12) continue;                                   // 쓰러졌거나 없는 자리
        lamps.push(lampPost(get, X0 + T / 2 + dx * (T / 2 - 5), Z0 + T / 2 + dy * (T / 2 - 5), dx, dy, hsh < 58 ? 1 : hsh < 70 ? 2 : 0, hsh));
        break;
      }
      sidewalkClutter(w, x, y, X0, Z0, SW_H, fires, clutter, isB);
      // 가로수 — 싱가포르는 넓은 그늘 나무, 방콕은 야자
      const TR = kitOf(w).trees;
      if (TR && ((x * 3 + y * 5) % 4 === 0) && [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([a, b]) => isRoadish(x + a, y + b)) && !isB(x + 1, y) && !isB(x - 1, y) && !isB(x, y + 1) && !isB(x, y - 1)) {
        const cx = X0 + T / 2, cz = Z0 + T / 2, hs2 = (x * 7 + y * 11) % 5;
        if (TR === 2) {
          clutter.push({ k: 'trunk', x: cx, y: SW_H, z: cz, r: 0, sx: 2.6, sy: 44, sz: 2.6 });
          for (let q = 0; q < 4; q++) { const a = q * 1.7 + hs2; clutter.push({ k: 'canopy', x: cx + Math.cos(a) * 12, y: SW_H + 52 + (q % 2) * 6, z: cz + Math.sin(a) * 12, r: a, sx: 20 + hs2 * 2, sy: 11, sz: 18 }); }
        } else {
          clutter.push({ k: 'trunk', x: cx, y: SW_H, z: cz, r: 0, sx: 2, sy: 70, sz: 2 });
          for (let q = 0; q < 7; q++) { const a = q / 7 * 6.283 + hs2; clutter.push({ k: 'frond', x: cx + Math.cos(a) * 11, y: SW_H + 68, z: cz + Math.sin(a) * 11, r: -a, sx: 22, sy: 3, sz: 5 }); }
        }
      }
      // 연석 — 차도와 맞닿은 쪽에 높이 3 의 옆면
      const C = get('curb');
      if (isRoadish(x, y + 1)) wallQuad(C, X0, Z1, X1, Z1, 0, SW_H, [0, 0, 1], null, 0);
      if (isRoadish(x, y - 1)) wallQuad(C, X1, Z0, X0, Z0, 0, SW_H, [0, 0, -1], null, 0);
      if (isRoadish(x + 1, y)) wallQuad(C, X1, Z1, X1, Z0, 0, SW_H, [1, 0, 0], null, 0);
      if (isRoadish(x - 1, y)) wallQuad(C, X0, Z0, X0, Z1, 0, SW_H, [-1, 0, 0], null, 0);
      continue;
    }
    // 차도 — 지역의 길이면 그 재질
    floorQuad(get(STREET_MAT[w.theme.street] || 'asphalt'), X0, Z0, X1, Z1, 0, w.theme.street === 'mars' ? 640 : w.theme.street ? 240 : 900);
    { const hs = (Math.imul(x * 2246822519 ^ y * 3266489917, 668265263) >>> 0); if (hs % 9 === 0) clutter.push({ k: 'paper', x: X0 + (hs >>> 4) % 44 + 2, y: 0.35, z: Z0 + (hs >>> 10) % 44 + 2, r: (hs % 628) / 100, sx: 7 + (hs >>> 16) % 6, sy: 1, sz: 9 }); }
    const m = w.mark[i], cw = w.cross[i];
    if (m === 1 && (y & 1) === 0) { floorQuad(get('yellow'), X0 - 3, Z0 + 6, X0 - 1, Z1 - 6, 0.4, 100); floorQuad(get('yellow'), X0 + 1, Z0 + 6, X0 + 3, Z1 - 6, 0.4, 100); }
    else if (m === 2 && (x & 1) === 0) { floorQuad(get('yellow'), X0 + 6, Z0 - 3, X1 - 6, Z0 - 1, 0.4, 100); floorQuad(get('yellow'), X0 + 6, Z0 + 1, X1 - 6, Z0 + 3, 0.4, 100); }
    if (cw) for (let q = 0; q < 4; q++) {
      if (cw === 1) floorQuad(get('paint'), X0 + 4 + q * 11, Z0 + 6, X0 + 10 + q * 11, Z1 - 6, 0.4, 100);
      else floorQuad(get('paint'), X0 + 6, Z0 + 4 + q * 11, X1 - 6, Z0 + 10 + q * 11, 0.4, 100);
    }
    const dm = w.dirm[i];
    if (!cw && !m && dm && dm !== 3 && ((x >> 2) + (y >> 2)) % 3 === 0) {
      const sw = (dx, dy) => deco(x + dx, y + dy) === D_SIDEWALK;
      if (dm === 2 && sw(0, -1)) floorQuad(get('paint'), X0 + 2, Z0 + 4, X0 + 4, Z0 + 24, 0.4, 100);
      else if (dm === 2 && sw(0, 1)) floorQuad(get('paint'), X0 + 2, Z1 - 24, X0 + 4, Z1 - 4, 0.4, 100);
      else if (dm === 1 && sw(-1, 0)) floorQuad(get('paint'), X0 + 4, Z0 + 2, X0 + 24, Z0 + 4, 0.4, 100);
      else if (dm === 1 && sw(1, 0)) floorQuad(get('paint'), X1 - 24, Z0 + 2, X1 - 4, Z0 + 4, 0.4, 100);
    }
  } }
  yield;
  for (const k in B) {
    const m = B[k].mesh(MAT[k]);
    if (!m) continue;
    if (k !== 'glow' && k !== 'asphalt' && !k.startsWith('st_') && k !== 'sidewalk' && k !== 'plaza' && k !== 'grass' && k !== 'water' && !k.startsWith('sign') && !TERR_MAT.includes(k) && k !== 'shopLit' && k !== 'lensFlick') m.castShadow = true;
    if (k === 'fence') m.receiveShadow = false;
    g.add(m);
  }
  // 화성의 개미지옥 — 칸마다 잘게 나눈 비탈(깊이는 world.pitAt), 둘레엔 솟은 흙 테. 테는 중심이 이 덩어리에 든 것만
  if (pits.length) g.add(pitMesh(w, pits));
  if (w.craters) for (const c of w.craters) {
    const ccx = c.x + Math.ceil((x0 - c.x) / w.w) * w.w, ccy = c.y + Math.ceil((y0 - c.y) / w.h) * w.h;
    if (ccx >= x0 + CH || ccy >= y0 + CH) continue;
    g.add(rimMesh(ccx * T, ccy * T, (c.rf || c.r) * T, 5 + c.r * 1.6));
  }
  g.userData.lamps = lamps;
  g.userData.fires = fires;
  g.userData.marks = marks;
  yield;
  addClutter(g, clutter);
  addWires(g, lamps, kitOf(w).wires);
  return g;
}
const TERR_MAT = [null, 'tSand', 'tIce', 'tFlood', 'tLava', 'tMud', null, null];   // 크레이터는 얼룩 대신 솟은 테 · 그늘진 바닥 모형으로
const STREET_MAT = { sand: 'st_sand', dirt: 'st_dirt', stone: 'st_stone', snow: 'st_snow', mars: 'st_mars' };
/* ═══════════ 거리 잡동사니 · 전선 ═══════════ */
let CLUT = null;
function clutterKit() {
  if (CLUT) return CLUT;
  const bag = new THREE.IcosahedronGeometry(1, 1);
  { const p = bag.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setY(i, y < 0 ? y * 0.55 : y * 0.85); p.setX(i, p.getX(i) * (1 + Math.sin(i * 1.7) * 0.12)); } bag.computeVertexNormals(); }
  const tire = new THREE.TorusGeometry(1, 0.42, 8, 16); tire.rotateX(Math.PI / 2);
  const barrel = new THREE.CylinderGeometry(1, 1, 1, 14); barrel.translate(0, 0.5, 0);
  CLUT = {
    bag: [bag, enhanceNew(new THREE.MeshStandardMaterial({ color: 0x15191a, roughness: 0.22, metalness: 0.1 }))],
    bag2: [bag, enhanceNew(new THREE.MeshStandardMaterial({ color: 0x223024, roughness: 0.25, metalness: 0.1 }))],
    box: [GEO.box, enhanceNew(new THREE.MeshStandardMaterial({ color: 0x6e5638, roughness: 0.9 }))],
    tire: [tire, enhanceNew(new THREE.MeshStandardMaterial({ color: 0x101112, roughness: 0.8 }))],
    barrel: [barrel, enhanceNew(new THREE.MeshStandardMaterial({ color: 0x4a2c1c, roughness: 0.7, metalness: 0.4 }))],
    trunk: [(() => { const t = new THREE.CylinderGeometry(0.7, 1, 1, 7); t.translate(0, 0.5, 0); return t; })(), enhanceNew(new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 0.9 }))],
    canopy: [new THREE.IcosahedronGeometry(1, 1), enhanceNew(new THREE.MeshStandardMaterial({ color: 0x1e3420, roughness: 0.85 }))],
    frond: [(() => { const f = new THREE.IcosahedronGeometry(1, 0); f.translate(0.6, -0.3, 0); return f; })(), enhanceNew(new THREE.MeshStandardMaterial({ color: 0x2a4a24, roughness: 0.8 }))],
    // 바닥의 종이 — 젖어 칙칙하고 빛을 반사하지 않는다(밝게 빛나 보급 상자로 착각하게 했다)
    paper: [GEO.plane, enhanceNew(new THREE.MeshStandardMaterial({ map: TEX.paper, transparent: true, alphaTest: 0.2, roughness: 1, envMapIntensity: 0, polygonOffset: true, polygonOffsetFactor: -1 }))],
  };
  return CLUT;
}
function addClutter(g, list) {
  const K = clutterKit(), byKind = {};
  for (const c of list) (byKind[c.k] || (byKind[c.k] = [])).push(c);
  for (const k in byKind) {
    const L = byKind[k], im = new THREE.InstancedMesh(K[k][0], K[k][1], L.length);
    L.forEach((c, i) => { dm.compose(dpos.set(c.x, c.y, c.z), dq.setFromAxisAngle(UPY, c.r || 0), dsc.set(c.sx, c.sy, c.sz)); im.setMatrixAt(i, dm); });
    im.castShadow = k !== 'paper'; im.receiveShadow = true;
    g.add(im);
  }
}
/** 전선 — 같은 길가의 이웃 가로등 사이에 처진 두 가닥 */
const WIRE_MAT = new THREE.LineBasicMaterial({ color: 0x0a0b0c });
function addWires(g, lamps, strands = 2) {
  const pts = [];
  if (!strands) return;
  for (const a of lamps) for (const b of lamps) {
    if (a === b || a.x > b.x || (a.x === b.x && a.z >= b.z)) continue;
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d < 150 || d > 230 || (Math.abs(a.x - b.x) > 6 && Math.abs(a.z - b.z) > 6)) continue;
    for (let q = 0; q < strands; q++) {
      const off = q * (strands > 3 ? 2.6 : 5), y0 = LAMP_H + 6 + off + (q % 2) * 1.5, sag = 12 + off * 1.4 + (strands > 4 ? (q * 7) % 11 : 0);
      for (let i = 0; i < 10; i++) {
        const t0 = i / 10, t1 = (i + 1) / 10;
        pts.push(a.x + (b.x - a.x) * t0, y0 - sag * 4 * t0 * (1 - t0), a.z + (b.z - a.z) * t0, a.x + (b.x - a.x) * t1, y0 - sag * 4 * t1 * (1 - t1), a.z + (b.z - a.z) * t1);
      }
    }
  }
  if (!pts.length) return;
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(geo, WIRE_MAT));
}
/** 가로등 한 대 — 기둥 · 팔 · 등갓(아래 면이 빛난다). state: 1 켜짐 · 2 깜빡임 · 0 꺼짐 */
const LAMP_H = 66, LAMP_ARM = 22;
/** 보도 잡동사니 — 벽에 붙은 쪽에 쓰레기봉투 더미 · 상자 · 타이어, 드물게 드럼통 불. 젖은 종이 */
function sidewalkClutter(w, x, y, X0, Z0, SH, fires, clutter, isB) {
  const hs = (Math.imul(x * 1640531527 ^ y * 2654435761, 2246822519) >>> 0), T = TILE;
  if (hs % 7 === 0) clutter.push({ k: 'paper', x: X0 + (hs >>> 3) % 40 + 4, y: SH + 0.35, z: Z0 + (hs >>> 9) % 40 + 4, r: (hs % 628) / 100, sx: 7, sy: 1, sz: 9 });
  let wx = 0, wz = 0;
  if (isB(x, y - 1)) wz = -1; else if (isB(x - 1, y)) wx = -1; else if (isB(x + 1, y)) wx = 1; else if (isB(x, y + 1)) wz = 1;
  if (!wx && !wz) return;
  const cx = X0 + T / 2 + wx * (T / 2 - 9), cz = Z0 + T / 2 + wz * (T / 2 - 9), k = hs % 41;
  const tx = wz ? 1 : 0, tz = wx ? 1 : 0;
  if (k < 4) {                                                   // 쓰레기봉투 더미
    for (let i = 0; i < 3 + (hs >>> 7) % 3; i++) {
      const o = (i - 1.5) * 8 + ((hs >>> (i * 3)) % 5) - 2, s = 5 + ((hs >>> (i * 2 + 5)) % 3);
      clutter.push({ k: i % 2 ? 'bag2' : 'bag', x: cx + tx * o, y: SH + s * 0.5, z: cz + tz * o, r: i * 1.3, sx: s, sy: s * 1.1, sz: s * 0.9 });
    }
  } else if (k < 6) {                                            // 상자
    for (let i = 0; i < 3; i++) clutter.push({ k: 'box', x: cx + tx * (i - 1) * 10, y: SH + 3.5 + (i === 1 ? 7 : 0), z: cz + tz * (i - 1) * 10 * (i === 1 ? 0 : 1), r: (hs >>> i) % 3 * 0.2, sx: 9, sy: 7, sz: 8 });
  } else if (k === 6) {                                          // 타이어 더미
    for (let i = 0; i < 3; i++) clutter.push({ k: 'tire', x: cx, y: SH + 1.8 + i * 3.5, z: cz, r: i, sx: 5.5, sy: 5.5, sz: 5.5 });
  } else if (k === 7 && (hs >>> 12) % 3 === 0) {                 // 드럼통 불
    clutter.push({ k: 'barrel', x: cx, y: SH, z: cz, r: 0, sx: 6, sy: 15, sz: 6 });
    fires.push({ x: cx, y: SH + 15, z: cz, s: 0.45, seed: (hs % 997) / 997 });
  }
}
function lampPost(get, px, pz, dx, dy, state, seed) {
  const M = get('metal');
  roofBox(M, px - 1.6, pz - 1.6, 3.2, 3.2, 0, LAMP_H + 2);
  roofBox(M, px - 2.6, pz - 2.6, 5.2, 5.2, 0, 5);
  const hx = px + dx * LAMP_ARM, hz = pz + dy * LAMP_ARM;
  const ax0 = Math.min(px, hx) - 1, ax1 = Math.max(px, hx) + 1, az0 = Math.min(pz, hz) - 1, az1 = Math.max(pz, hz) + 1;
  roofBox(M, ax0, az0, ax1 - ax0, az1 - az0, LAMP_H, 2);
  const hw = dx !== 0 ? 12 : 6, hd = dx !== 0 ? 6 : 12;
  roofBox(M, hx - hw / 2, hz - hd / 2, hw, hd, LAMP_H - 2.5, 3);
  const L = get(state === 1 ? 'lensOn' : state === 2 ? 'lensFlick' : 'lensOff'), y = LAMP_H - 2.6;
  L.quad([hx - hw / 2 + 1, y, hz - hd / 2 + 1], [hx + hw / 2 - 1, y, hz - hd / 2 + 1], [hx + hw / 2 - 1, y, hz + hd / 2 - 1], [hx - hw / 2 + 1, y, hz + hd / 2 - 1], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  return { x: hx, z: hz, y, state, seed };
}
function roofBox(B, x, z, wd, dp, y, h, color = null) {
  const x1 = x + wd, z1 = z + dp, y1 = y + h;
  B.quad([x, y1, z], [x, y1, z1], [x1, y1, z1], [x1, y1, z], [0, 1, 0], [[0, 0], [0, 1], [1, 1], [1, 0]], color);
  wallQuad(B, x, z1, x1, z1, y, y1, [0, 0, 1], color, 0);
  wallQuad(B, x1, z, x, z, y, y1, [0, 0, -1], color, 0);
  wallQuad(B, x1, z1, x1, z, y, y1, [1, 0, 0], color, 0);
  wallQuad(B, x, z, x, z1, y, y1, [-1, 0, 0], color, 0);
}
/* 작은 재질의 별명 — [실제 묶음, 기본 색]. 색은 선형 값이라 1 을 넘으면(빛나는 것) 블룸으로 번진다 */
const lin = (hex, k = 1) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return c; };
const ALIAS = {
  metal: ['detail', lin('#2a2d31')], fan: ['detail', lin('#0c0d0f')], door: ['detail', lin('#3a3226')], skyOff: ['detail', lin('#1c242c')],
  rooftop: ['detail', lin('#8a8e94')], parapet: ['detail', lin('#6a6c70')], curb: ['detail', lin('#8a8a84')], yellow: ['detail', lin('#c9a83a')],
  paint: ['detail', lin('#d8d6cc')], rust: ['detail', lin('#6a4a36')], stone: ['detail', lin('#77736a')], bridge: ['detail', lin('#4a4e54')],
  ledge: ['detail', WHITE], solar: ['detail', lin('#1a2a44')],
  lensOn: ['glow', lin('#ffb868', 4)], skyOn: ['glow', lin('#ffc88a', 1.6)], cross: ['glow', lin('#ff2018', 3.2)], lensOff: ['detail', lin('#3a3a38')],
};
for (let i = 0; i < 6; i++) ALIAS['awning' + i] = ['awning', null];
/** 벽에서 튀어나온 띠(처마 · 층 띠) — 윗면 · 앞면 · 아랫면 */
function ledge(B, ax, az, bx, bz, n, y, out, th, color) {
  const ox = n[0] * out, oz = n[2] * out;
  B.quad([ax, y + th, az], [ax + ox, y + th, az + oz], [bx + ox, y + th, bz + oz], [bx, y + th, bz], [0, 1, 0], [[0, 0], [0, 1], [1, 1], [1, 0]], color);
  wallQuad(B, ax + ox, az + oz, bx + ox, bz + oz, y, y + th, n, color, 0, 1 / 8, 1 / 64);
  B.quad([ax, y, az], [bx, y, bz], [bx + ox, y, bz + oz], [ax + ox, y, az + oz], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], color);
}
/** 벽 위 상자(실외기 등) — 벽면 좌표(u: a→b 방향 거리, y)로 놓는다 */
function wallBox(B, ax, az, bx, bz, n, u, y, wd, ht, dp) {
  const L = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / L, tz = (bz - az) / L;
  const x0 = ax + tx * u, z0 = az + tz * u, x1 = x0 + tx * wd, z1 = z0 + tz * wd;
  const minx = Math.min(x0, x1, x0 + n[0] * dp), maxx = Math.max(x1, x0, x1 + n[0] * dp), minz = Math.min(z0, z1, z0 + n[2] * dp), maxz = Math.max(z1, z0, z1 + n[2] * dp);
  roofBox(B, minx, minz, Math.max(1, maxx - minx), Math.max(1, maxz - minz), y, ht);
}
/** 외벽의 입체 — 층 띠 · 처마 · 1층 차양 · 창 밑 실외기 · 비상계단 · 홈통. 카메라가 보는 면만 */
const AWN = ['#7a2a24', '#2a4a6a', '#3a5a3a', '#6a5a2a', '#5a2a4a', '#2a5a5a'];
function facadeDetail(get, w, x, y, ax, az, bx, bz, n, h, wc, brick, lot, outside) {
  const hs = (Math.imul(x * 374761393 ^ y * 668265263, 1274126177) >>> 0);
  const band = col(brick ? '#8a8378' : '#9a968c'), floors = Math.floor(h / FLOOR_PX);
  const L = get('ledge');
  for (let f = 1; f < floors; f++) ledge(L, ax, az, bx, bz, n, f * FLOOR_PX - 1, 1.4, 2.2, band);
  ledge(L, ax, az, bx, bz, n, h - 4, 3, 4, band);                                     // 처마
  // 1층 차양 — 보도 쪽 가게
  if ((outside === D_SIDEWALK || outside === D_PLAZA) && hs % 3 !== 0) {
    const A = get('awning' + (hs >>> 4) % AWN.length), o1 = 13, ya = FLOOR_PX - 3, yb = FLOOR_PX - 11;
    const L2 = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / L2, tz = (bz - az) / L2;
    const a0 = [ax + tx * 3, az + tz * 3], b0 = [bx - tx * 3, bz - tz * 3];
    const nn = [n[0] * 0.5, 0.86, n[2] * 0.5];
    A.quad([a0[0], ya, a0[1]], [a0[0] + n[0] * o1, yb, a0[1] + n[2] * o1], [b0[0] + n[0] * o1, yb, b0[1] + n[2] * o1], [b0[0], ya, b0[1]], nn, [[0, 0], [0, 1], [4, 1], [4, 0]]);
    wallQuad(A, a0[0] + n[0] * o1, a0[1] + n[2] * o1, b0[0] + n[0] * o1, b0[1] + n[2] * o1, yb - 4, yb, n, null, 0, 1 / 8, 1 / 12);
    A.quad([a0[0], ya, a0[1]], [b0[0], ya, b0[1]], [b0[0] + n[0] * o1, yb, b0[1] + n[2] * o1], [a0[0] + n[0] * o1, yb, a0[1] + n[2] * o1], [-nn[0], -nn[1], -nn[2]], [[0, 0], [4, 0], [4, 1], [0, 1]]);
  }
  // 창 밑 실외기 (창은 칸마다 두 개: 6.75 · 29.25 에서 폭 12)
  for (let f = 1; f < floors; f++) for (let k = 0; k < 2; k++) {
    if (((hs >>> (f * 2 + k)) & 15) > 1) continue;
    wallBox(get('rooftop'), ax, az, bx, bz, n, 6.75 + k * 22.5, f * FLOOR_PX + 1, 11, 6.5, 6);
  }
  // 홈통 — 칸 모서리
  if (hs % 7 === 2) wallBox(get('metal'), ax, az, bx, bz, n, 1, 0, 2, h - 2, 2);
  // 비상계단 — 벽돌 건물의 옆면 · 앞면 몇 곳: 층마다 철판 발판 + 난간 + 비스듬한 계단
  if (brick && floors >= 3 && hs % 9 === 4) {
    const M = get('metal'), F = get('fence');
    const L2 = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / L2, tz = (bz - az) / L2, dp = 11;
    for (let f = 1; f < floors; f++) {
      const yy = f * FLOOR_PX + 0.5;
      wallBox(M, ax, az, bx, bz, n, 2, yy - 1.2, L2 - 4, 1.2, dp);
      const ex = n[0] * dp, ez = n[2] * dp;
      wallQuad(F, ax + tx * 2 + ex, az + tz * 2 + ez, bx - tx * 2 + ex, bz - tz * 2 + ez, yy, yy + 9, n, null, 0, 1 / 24, 1 / 24);
      if (f < floors - 1) {
        const s0 = [ax + tx * 6 + n[0] * 5, az + tz * 6 + n[2] * 5], s1 = [bx - tx * 8 + n[0] * 5, bz - tz * 8 + n[2] * 5];
        const up = [0, 0.7, 0];
        M.quad([s0[0] - n[0] * 3, yy, s0[1] - n[2] * 3], [s0[0] + n[0] * 3, yy, s0[1] + n[2] * 3], [s1[0] + n[0] * 3, yy + FLOOR_PX, s1[1] + n[2] * 3], [s1[0] - n[0] * 3, yy + FLOOR_PX, s1[1] - n[2] * 3], up, [[0, 0], [1, 0], [1, 1], [0, 1]]);
      }
    }
  }
}

/* ═══════════ 도시 꾸러미 — 도시마다 다른 건물 · 간판 · 옥상 · 공기 ═══════════
   서울: 붉은 벽돌 빌라와 흰 아파트, 층마다 겹겹이 붙은 간판, 옥상의 붉은 네온 십자가, 흰 LED 가로등
   도쿄: 타일 외벽의 좁은 빌딩과 맨션, 세로 간판, 옥상 광고판, 촘촘한 전선
   방콕: 파스텔 숍하우스(덧문 · 기둥), 얽히고설킨 전선 다발, 주황 나트륨등과 더운 안개
   싱가포르: HDB 아파트(복도에 불이 켜진 띠), 파스텔 숍하우스, 가로수, 전선 없는 거리 */
const KIT = {
  seoul: { styles: [['villa', 4], ['apt', 2], ['brick', 2], ['stucco', 2]], lamp: [0.86, 0.92, 1.0], fog: 0x070a10, fogD: 0.00062, sh: [0.82, 0.98, 1.16], hi: [1.02, 1.0, 0.96], wires: 2, trees: 0,
    words: ['치킨', '호프', '노래연습장', 'PC방', '미용실', '세탁소', '안경', '치과', '학원', '태권도', '부동산', '휴대폰', '한의원', '편의점', '약국', '김밥천국', '삼겹살', '당구장', '24시', '분식', '은행', '내과', '성형외과', '모텔'] },
  tokyo: { styles: [['tile', 4], ['mansion', 3], ['stucco', 2]], lamp: [1.0, 0.86, 0.66], fog: 0x0a0812, fogD: 0.00058, sh: [0.86, 0.9, 1.18], hi: [1.06, 0.96, 1.0], wires: 4, trees: 0,
    words: ['ラーメン', '居酒屋', 'カラオケ', '薬', 'パチンコ', '寿司', '焼鳥', '喫茶店', 'ホテル', 'コンビニ', '質屋', '歯科', '不動産', 'うどん', '牛丼', 'BAR', '書店', 'スナック', '整骨院', '麻雀'] },
  bangkok: { styles: [['shophouse', 6], ['stucco', 2], ['brick', 1]], lamp: [1.0, 0.58, 0.26], fog: 0x120c08, fogD: 0.00078, sh: [0.95, 0.92, 0.95], hi: [1.12, 0.98, 0.82], wires: 7, trees: 1,
    words: ['ร้านอาหาร', 'นวด', 'ร้านยา', 'กาแฟ', 'ร้านทอง', 'โรงแรม', 'ข้าวมันไก่', 'ก๋วยเตี๋ยว', 'มินิมาร์ท', 'ซ่อมรถ', 'คลินิก', '7-11', 'SPA', 'HOSTEL', 'ส้มตำ', 'ผัดไทย'] },
  singapore: { styles: [['shophouse', 4], ['hdb', 3], ['stucco', 2]], lamp: [1.0, 0.84, 0.6], fog: 0x081010, fogD: 0.0007, sh: [0.84, 1.0, 1.04], hi: [1.04, 1.0, 0.94], wires: 0, trees: 2,
    words: ['KOPITIAM', 'CLINIC', 'MINIMART', '药房', '茶室', 'LAKSA', 'BAK KUT TEH', 'DIM SUM', 'LAUNDRY', '24 HRS', 'MONEY CHANGER', '咖啡店', 'TOTO', 'HOTEL', 'NASI LEMAK', '海南鸡饭'] },
  base: { styles: [['brick', 3], ['stucco', 3]], lamp: [0.95, 0.97, 1.0], fog: 0x080a0a, fogD: 0.0007, sh: [0.86, 0.98, 1.0], hi: [1.0, 1.0, 0.94], wires: 1, trees: 0, words: null },
  // 2부 — 바라나시: 색칠한 흙벽 집과 숍하우스, 축 늘어진 전선, 주황 등 / 카이로: 모래빛 흙벽돌, 위성 안테나 / 베네치아: 아치 창의 팔라초와 운하 /
  // 레이캬비크: 함석 벽의 알록달록한 집, 눈 / 남극: 기둥 위 조립식 연구동, 얼음
  varanasi: { styles: [['sandstone', 4], ['shophouse', 3], ['stucco', 1]], lamp: [1.0, 0.6, 0.28], fog: 0x140e08, fogD: 0.00082, sh: [0.95, 0.9, 0.92], hi: [1.12, 0.98, 0.8], wires: 6, trees: 2,
    words: ['चाय', 'दवाखाना', 'होटल', 'मिठाई', 'लस्सी', 'साड़ी', 'मेडिकल', 'पान', 'ढाबा', 'STD PCP', 'GUEST HOUSE', 'घाट', 'बैंक', 'किराना'] },
  cairo: { styles: [['sandstone', 7], ['stucco', 2]], lamp: [1.0, 0.72, 0.42], fog: 0x18120a, fogD: 0.00074, sh: [0.98, 0.92, 0.86], hi: [1.12, 1.0, 0.82], wires: 3, trees: 1,
    side: [1.45, 1.22, 0.92], plaza: [2.7, 1.95, 1.05], wet: 0.5,
    words: ['صيدلية', 'مطعم', 'قهوة', 'فندق', 'كشري', 'فول', 'بنك', 'سوبر ماركت', 'حلويات', 'مخبز', 'عصير', 'موبايل'] },
  venice: { styles: [['palazzo', 7], ['brick', 1]], lamp: [1.0, 0.8, 0.55], fog: 0x0c0f12, fogD: 0.00105, sh: [0.86, 0.96, 1.08], hi: [1.06, 0.98, 0.9], wires: 0, trees: 0,
    words: ['TRATTORIA', 'FARMACIA', 'GELATERIA', 'BACARO', 'OSTERIA', 'ALBERGO', 'TABACCHI', 'VAPORETTO', 'PIZZERIA', 'BAR', 'MASCHERE', 'VETRO'] },
  reykjavik: { styles: [['nordic', 7], ['stucco', 2]], lamp: [0.9, 0.95, 1.0], fog: 0x0a0e14, fogD: 0.0008, sh: [0.84, 0.96, 1.14], hi: [1.0, 1.0, 1.0], wires: 1, trees: 0,
    side: [1.8, 1.9, 2.05], plaza: [2.6, 2.75, 3.0], wet: 0.6,
    words: ['KAFFI', 'APÓTEK', 'BAKARÍ', 'HÓTEL', 'BÓKABÚÐ', 'SUNDLAUG', 'PYLSUR', 'BÍÓ', 'BÚÐ', 'KRÁ', 'LYFJA', 'BANKI'] },
  istanbul: { styles: [['stucco', 4], ['palazzo', 2], ['brick', 2]], lamp: [1.0, 0.78, 0.5], fog: 0x0e0c10, fogD: 0.00098, sh: [0.9, 0.94, 1.06], hi: [1.06, 0.98, 0.9], wires: 3, trees: 1,
    words: ['ECZANE', 'LOKANTA', 'KAHVE', 'ÇAY', 'KEBAP', 'BAKLAVA', 'OTEL', 'BANKA', 'SİMİT', 'BALIK', 'BERBER', 'BAKKAL'] },
  rio: { styles: [['stucco', 5], ['shophouse', 2], ['brick', 1]], lamp: [1.0, 0.7, 0.4], fog: 0x0c0e0c, fogD: 0.0008, sh: [0.94, 0.94, 0.98], hi: [1.1, 1.0, 0.86], wires: 6, trees: 2,
    words: ['FARMÁCIA', 'PADARIA', 'BOTECO', 'AÇAÍ', 'LANCHONETE', 'CHURRASCO', 'SUCOS', 'HOTEL', 'BANCO', 'MERCADO', 'PRAIA', 'PASTEL'] },
  moscow: { styles: [['brick', 3], ['stucco', 3], ['palazzo', 1]], lamp: [1.0, 0.82, 0.58], fog: 0x0c1016, fogD: 0.00095, sh: [0.88, 0.96, 1.1], hi: [1.02, 1.0, 1.0], wires: 2, trees: 1,
    words: ['АПТЕКА', 'ПРОДУКТЫ', 'КАФЕ', 'ГОСТИНИЦА', 'БАНК', 'МЕТРО', 'ВОДКА', 'ХЛЕБ', 'ПИВО', 'ТАБАК', 'РЕМОНТ', 'ПОЧТА'] },
  nairobi: { styles: [['shophouse', 3], ['stucco', 3], ['brick', 1]], lamp: [1.0, 0.72, 0.42], fog: 0x120c08, fogD: 0.00085, sh: [1.0, 0.92, 0.86], hi: [1.12, 1.0, 0.86], wires: 6, trees: 2,
    words: ['DUKA', 'HOTELI', 'M-PESA', 'CHEMIST', 'BUTCHERY', 'SALON', 'MATATU', 'CAFE', 'BANK', 'SODA', 'KIBANDA', 'MAMA MBOGA'] },
  mars: { styles: [['module', 1]], lamp: [1.0, 0.66, 0.42], fog: 0x1c0b06, fogD: 0.00072, sh: [1.12, 0.86, 0.8], hi: [1.14, 0.96, 0.86], wires: 0, trees: 0,
    side: [1.5, 0.9, 0.7], plaza: [1.7, 1.0, 0.8], wet: 0.15,
    words: ['HAB-1', 'HAB-2', 'O₂', 'GREENHOUSE', 'MED', 'LAB', 'AIRLOCK', 'H₂O', 'REACTOR', 'DEPOT', 'COMMS', 'ROVER BAY'] },
  antarctic: { styles: [['module', 1]], lamp: [0.85, 0.92, 1.0], fog: 0x0c1218, fogD: 0.00095, sh: [0.86, 0.98, 1.16], hi: [1.0, 1.02, 1.06], wires: 0, trees: 0,
    side: [3.0, 3.2, 3.5], plaza: [3.0, 3.2, 3.5], wet: 0.25,
    words: ['LAB', 'MESS', 'MEDICAL', 'POWER', 'COMMS', 'STORE', 'GARAGE', 'FUEL', 'BUNK A', 'BUNK B', 'GYM', 'WORKSHOP'] },
};
const PASTEL = {
  bangkok: ['#c9a24a', '#5e9a92', '#c27a7a', '#8fb38a', '#c9b48a', '#7f8fb8', '#d0c4a0'],
  singapore: ['#9fc3d6', '#e0b4b8', '#e8dcb8', '#a8cfae', '#d8c0e0', '#f0e2c8', '#c8d8e8'],
  varanasi: ['#d9a84a', '#5e9ac2', '#c97a9a', '#e8c070', '#8fb38a', '#d07050', '#e8d8b0', '#7ab0a8'],
  reykjavik: ['#c8402a', '#2a5a8a', '#e8c040', '#3a7a5a', '#f0ece0', '#6a5a8a', '#d8d4cc', '#2a2e34'],
  istanbul: ['#c88a6a', '#e0c890', '#8aa0b0', '#b07a8a', '#d8d0c0', '#a0886a', '#7a8a6a'],
  rio: ['#f0a070', '#f2d060', '#60b8c0', '#a8d070', '#e88aa0', '#f0e0c0', '#8ab0e0', '#d07050'],
  moscow: ['#c8b89a', '#e0d8c8', '#a8b8c8', '#d8a890', '#b0c0a8', '#f0e8d8', '#c8c8d0'],
  nairobi: ['#e8a060', '#f2d060', '#70b0a0', '#d07050', '#a8c070', '#e0d0b0', '#7ab0d8'],
};
const STYLE_COLS = {
  sandstone: ['#c8a878', '#b89868', '#d4b88a', '#a88a62', '#c0a080', '#b8a490'],
  palazzo: ['#c87a50', '#d4a060', '#b85a40', '#e0c090', '#c89070', '#a85040', '#d8c8b0'],
  nordic: ['#c8402a', '#2a5a8a', '#e8c040', '#3a7a5a', '#f0ece0', '#6a5a8a'],
  module: ['#d8642a', '#3c7a52', '#e0e2e0', '#c8a030', '#d8642a'],
};
const TALL = { apt: 2.0, hdb: 2.5, tile: 1.15, mansion: 1.3, villa: 1.05, shophouse: 0.92, sandstone: 0.82, palazzo: 1.0, nordic: 0.62, module: 0.5 };
const kitOf = w => KIT[w.theme.key] || KIT.seoul;
/** 필지의 양식 — 같은 필지는 같은 양식 · 같은 색 */
function lotStyle(w, x, y) {
  const i = w.idx(x, y), lot = w.lot[i] || (x * 7 + y * 13);
  const lh = Math.imul(lot, 2246822519) >>> 0, K = kitOf(w);
  const tot = K.styles.reduce((a, b) => a + b[1], 0);
  let q = (lh >>> 7) % tot, style = K.styles[0][0];
  for (const [st, wt] of K.styles) { if (q < wt) { style = st; break; } q -= wt; }
  // 큰 아파트 · HDB 는 드물게만 높이 — 길을 가리지 않게
  if ((style === 'apt' || style === 'hdb') && (lh >>> 13) % 3 !== 0) style = style === 'apt' ? 'villa' : 'shophouse';
  let color;
  const P = PASTEL[w.theme.key];
  if (style === 'apt' || style === 'hdb') color = ['#d8d6ce', '#cfd2d4', '#dcd4c6'][(lh >>> 5) % 3];
  else if (style === 'shophouse' && P) color = P[(lh >>> 9) % P.length];
  else if (style === 'tile') color = ['#cfc8bc', '#b8b4ae', '#d6cfc0', '#9a9fa4'][(lh >>> 5) % 4];
  else if (STYLE_COLS[style]) { const C = (style !== 'module' && P) || STYLE_COLS[style]; color = C[(lh >>> 9) % C.length]; }
  else color = wallMat3(w, x, y)[0];
  const brick = style === 'brick' || style === 'villa';
  return { style, color, brick, k: style === 'apt' || style === 'hdb' || style === 'tile' || style === 'shophouse' || STYLE_COLS[style] ? 1.05 : 1.5 };
}
/* 외벽 무늬 — 양식마다 4칸 × 4층(512×384). 같은 함수가 낮(색)과 밤(불 켜진 창) 두 장을 그린다 */
function facadeStyle(style, lit) {
  return canvasTex(512, 384, (x, W, H) => {
    const r = rng(style.length * 131 + 7), r2 = rng(style.length * 17 + 3);
    x.fillStyle = lit ? '#000' : '#d8d4cc'; x.fillRect(0, 0, W, H);
    const win = (wx, wy, ww, wh, p, warm = true) => {
      const on = r2() < p;
      if (lit) { if (on) { x.fillStyle = warm ? (r2() < 0.8 ? '#ffc070' : '#8fb4ff') : '#e8f0ff'; x.fillRect(wx, wy, ww, wh); } return; }
      x.fillStyle = r2() < 0.1 ? '#050607' : '#18202a'; x.fillRect(wx, wy, ww, wh);
      x.fillStyle = 'rgba(160,190,220,.22)'; x.fillRect(wx, wy, ww, wh * 0.3);
    };
    if (style === 'villa') {                                     // 서울 빌라 — 붉은 벽돌, 쇠창살 창 · 작은 욕실 창
      if (!lit) for (let row = 0; row < H / 8; row++) { const off = (row & 1) * 11; for (let b = -1; b < W / 22 + 1; b++) { const v = r(); x.fillStyle = v < 0.3 ? 'rgba(0,0,0,.14)' : v < 0.55 ? 'rgba(255,230,210,.08)' : 'rgba(0,0,0,0)'; x.fillRect(b * 22 + off, row * 8, 22, 8); x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect(b * 22 + off, row * 8, 2, 8); } x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect(0, row * 8 + 7, W, 1.5); }
      for (let fl = 0; fl < 4; fl++) for (let t = 0; t < 4; t++) {
        const wx = t * 128 + 14, wy = fl * 96 + 24;
        if (!lit) { x.fillStyle = '#e4e0d4'; x.fillRect(wx - 4, wy - 4, 64, 50); }
        win(wx, wy, 56, 42, 0.08);
        if (!lit) { x.fillStyle = 'rgba(40,40,40,.85)'; for (let k = 0; k < 7; k++) x.fillRect(wx + 4 + k * 8, wy - 2, 1.6, 46); x.fillRect(wx - 2, wy + 20, 60, 1.6); }
        if (!lit) { x.fillStyle = '#e4e0d4'; x.fillRect(wx + 76, wy + 2, 26, 22); }
        win(wx + 79, wy + 5, 20, 16, 0.05);
      }
    } else if (style === 'apt') {                                // 서울 아파트 — 층마다 통유리 발코니 · 난간 띠, 꼭대기 층 색 띠
      if (!lit) { for (let i = 0; i < 900; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.05)'; x.fillRect(r() * W, r() * H, 3, 3); } }
      for (let fl = 0; fl < 4; fl++) {
        const wy = fl * 96 + 12;
        for (let s2 = 0; s2 < 16; s2++) win(s2 * 32 + 3, wy, 26, 54, 0.12);
        if (!lit) { x.fillStyle = 'rgba(230,230,224,.95)'; x.fillRect(0, wy + 54, W, 16); x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, wy + 70, W, 3); x.fillStyle = 'rgba(200,200,196,.9)'; for (let s2 = 0; s2 < 16; s2++) x.fillRect(s2 * 32, wy, 3, 54); }
      }
      if (!lit) { x.fillStyle = '#3a6aa0'; x.fillRect(0, 2, W, 6); }
    } else if (style === 'tile') {                               // 도쿄 타일 빌딩 — 작은 네모 타일, 알루미늄 띠창
      if (!lit) { x.fillStyle = 'rgba(0,0,0,.12)'; for (let k = 0; k < W; k += 12) x.fillRect(k, 0, 1, H); for (let k = 0; k < H; k += 12) x.fillRect(0, k, W, 1); for (let i = 0; i < 260; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)'; x.fillRect(((r() * W / 12) | 0) * 12, ((r() * H / 12) | 0) * 12, 12, 12); } }
      for (let fl = 0; fl < 4; fl++) for (let t = 0; t < 4; t++) {
        const wx = t * 128 + 10, wy = fl * 96 + 26;
        if (!lit) { x.fillStyle = '#9aa0a8'; x.fillRect(wx - 3, wy - 3, 112, 40); }
        for (let k = 0; k < 3; k++) win(wx + k * 36, wy, 33, 34, 0.1);
      }
    } else if (style === 'mansion') {                            // 도쿄 맨션 — 발코니 · 난간 · 현관문
      if (!lit) { for (let i = 0; i < 900; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.06)'; x.fillRect(r() * W, r() * H, 3, 3); } }
      for (let fl = 0; fl < 4; fl++) for (let t = 0; t < 4; t++) {
        const wx = t * 128 + 8, wy = fl * 96 + 16;
        if (!lit) { x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(wx, wy, 112, 60); }
        win(wx + 8, wy + 6, 60, 50, 0.1); if (!lit) { x.fillStyle = '#5a4a3a'; x.fillRect(wx + 80, wy + 8, 22, 48); }
        if (!lit) { x.fillStyle = 'rgba(220,220,214,.95)'; x.fillRect(wx - 2, wy + 50, 116, 4); x.fillStyle = 'rgba(200,200,196,.9)'; for (let k = 0; k < 24; k++) x.fillRect(wx + k * 5, wy + 54, 1.5, 22); x.fillRect(wx - 2, wy + 74, 116, 3); }
      }
    } else if (style === 'shophouse') {                          // 숍하우스 — 기둥 · 높은 덧문 창 · 층마다 장식 처마
      if (!lit) {
        for (let i = 0; i < 40; i++) { const sx = r() * W, sy = r() * H * 0.6, len = 40 + r() * 120; const gr = x.createLinearGradient(0, sy, 0, sy + len); gr.addColorStop(0, 'rgba(0,0,0,.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(sx, sy, 4 + r() * 8, len); }
        x.fillStyle = 'rgba(255,255,250,.55)'; for (let t = 0; t <= 4; t++) x.fillRect(t * 128 - 5, 0, 10, H);
        for (let fl = 0; fl < 4; fl++) { x.fillStyle = 'rgba(255,255,250,.6)'; x.fillRect(0, fl * 96 + 2, W, 6); x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, fl * 96 + 8, W, 3); }
      }
      for (let fl = 0; fl < 4; fl++) for (let t = 0; t < 4; t++) for (let k = 0; k < 2; k++) {
        const wx = t * 128 + 20 + k * 52, wy = fl * 96 + 18, open = r() < 0.4;
        if (!lit) { x.fillStyle = 'rgba(255,255,250,.7)'; x.beginPath(); x.ellipse(wx + 18, wy + 4, 20, 8, 0, Math.PI, 0); x.fill(); }
        if (open) win(wx, wy, 36, 62, 0.12);
        else if (!lit) { const sc = ['#3f5a4a', '#5a3a2a', '#2f4a5a', '#6a5a3a'][(t + fl) % 4]; x.fillStyle = sc; x.fillRect(wx, wy, 36, 62); x.fillStyle = 'rgba(0,0,0,.35)'; for (let q = 0; q < 62; q += 5) x.fillRect(wx, wy + q, 36, 1.6); x.fillRect(wx + 17, wy, 2, 62); }
      }
    } else if (style === 'sandstone') {                          // 흙벽돌 · 회반죽 — 작은 창, 나무 격자 발코니(마슈라비야), 얼룩
      if (!lit) {
        for (let i = 0; i < 1400; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,240,210,.06)' : 'rgba(60,40,20,.07)'; x.fillRect(r() * W, r() * H, 2 + r() * 5, 2 + r() * 4); }
        for (let i = 0; i < 26; i++) { const sx = r() * W, sy = r() * H * 0.7, len = 30 + r() * 110; const gr = x.createLinearGradient(0, sy, 0, sy + len); gr.addColorStop(0, 'rgba(70,45,20,.22)'); gr.addColorStop(1, 'rgba(70,45,20,0)'); x.fillStyle = gr; x.fillRect(sx, sy, 3 + r() * 6, len); }
      }
      for (let fl = 0; fl < 4; fl++) for (let t = 0; t < 4; t++) {
        const wx = t * 128 + 20 + ((r() * 30) | 0), wy = fl * 96 + 26, bal = r() < 0.3;
        if (bal) {
          if (!lit) { x.fillStyle = '#5a3a22'; x.fillRect(wx - 6, wy - 6, 66, 62); x.fillStyle = 'rgba(0,0,0,.55)'; for (let a = 0; a < 66; a += 6) for (let b = 0; b < 62; b += 6) if ((a + b) % 12) x.fillRect(wx - 6 + a + 1, wy - 6 + b + 1, 4, 4); }
          else if (r2() < 0.25) { x.fillStyle = '#c87a30'; for (let a = 0; a < 66; a += 6) for (let b = 0; b < 62; b += 6) if ((a + b) % 12) x.fillRect(wx - 6 + a + 1, wy - 6 + b + 1, 4, 4); }
        } else {
          if (!lit) { x.fillStyle = 'rgba(255,245,225,.35)'; x.fillRect(wx - 4, wy - 4, 38, 50); }
          win(wx, wy, 30, 42, 0.12);
          if (!lit) { x.fillStyle = 'rgba(30,24,18,.8)'; for (let k = 0; k < 4; k++) x.fillRect(wx + 3 + k * 8, wy, 1.6, 42); }
        }
      }
    } else if (style === 'palazzo') {                            // 베네치아 팔라초 — 벗겨진 회반죽 아래 벽돌, 뾰족 아치 창, 초록 덧문
      if (!lit) {
        for (let i = 0; i < 40; i++) { const bx = r() * W, by = r() * H, bw = 20 + r() * 60, bh2 = 10 + r() * 30; x.fillStyle = 'rgba(140,60,40,.35)'; x.fillRect(bx, by, bw, bh2); x.fillStyle = 'rgba(0,0,0,.18)'; for (let q = 0; q < bh2; q += 6) x.fillRect(bx, by + q, bw, 1); }
        for (let i = 0; i < 900; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)'; x.fillRect(r() * W, r() * H, 3, 3); }
        x.fillStyle = 'rgba(30,50,40,.35)'; x.fillRect(0, H - 14, W, 14);                     // 물때
      }
      for (let fl = 0; fl < 4; fl++) for (let t = 0; t < 4; t++) for (let k = 0; k < 2; k++) {
        const wx = t * 128 + 18 + k * 52, wy = fl * 96 + 24;
        if (!lit) { x.fillStyle = 'rgba(240,232,214,.85)'; x.beginPath(); x.moveTo(wx - 4, wy + 60); x.lineTo(wx - 4, wy + 14); x.quadraticCurveTo(wx + 16, wy - 14, wx + 36, wy + 14); x.lineTo(wx + 36, wy + 60); x.fill(); }
        if (r() < 0.55) {
          if (!lit) { x.fillStyle = '#2f5a3a'; x.fillRect(wx, wy + 12, 32, 46); x.fillStyle = 'rgba(0,0,0,.35)'; for (let q = 12; q < 58; q += 4) x.fillRect(wx, wy + q, 32, 1.4); x.fillRect(wx + 15, wy + 12, 2, 46); }
        } else win(wx, wy + 8, 32, 50, 0.14);
        if (!lit && fl > 0 && k === 0 && t % 2 === 0) { x.fillStyle = 'rgba(240,232,214,.9)'; x.fillRect(wx - 8, wy + 58, 100, 5); x.fillStyle = 'rgba(200,190,170,.9)'; for (let q = 0; q < 100; q += 7) x.fillRect(wx - 8 + q, wy + 63, 3, 14); }
      }
    } else if (style === 'nordic') {                             // 아이슬란드 — 골함석 벽, 흰 테 창, 지붕 밑 처마
      if (!lit) { for (let k = 0; k < W; k += 8) { const gr = x.createLinearGradient(k, 0, k + 8, 0); gr.addColorStop(0, 'rgba(0,0,0,.2)'); gr.addColorStop(0.5, 'rgba(255,255,255,.14)'); gr.addColorStop(1, 'rgba(0,0,0,.2)'); x.fillStyle = gr; x.fillRect(k, 0, 8, H); } for (let i = 0; i < 30; i++) { x.fillStyle = 'rgba(120,60,30,.18)'; x.fillRect(r() * W, r() * H, 2 + r() * 4, 10 + r() * 40); } }
      for (let fl = 0; fl < 4; fl++) for (let t = 0; t < 4; t++) {
        const wx = t * 128 + 34, wy = fl * 96 + 22;
        if (!lit) { x.fillStyle = '#f0eee8'; x.fillRect(wx - 6, wy - 6, 60, 62); }
        win(wx, wy, 48, 50, 0.16);
        if (!lit) { x.fillStyle = '#f0eee8'; x.fillRect(wx + 22, wy, 4, 50); x.fillRect(wx, wy + 22, 48, 4); }
      }
    } else if (style === 'module') {                             // 남극 연구동 — 단열 패널 이음, 작은 둥근 창, 경고 띠
      if (!lit) { x.fillStyle = 'rgba(0,0,0,.22)'; for (let k = 0; k < W; k += 64) x.fillRect(k, 0, 2, H); for (let k = 0; k < H; k += 96) x.fillRect(0, k, W, 2); for (let i = 0; i < 500; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)'; x.fillRect(r() * W, r() * H, 3, 3); } }
      for (let fl = 0; fl < 4; fl++) for (let t = 0; t < 8; t++) {
        const cx = t * 64 + 32, cy = fl * 96 + 44;
        if (!lit) { x.fillStyle = '#c8ccd0'; x.beginPath(); x.arc(cx, cy, 15, 0, 6.283); x.fill(); }
        const on = r2() < 0.2;
        x.fillStyle = lit ? (on ? '#f4f0e0' : '#000') : '#1a2430'; x.beginPath(); x.arc(cx, cy, 11, 0, 6.283); x.fill();
      }
      if (!lit) for (let k = 0; k < W; k += 24) { x.fillStyle = (k / 24) % 2 ? '#1a1a1a' : '#e8c020'; x.beginPath(); x.moveTo(k, H - 10); x.lineTo(k + 12, H - 10); x.lineTo(k + 24, H); x.lineTo(k + 12, H); x.fill(); }
    } else if (style === 'hdb') {                                // 싱가포르 HDB — 층마다 복도 띠(문 · 등), 위로 창, 색 판
      if (!lit) { for (let i = 0; i < 700; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.05)'; x.fillRect(r() * W, r() * H, 3, 3); } x.fillStyle = '#c86a4a'; x.fillRect(250, 0, 22, H); x.fillStyle = '#5a9a7a'; x.fillRect(0, 0, 14, H); }
      for (let fl = 0; fl < 4; fl++) {
        const wy = fl * 96;
        for (let s2 = 0; s2 < 8; s2++) win(s2 * 64 + 12, wy + 10, 40, 26, 0.12);
        if (lit) { for (let s2 = 0; s2 < 8; s2++) if (r2() < 0.75) { x.fillStyle = '#f2f6e8'; x.fillRect(s2 * 64 + 28, wy + 50, 10, 3); x.fillStyle = 'rgba(240,244,220,.35)'; x.fillRect(s2 * 64 + 4, wy + 53, 56, 26); } }
        else { x.fillStyle = 'rgba(20,24,26,.85)'; x.fillRect(0, wy + 50, W, 30); x.fillStyle = '#6a5a4a'; for (let s2 = 0; s2 < 8; s2++) x.fillRect(s2 * 64 + 24, wy + 56, 16, 24); x.fillStyle = 'rgba(235,235,228,.95)'; x.fillRect(0, wy + 70, W, 12); }
      }
    }
  });
}
const FACADE_STYLES = ['villa', 'apt', 'tile', 'mansion', 'shophouse', 'hdb', 'sandstone', 'palazzo', 'nordic', 'module'];
function makeFacadeMats(std) {
  for (const st of FACADE_STYLES) {
    const a = facadeStyle(st, false), l = facadeStyle(st, true);
    MAT['f_' + st] = std({ map: a, normalMap: normalFrom(a.image, 1.6), vertexColors: true, roughness: 0.85, emissive: 0xffffff, emissiveMap: l, emissiveIntensity: 0.95, envMapIntensity: 0.4 });   // 불 켜진 창 — 총구 불꽃보다 밝지 않게
  }
}
/* 간판 — 도시의 글자 · 색으로 그린 판 모음(가로 48 · 세로 16). 켜진 판은 스스로 빛난다 */
const SIGN_COLS = {
  seoul: [['#f4f1e8', '#c8202a'], ['#c8202a', '#ffffff'], ['#1a4aa0', '#ffffff'], ['#f2c21a', '#1a1a1a'], ['#1a8a4a', '#ffffff'], ['#ffffff', '#1a4aa0'], ['#e8641a', '#ffffff'], ['#6a2a8a', '#ffe060']],
  tokyo: [['#f8f6f0', '#1a1a1a'], ['#c81a1a', '#ffffff'], ['#f8f6f0', '#c81a1a'], ['#1a1a2a', '#f2d24a'], ['#f2d24a', '#1a1a1a'], ['#1a6aa0', '#ffffff']],
  bangkok: [['#f2c21a', '#a01a1a'], ['#1a8a4a', '#ffffff'], ['#c81a1a', '#f2e21a'], ['#ffffff', '#1a4aa0'], ['#e8641a', '#ffffff'], ['#2a2a7a', '#f2c21a']],
  singapore: [['#ffffff', '#c81a1a'], ['#1a6a4a', '#ffffff'], ['#c81a1a', '#f8e8b0'], ['#f8f0d8', '#1a3a6a'], ['#1a3a6a', '#ffffff'], ['#f2c21a', '#1a1a1a']],
  base: [['#3a4a2a', '#e8e4d0'], ['#e8e4d0', '#1a1a1a']],
  varanasi: [['#f2c21a', '#a01a1a'], ['#e8641a', '#ffffff'], ['#1a6aa0', '#ffffff'], ['#ffffff', '#c81a1a'], ['#1a8a4a', '#ffffff'], ['#c81a6a', '#ffffff']],
  cairo: [['#ffffff', '#1a6a3a'], ['#1a6a3a', '#ffffff'], ['#c81a1a', '#ffffff'], ['#f2d24a', '#1a1a1a'], ['#1a3a8a', '#ffffff']],
  venice: [['#1a1a1a', '#e8d8a0'], ['#6a1a1a', '#f0e8d0'], ['#f0e8d0', '#3a2a1a'], ['#1a3a2a', '#f0e8d0']],
  reykjavik: [['#ffffff', '#1a3a6a'], ['#1a3a6a', '#ffffff'], ['#c81a1a', '#ffffff'], ['#1a1a1a', '#f2d24a']],
  antarctic: [['#e8c020', '#1a1a1a'], ['#ffffff', '#c81a1a'], ['#1a3a6a', '#ffffff']],
  mars: [['#e8641a', '#ffffff'], ['#ffffff', '#1a1a1a'], ['#1a3a6a', '#ffffff']],
  istanbul: [['#c81a1a', '#ffffff'], ['#ffffff', '#c81a1a'], ['#1a3a6a', '#f2d24a'], ['#f2d24a', '#1a1a1a']],
  rio: [['#1a8a3a', '#f2d24a'], ['#f2d24a', '#1a3a8a'], ['#ffffff', '#1a8a3a'], ['#e8641a', '#ffffff']],
  moscow: [['#c81a1a', '#ffffff'], ['#ffffff', '#1a3a8a'], ['#1a3a8a', '#ffffff'], ['#2a2a2a', '#e0b020']],
  nairobi: [['#1a8a3a', '#ffffff'], ['#c81a1a', '#ffffff'], ['#f2d24a', '#1a1a1a'], ['#1a1a1a', '#f2d24a']],
};
function ensureSignMats(w) {
  const key = w.theme.key;
  if (MAT['sign_' + key]) return;
  const words = (KIT[key] && KIT[key].words) || w.theme.signs || ['—'];
  const C = SIGN_COLS[key] || SIGN_COLS.seoul;
  const tex = canvasTex(1024, 1024, (x) => {
    const r = rng(key.length * 97);
    x.fillStyle = '#000'; x.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 48; i++) {
      const cx = (i % 4) * 256, cy = Math.floor(i / 4) * 64, [bg, fg] = C[(r() * C.length) | 0], word = words[(r() * words.length) | 0];
      x.fillStyle = bg; x.fillRect(cx + 2, cy + 3, 252, 58);
      x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 3; x.strokeRect(cx + 4, cy + 5, 248, 54);
      x.fillStyle = fg; x.font = `900 ${word.length > 6 ? 30 : 40}px ${LCF}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(word, cx + 128, cy + 34, 236);
      if (r() < 0.4) { x.font = '700 14px ' + LCF; x.fillText(['☎ 02-' + ((r() * 9000 + 1000) | 0), 'OPEN 24', '★★★', '2F', '3F'][(r() * 5) | 0], cx + 210, cy + 52); }
    }
    for (let i = 0; i < 16; i++) {                                // 세로 간판
      const cx = i * 64, cy = 768, [bg, fg] = C[(r() * C.length) | 0], word = words[(r() * words.length) | 0];
      x.fillStyle = bg; x.fillRect(cx + 4, cy + 2, 56, 252);
      x.fillStyle = fg; x.font = '900 34px ' + LCF; x.textAlign = 'center'; x.textBaseline = 'middle';
      const chars = [...word].slice(0, 5);
      chars.forEach((ch, k) => x.fillText(ch, cx + 32, cy + 30 + k * (220 / Math.max(1, chars.length - 0.2)), 54));
    }
  });
  tex.anisotropy = 8;
  MAT['sign_' + key] = enhanceNew(new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9, roughness: 0.35 }));
  MAT['signOff_' + key] = enhanceNew(new THREE.MeshStandardMaterial({ map: tex, color: 0x6a6a6a, roughness: 0.5 }));
}
/** 간판 판 하나 — 벽 위 (u0..u1, y0..y1), 무늬 칸 cell */
function signQuad(B, ax, az, bx, bz, n, u0, u1, y0, y1, cell, vertical, out = 0.8) {
  const L = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / L, tz = (bz - az) / L, ox = n[0] * out, oz = n[2] * out;
  const p = u => [ax + tx * u + ox, az + tz * u + oz];
  const a = p(u0), b = p(u1);
  let U0, U1, V0, V1;
  if (vertical) { U0 = (cell % 16) * 64 / 1024; U1 = U0 + 64 / 1024; V1 = 1 - 768 / 1024; V0 = 0; }
  else { const c = cell % 48; U0 = (c % 4) * 0.25; U1 = U0 + 0.25; V1 = 1 - Math.floor(c / 4) * 64 / 1024; V0 = V1 - 64 / 1024; }
  if (vertical) B.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], n, [[U0, V0], [U1, V0], [U1, V1], [U0, V1]]);
  else B.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], n, [[U0, V0], [U1, V0], [U1, V1], [U0, V1]]);
}
/** 도시별 간판 붙이기 */
function signBoards(get, w, x, y, ax, az, bx, bz, n, floors, outside) {
  const key = w.theme.key, hs = (Math.imul(x * 2654435761 ^ y * 1597334677, 3266489917) >>> 0);
  const L = Math.hypot(bx - ax, bz - az), on = k => get(((hs >>> k) % 10) < 7 ? 'sign_' + key : 'signOff_' + key);
  const street = outside === D_SIDEWALK || outside === D_PLAZA;
  if (key === 'seoul') {
    if (street) signQuad(on(1), ax, az, bx, bz, n, 2, L - 2, FLOOR_PX + 1, FLOOR_PX + 10, hs % 48);
    for (let f = 1; f < Math.min(floors, 4); f++) if (((hs >>> (f * 3)) & 7) < 4) signQuad(on(f + 2), ax, az, bx, bz, n, 3, L - 3, f * FLOOR_PX + 12, f * FLOOR_PX + 21, (hs >>> f) % 48);
  } else if (key === 'tokyo') {
    if (street && hs % 2) signQuad(on(1), ax, az, bx, bz, n, 4, L - 4, FLOOR_PX + 1, FLOOR_PX + 9, hs % 48);
    if (floors >= 3 && hs % 3 !== 1) { const u = 3 + (hs >>> 5) % 30; signQuad(on(4), ax, az, bx, bz, n, u, u + 9, FLOOR_PX + 4, FLOOR_PX * Math.min(floors, 4) - 4, (hs >>> 3) % 16, true, 1.4); }
  } else if (key === 'bangkok' || key === 'varanasi') {
    if (street && hs % 3 !== 0) signQuad(on(1), ax, az, bx, bz, n, 5, L - 5, FLOOR_PX + 1, FLOOR_PX + 8, hs % 48);
    if (floors >= 3 && hs % 5 === 2) signQuad(on(3), ax, az, bx, bz, n, 6, 15, FLOOR_PX + 6, FLOOR_PX * 2 + 20, (hs >>> 3) % 16, true, 1.2);
  } else if (key === 'singapore') {
    if (street) signQuad(on(1), ax, az, bx, bz, n, 3, L - 3, FLOOR_PX + 1, FLOOR_PX + 8, hs % 48);
  } else if (street && hs % 3 === 0) signQuad(on(1), ax, az, bx, bz, n, 6, L - 6, FLOOR_PX + 1, FLOOR_PX + 8, hs % 48);
}
/** 도시별 옥상의 상징 — 서울 네온 십자가 · 도쿄 광고판 · 방콕 함석 판잣집 */
function roofIcon(get, w, X0, Z0, h, hh, marks) {
  const key = w.theme.key;
  if (key === 'seoul' && hh % 23 === 7) {
    const cx = X0 + 24, cz = Z0 + 24, M = get('cross');
    roofBox(get('metal'), cx - 1, cz - 1, 2, 2, h, 18);
    roofBox(M, cx - 1.6, cz - 1.6, 3.2, 3.2, h + 18, 34);
    roofBox(M, cx - 9, cz - 1.6, 18, 3.2, h + 40, 3.2);
    marks.push({ x: cx, y: h + 40, z: cz, r: 260, c: [1.0, 0.12, 0.1], k: 1.6, glow: 40 });
    return true;
  }
  if (key === 'tokyo' && hh % 19 === 4) {
    const M = get('metal');
    for (const dx of [6, 40]) roofBox(M, X0 + dx, Z0 + 30, 2, 2, h, 26);
    const P = get('sign_' + key), cell = hh % 48, U0 = (cell % 4) * 0.25, V1 = 1 - Math.floor(cell / 4) * 64 / 1024;
    P.quad([X0 + 2, h + 24, Z0 + 32], [X0 + 46, h + 24, Z0 + 32], [X0 + 46, h + 46, Z0 + 32], [X0 + 2, h + 46, Z0 + 32], [0, 0, 1], [[U0, V1 - 0.0625], [U0 + 0.25, V1 - 0.0625], [U0 + 0.25, V1], [U0, V1]]);
    marks.push({ x: X0 + 24, y: h + 30, z: Z0 + 50, r: 180, c: [1, 0.9, 0.85], k: 1.0 });
    return true;
  }
  if (key === 'varanasi' && hh % 7 === 2) {                       // 검은 물탱크와 빨랫줄
    cylB(get('fan'), X0 + 16, Z0 + 16, 7, h, h + 14, 10);
    roofBox(get('metal'), X0 + 26, Z0 + 30, 18, 0.6, h + 14, 0.6);
    for (let q = 0; q < 4; q++) roofBox(get('awning' + ((hh >>> q) % 6)), X0 + 27 + q * 4, Z0 + 30, 3, 0.4, h + 6, 8);
    return true;
  }
  if (key === 'cairo' && hh % 5 === 1) {                          // 위성 안테나 떼
    for (let q = 0; q < 2 + (hh >>> 4) % 3; q++) { const ax = X0 + 8 + q * 11, az = Z0 + 14 + ((hh >>> (q * 3)) % 14); roofBox(get('metal'), ax, az, 1.2, 1.2, h, 8); get('paint').quad([ax - 5, h + 6, az + 4], [ax + 6, h + 6, az + 4], [ax + 6, h + 15, az - 2], [ax - 5, h + 15, az - 2], [0, 0.55, 0.83], [[0, 0], [1, 0], [1, 1], [0, 1]]); }
    return true;
  }
  if (key === 'cairo' && hh % 9 === 4) {                          // 동네 사원 — 작은 돔과 가는 첨탑(미나렛)
    const cx = X0 + 24, cz = Z0 + 24, S = get('ledge'), sand = lin('#c2a272'), dome = lin('#6c8a8a');
    roofBox(S, cx - 10, cz - 10, 20, 20, h, 8, sand); cylB(get('ledge'), cx, cz, 9, h + 8, h + 11, 12, true, sand);
    for (let q = 0; q < 5; q++) { const r = 9 * Math.cos(q / 5 * Math.PI / 2), r2 = 9 * Math.cos((q + 1) / 5 * Math.PI / 2); cylB(get('ledge'), cx, cz, (r + r2) / 2 + 0.5, h + 11 + q * 1.8, h + 12.8 + q * 1.8, 12, q === 4, dome); }
    if (hh % 27 === 4) { roofBox(S, X0 + 38, Z0 + 6, 5, 5, h, 46, sand); roofBox(S, X0 + 37, Z0 + 5, 7, 7, h + 34, 2.5, sand); roofBox(S, X0 + 39.5, Z0 + 7.5, 2, 2, h + 46, 7, dome);
      marks.push({ x: X0 + 40.5, y: h + 36, z: Z0 + 8.5, r: 120, c: [0.4, 1, 0.55], k: 1.0, glow: 18 }); }
    return true;
  }
  if (key === 'varanasi' && hh % 11 === 6) {                      // 집 위의 작은 사당 — 층층이 좁아지는 첨탑과 주황 깃발
    const cx = X0 + 24, cz = Z0 + 24, S = get('ledge'), stn = lin('#d8a070'), stn2 = lin('#b07850');
    for (let q = 0; q < 6; q++) { const r = 10 - q * 1.5; roofBox(S, cx - r, cz - r, r * 2, r * 2, h + q * 5, 5, q % 2 ? stn2 : stn); }
    roofBox(get('metal'), cx - 0.5, cz - 0.5, 1, 1, h + 30, 16);
    get('awning0').quad([cx + 0.5, h + 40, cz], [cx + 12, h + 37, cz], [cx + 12, h + 32, cz], [cx + 0.5, h + 34, cz], [0, 0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    marks.push({ x: cx, y: h + 8, z: cz + 12, r: 90, c: [1, 0.6, 0.25], k: 0.9 });
    return true;
  }
  if (key === 'venice' && hh % 3 === 1) {                         // 베네치아 굴뚝(깔때기 모양 카미노)
    for (let q = 0; q < 1 + (hh >>> 3) % 2; q++) { const cx = X0 + 12 + q * 22, cz = Z0 + 14 + ((hh >>> (q * 4)) % 18); roofBox(get('ledge'), cx - 2.5, cz - 2.5, 5, 5, h, 14, lin('#9a4a32')); cylB(get('ledge'), cx, cz, 5, h + 14, h + 20, 8, true, lin('#7a3a28')); }
    return true;
  }
  if (key === 'bangkok' && hh % 13 === 5) {
    roofBox(get('rust'), X0 + 6, Z0 + 8, 30, 22, h, 14);
    get('rust').quad([X0 + 4, h + 16, Z0 + 6], [X0 + 4, h + 13, Z0 + 32], [X0 + 38, h + 13, Z0 + 32], [X0 + 38, h + 16, Z0 + 6], [0, 1, 0], [[0, 0], [0, 1], [1, 1], [1, 0]]);
    return true;
  }
  return false;
}
/** 원기둥(옆면 + 윗면) — 물탱크 · 환기통 */
function cylB(B, cx, cz, r, y0, y1, seg = 10, cap = true, color = null) {
  for (let i = 0; i < seg; i++) {
    const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2, am = (a0 + a1) / 2;
    const p0 = [cx + Math.cos(a0) * r, cz + Math.sin(a0) * r], p1 = [cx + Math.cos(a1) * r, cz + Math.sin(a1) * r];
    B.quad([p1[0], y0, p1[1]], [p0[0], y0, p0[1]], [p0[0], y1, p0[1]], [p1[0], y1, p1[1]], [Math.cos(am), 0, Math.sin(am)], [[i / seg, 0], [(i + 1) / seg, 0], [(i + 1) / seg, 1], [i / seg, 1]], color);
    if (cap) B.quad([cx, y1, cz], [p1[0], y1, p1[1]], [p0[0], y1, p0[1]], [cx, y1, cz], [0, 1, 0], [[0.5, 0.5], [1, 0], [0, 0], [0.5, 0.5]], color);
  }
}
/** 옥상 한 칸의 설비 — 실외기 · 환기구 · 물탱크 · 채광창 · 계단실 · 안테나 · 태양광 */
function roofStuff(get, X0, Z0, h, hh) {
  const R = get('rooftop'), M = get('metal'), k = hh % 23;
  const jx = (hh >>> 5) % 10, jz = (hh >>> 9) % 10;
  if (k < 4) {                                                  // 실외기 줄 — 위에 팬 구멍
    for (let i = 0; i < 2 + (k & 1); i++) { const ax = X0 + 4 + i * 14, az = Z0 + 8 + jz; roofBox(R, ax, az, 12, 10, h, 8); get('fan').quad([ax + 2, h + 8.05, az + 1.5], [ax + 2, h + 8.05, az + 8.5], [ax + 10, h + 8.05, az + 8.5], [ax + 10, h + 8.05, az + 1.5], [0, 1, 0], [[0, 0], [0, 1], [1, 1], [1, 0]]); }
  } else if (k < 6) {                                           // 물탱크 — 다리 넷 위의 원통
    const cx = X0 + 24, cz = Z0 + 24;
    for (const [a, b] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) roofBox(M, cx + a - 1, cz + b - 1, 2, 2, h, 12);
    cylB(R, cx, cz, 11, h + 12, h + 34, 12);
    cylB(M, cx, cz, 2, h + 34, h + 37, 6);
  } else if (k < 8) {                                           // 채광창 — 몇 개는 안에 불이 남아 있다
    roofBox(R, X0 + 10 + jx, Z0 + 12, 22, 16, h, 3);
    get(k === 6 && (hh >>> 3) % 3 === 0 ? 'skyOn' : 'skyOff').quad([X0 + 12 + jx, h + 3.05, Z0 + 14], [X0 + 12 + jx, h + 3.05, Z0 + 26], [X0 + 30 + jx, h + 3.05, Z0 + 26], [X0 + 30 + jx, h + 3.05, Z0 + 14], [0, 1, 0], [[0, 0], [0, 1], [1, 1], [1, 0]]);
  } else if (k < 10) {                                          // 환기통 몇 개
    for (let i = 0; i < 3; i++) cylB(M, X0 + 10 + i * 13 + (jx & 3), Z0 + 14 + ((hh >>> (i * 3)) % 18), 2.4, h, h + 6 + i * 2, 8);
  } else if (k === 10) {                                        // 계단실 — 문
    roofBox(R, X0 + 8, Z0 + 10, 30, 24, h, 26);
    get('door').quad([X0 + 18, h, Z0 + 34.05], [X0 + 28, h, Z0 + 34.05], [X0 + 28, h + 18, Z0 + 34.05], [X0 + 18, h + 18, Z0 + 34.05], [0, 0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  } else if (k === 11) {                                        // 안테나
    roofBox(M, X0 + 22, Z0 + 22, 2, 2, h, 46); roofBox(M, X0 + 14, Z0 + 22, 18, 1.5, h + 38, 1.5); roofBox(M, X0 + 17, Z0 + 22, 12, 1.5, h + 30, 1.5);
  } else if (k < 14) {                                          // 태양광 판 — 비스듬히
    for (let i = 0; i < 2; i++) { const z = Z0 + 6 + i * 20; get('solar').quad([X0 + 6, h + 2, z + 14], [X0 + 42, h + 2, z + 14], [X0 + 42, h + 9, z], [X0 + 6, h + 9, z], [0, 0.89, 0.45], [[0, 0], [3, 0], [3, 1], [0, 1]]); }
  } else if (k < 16) {                                          // 낮은 설비 상자 + 배관
    roofBox(R, X0 + 6 + jx, Z0 + 6, 18, 14, h, 6); roofBox(M, X0 + 24 + jx, Z0 + 11, 20, 2.5, h + 2, 2.5);
  }
}
function bankWalls(w, B, x, y, X0, Z0, X1, Z1) {
  const dry = (dx, dy) => w.deco[w.idx(x + dx, y + dy)] !== D_WATER && w.deco[w.idx(x + dx, y + dy)] !== D_BRIDGE;
  if (dry(0, -1)) wallQuad(B, X1, Z0, X0, Z0, -8, 0, [0, 0, 1], null, 0);
  if (dry(0, 1)) wallQuad(B, X0, Z1, X1, Z1, -8, 0, [0, 0, -1], null, 0);
  if (dry(-1, 0)) wallQuad(B, X0, Z0, X0, Z1, -8, 0, [1, 0, 0], null, 0);
  if (dry(1, 0)) wallQuad(B, X1, Z1, X1, Z0, -8, 0, [-1, 0, 0], null, 0);
}
/** 랜드마크의 막힌 칸 — 돌담 · 기단. 랜드마크마다 높이를 다르게 */
const LM_H = { palace: 44, tower: 30, scramble: 70, lattice: 26, temple: 40, prang: 60, monument: 50, market: 22, checkpoint: 14, railyard: 30, gas: 26, hawker: 18, grove: 10, port: 34, base: 30 };
function lmAt(w, x, y) {
  for (const lm of w.landmarks) {
    const ox = Math.round((lm.ox || 0) / TILE), oy = Math.round((lm.oy || 0) / TILE);
    const mx = ((x - lm.x - ox) % w.w + w.w) % w.w, my = ((y - lm.y - oy) % w.h + w.h) % w.h;
    if (mx < lm.w && my < lm.h) return lm;
  }
  return null;
}
function lmBlock(B, w, x, y, X0, Z0, X1, Z1) {
  const lm = lmAt(w, x, y), h = lm ? lmTileH(lm, w, x, y) : 30;
  if (h > 0) roofBox(B, X0 + 1, Z0 + 1, TILE - 2, TILE - 2, 0, h);
}
/** 랜드마크의 막힌 칸 높이 — 모형이 따로 올라가는 칸은 낮은 기단(또는 0 = 모형만) */
function lmTileH(lm, w, x, y) {
  const ox = Math.round((lm.ox || 0) / TILE), oy = Math.round((lm.oy || 0) / TILE);
  const lx = ((x - lm.x - ox) % w.w + w.w) % w.w, ly = ((y - lm.y - oy) % w.h + w.h) % w.h;
  const inR = r => r && lx >= r.x - lm.x && lx < r.x - lm.x + r.w && ly >= r.y - lm.y && ly < r.y - lm.y + r.h;
  switch (lm.kind) {
    case 'palace': return inR(lm.hall) ? 10 : inR(lm.gate) ? 34 : 30;
    case 'temple': return inR(lm.hall) ? 10 : (lm.pagoda && lx >= lm.pagoda.x - lm.x && lx < lm.pagoda.x - lm.x + 2 && ly >= lm.pagoda.y - lm.y && ly < lm.pagoda.y - lm.y + 2) ? 6 : ly === lm.h - 1 ? 0 : 18;
    case 'prang': case 'tower': case 'lattice': case 'monument': case 'grove': case 'port': case 'gas': return 0;
    case 'checkpoint': case 'base': return 0;
    case 'railyard': return 0;
    case 'pyramids': case 'mosque': case 'kund': case 'mandir': case 'piazza': case 'hallgrim': case 'geyser': case 'station': case 'hagia': case 'galata': case 'redeemer': case 'copacabana': case 'biodome': case 'rocket': case 'basil': case 'kicc': return 0;
    case 'hawker': return ly === 0 ? 20 : 0;
    case 'market': return 18;
    default: return LM_H[lm.kind] || 30;
  }
}
function fencePanel(B, w, x, y, X0, Z0, X1, Z1) {
  const fence = (dx, dy) => w.grid[w.idx(x + dx, y + dy)] === T_WATER && w.deco[w.idx(x + dx, y + dy)] === D_LANDMARK;
  const H = 46, cxm = (X0 + X1) / 2, czm = (Z0 + Z1) / 2;
  if (fence(1, 0) || fence(-1, 0)) wallQuad(B, X0, czm, X1, czm, 0, H, [0, 0, 1], null, 0, 1 / 24, 1 / 24);
  if (fence(0, 1) || fence(0, -1)) wallQuad(B, cxm, Z0, cxm, Z1, 0, H, [1, 0, 0], null, 0, 1 / 24, 1 / 24);
}

/** PEND — 짓는 중인 먼 덩어리 { key, w, it }. PRIMING — 판 준비 중(브리핑 화면 뒤)엔 한 프레임 몫 제한 없이 다 만든다 */
let PEND = null, PRIMING = false;
function syncChunks(w, px, pz, all) {
  const ccx = Math.floor(px / TILE / CH), ccy = Math.floor(pz / TILE / CH);
  const need = new Set(), miss = [];
  for (let dy = -3; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) {
    const key = (ccx + dx) + ',' + (ccy + dy);
    need.add(key);
    if (!chunks.has(key)) miss.push([Math.max(Math.abs(dx), Math.abs(dy)), dx, dy, key]);
  }
  // 발밑과 바로 곁(3×3)은 곧바로 — 시작 화면이 비지 않게. 그 바깥은 가까운 것부터 하나씩 나눠 짓는다
  // (한 덩어리에 15‒40ms — 한 프레임에 지으면 걸을 때마다 멈칫했다. 앞쪽으로 세 덩어리를 미리 두므로 늦지 않는다).
  // all = 판을 시작할 때 둘레 25 덩어리를 한꺼번에(시작 화면이 떠 있는 동안)
  miss.sort((a, b) => a[0] - b[0]);
  if (PEND && (PEND.w !== w || !need.has(PEND.key))) PEND = null;     // 지나쳐 버린 덩어리는 버린다
  for (let i = 0; i < miss.length; i++) {
    const [d, dx, dy, key] = miss[i];
    if (!all && d > 1) {
      // 한 번에 하나씩, 프레임마다 3ms 만 — 다 지어지면 장면에 넣는다
      if (!PEND) PEND = { key, w, it: chunkSteps(w, ccx + dx, ccy + dy), ms: 0 };   // 이미 짓던 것이 아직 필요하면 그것부터 마저
      const t0 = performance.now(); let r;
      do r = PEND.it.next(); while (!r.done && performance.now() - t0 < 3);
      PEND.ms += performance.now() - t0;
      if (!r.done) break;
      const e = PROF.chunk || (PROF.chunk = [0, 0, 0]); e[0]++; e[1] += PEND.ms; e[2] = Math.max(e[2], performance.now() - t0);
      chunks.set(PEND.key, r.value); scene.add(r.value); MOON.dirty = true; PEND = null;
      break;
    }
    if (PEND && PEND.key === key) PEND = null;
    const t0 = performance.now(), g = buildChunk(w, ccx + dx, ccy + dy); prof('chunk', t0);
    chunks.set(key, g); scene.add(g); MOON.dirty = true;
  }
  for (const [key, g] of chunks) {
    if (need.has(key)) continue;
    const [kx, ky] = key.split(',').map(Number);
    if (Math.abs(kx - ccx) > 3 || ky - ccy > 2 || ccy - ky > 4) {
      scene.remove(g); g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); chunks.delete(key); MOON.dirty = true;
    }
  }
}
function clearChunks() {
  PEND = null;
  for (const [, g] of chunks) { scene.remove(g); g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  chunks.clear();
}


/* ═══════════ 사람 — 관절 인형 ═══════════
   앞 = +x, 위 = +y. 골반 위 '척추' 축에 몸통 · 머리 · 팔이 달려 앞으로 숙일 수 있다.
   걸음 위상(ph) · 보폭(amp) · 자세(arms)를 2D 판의 인형과 같은 값으로 받는다 */
const GEO = {};
function makeGeos() {
  GEO.torso = new THREE.CapsuleGeometry(5.2, 8, 4, 10);
  GEO.pelvis = new THREE.BoxGeometry(7, 6, 10);
  GEO.head = new THREE.SphereGeometry(4.4, 14, 10);
  GEO.hair = new THREE.SphereGeometry(4.7, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
  GEO.armU = new THREE.CapsuleGeometry(1.9, 6, 3, 6);
  GEO.armL = new THREE.CapsuleGeometry(1.7, 6, 3, 6);
  GEO.legU = new THREE.CapsuleGeometry(2.4, 7, 3, 6);
  GEO.legL = new THREE.CapsuleGeometry(2.1, 7, 3, 6);
  GEO.hand = new THREE.SphereGeometry(1.8, 8, 6);
  GEO.shoe = new THREE.BoxGeometry(6, 2.6, 3.4);
  GEO.eye = new THREE.SphereGeometry(0.75, 6, 4);
  GEO.belly = new THREE.SphereGeometry(9, 14, 10);
  GEO.box = new THREE.BoxGeometry(1, 1, 1);
  GEO.cyl = new THREE.CylinderGeometry(1, 1, 1, 12);
  GEO.wheel = new THREE.CylinderGeometry(1, 1, 1, 14);
  GEO.wheel.rotateX(Math.PI / 2);
  GEO.ico = new THREE.IcosahedronGeometry(1, 1);
  GEO.cone = new THREE.ConeGeometry(1, 1, 10);
  GEO.plane = new THREE.PlaneGeometry(1, 1);
  GEO.plane.rotateX(-Math.PI / 2);                       // 바닥에 눕힌 판
  GEO.ring = new THREE.RingGeometry(0.8, 1, 32);
  GEO.ring.rotateX(-Math.PI / 2);
}
const matCache = new Map();
function enhanceNew(m) { return enhance(m, false); }
/** 무늬 있는 재질 — 색 · 무늬 · 거칠기로 캐시 */
const matTCache = new Map();
function matT(hex, tex, rough = 0.85, k = 1, extra) {
  const key = hex + tex.uuid + rough + k + (extra ? 'x' : '');
  if (!matTCache.has(key)) { const m = new THREE.MeshStandardMaterial({ color: col(hex, k), map: tex, roughness: rough }); if (extra) extra(m); matTCache.set(key, enhanceNew(m)); }
  return matTCache.get(key);
}
/** 감염체 피부 — 빛을 받아도 하얗게 뜨지 않도록 어둡고 잿빛 초록으로 */
function deadSkin(hex) {
  const c = new THREE.Color(hex), hsl = {}; c.getHSL(hsl);
  c.setHSL(0.22 + (hsl.h - 0.08) * 0.3, hsl.s * 0.35, Math.min(0.42, hsl.l * 0.62));
  return '#' + c.getHexString(THREE.SRGBColorSpace);
}
function mat(hex, o = {}) {
  const key = hex + JSON.stringify(o);
  if (!matCache.has(key)) matCache.set(key, enhanceNew(new THREE.MeshStandardMaterial(Object.assign({ color: col(hex, o.k || 1), roughness: 0.75 }, o.k ? {} : {}, Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'k'))))));
  return matCache.get(key);
}
const EYE = new THREE.MeshBasicMaterial({ color: 0xff3020 });

function part(geo, m, x, y, z, sx = 1, sy = 1, sz = 1) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z); o.scale.set(sx, sy, sz);
  o.castShadow = true;
  return o;
}
/** look: { top, pants, skin, hair, shoes, hood, helmet, belly, sac, eyes } */
function makeHuman(look) {
  const root = new THREE.Group(), spine = new THREE.Group();
  root.add(spine); spine.position.y = 19;
  const gore = !!look.gore, CT = gore ? TEX.rags : TEX.cloth;
  const mTop = matT(look.top, CT, 0.9, gore ? 0.8 : 1), mPants = matT(look.pants, CT, 0.9, gore ? 0.8 : 1);
  const mSkin = gore ? matT(deadSkin(look.skin), TEX.zskin, 0.55) : mat(look.skin, { roughness: 0.6 }), mShoe = mat(look.shoes || '#16181b');
  root.add(part(GEO.pelvis, mPants, 0, 19, 0));
  spine.add(part(GEO.torso, mTop, 0.4, 8.6, 0, 0.82, 1, 1.18));
  const head = new THREE.Group(); head.position.set(1.2, 19.6, 0); spine.add(head);
  head.add(part(GEO.head, mSkin, 0, 0, 0, 0.94, 1.1, 0.86));
  if (look.hair) head.add(part(GEO.hair, mat(look.hair), -0.6, 0.6, 0));
  if (look.hood) head.add(part(GEO.hair, mat(look.hood), -0.4, 0.2, 0, 1.12, 1.25, 1.12));
  if (look.helmet) head.add(part(GEO.hair, mat(look.helmet, { roughness: 0.5 }), -0.3, 1.2, 0, 1.18, 1.1, 1.18));
  if (look.eyes) {
    const e1 = new THREE.Mesh(GEO.eye, EYE), e2 = new THREE.Mesh(GEO.eye, EYE);
    e1.position.set(4, 0.6, 1.5); e2.position.set(4, 0.6, -1.5); head.add(e1, e2);
    head.userData.eyes = [e1, e2];
  }
  if (look.belly) spine.add(part(GEO.belly, mat(look.belly, { roughness: 0.5 }), 3, 4, 0, 1, 1.05, 1.05));
  if (look.sac) spine.add(part(GEO.head, mat(look.sac, { roughness: 0.4, emissive: col('#304a10'), emissiveIntensity: 0.6 }), -3.5, 15, 0, 1.2, 1.2, 1.2));
  const limb = (parent, x, y, z, gu, gl, m1, m2, endGeo, endMat, lenU, lenL) => {
    const a = new THREE.Group(); a.position.set(x, y, z); parent.add(a);
    a.add(part(gu, m1, 0, -lenU / 2, 0));
    const b = new THREE.Group(); b.position.y = -lenU; a.add(b);
    b.add(part(gl, m2, 0, -lenL / 2, 0));
    if (endGeo) b.add(part(endGeo, endMat, endGeo === GEO.shoe ? 1.4 : 0, -lenL - 0.4, 0));
    return { a, b };
  };
  const mSleeve = look.sleeve ? (gore ? matT(deadSkin(look.sleeve), TEX.zskin, 0.6) : mat(look.sleeve)) : mTop;
  const armL = limb(spine, 0, 14.5, 7.2, GEO.armU, GEO.armL, mSleeve, mSkin, GEO.hand, mSkin, 9.5, 9);
  const armR = limb(spine, 0, 14.5, -7.2, GEO.armU, GEO.armL, mSleeve, mSkin, GEO.hand, mSkin, 9.5, 9);
  const legL = limb(root, 0, 19, 3, GEO.legU, GEO.legL, mPants, mPants, GEO.shoe, mShoe, 9.5, 8.6);
  const legR = limb(root, 0, 19, -3, GEO.legU, GEO.legL, mPants, mPants, GEO.shoe, mShoe, 9.5, 8.6);
  root.userData = { spine, head, armL, armR, legL, legR };
  return root;
}
/** 자세 — 2D 판의 humanRig 와 같은 뜻의 값 */
function poseHuman(h, o) {
  const u = h.userData, s = Math.sin(o.ph || 0), c = Math.cos(o.ph || 0), amp = o.amp || 0;
  u.spine.rotation.z = -(o.lean || 0) * 0.07;
  u.spine.position.y = 19 + Math.abs(c) * 0.8 * amp;
  for (const [L, sd] of [[u.legL, 1], [u.legR, -1]]) {
    const sw = sd * s * 0.62 * amp;
    L.a.rotation.z = sw;
    L.b.rotation.z = -Math.max(0, -sd * c) * 0.9 * amp - 0.05;
  }
  const arms = o.arms || 'hang', sway = o.sway || 0;
  for (const [A, sd] of [[u.armL, 1], [u.armR, -1]]) {
    A.a.rotation.set(0, 0, 0); A.b.rotation.set(0, 0, 0);
    if (arms === 'reach') { A.a.rotation.z = 1.35 + sd * sway * 0.04; A.a.rotation.x = -sd * 0.12; A.b.rotation.z = 0.15; }
    else if (arms === 'claw') { A.a.rotation.z = 1.5; A.a.rotation.x = -sd * 0.35; A.b.rotation.z = 0.35 + sd * sway * 0.03; }
    else if (arms === 'gun') {
      const m = o.melee || 0;
      A.a.rotation.z = 1.25 + m * 0.4; A.a.rotation.x = sd > 0 ? 0.55 : 0.15; A.b.rotation.z = sd > 0 ? 0.35 : 0.1;
    } else if (arms === 'swing') { A.a.rotation.z = -sd * s * 0.9 * Math.min(1, amp) + 0.25; A.b.rotation.z = 0.7; }
    else { A.a.rotation.z = sd * s * 0.45 * amp; A.a.rotation.x = -sd * 0.08; A.b.rotation.z = 0.12; }
  }
  if (o.head) { u.head.rotation.x = o.head.tilt || 0; u.head.rotation.z = o.head.nod || 0; }
}

/* ═══════════ 탈것 · 화물 ═══════════ */
function paint(hex) { return mat(hex, { roughness: 0.3, metalness: 0.45, envMapIntensity: 1.6 }); }
// 차 유리 — 먼지 낀 어두운 유리. 예전엔 거울처럼 매끈해 손전등을 받으면 총구 불꽃보다 밝게 번쩍였다
const GLASS = () => mat('#0e141c', { roughness: 0.42, metalness: 0.2, envMapIntensity: 0.55 });
function bx(g, m, x, y, z, sx, sy, sz) { const o = part(GEO.box, m, x, y, z, sx, sy, sz); o.receiveShadow = true; g.add(o); return o; }
/** 사다리꼴 상자 — 아래 면(L0 × W0)에서 위 면으로 앞 · 뒤 · 옆이 안쪽으로 기운다 (차의 객실 · 보닛) */
function taperGeo(L0, W0, H, fIn, bIn, sIn) {
  const x0 = -L0 / 2, x1 = L0 / 2, z0 = -W0 / 2, z1 = W0 / 2;
  const P = [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1], [x0 + bIn, H, z0 + sIn], [x1 - fIn, H, z0 + sIn], [x1 - fIn, H, z1 - sIn], [x0 + bIn, H, z1 - sIn]];
  const F = [[4, 5, 6, 7], [0, 3, 2, 1], [1, 2, 6, 5], [0, 4, 7, 3], [3, 7, 6, 2], [0, 1, 5, 4]];
  const pos = [];
  for (const [a, b, c, d] of F) for (const i of [a, b, c, a, c, d]) pos.push(...P[i]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return g;
}
const carGeoCache = new Map();
function carGeos(L, W) {
  const key = (L | 0) + 'x' + (W | 0);
  if (!carGeoCache.has(key)) carGeoCache.set(key, {
    body: taperGeo(L, W, 8, 2, 1.5, 1.2),
    cabin: taperGeo(L * 0.56, W * 0.86, 7.5, L * 0.13, L * 0.09, 1.6),
    glass: taperGeo(L * 0.565, W * 0.87, 6.2, L * 0.125, L * 0.085, 1.3),
  });
  return carGeoCache.get(key);
}
/** 승용차 — 비스듬한 앞유리 · 뒷유리가 있는 객실, 범퍼 · 바퀴 덮개 · 거울 · 등 */
function carBody(g, L, Wd, colr) {
  const G3 = carGeos(L, Wd), P = paint(colr);
  const body = new THREE.Mesh(G3.body, P); body.position.y = 4; body.castShadow = body.receiveShadow = true; g.add(body);
  const cab = new THREE.Mesh(G3.cabin, P); cab.position.set(-L * 0.05, 11.6, 0); cab.castShadow = true; g.add(cab);
  const gl = new THREE.Mesh(G3.glass, GLASS()); gl.position.set(-L * 0.05, 11.7, 0); g.add(gl);
  const trim = mat('#121416', { roughness: 0.6 });
  bx(g, trim, L / 2 + 0.4, 5.2, 0, 1.4, 2.6, Wd * 0.96); bx(g, trim, -L / 2 - 0.4, 5.2, 0, 1.4, 2.6, Wd * 0.96);   // 범퍼
  for (const sd of [-1, 1]) bx(g, trim, L * 0.12, 13, sd * (Wd / 2 + 0.8), 2, 1.6, 1.6);                         // 거울
  bx(g, mat('#fff4d0', { emissive: col('#fff4d0'), emissiveIntensity: 0.15 }), L / 2 + 0.1, 9, Wd * 0.32, 0.6, 2.2, 4);
  bx(g, mat('#fff4d0', { emissive: col('#fff4d0'), emissiveIntensity: 0.15 }), L / 2 + 0.1, 9, -Wd * 0.32, 0.6, 2.2, 4);
  bx(g, mat('#c02018', { emissive: col('#c02018'), emissiveIntensity: 0.5 }), -L / 2 - 0.1, 9.5, Wd * 0.33, 0.6, 2, 4);
  bx(g, mat('#c02018', { emissive: col('#c02018'), emissiveIntensity: 0.5 }), -L / 2 - 0.1, 9.5, -Wd * 0.33, 0.6, 2, 4);
  wheelsOn(g, [-L * 0.32, L * 0.32], Wd / 2 - 1.5, 4.4);
}
function wheelsOn(g, xs, hz, r) { const m = mat('#0d0e10', { roughness: 0.9 }); for (const x of xs) for (const sd of [-1, 1]) g.add(part(GEO.wheel, m, x, r, sd * hz, r, r, 3)); }
let propSeq = 0, HEAD_M = null, BLINK_M = null, HEAD_BEAM_M = null;
const HEAD_C = new THREE.Color(1, 0.93, 0.8), BLINK_C = new THREE.Color(1, 0.55, 0.1);
const ALARM_C = new THREE.Color(1, 0.62, 0.18), ALARM_LED_M = new THREE.MeshBasicMaterial({ color: 0xff2010 });
function makeProp(pr) {
  const g = new THREE.Group(), L = pr.w, Wd = pr.h, k = pr.kind;
  // 다섯 대 중 하나 꼴로 불타는 잔해 — 그을린 차체, 유리 없음, 위에 불
  const burn = (k === 'car' || k === 'bus' || k === 'humvee') && ((Math.imul(++propSeq, 2654435761) >>> 0) % 100) < 18;
  if (burn) {
    const ch = mat('#1b1816', { roughness: 0.9 }), rust = mat('#3a2418', { roughness: 0.95 });
    const hgt = k === 'bus' ? 26 : 9;
    bx(g, ch, 0, hgt / 2 + 4, 0, L, hgt, Wd);
    if (k !== 'bus') bx(g, rust, -L * 0.06, 15, 0, L * 0.5, 6, Wd * 0.84);
    wheelsOn(g, [-L * 0.32, L * 0.32], Wd / 2 - 1, 3.4);
    g.userData.fire = (propSeq * 0.618) % 1 + 0.01;
    return g;
  }
  if (k === 'car') {
    // 일곱 대 중 하나는 전조등이 켜진 채 버려졌다 — 비상등이 깜빡이고 앞길에 빛이 퍼진다
    const lit = ((Math.imul(propSeq * 7 + 3, 2246822519) >>> 0) % 7) === 0;
    if (lit) {
      for (const sd of [-1, 1]) bx(g, HEAD_M, L / 2 + 0.2, 9, sd * Wd * 0.32, 0.6, 2.6, 4.2);
      for (const [x, z] of [[L / 2, Wd / 2 - 1], [L / 2, -Wd / 2 + 1], [-L / 2, Wd / 2 - 1], [-L / 2, -Wd / 2 + 1]]) bx(g, BLINK_M, x, 10.5, z, 1.2, 1.6, 1.6);
      const hb = new THREE.Mesh(beam.geometry, HEAD_BEAM_M); hb.position.set(L / 2 + 1, 9, 0); hb.scale.set(170, 46, 46); hb.rotation.z = -0.1; hb.renderOrder = 5; hb.frustumCulled = false; g.add(hb);
      g.userData.head = L / 2;
    }
    carBody(g, L, Wd, pr.col);
  } else if (k === 'humvee') {
    bx(g, mat(pr.col, { roughness: 0.6 }), 0, 9, 0, L, 10, Wd);
    bx(g, mat(pr.col, { roughness: 0.6 }), -L * 0.12, 18, 0, L * 0.5, 8, Wd * 0.9);
    bx(g, GLASS(), L * 0.12, 18, 0, 0.6, 6, Wd * 0.8);
    bx(g, mat('#202020'), -L / 2 - 1.5, 10, 0, 2, 9, 9);
    wheelsOn(g, [-L * 0.3, L * 0.3], Wd / 2 - 1, 5.2);
  } else if (k === 'bus') {
    bx(g, paint(pr.col), 0, 18, 0, L, 28, Wd);
    bx(g, GLASS(), 0, 22, 0, L * 0.94, 9, Wd + 0.4);
    bx(g, mat('#d8d4c8'), 0, 32.5, 0, L * 0.96, 1, Wd * 0.96);
    wheelsOn(g, [-L * 0.34, L * 0.34], Wd / 2 - 1, 5.5);
  } else if (k === 'truck' || k === 'mtruck') {
    const mil = k === 'mtruck', cab = mil ? '#4a5236' : '#9c988e';
    bx(g, mat(cab, { roughness: 0.5 }), L * 0.36, 13, 0, L * 0.28, 20, Wd * 0.92);
    bx(g, GLASS(), L * 0.5, 17, 0, 0.6, 8, Wd * 0.8);
    if (mil) {
      bx(g, mat('#545a40', { roughness: 0.95 }), -L * 0.14, 19, 0, L * 0.7, 24, Wd);
      for (let q = -2; q <= 2; q++) bx(g, mat('#3a3f2c'), -L * 0.14 + q * L * 0.13, 31.2, 0, 1.2, 0.8, Wd + 0.2);
    } else {
      // 짐칸 — 바랜 흰 알루미늄. 예전엔 거의 흰색이라 달빛 · 손전등에 무늬 없는 흰 상자로 날아갔다. 칸막이 골 · 지붕 띠 · 문짝 선으로 결을 준다
      bx(g, mat('#8f8b82', { roughness: 0.55, metalness: 0.25 }), -L * 0.14, 20, 0, L * 0.7, 28, Wd);
      bx(g, mat(pr.col || '#2a4a6a'), -L * 0.14, 20, 0, L * 0.7 + 0.2, 5, Wd + 0.2);
      const rib = mat('#5c5952', { roughness: 0.7 });
      for (let q = 1; q < 6; q++) bx(g, rib, -L * 0.49 + q * L * 0.7 / 6, 20, 0, 0.9, 27.6, Wd + 0.5);
      bx(g, mat('#6e6b64', { roughness: 0.8 }), -L * 0.14, 34.3, 0, L * 0.7, 0.6, Wd * 0.7);
      bx(g, rib, -L * 0.49 - 0.2, 20, 0, 0.4, 26, 0.6);
    }
    wheelsOn(g, [-L * 0.36, -L * 0.2, L * 0.36], Wd / 2 - 1, 5.8);
  } else if (k === 'wagon') {
    bx(g, mat(pr.col, { roughness: 0.85, metalness: 0.3 }), 0, 22, 0, L, 28, Wd);
    for (let q = 1; q < L / 8; q++) bx(g, mat('#000000', { roughness: 1 }), -L / 2 + q * 8, 22, Wd / 2 + 0.1, 0.8, 26, 0.3);
    bx(g, mat('#1a1c1e'), 0, 4, 0, L * 0.9, 6, Wd * 0.7);
    wheelsOn(g, [-L * 0.4, -L * 0.3, L * 0.3, L * 0.4], Wd * 0.38, 4);
  } else if (k === 'tuktuk') {
    bx(g, paint(pr.col), 0, 8, 0, L, 8, Wd);
    bx(g, mat('#1a1a1a', { roughness: 0.9 }), -L * 0.05, 19, 0, L * 0.85, 2, Wd * 1.05);
    for (const [x, z] of [[L * 0.35, Wd * 0.45], [L * 0.35, -Wd * 0.45], [-L * 0.4, Wd * 0.45], [-L * 0.4, -Wd * 0.45]]) bx(g, mat('#2a2a2a'), x, 14, z, 1, 10, 1);
    wheelsOn(g, [-L * 0.3, L * 0.38], Wd / 2 - 1, 3.6);
  } else {                                               // 컨테이너
    bx(g, mat(pr.col || '#6a3a2a', { roughness: 0.8, metalness: 0.3 }), 0, 17, 0, L, 34, Wd);
    for (let q = 1; q < L / 6; q++) bx(g, mat('#000000', { roughness: 1 }), -L / 2 + q * 6, 17, Wd / 2 + 0.1, 0.8, 32, 0.3);
  }
  return g;
}

/* ═══════════ 길가 장식 · 간판 ═══════════ */
function makeDecor(d) {
  const g = new THREE.Group(), k = d.kind;
  if (k === 'tree') {
    g.add(part(GEO.cyl, mat('#2b2219'), 0, 16, 0, 2.6, 32, 2.6));
    const r = d.r || 20, leaf = mat('#1f3320', { roughness: 0.95 }), leaf2 = mat('#2a4428', { roughness: 0.95 });
    g.add(part(GEO.ico, leaf, 0, 40, 0, r * 0.9, r * 0.75, r * 0.9));
    g.add(part(GEO.ico, leaf2, r * 0.35, 46, r * 0.25, r * 0.6, r * 0.55, r * 0.6));
    g.add(part(GEO.ico, leaf, -r * 0.3, 44, -r * 0.3, r * 0.55, r * 0.5, r * 0.55));
  } else if (k === 'bin') {
    for (const z of [-6, 6]) { bx(g, mat('#2a5aa0', { roughness: 0.6 }), 0, 8, z, 9, 16, 10); bx(g, mat('#1e4a88'), 0, 16.5, z, 10, 1.4, 11); }
  } else if (k === 'vending') {
    bx(g, mat('#c4c9cf', { roughness: 0.4 }), 0, 15, 0, 12, 30, 16);
    bx(g, mat('#d8ecff', { emissive: col('#bfe0ff'), emissiveIntensity: 1.2 }), 6.1, 18, 0, 0.4, 16, 12);
  } else if (k === 'parasol') {
    g.add(part(GEO.cyl, mat('#555'), 0, 14, 0, 0.8, 28, 0.8));
    g.add(part(GEO.cone, mat(['#b8452d', '#2d6ab8', '#c9a227', '#3a8a5a'][(Math.abs(d.x * 7 + d.y) | 0) % 4], { roughness: 0.8, side: THREE.DoubleSide }), 0, 29, 0, 20, 6, 20));
  } else if (k === 'cart') {
    bx(g, mat('#8a6a3a'), 0, 10, 0, 22, 10, 14); bx(g, mat('#c9c0a0'), 0, 24, 0, 24, 1, 16);
    for (const z of [-7, 7]) g.add(part(GEO.cyl, mat('#555'), 0, 17, z, 0.6, 14, 0.6));
    wheelsOn(g, [-6, 6], 7, 3.5);
  } else if (k === 'shrine') {
    g.add(part(GEO.cyl, mat('#d8d0c0'), 0, 10, 0, 2, 20, 2));
    bx(g, mat('#c9a227', { metalness: 0.6, roughness: 0.35 }), 0, 24, 0, 12, 8, 10);
    g.add(part(GEO.cone, mat('#b03a2a'), 0, 31, 0, 9, 6, 9));
  } else if (k === 'bike') {
    wheelsOn(g, [-6, 6], 0, 4); bx(g, mat('#3a4a5a'), 0, 6, 0, 12, 1.2, 1.2);
  } else if (k === 'boat' && d.gondola) {
    // 곤돌라 — 길고 검은 배, 뱃머리의 은빛 장식(페로), 붉은 의자
    const blk = mat('#0e0f12', { roughness: 0.25, metalness: 0.2 });
    bx(g, blk, 0, 1, 0, 74, 6, 12);
    const bow = bx(g, blk, 38, 6, 0, 14, 4, 8); bow.rotation.z = 0.5; const st = bx(g, blk, -38, 5, 0, 12, 4, 8); st.rotation.z = -0.4;
    bx(g, mat('#c8ccd0', { metalness: 0.9, roughness: 0.3 }), 45, 12, 0, 2, 9, 4);
    bx(g, mat('#7a1a1a', { roughness: 0.6 }), -4, 5, 0, 12, 3, 10);
  } else if (k === 'boat') {
    bx(g, mat('#3a3530', { roughness: 0.7 }), 0, -2, 0, 70, 10, 22); bx(g, mat('#cfc9bd'), -10, 8, 0, 22, 10, 16);
  } else bx(g, mat('#555'), 0, 6, 0, 10, 12, 10);
  return g;
}
const signTex = new Map();
function signTexture(text, color) {
  const key = text + color;
  if (signTex.has(key)) return signTex.get(key);
  const t = canvasTex(256, 96, (x, W, H) => {
    x.clearRect(0, 0, W, H);
    x.fillStyle = 'rgba(10,12,14,.85)'; x.fillRect(4, 8, W - 8, H - 16);
    x.strokeStyle = color; x.lineWidth = 3; x.strokeRect(8, 12, W - 16, H - 24);
    x.fillStyle = color; x.font = `700 ${text.length > 4 ? 40 : 54}px ${LCF}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = color; x.shadowBlur = 16; x.fillText(text, W / 2, H / 2 + 2);
  }, false);
  signTex.set(key, t);
  return t;
}
function makeSign(sg) {
  const m = new THREE.MeshBasicMaterial({ map: signTexture(sg.text, sg.col), transparent: true, toneMapped: false });
  const o = new THREE.Mesh(new THREE.PlaneGeometry(40, 15), m);
  o.userData.mat = m;
  return o;
}

/* ═══════════ 장면 · 빛 · 카메라 ═══════════ */
const dyn = { props: new Map(), decor: new Map(), signs: new Map(), humans: new Map(), corpses: new Map(), pickups: new Map(), relays: new Map(), tw: new Map() };
let NOISE3 = null, ELITE3 = null, sparkGeo, sparks, player3 = null, splatMesh, dotMesh, particles, partGeo, tracerGeo, tracers, rain, rainGeo, exitRing, exitBeam, nadeMeshes = [];
const MAXP = 600, MAXDEC = 450, RAIN_N = 1400;

/* ═══════════ 후처리 · 빛줄기 ═══════════
   장면을 HDR(반정밀도) 버퍼에 그리고 → 밝은 곳이 번지게(블룸) → 톤 매핑 · sRGB →
   마지막에 색 보정(어두운 곳은 청록, 밝은 곳은 따뜻하게) · 비네트 · 필름 그레인 · 가장자리 색 번짐 */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uVig: { value: 0.55 }, uGrain: { value: 0.045 }, uLift: { value: 0 }, uSh: { value: new THREE.Vector3(0.82, 1.0, 1.14) }, uHi: { value: new THREE.Vector3(1.08, 1.0, 0.88) }, uExp: { value: 1.75 }, uHaze: { value: new THREE.Vector4(0, 0, 0, 0) }, uDarkP: { value: new THREE.Vector4(0.5, 0.5, 0.5, 0.5) }, uDarkK: { value: new THREE.Vector4(0, 0.1, 0.6, 1) }, uDarkF: { value: new THREE.Vector4(0, 0, 0, 0) }, uDarkM: { value: new THREE.Vector2(0, 0) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  // 톤 매핑(ACES) · sRGB 변환까지 이 한 번에 — 전체 화면 패스를 하나 줄인다
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uVig, uGrain, uLift, uExp; uniform vec2 uRes; uniform vec3 uSh, uHi; uniform vec4 uHaze, uDarkP, uDarkK, uDarkF; uniform vec2 uDarkM; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    vec3 rrt(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 aces(vec3 c){
      const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      return clamp(O * rrt(I * (c * uExp / 0.6)), 0.0, 1.0); }
    vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
    void main(){
      vec2 d = vUv - 0.5; float r2 = dot(d, d);
      float ca = 0.006 * r2;
      vec3 c = vec3(texture2D(tDiffuse, vUv + d * ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d * ca).b);
      // 하이라이트 어깨 — 손전등을 정면으로 받은 흰 차 · 벽이 하얗게 날아가지 않게, 밝기 0.22 위로는 부드럽게 눌러 결을 남긴다(색조는 그대로)
      float Lh = dot(c, vec3(0.2126, 0.7152, 0.0722));
      if (Lh > 0.22) { float e = Lh - 0.22; c *= (0.22 + e / (1.0 + e / 0.55)) / Lh; }
      c = srgb(aces(c));
      // 밤 — 손전등 원뿔과 발밑 둘레만 보인다(2D 판과 같은 규칙). 원뿔 밖은 거의 까맣고, 가로등 · 불 · 붉은 눈처럼
      // 스스로 빛나는 것만 어둠을 뚫는다. 손전등을 끄면 발밑만 남는다. uDarkP = 플레이어 · 빛 끝(화면 uv), uDarkK = 어둠 · 발밑 반경 · 원뿔 폭 · 가로세로비
      if (uDarkK.x > 0.0) {
        vec2 q = vec2(vUv.x * uDarkK.w, vUv.y), P = vec2(uDarkP.x * uDarkK.w, uDarkP.y), E = vec2(uDarkP.z * uDarkK.w, uDarkP.w);
        vec2 v = q - P, ax = E - P; float LE = length(ax), cone = 0.0;
        if (LE > 0.002) { vec2 dn = ax / LE; float al = dot(v, dn), pp = length(v - dn * al);
          cone = step(0.0, al) * (1.0 - smoothstep(uDarkK.z * al * 0.7, uDarkK.z * al * 1.3 + 0.012, pp)) * (1.0 - smoothstep(LE * 0.62, LE * 1.04, al)); }
        float nr = 1.0 - smoothstep(uDarkK.y * 0.3, uDarkK.y, length(v));
        float glow = smoothstep(0.5, 0.92, max(c.r, max(c.g, c.b)));
        // 총구 화염 · 폭발 섬광 — 쏠 때마다 둘레가 번쩍 드러난다(2D 의 어둠 막과 같은 규칙). uDarkM = 화염 반경 · 세기, uDarkF = 폭발 위치 · 반경 · 세기
        float mz = uDarkM.y * (1.0 - smoothstep(uDarkM.x * 0.2, uDarkM.x, length(v)));
        float fl = uDarkF.w * (1.0 - smoothstep(uDarkF.z * 0.15, uDarkF.z, length(q - vec2(uDarkF.x * uDarkK.w, uDarkF.y))));
        c *= mix(1.0 - uDarkK.x, 1.0, max(max(max(cone, nr * 0.9), glow), max(mz, fl)));
      }
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(c, c * uSh, (1.0 - smoothstep(0.0, 0.4, l)) * 0.6);
      c = mix(c, c * uHi, smoothstep(0.45, 1.0, l) * 0.45);
      c = c + uLift * (1.0 - c) * 0.06;
      // 폭풍의 연무 — 가장자리일수록 짙고, 흩날리는 결이 흐른다. 가운데(플레이어 둘레)는 트여 있다
      if (uHaze.a > 0.0) { float fl = 0.75 + 0.25 * sin(vUv.x * 9.0 + vUv.y * 4.0 + uTime * 2.6) * sin(vUv.y * 13.0 - uTime * 1.7);
        c = mix(c, uHaze.rgb, uHaze.a * fl * (0.28 + 0.72 * smoothstep(0.01, 0.2, r2))); }
      c = (c - 0.5) * 1.07 + 0.5;
      c *= 1.0 - uVig * smoothstep(0.08, 0.62, r2 * 1.6);
      float n = h(floor(vUv * uRes) + fract(uTime * 7.3) * 91.0) - 0.5;
      c += n * uGrain * (0.6 + 0.8 * (1.0 - l));
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`
};
/** 손전등 빛줄기 — 꼭짓점이 손전등에 있는 열린 원뿔. 가운데가 짙고 가장자리 · 끝으로 갈수록 옅다.
    바닥 가까이에서 흐려 땅과 만나는 선이 보이지 않게 하고, 떠다니는 먼지 결을 넣는다 */
function makeBeam() {
  const geo = new THREE.ConeGeometry(1, 1, 40, 8, true);
  geo.translate(0, -0.5, 0); geo.rotateZ(Math.PI / 2);   // 꼭짓점 (0,0,0), 밑면 x = 1
  const m = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(1, 0.94, 0.82) }, uInt: { value: 0.16 }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vL, vW, vN, vV;
      void main(){ vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        vec4 mv = viewMatrix * w; vV = mv.xyz; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uCol; uniform float uInt, uTime; varying vec3 vL, vW, vN, vV;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        float t = clamp(vL.x, 0.0, 1.0);
        float face = abs(dot(normalize(vN), normalize(-vV)));
        float a = uInt * pow(face, 1.6) * pow(1.0 - t, 1.25) * smoothstep(0.02, 0.24, t);
        a *= smoothstep(1.0, 16.0, vW.y);
        float n = n2(vW.xz * 0.035 + vec2(uTime * 0.25, -uTime * 0.18)) * 0.6 + n2(vW.xz * 0.011 - uTime * 0.05) * 0.6;
        a *= 0.55 + n * 0.7;
        gl_FragColor = vec4(uCol * a, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
  });
  const o = new THREE.Mesh(geo, m); o.frustumCulled = false; o.renderOrder = 5;
  return o;
}
/** 가로등 빛기둥 — 등갓에서 바닥으로 퍼지는 옅은 원뿔(인스턴스). 비 오는 밤의 공기가 빛난다 */
const LCONE_MAX = 48;
let lampCones = null;
function makeLampCones() {
  const geo = new THREE.ConeGeometry(1, 1, 28, 6, true); geo.translate(0, -0.5, 0);   // 꼭짓점 y=0, 밑면 y=-1
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying float vT, vY; varying vec3 vN, vV, vC;
      void main(){ vT = -position.y; vC = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
        vC = instanceColor;
        #endif
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vY = w.y;
        vec4 mv = viewMatrix * w; vV = mv.xyz; vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vT, vY; varying vec3 vN, vV, vC;
      void main(){ float face = abs(dot(normalize(vN), normalize(-vV)));
        float a = pow(face, 1.8) * (1.0 - vT * 0.55) * smoothstep(0.0, 0.12, vT) * smoothstep(0.0, 12.0, vY) * 0.11;
        gl_FragColor = vec4(vC * a, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
  });
  lampCones = new THREE.InstancedMesh(geo, m, LCONE_MAX);
  lampCones.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(LCONE_MAX * 3), 3);
  lampCones.count = 0; lampCones.frustumCulled = false; lampCones.renderOrder = 4;
  return lampCones;
}
/** 등갓 · 간판 둘레의 번짐 — 카메라를 향한 판(인스턴스). 블룸과 겹쳐 빛원이 또렷이 보인다 */
const GLOW_MAX = 64;
let glows = null;
function makeGlows() {
  glows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: TEX.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), GLOW_MAX);
  glows.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(GLOW_MAX * 3), 3);
  glows.count = 0; glows.frustumCulled = false; glows.renderOrder = 7;
  return glows;
}
let nGlow = 0;
function addGlow(x, y, z, size, c, k) {
  if (nGlow >= GLOW_MAX) return;
  dm.compose(dpos.set(x, y, z), camera.quaternion, dsc.set(size, size, 1));
  glows.setMatrixAt(nGlow, dm); glows.instanceColor.setXYZ(nGlow, c.r * k, c.g * k, c.b * k); nGlow++;
}
/* ═══════════ 불 · 연기 ═══════════
   불타는 차 · 드럼통 불. 불꽃은 카메라를 향한 판에 위로 흐르는 잡음을 그리고(가산 혼합, HDR 이라 블룸으로 번진다),
   연기는 그 위로 솟아 바람에 눕는 어두운 덩어리, 불티는 솟았다 사라지는 점 */
const NOISE_GLSL = `float fh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float fn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(fh(i), fh(i + vec2(1, 0)), f.x), mix(fh(i + vec2(0, 1)), fh(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * fn(p); p *= 2.03; a *= 0.5; } return v; }`;
const BB_VERT = (body) => `varying vec2 vUv; varying vec3 vP; uniform float uTime;
  void main(){ vUv = uv; vP = vec3(0.0);
    #ifdef USE_INSTANCING_COLOR
    vP = instanceColor;
    #endif
    vec3 c = instanceMatrix[3].xyz; float sx = length(instanceMatrix[0].xyz), sy = length(instanceMatrix[1].xyz);
    ${body}
    vec4 mv = viewMatrix * vec4(c, 1.0); mv.xy += position.xy * vec2(sx, sy);
    gl_Position = projectionMatrix * mv; }`;
const FIRE_MAX = 10;
let flames = null, smoke = null, embers = null;
const FIRE_U = { uTime: { value: 0 }, uFire: { value: Array.from({ length: FIRE_MAX }, () => new THREE.Vector4()) } };
function makeFire() {
  const quad = new THREE.PlaneGeometry(1, 1); quad.translate(0, 0.5, 0);           // 밑변이 불 자리
  flames = new THREE.InstancedMesh(quad, new THREE.ShaderMaterial({
    uniforms: FIRE_U, vertexShader: BB_VERT(''),
    fragmentShader: `uniform float uTime; varying vec2 vUv; varying vec3 vP; ${NOISE_GLSL}
      void main(){ vec2 uv = vUv; float sd = vP.r * 37.0;
        float n = fbm(vec2(uv.x * 3.2 + sd, uv.y * 2.4 - uTime * 2.6 - sd));
        float dx = abs(uv.x - 0.5) * 2.0;
        float f = clamp(1.25 - dx * (1.1 + uv.y * 1.2) - uv.y * 1.05 + (n - 0.5) * 1.3, 0.0, 1.0);
        f *= smoothstep(0.0, 0.06, uv.y);
        vec3 c = mix(vec3(0.9, 0.18, 0.02), vec3(1.0, 0.62, 0.16), smoothstep(0.1, 0.55, f));
        c = mix(c, vec3(1.0, 0.78, 0.45), smoothstep(0.7, 1.0, f));
        gl_FragColor = vec4(c * f * (0.95 * vP.g), 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  }), FIRE_MAX * 4);
  smoke = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: FIRE_U,
    vertexShader: BB_VERT(`float life = fract(uTime * 0.11 + vP.r); c += vec3(life * 70.0 + sin(vP.r * 40.0) * 8.0, life * 190.0, -life * 30.0); sx *= 0.5 + life * 1.6; sy *= 0.5 + life * 1.6;`).replace('varying vec3 vP;', 'varying vec3 vP; varying float vLife;').replace('vec4 mv =', 'vLife = life; vec4 mv ='),
    fragmentShader: `uniform float uTime; varying vec2 vUv; varying vec3 vP; varying float vLife; ${NOISE_GLSL}
      void main(){ vec2 q = vUv - 0.5; float r = length(q) * 2.0;
        float n = fbm(vUv * 3.0 + vec2(vP.r * 9.0, -uTime * 0.3));
        float a = smoothstep(1.0, 0.2, r + (n - 0.5) * 0.7) * smoothstep(0.0, 0.12, vLife) * (1.0 - vLife) * 0.55 * vP.g;
        vec3 c = mix(vec3(0.16, 0.1, 0.06), vec3(0.05, 0.05, 0.055), smoothstep(0.0, 0.35, vLife));
        gl_FragColor = vec4(c, a); }`,
    transparent: true, depthWrite: false
  }), FIRE_MAX * 6);
  for (const m of [flames, smoke]) { m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(m.count * 3), 3); m.count = 0; m.frustumCulled = false; }
  flames.renderOrder = 8; smoke.renderOrder = 9;
  // 불티 — 불 자리 목록(uFire) 중 하나에 붙어 솟는다
  const EN = 260, g = new THREE.BufferGeometry(), pp = new Float32Array(EN * 3), sd = new Float32Array(EN);
  for (let i = 0; i < EN; i++) { pp[i * 3] = (i % FIRE_MAX); sd[i] = Math.random(); }
  g.setAttribute('position', new THREE.BufferAttribute(pp, 3)); g.setAttribute('seed', new THREE.BufferAttribute(sd, 1));
  embers = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: Object.assign({ uScale: { value: 400 } }, FIRE_U),
    vertexShader: `attribute float seed; uniform float uTime, uScale; uniform vec4 uFire[${FIRE_MAX}]; varying float vA;
      void main(){ vec4 F = uFire[int(position.x)]; float life = fract(uTime * (0.35 + seed * 0.3) + seed * 13.0);
        vec3 p = F.xyz + vec3(sin(seed * 91.0 + uTime) * 10.0 * F.w + life * 30.0, life * 150.0 * F.w, cos(seed * 57.0 + uTime * 1.3) * 10.0 * F.w);
        vA = F.w > 0.0 ? (1.0 - life) * step(0.3, fract(seed * 7.0 + uTime * 3.0)) : 0.0;
        vec4 mv = viewMatrix * vec4(p, 1.0); gl_PointSize = (1.4 + seed) * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; void main(){ float k = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(vec3(1.0, 0.55, 0.15) * vA * k * 3.0, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  embers.frustumCulled = false; embers.renderOrder = 8;
  return [flames, smoke, embers];
}
const fireCand = [];
const FIRE_C = new THREE.Color(1.0, 0.45, 0.14);
function updateFires(g) {
  fireCand.sort((a, b) => a[0] - b[0]);
  let nf = 0, ns = 0, k = 0;
  const t = g.time;
  for (const [, x, y, z, sc, seed] of fireCand) {
    if (k >= FIRE_MAX) break;
    const fl = 0.85 + Math.sin(t * 17 + seed * 9) * 0.08 + Math.sin(t * 29 + seed * 3) * 0.07;
    FIRE_U.uFire.value[k].set(x, y, z, sc);
    pushLight(x, y + 22 * sc, z, 240 * sc, FIRE_C, 2.2 * fl * sc);
    for (let i = 0; i < 4; i++) {
      const a = seed * 10 + i * 2.1, r = (i ? 7 : 0) * sc;
      dm.compose(dpos.set(x + Math.cos(a) * r, y - 2, z + Math.sin(a) * r * 0.6), dq.identity(), dsc.set((i ? 20 : 30) * sc, (i ? 34 : 52) * sc, 1));
      flames.setMatrixAt(nf, dm); flames.instanceColor.setXYZ(nf, (seed * 7.3 + i * 0.37) % 1, fl, 0); nf++;
    }
    for (let i = 0; i < 6; i++) {
      dm.compose(dpos.set(x, y + 30 * sc, z), dq.identity(), dsc.set(70 * sc, 70 * sc, 1));
      smoke.setMatrixAt(ns, dm); smoke.instanceColor.setXYZ(ns, (seed * 3.1 + i / 6) % 1, 1, 0); ns++;
    }
    addGlow(x, y + 16 * sc, z, 110 * sc, FIRE_C, 0.12 * fl);
    k++;
  }
  for (let i = k; i < FIRE_MAX; i++) FIRE_U.uFire.value[i].w = 0;
  flames.count = nf; smoke.count = ns;
  for (const m of [flames, smoke]) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
  FIRE_U.uTime.value = t;
  embers.material.uniforms.uScale.value = renderer.domElement.height * 0.9;
  fireCand.length = 0;
}
function addFire(x, y, z, sc, seed) {
  const d = Math.hypot(x - camT.x, z - camT.z);
  if (d < 1000) fireCand.push([d, x, y, z, sc, seed]);
}
/* ═══════════ 위험 · 전투 효과 ═══════════
   산 웅덩이(스스로 빛나는 초록), 날아오는 산과 떨어질 자리의 좁혀 드는 고리, 부푼 것의 가스, 중계기, 탄피 */
const HZ = {};
const ACID_C = new THREE.Color(0.45, 0.85, 0.15);
function makeHazards() {
  const acidMat = new THREE.ShaderMaterial({
    uniforms: { uTime: FIRE_U.uTime },
    vertexShader: `varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = vec3(1.0);
      #ifdef USE_INSTANCING_COLOR
      vP = instanceColor;
      #endif
      gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv; varying vec3 vP; ${NOISE_GLSL}
      void main(){ vec2 q = (vUv - 0.5) * 2.0; float r = length(q);
        float n = fbm(q * 2.5 + vec2(uTime * 0.4 + vP.g * 9.0, -uTime * 0.3));
        float edge = smoothstep(1.0, 0.75, r + (n - 0.5) * 0.35);
        float bub = smoothstep(0.62, 0.72, fbm(q * 7.0 + vec2(vP.g * 3.0, uTime * 1.2))) * edge;
        vec3 c = mix(vec3(0.12, 0.3, 0.03), vec3(0.5, 0.95, 0.2), n * 0.8 + bub * 0.6) * (0.35 + 0.65 * vP.r);
        gl_FragColor = vec4(c * 1.6, edge * (0.55 + 0.4 * vP.r)); }`,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3
  });
  HZ.acid = new THREE.InstancedMesh(GEO.plane, acidMat, 32);
  HZ.ring = new THREE.InstancedMesh(GEO.ring, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 1.8, 0.4), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), 12);
  HZ.spit = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 2.4, 0.5) }), 12);
  HZ.gas = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: FIRE_U,
    vertexShader: BB_VERT(''),
    fragmentShader: `uniform float uTime; varying vec2 vUv; varying vec3 vP; ${NOISE_GLSL}
      void main(){ vec2 q = vUv - 0.5; float n = fbm(vUv * 3.0 + vec2(vP.g * 7.0 + uTime * 0.15, uTime * 0.1));
        float a = smoothstep(0.5, 0.1, length(q) + (n - 0.5) * 0.3) * 0.42 * vP.r;
        gl_FragColor = vec4(mix(vec3(0.28, 0.36, 0.1), vec3(0.5, 0.6, 0.18), n), a); }`,
    transparent: true, depthWrite: false
  }), 40);
  HZ.casing = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.8, 0.8, 3, 6).rotateZ(Math.PI / 2), enhanceNew(new THREE.MeshStandardMaterial({ color: 0xc8a048, metalness: 0.9, roughness: 0.3 })), 240);
  HZ.shell = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.4, 1.4, 5, 6).rotateZ(Math.PI / 2), enhanceNew(new THREE.MeshStandardMaterial({ color: 0x9c2f24, metalness: 0.3, roughness: 0.5 })), 120);
  // 돌진 · 도약 예고선 — 바닥에 깔린 붉은 띠(앞쪽 끝에서 흐려진다)
  HZ.tele = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0), new THREE.ShaderMaterial({
    vertexShader: `varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = vec3(1.0);
      #ifdef USE_INSTANCING_COLOR
      vP = instanceColor;
      #endif
      gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vP;
      void main(){ float e = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.75, vUv.y) * (1.0 - vUv.x * 0.35) * (1.0 - smoothstep(0.5, 1.0, vUv.x));
        gl_FragColor = vec4(vec3(1.6, 0.28, 0.16) * vP.r * e, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4
  }), 6);
  // 휘감는 것의 혀 — 입에서 끝까지 늘어나는 붉은 끈
  // 물결 — 물에 들어선 발 둘레로 퍼지는 흰 고리
  HZ.wade = new THREE.InstancedMesh(GEO.ring, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), 60);
  HZ.wade.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(60 * 3), 3);
  HZ.tongue = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).rotateZ(Math.PI / 2).translate(0.5, 0, 0), enhanceNew(new THREE.MeshStandardMaterial({ color: 0x8a3038, roughness: 0.35, emissive: 0x2a0808 })), 4);
  for (const k of ['acid', 'gas', 'tele']) HZ[k].instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(HZ[k].count * 3), 3);
  for (const k in HZ) { HZ[k].count = 0; HZ[k].frustumCulled = false; }
  HZ.acid.renderOrder = 3; HZ.gas.renderOrder = 9;
  return Object.values(HZ);
}
function updateHazards(g, near) {
  let n = 0;
  for (const a of g.acids) {
    if (n >= 32 || !near(a.x, a.y, 900)) continue;
    const k = Math.min(1, a.t / a.max), wob = 1 + Math.sin(g.time * 3 + (a.phase || 0)) * 0.04;
    dm.compose(dpos.set(a.x, 3.9, a.y), dq.identity(), dsc.set(a.r * 2.3 * wob, 1, a.r * 1.9 * wob));
    HZ.acid.setMatrixAt(n, dm); HZ.acid.instanceColor.setXYZ(n, k, (a.phase || 0) % 1, 0); n++;
    pushLight(a.x, 10, a.y, a.r * 3.2, ACID_C, 0.9 * k);
  }
  HZ.acid.count = n;
  let nr = 0, ns = 0;
  for (const sp of g.spits) {
    if (nr >= 12) break;
    const k = Math.min(1, sp.t / sp.dur), R = 18 + (1 - k) * 26;
    dm.compose(dpos.set(sp.tx, 4.2, sp.ty), dq.identity(), dsc.set(R, 1, R)); HZ.ring.setMatrixAt(nr++, dm);
    dm.compose(dpos.set(sp.x, 16 + (sp.h || 0) * 1.0, sp.y), dq.identity(), dsc.setScalar(4.5)); HZ.spit.setMatrixAt(ns++, dm);
    pushLight(sp.x, 20 + (sp.h || 0), sp.y, 120, ACID_C, 1.2);
  }
  HZ.ring.count = nr; HZ.spit.count = ns;
  let ng = 0;
  for (const q of g.gas) {
    if (!near(q.x, q.y, 900)) continue;
    const k = q.t / q.max;
    for (let i = 0; i < 5 && ng < 40; i++) {
      const a = i * 1.257 + g.time * 0.3, r = q.r * (0.45 + 0.12 * Math.sin(g.time + i));
      dm.compose(dpos.set(q.x + Math.cos(a) * r * 0.5, 22 + i * 4, q.y + Math.sin(a) * r * 0.5), dq.identity(), dsc.set(r * 1.6, r * 1.3, 1));
      HZ.gas.setMatrixAt(ng, dm); HZ.gas.instanceColor.setXYZ(ng, k, i * 0.21, 0); ng++;
    }
  }
  HZ.gas.count = ng;
  let nc = 0, nh = 0;
  for (const c of g.casings) {
    if (!near(c.x, c.y, 800)) continue;
    const air = c.t > 0 ? Math.sin(Math.min(1, c.t / 0.5) * Math.PI) * 10 : 0;
    dm.compose(dpos.set(c.x, (c.shell ? 1.6 : 1) + air, c.y), dq.setFromAxisAngle(UPY, -c.a), dsc.setScalar(1));
    if (c.shell) { if (nh < 120) HZ.shell.setMatrixAt(nh++, dm); } else if (nc < 240) HZ.casing.setMatrixAt(nc++, dm);
  }
  HZ.casing.count = nc; HZ.shell.count = nh;
  let nt = 0, ntg = 0;
  if (window.LC_TELEGRAPHS) for (const b of window.LC_TELEGRAPHS(g)) {
    if (nt >= 6) break;
    const len = g.world.ray(b.x, b.y, b.dir, b.len);
    dm.compose(dpos.set(b.x, 4.6, b.y), dq.setFromAxisAngle(UPY, -b.dir), dsc.set(len, 1, b.w));
    HZ.tele.setMatrixAt(nt, dm); HZ.tele.instanceColor.setXYZ(nt, b.locked ? 0.75 : 0.32 + Math.sin(g.time * 22) * 0.14, 0, 0); nt++;
  }
  for (const z of g.zombies) {
    if (ntg >= 4 || z.dead || !z.tonguePhase || z.tonguePhase === 'wind' || !(z.tongueLen > 2)) continue;
    const h = dyn.humans.get(z), S = h ? h.scale.x : 1;
    const y0 = 40 * S, y1 = z.tonguePhase === 'pull' ? 30 : 22, dx = z.tipX - z.x, dz = z.tipY - z.y, L = Math.hypot(dx, dz) || 1;
    tv1.set(dx, y1 - y0, dz); const LL = tv1.length();
    dq.setFromUnitVectors(XAX, tv1.normalize());
    dm.compose(dpos.set(z.x + dx / L * 6, y0, z.y + dz / L * 6), dq, dsc.set(LL, 1.1, 1.1));
    HZ.tongue.setMatrixAt(ntg++, dm);
  }
  HZ.tele.count = nt; HZ.tongue.count = ntg;
  let nw = 0;
  for (const r of g.ripples || []) {
    if (nw >= 60) break;
    const k = r.t / r.max, R = r.r * (r.shove ? 0.5 + k * 1.8 : 0.6 + k * 1.4);
    dm.compose(dpos.set(r.x, 3.2, r.y), dq.identity(), dsc.set(R, 1, R)); HZ.wade.setMatrixAt(nw, dm);
    const c = (r.shove ? 2.2 : 0.5) * (1 - k); HZ.wade.instanceColor.setXYZ(nw, c, c * 0.92, c * 0.8); nw++;
  }
  HZ.wade.count = nw;
  // 밀치기(rc.36) — 2D 판과 같은 그림: 바라보는 쪽으로 휘두른 팔의 스미어 한 장(초승달) + 맞은 자리의 네 갈래 섬광.
  // 스미어는 바닥 가까이 눕힌 판 하나에 셰이더로 그린다(앞머리가 밝고 꼬리는 사라진다). 섬광은 화면을 향한 판(스프라이트)
  if (!SHOVE3) {
    SHOVE3 = [];
    const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const base = new THREE.ShaderMaterial({
      uniforms: { uHead: { value: 0 }, uTail: { value: 0 }, uA: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vU; void main(){ vU = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uHead, uTail, uA; varying vec2 vU;
        void main(){
          float r = length(vU), a = atan(vU.y, vU.x), span = uHead - uTail;
          if (abs(span) < 0.02) discard;
          float du = atan(sin(a - uTail), cos(a - uTail)), u = du / span;
          if (u < 0.0 || u > 1.0) discard;
          float w = 0.05 + 0.24 * sin(3.14159 * min(1.0, u * 1.15));
          float band = smoothstep(0.96 - w - 0.04, 0.96 - w, r) * (1.0 - smoothstep(0.93, 0.98, r));
          vec3 col = mix(vec3(0.55, 0.52, 0.46), vec3(0.95, 0.93, 0.86), u * u);
          gl_FragColor = vec4(col * band * (0.15 + 0.85 * u) * uA, 1.0);
        }`
    });
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(geo, base.clone()); m.visible = false; m.frustumCulled = false; m.renderOrder = 3; scene.add(m); SHOVE3.push(m); }
    // 네 갈래 섬광 — 캔버스로 한 번 그린 별 무늬
    const tex = canvasTex(64, 64, (c, W, H) => {
      c.translate(W / 2, H / 2); c.rotate(Math.PI / 4); c.fillStyle = '#fff';
      c.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? 3 : (i % 4 === 0 ? 30 : 19), an = i * Math.PI / 4; c.lineTo(Math.cos(an) * r, Math.sin(an) * r); } c.closePath(); c.fill();
      const g2 = c.createRadialGradient(0, 0, 0, 0, 0, 10); g2.addColorStop(0, 'rgba(255,255,255,1)'); g2.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g2; c.fillRect(-10, -10, 20, 20);
    });
    STAR3 = [];
    for (let i = 0; i < 6; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(2.2, 2.0, 1.6), transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })); sp.visible = false; sp.renderOrder = 4; scene.add(sp); STAR3.push(sp); }
  }
  let nStar = 0;
  SHOVE3.forEach((m, i) => {
    const sv = (g.shoves || [])[i];
    m.visible = !!sv;
    if (!sv) { if (PRIMING && !i) { m.visible = true; m.material.uniforms.uA.value = 0; m.material.uniforms.uHead.value = 1; m.position.set(g.player.x, 5, g.player.y); } return; }   // 판 시작 때 셰이더를 미리 엮는다
    const k = sv.t / sv.max, A0 = 1.25, U = m.material.uniforms;
    const head = -A0 + 2 * A0 * Math.min(1, k / 0.42), tail = -A0 + 2 * A0 * Math.max(0, (k - 0.18) / 0.82);
    // 판의 uv 는 세계 (x, -z) 쪽 — 세계 각도의 부호를 뒤집는다
    U.uHead.value = -(sv.a + sv.sw * head); U.uTail.value = -(sv.a + sv.sw * tail);
    U.uA.value = (sv.hits ? 0.8 : 0.5) * (1 - Math.max(0, (k - 0.45) / 0.55)) * (PK.fx || 1);
    m.position.set(sv.x, 10, sv.y); m.scale.set(52 + (PK.shove || 0), 1, 52 + (PK.shove || 0));
    if (sv.t < 0.12) for (const q of sv.pts || []) {
      if (nStar >= STAR3.length) break;
      const sp = STAR3[nStar++], kk = sv.t / 0.12, S = (q.big ? 44 : 32) * (1 - kk * 0.7);
      sp.visible = true; sp.position.set(q.x, 22, q.y); sp.scale.set(S, S, 1); sp.material.opacity = 1 - kk; sp.material.rotation = -q.a;
    }
  });
  for (let i = nStar; i < STAR3.length; i++) STAR3[i].visible = PRIMING && i === 0;
  /* 총성 고리 — 소리가 닿는 거리. 소음기를 끼면 작다 */
  if (!NOISE3) { NOISE3 = []; const geo = new THREE.RingGeometry(0.985, 1, 96).rotateX(-Math.PI / 2); for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffecc8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); m.visible = false; m.frustumCulled = false; scene.add(m); NOISE3.push(m); } }
  NOISE3.forEach((m, i) => {
    const nr = (g.noiseRings || [])[i];
    m.visible = !!nr;
    if (!nr) return;
    const k = nr.t / nr.max, R = nr.R * (0.25 + 0.75 * Math.sqrt(k));
    m.position.set(nr.x, 3.5, nr.y); m.scale.set(R, 1, R);
    m.material.opacity = 0.5 * (1 - k);
  });
  /* 정예 — 발밑의 금빛 고리가 숨 쉬듯 뛴다 */
  if (!ELITE3) { ELITE3 = []; const geo = new THREE.RingGeometry(0.78, 1, 48).rotateX(-Math.PI / 2); for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffcf5a, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); m.visible = false; m.frustumCulled = false; scene.add(m); ELITE3.push(m); } }
  { let ne = 0;
    for (const z of g.zombies) {
      if (!z.elite || z.dead || ne >= ELITE3.length || !near(z.x, z.y, 900)) continue;
      const m = ELITE3[ne++], R = (z.r + 10) * (1 + 0.06 * Math.sin(g.time * 5));
      m.visible = true; m.position.set(z.x, 3.8 + groundY(g.world, z.x, z.y, z.terr), z.y); m.scale.set(R, 1, R);
      m.material.opacity = 0.55 + 0.25 * Math.sin(g.time * 5);
      pushLight(z.x, 20, z.y, 70, tmpC.set(0xffb030), 0.5);
    }
    for (let i = ne; i < ELITE3.length; i++) ELITE3[i].visible = false;
  }
  for (const k in HZ) { HZ[k].instanceMatrix.needsUpdate = true; if (HZ[k].instanceColor) HZ[k].instanceColor.needsUpdate = true; }
  updateRelays(g, near);
  updateTwist(g, near);
}
/** 중계기 — 상자 · 안테나 · 깜빡이는 등, 바닥에 진행 고리(셰이더로 호를 채운다) */
function updateRelays(g, near) {
  const seen = new Set();
  for (const r of g.relays || []) {
    let o = dyn.relays.get(r);
    if (!o) {
      o = new THREE.Group();
      o.add(part(GEO.box, mat('#4e5a60', { roughness: 0.6, metalness: 0.4 }), 0, 13, 0, 22, 26, 16));
      o.add(part(GEO.cyl, mat('#9aa4aa', { metalness: 0.7, roughness: 0.3 }), 0, 50, 0, 1.2, 48, 1.2));
      for (const hgt of [44, 58]) o.add(part(GEO.box, mat('#9aa4aa', { metalness: 0.7 }), 0, hgt, 0, 14, 1, 1));
      const lamp = new THREE.Mesh(GEO.eye, new THREE.MeshBasicMaterial({ color: 0xffb432 })); lamp.scale.setScalar(4); lamp.position.y = 75; o.add(lamp);
      const panel = new THREE.Mesh(GEO.box, new THREE.MeshBasicMaterial({ color: 0x6b5a2a })); panel.scale.set(10, 4, 0.5); panel.position.set(0, 16, 8.2); o.add(panel);
      const ringM = new THREE.ShaderMaterial({
        uniforms: { uProg: { value: 0 }, uCol: { value: new THREE.Color(1, 0.7, 0.16) }, uBase: { value: new THREE.Color(0.3, 0.2, 0.05) } },
        vertexShader: 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float uProg; uniform vec3 uCol, uBase; varying vec2 vP;
          void main(){ float a = atan(vP.x, -vP.y) / 6.2832 + 0.5; gl_FragColor = vec4(a < uProg ? uCol * 2.0 : uBase, 1.0); }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(74, 80, 64).rotateX(-Math.PI / 2), ringM); ring.position.y = 4.3; o.add(ring);
      o.userData = { lamp, panel, ringM };
      dyn.relays.set(r, o); scene.add(o); MOON.dirty = true;
    }
    seen.add(r);
    o.visible = near(r.x, r.y, 1000);
    o.position.set(r.x, 0, r.y);
    const on = r === g.relayOn, u = o.userData;
    const blink = r.done ? 1 : on ? (Math.sin(g.time * 14) > 0 ? 1 : 0.3) : (Math.sin(g.time * 3 + r.x) > 0.6 ? 1 : 0.25);
    u.lamp.material.color.set(r.done ? 0x78f08c : 0xffb432).multiplyScalar(blink * 2.5);
    u.panel.material.color.set(r.done ? 0x5fd17a : on ? 0xf0c040 : 0x6b5a2a);
    u.ringM.uniforms.uProg.value = r.done ? 1 : r.prog || 0;
    u.ringM.uniforms.uCol.value.set(r.done ? 0x78e68c : 0xf0c850);
    if (o.visible) pushLight(r.x, 70, r.y, 150, tmpC.set(r.done ? 0x78f08c : 0xffb432), 1.2 * blink);
  }
  for (const [r, o] of dyn.relays) if (!seen.has(r)) { scene.remove(o); dyn.relays.delete(r); }
}
/** 미션 변주의 물건 — 제어반(크레센도) · 낙하산 보급 상자 · 연료를 넣을 탈것 자리 */
const TW_RING = () => new THREE.ShaderMaterial({
  uniforms: { uProg: { value: 0 }, uCol: { value: new THREE.Color(1, 0.7, 0.16) }, uBase: { value: new THREE.Color(0.3, 0.2, 0.05) } },
  vertexShader: 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform float uProg; uniform vec3 uCol, uBase; varying vec2 vP;
    void main(){ float a = atan(vP.x, -vP.y) / 6.2832 + 0.5; gl_FragColor = vec4(a < uProg ? uCol * 2.0 : uBase, 1.0); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
});
function updateTwist(g, near) {
  const seen = new Set(), tw = g.tw;
  for (const ob of g.twObjs || []) {
    seen.add(ob);
    let o = dyn.tw.get(ob);
    if (!o) {
      o = new THREE.Group(); const u = o.userData;
      if (ob.kind === 'panel') {
        o.add(part(GEO.box, mat('#5a5048', { roughness: 0.6, metalness: 0.4 }), 0, 15, 0, 18, 30, 12));
        o.add(part(GEO.box, mat('#2c2724'), 0, 20, 6.2, 12, 9, 0.6));
        for (const sx of [-4, 0, 4]) o.add(part(GEO.box, mat('#c8b070', { emissive: col('#806020'), emissiveIntensity: 0.6 }), sx, 13, 6.4, 2, 2, 0.6));
        u.lamp = new THREE.Mesh(GEO.eye, new THREE.MeshBasicMaterial({ color: 0xffb432 })); u.lamp.scale.setScalar(4.5); u.lamp.position.y = 34; o.add(u.lamp);
        u.ringM = TW_RING();
        const ring = new THREE.Mesh(new THREE.RingGeometry(66, 72, 64).rotateX(-Math.PI / 2), u.ringM); ring.position.y = 4.3; o.add(ring);
      } else if (ob.kind === 'crate') {
        u.box = new THREE.Group();
        u.box.add(part(GEO.box, mat('#56653f', { roughness: 0.8 }), 0, 8, 0, 22, 16, 22));
        for (const z of [-11.2, 11.2]) u.box.add(part(GEO.box, mat('#2e3424'), 0, 8, z, 22, 3, 0.4));
        u.chute = new THREE.Mesh(new THREE.SphereGeometry(30, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#d8d4c8', { roughness: 0.9, side: THREE.DoubleSide }));
        u.chute.scale.y = 0.5; u.chute.position.y = 60; u.box.add(u.chute);
        o.add(u.box);
        u.beam = new THREE.Mesh(new THREE.CylinderGeometry(6, 10, 300, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xff4030, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        u.beam.position.y = 150; o.add(u.beam);
      } else {                                                                     // 탈것 자리 — 연료를 들고 오면 붉은 고리
        u.ringM = TW_RING(); u.ringM.uniforms.uCol.value.set(0xff5a3a); u.ringM.uniforms.uBase.value.set(0x401008);
        const ring = new THREE.Mesh(new THREE.RingGeometry(112, 120, 64).rotateX(-Math.PI / 2), u.ringM); ring.position.y = 4.4; o.add(ring);
      }
      dyn.tw.set(ob, o); scene.add(o); MOON.dirty = true;
    }
    const u = o.userData;
    o.position.set(ob.x, 0, ob.y);
    o.visible = near(ob.x, ob.y, 1100);
    if (ob.kind === 'panel') {
      const run = tw && tw.phase === 'run';
      const blink = ob.done ? 1 : run ? (Math.sin(g.time * 16) > 0 ? 1 : 0.2) : (Math.sin(g.time * 4) > 0.3 ? 1 : 0.3);
      const c = ob.done ? 0x78f08c : run ? 0xff4a32 : 0xffb432;
      u.lamp.material.color.set(c).multiplyScalar(blink * 2.6);
      u.ringM.uniforms.uProg.value = ob.prog || 0; u.ringM.uniforms.uCol.value.set(ob.done ? 0x78e68c : run ? 0xff5a3a : 0xf0c850);
      if (o.visible) pushLight(ob.x, 40, ob.y, run ? 220 : 140, tmpC.set(c), (run ? 1.8 : 1.1) * blink);
    } else if (ob.kind === 'crate') {
      o.visible = o.visible && !ob.lost;
      u.box.position.y = (ob.fall || 0) * 260;
      u.chute.visible = (ob.fall || 0) > 0.02;
      u.beam.visible = !ob.done;
      if (o.visible && !ob.done) pushLight(ob.x, 30, ob.y, 200, tmpC.set(0xff4030), 1.6 + Math.sin(g.time * 11) * 0.5);
    } else {
      o.visible = o.visible && !ob.done && g.player.carry === 'fuel';
      u.ringM.uniforms.uProg.value = (g.time * 0.5) % 1;
      if (o.visible) pushLight(ob.x, 30, ob.y, 180, tmpC.set(0xff5a3a), 1.1);
    }
  }
  for (const [ob, o] of dyn.tw) if (!seen.has(ob)) { scene.remove(o); dyn.tw.delete(ob); }
}
/* 값싼 빛 모으기 — 매 프레임 후보(가로등 · 간판 · 불 · 출구)를 카메라 둘레 가까운 순으로 골라 시점 좌표로 넣는다 */
let carry3 = null, SHOVE3 = null, STAR3 = null;
/** 땅마다 발이 잠기는 깊이 — 물은 정강이, 진흙은 발목, 모래는 발등 */
const SINK = [0, 1.6, 0, 6, 0, 3.2, 1.5, -7];      // 7 = 크레이터 테 위 — 솟은 흙에 올라선다
/** 발 딛는 높이 — 개미지옥 안이면 깔때기 비탈의 깊이, 아니면 지형에 빠지는 만큼 */
function groundY(w, x, z, terr) {
  if (w.pitIdx) { const q = w.pitAt(x, z); return q ? -q.depth : w.bermAt(x, z); }
  return -(SINK[terr] || 0);
}
const clCand = [], clTmp = new THREE.Vector3(), tmpC = new THREE.Color();
const SODIUM = new THREE.Color(1.0, 0.62, 0.3);
function lampFlick(l, t) {
  if (l.state !== 2) return 1;
  const k = Math.sin(t * 13 + l.seed) + Math.sin(t * 31.7 + l.seed * 3) * 0.6;
  return k > 0.55 ? 0.08 : 0.85 + Math.sin(t * 50) * 0.1;
}
function pushLight(x, y, z, r, color, k) { clCand.push([Math.hypot(x - camT.x, z - camT.z), x, y, z, r, color.r * k, color.g * k, color.b * k]); }
function gatherLights(g) {
  const t = g.time;
  let nc = 0;
  for (const [, ch] of chunks) for (const l of ch.userData.lamps) {
    if (!l.state) continue;
    if (Math.abs(l.x - camT.x) > 900 || Math.abs(l.z - camT.z) > 760) continue;
    const f = lampFlick(l, t);
    pushLight(l.x, l.y - 4, l.z, 175, SODIUM, 1.0 * f);
    if (nc < LCONE_MAX) {
      dm.compose(dpos.set(l.x, l.y, l.z), dq.identity(), dsc.set(l.y * 0.62, l.y, l.y * 0.62));
      lampCones.setMatrixAt(nc, dm);
      lampCones.instanceColor.setXYZ(nc, SODIUM.r * f, SODIUM.g * f, SODIUM.b * f);
      nc++;
      addGlow(l.x, l.y - 5, l.z + 4, 30, SODIUM, 0.6 * f);
    }
  }
  for (const [, ch] of chunks) for (const m of ch.userData.marks || []) {
    if (Math.abs(m.x - camT.x) > 900 || Math.abs(m.z - camT.z) > 760) continue;
    tmpC.setRGB(m.c[0], m.c[1], m.c[2]);
    pushLight(m.x, m.y, m.z, m.r, tmpC, m.k);
    if (m.glow) addGlow(m.x, m.y, m.z, m.glow, tmpC, 0.35);
  }
  lampCones.count = nc; lampCones.instanceMatrix.needsUpdate = true; lampCones.instanceColor.needsUpdate = true;
  glows.count = nGlow; glows.instanceMatrix.needsUpdate = true; glows.instanceColor.needsUpdate = true; nGlow = 0;
  MAT.lensFlick.emissiveIntensity = 4 * lampFlick({ state: 2, seed: 1.7 }, t);
  clCand.sort((a, b) => a[0] - b[0]);
  const n = Math.min(clCand.length, PERF.level >= 1 ? 12 : CL_MAX, window.LC_CLMAX !== undefined ? window.LC_CLMAX : 99);
  const V = camera.matrixWorldInverse;
  for (let i = 0; i < n; i++) {
    const c = clCand[i];
    clTmp.set(c[1], c[2], c[3]).applyMatrix4(V);
    CL.v.value[i].set(clTmp.x, clTmp.y, clTmp.z, c[4]);
    CL.c.value[i].set(c[5], c[6], c[7]);
  }
  CL.n.value = n;
  clCand.length = 0;
}
/** 빛 속 먼지 — 플레이어 둘레에 떠다니는 점. 손전등 원뿔 안에 들어온 것만 반짝인다 */
const DUST_N = 420;
function makeDust() {
  const g = new THREE.BufferGeometry(), p = new Float32Array(DUST_N * 3), sd = new Float32Array(DUST_N);
  for (let i = 0; i < DUST_N; i++) { p[i * 3] = (Math.random() - 0.5) * 640; p[i * 3 + 1] = 4 + Math.random() * 70; p[i * 3 + 2] = (Math.random() - 0.5) * 640; sd[i] = Math.random(); }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('seed', new THREE.BufferAttribute(sd, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uApex: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3(1, 0, 0) }, uCos: { value: Math.cos(CONE_HALF) }, uRange: { value: 400 }, uTime: { value: 0 }, uScale: { value: 400 }, uOrigin: { value: new THREE.Vector3() } },
    vertexShader: `attribute float seed; uniform vec3 uApex, uDir, uOrigin; uniform float uCos, uRange, uTime, uScale; varying float vA;
      void main(){
        vec3 p = position + vec3(sin(uTime * 0.3 + seed * 40.0) * 14.0, sin(uTime * 0.5 + seed * 17.0) * 6.0, cos(uTime * 0.27 + seed * 23.0) * 14.0);
        p.xz = mod(p.xz - uOrigin.xz + 320.0, 640.0) - 320.0 + uOrigin.xz;
        vec3 v = p - uApex; float d = length(v);
        float inC = smoothstep(uCos, uCos + 0.06, dot(v / max(d, 0.001), uDir));
        vA = inC * clamp(1.0 - d / uRange, 0.0, 1.0) * smoothstep(20.0, 60.0, d) * (0.4 + 0.6 * fract(seed * 7.13 + uTime * 0.2));
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_PointSize = (1.2 + seed * 1.8) * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vA; void main(){ vec2 q = gl_PointCoord - 0.5; float k = smoothstep(0.5, 0.0, length(q)); gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * vA * k * 1.6, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  const o = new THREE.Points(g, m); o.frustumCulled = false; o.renderOrder = 6;
  return o;
}
/** 빗방울 물결 — 플레이어 둘레 바닥에 번지는 고리. 손전등 안에서만 또렷하다 */
const RIP_N = 160;
let ripples = null;
function makeRipples() {
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const off = new Float32Array(RIP_N * 3);
  for (let i = 0; i < RIP_N; i++) { off[i * 3] = (Math.random() - 0.5) * 700; off[i * 3 + 1] = (Math.random() - 0.5) * 700; off[i * 3 + 2] = Math.random(); }
  const ig = new THREE.InstancedBufferGeometry().copy(geo); ig.instanceCount = RIP_N;
  ig.setAttribute('off', new THREE.InstancedBufferAttribute(off, 3));
  const m = new THREE.ShaderMaterial({
    uniforms: dust.material.uniforms,
    vertexShader: `attribute vec3 off; uniform vec3 uApex, uDir, uOrigin; uniform float uCos, uRange, uTime; varying vec2 vUv; varying float vK, vA;
      void main(){ vUv = uv;
        // 물방울마다 제 박자(초당 1.0‒1.6 번)로, 한 번 튈 때마다 둘레 700 안의 새 자리에 — 같은 자리에 되풀이해 떨어지지 않게
        float rate = 1.0 + fract(off.x * 0.0137 + off.y * 0.0071) * 0.6, tt = uTime * rate + off.z;
        float ph = fract(tt); vK = ph;
        float cyc = floor(tt);
        vec2 jit = vec2(fract(sin(cyc * 12.9898 + off.z * 78.233) * 43758.5453), fract(sin(cyc * 39.346 + off.z * 11.135) * 24634.6345));
        vec2 wp = off.xy + jit * 700.0;                       // 세계 좌표의 자리 — 걸어도 물방울 자리가 따라오지 않게
        vec3 c = vec3(uOrigin.x + mod(wp.x - uOrigin.x + 350.0, 700.0) - 350.0, 0.7, uOrigin.z + mod(wp.y - uOrigin.z + 350.0, 700.0) - 350.0);
        vec3 v = c - uApex; float d = length(v);
        vA = (0.02 + 0.42 * smoothstep(uCos, uCos + 0.06, dot(v / max(d, 0.001), uDir)) * clamp(1.0 - d / uRange, 0.0, 1.0)) * (1.0 - ph) * (1.0 - ph);   // 은은하게 — 하얀 고리가 화면을 덮었다
        vec3 p = c + position * (2.5 + ph * 7.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `varying vec2 vUv; varying float vK, vA; void main(){ float r = length(vUv - 0.5) * 2.0; float ring = smoothstep(0.2, 0.0, abs(r - 0.78)) * 0.8; gl_FragColor = vec4(vec3(0.7, 0.78, 0.86) * ring * vA, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  ripples = new THREE.Mesh(ig, m); ripples.frustumCulled = false; ripples.renderOrder = 2;
  return ripples;
}
/** 밤하늘 환경 — 웅덩이 · 젖은 면에 비치는 아주 어두운 하늘과 먼 도시 불빛(주황) */
function makeEnv() {
  const es = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vD; void main(){
      float y = vD.y; vec3 top = vec3(0.03, 0.04, 0.06), hor = vec3(0.12, 0.08, 0.055), low = vec3(0.01);
      vec3 c = y > 0.0 ? mix(hor, top, pow(y, 0.45)) : mix(hor * 0.5, low, pow(-y, 0.5));
      float a = atan(vD.z, vD.x); c += vec3(0.09, 0.05, 0.02) * pow(max(0.0, sin(a * 3.0 + 1.0)), 18.0) * smoothstep(0.35, 0.0, abs(y));
      gl_FragColor = vec4(c, 1.0); }`
  }));
  es.add(sky);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(es, 0, 0.1, 200);
  pm.dispose();
  return rt.texture;
}
function makeComposer() {
  // 다중 표본(MSAA)은 HDR 버퍼에서 값이 크다 — 터치 기기(화소가 촘촘해 계단이 덜 보인다)에서는 끈다
  const touch = matchMedia && matchMedia('(pointer: coarse)').matches;
  const samples = window.LC_SAMPLES !== undefined ? window.LC_SAMPLES : touch ? 2 : 4;          // 터치 기기도 2 — 계단이 덜 보인다(느리면 자동 화질 1 단계에서 끈다)
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.5, 1.25);   // 문턱을 올려 가로등 · 불꽃만 번지게(손전등 받은 면은 번지지 않게)
  composer.addPass(bloom);
  grade = new ShaderPass(GradeShader);
  grade.material.toneMapped = false;
  composer.addPass(grade);
}
/** 손전등이 벽에 막히는 거리 — 빛줄기 길이를 거기서 끊는다 */
function beamReach(w, x, y, ca, sa, range) {
  for (let d = 24; d < range; d += 10) {
    const tx = Math.floor((x + ca * d) / TILE), ty = Math.floor((y + sa * d) / TILE);
    if (w.deco[w.idx(tx, ty)] === D_BUILDING) return d + 6;
  }
  return range;
}

function init() {
  cv = document.createElement('canvas');
  cv.id = 'view3d';
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  const stage = document.getElementById('stage');
  stage.insertBefore(cv, stage.firstChild);
  cv.addEventListener('webglcontextlost', e => { e.preventDefault(); fail('lost'); });
  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: SETTINGS.quality === 'low', powerPreference: 'high-performance' });   // 후처리 버퍼가 MSAA 를 하므로 화면 버퍼에는 필요 없다
  // 셰이더가 이 기기에서 안 엮이면(빛 · 균일 변수 한도 등) 검은 화면 대신 2D 로
  renderer.debug.onShaderError = (gl, prog, vs, fs) => {
    let msg = '';
    try { msg = gl.getProgramInfoLog(prog) || gl.getShaderInfoLog(fs) || gl.getShaderInfoLog(vs) || ''; } catch (_) { /* 무시 */ }
    fail('shader', msg.trim() || 'compile');
  };
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.75;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040507);
  scene.fog = new THREE.FogExp2(0x06080c, 0.00062);
  camera = new THREE.PerspectiveCamera(FOV, 1, 20, 4000);
  camera.layers.enable(CHAR_LAYER);                              // 사람 · 시체 · 총은 1 층 — 화면과 손전등 그림자에는 보이고, 달빛 그림자 지도에는 안 들어간다
  makeTextures(); makeMaterials(); makeGeos();
  scene.environment = window.LC_NOENV ? null : makeEnv();
  beam = makeBeam(); dust = makeDust(); scene.add(beam, dust, makeRipples(), makeLampCones(), makeGlows(), ...makeFire(), ...makeHazards());
  makeComposer();
  loadChars();
  HEAD_M = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.6, 3.8) });
  BLINK_M = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.6, 0.3) });
  HEAD_BEAM_M = beam.material.clone(); HEAD_BEAM_M.uniforms.uInt.value = 0.07; HEAD_BEAM_M.uniforms.uTime = beam.material.uniforms.uTime;

  // 달빛과 하늘빛 — 아주 어둡게. 거리와 벽의 윤곽만 겨우 읽힌다
  hemi = new THREE.HemisphereLight(0x6f80a0, 0x15171c, 0.6);
  moon = new THREE.DirectionalLight(0x9aaed6, 0.95);
  moon.position.set(-300, 800, -500);
  // 달빛 그림자 — 건물이 길 · 옥상에 긴 그림자를 드리운다. 카메라가 보는 범위만 덮는 직교 상자
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  // 범위는 화면에 보이는 땅 + 따라가는 간격(MOON_SNAP)의 절반. 지도는 매 프레임이 아니라 간격을 넘거나 도시가 바뀔 때만 다시 그린다
  Object.assign(moon.shadow.camera, { left: -860, right: 860, top: 800, bottom: -800, near: 10, far: 2600 });
  moon.shadow.autoUpdate = false; moon.shadow.needsUpdate = true;
  moon.shadow.bias = -0.0008; moon.shadow.normalBias = 1.2;
  scene.add(hemi, moon, moon.target);
  // 손전등 — 가슴 높이에서 나가는 원뿔. 그림자를 드리운다
  spot = new THREE.SpotLight(0xfff1df, 9, 520, CONE_HALF * 1.05, 0.42, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.camera.near = 8; spot.shadow.camera.far = 620;
  spot.shadow.bias = -0.0006; spot.shadow.normalBias = 0.6;
  spot.shadow.camera.layers.enable(CHAR_LAYER);
  spotTarget = new THREE.Object3D();
  scene.add(spot, spotTarget); spot.target = spotTarget;
  muzzle = new THREE.PointLight(0xffc880, 0, 300, 0); scene.add(muzzle);
  R3D._fill = new THREE.PointLight(0xb8c4d8, 1.6, 215, 0); scene.add(R3D._fill);   // 플레이어 둘레의 옅은 빛(2D 의 '주변 미광') — 하늘빛을 줄인 뒤로 나와 바로 곁의 것이 어둠에 묻히지 않게
  blast = new THREE.PointLight(0xffd090, 0, 520, 0); scene.add(blast);


  // 핏자국 · 작은 핏방울 — 바닥에 눕힌 판의 인스턴스
  const decMat = (tex) => enhanceNew(new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.18, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, envMapIntensity: 1.5 }));
  splatMesh = new THREE.InstancedMesh(GEO.plane, decMat(TEX.splat), MAXDEC); splatMesh.count = 0; splatMesh.receiveShadow = true; splatMesh.frustumCulled = false;
  dotMesh = new THREE.InstancedMesh(GEO.plane, decMat(TEX.dot), MAXDEC); dotMesh.count = 0; dotMesh.receiveShadow = true; dotMesh.frustumCulled = false;
  scene.add(splatMesh, dotMesh);
  // 파티클 — 피 · 불똥 · 안개 · 연기
  partGeo = new THREE.BufferGeometry();
  partGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(MAXP * 3), 3));
  partGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(MAXP * 3), 3));
  particles = new THREE.Points(partGeo, new THREE.PointsMaterial({ size: 5, vertexColors: true, map: TEX.glow, transparent: true, depthWrite: false, sizeAttenuation: true }));
  particles.frustumCulled = false; scene.add(particles);
  // 불똥 · 총알이 튀는 빛 — 가산 혼합, HDR 이라 번진다
  sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(MAXP * 3), 3));
  sparkGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(MAXP * 3), 3));
  sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 4, vertexColors: true, map: TEX.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  sparks.frustumCulled = false; scene.add(sparks);
  // 총알 궤적
  tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(200 * 6), 3));
  tracers = new THREE.LineSegments(tracerGeo, new THREE.LineBasicMaterial({ color: new THREE.Color(4, 3, 1.5), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  tracers.frustumCulled = false; scene.add(tracers);
  // 비 — 카메라 둘레 상자 안에서 떨어지는 짧은 선
  rainGeo = new THREE.BufferGeometry();
  const rp = new Float32Array(RAIN_N * 6);
  for (let i = 0; i < RAIN_N; i++) { const x = (Math.random() - 0.5) * 1600, y = Math.random() * 700, z = (Math.random() - 0.5) * 1400; rp.set([x, y, z, x - 4, y - 22, z], i * 6); }
  rainGeo.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
  // 빗줄기는 손전등 원뿔 안에서 반짝인다(먼지와 같은 원뿔 값을 쓴다)
  dust.material.uniforms.uRainCol = { value: new THREE.Vector3(0.62, 0.7, 0.8) };
  rain = new THREE.LineSegments(rainGeo, new THREE.ShaderMaterial({
    uniforms: dust.material.uniforms,
    vertexShader: `uniform vec3 uApex, uDir; uniform float uCos, uRange; varying float vA;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vec3 v = w.xyz - uApex; float d = length(v);
        float inC = smoothstep(uCos, uCos + 0.05, dot(v / max(d, 0.001), uDir)) * clamp(1.0 - d / (uRange * 1.1), 0.0, 1.0);
        vA = 0.16 + inC * 1.4; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: 'uniform vec3 uRainCol; varying float vA; void main(){ gl_FragColor = vec4(uRainCol * vA, vA); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  rain.frustumCulled = false; scene.add(rain);
  // 출구 — 빛나는 고리와 옅은 빛기둥
  exitRing = new THREE.Mesh(GEO.ring, new THREE.MeshBasicMaterial({ color: 0x50c8ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
  exitRing.scale.set(40, 1, 40);
  exitBeam = new THREE.Mesh(new THREE.CylinderGeometry(30, 34, 260, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x50c8ff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  scene.add(exitRing, exitBeam);
  for (let i = 0; i < 6; i++) { const n = part(GEO.ico, mat('#3a4a2a', { roughness: 0.5 }), 0, 0, 0, 3.2, 3.2, 3.2); n.visible = false; charLayer(n); nadeMeshes.push(n); scene.add(n); }
  // 총구 불꽃 · 폭발 섬광 — 빛(점광원)과 함께 보이는 밝은 판
  const addSprite = (c, sz) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); m.scale.set(sz, sz, 1); m.visible = false; scene.add(m); return m; };
  R3D._flash = addSprite(0xffd090, 34);
  R3D._flash.material.map = TEX.star; R3D._flash.material.color.setRGB(3.2, 2.3, 1.1);
  R3D._flashCore = addSprite(0xffffff, 14); R3D._flashCore.material.color.setRGB(2.4, 2.1, 1.6);
  R3D._boom = addSprite(0xffe0a0, 220);
  R3D._boomCore = addSprite(0xffffff, 90);
  window.addEventListener('resize', size);
  SETTINGS.onChange(k => { if (k === 'quality' || k === 'aspect' || k === null) size(); });
  // 바닥 · 벽 무늬 — 비스듬히 내려다보므로 비등방성 거르기로 먼 쪽 결이 뭉개지지 않게
  const an = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);
  for (const k in MAT) for (const t of ['map', 'normalMap', 'roughnessMap', 'emissiveMap']) if (MAT[k][t] && MAT[k][t].anisotropy < an) { MAT[k][t].anisotropy = an; MAT[k][t].needsUpdate = true; }
  size();
}
/* 느린 기기 — 프레임이 오래 걸리면 해상도 → 그림자 → 해상도 순으로 한 단계씩 내린다('높음' 설정이면 그대로) */
const PERF = { ema: 16, last: 0, since: 0, level: 0, calm: 0, frame: 0 };
/** 끊김 추적 — 무거운 일(덩어리 · 인물 · 소품 만들기, 셰이더 엮기)의 횟수 · 합 · 최대(ms). R3D.prof 로 본다 */
const PROF = R3D.prof = { progs: [] };
function prof(k, t0) { const d = performance.now() - t0, e = PROF[k] || (PROF[k] = [0, 0, 0]); e[0]++; e[1] += d; if (d > e[2]) e[2] = d; return d; }
/** 단계별 픽셀 배율 상한 — '자동'이라도 1 밑으로는 내리지 않는다(화면보다 낮은 해상도는 계단 · 뭉개짐이 눈에 띈다).
    대신 MSAA → 그림자 → 빛 번짐(후처리) 순으로 덜어 낸다. '선명하게'는 기기 배율 2 까지 */
const PR_CAP = [1.5, 1.25, 1.0, 1.0];
/** 휴대폰 · 태블릿 — 화면이 촘촘해 1.25 로도 선명하고, 후처리(HDR · 빛 번짐)를 칠할 화소가 3 할 준다 */
const PR_CAP_TOUCH = [1.25, 1.1, 1.0, 1.0];
function perfStep(now) {
  const dt = now - PERF.last;
  PERF.last = now;
  if (dt > 3000) { PERF.since = now; return; }          // 메뉴 · 탭 전환 뒤 — 다시 재기 시작
  // 한 번씩 멈칫하는 프레임(모형 · 덩어리 · 셰이더 준비)은 120ms 로 잘라 센다 — 예전엔 그대로 세어 시작 직후의
  // 준비 끊김만으로 화질을 내렸고, 화질을 내리는 일이 다시 셰이더를 전부 엮어 끊김이 이어졌다.
  // 꾸준히 느린 기기(프레임마다 40ms 넘게)는 그대로 내려간다
  PERF.ema += (Math.min(dt, 120) - PERF.ema) * 0.05;
  if (SETTINGS.quality === 'high' || PERF.level >= 3 || document.hidden || now < PERF.calm) return;
  // 36ms(약 28fps) 아래로 2.5초 머물면 한 단계 — 예전 42ms 는 20fps 대까지 버텨 휴대폰에서 끊김이 그대로 보였다
  if (now - PERF.since > 2500 && PERF.ema > 36) {
    PERF.level++; PERF.since = now; PERF.ema = 30;
    (PROF.lv || (PROF.lv = [])).push([Math.round(now), PERF.level]);
    // 어느 단계도 셰이더를 다시 엮지 않는다(재질 · 출력 색공간을 바꾸지 않음) — 바꾸는 순간 수십 개가 한꺼번에 엮여 멈춘다
    if (PERF.level === 1 && composer) for (const t of [composer.renderTarget1, composer.renderTarget2]) if (t.samples) { t.samples = 0; t.dispose(); }
    if (PERF.level === 2) {                              // 그림자는 끄지 않고 가볍게 — 달빛 그림자 지도를 줄이고 두 프레임에 한 번 그린다
      moon.shadow.mapSize.set(1024, 1024); if (moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; } MOON.dirty = true;
      renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
    }
    if (PERF.level === 3) {                              // 빛 번짐을 끄고 손전등 그림자 지도도 줄인다(후처리 자체는 남겨 색 · 셰이더가 그대로)
      if (bloom) bloom.enabled = false;
      spot.shadow.mapSize.set(512, 512); if (spot.shadow.map) { spot.shadow.map.dispose(); spot.shadow.map = null; }
    }
    size();
  }
}
function size() {
  if (!renderer) return;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, SETTINGS.quality === 'low' ? 0.75 : SETTINGS.quality === 'high' ? 2 : (matchMedia && matchMedia('(pointer: coarse)').matches ? PR_CAP_TOUCH : PR_CAP)[PERF.level]));
  const SW = (window.STAGE && window.STAGE.w) || window.innerWidth, SH = (window.STAGE && window.STAGE.h) || window.innerHeight;
  renderer.setSize(SW, SH, false);
  if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(SW, SH); grade.uniforms.uRes.value.set(SW * renderer.getPixelRatio(), SH * renderer.getPixelRatio()); }
  // 화면 비율이 가변 — 16:9 를 기준으로, 그보다 좁은 화면(4:3 태블릿 · 세로 휴대폰)은 시야각을 넓히고
  // 카메라를 조금 물려 좌우가 너무 좁아지지 않게 한다. 둘을 나눠 쓰는 까닭: 시야각만 키우면 화면 위쪽이
  // 멀리까지 늘어지고, 거리만 늘리면 사람이 작아진다. 더 넓은 화면(21:9)은 기준 그대로 옆이 더 보인다
  const a = SW / Math.max(1, SH), r = Math.max(1, Math.min(3.2, (16 / 9) / a));
  camera.aspect = a;
  VIEW.fov = 2 * Math.atan(Math.tan(FOV / 2 * Math.PI / 180) * Math.pow(r, 0.45)) * 180 / Math.PI;
  camera.fov = lensFov();
  VIEW.dist = Math.pow(r, 0.2);
  applyFocus(SW, SH);
}
/** 인물이 화면 어디에 오는가(비율 좌표). 세로 터치 화면은 조금 위(42%) — 아래쪽은 엄지가 가린다(2D 판과 같은 높이).
    설정 판이 열려 있으면 판 바깥 자리의 가운데(R3D.setFocus) */
function applyFocus(SW, SH) {
  if (!camera) return;
  SW = SW || (window.STAGE && window.STAGE.w) || innerWidth; SH = SH || (window.STAGE && window.STAGE.h) || innerHeight;
  const touch = matchMedia && matchMedia('(pointer: coarse)').matches;
  const [fx, fy] = VIEW.focus || [0.5, touch && SW < SH ? 0.42 : 0.5];
  if (fx !== 0.5 || fy !== 0.5) camera.setViewOffset(SW, SH, SW * (0.5 - fx), SH * (0.5 - fy), SW, SH); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
R3D.setFocus = (fx, fy) => { VIEW.focus = fx === null || fx === undefined ? null : [fx, fy]; applyFocus(); };
const VIEW = { dist: 1, fov: FOV, vz: 0, focus: null };
/* 시점 거리(설정 0‒100) → 배율. 100 = 1(가장 멀리), 0 = 0.34(인물이 약 3배).
   0.62 까지는 카메라를 당기고(입체감), 그보다 가까이는 렌즈를 좁힌다 — 더 당기면 카메라가 높은 건물
   지붕보다 낮아져 남쪽 건물이 사람을 가린다 */
const VZ_NEAR = 0.34, DOLLY_MIN = 0.62;
function viewZoom() { return VZ_NEAR + (1 - VZ_NEAR) * (SETTINGS.get('view3d') ?? 100) / 100; }
function lensFov() {
  const k = Math.min(1, (VIEW.vz || 1) / DOLLY_MIN);
  return 2 * Math.atan(Math.tan(VIEW.fov / 2 * Math.PI / 180) * k) * 180 / Math.PI;
}

/** 도시의 공기 — 가로등 빛깔 · 안개 · 색 보정 */
function applyKit(w) {
  const K = kitOf(w);
  SODIUM.setRGB(K.lamp[0], K.lamp[1], K.lamp[2]);
  scene.fog.color.setHex(K.fog); scene.fog.density = K.fogD;
  scene.background.setHex(K.fog);
  grade.uniforms.uSh.value.set(...K.sh); grade.uniforms.uHi.value.set(...K.hi);
  // 땅빛 — 모래 도시 · 눈 도시는 차도와 보도에 색을 곱한다. 마른 땅은 덜 번들거린다
  MAT.asphalt.color.setRGB(...(K.ground || [1, 1, 1])); MAT.sidewalk.color.setRGB(...(K.side || [1, 1, 1]));
  MAT.asphalt.envMapIntensity = 1.8 * (K.wet ?? 1); MAT.sidewalk.envMapIntensity = 1.1 * (K.wet ?? 1);
  MAT.plaza.color.setRGB(...(K.plaza || K.side || [1, 1, 1]));
  MAT.water.emissive.setHex(w.theme.canals ? 0x08222a : 0x03090c);
  RAIN_KIND = w.theme.weather === 'sandstorm' ? 2 : (w.theme.weather === 'snow' || w.theme.weather === 'blizzard') ? 1 : 0;
  rain.material.uniforms.uRainCol.value.set(...[[0.62, 0.7, 0.8], [1.6, 1.65, 1.75], [1.1, 0.82, 0.5]][RAIN_KIND]);
  resetRain();
}
function resetWorld(w) {
  clearChunks();
  for (const [, h] of dyn.humans) removeHuman(h);
  for (const k of ['props', 'decor', 'signs', 'humans', 'corpses', 'pickups', 'relays', 'tw']) { for (const [, o] of dyn[k]) scene.remove(o); dyn[k].clear(); }
  dropPlayer();
  for (const lm of LM3) scene.remove(lm); LM3.length = 0;
  curWorld = w; MOON.dirty = true;
  PERF.calm = performance.now() + 5000;                  // 새 판의 준비 끊김은 화질 판단에서 뺀다
  ensureSignMats(w);
  applyKit(w);
  buildLandmarks(w);
}

/* 카메라 — 플레이어 앞쪽(바라보는 방향)으로 조금 당긴 곳을 남쪽 위에서 내려다본다 */
const camT = new THREE.Vector3();
function placeCamera(g) {
  // 시점 거리 — 설정을 끄는 동안 부드럽게 따라간다(약 0.1초에 남은 차이의 70%, 프레임 빠르기와 무관)
  const want = viewZoom(), now = performance.now(), dt = Math.min(0.5, (now - (VIEW.t || now)) / 1000);
  VIEW.t = now;
  VIEW.vz = VIEW.vz ? VIEW.vz + (want - VIEW.vz) * (1 - Math.exp(-dt * 12)) : want;
  if (Math.abs(VIEW.vz - want) < 0.002) VIEW.vz = want;
  const f = lensFov();
  if (Math.abs(camera.fov - f) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); }
  const vz = (R3D.zoom || 1) * VIEW.vz;
  const p = g.player, lead = 70 * Math.min(1, vz);
  // 흔들림 · 반동 — 카메라와 바라보는 점을 함께 옮긴다(화면 전체가 밀린다 = 2D 와 같은 세기).
  // 예전엔 카메라만 옮기고 바라보는 점은 그대로여서 화면 가운데(플레이어)가 거의 움직이지 않았다(2D 의 1/10)
  const sh = g.shake > 0.1 && SETTINGS.shake ? g.shake : 0;
  const ox = (Math.random() - 0.5) * sh + (g.kickX || 0), oz = (Math.random() - 0.5) * sh + (g.kickY || 0);
  const tx = p.x + Math.cos(p.angle) * lead + ox, tz = p.y + Math.sin(p.angle) * lead + oz;
  camT.set(tx, 12, tz);
  const D = DIST * Math.max(DOLLY_MIN, vz) * VIEW.dist;
  camera.position.set(tx, D * Math.sin(PITCH), tz + D * Math.cos(PITCH));
  camera.lookAt(camT);
  camera.updateMatrixWorld();
}

/* 세계 → 화면(논리 좌표) · 화면 → 세계(가슴 높이 평면) */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -20), hit = new THREE.Vector3();
R3D.project = (x, y, h = 20) => {
  const v = window.G.view();
  if (!camera) return [x, y];
  tmpV.set(x, h, y).project(camera);
  return [(tmpV.x + 1) / 2 * v.W, (1 - tmpV.y) / 2 * v.H];
};
R3D.unproject = (sx, sy) => {
  const v = window.G.view();
  if (!camera) return null;
  ndc.set(sx / v.W * 2 - 1, -(sy / v.H * 2 - 1));
  ray.setFromCamera(ndc, camera);
  return ray.ray.intersectPlane(plane, hit) ? [hit.x, hit.z] : null;
};
R3D.info = () => renderer ? { chunks: chunks.size, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, programs: renderer.info.programs.length, level: PERF.level, ms: Math.round(PERF.ema), failed: R3D.failed } : null;
/** 검사용 — 어둠 가리개 세기 · 발밑 고리(예전 플레이어 후광) 수 · 밀치기가 파동 셰이더인지 */
R3D._probe = () => { let halo = 0; if (scene) scene.traverse(o => { if (o.material && o.material.fragmentShader && o.material.fragmentShader.includes('float core = (1.0 - smoothstep(0.0, 0.75, r))')) halo++; });
  return { dark: grade ? grade.uniforms.uDarkK.value.x : 0, muzzleK: grade ? grade.uniforms.uDarkM.value.y : 0, flashK: grade ? grade.uniforms.uDarkF.value.w : 0, halo, shoveShader: !!(SHOVE3 && SHOVE3[0] && SHOVE3[0].material.isShaderMaterial && SHOVE3[0].material.uniforms.uHead), stars: STAR3 ? STAR3.length : 0 }; };
R3D._dbg = () => ({ chunkSteps, CHAR, dyn, THREE, renderer, scene, camera, moon, hemi, spot, bloom, grade, MAT, CL, PERF, makeRig, blendRig, player: player3 });
R3D.hide = () => { if (cv) cv.style.display = 'none'; };
/** 판 준비 — '시작'을 누른 그 순간(브리핑 화면이 떠 있는 동안) 도시 · 둘레 덩어리 25 개 · 인물 · 첫 그림을 모두 마친다.
    예전엔 이 일이 게임 화면이 뜬 뒤의 첫 프레임들에 나뉘어 몰려 시작하자마자 여러 번 멈칫했다 */
R3D.prime = g => {
  if (!R3D.ok || !g || !g.world || !g.player) return;
  try {
    const t0 = performance.now();
    if (!renderer) init();
    if (g.world !== curWorld) resetWorld(g.world);
    placeCamera(g);
    syncChunks(g.world, camT.x, camT.z, true);
    for (const sg of g.world.signs) signTexture(sg.text, sg.col);     // 간판 글씨는 여기서 미리 다 그린다(판 도중에 하나 5‒30ms)
    PRIMING = true; try { draw3(g); } finally { PRIMING = false; }
    PROF.prime = Math.round(performance.now() - t0);
  } catch (e) { fail('init', e); }
};
/** 미리 준비 — 타이틀 화면에서 렌더러를 만들고 인물 모형을 읽어 셰이더를 미리 엮어 둔다.
    예전엔 '시작'을 누른 첫 프레임에 이 모두(모형 해석 · 셰이더 60여 개)가 몰려 첫 판이 여러 번 멈칫했다 */
R3D.preload = () => {
  try { if (!renderer) { init(); R3D.hide(); } } catch (e) { fail('init', e); }
};
/** 셰이더 미리 엮기 — 공용 재질 · 인물 몸체마다 상자 하나씩을 장면에 잠깐 넣고 엮는다. 실제 그리기와 같은 조건이어야
    같은 셰이더가 재사용된다: 빛은 장면의 것, 출력은 후처리 버퍼(선형 색공간). 엮기를 나눠 해 주는 확장이 있으면 기다리지 않는다 */
function warmShaders() {
  if (!renderer || PROF.warm || !renderer.compileAsync) return;
  PROF.warm = 'busy';
  const t0 = performance.now(), grp = new THREE.Group(), box = new THREE.BoxGeometry(1, 1, 1);
  const seen = new Set(), extra = [];
  const add = m => { if (!m || seen.has(m)) return; seen.add(m); const o = new THREE.Mesh(box, m); o.castShadow = o.receiveShadow = true; grp.add(o); };
  for (const k in MAT) add(MAT[k]);
  for (const c of [texMatCache, matCache, matTCache]) for (const [, m] of c) add(m);
  if (CHAR.ready) try {
    grp.add(makeRig('xbot', { look: { skin: '#8a8f7c', top: '#5a5a50', pants: '#2d3440' } }));
    for (const t of ['zombie', 'hazmat']) grp.add(makeRig('soldier', { tex: t }));
    const keepG = pGun, keepL = chestLamp;             // 플레이어 몸체는 총 · 가슴 손전등을 전역에 걸어 둔다 — 미리 엮기용은 따로
    grp.add(makePlayerRig()); extra.push(pGun, chestLamp); pGun = keepG; chestLamp = keepL;
  } catch (_) { /* 모형이 이상해도 미리 엮기는 건너뛰면 그만 */ }
  grp.position.set(camT.x, -400, camT.z);
  scene.add(grp);
  const prev = renderer.getRenderTarget();
  if (composer && SETTINGS.quality !== 'low') renderer.setRenderTarget(composer.renderTarget1);
  let p;
  try { p = renderer.compileAsync(scene, camera); } catch (e) { p = Promise.resolve(); }
  renderer.setRenderTarget(prev);
  const done = () => { scene.remove(grp); for (const o of extra) if (o) scene.remove(o); grp.traverse(o => { if (o.userData && o.userData.mixer) o.userData.mixer.stopAllAction(); }); PROF.warm = Math.round(performance.now() - t0) + 'ms'; };
  p.then(done, done);
}

/* ═══════════ 매 프레임 ═══════════ */
/** 밤의 어둠 가리개 — 화면에서 플레이어 · 손전등 끝 · 발밑 반경을 재서 색 보정 셰이더에 넘긴다.
    밝기 50 에서 원뿔 밖은 원래 빛의 약 20% 만 남는다(밝기를 올리면 옅어진다). 번개가 치면 잠깐 다 보인다 */
function darkMask(g) {
  const p = g.player, v = window.G.view(), U = grade.uniforms;
  const range = p.dead ? 0 : p.lightRange;
  const [px, py] = R3D.project(p.x, p.y, 8);
  const L = SETTINGS.flash ? g.lightning : g.lightning * 0.3;
  const dark = Math.max(0, Math.min(0.97, 0.8 - (SETTINGS.brightness - 50) * 0.008)) * (1 - Math.min(1, L * 1.6));
  let ex = px, ey = py;
  if (range > 0) {
    const reach = beamReach(g.world, p.x, p.y, Math.cos(p.angle), Math.sin(p.angle), range) + 40;
    [ex, ey] = R3D.project(p.x + Math.cos(p.angle) * reach, p.y + Math.sin(p.angle) * reach, 0);
  }
  const [nx, ny] = R3D.project(p.x + 170, p.y, 8);
  const asp = v.W / v.H;
  U.uDarkP.value.set(px / v.W, 1 - py / v.H, ex / v.W, 1 - ey / v.H);
  U.uDarkK.value.set(dark, Math.hypot((nx - px) / v.W * asp, (ny - py) / v.H), Math.tan(CONE_HALF) * 1.05, asp);
  // 총구 화염 — 반경 300(총구 빛과 같은 거리). 3D 는 발밑 둘레(170)가 이미 트여 있으니 2D(160)보다 넓혀야 쏠 때 둘레가 '번쩍' 드러난다
  const [mx, my] = R3D.project(p.x + 300, p.y, 8);
  U.uDarkM.value.set(Math.hypot((mx - px) / v.W * asp, (my - py) / v.H), p.muzzle > 0 && !p.dead ? 0.75 : 0);
  // 폭발 섬광 — 지금 가장 센 것 하나
  let best = null, bk = 0;
  for (const f of g.flashes) { const k = 1 - f.t / f.life; if (k > bk) { bk = k; best = f; } }
  if (best) {
    const r = best.r * (0.5 + 0.5 * (1 - bk)), [fx, fy] = R3D.project(best.x, best.y, 8), [rx, ry] = R3D.project(best.x + r, best.y, 8);
    U.uDarkF.value.set(fx / v.W, 1 - fy / v.H, Math.hypot((rx - fx) / v.W * asp, (ry - fy) / v.H), bk);
  } else U.uDarkF.value.w = 0;
}
R3D.render = g => {
  try { draw3(g); } catch (e) { fail('init', e); }
};
function draw3(g) {
  if (!renderer) init();
  perfStep(performance.now());
  const w = g.world, p = g.player;
  if (w !== curWorld) resetWorld(w);
  cv.style.display = '';
  const T0 = performance.now();
  placeCamera(g);
  FRUST.setFromProjectionMatrix(FR_M.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  syncChunks(w, camT.x, camT.z);
  const T1 = performance.now();
  const near = (x, y, m) => Math.abs(x - camT.x) < m && Math.abs(y - camT.z) < m * 1.1;

  TEX.waterN.offset.set(g.time * 0.012, g.time * 0.02);
  const blinkOn = (g.time % 1.1) < 0.55;
  BLINK_M.color.setRGB(blinkOn ? 3 : 0.15, blinkOn ? 1.6 : 0.08, blinkOn ? 0.3 : 0.02);
  { const led = (g.time % 1.6) < 0.14; ALARM_LED_M.color.setRGB(led ? 4 : 0.25, led ? 0.3 : 0.02, led ? 0.2 : 0.01); }
  // 탈것 · 장식 · 간판 — 게임이 플레이어 곁의 사본으로 옮겨 둔 자리
  for (const pr of w.props) {
    let o = dyn.props.get(pr);
    if (!near(pr.x, pr.y, 1100)) { if (o && o.visible) { o.visible = false; MOON.dirty = true; } continue; }
    if (!o) { const t0 = performance.now(); o = mergeStatic(makeProp(pr)); dyn.props.set(pr, o); scene.add(o); prof('prop', t0); MOON.dirty = true; }
    if (!o.visible) MOON.dirty = true;
    o.visible = true; o.position.set(pr.x, 0, pr.y); o.rotation.y = -pr.a;
    if (o.userData.head) { const ca = Math.cos(pr.a), sa = Math.sin(pr.a), hd = o.userData.head; pushLight(pr.x + ca * (hd + 70), 14, pr.y + sa * (hd + 70), 190, HEAD_C, 1.3); if (blinkOn) pushLight(pr.x, 14, pr.y, 90, BLINK_C, 0.9); }
    if (o.userData.fire) addFire(pr.x + Math.cos(pr.a) * pr.w * 0.18, 12, pr.y + Math.sin(pr.a) * pr.w * 0.18, 1, o.userData.fire);
    // 경보기 달린 차 — 평소엔 계기판의 붉은 점이 깜빡인다(쏘지 말라는 신호). 울리면 비상등이 번갈아 번쩍이고 차가 들썩인다
    if (pr.alarm) {
      if (!o.userData.led) { o.userData.led = new THREE.Mesh(GEO.eye, ALARM_LED_M); o.userData.led.scale.setScalar(1.6); o.userData.led.position.set(4, 15, 0); o.add(o.userData.led); }
      o.userData.led.visible = !pr.spent;
      if (pr.ringing) {
        const on = ((g.time * 4) | 0) % 2, ca = Math.cos(pr.a), sa = Math.sin(pr.a);
        for (const sg of [-1, 1]) pushLight(pr.x + ca * pr.w * 0.55 * sg, 14, pr.y + sa * pr.w * 0.55 * sg, 170, ALARM_C, (on ? 2.4 : 0.25));
        o.position.y = Math.abs(Math.sin(g.time * 18)) * 0.8;
      }
    }
  }
  // 드럼통 불 — 덩어리가 들고 있는 자리
  for (const [, ch] of chunks) for (const f of ch.userData.fires) addFire(f.x, f.y, f.z, f.s, f.seed);
  for (const d of w.decor) {
    if (d.kind === 'tree' && w.deco[w.idx(Math.floor(d.x / TILE), Math.floor(d.y / TILE))] === D_BUILDING) continue;
    let o = dyn.decor.get(d);
    if (!near(d.x, d.y, 1100)) { if (o && o.visible) { o.visible = false; MOON.dirty = true; } continue; }
    if (!o) { const t0 = performance.now(); o = mergeStatic(makeDecor(d)); dyn.decor.set(d, o); scene.add(o); prof('decor', t0); MOON.dirty = true; }
    if (!o.visible) MOON.dirty = true;
    o.visible = true; o.position.set(d.x, d.kind === 'boat' ? -6 : (w.deco[w.idx(Math.floor(d.x / TILE), Math.floor(d.y / TILE))] === D_SIDEWALK ? 3 : 0), d.y);
    o.rotation.y = -(d.a || 0) + (d.wall === 'n' ? Math.PI / 2 : d.wall === 'w' ? 0 : d.wall === 'e' ? Math.PI : d.wall ? -Math.PI / 2 : 0);
  }
  updateSigns(g, w, near);
  updateLandmarks(g, w);
  updateHumans(g, p);
  updateCorpses(g, near);
  updateDecals(g, near);
  updateParticles(g);
  updatePickups(g, near);
  updateHazards(g, near);
  if ((g.maws && g.maws.length) || MAW3) updateMaws(g, near);
  updateMisc(g, p, w);
  updateLights(g, p, w);
  updateRain(g, p);
  updateFires(g);
  gatherLights(g);
  lampCones.material.uniforms.uTime.value = g.time;
  // 플레이어를 가리는 벽 · 지붕은 둘레를 뚫어 비친다
  tmpV.set(p.x, 22, p.y).project(camera);
  const bw = renderer.domElement.width, bh2 = renderer.domElement.height;
  SEE.pos.value.set((tmpV.x + 1) / 2 * bw, (tmpV.y + 1) / 2 * bh2);
  SEE.depth.value = (tmpV.z + 1) / 2 - 0.0004;
  SEE.rad.value = 95 * bh2 / Math.max(1, (window.STAGE && window.STAGE.h) || window.innerHeight) * Math.max(1, ((window.STAGE && window.STAGE.h) || window.innerHeight) / 800);
  // 후처리 — '가볍게' 설정이나 가장 낮은 화질 단계에서는 끈다
  const T2 = performance.now();
  const fx = composer && SETTINGS.quality !== 'low';
  if (!renderer.shadowMap.autoUpdate) renderer.shadowMap.needsUpdate = (PERF.frame++ & 1) === 0;
  if (fx) {
    grade.uniforms.uTime.value = g.time;
    grade.uniforms.uLift.value = (SETTINGS.brightness - 50) / 50;
    darkMask(g);
    bloom.strength = 0.5 + Math.min(1, g.lightning) * 0.4;
    composer.render();
  } else renderer.render(scene, camera);
  if (window.LC_TRACE) { const T3 = performance.now(); if (T3 - T0 > 200) (PROF.slow || (PROF.slow = [])).push([Math.round(g.time * 10) / 10, Math.round(T1 - T0), Math.round(T2 - T1), Math.round(T3 - T2), renderer.info.render.calls, renderer.info.memory.textures]); }
  // 새로 엮인 셰이더 — 판 도중에 생기면 그 프레임이 멈칫한다(미리 엮기에서 빠진 것을 찾는 데 쓴다)
  const pl = renderer.info.programs;
  if (pl.length !== PROF.np) { for (let i = PROF.np || 0; i < pl.length; i++) PROF.progs.push([Math.round(g.time * 10) / 10, pl[i].name, pl[i].cacheKey.length > 60 ? pl[i].cacheKey.slice(0, 60) : pl[i].cacheKey]); PROF.np = pl.length; if (PROF.progs.length > 300) PROF.progs.splice(0, 100); }
};

function updateSigns(g, w, near) {
  const t = g.time, lit = [];
  let fresh = 0;
  for (const sg of w.signs) {
    let o = dyn.signs.get(sg);
    const X = (sg.x + 0.5) * TILE, Z = (sg.y + 0.5) * TILE;
    if (!near(X, Z, 900)) { if (o) o.visible = false; continue; }
    if (!o && fresh++ > 0 && !PRIMING) continue;                                     // 간판 하나에 글씨 그리기 5‒7ms — 한 프레임에 하나만 만든다
    if (!o) { const t0 = performance.now(); o = makeSign(sg); dyn.signs.set(sg, o); scene.add(o); prof('sign', t0); }
    const dead = (sg.ph * 10 | 0) % 3 === 0;
    const flick = dead ? 0.08 : (sg.ph * 7 | 0) % 4 === 0 ? (Math.sin(t * 23 + sg.ph * 9) > 0.3 ? 1 : 0.15) : 0.85 + Math.sin(t * 2 + sg.ph) * 0.15;
    o.userData.mat.opacity = flick;
    // 간판은 그 건물 칸의 바깥 면에 붙인다
    const side = sg.side || 's', off = TILE / 2 + 0.8, hgt = FLOOR_PX * 1.35;
    if (side === 's') { o.position.set(X, hgt, Z + off); o.rotation.set(0, 0, 0); }
    else if (side === 'n') { o.position.set(X, hgt, Z - off); o.rotation.set(0, Math.PI, 0); }
    else if (side === 'e') { o.position.set(X + off, hgt, Z); o.rotation.set(0, Math.PI / 2, 0); }
    else { o.position.set(X - off, hgt, Z); o.rotation.set(0, -Math.PI / 2, 0); }
    o.visible = true;
    if (!dead) lit.push([Math.hypot(X - camT.x, Z - camT.z), sg, o, flick]);
  }
  // 간판 불빛 — 간판 앞 바닥과 젖은 길에 색이 번진다(값싼 빛)
  for (const [, sg, o, f] of lit) {
    clTmp.set(0, 0, 1).applyEuler(o.rotation);
    pushLight(o.position.x + clTmp.x * 18, FLOOR_PX * 1.05, o.position.z + clTmp.z * 18, 150, tmpC.set(sg.col), 1.6 * f);
  }
}

function zombieLook(z) {
  const k = MODELS.lookOf(z), t = z.t;
  const look = { top: k.top, pants: k.pants, skin: k.skin, hair: k.hair, eyes: true, gore: true };
  if (k.hazmat) { look.hood = '#e2e0d6'; look.hair = null; }
  if (k.helmet) { look.helmet = '#3d4330'; look.hair = null; }
  if (t.bloat) { look.belly = t.body; look.skin = t.head; }
  if (t.spit) look.sac = '#7da040';
  if (t.weeper) { look.top = t.body; look.pants = t.body; look.skin = t.head; look.hair = '#121212'; }
  if (t.boss || t.size >= 18) { look.top = t.boss ? t.body : '#3b3f3a'; look.skin = t.boss ? t.head : k.skin; look.sleeve = t.boss ? t.head : k.skin; }
  if (t.scream) { look.top = t.body; look.skin = t.head; }
  return look;
}
const FLASH_M = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.15, 1.1, 1.05) });
function setFlash(h, on) {
  if (!!h.userData.flashOn === on) return;
  h.userData.flashOn = on;
  h.traverse(o => { if (!o.isMesh || o.material === EYE) return; if (on) { o.userData.m0 = o.material; o.material = FLASH_M; } else if (o.userData.m0) o.material = o.userData.m0; });
}

/* ═══════════ 사실적인 인물 — 뼈대 · 애니메이션이 있는 3D 모형 ═══════════
   두 몸체: 남성 시민(xbot — 몸 부위별로 옷 색을 칠한다),
   군인(soldier — 플레이어 · 대피 기지의 감염체 · 방호복). 모두 같은 Mixamo 뼈대라 걷기 · 뛰기 · 서기 동작을 나눠 쓴다.
   좀비다운 자세(앞으로 뻗은 팔, 구부정한 등, 꺾인 고개)는 동작 위에 세계 좌표 보정으로 덧입힌다.
   모형을 불러오기 전 · 실패하면 예전의 단순 인형으로 그린다 */
const CHAR = { ready: false, loading: false, body: {} };
const MODEL_H = 50;
/** 사람 · 감염체의 보이는 크기 — 건물 · 차와 비율을 맞춰 0.6 (판정 반지름은 그대로) */
const CHAR_S = 0.6;
/** 사람 층 — 화면과 손전등 그림자에만 그린다(달빛 그림자 지도는 멈춘 것만 담아 가끔 다시 그린다) */
const CHAR_LAYER = 1;
function charLayer(o) { if (o) o.traverse(c => c.layers.set(CHAR_LAYER)); return o; }
const MOON_SNAP = 64, MOON = { x: NaN, z: NaN, dirty: true, age: 0 };
/** 화면 안인가 — 카메라 시야 원뿔과 공(x, 높이 r/2, z, 반지름 r). 매 프레임 한 번 시야를 잡는다 */
const FRUST = new THREE.Frustum(), FR_M = new THREE.Matrix4(), FR_S = new THREE.Sphere();
function inView(x, z, r) { FR_S.center.set(x, r * 0.5, z); FR_S.radius = r; return FRUST.intersectsSphere(FR_S); }
function modelSrc(k) { return (window.LC_MODELS && window.LC_MODELS[k]) || ('vendor/models/' + k + '.glb'); }
/** 모형 하나 — 단일 파일 판(아티팩트)은 모형을 data: 로 품고 있다. 그곳의 보안 정책(CSP)은 fetch 를 막으므로
    (connect-src) 네트워크를 쓰지 않고 base64 를 직접 풀어 파싱한다. 안의 그림도 fetch 를 쓰는 ImageBitmapLoader 대신
    <img> 로 읽게 createImageBitmap 을 파서가 만들어지는 동안만 가린다 */
function loadModel(L, src) {
  if (!src.startsWith('data:')) return L.loadAsync(src);
  const b64 = src.slice(src.indexOf(',') + 1), bin = atob(b64), buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const cib = window.createImageBitmap;
  try { window.createImageBitmap = undefined; } catch (_) { /* 무시 */ }
  return new Promise((ok, bad) => {
    try { L.parse(buf.buffer, '', ok, bad); } catch (e) { bad(e); }
    try { window.createImageBitmap = cib; } catch (_) { /* 무시 */ }
  });
}
function loadChars() {
  if (CHAR.loading) return; CHAR.loading = true; CHAR.t0 = performance.now();
  const L = new GLTFLoader();
  // 여성 몸체(michelle, 2.4MB)는 rc.16 부터 쓰지 않는다 — 불러오지 않는다(첫 판 버퍼링의 절반이었다)
  Promise.all(['xbot', 'soldier'].map(k => loadModel(L, modelSrc(k)).then(g => [k, g])))
    .then(list => {
      const t0 = performance.now();
      const G = Object.fromEntries(list);
      const walk = G.xbot.animations;
      prepBody('xbot', G.xbot, walk);
      prepBody('soldier', G.soldier, G.soldier.animations);
      CHAR.ready = true; CHAR.prepMs = Math.round(performance.now() - t0); CHAR.loadMs = Math.round(performance.now() - CHAR.t0);
      PERF.calm = Math.max(PERF.calm, performance.now() + 3000);
      resetPeople();
      warmShaders();
    })
    .catch(e => { CHAR.failed = true; try { console.warn('[LEFT CITY 3D] 인물 모형을 불러오지 못해 단순 인형으로 그립니다', e); } catch (_) { /* 무시 */ } });
}
const clipBy = (clips, re) => clips.find(c => re.test(c.name));
/** 다른 몸체의 동작을 빌려 쓸 때 — 뼈 길이 · 엉덩이 기준을 바꾸는 위치 · 크기 트랙은 버리고 회전만 */
function rotOnly(clip, dropHips) {
  const c = clip.clone();
  c.tracks = c.tracks.filter(t => t.name.endsWith('.quaternion') && !(dropHips && /Hips/.test(t.name)));
  return c;
}
function prepBody(k, gltf, clips, borrow) {
  const sc = gltf.scene;
  sc.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(sc), H = box.max.y - box.min.y || 1.8;
  const B = { scene: sc, scale: MODEL_H / H, lift: -box.min.y * (MODEL_H / H), meshes: [] };
  const pick = re => { const c = clipBy(clips, re); return c ? (borrow ? rotOnly(c, true) : c) : null; };
  B.clips = { walk: pick(/^walk$/i), run: pick(/^run$/i), idle: pick(/^idle$/i) };
  sc.traverse(o => { if (o.isSkinnedMesh) B.meshes.push(o); });
  // 재질 — 원래 무늬(색 · 노멀)를 쓰되 값싼 빛을 받게. 변형마다 따로
  B.mats = {};
  const orig = B.meshes.map(m => m.material);
  if (k === 'xbot') {
    // 관절 고리(기계처럼 보이는 따로 된 메시)는 숨기고 매끈한 몸만 쓴다
    for (const m of B.meshes) if (/Joints/i.test(m.material.name)) m.visible = false;
    B.meshes = B.meshes.filter(m => m.visible);
    // 몸 부위 — 묶음 자세(T)에서 높이 · 옆 거리로 0 피부 · 1 윗옷 · 2 바지 · 3 신발 · 4 소매(팔뚝) · 5 머리카락
    for (const m of B.meshes) {
      // 정점 좌표가 압축(양자화)돼 있을 수 있어 경계 상자로 원래 크기(키 1.806m)에 맞춰 푼다
      const pp = m.geometry.attributes.position, reg = new Float32Array(pp.count);
      m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox, sc0 = (bb.max.y - bb.min.y) / 1.806, cx0 = (bb.max.x + bb.min.x) / 2, cz0 = (bb.max.z + bb.min.z) / 2;
      for (let i = 0; i < pp.count; i++) {
        const x = Math.abs((pp.getX(i) - cx0) / sc0), y = (pp.getY(i) - bb.min.y) / sc0;
        const z = (pp.getZ(i) - cz0) / sc0 + 0.0166;
        reg[i] = y > 1.66 || (y > 1.56 && z < -0.02 && x < 0.12) ? 5 : y > 1.47 && x < 0.2 ? 0 : x > 0.66 ? 0 : x > 0.44 ? 4 : y < 0.09 ? 3 : y < 0.97 ? 2 : 1;
      }
      m.geometry.setAttribute('region', new THREE.BufferAttribute(reg, 1));
    }
  } else {
    const src = orig[orig.length - 1].map || orig[0].map;
    B.tex = { base: src };
    if (src && src.image) {
      B.tex.zombie = zombify(src.image, k === 'soldier' ? 0 : 1, 0);
      B.tex.zombie2 = zombify(src.image, k === 'soldier' ? 0 : 1, 1);
      if (k === 'soldier') B.tex.hazmat = zombify(src.image, 2, 0);
      else B.tex.zombie3 = zombify(src.image, 1, 2);
    }
    B.normal = (orig[orig.length - 1].normalMap || orig[0].normalMap) || null;
  }
  CHAR.body[k] = B;
}
/** 무늬를 좀비 빛깔로 — 피부(붉은 기 도는 밝은 색)는 잿빛 초록으로, 옷은 빛을 빼고 때와 피를 얹는다.
    mode 0: 군인(옷은 그대로 어둡게) · 1: 시민(옷 색을 변형마다 돌린다) · 2: 방호복(희게) */
function zombify(img, mode, variant) {
  const S = 512, [c, x] = cnv(S, S);
  x.drawImage(img, 0, 0, S, S);
  const d = x.getImageData(0, 0, S, S), a = d.data;
  const hueRot = [0, 2.1, 4.0][variant % 3];
  for (let i = 0; i < a.length; i += 4) {
    let r = a[i] / 255, g = a[i + 1] / 255, b = a[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, sat = mx - mn;
    if (mode === 0) {                                           // 군인 — 황갈색 갑옷은 국방색, 붉은 줄은 검붉게
      if (r > 0.5 && r - b > 0.15 && r > g) { const v = l * 0.62; r = v * 0.78; g = v * 0.84; b = v * 0.58; }
      else if (r > 0.45 && g < 0.25 && b < 0.25) { r = 0.22; g = 0.08; b = 0.06; }
      else { r *= 0.7; g *= 0.72; b *= 0.68; }
      a[i] = r * 255; a[i + 1] = g * 255; a[i + 2] = b * 255; continue;
    }
    const skin = r > g && g > b * 0.95 && r - b > 0.08 && sat < 0.55 && l > 0.25 && mode !== 2;
    if (skin) { const v = l * 0.72; r = v * 0.86; g = v * 0.95; b = v * 0.8; }
    else if (mode === 2) { const v = 0.55 + l * 0.4; r = v; g = v * 0.98; b = v * 0.92; }
    else {
      const v = l * 0.8;
      if (mode === 1 && sat > 0.06) {                          // 옷 색 돌리기 (YIQ 회전)
        const yv = 0.299 * r + 0.587 * g + 0.114 * b, iv = 0.596 * r - 0.274 * g - 0.322 * b, qv = 0.211 * r - 0.523 * g + 0.312 * b;
        const ch = Math.cos(hueRot), sh = Math.sin(hueRot), i2 = iv * ch - qv * sh, q2 = iv * sh + qv * ch;
        r = yv + 0.956 * i2 + 0.621 * q2; g = yv - 0.272 * i2 - 0.647 * q2; b = yv - 1.106 * i2 + 1.703 * q2;
      }
      r = r * 0.55 + v * 0.3; g = g * 0.55 + v * 0.3; b = b * 0.55 + v * 0.3;
    }
    a[i] = Math.max(0, Math.min(255, r * 255)); a[i + 1] = Math.max(0, Math.min(255, g * 255)); a[i + 2] = Math.max(0, Math.min(255, b * 255));
  }
  x.putImageData(d, 0, 0);
  const rr = rng(13 + variant * 7 + mode * 3);
  for (let i = 0; i < 40; i++) blob(x, rr() * S, rr() * S, 10 + rr() * 50, 6 + rr() * 30, rr() * 3, 'rgba(40,30,20,.3)', 'rgba(40,30,20,0)');
  for (let i = 0; i < 26; i++) {
    const bx0 = rr() * S, by0 = rr() * S, R = 8 + rr() * 36;
    blob(x, bx0, by0, R, R * 0.7, rr() * 3, 'rgba(75,5,4,.85)', 'rgba(75,5,4,0)');
    x.fillStyle = 'rgba(60,4,3,.7)'; for (let k = 0; k < 3; k++) x.fillRect(bx0 + (rr() - 0.5) * R, by0, 2 + rr() * 2, 12 + rr() * 50);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 4;
  return t;
}
/** 남성 시민 재질 — 부위 색을 사람마다 정한다(같은 셰이더, 색만 다른 재질) */
function regionMat(look) {
  const m = new THREE.MeshStandardMaterial({ map: TEX.rags, roughness: 0.85 });
  const U = { uSkin: { value: new THREE.Color(look.skin) }, uTop: { value: new THREE.Color(look.top) }, uPants: { value: new THREE.Color(look.pants) }, uShoe: { value: new THREE.Color(look.shoes || '#15171a') }, uSleeve: { value: new THREE.Color(look.sleeve || look.top) }, uHair: { value: new THREE.Color(look.hair || '#1a1614') } };
  enhance(m, false, look.rim);
  const ob = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'attribute float region; varying float vRegion;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRegion = region;');
    sh.fragmentShader = 'uniform vec3 uSkin, uTop, uPants, uShoe, uSleeve, uHair; varying float vRegion;\n' + sh.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\n diffuseColor.rgb *= vRegion < 0.5 ? uSkin : vRegion < 1.5 ? uTop : vRegion < 2.5 ? uPants : vRegion < 3.5 ? uShoe : vRegion < 4.5 ? uSleeve : uHair;');
    ob(sh, r);
  };
  const key = m.customProgramCacheKey();
  m.customProgramCacheKey = () => key + '-region';
  return m;
}
const texMatCache = new Map();
function texMat(tex, normal, rough, rim) {
  const key = tex.uuid + (rim || '');
  if (!texMatCache.has(key)) texMatCache.set(key, enhance(new THREE.MeshStandardMaterial({ map: tex, normalMap: normal, roughness: rough }), false, rim));
  return texMatCache.get(key);
}
const BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg'];
/** 사람 한 명 — kind: xbot | soldier, skin: 무늬 변형 이름 또는 부위 색(look) */
function makeRig(kind, opt = {}) {
  const B = CHAR.body[kind];
  const root = new THREE.Group(), body = new THREE.Group(), inner = cloneSkinned(B.scene);
  inner.scale.setScalar(B.scale); inner.rotation.y = Math.PI / 2; inner.position.y = B.lift;
  body.add(inner); root.add(body);
  let mtl;
  if (kind === 'xbot') mtl = regionMat(opt.look);
  else mtl = texMat(B.tex[opt.tex] || B.tex.base, B.normal, 0.8, opt.rim);
  const meshes = [];
  inner.traverse(o => { if (o.isSkinnedMesh && o.visible) { o.material = mtl; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; meshes.push(o); } });
  const bones = {};
  inner.traverse(o => { if (o.isBone) { const n = o.name.replace(/^mixamorig:?/, ''); if (BONES.includes(n)) bones[n] = o; } });
  const mixer = new THREE.AnimationMixer(inner), acts = {};
  for (const k in B.clips) if (B.clips[k]) { acts[k] = mixer.clipAction(B.clips[k]); acts[k].play(); acts[k].setEffectiveWeight(k === 'idle' ? 1 : 0); }
  for (const k in acts) acts[k].time = Math.random() * acts[k].getClip().duration;
  root.userData = { rig: true, kind, body, inner, bones, mixer, acts, w: { walk: 0, run: 0, idle: 1 }, mtl, meshes };
  return root;
}
/** 동작 섞기 — 목표 무게 쪽으로 부드럽게 */
function blendRig(h, target, rate, dt, speed) {
  const u = h.userData;
  for (const k in u.acts) {
    const tw = target === k ? 1 : 0;
    u.w[k] += (tw - u.w[k]) * Math.min(1, dt * rate);
    u.acts[k].setEffectiveWeight(u.w[k]);
    u.acts[k].setEffectiveTimeScale(k === 'idle' ? 1 : speed);
  }
  u.mixer.update(dt);
}
/* 뼈 보정 — 세계 좌표의 목표 방향으로 뼈(길이 축 +Y)를 돌린다. w 만큼 섞는다 */
const bq = new THREE.Quaternion(), bq2 = new THREE.Quaternion(), bv = new THREE.Vector3(), bv2 = new THREE.Vector3(), YAX = new THREE.Vector3(0, 1, 0);
function boneAxis(b) {
  // 뼈의 길이 축 — 첫 자식 뼈 쪽(묶음 자세의 지역 좌표). 리그마다 +Y 가 아닐 수 있다
  if (!b.userData.ax) { const c = b.children.find(o => o.isBone); b.userData.ax = c && c.position.lengthSq() > 1e-8 ? c.position.clone().normalize() : YAX.clone(); }
  return b.userData.ax;
}
function aimBone(b, dir, w) {
  if (!b) return;
  b.updateWorldMatrix(true, false);
  b.getWorldQuaternion(bq);
  bv.copy(boneAxis(b)).applyQuaternion(bq).normalize();
  bq2.setFromUnitVectors(bv, bv2.copy(dir).normalize());
  const target = bq2.multiply(bq);                                // 새 세계 회전
  b.parent.getWorldQuaternion(bq).invert();
  const local = bq.multiply(target);
  b.quaternion.slerp(local, w);
}
/** 축 둘레로 세계 좌표에서 기울이기 (등 굽히기 · 고개 숙이기) */
function tiltBone(b, axis, ang) {
  if (!b || !ang) return;
  b.updateWorldMatrix(true, false);
  b.getWorldQuaternion(bq);
  bq2.setFromAxisAngle(axis, ang).multiply(bq);
  b.parent.getWorldQuaternion(bq).invert();
  b.quaternion.copy(bq.multiply(bq2));
}
const fwd = new THREE.Vector3(), lat = new THREE.Vector3(), tdir = new THREE.Vector3();
/** 좀비 자세 — 앞으로 뻗은 팔 · 구부정한 등 · 꺾인 고개 · 종류별 변형 */
/** 무거운 땅의 걸음 — 앞으로 내딛는 다리(넓적다리가 앞으로 도는 중)를 무릎 높이 들어 올리고, 상체를 숙이며 팔을 벌린다.
    걷기 동작 위에 덧입히는 뼈 보정 몇 개뿐이라 가볍다 */
const WADE_T = [0, 1, 0, 1, 0, 1, 1, 1];
function wadeGait(u, B, fwdV, latV, dt, k, deep) {
  for (const [ul, ll, key] of [[B.LeftUpLeg, B.LeftLeg, 'wdL'], [B.RightUpLeg, B.RightLeg, 'wdR']]) {
    if (!ul || !ll) continue;
    ul.updateWorldMatrix(true, false); ul.getWorldQuaternion(bq);
    const f = bv.copy(boneAxis(ul)).applyQuaternion(bq).dot(fwdV), prev = u[key] ?? f; u[key] = f;
    const swing = Math.max(0, Math.min(1, (f - prev) / Math.max(dt, 1e-3) * 0.35));
    u[key + 's'] = (u[key + 's'] || 0) + (swing - (u[key + 's'] || 0)) * Math.min(1, dt * 14);    // 부드럽게
    const lift = u[key + 's'] * k * (deep ? 1.25 : 1);
    if (lift > 0.01) { tiltBone(ul, latV, -0.5 * lift); tiltBone(ll, latV, 0.85 * lift); }
  }
  tiltBone(B.Spine, latV, 0.12 * k); tiltBone(B.Spine1, latV, 0.08 * k);
}
function poseZombieRig(h, z, g, dt) {
  const u = h.userData, t = z.t, B = u.bones;
  const sp = u.spd || 0;
  const runner = t.speed > 100 || z.rage;
  // 쫓을 때 걷는 것도 원작처럼 세 배 가까이 빨라진다(초당 140 남짓) — 그 빠르기면 걷기 동작으로는 발이 70% 미끄러져 뛴다
  let [clip, ts] = (t.weeper && !z.rage) ? ['idle', 1] : gaitFor(u, sp, h.scale.x, z.aggro && !t.crawl);
  // 밀쳐진 것 — 걷기 동작을 거꾸로 빠르게 돌려 뒷걸음질로 비틀대며 물러난다
  const shv = z.shoved > 0 && !t.boss && !t.crawl ? 0.6 - z.shoved : -1;
  if (shv > 0.08) { clip = 'walk'; ts = -1.9 * Math.max(0.4, 1 - shv / 0.6); }
  const moving = clip !== 'idle';
  blendRig(h, clip, shv > 0 ? 16 : 11, dt, ts);
  h.updateMatrixWorld(true);
  const face = u.yaw !== undefined ? -u.yaw : z.face;                // 화면에 보이는(부드럽게 돈) 방향 기준
  fwd.set(Math.cos(face), 0, Math.sin(face)); lat.set(fwd.z, 0, -fwd.x);
  // 개체마다 정해진 버릇(구부정함 · 고개 · 절뚝임 · 팔) — 예전엔 지금 위치로 셈해 걸을 때마다 바뀌었고,
  // 특히 팔 자세가 프레임마다 넷 사이를 오가 손이 심하게 떨렸다. 몸체를 만들 때 한 번 정한다
  const seed = u.seed ?? 0.5;
  // 등 · 고개
  const hunch = t.boss ? 0.25 : runner ? 0.45 : 0.32 + seed * 0.15;
  tiltBone(B.Spine, lat, hunch * 0.5); tiltBone(B.Spine1, lat, hunch * 0.5);
  // 고개 — 한쪽으로 기운 채 천천히 흔들린다(예전보다 덜 꺾이게)
  const roll = Math.sin(g.time * 0.9 + seed * 9) * 0.12 + (seed - 0.5) * 0.3;
  tiltBone(B.Neck, fwd, roll * 0.5); tiltBone(B.Head, lat, -0.1 + Math.sin(g.time * 1.7 + seed * 5) * 0.05);
  // 팔 — 개체마다 다르게: 0 두 팔을 앞으로(나란히) · 1 한 팔만 뻗고 한 팔은 늘어뜨림 · 2 두 팔을 늘어뜨림 · 3 팔꿈치를 굽혀 낮게 쥠
  const style = u.style ?? 0;
  const reach = !t.boss && !t.bloat && !t.spit && !t.armor && !t.charge && !t.tongue && !runner && !(t.weeper && !z.rage) && style !== 2;
  const claw = (t.scream && z.screamPhase === 'wind') || (t.weeper && !z.rage) || (t.leap && !!z.leapPhase);
  if (reach || claw) {
    const sw = Math.sin(g.time * 2.2 + seed * 6) * 0.08, W0 = z.aggro ? 0.85 : 0.5;
    for (const [up, lo, sd] of [[B.LeftArm, B.LeftForeArm, 1], [B.RightArm, B.RightForeArm, -1]]) {
      if (claw) { tdir.copy(fwd).multiplyScalar(0.3).addScaledVector(YAX, 0.95).addScaledVector(lat, -sd * 0.3); aimBone(up, tdir, 0.85); aimBone(lo, tdir.addScaledVector(YAX, 0.4), 0.85); continue; }
      if (style === 1 && sd < 0) continue;                         // 오른팔은 걷기 동작대로 늘어뜨린다
      if (style === 3) { tdir.copy(fwd).multiplyScalar(0.6).addScaledVector(YAX, -0.75).addScaledVector(lat, sd * 0.25); aimBone(up, tdir, W0); aimBone(lo, tdir.copy(fwd).addScaledVector(YAX, 0.1).addScaledVector(lat, -sd * 0.15), W0); continue; }
      // 앞으로 나란히 — 어깨너비만큼 벌려 몸 앞에서 엇갈리지 않게, 팔꿈치는 조금 처진다
      tdir.copy(fwd).addScaledVector(lat, sd * (0.1 + sw)).addScaledVector(YAX, -0.22 + sd * sw * 0.4);
      aimBone(up, tdir, W0);
      aimBone(lo, tdir.addScaledVector(YAX, -0.12), W0);
    }
  }
  // 맞으면 맞은 쪽 반대로 상체가 젖혀졌다 돌아온다
  if (z.recoil > 0 && B.Spine1) {
    const k = Math.sin(Math.min(1, z.recoil / 0.28) * Math.PI) * 0.55;
    bv2.set(Math.sin(z.hitAng || 0), 0, -Math.cos(z.hitAng || 0));         // 맞은 방향에 수직인 축
    tiltBone(B.Spine1, bv2, k); tiltBone(B.Head, bv2, k * 0.6);                // 총알이 나아가는 쪽으로 밀린다
  }
  // 밀쳐진 것 — ① 맞는 순간(0.14초) 고개와 상체가 밀린 쪽으로 채찍처럼 꺾이고 두 팔이 위로 튄다
  //           ② 뒷걸음질 — 상체가 젖혀진 채 좌우로 휘청이고, 두 팔을 옆으로 벌려 균형을 잡으며 허우적댄다 ③ 서서히 바로 선다
  if (z.shoved > 0 && B.Spine1) {
    const A = z.shoveA || 0, s = 0.6 - z.shoved, k = Math.min(1, z.shoved / 0.16);
    const whip = s < 0.14 ? Math.sin(s / 0.14 * Math.PI * 0.5) : Math.max(0, 1 - (s - 0.14) / 0.28);
    const wob = Math.sin(s * 21 + (u.seed || 0) * 6) * Math.max(0, 1 - s / 0.55);
    bv2.set(Math.sin(A), 0, -Math.cos(A));                                   // 밀린 방향에 수직인 축 — 이 축으로 뒤로 젖힌다
    tiltBone(B.Spine, bv2, (0.22 + 0.38 * whip) * k); tiltBone(B.Spine1, bv2, (0.16 + 0.34 * whip) * k);
    tiltBone(B.Neck, bv2, 0.55 * whip * k); tiltBone(B.Head, bv2, (0.15 + 0.4 * whip) * k);
    tdir.set(Math.cos(A), 0, Math.sin(A));                                   // 밀린 방향 — 이 축으로 좌우로 휘청인다
    tiltBone(B.Spine1, tdir, wob * 0.28 * k); tiltBone(B.Head, tdir, -wob * 0.2 * k);
    for (const [up, lo, sd] of [[B.LeftArm, B.LeftForeArm, 1], [B.RightArm, B.RightForeArm, -1]]) {
      if (!up) continue;
      const flap = Math.sin(s * 26 + sd * 1.7) * 0.35;
      if (whip > 0.5) tdir.set(-Math.cos(A) * 0.35, 1, -Math.sin(A) * 0.35).addScaledVector(lat, sd * 0.55);            // 위로 튄 팔
      else tdir.copy(lat).multiplyScalar(sd).addScaledVector(YAX, 0.1 + flap + sd * wob * 0.3).addScaledVector(fwd, 0.25);  // 옆으로 벌린 팔
      aimBone(up, tdir, 0.92 * k); aimBone(lo, tdir.addScaledVector(YAX, 0.35 + flap * 0.5), 0.85 * k);
    }
    u.body.position.y = (s < 0.2 ? Math.sin(s / 0.2 * Math.PI) * 4 : 0) * k;
  }
  // 무거운 땅 — 진흙 · 물 · 모래 · 크레이터 비탈에선 무릎을 높이 들고 앞으로 숙여 헤쳐 나간다
  if (moving && !(z.shoved > 0) && !t.crawl && (WADE_T[z.terr] || (z.pitK || 0) > 0.05)) wadeGait(u, B, fwd, lat, dt, 1, (z.pitK || 0) > 0.05 || z.terr === 3);
  // 엎드려 기는 것 — 몸을 앞으로 눕힌다
  if (t.crawl) { u.body.rotation.z = -1.25; u.body.position.y = 7; }
  // 우는 것 — 웅크려 앉아 얼굴을 묻는다
  if (t.weeper && !z.rage) {
    u.body.position.y = -14;
    for (const [ul, ll] of [[B.LeftUpLeg, B.LeftLeg], [B.RightUpLeg, B.RightLeg]]) { aimBone(ul, tdir.copy(fwd).addScaledVector(YAX, 0.15), 1); aimBone(ll, tdir.copy(fwd).multiplyScalar(-0.3).addScaledVector(YAX, -1), 1); }
    tiltBone(B.Spine1, lat, 0.5); tiltBone(B.Head, lat, 0.5);
  } else if (!t.crawl) {
    // 절뚝이는 것 — 넷 중 하나는 한쪽 다리를 끌며 좌우로 휘청인다
    u.body.position.y = 0; u.body.rotation.z = 0;
    u.body.rotation.x = moving && seed > 0.72 ? Math.sin(g.time * (runner ? 7 : 4.2) + seed * 9) * 0.09 : 0;
  }
  // 덮치는 것 — 웅크리면 무릎을 굽혀 가라앉고, 날 때는 몸을 앞으로 뻗은 채 포물선을 그린다
  if (t.leap) {
    if (z.leapPhase === 'crouch') {
      u.body.position.y = -9;
      for (const [ul, ll] of [[B.LeftUpLeg, B.LeftLeg], [B.RightUpLeg, B.RightLeg]]) { aimBone(ul, tdir.copy(fwd).addScaledVector(YAX, 0.1), 0.8); aimBone(ll, tdir.copy(fwd).multiplyScalar(-0.3).addScaledVector(YAX, -1), 0.8); }
      tiltBone(B.Spine, lat, 0.45); tiltBone(B.Spine1, lat, 0.3);
    } else if (z.leapPhase === 'air') {
      const k = 1 - Math.max(0, z.airT) / t.leap.dur;
      u.body.position.y = Math.sin(k * Math.PI) * 20;
      tiltBone(B.Spine, lat, 0.75);
    }
  }
  // 들이받는 것 — 오른팔이 비대하게 부풀었고 왼팔은 말라붙었다. 땅을 긁을 때 어깨를 낮춘다
  if (t.charge && !t.boss && B.RightArm) {
    B.RightArm.scale.setScalar(1.7); if (B.LeftArm) B.LeftArm.scale.setScalar(0.8);
    aimBone(B.RightArm, tdir.copy(fwd).multiplyScalar(0.35).addScaledVector(YAX, -1).addScaledVector(lat, 0.2), 0.7);
    if (z.chargePhase === 'wind') tiltBone(B.Spine, lat, 0.5);
    else if (z.chargePhase === 'dash') tiltBone(B.Spine, lat, 0.35);
  }
  // 휘감는 것 — 기침할 때 몸이 앞으로 꺾이며 들썩인다
  if (t.tongue && z.tonguePhase === 'wind') tiltBone(B.Spine1, lat, 0.45 + Math.sin(g.time * 30) * 0.1);
  // 진압 경찰 — 방패를 든 왼팔을 앞으로
  if (t.armor && B.LeftArm) { aimBone(B.LeftArm, tdir.copy(fwd).addScaledVector(YAX, -0.6).addScaledVector(lat, 0.3), 0.9); aimBone(B.LeftForeArm, tdir.copy(fwd).addScaledVector(lat, -0.5), 0.9); }
  // 부푼 것 — 배가 부풀었다
  if (t.bloat && B.Spine1) { B.Spine1.scale.set(1.55, 1.15, 1.55); B.Spine2.scale.set(1 / 1.3, 1 / 1.05, 1 / 1.3); }
  // 눈 — 머리뼈 앞에 붉은 점 둘
  if (u.eyes) {
    // 가까이 온 것만(360 안) — 어둠 속 두 점이 '거기 뭔가 있다'만 알린다. 멀리서부터 위치를 다 알려 주는 표지판이었다
    const p = g.player, on = (z.aggro || (t.weeper && z.startle > 0.5)) && Math.hypot(z.x - p.x, z.y - p.y) < 360;
    u.eyes.visible = on && !!B.Head;
    if (on && B.Head) { B.Head.getWorldPosition(bv); u.eyes.position.copy(bv).addScaledVector(fwd, 3.4 * h.scale.x).addScaledVector(YAX, 1.2 * h.scale.x); u.eyes.rotation.y = -face; u.eyes.scale.setScalar(h.scale.x); }
  }
}
/** 좀비 생김새 → 몸체 · 무늬 */
function zombieRig(z) {
  const k = MODELS.lookOf(z), t = z.t;
  let h;
  const hs = (Math.imul(Math.floor(z.x * 13 + z.y * 7), 2654435761) >>> 0);
  if (k.helmet || t.armor) h = makeRig('soldier', { tex: hs % 2 ? 'zombie' : 'zombie2' });
  else if (k.hazmat) h = makeRig('soldier', { tex: 'hazmat' });
    else {
    const sp = t.leap || t.tongue || t.charge;
    const look = { skin: deadSkin(t.boss || t.bloat || t.scream || t.weeper ? t.head : k.skin), top: t.boss || t.weeper || t.scream || sp ? t.body : k.top, pants: t.weeper ? t.body : k.pants, shoes: '#141618' };
    for (const q of ['skin', 'top', 'pants']) look[q] = '#' + new THREE.Color(look[q]).multiplyScalar(0.8).getHexString(THREE.SRGBColorSpace);
    look.sleeve = hs % 2 ? look.top : look.skin;                    // 반소매면 팔뚝이 드러난다
    h = makeRig('xbot', { look });
  }
  h.userData.seed = (hs % 9973) / 9973; h.userData.style = (hs >>> 5) & 3;
  const eyes = new THREE.Group();
  for (const sd of [-1, 1]) { const e = new THREE.Mesh(GEO.eye, EYE); e.position.set(0, 0, sd * 1.4); eyes.add(e); }
  eyes.visible = false; scene.add(eyes);
  h.userData.eyes = eyes;
  if (t.armor) {                                                       // 투명 방패 — 앞에서 쏜 총알을 받는다
    const sh = new THREE.Group();
    sh.add(part(GEO.box, new THREE.MeshStandardMaterial({ color: 0x9fb4c4, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.38, depthWrite: false }), 0, 0, 0, 1.2, 30, 20));
    sh.add(part(GEO.box, mat('#1a1d20'), 0, 13.5, 0, 1.6, 2, 20.4));
    sh.add(part(GEO.box, mat('#e8ecef', { emissive: col('#606870'), emissiveIntensity: 0.4 }), 0.7, 4, 0, 0.3, 2.5, 14));
    sh.position.set(10, 22, -2); h.add(sh);
  }
  if (t.spit) { const sac = part(GEO.head, mat('#7da040', { roughness: 0.4, emissive: col('#304a10'), emissiveIntensity: 0.8 }), -4, 34, 0, 1.3, 1.3, 1.3); h.add(sac); }
  return h;
}
function removeHuman(h) { scene.remove(h); if (h.userData.eyes) scene.remove(h.userData.eyes); if (h.userData.mixer) h.userData.mixer.stopAllAction(); }
/** 모형이 준비되면 지금 있는 인형들을 새 모형으로 바꾼다 */
function resetPeople() {
  for (const [, h] of dyn.humans) removeHuman(h); dyn.humans.clear();
  for (const [, o] of dyn.corpses) scene.remove(o); dyn.corpses.clear();
  dropPlayer();
}
function dropPlayer() { if (player3) scene.remove(player3); if (pGun) scene.remove(pGun); if (chestLamp) scene.remove(chestLamp); player3 = null; pGun = null; chestLamp = null; }
/** 플레이어 — 군인 몸체, 두 손으로 총을 겨눈다. 총은 오른손 위치에 따로 둔다 */
let pGun = null;
function attachToBone(bone, obj) {
  bone.updateWorldMatrix(true, false);
  bone.getWorldScale(bv); obj.scale.divide(bv);
  bone.add(obj);
}
function makePlayerRig() {
  // 야간 배송 기사 — 어두운 비옷 · 청바지 · 배낭
  const h = makeRig('xbot', { look: { skin: '#b08a70', top: '#23303c', sleeve: '#23303c', pants: '#2a3442', shoes: '#141414', hair: '#141210', clean: true, rim: '0.05, 0.08, 0.12' } });
  const B = h.userData.bones;
  if (B.Spine2) {
    const pack = new THREE.Group();
    pack.add(part(GEO.box, mat('#3b3428', { roughness: 0.8 }), 0, 0, 0, 1, 1, 1));
    pack.children[0].scale.set(5, 12, 9);
    pack.position.set(0, 0, 0); h.updateMatrixWorld(true);
    const holder = new THREE.Group(); holder.add(pack); pack.position.set(-4.2, 0, 0);
    // 등뼈 좌표가 아니라 몸 좌표로 붙여 두고 매 프레임 등뼈를 따라가게 한다
    h.userData.pack = holder; h.add(holder);
  }
  // 총 — 무기마다 따로 만든 모형. 손잡이가 원점, 총구가 +x
  pGun = new THREE.Group(); pGun.userData.guns = {};
  const blk = mat('#15181c', { roughness: 0.45, metalness: 0.6 }), dark = mat('#0c0d0f', { roughness: 0.6 }), wood = mat('#4a3020', { roughness: 0.7 });
  const chrome = mat('#9aa0a8', { roughness: 0.25, metalness: 0.9 }), red = mat('#8a2a1a', { roughness: 0.5 }), cyan = mat('#60d8ff', { emissive: col('#40c0ff'), emissiveIntensity: 2 });
  const gun = mat('#2a2e33', { roughness: 0.35, metalness: 0.75 }), poly = mat('#1d2024', { roughness: 0.8 }), glass = mat('#203040', { roughness: 0.1, metalness: 0.4, emissive: col('#0a2030'), emissiveIntensity: 0.6 }), brass = mat('#b8913a', { roughness: 0.35, metalness: 0.8 }), olive = mat('#3b4030', { roughness: 0.7 });
  /* 부품 — ['b' 상자 | 'c' x 축 원통 | 'v' y 축 원통, 재질, x, y, z, 크기x, 크기y, 크기z, z 축 기울기(손잡이 · 탄창)] */
  const mk = (key, len, parts) => {
    const gg = new THREE.Group();
    for (const [t, m, x, y, z, sx, sy, sz, rz] of parts) {
      const o = t === 'b' ? part(GEO.box, m, x, y, z, sx, sy, sz) : part(GEO.cyl, m, x, y, z, sx / 2, sy, sz / 2);
      if (t === 'c') { o.rotation.z = Math.PI / 2; o.scale.set(sy / 2, sx, sz / 2); }
      if (rz) o.rotation.z += rz;
      gg.add(o);
    }
    gg.userData.len = len; gg.visible = false; pGun.add(gg); pGun.userData.guns[key] = gg;
  };
  mk('pistol', 9, [['b', blk, 3.6, 1.5, 0, 8, 1.9, 1.5], ['b', poly, 2.6, 0.2, 0, 6.4, 1.1, 1.3], ['b', poly, 0.1, -1.6, 0, 1.9, 3.8, 1.4, -0.22],
    ['b', blk, 2.1, -0.8, 0, 2, 0.35, 0.7], ['c', chrome, 7.8, 1.5, 0, 0.8, 0.9, 0.9], ['b', dark, 7.2, 2.6, 0, 0.5, 0.5, 0.4], ['b', dark, 0.2, 2.6, 0, 0.8, 0.5, 0.9],
    ['b', dark, 1.0, 1.5, 0.78, 2.2, 1.4, 0.06], ['b', dark, 4.6, 1.9, 0.78, 2.2, 0.6, 0.06]]);
  mk('smg', 15, [['b', gun, 5, 1.1, 0, 11, 2.8, 2], ['c', blk, 12.4, 1.4, 0, 4.4, 1.1, 1.1], ['c', dark, 15, 1.4, 0, 1.6, 1.5, 1.5],
    ['b', poly, 4.2, -2.6, 0, 1.7, 4.8, 1.3, 0.12], ['b', poly, -0.3, -1.6, 0, 1.7, 3.4, 1.4, -0.2], ['b', poly, 9.2, -1.4, 0, 1.4, 2.4, 1.2],
    ['b', blk, 1.6, -0.6, 0, 2.2, 0.35, 0.7], ['b', dark, -3.6, 1.2, 0, 5, 1, 0.5], ['b', dark, -6, 0.6, 0, 0.8, 2.6, 1.4],
    ['b', dark, 5, 2.8, 0, 9, 0.5, 1.1], ['b', glass, 4.6, 3.6, 0, 2.6, 1.3, 1.2], ['b', dark, 6.5, 1.3, 1.02, 3, 1, 0.06]]);
  mk('shotgun', 22, [['b', gun, 3.4, 1.4, 0, 8, 2.4, 1.8], ['c', blk, 13, 2, 0, 20, 1.3, 1.3], ['c', dark, 12.5, 0.8, 0, 16, 1.1, 1.1],
    ['b', wood, 11, 0.8, 0, 6, 2, 2.2], ['b', wood, -4.8, 0.5, 0, 9, 2.6, 1.7, 0.1], ['b', poly, -0.3, -1.2, 0, 1.7, 3, 1.4, -0.3],
    ['b', blk, 1.8, -0.4, 0, 2, 0.35, 0.7], ['b', brass, 4.4, 1.6, 0.95, 2.4, 0.9, 0.08], ['b', dark, 22.6, 2.6, 0, 0.5, 0.5, 0.4], ['b', dark, -9.4, 0.4, 0, 0.6, 2.8, 1.8]]);
  mk('rifle', 24, [['b', gun, 6, 1.1, 0, 14, 2.6, 1.8], ['c', blk, 18.5, 1.4, 0, 11, 0.9, 0.9], ['c', dark, 24, 1.4, 0, 1.6, 1.3, 1.3],
    ['c', blk, 5.5, 4.2, 0, 9, 1.8, 1.8], ['c', glass, 10.2, 4.2, 0, 0.5, 2.2, 2.2], ['c', glass, 0.8, 4.2, 0, 0.5, 1.9, 1.9], ['b', dark, 3.5, 3.0, 0, 1, 1.2, 0.8], ['b', dark, 7.5, 3.0, 0, 1, 1.2, 0.8],
    ['b', poly, 5, -2.4, 0, 2.2, 3.4, 1.4, 0.08], ['b', wood, -5.5, 0.4, 0, 10, 2.8, 1.7, 0.08], ['b', poly, -0.2, -1.4, 0, 1.7, 3.2, 1.4, -0.3],
    ['b', blk, 1.8, -0.5, 0, 2, 0.35, 0.7], ['b', chrome, 4, 2.1, 1.0, 1.6, 0.4, 0.4], ['b', wood, 12.5, 0.6, 0, 6, 2.2, 2]]);
  mk('magnum', 12, [['c', chrome, 6.6, 1.6, 0, 8, 1.5, 1.5], ['b', chrome, 6.6, 2.5, 0, 8, 0.5, 0.5], ['c', chrome, 2.1, 1.0, 0, 3.2, 3.2, 3.2],
    ['b', chrome, 0.6, 1.2, 0, 3, 2.4, 1.6], ['b', wood, -0.6, -1.7, 0, 2.1, 3.8, 1.6, -0.3], ['b', chrome, 1.3, -0.6, 0, 2, 0.35, 0.7],
    ['b', dark, -0.8, 2.6, 0, 1, 0.7, 0.6], ['b', dark, 10.4, 2.5, 0, 0.5, 0.8, 0.4], ['c', dark, 2.1, 1.0, 0, 3.3, 0.8, 0.8]]);
  mk('auto', 22, [['b', gun, 7, 1.4, 0, 16, 2.6, 2], ['c', blk, 17, 1.8, 0, 9, 1.4, 1.4], ['c', dark, 21.5, 1.8, 0, 1.6, 2, 2],
    ['b', poly, 6, -1.8, 0, 3.4, 4.4, 2.4], ['b', poly, -0.3, -1.4, 0, 1.7, 3.2, 1.4, -0.3], ['b', dark, -4.5, 1, 0, 8, 2.4, 1.6],
    ['b', dark, 7, 2.9, 0, 12, 0.4, 1], ['b', blk, 1.8, -0.5, 0, 2, 0.35, 0.7], ['b', dark, 6, -1, 1.25, 3, 0.4, 0.08], ['b', dark, 6, -2.4, 1.25, 3, 0.4, 0.08]]);
  mk('lmg', 26, [['b', gun, 8, 1.4, 0, 18, 3.2, 2.4], ['c', blk, 20.5, 1.6, 0, 12, 1.4, 1.4], ['c', dark, 26, 1.6, 0, 1.8, 2, 2],
    ['c', poly, 21, 1.6, 0, 6, 2.4, 2.4], ['b', olive, 6, -3, 0.6, 6.5, 4.4, 4.2], ['b', brass, 6, 0.4, 1.6, 4, 0.7, 1.2],
    ['b', dark, -5, 0.8, 0, 9, 2.6, 1.8], ['b', poly, -0.3, -1.3, 0, 1.8, 3.2, 1.5, -0.3], ['b', dark, 9, 3.4, 0, 12, 0.6, 1.2],
    ['b', blk, 23, -1.6, 1.2, 0.5, 4, 0.5, 0.35], ['b', blk, 23, -1.6, -1.2, 0.5, 4, 0.5, -0.35], ['b', blk, 1.8, -0.6, 0, 2.2, 0.4, 0.8], ['b', dark, 14, 2.8, 0, 1.4, 1.6, 2.6]]);
  mk('crossbow', 18, [['b', wood, 6, 1, 0, 16, 2, 1.8], ['b', dark, 14.5, 1.4, 0, 1.6, 1.6, 2.4], ['b', dark, 14.2, 1.4, 5.5, 1, 1, 9, 0], ['b', dark, 14.2, 1.4, -5.5, 1, 1, 9, 0],
    ['b', chrome, 9, 2.4, 0, 12, 0.4, 0.4], ['b', chrome, 18, 2.4, 0, 2, 0.9, 0.3], ['b', wood, -2.5, 0, 0, 6, 3, 1.6, 0.1], ['b', poly, 0.4, -1.6, 0, 1.6, 3, 1.4, -0.3],
    ['c', blk, 6, 3.6, 0, 6, 1.4, 1.4], ['b', dark, 9.6, 2.4, 3.6, 9.5, 0.15, 0.15, 0.6], ['b', dark, 9.6, 2.4, -3.6, 9.5, 0.15, 0.15, -0.6]]);
  mk('flamer', 20, [['b', blk, 7, 1.2, 0, 14, 2.4, 2.2], ['c', chrome, 16.5, 1.4, 0, 7, 1.8, 1.8], ['c', dark, 20.2, 1.4, 0, 1, 2.4, 2.4],
    ['v', red, -0.5, -0.4, 3.6, 3.4, 7, 3.4], ['v', red, 3.2, -0.4, 3.6, 3.4, 7, 3.4], ['b', chrome, 1.4, 3.3, 3.6, 4.2, 0.6, 0.6],
    ['b', poly, 2, -2.6, 0, 2, 4, 1.4, -0.2], ['b', poly, 9, -1.4, 0, 1.6, 2.6, 1.2], ['b', mat('#ff8a2a', { emissive: col('#ff6a10'), emissiveIntensity: 2.5 }), 20.9, 0.4, 0, 0.6, 0.6, 0.6]]);
  mk('launcher', 18, [['c', blk, 9, 1.6, 0, 12, 4.8, 4.8], ['c', dark, 4, 1.6, 0, 3, 5.6, 5.6], ['c', dark, 15.2, 1.6, 0, 1, 5.2, 5.2],
    ['b', poly, 3, -2.6, 0, 2, 4, 1.6, -0.2], ['b', poly, 10, -2, 0, 1.6, 3, 1.4], ['b', dark, -3, 1, 0, 6, 2.4, 1.8], ['b', glass, 8, 4.8, 1.6, 3, 1.6, 1.2]]);
  mk('rail', 26, [['b', gun, 9, 1.4, 0, 20, 3, 2.4], ['b', cyan, 10, 3.1, 0, 17, 0.5, 0.8], ['b', chrome, 22.5, 2.6, 0, 7, 0.8, 3.2], ['b', chrome, 22.5, 0.2, 0, 7, 0.8, 3.2],
    ['b', cyan, 22.5, 1.4, 0, 6.4, 1.4, 0.6], ['c', dark, 4, 1.4, 1.5, 6, 1.6, 1.6], ['b', dark, -4, 1, 0, 8, 2.6, 1.8], ['b', poly, 3, -2.6, 0, 2, 4, 1.4, -0.2],
    ['b', glass, 7, 4, 0, 4, 1.6, 1.4], ['b', cyan, 1.5, 1.4, -1.25, 3, 1, 0.06]]);
  mk('minigun', 24, [['c', chrome, 13, 1.6, 1.3, 20, 0.9, 0.9], ['c', chrome, 13, 1.6, -1.3, 20, 0.9, 0.9], ['c', chrome, 13, 2.9, 0, 20, 0.9, 0.9], ['c', chrome, 13, 0.3, 0, 20, 0.9, 0.9],
    ['c', dark, 9, 1.6, 0, 1.2, 4.6, 4.6], ['c', dark, 20, 1.6, 0, 1.2, 4.6, 4.6], ['c', dark, 23.4, 1.6, 0, 0.8, 4, 4],
    ['b', blk, 0, 1.6, 0, 8, 5, 5], ['b', olive, -1, -3.4, 2.4, 5, 4.4, 3], ['b', poly, -1, -3.4, -0.6, 2.4, 4, 1.6, -0.2], ['b', brass, 2, -1.4, 2.6, 3, 0.7, 1.4], ['b', poly, 2, 5, 0, 7, 1, 1.2]]);
  scene.add(pGun);
  // 가슴 손전등 — 멜빵에 단 등. 빛줄기 · 스포트라이트가 여기서 나간다
  chestLamp = new THREE.Group();
  chestLamp.add(part(GEO.box, mat('#1a1c1f', { roughness: 0.5, metalness: 0.5 }), 0, 0, 0, 3, 3.2, 3.6));
  const lens = new THREE.Mesh(GEO.cyl, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.25, 1.2, 1.1) }));
  lens.scale.set(1.3, 0.6, 1.3); lens.rotation.z = Math.PI / 2; lens.position.x = 1.8; chestLamp.add(lens);
  for (const sd of [-1, 1]) chestLamp.add(part(GEO.box, mat('#2a2620', { roughness: 0.9 }), -1, 3, sd * 2.6, 1, 8, 1));   // 멜빵
  scene.add(chestLamp);
  return h;
}
let chestLamp = null;
const chestP = new THREE.Vector3(), muzzleP = new THREE.Vector3();
const gS = new THREE.Vector3(), gE = new THREE.Vector3(), gH = new THREE.Vector3(), gO = new THREE.Vector3(), gTmp = new THREE.Vector3();
/** 팔 하나를 손 목표점으로 — 위팔은 팔꿈치가 아래 · 바깥으로 꺾이게, 아래팔은 손 쪽으로 */
function reachArm(up, lo, hand, out, w = 1) {
  if (!up || !lo) return;
  up.getWorldPosition(gS);
  gTmp.copy(hand).sub(gS); const L = gTmp.length();
  gTmp.normalize().addScaledVector(YAX, -0.45).addScaledVector(out, 0.35);
  aimBone(up, gTmp, w);
  up.updateMatrixWorld(true);
  lo.getWorldPosition(gE);
  aimBone(lo, gTmp.copy(hand).sub(gE), w);
  return L;
}
/* ── 동료 (rc.31) — 플레이어와 같은 몸에 저마다 다른 옷 · 총 한 자루. 다리는 움직이는 쪽으로, 상체는 겨눈 쪽으로 ── */
const ALLY3 = new Map(), aF = new THREE.Vector3(), aL = new THREE.Vector3(), aC = new THREE.Vector3(), aR = new THREE.Vector3(),
  aG = new THREE.Vector3(), aFo = new THREE.Vector3(), aH = new THREE.Vector3();
function updateAllies3(g, dt, rigs) {
  const seen = new Set();
  for (const a of g.allies || []) {
    if (a.dead) continue;
    seen.add(a);
    let h = ALLY3.get(a);
    if (h && !h.userData.rig && rigs) { removeHuman(h); if (h.userData.gun) scene.remove(h.userData.gun); ALLY3.delete(a); h = null; }
    if (!h) {
      const k = a.kit, look = { skin: k.skin, top: k.top, sleeve: k.top, pants: k.pants, shoes: '#141414', hair: k.hair, clean: true, rim: '0.04, 0.09, 0.05' };
      if (rigs) { h = makeRig('xbot', { look }); h.scale.setScalar(1.02 * CHAR_S); }
      else { h = makeHuman(look); h.scale.setScalar(1.25 * CHAR_S); }
      const len = a.wpn === 'rifle' ? 24 : a.wpn === 'shotgun' ? 20 : 16;
      const gun = new THREE.Group(); gun.add(part(GEO.box, mat('#15181c', { roughness: 0.5, metalness: 0.5 }), len / 2, 0, 0, len, 2.6, 2.2));
      gun.userData.len = len; h.userData.gun = gun; scene.add(charLayer(gun));
      ALLY3.set(a, h); scene.add(charLayer(h));
    }
    h.position.set(a.x, groundY(g.world, a.x, a.y, 0), a.y);
    h.visible = inView(a.x, a.y, 64);
    if (h.userData.rig) poseAllyRig(h, a, dt);
    else { h.rotation.y = -a.angle; poseHuman(h, { ph: a.walkPhase, amp: a.stride || 0, lean: 1.2, arms: 'gun', melee: 0 }); h.userData.gun.visible = false; }
    if (a.muzzle > 0) pushLight(a.x + Math.cos(a.angle) * 30, 26, a.y + Math.sin(a.angle) * 30, 140, tmpC.set(0xffc880), 2.2);
  }
  for (const [a, h] of ALLY3) if (!seen.has(a)) { removeHuman(h); if (h.userData.gun) scene.remove(h.userData.gun); ALLY3.delete(a); }
}
function poseAllyRig(h, a, dt) {
  const u = h.userData, B = u.bones;
  trackMotion(u, a.x, a.y, undefined, dt);
  const sp = u.spd, aim = a.angle;
  if (u.root === undefined) u.root = aim;
  let back = false;
  if (sp > 12) {
    const m = Math.atan2(u.vy, u.vx);
    back = Math.abs(wrapA(aim - m)) > 1.95;
    const base = back ? m + Math.PI : m;
    u.root = turnToward(u.root, base + Math.max(-0.12, Math.min(0.12, wrapA(aim - base))), 11 * dt);
    u.turning = false;
  } else {
    const off = wrapA(aim - u.root);
    if (Math.abs(off) > 0.7 || u.turning) { u.turning = Math.abs(off) > 0.08; u.root = turnToward(u.root, aim, 7 * dt); }
  }
  h.rotation.y = -u.root;
  let [clip, ts] = gaitFor(u, sp, h.scale.x, true);
  if (clip === 'run') ts = Math.min(2.5, sp / (NAT_SPEED.xbot.run * h.scale.x));
  if (u.turning && clip === 'idle') { clip = 'walk'; ts = 0.55; }
  blendRig(h, clip, 12, dt, back ? -ts : ts);
  h.updateMatrixWorld(true);
  const twist = wrapA(aim - u.root);
  if (Math.abs(twist) > 0.002) { for (const b of [B.Spine, B.Spine1, B.Spine2]) tiltBone(b, YAX, -twist / 3); h.updateMatrixWorld(true); }
  const S = h.scale.x;
  aF.set(Math.cos(aim), 0, Math.sin(aim)); aL.set(aF.z, 0, -aF.x);
  if (B.Spine2) B.Spine2.getWorldPosition(aC); else aC.set(a.x, 36 * S, a.y);
  aR.copy(aL).multiplyScalar(-1);
  aG.copy(aC).addScaledVector(aF, 7 * S).addScaledVector(aR, 3.5 * S).addScaledVector(YAX, -4.5 * S);
  aFo.copy(aG).addScaledVector(aF, 11 * S).addScaledVector(aR, -2 * S).addScaledVector(YAX, 0.5 * S);
  reachArm(B.RightArm, B.RightForeArm, aG, aR, 0.97);
  reachArm(B.LeftArm, B.LeftForeArm, aFo, aL, 0.97);
  const gun = u.gun;
  if (gun) {
    if (B.RightHand) B.RightHand.getWorldPosition(aH); else aH.copy(aG);
    gun.position.copy(aH).addScaledVector(YAX, 0.6 * S); gun.rotation.set(0, -aim, 0); gun.scale.setScalar(S); gun.visible = h.visible;
  }
}
function posePlayerRig(h, p, g, dt) {
  const u = h.userData, B = u.bones;
  /* 하체와 상체를 나눈다 — 다리는 실제로 움직이는 쪽으로 걷고(뒤로 물러서면 뒷걸음), 상체가 비틀려 손전등 쪽을 겨눈다.
     예전엔 몸 전체가 손전등 방향으로 홱 돌고 걷기 동작은 늘 앞으로만 재생돼, 옆 · 뒤로 움직이거나 자동 조준이 적을
     따라 돌 때 다리가 허공을 걸으며 미끄러졌다. 재생 속도도 실제 이동 속도에 맞춘다(예전엔 고정값이라 발이 80% 미끄러짐) */
  trackMotion(u, p.x, p.y, undefined, dt);
  const sp = p.dead ? 0 : u.spd, aim = p.angle;
  if (u.root === undefined) u.root = aim;
  let back = false;
  if (sp > 12) {
    const m = Math.atan2(u.vy, u.vx);
    back = Math.abs(wrapA(aim - m)) > 1.95;              // 겨눈 쪽과 110° 넘게 반대로 움직이면 뒷걸음
    const base = back ? m + Math.PI : m;
    u.root = turnToward(u.root, base + Math.max(-0.12, Math.min(0.12, wrapA(aim - base))), 11 * dt);   // 다리는 움직이는 쪽에서 7° 이내, 나머지는 허리를 비튼다
    u.turning = false;
  } else {
    // 서 있을 때 — 발은 두고 상체만 돌리다가 40° 넘게 틀어지면 발을 옮겨 몸을 돌린다
    const off = wrapA(aim - u.root);
    if (Math.abs(off) > 0.7 || u.turning) { u.turning = Math.abs(off) > 0.08; u.root = turnToward(u.root, aim, 7 * dt); }
  }
  h.rotation.y = -u.root;
  let [clip, ts] = gaitFor(u, sp, h.scale.x, true);
  if (clip === 'run') ts = Math.min(2.5, sp / (NAT_SPEED.xbot.run * h.scale.x));
  if (u.turning && clip === 'idle') { clip = 'walk'; ts = 0.55; }   // 제자리에서 발을 옮겨 돈다
  blendRig(h, clip, 12, dt, back ? -ts : ts);
  h.updateMatrixWorld(true);
  const twist = wrapA(aim - u.root);
  if (Math.abs(twist) > 0.002) { for (const b of [B.Spine, B.Spine1, B.Spine2]) tiltBone(b, YAX, -twist / 3); h.updateMatrixWorld(true); }
  fwd.set(Math.cos(p.angle), 0, Math.sin(p.angle)); lat.set(fwd.z, 0, -fwd.x);
  const key = (p.weapon && p.weapon.key) || 'pistol', long = key !== 'pistol', S = h.scale.x;
  /* 밀치기 세 박자 — ① 웅크림(0‒22%): 오른 어깨를 뒤로 감고 무게를 뒷발에 ② 내지름(22‒50%): 허리를 풀며 앞발을 내딛고
     상체를 실어 두 손바닥으로 민다(몸이 앞으로 7, 아래로 2.5 쏠린다) ③ 거둠: 천천히 자세를 되찾는다 */
  const ma = p.meleeAnim > 0 ? 1 - p.meleeAnim / 0.32 : -1, ez = x => x * x * (3 - 2 * x);
  let wind = 0, thrust = 0;
  if (ma >= 0) {
    if (ma < 0.22) wind = ez(ma / 0.22);
    else if (ma < 0.5) { const q = ez((ma - 0.22) / 0.28); wind = 1 - q; thrust = q; }
    else thrust = 1 - ez((ma - 0.5) / 0.5);
  }
  if (wind + thrust > 0.01) {
    for (const b of [B.Spine, B.Spine1, B.Spine2]) tiltBone(b, YAX, (wind * 0.32 - thrust * 0.22) / 3);     // 허리 감기 · 풀기
    tiltBone(B.Spine, lat, thrust * 0.5 - wind * 0.1); tiltBone(B.Spine1, lat, thrust * 0.28);
    tiltBone(B.Head, lat, -thrust * 0.25);                                          // 고개는 앞을 본 채
    h.position.addScaledVector(fwd, thrust * 7 * S); h.position.y -= (thrust * 2.5 + wind * 1.2) * S;
    if (sp < 30) {                                                                  // 서서 밀 때만 — 앞발 내딛기 · 뒷발 버티기
      aimBone(B.LeftUpLeg, tdir.copy(fwd).multiplyScalar(0.55).addScaledVector(YAX, -1), thrust * 0.8);
      aimBone(B.LeftLeg, tdir.copy(fwd).multiplyScalar(0.1).addScaledVector(YAX, -1), thrust * 0.8);
      aimBone(B.RightUpLeg, tdir.copy(fwd).multiplyScalar(-0.45).addScaledVector(YAX, -1), (thrust + wind * 0.5) * 0.7);
    }
    h.updateMatrixWorld(true);
  }
  // 무거운 땅 — 무릎을 높이 들어 헤쳐 나간다
  if (sp > 12 && !back && (WADE_T[p.terr] || (p.pitK || 0) > 0.05)) { wadeGait(u, B, tv1.set(Math.cos(u.root), 0, Math.sin(u.root)), tdir.set(Math.sin(u.root), 0, -Math.cos(u.root)).clone(), dt, 0.85, (p.pitK || 0) > 0.05 || p.terr === 3); h.updateMatrixWorld(true); }
  // 몸의 기준점 — 가슴(Spine2). 오른쪽은 -lat
  if (B.Spine2) B.Spine2.getWorldPosition(chestP); else chestP.set(p.x, 36 * S, p.y);
  const right = gO.copy(lat).multiplyScalar(-1);
  // 손 목표 — 권총은 두 손을 모아 앞으로 쭉, 긴 총은 오른손이 개머리 쪽 손잡이 · 왼손이 총열 밑
  const grip = new THREE.Vector3().copy(chestP).addScaledVector(fwd, (long ? 7 : 15) * S + thrust * 13 * S - wind * 6 * S).addScaledVector(right, (long ? 3.5 : 0.6) * S + wind * 3 * S).addScaledVector(YAX, (long ? -4.5 : -2.5) * S + thrust * 2 * S);
  const fore = new THREE.Vector3().copy(grip).addScaledVector(fwd, (long ? 11 : 0.5) * S).addScaledVector(right, (long ? -2 : -1.4) * S).addScaledVector(YAX, (long ? 0.5 : 0) * S);
  // 왼손은 총에서 떼어 손바닥으로 민다 — 가슴 앞 왼쪽 어깨 높이
  if (thrust + wind > 0.01) fore.lerp(gTmp.copy(chestP).addScaledVector(fwd, 6 * S + thrust * 20 * S).addScaledVector(lat, 5 * S).addScaledVector(YAX, 1.5 * S), Math.min(1, thrust * 1.3 + wind * 0.6));
  reachArm(B.RightArm, B.RightForeArm, grip, right, 0.97);
  reachArm(B.LeftArm, B.LeftForeArm, fore, lat, 0.97);
  if (u.pack && B.Spine2) { gTmp.copy(chestP); h.worldToLocal(gTmp); u.pack.position.copy(gTmp); }
  if (pGun) {
    const G = pGun.userData.guns;
    for (const k in G) G[k].visible = k === key;
    if (B.RightHand) B.RightHand.getWorldPosition(gH); else gH.copy(grip);
    pGun.position.copy(gH).addScaledVector(YAX, 0.6 * S);
    pGun.rotation.set(0, -p.angle, 0); pGun.scale.setScalar(S);
    pGun.visible = h.visible;
    muzzleP.copy(pGun.position).addScaledVector(fwd, (G[key] ? G[key].userData.len : 12) * S);
  }
  if (chestLamp) {
    chestLamp.position.copy(chestP).addScaledVector(fwd, 4.2 * S).addScaledVector(lat, 1.2 * S).addScaledVector(YAX, 1.5 * S);
    chestLamp.rotation.set(0, -p.angle, 0); chestLamp.scale.setScalar(S);
    chestLamp.visible = h.visible;
  }
}
/** 시체 — 서 있는 자세 하나를 멈춰 두고 뒤로 눕힌다, 팔다리를 벌린다 */
/** 시체 자세 다섯 — 선 자세(앞 +x · 위 +y · 왼쪽 -z)에서 팔다리를 놓은 뒤 몸째 넘어뜨린다.
    fall: rz(앞뒤로 넘어짐 −π/2 엎어짐 · +π/2 누움) · rx(옆으로) · 각 뼈의 목표 방향 */
const DEATH_POSES = [
  { name: 'faceDown', rz: -Math.PI / 2, rx: 0, y: 3.2,
    b: { LeftArm: [0.15, 1, -0.35], LeftForeArm: [0.3, 1, -0.2], RightArm: [0.05, 0.9, 0.45], RightForeArm: [-0.2, 1, 0.5], LeftUpLeg: [0, -1, -0.16], LeftLeg: [0, -1, -0.12], RightUpLeg: [0.05, -1, 0.2], RightLeg: [-0.7, -0.7, 0.2] } },
  { name: 'onBack', rz: Math.PI / 2, rx: 0, y: 3.4,
    b: { LeftArm: [0.25, -0.15, -1], LeftForeArm: [0.4, 0.2, -1], RightArm: [0.1, 0.25, 1], RightForeArm: [0.5, 0.6, 0.7], LeftUpLeg: [0, -1, -0.22], LeftLeg: [0, -1, -0.25], RightUpLeg: [0.6, -0.8, 0.15], RightLeg: [-0.1, -1, 0.15] } },
  { name: 'curled', rz: 0, rx: Math.PI / 2, y: 4.5, spine: 0.55,
    b: { LeftArm: [0.8, -0.3, -0.15], LeftForeArm: [0.2, 0.9, 0.2], RightArm: [0.85, -0.2, 0.2], RightForeArm: [0.3, 0.8, -0.2], LeftUpLeg: [1, -0.35, -0.05], LeftLeg: [-0.25, -1, 0], RightUpLeg: [0.9, -0.5, 0.1], RightLeg: [-0.4, -1, 0.05] } },
  { name: 'twisted', rz: -Math.PI / 2, rx: 0, y: 3.2, yaw: 0.5,
    b: { LeftArm: [0.25, -1, -0.15], LeftForeArm: [0.3, -1, 0.1], RightArm: [-0.6, 0.35, 0.9], RightForeArm: [-0.4, 0.8, 0.6], LeftUpLeg: [0.1, -1, 0.28], LeftLeg: [0.05, -1, 0.3], RightUpLeg: [0.05, -1, -0.12], RightLeg: [-0.5, -0.85, -0.1] } },
  { name: 'sprawl', rz: Math.PI / 2, rx: 0, y: 3.4,
    b: { LeftArm: [-0.05, 1, -0.45], LeftForeArm: [-0.2, 1, -0.6], RightArm: [-0.2, 0.9, 0.55], RightForeArm: [0.1, 1, 0.4], LeftUpLeg: [0, -1, -0.48], LeftLeg: [0, -1, -0.5], RightUpLeg: [0, -1, 0.42], RightLeg: [0.3, -1, 0.45] } }
];
function makeCorpseRig(c) {
  let h;
  if (c.type === 'player') h = makeRig('xbot', { look: { skin: '#9a7a64', top: '#23303c', sleeve: '#23303c', pants: '#2a3442', hair: '#141210' } });
  else if (c.type === 'ally') h = makeRig('xbot', { look: { skin: c.skin, top: c.top, sleeve: c.top, pants: c.pants, hair: c.hair || '#141210', clean: true } });
  else if (c.hazmat) h = makeRig('soldier', { tex: 'hazmat' });
  else h = makeRig('xbot', { look: { skin: '#6a7262', top: c.top || '#5a5a50', pants: c.pants || '#2d3440', sleeve: c.top || '#5a5a50' } });
  const u = h.userData;
  blendRig(h, 'idle', 100, 0.01, 1);
  for (const k in u.acts) u.acts[k].paused = true;
  h.updateMatrixWorld(true);
  // 자세는 시체마다 해시로 — 같은 자리 시체는 늘 같은 자세
  const hs = (Math.imul(Math.floor(c.x * 7 + c.y * 13), 2654435761) >>> 0), jit = ((hs >>> 8) % 100) / 100 - 0.5;
  const list = DEATH_STYLE_POSE[c.how] || [0, 1, 2, 3, 4], P = DEATH_POSES[list[hs % list.length]];
  for (const [bn, d] of Object.entries(P.b)) {
    const flip = c.mirror ? -1 : 1;
    aimBone(u.bones[bn], tdir.set(d[0] + jit * 0.2, d[1], d[2] * flip + jit * 0.15), 1);
  }
  if (P.spine) { lat.set(0, 0, -1); tiltBone(u.bones.Spine1, lat, -P.spine); tiltBone(u.bones.Neck, lat, -P.spine * 0.6); }
  tiltBone(u.bones.Neck, YAX, (jit) * 1.4);                        // 고개가 한쪽으로 돌아간다
  // stopAllAction 은 쓰지 않는다 — 동작을 끄는 순간 three.js 가 뼈를 묶음 자세(T)로 되돌려 시체가 모두 T 자로 누웠다.
  // 동작은 멈춘(paused) 채 두고 섞개를 다시 돌리지 않으면 위에서 잡은 자세가 그대로 남는다
  u.fall = { style: c.how || 'face', rz: P.rz, rx: P.rx * ((hs >>> 3) % 2 ? 1 : -1), y: P.y, yaw: (P.yaw || 0) + jit * 0.5 };
  return h;
}
/** 쓰러지는 모습 일곱 — 끝 자세(DEATH_POSES 중 어울리는 것)와 넘어지는 동작이 저마다 다르다 */
const DEATH_STYLE_POSE = { face: [0, 3], back: [1, 4], knees: [0, 3], spin: [3, 2], crumple: [2], head: [1], blast: [4, 1] };
const DEATH_DUR = { face: 0.65, back: 0.5, knees: 1.05, spin: 0.8, crumple: 1.0, head: 0.5, blast: 0.95 };
function fallPose(o, age) {
  const f = o.userData.fall; if (!f) return 0;
  const b = o.userData.body, st = f.style;
  const bnc = (t0, amp) => age > t0 ? Math.max(0, Math.sin(Math.min(1, (age - t0) / 0.18) * Math.PI)) * amp : 0;
  let rz = 0, rx = 0, y = 0, yaw = f.yaw, lift = 0;
  if (st === 'back') {                                   // 큰 반동 — 뒤로 날아가 등부터 떨어진다
    const k = Math.min(1, age / 0.3), e = 1 - (1 - k) * (1 - k);
    rz = f.rz * (e - bnc(0.3, 0.08)); rx = f.rx * e; y = f.y * e; lift = Math.sin(k * Math.PI) * 6;
  } else if (st === 'knees') {                           // 무릎이 꺾여 잠깐 꿇었다가 앞으로 엎어진다
    const k1 = Math.min(1, age / 0.28), k2 = Math.max(0, Math.min(1, (age - 0.5) / 0.35));
    rz = -0.3 * k1 + (f.rz + 0.3) * k2 * k2 - f.rz * bnc(0.85, 0.06); rx = f.rx * k2; y = -13 * k1 * (1 - k2) + f.y * k2;
  } else if (st === 'spin') {                            // 밀쳐져 휘청 돌며 옆으로
    const k = Math.min(1, age / 0.6), e = k * k;
    rz = f.rz * e; rx = f.rx * e; yaw = f.yaw + 2.8 * (1 - (1 - k) * (1 - k)); y = f.y * e;
  } else if (st === 'crumple') {                         // 불에 타 다리가 풀리며 주저앉아 웅크린다
    const k1 = Math.min(1, age / 0.45), k2 = Math.max(0, Math.min(1, (age - 0.4) / 0.5));
    rz = f.rz * k2; rx = f.rx * k2 * k2; y = -12 * k1 * (1 - k2) + f.y * k2; yaw = f.yaw + Math.sin(age * 18) * 0.12 * (1 - k2);
  } else if (st === 'head') {                            // 강한 한 발 — 막대처럼 뻣뻣하게 뒤로 넘어간다
    const k = Math.min(1, age / 0.32), e = k * k * k;
    rz = f.rz * (e - bnc(0.32, 0.12)); rx = f.rx * e; y = f.y * e;
  } else if (st === 'blast') {                           // 폭발 — 떠올라 한 바퀴 돌고 떨어진다
    const k = Math.min(1, age / 0.75);
    rz = f.rz * k + Math.sin(k * Math.PI) * 1.4; rx = f.rx * k; y = f.y * k; yaw = f.yaw + 3 * k; lift = Math.sin(k * Math.PI) * 42;
  } else {                                               // 그대로 앞으로 엎어진다
    const k = Math.min(1, age / 0.45), e = k * k;
    rz = f.rz * (e - bnc(0.45, 0.06)); rx = f.rx * e; y = f.y * e;
  }
  b.rotation.z = rz; b.rotation.x = rx; b.position.y = y; b.rotation.y = yaw;
  return lift;
}

/* 움직임 재기 — 몸체가 실제로 얼마나 빨리 움직이는지(위치 차이)와, 바라보는 쪽을 부드럽게.
   예전엔 감염체의 걸음 빠르기를 종류별 고정값으로 정해 막혀 서 있어도 제자리걸음을 했고, 길을 비켜 가며 방향이
   0.55 라디안씩 끊겨 바뀌는 대로 몸이 홱홱 돌았다 */
function trackMotion(u, x, y, yawTo, dt, turn) {
  if (u.px === undefined) { u.px = x; u.py = y; u.spd = 0; u.vx = 0; u.vy = 0; u.yaw = yawTo; return; }
  const dx = x - u.px, dy = y - u.py, dd = Math.hypot(dx, dy);
  u.px = x; u.py = y;
  if (dt > 0 && dd < 60) {                               // 이어 붙은 지도의 가장자리를 넘으면(순간 이동) 무시
    const k = Math.min(1, dt * 6);                       // 약 0.17초 평균 — 돌진 · 비켜 가기의 순간 변화에 동작이 휘둘리지 않게
    u.vx += (dx / dt - u.vx) * k; u.vy += (dy / dt - u.vy) * k;
    u.spd = Math.hypot(u.vx, u.vy);
  }
  if (yawTo !== undefined) u.yaw = turnToward(u.yaw, yawTo, turn * Math.max(dt, 0.001));
}
function wrapA(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
function turnToward(a, b, max) { const d = wrapA(b - a); return a + Math.max(-max, Math.min(max, d)); }
/** 동작마다 제 빠르기(키 50 기준, 발이 바닥을 밀어내는 속도 — 클립을 재어 얻은 값). 이것으로 재생 속도를 정해 발이 미끄러지지 않게 */
const NAT_SPEED = { xbot: { walk: 43, run: 92 }, soldier: { walk: 44, run: 100 } };
function gaitFor(u, sp, sc, canRun) {
  const nat = NAT_SPEED[u.kind] || NAT_SPEED.xbot;
  // 문턱마다 여유(이력)를 둔다 — 빠르기가 문턱 언저리에서 오르내리면 걷기 · 뛰기가 프레임마다 바뀌어 팔다리가 떨렸다
  const was = u.gait || 'idle';
  if (sp < (was === 'idle' ? 9 : 4)) { u.gait = 'idle'; return ['idle', 1]; }
  const runAt = nat.walk * sc * (was === 'run' ? 1.45 : 1.85);
  const clip = canRun && sp > runAt ? 'run' : 'walk';
  u.gait = clip;
  return [clip, Math.max(0.35, Math.min(clip === 'run' ? 2.4 : 2.2, sp / (nat[clip] * sc)))];
}

let lastHT = -1;
function updateHumans(g, p) {
  const seen = new Set();
  const dt = lastHT < 0 ? 0 : Math.max(0, Math.min(0.1, g.time - lastHT)); lastHT = g.time;
  const rigs = CHAR.ready;
  let fresh = 0;
  for (const z of g.zombies) {
    if (z.dead) continue;
    seen.add(z);
    let h = dyn.humans.get(z);
    if (!h) {
      // 몰려오는 무리(18‒30)가 한꺼번에 생기면 인형 복제가 한 프레임에 몰려 멈칫한다 — 한 프레임에 둘까지만(나머지는 다음 프레임)
      if (fresh >= 2 && !PRIMING) continue;
      fresh++;
      const t = z.t, S = t.boss ? 2.3 : t.size >= 18 ? 1.55 : t.charge ? 1.42 : t.tongue ? 1.16 : t.bloat ? 1.18 : t.scream ? 1.08 : t.speed > 100 ? 1 : 1.05;
      const t0 = performance.now();
      if (rigs) { h = zombieRig(z); h.scale.setScalar(S * CHAR_S); prof('zrig', t0); }
      else { h = makeHuman(zombieLook(z)); h.scale.setScalar(S * 1.25 * CHAR_S); }
      charLayer(h); dyn.humans.set(z, h); scene.add(h);
    }
    const d = Math.hypot(z.x - p.x, z.y - p.y);
    const vis = Math.max(z.lit, Math.min(1, Math.max(0, (180 - d) / 60)), g.lightning * 1.4, z.t.boss ? 0.5 : 0);
    // 화면 밖은 그리지 않는다 — 예전엔 1300 안이면 다 그려 화면에 하나도 없어도 뼈대 모형 일고여덟을 그리고 있었다(한 명에 삼각형 1 만 개)
    h.visible = d < 1300 && inView(z.x, z.y, 62 * h.scale.x / CHAR_S);
    if (!h.visible && h.userData.eyes) h.userData.eyes.visible = false;
    trackMotion(h.userData, z.x, z.y, -z.face, dt, z.t.boss ? 5 : 8);
    h.position.set(z.x, groundY(g.world, z.x, z.y, z.terr), z.y); h.rotation.y = h.userData.yaw;
    const t = z.t, ph = z.phase, aggro = !!z.aggro;
    if (h.userData.rig) {
      // 멀리 있는 것은 동작을 덜 자주 갱신한다
      const far = d > 700;
      if (h.visible && (!far || (g.frameNo || 0) % 3 === 0)) poseZombieRig(h, z, g, far ? dt * 3 : dt);
      // 그림자는 가까운 것만 — 뼈대 모형을 그림자 지도에 두 번 더 그리는 값이 크다
      const cs = d < 320;
      if (h.userData.cs !== cs) { h.userData.cs = cs; for (const m of h.userData.meshes) m.castShadow = cs; }
      setFlash(h, z.flash > 0);
      continue;
    }
    let o;
    if (t.crawl) {
      h.userData.spine.rotation.z = -1.35; h.userData.spine.position.y = 7;
      o = { ph, amp: 0.4, arms: 'reach', lean: 0 };
      poseHuman(h, o); h.userData.spine.rotation.z = -1.35; h.userData.spine.position.y = 6;
      h.userData.legL.a.rotation.z = -1.4; h.userData.legR.a.rotation.z = -1.5;
    } else if (t.weeper && !z.rage) {
      poseHuman(h, { ph, amp: 0, arms: 'claw', lean: 10 });
      h.userData.spine.position.y = 9; h.userData.legL.a.rotation.z = 1.5; h.userData.legR.a.rotation.z = 1.5; h.userData.legL.b.rotation.z = -2.6; h.userData.legR.b.rotation.z = -2.6;
    } else {
      const arms = t.boss ? 'hang' : t.weeper ? 'claw' : t.scream && z.screamPhase === 'wind' ? 'claw' : t.speed > 100 ? 'swing' : t.bloat || t.spit ? 'hang' : 'reach';
      poseHuman(h, { ph, amp: aggro ? 1 : 0.55, arms, lean: t.boss ? 6 : t.speed > 100 ? 6.5 : 4.2, sway: Math.sin(ph) * (aggro ? 3 : 1.4), head: { tilt: (z.look ? (z.look.tilt || 0) * 0.08 : 0) + Math.sin(ph * 0.5 + z.x) * 0.18, nod: -0.25 } });
    }
    const eyes = h.userData.head.userData.eyes;
    // 붉은 눈은 가까이 온 것만 — 어둠 속 두 점이 '거기 뭔가 있다'만 알린다(멀리서부터 위치를 다 알려 주던 표지판이었다)
    if (eyes) { const on = (aggro || (t.weeper && z.startle > 0.5)) && d < 360; eyes[0].visible = eyes[1].visible = on; }
    // 맞은 순간 하얗게 — 몸 전체를 잠깐 밝힌다
    setFlash(h, z.flash > 0);
    if (vis < 0.02 && d > 260) h.visible = h.visible && g.lightning > 0.05 ? true : h.visible;
  }
  for (const [z, h] of dyn.humans) if (!seen.has(z)) { removeHuman(h); dyn.humans.delete(z); }
  // 들고 가는 연료통 — 몸 옆에 매달아 무게를 보여 준다
  if (p.carry === 'fuel' && !p.dead) {
    if (!carry3) {
      carry3 = new THREE.Group();
      const m = mat('#b8321f', { emissive: col('#501008'), emissiveIntensity: 0.5, roughness: 0.45, metalness: 0.3 });
      carry3.add(part(GEO.box, m, 0, 0, 0, 10, 14, 5.5));
      carry3.add(part(GEO.box, mat('#3a1410'), 0, 8.5, 0, 6, 2, 2));
      charLayer(carry3);
      scene.add(carry3);
    }
    const a = p.angle, sw = Math.sin((p.walkPhase || 0)) * 0.12;
    carry3.visible = true;
    carry3.position.set(p.x - Math.sin(a) * 13 - Math.cos(a) * 3, 15, p.y + Math.cos(a) * 13 - Math.sin(a) * 3);
    carry3.rotation.set(sw, -a, 0);
  } else if (carry3) carry3.visible = false;
  updateAllies3(g, dt, rigs);
  // 플레이어
  if (!player3 && rigs) { player3 = makePlayerRig(); player3.scale.setScalar(1.06 * CHAR_S); scene.add(player3); charLayer(player3); charLayer(pGun); charLayer(chestLamp); }
  if (player3 && player3.userData.rig) {
    player3.visible = !p.dead; if (pGun) pGun.visible = !p.dead;
    player3.position.set(p.x, groundY(g.world, p.x, p.y, p.terr), p.y);
    posePlayerRig(player3, p, g, dt);
    return;
  }
  if (!player3) {
    player3 = makeHuman({ top: '#2f3a44', pants: '#262b31', skin: '#c9a184', hair: '#1d1a17', shoes: '#121416', sleeve: '#2f3a44' });
    const gun = new THREE.Group(); gun.position.set(10, 13.5, -2.2);
    gun.add(part(GEO.box, mat('#15181c', { roughness: 0.5, metalness: 0.5 }), 6, 0, 0, 16, 2.6, 2));
    gun.add(part(GEO.cyl, mat('#f4e2a8', { emissive: col('#fff2c8'), emissiveIntensity: 2 }), 14.5, -1.8, 0, 1.2, 1.5, 1.2));
    gun.children[1].rotation.z = Math.PI / 2;
    player3.userData.spine.add(gun);
    player3.add(part(GEO.box, mat('#3b3428'), -6.5, 30, 0, 5, 12, 10));   // 배낭
    player3.scale.setScalar(1.3 * CHAR_S);
    // 플레이어만 옅은 윤곽광 — 어둠 속에서도 내가 어디 있는지 보인다(감염체는 어둠에 숨는다)
    const rimmed = new Map();
    player3.traverse(o => { if (o.isMesh && o.material.isMeshStandardMaterial) { if (!rimmed.has(o.material)) rimmed.set(o.material, enhance(o.material.clone(), false, '0.05, 0.08, 0.12')); o.material = rimmed.get(o.material); } });
    scene.add(charLayer(player3));
  }
  player3.visible = !p.dead;
  player3.position.set(p.x, 0, p.y); player3.rotation.y = -p.angle;
  const melee = p.meleeAnim > 0 ? Math.sin((1 - p.meleeAnim / 0.32) * Math.PI) : 0;
  poseHuman(player3, { ph: p.walkPhase, amp: p.stride || 0, lean: 1.2, arms: 'gun', melee });
}

/* 개미지옥의 입 — 깔때기 바닥의 이빨 고리 · 검은 목구멍 · 촉수(마디마다 길쭉한 살덩이 공). 모두 인스턴스 한 벌씩 */
let MAW3 = null;
const mawC = new THREE.Color(), mawT0 = new THREE.Vector3(), mawT1 = new THREE.Vector3();
function updateMaws(g, near) {
  const P = window.LC_PITS, w = g.world;
  if (!P) return;
  if (!MAW3) {
    const flesh = enhanceNew(new THREE.MeshStandardMaterial({ color: 0x5a2034, roughness: 0.32, metalness: 0.05, emissive: 0x1c0409 }));
    MAW3 = {
      seg: new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), flesh, 420),
      lip: new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.3, 8, 20).rotateX(-Math.PI / 2), flesh, 16),
      hole: new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x050102 }), 16),
      tooth: new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 5).translate(0, 0.5, 0), enhanceNew(new THREE.MeshStandardMaterial({ color: 0xd8cdb4, roughness: 0.45 })), 220),
      ring: new THREE.InstancedMesh(new THREE.RingGeometry(0.82, 1, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), 24)
    };
    for (const k of ['seg', 'ring']) MAW3[k].instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAW3[k].instanceMatrix.count * 3), 3);
    for (const k in MAW3) { MAW3[k].frustumCulled = false; MAW3[k].count = 0; if (k !== 'ring' && k !== 'hole') MAW3[k].castShadow = true; charLayer(MAW3[k]); scene.add(MAW3[k]); }
  }
  const M = MAW3, N = 16;
  let ns = 0, nl = 0, nt = 0, nr = 0;
  for (const m of g.maws || []) {
    if (!m.near || !near(m.nx, m.ny, 1200)) continue;
    const sleep = m.dormant > 0, fl = m.flash > 0, D = m.D, by = -D;
    const open = sleep ? 0.4 : 1 + Math.sin(g.time * 3) * 0.08, mr = 30 * open;
    // 목구멍과 입술
    if (nl < 16) {
      dm.compose(dpos.set(m.nx, by + 1.6, m.ny), dq.identity(), dsc.set(mr, 1, mr)); M.hole.setMatrixAt(nl, dm);
      dm.compose(dpos.set(m.nx, by + 2.5, m.ny), dq.setFromAxisAngle(UPY, g.time * 0.2), dsc.set(mr + 3, 22, mr + 3)); M.lip.setMatrixAt(nl, dm); nl++;
    }
    // 이빨 — 안쪽으로 휘어 든 고리. 잠들면 오므라든다
    for (let i = 0; i < 12 && nt < 220; i++) {
      const a = i / 12 * 6.283 + g.time * 0.2, ca = Math.cos(a), sa = Math.sin(a);
      tv1.set(-sa, 0, ca);                                                       // 접선 — 이 축으로 안쪽으로 눕힌다
      dq.setFromAxisAngle(tv1, -(sleep ? 1.1 : 0.55 + Math.sin(g.time * 6 + i) * 0.08));
      dm.compose(dpos.set(m.nx + ca * mr, by + 3, m.ny + sa * mr), dq, dsc.set(3.2, 13 * (sleep ? 0.6 : 1), 3.2)); M.tooth.setMatrixAt(nt++, dm);
    }
    // 촉수 — 입에서 끝까지 이차 곡선. 끝으로 갈수록 가늘다. 치켜들수록 높이 휜다
    for (const tn of m.tents) {
      if (tn.out < 0.03 && tn.phase === 'idle') continue;
      const tp = P.tip(m, tn, g.time);
      const ty = groundY(w, tp.x, tp.y, 0) + tp.h;
      const dx = tp.x - m.nx, dz = tp.y - m.ny, L = Math.hypot(dx, dz) || 1, sw = Math.sin(tn.sway * 1.3) * 14;
      const cx = m.nx + dx * 0.5 - dz / L * sw, cz = m.ny + dz * 0.5 + dx / L * sw, cy = Math.max(by, ty) + 30 + (tp.rear || 0) * 70;
      let px = m.nx, py = by, pz = m.ny;
      for (let i = 1; i <= N && ns < 420; i++) {
        const t = i / N, u = 1 - t;
        const x = u * u * m.nx + 2 * u * t * cx + t * t * tp.x, y = u * u * by + 2 * u * t * cy + t * t * ty, z = u * u * m.ny + 2 * u * t * cz + t * t * tp.y;
        mawT0.set(x - px, y - py, z - pz); const sl = mawT0.length() || 1;
        dq.setFromUnitVectors(UPY, mawT0.multiplyScalar(1 / sl));
        const r = (16 - t * 11.5) * (0.45 + 0.55 * tp.k);
        dm.compose(dpos.set((x + px) / 2, (y + py) / 2, (z + pz) / 2), dq, dsc.set(r, sl * 0.62 + r * 0.6, r));
        M.seg.setMatrixAt(ns, dm);
        if (fl) mawC.setRGB(2.2, 2.0, 1.9); else { const v = i % 2 ? 1 : 0.8; mawC.setRGB(v, v, v); }
        M.seg.setColorAt(ns, mawC); ns++;
        px = x; py = y; pz = z;
      }
      // 내려칠 자리 — 좁혀 드는 붉은 고리, 방향이 굳으면 진해진다
      if (tn.phase === 'wind' && nr < 24) {
        const k = Math.min(1, tn.t / 0.5), R = 30 + (1 - k) * 22, c = tn.lock ? 1.8 : 0.7 + Math.sin(g.time * 22) * 0.3;
        dm.compose(dpos.set(tn.tx, groundY(w, tn.tx, tn.ty, 0) + 3, tn.ty), dq.identity(), dsc.set(R, 1, R)); M.ring.setMatrixAt(nr, dm);
        M.ring.setColorAt(nr, mawC.setRGB(c, c * 0.18, c * 0.1)); nr++;
      }
    }
    // 목구멍 안의 붉은 기운 — 어둠 속에서도 구덩이가 어디인지 알 수 있게
    pushLight(m.nx, by + 30, m.ny, 150, mawC.setRGB(1, 0.18, 0.22), sleep ? 0.3 : 0.9 + Math.sin(g.time * 2) * 0.2);
  }
  M.seg.count = ns; M.lip.count = nl; M.hole.count = nl; M.tooth.count = nt; M.ring.count = nr;
  for (const k of ['seg', 'lip', 'hole', 'tooth', 'ring']) M[k].instanceMatrix.needsUpdate = true;
  if (M.seg.instanceColor) M.seg.instanceColor.needsUpdate = true;
  if (M.ring.instanceColor) M.ring.instanceColor.needsUpdate = true;
}
/** 시체 — 화면 안의 것만, 새것부터 CORPSE_MAX 까지. 다 쓰러진 시체는 그림자를 드리우지 않는다.
    예전엔 둘레 1100 안의 시체를 모두(판이 길면 수십) 뼈대 모형으로 그리고 그림자 지도에도 두 번씩 그렸다 —
    좀비를 잡을수록 느려지던 까닭 */
const CORPSE_MAX = 10;
function updateCorpses(g, near) {
  const seen = new Set();
  let shown = 0, fresh = 0;
  for (let i = g.corpses.length - 1; i >= 0; i--) {
    const c = g.corpses[i];
    if (!near(c.x, c.y, 1100)) continue;
    let o = dyn.corpses.get(c);
    if (shown >= CORPSE_MAX || !inView(c.x, c.y, 70)) { if (o) { o.visible = false; seen.add(c); } continue; }
    if (!o && fresh >= 3 && !PRIMING) continue;                                     // 수류탄 한 방에 여럿이 쓰러져도 한 프레임에 셋까지만 만든다
    seen.add(c); shown++;
    if (!o) {
      fresh++;
      const look = c.type === 'player' ? { top: '#2f3a44', pants: '#262b31', skin: '#a8866e' } : c.type === 'ally' ? { top: c.top, pants: c.pants, skin: c.skin } :
        { top: c.hazmat ? '#d9d7cc' : c.top || '#5a5a50', pants: c.hazmat ? '#cfcdc2' : c.pants || '#2d3440', skin: '#8a8f7c', gore: true };
      if (CHAR.ready) {
        const t0 = performance.now(); o = makeCorpseRig(c); prof('corpse', t0);
        o.scale.setScalar(CHAR_S * (c.type === 'brute' ? 1.5 : c.type === 'behemoth' ? 2.2 : c.type === 'charger' ? 1.4 : c.type === 'bloater' ? 1.2 : 1));
        o.rotation.y = -(c.a || 0) + Math.PI;
        dyn.corpses.set(c, o); scene.add(charLayer(o));
        o.position.set(c.x, 0, c.y);
      } else {
      // 모형이 아직 없을 때만 단순 인형 — 예전엔 둘 다 만들어 뼈대 시체가 장면에 남은 채(지워지지 않고) 쌓였다
      const h = makeHuman(look);
      const r = () => Math.random();
      poseHuman(h, { ph: 0, amp: 0, arms: 'hang' });
      h.userData.armL.a.rotation.x = 0.8 + r() * 0.8; h.userData.armR.a.rotation.x = -0.8 - r() * 0.8;
      h.userData.legL.a.rotation.x = 0.2 + r() * 0.3; h.userData.legR.a.rotation.x = -0.2 - r() * 0.3;
      o = new THREE.Group(); h.rotation.z = Math.PI / 2; h.position.set(-12, 4, 0); o.add(h);
      const S = c.type === 'brute' ? 1.5 : c.type === 'behemoth' ? 2.2 : c.type === 'charger' ? 1.4 : c.type === 'bloater' ? 1.2 : 1;
      o.scale.setScalar(S * 1.25 * CHAR_S);
      o.rotation.y = -(c.a || 0) + Math.PI;
      dyn.corpses.set(c, o); scene.add(charLayer(o));
      }
    }
    o.visible = true;
    const gy = g.world.pitIdx ? groundY(g.world, c.x, c.y, 0) : 0;
    o.position.set(c.x, gy, c.y);
    const fd = o.userData.fall ? DEATH_DUR[o.userData.fall.style] || 0.65 : 0;
    if (o.userData.fall && (c.age || 0) < fd) o.position.y = gy + fallPose(o, c.age || 0);
    else if (o.userData.fall && !o.userData.settled) { fallPose(o, 2); o.userData.settled = true; if (o.userData.meshes) for (const m of o.userData.meshes) m.castShadow = false; }
  }
  for (const [c, o] of dyn.corpses) if (!seen.has(c)) { scene.remove(o); dyn.corpses.delete(c); }
}

const dm = new THREE.Matrix4(), dq = new THREE.Quaternion(), dpos = new THREE.Vector3(), dsc = new THREE.Vector3(), UPY = new THREE.Vector3(0, 1, 0);
const XAX = new THREE.Vector3(1, 0, 0), tv1 = new THREE.Vector3();
function updateDecals(g, near) {
  let ns = 0, nd = 0; const w = g.world;
  for (const d of g.decals) {
    if (!near(d.x, d.y, 1000)) continue;
    const big = d.s !== undefined;
    if (big ? ns >= MAXDEC : nd >= MAXDEC) continue;
    const r = d.r * (big ? 2 : 1.6);
    dq.setFromAxisAngle(UPY, -(d.rot || 0));
    const onSw = w.deco[w.idx(Math.floor(d.x / TILE), Math.floor(d.y / TILE))] === D_SIDEWALK ? 3 : 0;
    dpos.set(d.x, (big ? 0.6 : 0.5) + onSw, d.y); dsc.set(r, 1, r);
    dm.compose(dpos, dq, dsc);
    if (big) splatMesh.setMatrixAt(ns++, dm); else dotMesh.setMatrixAt(nd++, dm);
  }
  splatMesh.count = ns; dotMesh.count = nd;
  splatMesh.instanceMatrix.needsUpdate = true; dotMesh.instanceMatrix.needsUpdate = true;
}

const pcol = new THREE.Color();
function updateParticles(g) {
  const pos = partGeo.attributes.position.array, cl = partGeo.attributes.color.array;
  let n = 0;
  const sp = sparkGeo.attributes.position.array, sc = sparkGeo.attributes.color.array;
  let m2 = 0;
  for (const q of g.particles) {
    if (q.kind === 'spark') {
      if (m2 >= MAXP) continue;
      const k = Math.max(0, Math.min(1, q.life / q.max));
      sp[m2 * 3] = q.x; sp[m2 * 3 + 1] = 14 + k * 12; sp[m2 * 3 + 2] = q.y;
      pcol.set(q.col || '#ffb050'); sc[m2 * 3] = pcol.r * k * 4; sc[m2 * 3 + 1] = pcol.g * k * 4; sc[m2 * 3 + 2] = pcol.b * k * 4;
      m2++; continue;
    }
    if (n >= MAXP) break;
    const k = Math.max(0, Math.min(1, q.life / q.max));
    const hgt = q.z !== undefined ? q.z + 2 : q.kind === 'smoke' ? 20 + (1 - k) * 40 : q.kind === 'mist' ? 22 : 14 + k * 10;
    pos[n * 3] = q.x; pos[n * 3 + 1] = hgt; pos[n * 3 + 2] = q.y;
    pcol.set(q.col); const a = q.kind === 'smoke' ? 0.35 * k : q.kind === 'mist' ? 0.5 * k : k;
    cl[n * 3] = pcol.r * a; cl[n * 3 + 1] = pcol.g * a; cl[n * 3 + 2] = pcol.b * a;
    n++;
  }
  sparkGeo.setDrawRange(0, m2); sparkGeo.attributes.position.needsUpdate = true; sparkGeo.attributes.color.needsUpdate = true;
  partGeo.setDrawRange(0, n);
  partGeo.attributes.position.needsUpdate = true; partGeo.attributes.color.needsUpdate = true;
  particles.material.size = 7;
  particles.material.blending = THREE.NormalBlending;
  // 총알 궤적
  const tp = tracerGeo.attributes.position.array;
  let m = 0;
  for (const b of g.bullets || []) {
    if (m >= 200) break;
    if (b.flame) continue;                                   // 불길은 불티로만
    tp.set([b.px, 24, b.py, b.x, 24, b.y], m * 6); m++;
  }
  // 레일건 빛줄기 — 겹친 선 몇 가닥으로 굵게
  for (const bm of g.beams || []) for (const o of [-1.2, 0, 1.2]) {
    if (m >= 200) break;
    const nx = -(bm.y1 - bm.y), ny = bm.x1 - bm.x, nl = Math.hypot(nx, ny) || 1;
    tp.set([bm.x + nx / nl * o, 24 + o, bm.y + ny / nl * o, bm.x1 + nx / nl * o, 24 + o, bm.y1 + ny / nl * o], m * 6); m++;
    if (o === 0) pushLight((bm.x + bm.x1) / 2, 30, (bm.y + bm.y1) / 2, 260, tmpC.set(0x60d8ff), 2 * (1 - bm.t / bm.max));
  }
  tracerGeo.setDrawRange(0, m * 2); tracerGeo.attributes.position.needsUpdate = true;
  // 수류탄
  nadeMeshes.forEach((o, i) => { const gr = (g.grenades || [])[i]; o.visible = !!gr; if (gr) o.position.set(gr.x, 5, gr.y); });
}

const LT_PICK = [];
const PICK_COL = { bolts: '#c8a878', fuel: '#d0402e', ammo: '#e8c04a', shells: '#d0503a', rounds: '#c08a3a', medkit: '#e8e8e0', battery: '#5ab0e8', nade: '#6a8a3a', goal: '#59b7d8', note: '#f0ece0', gear: '#ffcf5a', cache: '#ffcf5a' };
function updatePickups(g, near) {
  const seen = new Set();
  for (const pk of g.pickups) {
    if (pk.dead || !near(pk.x, pk.y, 1000)) continue;
    seen.add(pk);
    let o = dyn.pickups.get(pk);
    if (o && o.userData.fb && pGun) { scene.remove(o); dyn.pickups.delete(pk); o = null; }     // 총 모형이 준비되면 임시 상자를 바꾼다
    if (!o) {
      const c = PICK_COL[pk.type] || '#f0b429';
      o = new THREE.Group();
      if (pk.type && pk.type.startsWith('wpn_')) {
        // 떨어진 총 — 손에 드는 것과 같은 모형을 크게, 천천히 돌며 떠 있다
        const src = pGun && pGun.userData.guns[pk.type.slice(4)];
        if (src) { const gm = src.clone(); gm.visible = true; gm.position.set(0, 9, 0); gm.scale.setScalar(1.25); const w = new THREE.Group(); w.add(gm); gm.position.x = -(src.userData.len || 20) * 0.6; o.add(w); }
        else { o.add(part(GEO.box, mat('#20242a', { emissive: col('#f0b429'), emissiveIntensity: 0.6 }), 0, 6, 0, 22, 3, 4)); o.userData.fb = true; }
        if (!LT_PICK.includes(pk)) LT_PICK.push(pk);
      }
      else if (pk.type === 'gear' || pk.type === 'cache') {
        // 장비 · 정예의 짐 — 금빛 테를 두른 검은 상자와 하늘로 솟는 빛기둥
        const crate = new THREE.Group();
        crate.add(part(GEO.box, mat('#22201c', { roughness: 0.5, metalness: 0.4 }), 0, 6, 0, 16, 10, 11));
        crate.add(part(GEO.box, mat(c, { emissive: col(c), emissiveIntensity: 1.1 }), 0, 11.3, 0, 16.6, 0.8, 11.6));
        crate.add(part(GEO.box, mat(c, { emissive: col(c), emissiveIntensity: 1.1 }), 0, 6, 5.7, 4, 4, 0.6));
        o.add(crate);
        const pillar = new THREE.Mesh(GEO.cyl, new THREE.MeshBasicMaterial({ color: col(c), transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
        pillar.scale.set(5, 220, 5); pillar.position.y = 110; o.add(pillar);
        if (!LT_PICK.includes(pk)) LT_PICK.push(pk);
      }
      else if (pk.type === 'goal') o.add(part(GEO.box, mat(c, { emissive: col(c), emissiveIntensity: 0.9 }), 0, 7, 0, 12, 10, 12));
      else if (pk.type === 'note') o.add(part(GEO.box, mat(c, { emissive: col(c), emissiveIntensity: 0.4 }), 0, 1, 0, 10, 0.6, 13));
      else if (pk.type === 'fuel') {                                            // 붉은 연료통 — 손잡이 · 주둥이
        const m = mat(c, { emissive: col('#601810'), emissiveIntensity: 0.5, roughness: 0.45, metalness: 0.3 });
        const can = new THREE.Group();
        can.add(part(GEO.box, m, 0, 8, 0, 11, 15, 6));
        can.add(part(GEO.box, mat('#3a1410'), 0, 17, 0, 6, 2, 2));
        can.add(part(GEO.cyl, mat('#2a2a2a', { metalness: 0.6 }), 4, 17, 0, 1.4, 3, 1.4));
        o.add(can);
      }
      else o.add(part(GEO.box, mat(c, { emissive: col(c), emissiveIntensity: 0.55 }), 0, 4, 0, 9, 7, 9));
      const halo = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: TEX.glow, color: col(c), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.position.y = 0.8; halo.scale.set(46, 1, 46); o.add(halo);
      charLayer(o); dyn.pickups.set(pk, o); scene.add(o);
    }
    o.position.set(pk.x, Math.sin(g.time * 3 + pk.x) * 1.5 + (g.world.pitIdx ? groundY(g.world, pk.x, pk.y, 0) : 0), pk.y);
    o.children[0].rotation.y = g.time * 1.2;
  }
  for (const [pk, o] of dyn.pickups) if (!seen.has(pk)) { scene.remove(o); dyn.pickups.delete(pk); }
  // 떨어진 총은 금빛으로 바닥을 비춰 멀리서도 보인다
  for (let i = LT_PICK.length - 1; i >= 0; i--) { const pk = LT_PICK[i]; if (pk.dead || !seen.has(pk)) { LT_PICK.splice(i, 1); continue; } pushLight(pk.x, 14, pk.y, 90, tmpC.set(0xf0b429), 1.1 + Math.sin(g.time * 4) * 0.3); }
}

let RALLY3 = null;
function updateMisc(g, p, w) {
  // 초록 신호탄 — 생존자 무리가 기다리는 곳(rc.31)
  if (!RALLY3) {
    RALLY3 = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7fe08a, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    ring.scale.set(60, 1, 60); ring.position.y = 3.6; RALLY3.add(ring);
    const pillar = new THREE.Mesh(GEO.cyl, new THREE.MeshBasicMaterial({ color: 0x7fe08a, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }));
    pillar.scale.set(7, 260, 7); pillar.position.y = 130; RALLY3.add(pillar);
    const core = part(GEO.eye, new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xc8ffd0, emissiveIntensity: 4 }), 0, 6, 0, 4, 4, 4); RALLY3.add(core);
    scene.add(RALLY3);
  }
  RALLY3.visible = !!(g.rally && !g.rally.used);
  if (RALLY3.visible) {
    const q = w.near(g.rally.x, g.rally.y, p.x, p.y), pu = 0.5 + 0.5 * Math.sin(g.time * 3);
    RALLY3.position.set(q.x, groundY(w, q.x, q.y, 0), q.y);
    RALLY3.children[0].material.opacity = 0.4 + 0.35 * pu; RALLY3.children[0].scale.set(60 + pu * 6, 1, 60 + pu * 6);
    pushLight(q.x, 30, q.y, 220, tmpC.set(0x6ae07a), 1.4 + pu * 0.8);
  }
  const open = g.exitOpen && g.level.objective.type !== 'endless';
  exitRing.visible = exitBeam.visible = open;

  if (open) {
    exitRing.position.set(w.exit.x, 0.8, w.exit.y); exitRing.rotation.y = g.time * 0.6;
    exitBeam.position.set(w.exit.x, 130, w.exit.y);
    pushLight(w.exit.x, 40, w.exit.y, 240, tmpC.set(0x50c8ff), 2.4);
  }
}

function updateLights(g, p, w) {
  const range = p.dead ? 0 : p.lightRange;
  const ca = Math.cos(p.angle), sa = Math.sin(p.angle);
  // 손전등은 가슴에 — 인물 모형이 있으면 그 가슴 등에서, 없으면 가슴 높이 앞에서
  const lampOn = chestLamp && player3 && player3.visible;
  const lx = lampOn ? chestLamp.position.x + ca * 2 : p.x + ca * 8, lz = lampOn ? chestLamp.position.z + sa * 2 : p.y + sa * 8, ly = lampOn ? chestLamp.position.y : 40;
  spot.position.set(lx, ly + 4, lz);
  spotTarget.position.set(p.x + ca * 200, 0, p.y + sa * 200);
  // 바로 앞을 벽이 막으면(눈이 적응하듯) 손전등을 조금 줄인다 — 벽 · 차를 정면으로 비추면 바닥보다 몇십 배 밝아진다
  const wallD = range > 0 ? beamReach(w, p.x, p.y, ca, sa, range * 1.05) : range;
  const wantK = range > 0 ? 0.62 + 0.38 * Math.min(1, Math.max(0, (wallD - 70) / 230)) : 1;
  R3D._spotK = (R3D._spotK ?? 1) + (wantK - (R3D._spotK ?? 1)) * 0.15;      // 부드럽게 — 깜빡이지 않게
  spot.intensity = range > 0 ? 8 * (range / 430) * R3D._spotK : 0;
  spot.distance = Math.max(10, range * 1.25);
  // 빛줄기 — 가슴 높이 손전등에서 바닥 쪽으로 조금 숙여 나간다. 벽에 막히면 거기서 끊긴다
  beam.visible = range > 0 && !p.dead;
  if (beam.visible) {
    const reach = beamReach(w, p.x, p.y, ca, sa, range * 1.05);
    const ox = lx, oz = lz, oy = ly;
    const dir = tmpV.set(ca * reach, -oy * 0.85, sa * reach).normalize();
    beam.position.set(ox, oy, oz);
    beam.quaternion.setFromUnitVectors(XAXIS, dir);
    const L = Math.hypot(reach, oy * 0.85), R = L * Math.tan(CONE_HALF * 0.92);
    beam.scale.set(L, R, R);
    beam.material.uniforms.uTime.value = g.time;
    beam.material.uniforms.uInt.value = 0.12 * Math.min(1, range / 300);
    const du = dust.material.uniforms;
    du.uApex.value.set(ox, oy, oz); du.uDir.value.copy(dir); du.uRange.value = reach; du.uTime.value = RAIN_CLOCK;   // 물방울 · 먼지는 실제 시간으로(게임 속도와 무관)
    du.uOrigin.value.set(p.x, 0, p.y);
    du.uScale.value = renderer.domElement.height * 0.9;
  }
  dust.visible = beam.visible;
  const haveGun = pGun && pGun.visible;
  if (haveGun) muzzle.position.copy(muzzleP).addScaledVector(XAXIS.clone().set(ca, 0, sa), 4); else muzzle.position.set(p.x + ca * 44, 26, p.y + sa * 44);
  R3D._fill.position.set(p.x - ca * 20, 70, p.y - sa * 20 + 30);
  const FX = PK.fx || 1;                                            // 레벨이 오를수록 총구 불꽃이 크다
  muzzle.intensity = p.muzzle > 0 ? 5 * (0.8 + 0.2 * FX) : 0;
  R3D._flash.visible = p.muzzle > 0 && !p.dead;
  R3D._flashCore.visible = R3D._flash.visible;
  if (R3D._flash.visible) {
    if (haveGun) R3D._flash.position.copy(muzzleP).add(gTmp.set(ca * 5, 0, sa * 5)); else R3D._flash.position.set(p.x + ca * 34, 30, p.y + sa * 34);
    const k = (0.7 + Math.random() * 0.5) * FX; R3D._flash.scale.set(24 * k, 24 * k, 1);
    R3D._flash.material.rotation = Math.random() * 6.28;
    R3D._flashCore.position.copy(R3D._flash.position); R3D._flashCore.scale.set(8 * k, 8 * k, 1);
  }
  // 폭발 섬광
  let fl = null;
  for (const f of g.flashes) if (!fl || f.t < fl.t) fl = f;
  if (fl) { const k = 1 - fl.t / fl.life; blast.position.set(fl.x, 40, fl.y); blast.intensity = 14 * k; } else blast.intensity = 0;
  const big = fl && fl.burst !== undefined;
  R3D._boom.visible = R3D._boomCore.visible = !!big;
  if (big) {
    const k = 1 - fl.t / fl.life;
    R3D._boom.position.set(fl.x, 26, fl.y); R3D._boom.scale.set(120 + (1 - k) * 160, 120 + (1 - k) * 160, 1); R3D._boom.material.opacity = k;
    R3D._boomCore.position.set(fl.x, 28, fl.y); R3D._boomCore.scale.set(70 * k + 20, 70 * k + 20, 1); R3D._boomCore.material.opacity = k;
  }
  // 번개 — 하늘빛이 순간 밝아진다
  const L = SETTINGS.flash ? g.lightning : g.lightning * 0.3;
  // 하늘빛 · 달빛은 예전의 반쯤 — 어둠은 색 보정의 가리개가 맡고, 여기서는 발밑 둘레가 읽힐 만큼만 남긴다
  hemi.intensity = 0.34 + L * 3 + (SETTINGS.brightness - 50) * 0.008;
  moon.intensity = 0.5 + L * 1.8;
  // 서남쪽 높은 하늘 — 보이는 남쪽 벽면에 비스듬한 달빛, 그림자는 동북쪽 길로 눕는다. 그림자 지도의 칸에 맞춰 움직여 떨림을 막는다
  // 그림자 지도는 건물 · 소품 같은 멈춰 있는 것만 담는다(사람은 1 층이라 빠진다) — 그래서 매 프레임 그릴 까닭이 없다.
  // 예전엔 150 번 가까운 그리기 호출을 매 프레임 했다(느린 휴대폰에서 좀비가 없어도 끊기던 큰 몫)
  const sx = Math.round(camT.x / MOON_SNAP) * MOON_SNAP, sz = Math.round(camT.z / MOON_SNAP) * MOON_SNAP;
  if (sx !== MOON.x || sz !== MOON.z) { MOON.x = sx; MOON.z = sz; MOON.dirty = true; moon.position.set(sx - 900, 1250, sz + 380); moon.target.position.set(sx, 0, sz); moon.target.updateMatrixWorld(); }
  if (MOON.dirty || ++MOON.age > 90) { moon.shadow.needsUpdate = true; MOON.dirty = false; MOON.age = 0; }
}

/** 0 비 · 1 눈 · 2 모래 — 같은 선분 묶음을 길이 · 속도만 바꿔 쓴다 */
let RAIN_KIND = 0;
const RAIN_SEG = [[-4, -22], [-1.2, -2.2], [-16, -1.2]];
function resetRain() {
  const a = rainGeo.attributes.position.array, [sx, sy] = RAIN_SEG[RAIN_KIND];
  for (let i = 0; i < RAIN_N; i++) { const o = i * 6; a[o + 3] = a[o] + sx; a[o + 4] = a[o + 1] + sy; a[o + 5] = a[o + 2]; }
  rainGeo.attributes.position.needsUpdate = true;
}
let rainT = -1, RAIN_CLOCK = 0;
function updateRain(g, p) {
  /* 빗줄기는 세계 좌표에 둔다 — 예전엔 카메라에 붙은 상자 안에서 떨어져, 걸으면 비가 사람을 따라왔고 땅에 닿은 자리도
     매번 같은 둘레였다. 이제 상자는 카메라 둘레로 감싸 이어 붙이기만 하고(벗어나면 반대편으로), 땅에 닿으면 상자 안
     아무 데서나 다시 떨어진다. 떨어지는 빠르기는 실제 지난 시간으로(예전엔 1/60 초 고정이라 느린 기기에서 비가 느렸다),
     한 줄기마다 조금씩 다르게 */
  const a = rainGeo.attributes.position.array, st = g.storm || 0, K = curWorld ? kitOf(curWorld) : KIT.seoul;
  if (RAIN_KIND === 0) { const sk = 1 + 0.8 * (g.shower || 0); rain.material.uniforms.uRainCol.value.set(0.62 * sk, 0.7 * sk, 0.8 * sk); }   // 소나기 — 빗줄기가 짙어진다
  const now = performance.now() / 1000;                 // 실제 시간 — 게임 속도를 늦춰도 비는 제 빠르기로(멈춤 화면에서도 내린다)
  const dt = rainT < 0 ? 1 / 60 : Math.max(0, Math.min(0.1, now - rainT)); rainT = now; RAIN_CLOCK += dt;
  const [sx, sy] = RAIN_SEG[RAIN_KIND];
  const vy = [900, 70 + st * 60, 60][RAIN_KIND], vx = [160, 40 + st * 260, 420 + st * 600][RAIN_KIND];
  const cx = camT.x, cz = camT.z - 200;
  for (let i = 0; i < RAIN_N; i++) {
    const o = i * 6, k = 0.82 + ((i * 2654435761) >>> 0) % 1000 / 2800, wob = RAIN_KIND === 1 ? Math.sin(g.time * 1.3 + i) * 18 * dt : 0;
    a[o + 1] -= vy * k * dt; a[o + 4] -= vy * k * dt; a[o] -= vx * k * dt + wob; a[o + 3] -= vx * k * dt + wob;
    // 상자 둘레로 감싸기(가로 1600 · 세로 1400)
    const ox = a[o] - cx, oz = a[o + 2] - cz;
    if (ox < -800 || ox > 800) { const sh = Math.round(ox / 1600) * 1600; a[o] -= sh; a[o + 3] -= sh; }
    if (oz < -700 || oz > 700) { const sh = Math.round(oz / 1400) * 1400; a[o + 2] -= sh; a[o + 5] -= sh; }
    if (a[o + 4] < 0) {
      const x = cx + (Math.random() - 0.5) * 1600, z = cz + (Math.random() - 0.5) * 1400, y = RAIN_KIND === 2 ? Math.random() * 160 : RAIN_KIND ? 300 + Math.random() * 400 : 500 + Math.random() * 200;
      a[o] = x; a[o + 1] = y; a[o + 2] = z; a[o + 3] = x + sx; a[o + 4] = y + sy; a[o + 5] = z;
    }
  }
  rainGeo.attributes.position.needsUpdate = true;
  rain.position.set(0, 0, 0);
  // 폭풍 — 안개가 짙어지고 모래빛 · 눈빛으로 물든다
  scene.fog.density = K.fogD * (1 + st * 0.55);
  grade.uniforms.uHaze.value.set(...(RAIN_KIND === 2 ? [0.42, 0.3, 0.17] : [0.5, 0.55, 0.62]), RAIN_KIND ? st * 0.55 : 0);
  if (RAIN_KIND) { scene.fog.color.setHex(K.fog).lerp(tmpC.set(RAIN_KIND === 2 ? 0x6a4a28 : 0x5a6470), st * 0.4); scene.background.copy(scene.fog.color); }
}

/* ═══════════ 랜드마크 모형 ═══════════
   랜드마크마다 그룹 하나 — 게임이 지도 이어 붙이기에 맞춰 옮겨 그리는 만큼(lm.ox · lm.oy) 따라 움직인다 */
const LM3 = [];
function hipRoof(g, x, z, wd, dp, y, h, m, eave = 8) {
  const r = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1), m);
  r.rotation.y = Math.PI / 4; r.position.set(x + wd / 2, y + h / 2, z + dp / 2);
  r.scale.set(wd + eave * 2, h, dp + eave * 2); r.castShadow = true; r.receiveShadow = true;
  g.add(r); return r;
}
/** 기와지붕 — 가운데가 처지고 끝이 들린 팔작지붕 꼴. 기와 골 무늬 · 용마루 · 처마 밑 단청 띠 */
let TILE_ROOF = null, DANCH = null;
function tileRoof(g, x, z, wd, dp, y, h, eave = 12) {
  if (!TILE_ROOF) {
    const t = canvasTex(256, 256, (c, W, H) => { c.fillStyle = '#3a3f46'; c.fillRect(0, 0, W, H); for (let i = 0; i < W; i += 16) { const gr = c.createLinearGradient(i, 0, i + 16, 0); gr.addColorStop(0, '#22262c'); gr.addColorStop(0.5, '#5a6068'); gr.addColorStop(1, '#22262c'); c.fillStyle = gr; c.fillRect(i, 0, 16, H); } c.fillStyle = 'rgba(0,0,0,.35)'; for (let j = 0; j < H; j += 22) c.fillRect(0, j, W, 3); });
    TILE_ROOF = enhanceNew(new THREE.MeshStandardMaterial({ map: t, normalMap: normalFrom(t.image, 2.5), roughness: 0.55, envMapIntensity: 1.2, side: THREE.DoubleSide }));
    const d = canvasTex(256, 32, (c, W) => { const C = ['#2a7a5a', '#c83a2a', '#e8c040', '#2a4a9a', '#f0ece0']; for (let i = 0; i < W; i += 12) { c.fillStyle = C[(i / 12) % C.length]; c.fillRect(i, 0, 12, 32); c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(i + 4, 10, 4, 12); } });
    DANCH = enhanceNew(new THREE.MeshStandardMaterial({ map: d, roughness: 0.7 }));
  }
  const L = wd + eave * 2, D = dp + eave * 2, x0 = x - eave, z0 = z - eave, seg = 10;
  const pos = [], uv = [], idx = [];
  // 네 경사면: 처마 둘레(y)에서 용마루(y+h)로. 가운데 처짐(sag) · 모서리 들림(lift)
  const ridgeIn = Math.min(L, D) * 0.5, rx0 = x0 + ridgeIn * 0.95, rx1 = x0 + L - ridgeIn * 0.95;
  const P = (u, v) => {                                        // u: 둘레 0..4, v: 0 처마 → 1 용마루
    const side = Math.floor(u) % 4, f = u - Math.floor(u);
    const ex = [[x0, z0 + D], [x0 + L, z0 + D], [x0 + L, z0], [x0, z0], [x0, z0 + D]];
    const rr = [[rx0, z0 + D / 2], [rx1, z0 + D / 2], [rx1, z0 + D / 2], [rx0, z0 + D / 2], [rx0, z0 + D / 2]];
    const ax = ex[side][0] + (ex[side + 1][0] - ex[side][0]) * f, az = ex[side][1] + (ex[side + 1][1] - ex[side][1]) * f;
    const bx = rr[side][0] + (rr[side + 1][0] - rr[side][0]) * f, bz = rr[side][1] + (rr[side + 1][1] - rr[side][1]) * f;
    const lift = Math.pow(Math.abs(f - 0.5) * 2, 3) * h * 0.22 * (1 - v);
    const vv = v * v * 0.35 + v * 0.65;                         // 오목한 경사
    return [ax + (bx - ax) * v, y + h * vv + lift, az + (bz - az) * v];
  };
  for (let s2 = 0; s2 < 4; s2++) for (let i = 0; i <= seg; i++) for (let j = 0; j <= 4; j++) { pos.push(...P(s2 + i / seg * 0.999, j / 4)); uv.push(i / seg * (s2 % 2 ? D : L) / 40, j * 1.2); }
  for (let s2 = 0; s2 < 4; s2++) for (let i = 0; i < seg; i++) for (let j = 0; j < 4; j++) { const a = s2 * (seg + 1) * 5 + i * 5 + j, b = a + 5; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, TILE_ROOF); m.castShadow = m.receiveShadow = true; g.add(m);
  boxAt(g, mat('#2a2e33', { roughness: 0.5 }), (rx0 + rx1) / 2, y + h + 2, z0 + D / 2, rx1 - rx0 + 6, 5, 5);      // 용마루
  // 처마 밑 단청 띠
  const band = (cx, cz, sx, sz) => boxAt(g, DANCH, cx, y - 3, cz, sx, 6, sz);
  band(x + wd / 2, z + dp + 2, wd + 8, 2); band(x + wd / 2, z - 2, wd + 8, 2); band(x - 2, z + dp / 2, 2, dp + 8); band(x + wd + 2, z + dp / 2, 2, dp + 8);
  return m;
}
/** 기둥 줄 — 건물 둘레에 붉은 원기둥 */
function columns(g, x, z, wd, dp, h, step = 22) {
  const M = mat('#8a2418', { roughness: 0.5 });
  for (let u = 0; u <= wd; u += step) for (const zz of [z, z + dp]) g.add(part(GEO.cyl, M, x + u, h / 2, zz, 2.6, h, 2.6));
  for (let v = step; v < dp; v += step) for (const xx of [x, x + wd]) g.add(part(GEO.cyl, M, xx, h / 2, z + v, 2.6, h, 2.6));
}
/** 움직이지 않는 묶음의 메시를 재질마다 하나로 합친다 — 그리기 호출을 줄인다.
    빛나는 등(beacon) 같은 따로 움직이는 것, 셰이더 재질, 인스턴스는 그대로 둔다 */
function mergeStatic(g, keep = new Set()) {
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), groups = new Map(), drop = [];
  g.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || keep.has(o) || o.material.isShaderMaterial || Array.isArray(o.material)) return;
    const key = o.material.uuid + (o.castShadow ? 's' : '');
    let gg = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
    if (!gg.attributes.normal) gg.computeVertexNormals();
    for (const a of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(a)) gg.deleteAttribute(a);
    gg.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (!groups.has(key)) groups.set(key, { mat: o.material, cast: o.castShadow, list: [] });
    groups.get(key).list.push(gg); drop.push(o);
  });
  for (const o of drop) o.parent.remove(o);
  for (const { mat: m, cast, list } of groups.values()) {
    const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, m); mesh.castShadow = cast; mesh.receiveShadow = true;
    g.add(mesh);
  }
  return g;
}
/** 사각뿔 — 피라미드 · 지붕 끝 */
function pyrAt(g, m, cx, cz, size, h, y = 0) {
  const r = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1), m);
  r.rotation.y = Math.PI / 4; r.position.set(cx, y + h / 2, cz); r.scale.set(size, h, size); r.castShadow = r.receiveShadow = true;
  g.add(r); return r;
}
/** 반구 돔 */
let HEMI = null;
function domeAt3(g, m, cx, y, cz, r, sy = 1) {
  if (!HEMI) HEMI = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const o = part(HEMI, m, cx, y, cz, r, r * sy, r); o.receiveShadow = true; g.add(o); return o;
}
function boxAt(g, m, x, y, z, sx, sy, sz) { const o = part(GEO.box, m, x, y, z, sx, sy, sz); o.receiveShadow = true; g.add(o); return o; }
function buildLandmarks(w) {
  for (const lm of w.landmarks) {
    const g = new THREE.Group(), T = TILE, X = v => v * T, k = lm.kind;
    g.userData.lm = lm;
    const stoneM = mat('#8a857a', { roughness: 0.85 }), darkRoof = mat('#2a2e33', { roughness: 0.6 }), red = mat('#9a2a20', { roughness: 0.6 });
    const LT = g.userData.lights = [];                         // 랜드마크의 불빛(값싼 빛): [x, y, z, 반지름, 색, 세기]
    const glowM = (c, k = 3) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: c, emissiveIntensity: k });
    if (k === 'palace') {
      const H = lm.hall, G = lm.gate;
      // 근정전 — 두 단 돌 기단, 안쪽 벽(창호), 붉은 기둥 줄, 겹처마 기와지붕
      boxAt(g, stoneM, X(H.x + H.w / 2), 4, X(H.y + H.h / 2), X(H.w) + 6, 8, X(H.h) + 6);
      boxAt(g, stoneM, X(H.x + H.w / 2), 10, X(H.y + H.h / 2), X(H.w) - 8, 6, X(H.h) - 8);
      boxAt(g, mat('#c8b48a', { roughness: 0.8 }), X(H.x + H.w / 2), 32, X(H.y + H.h / 2), X(H.w) - 30, 40, X(H.h) - 30);
      columns(g, X(H.x) + 10, X(H.y) + 10, X(H.w) - 20, X(H.h) - 20, 52);
      tileRoof(g, X(H.x) + 6, X(H.y) + 6, X(H.w) - 12, X(H.h) - 12, 52, 40, 16);
      // 광화문 — 석축 위 문루
      boxAt(g, stoneM, X(G.x + G.w / 2), 14, X(G.y + G.h / 2), X(G.w), 28, X(G.h) - 6);
      columns(g, X(G.x) + 8, X(G.y) + 6, X(G.w) - 16, X(G.h) - 12, 50, 18);
      tileRoof(g, X(G.x) + 4, X(G.y) + 2, X(G.w) - 8, X(G.h) - 4, 50, 26, 12);
      LT.push([X(H.x + H.w / 2), 30, X(H.y + H.h) + 20, 220, 0xffb070, 1.2]);
      // 담장 기와 — 둘레 담 위에 어두운 기와 띠
      boxAt(g, darkRoof, X(lm.x + lm.w / 2), 32, X(lm.y) + 24, X(lm.w), 5, 30);
    } else if (k === 'temple') {
      const H = lm.hall;
      boxAt(g, stoneM, X(H.x + H.w / 2), 4, X(H.y + H.h / 2), X(H.w) + 4, 8, X(H.h) + 4);
      boxAt(g, red, X(H.x + H.w / 2), 26, X(H.y + H.h / 2), X(H.w) - 24, 32, X(H.h) - 24);
      columns(g, X(H.x) + 10, X(H.y) + 10, X(H.w) - 20, X(H.h) - 20, 44);
      tileRoof(g, X(H.x) + 4, X(H.y) + 4, X(H.w) - 8, X(H.h) - 8, 44, 42, 18);
      const P = lm.pagoda;
      for (let i = 0; i < 5; i++) {
        const sz = 80 - i * 10, y = 6 + i * 34;
        boxAt(g, red, X(P.x + 1), y + 14, X(P.y + 1), sz * 0.6, 28, sz * 0.6);
        hipRoof(g, X(P.x + 1) - sz / 2, X(P.y + 1) - sz / 2, sz, sz, y + 26, 10, darkRoof, 6);
      }
      g.add(part(GEO.cyl, mat('#c9a227', { metalness: 0.7, roughness: 0.3 }), X(P.x + 1), 6 + 5 * 34 + 20, X(P.y + 1), 1.5, 40, 1.5));
      // 큰 붉은 등롱 — 대문 아래
      const lan = part(GEO.ico, mat('#c02a1a', { emissive: col('#ff4a2a'), emissiveIntensity: 0.6 }), X(lm.x + 5.5), 30, X(lm.y + 12.5), 10, 13, 10);
      g.add(lan);
      boxAt(g, darkRoof, X(lm.x + 5.5), 52, X(lm.y + 12.5), X(5), 8, 40);
      LT.push([X(lm.x + 5.5), 26, X(lm.y + 12.5) + 14, 200, 0xff5a30, 1.8]);
    } else if (k === 'tower') {
      const cx = X(lm.cx), cz = X(lm.cy);
      g.add(part(GEO.cyl, mat('#d8d4cc', { roughness: 0.5 }), cx, 160, cz, 9, 320, 9));
      g.add(part(GEO.cyl, mat('#b8b4ac', { roughness: 0.4, metalness: 0.3 }), cx, 330, cz, 26, 30, 26));
      g.add(part(GEO.cyl, mat('#d8d4cc'), cx, 352, cz, 18, 14, 18));
      g.add(part(GEO.cyl, mat('#9aa0a6', { metalness: 0.6 }), cx, 420, cz, 2.5, 120, 2.5));
      g.userData.beacon = new THREE.Mesh(GEO.eye, new THREE.MeshBasicMaterial({ color: 0xff3020 })); g.userData.beacon.scale.setScalar(6); g.userData.beacon.position.set(cx, 482, cz); g.add(g.userData.beacon);
      g.add(part(GEO.cyl, stoneM, cx, 4, cz, 40, 8, 40));
    } else if (k === 'lattice') {
      const cx = X(lm.cx), cz = X(lm.cy), M1 = mat('#c8402a', { roughness: 0.5, metalness: 0.4 }), M2 = mat('#e8e4dc', { roughness: 0.5 });
      const legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
      for (let s = 0; s < 6; s++) {
        const y0 = s * 90, y1 = y0 + 90, r0 = 96 * Math.pow(1 - y0 / 640, 1.6) + 6, r1 = 96 * Math.pow(1 - y1 / 640, 1.6) + 6, M = s % 2 ? M2 : M1;
        for (const [sx, sz] of legs) {
          const a = new THREE.Vector3(cx + sx * r0, y0, cz + sz * r0), b = new THREE.Vector3(cx + sx * r1, y1, cz + sz * r1);
          const mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b);
          const o = part(GEO.box, M, mid.x, mid.y, mid.z, 5, len, 5);
          o.lookAt(b); o.rotateX(Math.PI / 2); g.add(o);
        }
        for (const [sx, sz, ex, ez] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
          const o = part(GEO.box, M, cx + (sx + ex) / 2 * r1, y1, cz + (sz + ez) / 2 * r1, ex !== sx ? r1 * 2 : 3, 3, ez !== sz ? r1 * 2 : 3);
          g.add(o);
        }
      }
      boxAt(g, M2, cx, 190, cz, 70, 26, 70);
      boxAt(g, M1, cx, 380, cz, 34, 16, 34);
      g.userData.beacon = new THREE.Mesh(GEO.eye, new THREE.MeshBasicMaterial({ color: 0xff3020 })); g.userData.beacon.scale.setScalar(6); g.userData.beacon.position.set(cx, 640, cz); g.add(g.userData.beacon);
    } else if (k === 'prang') {
      const cx = X(lm.cx), cz = X(lm.cy), M = mat('#e8e2d4', { roughness: 0.5 });
      for (let i = 0; i < 7; i++) g.add(part(GEO.cyl, M, cx, 8 + i * 30, cz, 70 - i * 9, 30, 70 - i * 9));
      g.add(part(GEO.cone, M, cx, 260, cz, 14, 80, 14));
      for (const [mx, mz] of lm.minis) { g.add(part(GEO.cyl, M, X(mx), 30, X(mz), 12, 60, 12)); g.add(part(GEO.cone, M, X(mx), 75, X(mz), 8, 30, 8)); }
    } else if (k === 'monument') {
      const cx = X(lm.cx), cz = X(lm.cy), M = mat('#d8d0bc', { roughness: 0.6 });
      g.add(part(GEO.cyl, stoneM, cx, 6, cz, 64, 12, 64));
      g.add(part(GEO.cyl, M, cx, 70, cz, 16, 130, 16));
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; const o = boxAt(g, M, cx + Math.cos(a) * 46, 60, cz + Math.sin(a) * 46, 12, 120, 34); o.rotation.y = -a; }
    } else if (k === 'checkpoint' || k === 'base') {
      const bag = mat('#8a7c5c', { roughness: 0.95 });
      for (const [x, y, wd, h] of lm.runs) boxAt(g, bag, X(x + wd / 2), 9, X(y + h / 2), X(wd) - 6, 18, X(h) - 8);
      for (const [x, y] of lm.cabins) { boxAt(g, mat('#e0e2dd', { roughness: 0.6 }), X(x + 1), 18, X(y + 0.5), X(2) - 6, 36, X(1) - 8); boxAt(g, mat('#20262c'), X(x + 1), 22, X(y + 1) - 3.6, 26, 10, 0.6); }
      if (lm.tent) hipRoof(g, X(lm.tent.x), X(lm.tent.y), X(2), X(1), 0, 34, mat('#4a5236', { roughness: 0.95 }), 4);
      for (const [x, y] of lm.blocks || []) boxAt(g, mat('#9a9b98'), X(x + 0.5), 10, X(y + 0.5), 34, 20, 18);
      if (lm.pole) {
        g.add(part(GEO.cyl, mat('#6a7076'), X(lm.pole[0]), 80, X(lm.pole[1]), 2.5, 160, 2.5));
        boxAt(g, mat('#f2eedc', { emissive: col('#fffbe8'), emissiveIntensity: 3 }), X(lm.pole[0]), 162, X(lm.pole[1]), 22, 7, 10);
        LT.push([X(lm.pole[0]), 150, X(lm.pole[1]) + 20, 420, 0xf4f0e0, 2.2]);
      }
      if (lm.boxes) {
        const C = ['#8a2e24', '#2e4a6a', '#b8b8b0', '#4a5a3a', '#9a6a2a', '#7a2a2a'];
        lm.boxes.forEach(([x, y, n, lv], i) => { for (let l = 0; l < lv; l++) boxAt(g, mat(C[(i * 2 + l * 3 + x) % C.length], { roughness: 0.75, metalness: 0.3 }), X(x + n / 2), 19 + l * 38, X(y + 0.5), X(n) - 4, 37, X(1) - 6); });
      }
      if (lm.pad) { const ring = new THREE.Mesh(GEO.ring, mat('#d6b846', { roughness: 0.6 })); ring.scale.set(58, 1, 58); ring.position.set(X(lm.pad[0]), 0.4, X(lm.pad[1])); g.add(ring); }
    } else if (k === 'railyard') {
      const rail = mat('#8a8f94', { metalness: 0.8, roughness: 0.35 }), sleeper = mat('#3a2e24', { roughness: 0.95 });
      for (const ty of lm.tracks) {
        const cz = X(ty + 0.5);
        for (let x = X(lm.x) + 4; x < X(lm.x + lm.w); x += 14) boxAt(g, sleeper, x, 1, cz, 7, 2, 34);
        for (const dz of [-10, 10]) boxAt(g, rail, X(lm.x + lm.w / 2), 3, cz + dz, X(lm.w), 3, 2.5);
      }
      g.add(part(GEO.cyl, mat('#4a4e52'), X(lm.signal[0]), 40, X(lm.signal[1]), 2, 80, 2));
      g.userData.beacon = new THREE.Mesh(GEO.eye, new THREE.MeshBasicMaterial({ color: 0xff3020 })); g.userData.beacon.scale.setScalar(4); g.userData.beacon.position.set(X(lm.signal[0]), 80, X(lm.signal[1])); g.add(g.userData.beacon);
    } else if (k === 'gas') {
      const sh = lm.shop, c = lm.canopy;
      boxAt(g, mat('#5a5e62', { roughness: 0.6 }), X(sh.x + sh.w / 2), 18, X(sh.y + sh.h / 2), X(sh.w) - 6, 36, X(sh.h) - 6);
      for (const [x, y] of lm.pumps) { boxAt(g, mat('#b8372e', { roughness: 0.4 }), X(x + 0.5), 13, X(y + 0.5), 12, 26, 18); boxAt(g, mat('#d8d2c6', { emissive: col('#ffffff'), emissiveIntensity: 0.3 }), X(x + 0.5), 22, X(y + 0.5) + 9.2, 8, 6, 0.4); }
      for (const [x, y] of [[c.x + 0.5, c.y + 0.5], [c.x + c.w - 0.5, c.y + 0.5], [c.x + 0.5, c.y + c.h - 0.5], [c.x + c.w - 0.5, c.y + c.h - 0.5]]) g.add(part(GEO.cyl, mat('#9aa0a6'), X(x), 34, X(y), 3, 68, 3));
      boxAt(g, enhanceNew(new THREE.MeshStandardMaterial({ color: 0xb8bcc2, map: TEX.roofSet.map, normalMap: TEX.roofSet.normal, roughness: 0.6 })), X(c.x + c.w / 2), 70, X(c.y + c.h / 2), X(c.w), 5, X(c.h));
      // 지붕 밑 조명 — 몇 개는 아직 켜져 있다
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
        const lx = X(c.x) + X(c.w) * (i + 0.5) / 3, lz = X(c.y) + X(c.h) * (j + 0.5) / 2, on = (i + j * 2) % 3 !== 1;
        boxAt(g, on ? glowM(0xf4f6ff, 3.2) : mat('#3a3c40'), lx, 67.2, lz, 22, 0.6, 8);
        if (on) LT.push([lx, 60, lz, 210, 0xdde6ff, 1.2]);
      }
      LT.push([X(lm.sign[0]), 104, X(lm.sign[1]) + 10, 160, 0xff5a40, 1.4]);
      boxAt(g, red, X(c.x + c.w / 2), 70, X(c.y + c.h / 2), X(c.w) + 1, 4, X(c.h) + 1).scale.y = 2;
      g.add(part(GEO.cyl, mat('#5a5e62'), X(lm.sign[0]), 50, X(lm.sign[1]), 2.5, 100, 2.5));
      boxAt(g, mat('#c94a3a', { emissive: col('#ff5a40'), emissiveIntensity: 0.8 }), X(lm.sign[0]), 104, X(lm.sign[1]), 30, 26, 4);
    } else if (k === 'hawker') {
      const C = ['#c94f3d', '#3d7fc9', '#d9a43a', '#3a9a6a', '#9a4ac9'];
      lm.stalls.forEach(([x, y], i) => { boxAt(g, mat(C[i % C.length], { emissive: col(C[i % C.length]), emissiveIntensity: 0.6 }), X(x + 0.5), 24, X(y + 1) - 2, X(1) - 4, 8, 2); if (i % 2 === 0) LT.push([X(x + 0.5), 30, X(y + 1) + 6, 150, 0xffb070, 1.1]); });
      for (const [x, y] of lm.tables) { g.add(part(GEO.cyl, mat('#8f8a80', { roughness: 0.4 }), X(x + 0.5), 14, X(y + 0.5), 15, 2, 15)); g.add(part(GEO.cyl, mat('#555'), X(x + 0.5), 7, X(y + 0.5), 2, 14, 2)); }
      boxAt(g, mat('#3a4046', { roughness: 0.6 }), X(lm.x + lm.w / 2), 80, X(lm.y + 1 + (lm.h - 1) / 2), X(lm.w), 4, X(lm.h - 1));
      for (const [x, y] of [[lm.x, lm.y + 1], [lm.x + lm.w, lm.y + 1], [lm.x, lm.y + lm.h], [lm.x + lm.w, lm.y + lm.h]]) g.add(part(GEO.cyl, mat('#787f85'), X(x), 40, X(y), 3, 80, 3));
    } else if (k === 'grove') {
      for (const [tx, ty, kk] of lm.trees) {
        const H = 220 * kk;
        g.add(part(GEO.cyl, mat('#4a4550', { roughness: 0.8 }), X(tx), H / 2, X(ty), 9, H, 9));
        const cap = part(GEO.cone, mat('#3a4a3a', { roughness: 0.9, side: THREE.DoubleSide }), X(tx), H + 10, X(ty), 70 * kk, 40, 70 * kk);
        cap.rotation.x = Math.PI; g.add(cap);
        const lights = new THREE.Mesh(GEO.ring, new THREE.MeshBasicMaterial({ color: 0xc8a0ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
        lights.scale.set(68 * kk, 1, 68 * kk); lights.position.set(X(tx), H + 30, X(ty)); g.add(lights);
      }
    } else if (k === 'port') {
      const h = lm.hull, C = ['#8a2e24', '#2e4a6a', '#b8b8b0', '#4a5a3a', '#9a6a2a'];
      boxAt(g, mat(lm.ice ? '#a8281c' : '#2a2622', { roughness: 0.6, metalness: 0.3 }), X(h.x + h.w / 2), 16, X(h.y + h.h / 2), X(h.w), 44, X(h.h) - 4);
      boxAt(g, mat('#8a2a20'), X(h.x + h.w / 2), 2, X(h.y + h.h / 2) + X(h.h) / 2 - 2, X(h.w), 8, 1);
      boxAt(g, mat('#cfc9bd', { roughness: 0.5 }), X(h.x + h.w - 1.8), 70, X(h.y + 1.5), X(2.4), 70, X(2.4));
      for (let i = 0; i < 4; i++) boxAt(g, mat(C[i], { roughness: 0.7, metalness: 0.3 }), X(h.x + 1.7 + i * 1.6), 50, X(h.y + 1.5), X(1.4), 22, X(1.8));
      lm.boxes.forEach(([x, y, n], i) => boxAt(g, mat(C[(i + 2) % C.length], { roughness: 0.7, metalness: 0.3 }), X(x + n / 2), 19, X(y + 0.5), X(n) - 4, 38, X(1) - 6));
      for (const cx of lm.cranes) {
        const Y = mat('#c9a227', { roughness: 0.5, metalness: 0.4 });
        for (const dx of [0.5, 1.5]) g.add(part(GEO.box, Y, X(cx + dx), 120, X(lm.y + 4.5), 6, 240, 6));
        boxAt(g, Y, X(cx + 1), 236, X(lm.y + 1.5), 10, 8, X(6));
      }
      g.userData.beacon = new THREE.Mesh(GEO.eye, new THREE.MeshBasicMaterial({ color: 0xff3020 })); g.userData.beacon.scale.setScalar(4); g.userData.beacon.position.set(X(h.x + h.w - 1.8), 120, X(h.y + 1.5)); g.add(g.userData.beacon);
    } else if (k === 'pyramids') {
      // 기자 — 모래빛 석회암 사각뿔 셋(층 띠는 무늬로), 앞에 웅크린 스핑크스
      const lime = mat('#c4a46e', { roughness: 0.95 }), lime2 = mat('#a88a5a', { roughness: 0.95 });
      for (const [x, y, sz] of lm.pyr) {
        const P = pyrAt(g, lime, X(x + sz / 2), X(y + sz / 2), X(sz) * 1.06, X(sz) * 0.64);
        if (sz >= 5) { pyrAt(g, mat('#e0d0a8', { roughness: 0.6 }), X(x + sz / 2), X(y + sz / 2), X(sz) * 0.16, X(sz) * 0.1, X(sz) * 0.54); }
        for (let q = 1; q < 6; q++) { const f = q / 6; boxAt(g, lime2, X(x + sz / 2), X(sz) * 0.64 * f, X(y + sz / 2), X(sz) * 1.06 * (1 - f) + 0.6, 1.2, X(sz) * 1.06 * (1 - f) + 0.6); }
      }
      const sp = lm.sphinx;
      boxAt(g, lime2, X(sp.x + 1.4), 12, X(sp.y + 0.5), X(2.6), 24, X(0.8));                 // 몸
      boxAt(g, lime2, X(sp.x + 0.2), 5, X(sp.y + 0.5), X(0.8), 10, X(0.7));                   // 앞발
      boxAt(g, lime, X(sp.x + 2.6), 34, X(sp.y + 0.5), 26, 30, 28);                          // 머리
      boxAt(g, mat('#3a5a8a', { roughness: 0.7 }), X(sp.x + 2.6), 42, X(sp.y + 0.5), 30, 8, 32);   // 두건 줄
      LT.push([X(lm.rally.tx + 0.5), 60, X(lm.rally.ty + 1), 260, 0xffa860, 1.0]);
    } else if (k === 'mosque') {
      const sand = mat('#c2a272', { roughness: 0.85 }), dome = mat('#5f8a88', { roughness: 0.35, metalness: 0.4 }), H = lm.hall;
      boxAt(g, sand, X(H.x + H.w / 2), 30, X(H.y + H.h / 2), X(H.w), 60, X(H.h));
      for (let i = 0; i < 6; i++) boxAt(g, glowM(0xffb060, i % 2 ? 1.6 : 2.4), X(H.x) + 22 + i * (X(H.w) - 44) / 5, 22, X(H.y + H.h) + 0.6, 12, 26, 1);  // 아치 창 불빛
      boxAt(g, sand, X(H.x + H.w / 2), 66, X(H.y + H.h / 2), X(3.6), 14, X(3.6));
      domeAt3(g, dome, X(H.x + H.w / 2), 72, X(H.y + H.h / 2), X(1.8), 1.15);
      for (const dx of [1.2, H.w - 1.2]) domeAt3(g, dome, X(H.x + dx), 60, X(H.y + H.h / 2), X(0.8));
      g.add(part(GEO.cyl, mat('#c9a440', { metalness: 0.8, roughness: 0.3 }), X(H.x + H.w / 2), 72 + X(1.8) * 1.15 + 10, X(H.y + H.h / 2), 1.5, 22, 1.5));
      for (const [x, y] of lm.minarets) {
        g.add(part(GEO.cyl, sand, X(x), 100, X(y), 12, 200, 12));
        g.add(part(GEO.cyl, mat('#8a6c44'), X(x), 150, X(y), 18, 6, 18));
        g.add(part(GEO.cyl, sand, X(x), 215, X(y), 8, 30, 8));
        g.add(part(GEO.cone, dome, X(x), 246, X(y), 10, 34, 10));
        boxAt(g, glowM(0x7aff9a, 2), X(x), 152, X(y), 20, 2, 20);                              // 발코니의 초록 등
        LT.push([X(x), 152, X(y) + 10, 160, 0x60ff90, 0.8]);
      }
      g.add(part(GEO.cyl, mat('#7d6a4c'), X(lm.fountain[0]), 4, X(lm.fountain[1]), 26, 8, 26));
      g.add(part(GEO.cyl, mat('#1c3a44', { roughness: 0.1 }), X(lm.fountain[0]), 8.2, X(lm.fountain[1]), 22, 0.5, 22));
    } else if (k === 'kund') {
      // 계단 연못 — 물 쪽으로 세 단 내려가는 돌계단, 네 귀의 붉은 사당, 물 위의 꽃불
      const st = mat('#a48a6a', { roughness: 0.9 }), t = lm.tank;
      for (let i = 0; i < 3; i++) {
        const o = X(1 - i * 0.35), y = -2 - i * 2;
        const x0 = X(t.x) - o, z0 = X(t.y) - o, x1 = X(t.x + t.w) + o, z1 = X(t.y + t.h) + o, th = X(0.35);
        boxAt(g, st, (x0 + x1) / 2, y, z0 + th / 2, x1 - x0, 4, th); boxAt(g, st, (x0 + x1) / 2, y, z1 - th / 2, x1 - x0, 4, th);
        boxAt(g, st, x0 + th / 2, y, (z0 + z1) / 2, th, 4, z1 - z0); boxAt(g, st, x1 - th / 2, y, (z0 + z1) / 2, th, 4, z1 - z0);
      }
      for (const [x, y] of lm.shrines) {
        boxAt(g, mat('#b0603a', { roughness: 0.8 }), X(x), 16, X(y), 30, 32, 30);
        pyrAt(g, mat('#c87040', { roughness: 0.8 }), X(x), X(y), 34, 30, 32);
        boxAt(g, glowM(0xffa040, 2.4), X(x), 12, X(y) + 15.2, 8, 12, 0.6);
        LT.push([X(x), 14, X(y) + 20, 110, 0xff9a40, 1.0]);
      }
      const diya = glowM(0xffa040, 5);
      for (let i = 0; i < 9; i++) g.add(part(GEO.eye, diya, X(t.x + 0.7 + (i * 1.37) % (t.w - 1.4)), -6, X(t.y + 0.7 + (i * 0.83) % (t.h - 1.4)), 2, 1.4, 2));
      LT.push([X(t.x + t.w / 2), 10, X(t.y + t.h / 2), 200, 0xffa040, 0.9]);
    } else if (k === 'mandir') {
      // 시카라 — 옥수수처럼 층층이 좁아지며 솟는 첨탑, 금빛 꼭대기와 주황 깃발, 앞 회랑
      const sand = mat('#c4a47a', { roughness: 0.85 }), sand2 = mat('#a8845c', { roughness: 0.85 }), s0 = lm.sanctum, hl = lm.hall;
      boxAt(g, sand, X(s0.x + 1.5), 24, X(s0.y + 1.5), X(3), 48, X(3));
      for (let i = 0; i < 9; i++) { const f = 1 - i / 10; boxAt(g, i % 2 ? sand2 : sand, X(s0.x + 1.5), 52 + i * 15, X(s0.y + 1.5), X(3) * f * 0.92, 15, X(3) * f * 0.92); }
      g.add(part(GEO.cyl, mat('#d9a640', { metalness: 0.8, roughness: 0.3 }), X(s0.x + 1.5), 200, X(s0.y + 1.5), 6, 20, 6));
      g.add(part(GEO.cyl, mat('#6a5a4a'), X(s0.x + 1.5), 222, X(s0.y + 1.5), 1, 30, 1));
      boxAt(g, mat('#e8742a', { emissive: col('#e8742a'), emissiveIntensity: 0.3, side: THREE.DoubleSide }), X(s0.x + 1.5) + 10, 230, X(s0.y + 1.5), 20, 12, 0.5);
      boxAt(g, sand, X(hl.x + hl.w / 2), 18, X(hl.y + hl.h / 2), X(hl.w), 36, X(hl.h));
      pyrAt(g, sand2, X(hl.x + hl.w / 2), X(hl.y + hl.h / 2), X(hl.w) * 1.1, 30, 36);
      for (const [x, y] of lm.gate) { g.add(part(GEO.cyl, sand2, X(x), 30, X(y), 8, 60, 8)); boxAt(g, glowM(0xffa040, 3), X(x), 62, X(y), 10, 6, 10); LT.push([X(x), 60, X(y) + 6, 130, 0xffa040, 1.0]); }
      boxAt(g, glowM(0xffa040, 2), X(hl.x + hl.w / 2), 16, X(hl.y + hl.h) + 0.6, 20, 28, 1);
    } else if (k === 'piazza') {
      // 산마르코 — 다섯 돔의 대성당(금빛 아치 정면), 붉은 벽돌 종탑과 초록 첨탑, 광장의 두 돌기둥
      const c = lm.church, marble = mat('#d0c4ac', { roughness: 0.6 }), dome = mat('#6e7a72', { roughness: 0.4, metalness: 0.5 }), gold = mat('#c9a440', { metalness: 0.8, roughness: 0.3 });
      boxAt(g, marble, X(c.x + c.w / 2), 36, X(c.y + c.h / 2), X(c.w), 72, X(c.h));
      for (let i = 0; i < 5; i++) {
        const ax = X(c.x) + X(c.w) * (i + 0.5) / 5;
        boxAt(g, i === 2 ? glowM(0xffc060, 1.8) : mat('#2a2420'), ax, 26, X(c.y + c.h) + 0.6, 30, 44, 1);
        boxAt(g, gold, ax, 58, X(c.y + c.h) + 0.8, 34, 14, 1);
      }
      for (const [dx, dy, r] of [[3, 2, 1.25], [1.1, 2, 0.85], [4.9, 2, 0.85], [3, 0.8, 0.8], [3, 3.2, 0.8]]) {
        g.add(part(GEO.cyl, marble, X(c.x + dx), 80, X(c.y + dy), X(r) * 0.9, 16, X(r) * 0.9));
        domeAt3(g, dome, X(c.x + dx), 88, X(c.y + dy), X(r) * 0.9, 1.15);
        g.add(part(GEO.cyl, gold, X(c.x + dx), 88 + X(r) * 1.04 + 8, X(c.y + dy), 1.2, 16, 1.2));
      }
      const t = lm.tower, brick = mat('#9a3e2c', { roughness: 0.85 });
      boxAt(g, brick, X(t.x + 1), 120, X(t.y + 1), X(2) - 8, 240, X(2) - 8);
      boxAt(g, marble, X(t.x + 1), 262, X(t.y + 1), X(2) - 4, 44, X(2) - 4);
      boxAt(g, glowM(0xffd090, 1.2), X(t.x + 1), 262, X(t.y + 1), X(2) - 18, 30, X(2) - 3);   // 종루 안 불빛
      pyrAt(g, mat('#5e8a6a', { roughness: 0.4, metalness: 0.4 }), X(t.x + 1), X(t.y + 1), X(2) - 4, 90, 284);
      g.userData.beacon = new THREE.Mesh(GEO.eye, new THREE.MeshBasicMaterial({ color: 0xff3020 })); g.userData.beacon.scale.setScalar(4); g.userData.beacon.position.set(X(t.x + 1), 378, X(t.y + 1)); g.add(g.userData.beacon);
      for (const [x, y] of lm.cols) { g.add(part(GEO.cyl, mat('#c8c0b0', { roughness: 0.5 }), X(x), 70, X(y), 7, 140, 7)); boxAt(g, gold, X(x), 146, X(y), 16, 12, 22); }
      LT.push([X(c.x + c.w / 2), 30, X(c.y + c.h) + 30, 260, 0xffc070, 1.2]);
    } else if (k === 'biodome') {
      // 바이오돔 — 유리 반구 안의 초록 언덕과 나무, 바닥 불빛
      const d = lm.dome, cx = X(d.x + d.w / 2), cz = X(d.y + d.h / 2), R = X(d.w / 2);
      g.add(part(GEO.cyl, mat('#8a9098', { roughness: 0.5, metalness: 0.5 }), cx, 4, cz, R, 8, R * d.h / d.w));
      g.add(part(GEO.cyl, mat('#3a7a44', { roughness: 0.9 }), cx, 8.5, cz, R * 0.96, 1, R * 0.96 * d.h / d.w));
      for (let i = 0; i < 14; i++) { const a = i * 2.4, rr = R * 0.7 * ((i * 37) % 10) / 10, tx = cx + Math.cos(a) * rr, tz = cz + Math.sin(a) * rr * d.h / d.w;
        g.add(part(GEO.cyl, mat('#5a4030'), tx, 24, tz, 2, 30, 2)); g.add(part(GEO.head, mat(i % 2 ? '#2f7a44' : '#4a9a5a', { roughness: 0.9 }), tx, 44, tz, 3.2, 2.6, 3.2)); }
      const glass = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 2.5 });
      const dm3 = domeAt3(g, glass, cx, 8, cz, R, 0.75); dm3.scale.z = R * d.h / d.w; dm3.castShadow = false;
      LT.push([cx, 30, cz, R * 1.6, 0x90ffb0, 1.2]);
      g.userData.beacon = new THREE.Mesh(GEO.eye, new THREE.MeshBasicMaterial({ color: 0xff3020 })); g.userData.beacon.scale.setScalar(4); g.userData.beacon.position.set(cx, 8 + R * 0.75 + 6, cz); g.add(g.userData.beacon);
    } else if (k === 'rocket') {
      // 귀환 로켓 — 발사대 · 흰 몸통 · 주황 띠 · 날개 넷, 옆의 연료 탱크
      const [x, y] = lm.pad, wh = mat('#e8e8e4', { roughness: 0.4, metalness: 0.2 }), og = mat('#e8641a', { roughness: 0.5 });
      boxAt(g, mat('#4a4e54', { roughness: 0.7 }), X(x), 4, X(y), X(3), 8, X(3));
      g.add(part(GEO.cyl, wh, X(x), 8 + 130, X(y), 20, 260, 20));
      g.add(part(GEO.cyl, og, X(x), 8 + 150, X(y), 20.5, 24, 20.5));
      g.add(part(GEO.cone, wh, X(x), 8 + 260 + 40, X(y), 20, 80, 20));
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, f = boxAt(g, og, X(x) + Math.cos(a) * 24, 40, X(y) + Math.sin(a) * 24, 4, 60, 22); f.rotation.y = -a; }
      g.add(part(GEO.cyl, mat('#c8ccd0', { metalness: 0.6, roughness: 0.3 }), X(lm.tank[0]), 50, X(lm.tank[1]), 18, 100, 18));
      g.userData.beacon = new THREE.Mesh(GEO.eye, new THREE.MeshBasicMaterial({ color: 0xff3020 })); g.userData.beacon.scale.setScalar(5); g.userData.beacon.position.set(X(x), 350, X(y)); g.add(g.userData.beacon);
      LT.push([X(x), 30, X(y) + 40, 260, 0xffc890, 1.2]);
    } else if (k === 'hagia') {
      // 아야 소피아 — 붉은빛 벽, 큰 납빛 돔과 양옆 반 돔, 네 귀의 연필 첨탑
      const wall = mat('#c48a70', { roughness: 0.85 }), lead = mat('#7c8088', { roughness: 0.4, metalness: 0.5 }), H = lm.hall;
      const cx = X(H.x + H.w / 2), cz = X(H.y + H.h / 2);
      boxAt(g, wall, cx, 34, cz, X(H.w), 68, X(H.h));
      boxAt(g, wall, cx, 80, cz, X(3.8), 24, X(3.8));
      domeAt3(g, lead, cx, 92, cz, X(2.0), 0.85);
      for (const dx of [-1, 1]) domeAt3(g, lead, cx + dx * X(2.2), 68, cz, X(1.3), 0.7);
      for (let i = 0; i < 7; i++) boxAt(g, glowM(0xffb868, i % 2 ? 1.5 : 2.2), X(H.x) + 20 + i * (X(H.w) - 40) / 6, 26, X(H.y + H.h) + 0.6, 10, 22, 1);
      g.add(part(GEO.cyl, mat('#c9a440', { metalness: 0.8, roughness: 0.3 }), cx, 92 + X(2.0) * 0.85 + 8, cz, 1.5, 18, 1.5));
      const stone = mat('#d6cec2', { roughness: 0.8 });
      for (const [x, y] of lm.minarets) {
        g.add(part(GEO.cyl, stone, X(x), 120, X(y), 9, 240, 9));
        g.add(part(GEO.cyl, mat('#8a8478'), X(x), 170, X(y), 14, 5, 14));
        g.add(part(GEO.cone, lead, X(x), 262, X(y), 9, 44, 9));
        boxAt(g, glowM(0xfff0c0, 1.6), X(x), 172, X(y), 15, 2, 15);
        LT.push([X(x), 172, X(y) + 8, 130, 0xffe0a0, 0.7]);
      }
      g.add(part(GEO.cyl, mat('#8a8478'), X(lm.fountain[0]), 4, X(lm.fountain[1]), 22, 8, 22));
      g.add(part(GEO.cyl, mat('#1c3a44', { roughness: 0.1 }), X(lm.fountain[0]), 8.2, X(lm.fountain[1]), 18, 0.5, 18));
      g.userData.beacon = new THREE.Mesh(GEO.eye, new THREE.MeshBasicMaterial({ color: 0xff3020 })); g.userData.beacon.scale.setScalar(4); g.userData.beacon.position.set(cx, 92 + X(2.0) * 0.85 + 20, cz); g.add(g.userData.beacon);
      LT.push([cx, 40, X(H.y + H.h) + 30, 260, 0xffc890, 1.0]);
    } else if (k === 'galata') {
      // 갈라타 탑 — 둥근 돌 몸통, 꼭대기 전망 고리, 원뿔 지붕
      const [x, y] = lm.tower, st = mat('#b0a28a', { roughness: 0.9 });
      g.add(part(GEO.cyl, st, X(x), 110, X(y), X(1.3), 220, X(1.3)));
      g.add(part(GEO.cyl, mat('#e0d4b8', { roughness: 0.7 }), X(x), 232, X(y), X(1.42), 24, X(1.42)));
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; boxAt(g, glowM(0xffd090, 1.8), X(x) + Math.cos(a) * X(1.44), 232, X(y) + Math.sin(a) * X(1.44), 6, 12, 6); }
      g.add(part(GEO.cone, mat('#3e4e5e', { roughness: 0.5, metalness: 0.3 }), X(x), 290, X(y), X(1.5), 92, X(1.5)));
      g.userData.beacon = new THREE.Mesh(GEO.eye, new THREE.MeshBasicMaterial({ color: 0xff3020 })); g.userData.beacon.scale.setScalar(4); g.userData.beacon.position.set(X(x), 340, X(y)); g.add(g.userData.beacon);
      LT.push([X(x), 230, X(y), 220, 0xffd090, 1.1]);
    } else if (k === 'basil') {
      // 성 바실리 대성당 — 붉은 벽돌 몸채, 북(드럼) 위의 양파 돔 다섯(가운데는 높은 천막 지붕), 금빛 꼭지
      const brick = mat('#8a3a2a', { roughness: 0.9 }), trim = mat('#d8ccb0', { roughness: 0.8 }), gold = mat('#d8b040', { metalness: 0.8, roughness: 0.3 }), b = lm.body;
      boxAt(g, brick, X(b.x + b.w / 2), 36, X(b.y + b.h / 2), X(b.w) - 8, 72, X(b.h) - 8);
      boxAt(g, trim, X(b.x + b.w / 2), 73, X(b.y + b.h / 2), X(b.w) - 4, 4, X(b.h) - 4);
      for (const [x, y, r, h, c] of lm.domes) {
        const top = 72 + h * 150, R = X(r) * 0.42, cm = mat(c, { roughness: 0.45, metalness: 0.15 });
        g.add(part(GEO.cyl, brick, X(x), (72 + top) / 2, X(y), R * 0.8, top - 72, R * 0.8));
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; boxAt(g, glowM(0xffc878, 1.4), X(x) + Math.cos(a) * R * 0.82, top - 22, X(y) + Math.sin(a) * R * 0.82, 3, 12, 3); }
        if (r > 1) g.add(part(GEO.cone, mat('#c8b890'), X(x), top + 34, X(y), R * 0.9, 68, R * 0.9));
        const on = part(GEO.head, cm, X(x), top + (r > 1 ? 74 : 10), X(y), 1, 1, 1); on.scale.set(R / 4.4, R * 1.25 / 4.4, R / 4.4); g.add(on);
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, st = part(GEO.box, mat('#f0ece0', { roughness: 0.5 }), X(x) + Math.cos(a) * R * 0.98, top + (r > 1 ? 74 : 10), X(y) + Math.sin(a) * R * 0.98, 2.4, R * 1.6, 2.4); st.rotation.y = -a; st.rotation.z = 0.3; g.add(st); }
        g.add(part(GEO.cone, gold, X(x), top + (r > 1 ? 74 : 10) + R * 1.2, X(y), R * 0.25, R * 0.9, R * 0.25));
        boxAt(g, gold, X(x), top + (r > 1 ? 74 : 10) + R * 1.75, X(y), 1.6, 16, 1.6); boxAt(g, gold, X(x), top + (r > 1 ? 74 : 10) + R * 1.85, X(y), 10, 1.6, 1.6);
        if (r > 1) { g.userData.beacon = new THREE.Mesh(GEO.eye, new THREE.MeshBasicMaterial({ color: 0xff3020 })); g.userData.beacon.scale.setScalar(4); g.userData.beacon.position.set(X(x), top + 74 + R * 2.1, X(y)); g.add(g.userData.beacon); }
      }
      LT.push([X(b.x + b.w / 2), 60, X(b.y + b.h) + 40, 300, 0xffd8a0, 1.3]);
    } else if (k === 'kicc') {
      // 케냐타 국제회의장 — 붉은 기둥 탑(층마다 창 띠), 꼭대기 원반 전망대, 원뿔 지붕 회의장
      const tw = mat('#c89a70', { roughness: 0.8 }), dk = mat('#3a4a5a', { roughness: 0.3, metalness: 0.4 }), [x, y] = lm.tower;
      g.add(part(GEO.cyl, tw, X(x), 150, X(y), X(0.95), 300, X(0.95)));
      for (let i = 0; i < 14; i++) { g.add(part(GEO.cyl, dk, X(x), 24 + i * 19, X(y), X(0.97), 5, X(0.97))); if (i % 2) boxAt(g, glowM(0xffd090, 1.3), X(x), 24 + i * 19, X(y) + X(0.98), 18, 4, 1); }
      g.add(part(GEO.cyl, mat('#8a6a50', { roughness: 0.6 }), X(x), 306, X(y), X(1.7), 12, X(1.7)));
      g.add(part(GEO.cyl, mat('#d8b890', { roughness: 0.6 }), X(x), 316, X(y), X(1.55), 8, X(1.55)));
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; boxAt(g, glowM(0xffe0a0, 1.7), X(x) + Math.cos(a) * X(1.68), 306, X(y) + Math.sin(a) * X(1.68), 5, 6, 5); }
      const [hx, hy] = lm.hall;
      g.add(part(GEO.cyl, tw, X(hx), 14, X(hy), X(1.1), 28, X(1.1)));
      g.add(part(GEO.cone, mat('#7a5a40', { roughness: 0.7 }), X(hx), 52, X(hy), X(1.2), 48, X(1.2)));
      g.userData.beacon = new THREE.Mesh(GEO.eye, new THREE.MeshBasicMaterial({ color: 0xff3020 })); g.userData.beacon.scale.setScalar(4); g.userData.beacon.position.set(X(x), 332, X(y)); g.add(g.userData.beacon);
      LT.push([X(x), 300, X(y), 260, 0xffe0a0, 1.2]); LT.push([X(hx), 30, X(hy) + 30, 160, 0xffc890, 0.8]);
    } else if (k === 'redeemer') {
      // 구세주상 — 바위 언덕 위 흰 조각, 아래에서 비추는 조명
      const rock = mat('#56604a', { roughness: 0.95 }), hl = lm.hill, cx = X(hl.x + hl.w / 2), cz = X(hl.y + hl.h / 2);
      for (let i = 0; i < 4; i++) g.add(part(GEO.cyl, rock, cx, 15 + i * 30, cz, X(hl.w / 2 - i * 0.55), 30, X(hl.h / 2 - i * 0.55)));
      const [sx, sy] = lm.statue, stn = mat('#ece8e0', { roughness: 0.6, emissive: col('#605c54'), emissiveIntensity: 0.6 });
      boxAt(g, mat('#a8a49a'), X(sx), 140, X(sy), 26, 40, 26);
      boxAt(g, stn, X(sx), 200, X(sy), 18, 80, 14);
      boxAt(g, stn, X(sx), 228, X(sy), 120, 10, 10);                                      // 두 팔
      g.add(part(GEO.head, stn, X(sx), 252, X(sy), 1.6, 1.6, 1.6));
      g.userData.beacon = new THREE.Mesh(GEO.eye, new THREE.MeshBasicMaterial({ color: 0xff3020 })); g.userData.beacon.scale.setScalar(4); g.userData.beacon.position.set(X(sx), 272, X(sy)); g.add(g.userData.beacon);
      LT.push([X(sx), 150, X(sy) + 40, 280, 0xe8f0ff, 1.4]);
    } else if (k === 'copacabana') {
      // 코파카바나 — 파도 무늬 돌길(바닥 무늬 판), 야자수, 해변 매점
      const wk = lm.walk;
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const c2 = cv.getContext('2d');
      c2.fillStyle = '#dcd8cc'; c2.fillRect(0, 0, 256, 64); c2.strokeStyle = '#202224'; c2.lineWidth = 6;
      for (let yy = 8; yy < 64; yy += 16) { c2.beginPath(); for (let xx = 0; xx <= 256; xx += 4) { const v = yy + Math.sin(xx / 20) * 5; xx ? c2.lineTo(xx, v) : c2.moveTo(xx, v); } c2.stroke(); }
      const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(wk.w / 4, wk.h / 3);
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(X(wk.w), X(wk.h)).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.7 }));
      fl.position.set(X(wk.x + wk.w / 2), 0.7, X(wk.y + wk.h / 2)); fl.receiveShadow = true; g.add(fl);
      for (const [x, y] of lm.kiosks) { boxAt(g, mat('#e0b860'), X(x), 14, X(y), 30, 28, 30); domeAt3(g, mat('#2a8a6a'), X(x), 28, X(y), 22, 0.5); LT.push([X(x), 20, X(y) + 20, 120, 0xffd890, 0.8]); }
      const trunk = mat('#7a5a3a'), leaf = mat('#2f6a3a', { side: THREE.DoubleSide });
      for (const [x, y] of lm.palms) {
        g.add(part(GEO.cyl, trunk, X(x), 50, X(y), 3, 100, 3));
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, f = boxAt(g, leaf, X(x) + Math.cos(a) * 18, 96, X(y) + Math.sin(a) * 18, 38, 1, 9); f.rotation.y = -a; f.rotation.z = 0.35; }
      }
    } else if (k === 'hallgrim') {
      // 할그림스키르캬 — 현무암 기둥처럼 양옆으로 계단 지며 높아지는 흰 콘크리트, 가운데 뾰족탑
      const conc = mat('#c8cacb', { roughness: 0.75 }), b = lm.body;
      for (let i = 0; i < 6; i++) {
        const hgt = 40 + i * 30, off = (2.5 - i * 0.4);
        for (const sgn of [-1, 1]) boxAt(g, conc, X(b.x + b.w / 2) + sgn * X(off), hgt / 2, X(b.y + 1 + (b.h - 1) / 2), X(0.42), hgt, X(b.h - 1));
      }
      boxAt(g, conc, X(b.x + b.w / 2), 120, X(b.y + 1 + (b.h - 1) / 2), X(1.6), 240, X(b.h - 1));
      boxAt(g, conc, X(b.x + b.w / 2), 140, X(b.y + 0.8), X(1.4), 280, X(1.6));
      pyrAt(g, mat('#9aa0a2', { roughness: 0.6 }), X(b.x + b.w / 2), X(b.y + 0.8), X(1.4), 70, 280);
      boxAt(g, glowM(0xe8f0ff, 1.6), X(b.x + b.w / 2), 250, X(b.y) + 0.6, 10, 18, 1);         // 시계
      g.userData.beacon = new THREE.Mesh(GEO.eye, new THREE.MeshBasicMaterial({ color: 0xff3020 })); g.userData.beacon.scale.setScalar(4); g.userData.beacon.position.set(X(b.x + b.w / 2), 354, X(b.y + 0.8)); g.add(g.userData.beacon);
      boxAt(g, mat('#4a4e50'), X(lm.statue[0]), 14, X(lm.statue[1]), 22, 28, 22);
      g.add(part(GEO.cyl, mat('#3e5a54', { metalness: 0.6, roughness: 0.4 }), X(lm.statue[0]), 44, X(lm.statue[1]), 5, 32, 5));
      LT.push([X(b.x + b.w / 2), 40, X(b.y + b.h) + 30, 240, 0xd8e4ff, 1.0]);
    } else if (k === 'geyser') {
      // 간헐천 — 하늘빛 온천(스스로 은은히 빛난다), 회백색 규화 테. 물기둥은 updateLandmarks 에서 솟는다
      const rim = mat('#c8c4b0', { roughness: 0.9 }), hot = new THREE.MeshStandardMaterial({ color: 0x2a90a8, emissive: 0x1a6070, emissiveIntensity: 1.2, roughness: 0.05, metalness: 0.1 });
      for (const [x, y] of lm.pools) { g.add(part(GEO.cyl, rim, X(x), 1, X(y), X(1.2), 2, X(0.95))); g.add(part(GEO.cyl, hot, X(x), 2.2, X(y), X(0.9), 0.4, X(0.7))); LT.push([X(x), 12, X(y), 140, 0x60d0ff, 0.9]); }
      g.add(part(GEO.cyl, rim, X(lm.vent[0]), 3, X(lm.vent[1]), 30, 6, 24));
      const jet = part(GEO.cyl, new THREE.MeshBasicMaterial({ color: 0xc8dce4, transparent: true, opacity: 0.55, depthWrite: false }), X(lm.vent[0]), 0, X(lm.vent[1]), 9, 1, 9);
      jet.castShadow = false; g.add(jet); g.userData.jet = jet;
    } else if (k === 'station') {
      // 남극 기지 — 기둥 위 주황 · 초록 연구동, 레이더 돔, 연료 탱크, 헬기장
      const C = ['#d8642a', '#3c7a52', '#d8642a'], leg = mat('#4a4e52', { metalness: 0.6, roughness: 0.4 });
      lm.mods.forEach(([x, y, wd, h], i) => {
        for (let a = 0; a <= wd; a += Math.max(1, wd / 2)) for (const b of [0.2, h - 0.2]) g.add(part(GEO.cyl, leg, X(x + a) + (a === wd ? -6 : 6), 9, X(y + b), 2.5, 18, 2.5));
        boxAt(g, mat(C[i], { roughness: 0.55 }), X(x + wd / 2), 36, X(y + h / 2), X(wd), 36, X(h));
        boxAt(g, mat('#e8ecf0', { roughness: 0.9 }), X(x + wd / 2), 55, X(y + h / 2), X(wd) + 2, 2.5, X(h) + 2);   // 지붕의 눈
        for (let q = 0; q < wd * 2; q++) if ((q + i) % 3) boxAt(g, glowM(0xf4f0e0, 1.6), X(x) + 14 + q * (X(wd) - 28) / Math.max(1, wd * 2 - 1), 38, X(y + h) + 0.6, 8, 8, 1);
        LT.push([X(x + wd / 2), 36, X(y + h) + 24, 180, 0xe8f0ff, 1.0]);
      });
      boxAt(g, mat('#9aa0a4'), X(lm.dome[0]), 15, X(lm.dome[1]), X(2) - 6, 30, X(2) - 6);
      domeAt3(g, mat('#eef2f4', { roughness: 0.5 }), X(lm.dome[0]), 30, X(lm.dome[1]), X(1) - 2, 1.1);
      g.userData.beacon = new THREE.Mesh(GEO.eye, new THREE.MeshBasicMaterial({ color: 0xff3020 })); g.userData.beacon.scale.setScalar(4); g.userData.beacon.position.set(X(lm.dome[0]), 30 + X(1) * 1.1, X(lm.dome[1])); g.add(g.userData.beacon);
      for (const [x, y] of lm.tanks) { g.add(part(GEO.cyl, mat('#6a7a86', { metalness: 0.5, roughness: 0.4 }), X(x), 22, X(y), 20, 44, 20)); g.add(part(GEO.cyl, mat('#e8ecf0', { roughness: 0.9 }), X(x), 44.5, X(y), 20.5, 1.5, 20.5)); }
      const ring = new THREE.Mesh(GEO.ring, mat('#d6b846', { roughness: 0.6 })); ring.scale.set(58, 1, 58); ring.position.set(X(lm.pad[0]), 0.6, X(lm.pad[1])); g.add(ring);
      boxAt(g, mat('#d6b846'), X(lm.pad[0]) - 14, 0.6, X(lm.pad[1]), 6, 0.4, 40); boxAt(g, mat('#d6b846'), X(lm.pad[0]) + 14, 0.6, X(lm.pad[1]), 6, 0.4, 40); boxAt(g, mat('#d6b846'), X(lm.pad[0]), 0.6, X(lm.pad[1]), 28, 0.4, 6);
    } else if (k === 'scramble') {
      const corners = [[lm.x - 1, lm.y - 1], [lm.x + lm.w, lm.y - 1], [lm.x - 1, lm.y + lm.h], [lm.x + lm.w, lm.y + lm.h]];
      g.userData.screens = [];
      for (const [x, y] of corners) {
        if (w.at(x, y) !== T_WALL) continue;
        const sm = new THREE.MeshBasicMaterial({ color: 0x5a7aa0 });
        const o = boxAt(g, sm, X(x + 0.5), bh(w, x, y) * 0.75, X(y + 1) + 1, X(1) * 1.6, 60, 1);
        g.userData.screens.push(sm);
      }
    } else if (k === 'market') {
      for (const [x, y] of lm.stalls) hipRoof(g, X(x), X(y), X(1), X(1), 18, 10, mat(['#b8452d', '#2d6ab8', '#c9a227', '#3a8a5a'][(x + y) % 4], { roughness: 0.8 }), 6);
      // 노점 사이 전구 줄 — 처진 선 위의 작은 전구들
      const bulbM = glowM(0xffc070, 4);
      lm.stalls.forEach(([x, y], i) => {
        for (let q = 0; q < 6; q++) { const t = q / 5; g.add(part(GEO.eye, bulbM, X(x) + X(1) * t, 32 - Math.sin(t * Math.PI) * 5, X(y) - 4, 1.6, 1.6, 1.6)); }
        if (i % 2 === 0) LT.push([X(x + 0.5), 30, X(y), 160, 0xffb060, 1.1]);
      });
    }
    mergeStatic(g, new Set([g.userData.beacon, g.userData.jet].filter(Boolean)));
    // 랜드마크가 플레이어를 가리면 비쳐 보이게 — 공유 재질을 복제해 이 그룹에만 건다
    const seen = new Map();
    g.traverse(o => {
      if (!o.isMesh || !(o.material instanceof THREE.MeshStandardMaterial)) return;
      if (!seen.has(o.material)) { const m2 = o.material.clone(); seeThrough(m2); seen.set(o.material, m2); }
      o.material = seen.get(o.material);
    });
    scene.add(g); LM3.push(g);
  }
}
function updateLandmarks(g, w) {
  for (const o of LM3) {
    const lm = o.userData.lm;
    o.position.set(lm.ox || 0, 0, lm.oy || 0);
    if (o.userData.beacon) o.userData.beacon.visible = Math.sin(g.time * 3.1 + lm.x) > 0.2;
    for (const [x, y, z, r, c, k] of o.userData.lights || []) pushLight(x + (lm.ox || 0), y, z + (lm.oy || 0), r, tmpC.set(c), k);
    if (o.userData.jet) {                                       // 간헐천 — 26초마다 5초 동안 물기둥이 솟는다
      const cyc = (g.time + 7) % 26, h = cyc < 5 ? Math.sin(cyc / 5 * Math.PI) : 0, j = o.userData.jet;
      j.visible = h > 0.02; j.scale.set(9 + h * 6, 1 + h * 300, 9 + h * 6); j.position.y = j.scale.y / 2;
      if (h > 0.02) pushLight(j.position.x + (lm.ox || 0), 40, j.position.z + (lm.oy || 0), 200, tmpC.set(0xbfe8ff), h * 1.2);
    }
    if (o.userData.screens) for (const m of o.userData.screens) m.color.setHSL(((g.time * 20) % 360) / 360, 0.5, 0.25 + Math.random() * 0.15);
  }
}

if (hasGL2()) R3D.ok = true; else fail('webgl2');
