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
        if (r() < 0.5) { x.fillStyle = 'rgba(40,40,40,.6)'; x.font = 'bold 16px sans-serif'; x.fillText(['X', '/', '#', 'S'][(r() * 4) | 0], bx + 40 + r() * 40, 60); }
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
    x.fillStyle = '#c9c4b6'; x.beginPath(); x.moveTo(6 + r() * 6, 4); x.lineTo(58, 6 + r() * 6); x.lineTo(56 - r() * 6, 60); x.lineTo(4, 54 - r() * 8); x.closePath(); x.fill();
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
  MAT.asphalt = std(set(TEX.asphaltSet, { normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.8 }));   // 젖은 아스팔트 — 웅덩이는 거울처럼
  MAT.sidewalk = std(set(TEX.sidewalkSet, { normalScale: new THREE.Vector2(0.8, 0.8), envMapIntensity: 1.1 }));
  MAT.curb = std({ color: 0x8a8a84, roughness: 0.8 });
  MAT.plaza = std({ map: TEX.plaza, normalMap: normalFrom(TEX.plaza.image, 1.2), roughness: 0.68, envMapIntensity: 1.0 });
  MAT.grass = std({ map: TEX.grass, roughness: 0.95 });
  // 강물 — 빗방울 결의 노멀맵을 흘려 보내 불빛 반사가 일렁인다
  TEX.waterN = (() => { const [c, x] = cnv(256, 256); const r = rng(61); x.fillStyle = '#808080'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 180; i++) blob(x, r() * 256, r() * 256, 6 + r() * 26, 3 + r() * 9, r() * 0.4, r() < 0.5 ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.22)', 'rgba(128,128,128,0)');
    return normalFrom(c, 2.5); })();
  MAT.water = std({ color: 0x0c1c24, emissive: 0x03090c, roughness: 0.1, metalness: 0.1, normalMap: TEX.waterN, normalScale: new THREE.Vector2(0.7, 0.7), envMapIntensity: 3 });
  MAT.bridge = std({ color: 0x4a4e54, roughness: 0.6 });
  // 지형 덮개 — 모래 · 얼음 · 얕은 물 · 용암 · 진흙. 세계 좌표 UV 라 이웃 칸과 이어진다
  {
    const sandT = canvasTex(256, 256, (x, W, H) => { const r = rng(91); x.clearRect(0, 0, W, H);
      for (let i = 0; i < 70; i++) blob(x, r() * W, r() * H, 30 + r() * 50, 10 + r() * 18, -0.3, 'rgba(196,156,98,.85)', 'rgba(196,156,98,0)');
      x.strokeStyle = 'rgba(120,88,50,.35)'; x.lineWidth = 1.5; for (let i = 0; i < 40; i++) { const sx = r() * W, sy = r() * H; x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(sx + 14, sy - 6, sx + 30, sy - 2); x.stroke(); } });
    MAT.tSand = std({ map: sandT, transparent: true, roughness: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const iceT = canvasTex(256, 256, (x, W, H) => { const r = rng(92); x.fillStyle = 'rgba(170,205,230,.62)'; x.fillRect(0, 0, W, H);
      x.strokeStyle = 'rgba(240,250,255,.5)'; x.lineWidth = 1; for (let i = 0; i < 26; i++) { let px = r() * W, py = r() * H; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += (r() - 0.5) * 60; py += (r() - 0.5) * 60; x.lineTo(px, py); } x.stroke(); }
      for (let i = 0; i < 30; i++) blob(x, r() * W, r() * H, 10 + r() * 30, 6 + r() * 12, r(), 'rgba(255,255,255,.25)', 'rgba(255,255,255,0)'); });
    MAT.tIce = std({ map: iceT, transparent: true, roughness: 0.04, metalness: 0.1, envMapIntensity: 3.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    MAT.tFlood = std({ color: 0x0e2028, transparent: true, opacity: 0.82, roughness: 0.06, metalness: 0.1, normalMap: TEX.waterN, normalScale: new THREE.Vector2(0.5, 0.5), envMapIntensity: 3, depthWrite: false });
    const lavaA = canvasTex(256, 256, (x, W, H) => { const r = rng(93); x.fillStyle = '#1a120e'; x.fillRect(0, 0, W, H);
      for (let i = 0; i < 300; i++) { x.fillStyle = r() < 0.5 ? 'rgba(60,50,46,.5)' : 'rgba(0,0,0,.4)'; x.fillRect(r() * W, r() * H, 3 + r() * 8, 3 + r() * 8); } });
    const lavaE = canvasTex(256, 256, (x, W, H) => { const r = rng(94); x.fillStyle = '#000'; x.fillRect(0, 0, W, H); x.lineJoin = 'round';
      for (let i = 0; i < 18; i++) { let px = r() * W, py = r() * H; x.strokeStyle = '#ff6a14'; x.lineWidth = 3 + r() * 5; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (r() - 0.5) * 70; py += (r() - 0.5) * 70; x.lineTo(px, py); } x.stroke(); x.strokeStyle = '#ffd060'; x.lineWidth = 1.2; x.stroke(); } });
    MAT.tLava = std({ map: lavaA, emissive: 0xffffff, emissiveMap: lavaE, emissiveIntensity: 2.6, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 });
    const mudT = canvasTex(256, 256, (x, W, H) => { const r = rng(95); x.clearRect(0, 0, W, H);
      for (let i = 0; i < 50; i++) blob(x, r() * W, r() * H, 26 + r() * 40, 18 + r() * 26, r() * 3, 'rgba(58,40,24,.9)', 'rgba(58,40,24,0)');
      for (let i = 0; i < 30; i++) blob(x, r() * W, r() * H, 8 + r() * 14, 4 + r() * 6, r() * 3, 'rgba(120,100,80,.35)', 'rgba(120,100,80,0)'); });
    MAT.tMud = std({ map: mudT, transparent: true, roughness: 0.18, envMapIntensity: 1.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  }
  MAT.paint = std({ color: 0xd8d6cc, roughness: 0.5 });
  MAT.yellow = std({ color: 0xc9a83a, roughness: 0.5 });
  // 벽면의 요철은 무늬의 밝기에서 — 줄눈이 들어가고 창이 안으로 꺼져 보인다
  MAT.brick = std({ map: TEX.brick, normalMap: normalFrom(TEX.brick.image, 2.2), vertexColors: true, roughness: 0.85, emissive: 0xffffff, emissiveMap: TEX.brickLit, emissiveIntensity: 1.5, envMapIntensity: 0.4 });
  MAT.stucco = std({ map: TEX.stucco, normalMap: normalFrom(TEX.stucco.image, 1.6), vertexColors: true, roughness: 0.85, emissive: 0xffffff, emissiveMap: TEX.stuccoLit, emissiveIntensity: 1.5, envMapIntensity: 0.4 });
  MAT.shop = std({ map: TEX.shop, vertexColors: true, roughness: 0.7 });
  MAT.shopLit = std({ map: TEX.shopLit, emissive: 0xffffff, emissiveMap: TEX.shopLit, emissiveIntensity: 1.25, roughness: 0.2 });
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
            float k = smoothstep(0.55, 1.0, d);
            vec2 q = mod(floor(gl_FragCoord.xy), 2.0);
            if (k < 0.5 || (k < 0.85 && q.x == q.y)) discard;
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
  reykjavik: ['#d8dee4', '#a83a2a', '#d0d8de', '#3a5a7a', '#e0e4e8', '#5a6a5a'],
  antarctic: ['#e0e6ec', '#d8dee4', '#e8ecf0', '#d0d8e0', '#e4e8ec', '#dce2e8'],
};
/** 바닥 사각형 (y 높이) — UV 는 세계 좌표를 무늬 크기로 나눈 것이라 이웃 칸과 이어진다 */
function floorQuad(B, x0, z0, x1, z1, y, S, color) {
  B.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], [0, 1, 0], [[x0 / S, -z0 / S], [x0 / S, -z1 / S], [x1 / S, -z1 / S], [x1 / S, -z0 / S]], color);
}
/** 세로 벽 사각형 — (ax,az)→(bx,bz) 를 따라 y0..y1. 법선은 바깥쪽. UV: 가로 칸/4, 세로 층/4 */
function wallQuad(B, ax, az, bx, bz, y0, y1, nrm, color, u0, vScale = 1 / (FLOOR_PX * 4), uScale = 1 / (TILE * 4)) {
  const len = Math.hypot(bx - ax, bz - az);
  const ua = u0 * uScale, ub = (u0 + len) * uScale;
  B.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], nrm, [[ua, y0 * vScale], [ub, y0 * vScale], [ub, y1 * vScale], [ua, y1 * vScale]], color);
}

function buildChunk(w, cx, cy) {
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
  const SW_H = 3, lamps = [], fires = [], clutter = [], marks = [];
  for (let y = y0; y < y0 + CH; y++) for (let x = x0; x < x0 + CH; x++) {
    const i = w.idx(x, y), d = w.deco[i], gr = w.grid[i];
    const X0 = x * T, Z0 = y * T, X1 = X0 + T, Z1 = Z0 + T;
    const tr = w.terr ? w.terr[i] : 0;
    if (tr && d !== D_BUILDING && d !== D_WATER && d !== D_BRIDGE) {
      const fy = (d === D_SIDEWALK ? SW_H : d === D_GRASS ? 1 : 0) + (tr === 3 ? 1.6 : 0.5);
      floorQuad(get(TERR_MAT[tr]), X0, Z0, X1, Z1, fy, tr === 4 ? 260 : 200);
      if (tr === 4 && (Math.imul(x * 2654435761 ^ y * 40503, 2246822519) >>> 0) % 3 === 0) marks.push({ x: X0 + T / 2, y: 10, z: Z0 + T / 2, r: 110, c: [1, 0.36, 0.08], k: 1.1 });
    }
    if (d === D_BUILDING) {
      const h = bh(w, x, y), LS = lotStyle(w, x, y), wc = col(LS.color, LS.k), brick = LS.brick;
      const wallK = LS.style === 'brick' || LS.style === 'stucco' ? LS.style : 'f_' + LS.style;
      const lot = w.lot[i];
      const RP = ROOFS_BY[w.theme.key] || ROOFS3, rc = col(RP[(lot || (x * 7 + y * 3)) % RP.length], 1.3);
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
      const inner = isB(x + 1, y) && isB(x - 1, y) && isB(x, y + 1) && isB(x, y - 1) && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => w.lot[w.idx(x + a, y + b)] === lot);
      if (inner) { if (!roofIcon(get, w, X0, Z0, h, hh, marks)) roofStuff(get, X0, Z0, h, hh); }
      else if (hh % 5 === 0) roofBox(get('rooftop'), X0 + 14, Z0 + 14, 12, 9, h, 7);
      continue;
    }
    if (d === D_WATER) { floorQuad(get('water'), X0, Z0, X1, Z1, -8, 200); bankWalls(w, get('curb'), x, y, X0, Z0, X1, Z1); continue; }
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
    if (d === D_GRASS) { floorQuad(get('grass'), X0, Z0, X1, Z1, 1, 200); continue; }
    if (d === D_PLAZA || d === D_LANDMARK) {
      floorQuad(get('plaza'), X0, Z0, X1, Z1, 0, 160);
      if (gr === T_WALL) lmBlock(get('stone'), w, x, y, X0, Z0, X1, Z1);
      else if (gr === T_WATER) fencePanel(get('fence'), w, x, y, X0, Z0, X1, Z1);
      continue;
    }
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
    // 차도
    floorQuad(get('asphalt'), X0, Z0, X1, Z1, 0, 900);
    { const hs = (Math.imul(x * 2246822519 ^ y * 3266489917, 668265263) >>> 0); if (hs % 4 === 0) clutter.push({ k: 'paper', x: X0 + (hs >>> 4) % 44 + 2, y: 0.35, z: Z0 + (hs >>> 10) % 44 + 2, r: (hs % 628) / 100, sx: 7 + (hs >>> 16) % 6, sy: 1, sz: 9 }); }
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
  }
  for (const k in B) {
    const m = B[k].mesh(MAT[k]);
    if (!m) continue;
    if (k !== 'glow' && k !== 'asphalt' && k !== 'sidewalk' && k !== 'plaza' && k !== 'grass' && k !== 'water' && !k.startsWith('sign') && !TERR_MAT.includes(k) && k !== 'shopLit' && k !== 'lensFlick') m.castShadow = true;
    if (k === 'fence') m.receiveShadow = false;
    g.add(m);
  }
  g.userData.lamps = lamps;
  g.userData.fires = fires;
  g.userData.marks = marks;
  addClutter(g, clutter);
  addWires(g, lamps, kitOf(w).wires);
  return g;
}
const TERR_MAT = [null, 'tSand', 'tIce', 'tFlood', 'tLava', 'tMud'];
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
    paper: [GEO.plane, enhanceNew(new THREE.MeshStandardMaterial({ map: TEX.paper, transparent: true, alphaTest: 0.2, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -1 }))],
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
  if (hs % 3 === 0) clutter.push({ k: 'paper', x: X0 + (hs >>> 3) % 40 + 4, y: SH + 0.35, z: Z0 + (hs >>> 9) % 40 + 4, r: (hs % 628) / 100, sx: 7, sy: 1, sz: 9 });
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
function roofBox(B, x, z, wd, dp, y, h) {
  const x1 = x + wd, z1 = z + dp, y1 = y + h;
  B.quad([x, y1, z], [x, y1, z1], [x1, y1, z1], [x1, y1, z], [0, 1, 0], [[0, 0], [0, 1], [1, 1], [1, 0]]);
  wallQuad(B, x, z1, x1, z1, y, y1, [0, 0, 1], null, 0);
  wallQuad(B, x1, z, x, z, y, y1, [0, 0, -1], null, 0);
  wallQuad(B, x1, z1, x1, z, y, y1, [1, 0, 0], null, 0);
  wallQuad(B, x, z, x, z1, y, y1, [-1, 0, 0], null, 0);
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
  varanasi: { styles: [['sandstone', 4], ['shophouse', 3], ['stucco', 1]], lamp: [1.0, 0.6, 0.28], fog: 0x140e08, fogD: 0.00082, sh: [0.95, 0.9, 0.92], hi: [1.12, 0.98, 0.8], wires: 6, trees: 1,
    words: ['चाय', 'दवाखाना', 'होटल', 'मिठाई', 'लस्सी', 'साड़ी', 'मेडिकल', 'पान', 'ढाबा', 'STD PCP', 'GUEST HOUSE', 'घाट', 'बैंक', 'किराना'] },
  cairo: { styles: [['sandstone', 7], ['stucco', 2]], lamp: [1.0, 0.72, 0.42], fog: 0x18120a, fogD: 0.00074, sh: [0.98, 0.92, 0.86], hi: [1.12, 1.0, 0.82], wires: 3, trees: 0,
    ground: [1.7, 1.38, 0.98], side: [1.45, 1.22, 0.92], wet: 0.5,
    words: ['صيدلية', 'مطعم', 'قهوة', 'فندق', 'كشري', 'فول', 'بنك', 'سوبر ماركت', 'حلويات', 'مخبز', 'عصير', 'موبايل'] },
  venice: { styles: [['palazzo', 7], ['brick', 1]], lamp: [1.0, 0.8, 0.55], fog: 0x0c0f12, fogD: 0.00105, sh: [0.86, 0.96, 1.08], hi: [1.06, 0.98, 0.9], wires: 0, trees: 0,
    words: ['TRATTORIA', 'FARMACIA', 'GELATERIA', 'BACARO', 'OSTERIA', 'ALBERGO', 'TABACCHI', 'VAPORETTO', 'PIZZERIA', 'BAR', 'MASCHERE', 'VETRO'] },
  reykjavik: { styles: [['nordic', 7], ['stucco', 2]], lamp: [0.9, 0.95, 1.0], fog: 0x0a0e14, fogD: 0.0008, sh: [0.84, 0.96, 1.14], hi: [1.0, 1.0, 1.0], wires: 1, trees: 0,
    ground: [2.0, 2.1, 2.3], side: [1.8, 1.9, 2.05], wet: 0.6,
    words: ['KAFFI', 'APÓTEK', 'BAKARÍ', 'HÓTEL', 'BÓKABÚÐ', 'SUNDLAUG', 'PYLSUR', 'BÍÓ', 'BÚÐ', 'KRÁ', 'LYFJA', 'BANKI'] },
  antarctic: { styles: [['module', 1]], lamp: [0.85, 0.92, 1.0], fog: 0x0c1218, fogD: 0.00095, sh: [0.86, 0.98, 1.16], hi: [1.0, 1.02, 1.06], wires: 0, trees: 0,
    ground: [3.4, 3.6, 3.9], side: [3.0, 3.2, 3.5], wet: 0.25,
    words: ['LAB', 'MESS', 'MEDICAL', 'POWER', 'COMMS', 'STORE', 'GARAGE', 'FUEL', 'BUNK A', 'BUNK B', 'GYM', 'WORKSHOP'] },
};
const PASTEL = {
  bangkok: ['#c9a24a', '#5e9a92', '#c27a7a', '#8fb38a', '#c9b48a', '#7f8fb8', '#d0c4a0'],
  singapore: ['#9fc3d6', '#e0b4b8', '#e8dcb8', '#a8cfae', '#d8c0e0', '#f0e2c8', '#c8d8e8'],
  varanasi: ['#d9a84a', '#5e9ac2', '#c97a9a', '#e8c070', '#8fb38a', '#d07050', '#e8d8b0', '#7ab0a8'],
  reykjavik: ['#c8402a', '#2a5a8a', '#e8c040', '#3a7a5a', '#f0ece0', '#6a5a8a', '#d8d4cc', '#2a2e34'],
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
    MAT['f_' + st] = std({ map: a, normalMap: normalFrom(a.image, 1.6), vertexColors: true, roughness: 0.85, emissive: 0xffffff, emissiveMap: l, emissiveIntensity: 1.5, envMapIntensity: 0.4 });
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
      x.fillStyle = fg; x.font = `900 ${word.length > 6 ? 30 : 40}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(word, cx + 128, cy + 34, 236);
      if (r() < 0.4) { x.font = '700 14px sans-serif'; x.fillText(['☎ 02-' + ((r() * 9000 + 1000) | 0), 'OPEN 24', '★★★', '2F', '3F'][(r() * 5) | 0], cx + 210, cy + 52); }
    }
    for (let i = 0; i < 16; i++) {                                // 세로 간판
      const cx = i * 64, cy = 768, [bg, fg] = C[(r() * C.length) | 0], word = words[(r() * words.length) | 0];
      x.fillStyle = bg; x.fillRect(cx + 4, cy + 2, 56, 252);
      x.fillStyle = fg; x.font = '900 34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
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
  if (key === 'bangkok' && hh % 13 === 5) {
    roofBox(get('rust'), X0 + 6, Z0 + 8, 30, 22, h, 14);
    get('rust').quad([X0 + 4, h + 16, Z0 + 6], [X0 + 4, h + 13, Z0 + 32], [X0 + 38, h + 13, Z0 + 32], [X0 + 38, h + 16, Z0 + 6], [0, 1, 0], [[0, 0], [0, 1], [1, 1], [1, 0]]);
    return true;
  }
  return false;
}
/** 원기둥(옆면 + 윗면) — 물탱크 · 환기통 */
function cylB(B, cx, cz, r, y0, y1, seg = 10, cap = true) {
  for (let i = 0; i < seg; i++) {
    const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2, am = (a0 + a1) / 2;
    const p0 = [cx + Math.cos(a0) * r, cz + Math.sin(a0) * r], p1 = [cx + Math.cos(a1) * r, cz + Math.sin(a1) * r];
    B.quad([p1[0], y0, p1[1]], [p0[0], y0, p0[1]], [p0[0], y1, p0[1]], [p1[0], y1, p1[1]], [Math.cos(am), 0, Math.sin(am)], [[i / seg, 0], [(i + 1) / seg, 0], [(i + 1) / seg, 1], [i / seg, 1]]);
    if (cap) B.quad([cx, y1, cz], [p1[0], y1, p1[1]], [p0[0], y1, p0[1]], [cx, y1, cz], [0, 1, 0], [[0.5, 0.5], [1, 0], [0, 0], [0.5, 0.5]]);
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
    case 'pyramids': case 'mosque': case 'kund': case 'mandir': case 'piazza': case 'hallgrim': case 'geyser': case 'station': return 0;
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

function syncChunks(w, px, pz) {
  const ccx = Math.floor(px / TILE / CH), ccy = Math.floor(pz / TILE / CH);
  const need = new Set(), miss = [];
  for (let dy = -3; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) {
    const key = (ccx + dx) + ',' + (ccy + dy);
    need.add(key);
    if (!chunks.has(key)) miss.push([Math.max(Math.abs(dx), Math.abs(dy)), dx, dy, key]);
  }
  // 발밑과 바로 곁(3×3)은 곧바로 — 시작 화면이 비지 않게. 그 바깥은 가까운 것부터 한 프레임에 하나씩
  miss.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < miss.length; i++) {
    const [d, dx, dy, key] = miss[i];
    if (d > 1 && i > 0) break;
    const g = buildChunk(w, ccx + dx, ccy + dy);
    chunks.set(key, g); scene.add(g);
  }
  for (const [key, g] of chunks) {
    if (need.has(key)) continue;
    const [kx, ky] = key.split(',').map(Number);
    if (Math.abs(kx - ccx) > 3 || ky - ccy > 2 || ccy - ky > 4) {
      scene.remove(g); g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); chunks.delete(key);
    }
  }
}
function clearChunks() {
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
const GLASS = () => mat('#0e141c', { roughness: 0.05, metalness: 0.7, envMapIntensity: 2.5 });
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
    const mil = k === 'mtruck', cab = mil ? '#4a5236' : '#c9c4b8';
    bx(g, mat(cab, { roughness: 0.5 }), L * 0.36, 13, 0, L * 0.28, 20, Wd * 0.92);
    bx(g, GLASS(), L * 0.5, 17, 0, 0.6, 8, Wd * 0.8);
    if (mil) {
      bx(g, mat('#545a40', { roughness: 0.95 }), -L * 0.14, 19, 0, L * 0.7, 24, Wd);
      for (let q = -2; q <= 2; q++) bx(g, mat('#3a3f2c'), -L * 0.14 + q * L * 0.13, 31.2, 0, 1.2, 0.8, Wd + 0.2);
    } else {
      bx(g, mat('#e2ded4', { roughness: 0.6 }), -L * 0.14, 20, 0, L * 0.7, 28, Wd);
      bx(g, mat(pr.col || '#2a4a6a'), -L * 0.14, 20, 0, L * 0.7 + 0.2, 5, Wd + 0.2);
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
    x.fillStyle = color; x.font = `700 ${text.length > 4 ? 40 : 54}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
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
const dyn = { props: new Map(), decor: new Map(), signs: new Map(), humans: new Map(), corpses: new Map(), pickups: new Map(), relays: new Map() };
let sparkGeo, sparks, player3 = null, splatMesh, dotMesh, particles, partGeo, tracerGeo, tracers, rain, rainGeo, exitRing, exitBeam, nadeMeshes = [];
const MAXP = 600, MAXDEC = 450, RAIN_N = 1400;

/* ═══════════ 후처리 · 빛줄기 ═══════════
   장면을 HDR(반정밀도) 버퍼에 그리고 → 밝은 곳이 번지게(블룸) → 톤 매핑 · sRGB →
   마지막에 색 보정(어두운 곳은 청록, 밝은 곳은 따뜻하게) · 비네트 · 필름 그레인 · 가장자리 색 번짐 */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uVig: { value: 0.55 }, uGrain: { value: 0.045 }, uLift: { value: 0 }, uSh: { value: new THREE.Vector3(0.82, 1.0, 1.14) }, uHi: { value: new THREE.Vector3(1.08, 1.0, 0.88) }, uExp: { value: 1.75 }, uHaze: { value: new THREE.Vector4(0, 0, 0, 0) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  // 톤 매핑(ACES) · sRGB 변환까지 이 한 번에 — 전체 화면 패스를 하나 줄인다
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uVig, uGrain, uLift, uExp; uniform vec2 uRes; uniform vec3 uSh, uHi; uniform vec4 uHaze; varying vec2 vUv;
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
      c = srgb(aces(c));
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
  for (const k of ['acid', 'gas']) HZ[k].instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(HZ[k].count * 3), 3);
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
  for (const k in HZ) { HZ[k].instanceMatrix.needsUpdate = true; if (HZ[k].instanceColor) HZ[k].instanceColor.needsUpdate = true; }
  updateRelays(g, near);
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
      dyn.relays.set(r, o); scene.add(o);
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
/* 값싼 빛 모으기 — 매 프레임 후보(가로등 · 간판 · 불 · 출구)를 카메라 둘레 가까운 순으로 골라 시점 좌표로 넣는다 */
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
      void main(){ vUv = uv; float ph = fract(uTime * 1.3 + off.z); vK = ph;
        float cyc = floor(uTime * 1.3 + off.z);
        vec2 jit = vec2(fract(sin(cyc * 12.9 + off.z * 78.2) * 437.5), fract(sin(cyc * 39.3 + off.z * 11.1) * 951.7)) - 0.5;
        vec3 c = vec3(uOrigin.x + mod(off.x + jit.x * 160.0 + 350.0, 700.0) - 350.0, 0.7, uOrigin.z + mod(off.y + jit.y * 160.0 + 350.0, 700.0) - 350.0);
        vec3 v = c - uApex; float d = length(v);
        vA = (0.03 + 1.1 * smoothstep(uCos, uCos + 0.06, dot(v / max(d, 0.001), uDir)) * clamp(1.0 - d / uRange, 0.0, 1.0)) * (1.0 - ph);
        vec3 p = c + position * (2.5 + ph * 7.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `varying vec2 vUv; varying float vK, vA; void main(){ float r = length(vUv - 0.5) * 2.0; float ring = smoothstep(0.12, 0.0, abs(r - 0.8)); gl_FragColor = vec4(vec3(0.7, 0.78, 0.86) * ring * vA, 1.0); }`,
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
  const samples = window.LC_SAMPLES !== undefined ? window.LC_SAMPLES : touch ? 0 : 4;
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.55, 0.92);
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
  Object.assign(moon.shadow.camera, { left: -820, right: 820, top: 760, bottom: -760, near: 10, far: 2600 });
  moon.shadow.bias = -0.0008; moon.shadow.normalBias = 1.2;
  scene.add(hemi, moon, moon.target);
  // 손전등 — 가슴 높이에서 나가는 원뿔. 그림자를 드리운다
  spot = new THREE.SpotLight(0xfff1df, 9, 520, CONE_HALF * 1.05, 0.42, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.camera.near = 8; spot.shadow.camera.far = 620;
  spot.shadow.bias = -0.0006; spot.shadow.normalBias = 0.6;
  spotTarget = new THREE.Object3D();
  scene.add(spot, spotTarget); spot.target = spotTarget;
  muzzle = new THREE.PointLight(0xffc880, 0, 300, 0); scene.add(muzzle);
  R3D._fill = new THREE.PointLight(0xb8c4d8, 0.9, 150, 0); scene.add(R3D._fill);   // 플레이어 둘레의 옅은 빛 — 인물이 어둠에 묻히지 않게
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
  for (let i = 0; i < 6; i++) { const n = part(GEO.ico, mat('#3a4a2a', { roughness: 0.5 }), 0, 0, 0, 3.2, 3.2, 3.2); n.visible = false; nadeMeshes.push(n); scene.add(n); }
  // 총구 불꽃 · 폭발 섬광 — 빛(점광원)과 함께 보이는 밝은 판
  const addSprite = (c, sz) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); m.scale.set(sz, sz, 1); m.visible = false; scene.add(m); return m; };
  R3D._flash = addSprite(0xffd090, 34);
  R3D._flash.material.map = TEX.star; R3D._flash.material.color.setRGB(3.2, 2.3, 1.1);
  R3D._flashCore = addSprite(0xffffff, 14); R3D._flashCore.material.color.setRGB(2.4, 2.1, 1.6);
  R3D._boom = addSprite(0xffe0a0, 220);
  R3D._boomCore = addSprite(0xffffff, 90);
  window.addEventListener('resize', size);
  size();
}
/* 느린 기기 — 프레임이 오래 걸리면 해상도 → 그림자 → 해상도 순으로 한 단계씩 내린다('높음' 설정이면 그대로) */
const PERF = { ema: 16, last: 0, since: 0, level: 0 };
const PR_CAP = [1.5, 1.0, 0.85, 0.6];
function perfStep(now) {
  const dt = now - PERF.last;
  PERF.last = now;
  if (dt > 3000) { PERF.since = now; return; }          // 메뉴 · 탭 전환 뒤 — 다시 재기 시작
  // 아주 느린 프레임도 센다(예전엔 400ms 넘는 프레임을 멈춤으로 보고 버려, 느린 기기에서 화질이 내려가지 않았다)
  PERF.ema += (Math.min(dt, 400) - PERF.ema) * (dt > 100 ? 0.25 : 0.05);
  if (SETTINGS.quality === 'high' || PERF.level >= 3 || document.hidden) return;
  if (now - PERF.since > 2500 && PERF.ema > 42) {
    PERF.level++; PERF.since = now; PERF.ema = 30;
    if (PERF.level === 1 && composer) for (const t of [composer.renderTarget1, composer.renderTarget2]) if (t.samples) { t.samples = 0; t.dispose(); }
    if (PERF.level === 2) { renderer.shadowMap.enabled = false; spot.castShadow = false; scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; }); }
    size();
  }
}
function size() {
  if (!renderer) return;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, SETTINGS.quality === 'low' ? 0.75 : PR_CAP[PERF.level]));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(window.innerWidth, window.innerHeight); grade.uniforms.uRes.value.set(window.innerWidth * renderer.getPixelRatio(), window.innerHeight * renderer.getPixelRatio()); }
  camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
  camera.updateProjectionMatrix();
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
  RAIN_KIND = w.theme.weather === 'sandstorm' ? 2 : (w.theme.weather === 'snow' || w.theme.weather === 'blizzard') ? 1 : 0;
  rain.material.uniforms.uRainCol.value.set(...[[0.62, 0.7, 0.8], [1.6, 1.65, 1.75], [1.1, 0.82, 0.5]][RAIN_KIND]);
  resetRain();
}
function resetWorld(w) {
  clearChunks();
  for (const [, h] of dyn.humans) removeHuman(h);
  for (const k of ['props', 'decor', 'signs', 'humans', 'corpses', 'pickups', 'relays']) { for (const [, o] of dyn[k]) scene.remove(o); dyn[k].clear(); }
  dropPlayer();
  for (const lm of LM3) scene.remove(lm); LM3.length = 0;
  curWorld = w;
  ensureSignMats(w);
  applyKit(w);
  buildLandmarks(w);
}

/* 카메라 — 플레이어 앞쪽(바라보는 방향)으로 조금 당긴 곳을 남쪽 위에서 내려다본다 */
const camT = new THREE.Vector3();
function placeCamera(g) {
  const p = g.player, lead = 70 * Math.min(1, R3D.zoom || 1);
  const tx = p.x + Math.cos(p.angle) * lead, tz = p.y + Math.sin(p.angle) * lead;
  camT.set(tx, 12, tz);
  const sh = g.shake > 0.1 && SETTINGS.shake ? g.shake * 0.8 : 0;
  const D = DIST * (R3D.zoom || 1);
  camera.position.set(tx + (Math.random() - 0.5) * sh + (g.kickX || 0), D * Math.sin(PITCH), tz + D * Math.cos(PITCH) + (Math.random() - 0.5) * sh + (g.kickY || 0));
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
R3D._dbg = () => ({ CHAR, dyn, THREE, renderer, scene, camera, moon, hemi, spot, bloom, grade, MAT, CL, PERF });
R3D.hide = () => { if (cv) cv.style.display = 'none'; };

/* ═══════════ 매 프레임 ═══════════ */
R3D.render = g => {
  try { draw3(g); } catch (e) { fail('init', e); }
};
function draw3(g) {
  if (!renderer) init();
  perfStep(performance.now());
  const w = g.world, p = g.player;
  if (w !== curWorld) resetWorld(w);
  cv.style.display = '';
  placeCamera(g);
  syncChunks(w, camT.x, camT.z);
  const near = (x, y, m) => Math.abs(x - camT.x) < m && Math.abs(y - camT.z) < m * 1.1;

  TEX.waterN.offset.set(g.time * 0.012, g.time * 0.02);
  const blinkOn = (g.time % 1.1) < 0.55;
  BLINK_M.color.setRGB(blinkOn ? 3 : 0.15, blinkOn ? 1.6 : 0.08, blinkOn ? 0.3 : 0.02);
  // 탈것 · 장식 · 간판 — 게임이 플레이어 곁의 사본으로 옮겨 둔 자리
  for (const pr of w.props) {
    let o = dyn.props.get(pr);
    if (!near(pr.x, pr.y, 1100)) { if (o) o.visible = false; continue; }
    if (!o) { o = mergeStatic(makeProp(pr)); dyn.props.set(pr, o); scene.add(o); }
    o.visible = true; o.position.set(pr.x, 0, pr.y); o.rotation.y = -pr.a;
    if (o.userData.head) { const ca = Math.cos(pr.a), sa = Math.sin(pr.a), hd = o.userData.head; pushLight(pr.x + ca * (hd + 70), 14, pr.y + sa * (hd + 70), 190, HEAD_C, 1.3); if (blinkOn) pushLight(pr.x, 14, pr.y, 90, BLINK_C, 0.9); }
    if (o.userData.fire) addFire(pr.x + Math.cos(pr.a) * pr.w * 0.18, 12, pr.y + Math.sin(pr.a) * pr.w * 0.18, 1, o.userData.fire);
  }
  // 드럼통 불 — 덩어리가 들고 있는 자리
  for (const [, ch] of chunks) for (const f of ch.userData.fires) addFire(f.x, f.y, f.z, f.s, f.seed);
  for (const d of w.decor) {
    if (d.kind === 'tree' && w.deco[w.idx(Math.floor(d.x / TILE), Math.floor(d.y / TILE))] === D_BUILDING) continue;
    let o = dyn.decor.get(d);
    if (!near(d.x, d.y, 1100)) { if (o) o.visible = false; continue; }
    if (!o) { o = mergeStatic(makeDecor(d)); dyn.decor.set(d, o); scene.add(o); }
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
  SEE.rad.value = 95 * bh2 / Math.max(1, window.innerHeight) * Math.max(1, window.innerHeight / 800);
  // 후처리 — '가볍게' 설정이나 가장 낮은 화질 단계에서는 끈다
  const fx = composer && SETTINGS.quality !== 'low' && PERF.level < 3;
  if (fx) {
    grade.uniforms.uTime.value = g.time;
    grade.uniforms.uLift.value = (SETTINGS.brightness - 50) / 50;
    bloom.strength = 0.75 + Math.min(1, g.lightning) * 0.4;
    composer.render();
  } else renderer.render(scene, camera);
};

function updateSigns(g, w, near) {
  const t = g.time, lit = [];
  for (const sg of w.signs) {
    let o = dyn.signs.get(sg);
    const X = (sg.x + 0.5) * TILE, Z = (sg.y + 0.5) * TILE;
    if (!near(X, Z, 900)) { if (o) o.visible = false; continue; }
    if (!o) { o = makeSign(sg); dyn.signs.set(sg, o); scene.add(o); }
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
   세 몸체: 남성 시민(xbot — 몸 부위별로 옷 색을 칠한다), 여성 시민(michelle — 무늬를 좀비 빛깔로 바꾼 변형),
   군인(soldier — 플레이어 · 대피 기지의 감염체 · 방호복). 모두 같은 Mixamo 뼈대라 걷기 · 뛰기 · 서기 동작을 나눠 쓴다.
   좀비다운 자세(앞으로 뻗은 팔, 구부정한 등, 꺾인 고개)는 동작 위에 세계 좌표 보정으로 덧입힌다.
   모형을 불러오기 전 · 실패하면 예전의 단순 인형으로 그린다 */
const CHAR = { ready: false, loading: false, body: {} };
const MODEL_H = 50;
function modelSrc(k) { return (window.LC_MODELS && window.LC_MODELS[k]) || ('vendor/models/' + k + '.glb'); }
function loadChars() {
  if (CHAR.loading) return; CHAR.loading = true; CHAR.t0 = performance.now();
  const L = new GLTFLoader();
  Promise.all(['xbot', 'michelle', 'soldier'].map(k => L.loadAsync(modelSrc(k)).then(g => [k, g])))
    .then(list => {
      const t0 = performance.now();
      const G = Object.fromEntries(list);
      const walk = G.xbot.animations;
      prepBody('xbot', G.xbot, walk);
      prepBody('michelle', G.michelle, walk, true);
      prepBody('soldier', G.soldier, G.soldier.animations);
      CHAR.ready = true; CHAR.prepMs = Math.round(performance.now() - t0); CHAR.loadMs = Math.round(performance.now() - CHAR.t0);
      resetPeople();
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
/** 사람 한 명 — kind: xbot | michelle | soldier, skin: 무늬 변형 이름 또는 부위 색(look) */
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
function poseZombieRig(h, z, g, dt) {
  const u = h.userData, t = z.t, B = u.bones;
  const sp = Math.hypot(z.vx || 0, z.vy || 0) || (z.aggro ? t.speed : t.speed * 0.4);
  const moving = sp > 6 && !(t.weeper && !z.rage);
  const runner = t.speed > 100 || z.rage;
  blendRig(h, !moving ? 'idle' : runner && z.aggro ? 'run' : 'walk', 6, dt, runner && z.aggro ? Math.max(0.7, sp / 105) : Math.max(0.45, sp / 40));
  h.updateMatrixWorld(true);
  fwd.set(Math.cos(z.face), 0, Math.sin(z.face)); lat.set(fwd.z, 0, -fwd.x);
  const seed = (z.x * 0.013 + z.y * 0.007) % 1;
  // 등 · 고개
  const hunch = t.boss ? 0.25 : runner ? 0.45 : 0.32 + seed * 0.15;
  tiltBone(B.Spine, lat, hunch * 0.5); tiltBone(B.Spine1, lat, hunch * 0.5);
  const roll = Math.sin(g.time * 0.9 + seed * 9) * 0.25 + (seed - 0.5) * 0.5;
  tiltBone(B.Neck, fwd, roll * 0.6); tiltBone(B.Head, lat, -0.15 + Math.sin(g.time * 1.7 + seed * 5) * 0.08);
  // 팔
  const reach = !t.boss && !t.bloat && !t.spit && !runner && !(t.weeper && !z.rage);
  const claw = (t.scream && z.screamPhase === 'wind') || (t.weeper && !z.rage);
  if (reach || claw) {
    const sw = Math.sin(g.time * 2.2 + seed * 6) * 0.12;
    for (const [up, lo, sd] of [[B.LeftArm, B.LeftForeArm, 1], [B.RightArm, B.RightForeArm, -1]]) {
      if (claw) { tdir.copy(fwd).multiplyScalar(0.3).addScaledVector(YAX, 0.95).addScaledVector(lat, -sd * 0.3); aimBone(up, tdir, 0.85); aimBone(lo, tdir.addScaledVector(YAX, 0.4), 0.85); continue; }
      tdir.copy(fwd).addScaledVector(lat, -sd * (0.18 + sw)).addScaledVector(YAX, -0.12 + sd * sw * 0.5);
      aimBone(up, tdir, z.aggro ? 0.9 : 0.6);
      aimBone(lo, tdir.addScaledVector(YAX, -0.15), z.aggro ? 0.9 : 0.6);
    }
  }
  // 엎드려 기는 것 — 몸을 앞으로 눕힌다
  if (t.crawl) { u.body.rotation.z = -1.25; u.body.position.y = 7; }
  // 우는 것 — 웅크려 앉아 얼굴을 묻는다
  if (t.weeper && !z.rage) {
    u.body.position.y = -14;
    for (const [ul, ll] of [[B.LeftUpLeg, B.LeftLeg], [B.RightUpLeg, B.RightLeg]]) { aimBone(ul, tdir.copy(fwd).addScaledVector(YAX, 0.15), 1); aimBone(ll, tdir.copy(fwd).multiplyScalar(-0.3).addScaledVector(YAX, -1), 1); }
    tiltBone(B.Spine1, lat, 0.5); tiltBone(B.Head, lat, 0.5);
  } else if (!t.crawl) { u.body.position.y = 0; u.body.rotation.z = 0; }
  // 부푼 것 — 배가 부풀었다
  if (t.bloat && B.Spine1) { B.Spine1.scale.set(1.55, 1.15, 1.55); B.Spine2.scale.set(1 / 1.3, 1 / 1.05, 1 / 1.3); }
  // 눈 — 머리뼈 앞에 붉은 점 둘
  if (u.eyes) {
    const on = z.aggro || (t.weeper && z.startle > 0.5);
    u.eyes.visible = on && !!B.Head;
    if (on && B.Head) { B.Head.getWorldPosition(bv); u.eyes.position.copy(bv).addScaledVector(fwd, 3.4 * h.scale.x).addScaledVector(YAX, 1.2 * h.scale.x); u.eyes.rotation.y = -z.face; u.eyes.scale.setScalar(h.scale.x); }
  }
}
/** 좀비 생김새 → 몸체 · 무늬 */
function zombieRig(z) {
  const k = MODELS.lookOf(z), t = z.t;
  let h;
  const hs = (Math.imul(Math.floor(z.x * 13 + z.y * 7), 2654435761) >>> 0);
  if (k.helmet) h = makeRig('soldier', { tex: hs % 2 ? 'zombie' : 'zombie2' });
  else if (k.hazmat) h = makeRig('soldier', { tex: 'hazmat' });
  else if (!t.boss && !t.bloat && t.size < 18 && hs % 3 === 0) h = makeRig('michelle', { tex: ['zombie', 'zombie2', 'zombie3'][(hs >>> 4) % 3] });
  else {
    const look = { skin: deadSkin(t.boss || t.bloat || t.scream || t.weeper ? t.head : k.skin), top: t.boss || t.weeper || t.scream ? t.body : k.top, pants: t.weeper ? t.body : k.pants, shoes: '#141618' };
    for (const q of ['skin', 'top', 'pants']) look[q] = '#' + new THREE.Color(look[q]).multiplyScalar(0.8).getHexString(THREE.SRGBColorSpace);
    look.sleeve = hs % 2 ? look.top : look.skin;                    // 반소매면 팔뚝이 드러난다
    h = makeRig('xbot', { look });
  }
  const eyes = new THREE.Group();
  for (const sd of [-1, 1]) { const e = new THREE.Mesh(GEO.eye, EYE); e.position.set(0, 0, sd * 1.4); eyes.add(e); }
  eyes.visible = false; scene.add(eyes);
  h.userData.eyes = eyes;
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
  const mk = (key, len, parts) => { const gg = new THREE.Group(); for (const [m, x, y, z, sx, sy, sz] of parts) gg.add(part(GEO.box, m, x, y, z, sx, sy, sz)); gg.userData.len = len; gg.visible = false; pGun.add(gg); pGun.userData.guns[key] = gg; };
  mk('pistol', 9, [[blk, 3.5, 1.2, 0, 8, 2.2, 1.6], [dark, 0.2, -1.2, 0, 2, 3.6, 1.4]]);
  mk('smg', 15, [[blk, 5, 1, 0, 12, 3, 2], [dark, 3.5, -2.5, 0, 1.8, 4.5, 1.4], [dark, -0.5, -1.5, 0, 1.6, 3.4, 1.4], [blk, 12.5, 1.3, 0, 5, 1.2, 1.2], [dark, -4, 1, 0, 6, 1.6, 1]]);
  mk('shotgun', 22, [[blk, 9, 1.6, 0, 20, 1.6, 1.6], [wood, 10, 0, 0, 7, 2, 2], [wood, -4.5, 0.6, 0, 8, 2.6, 1.8], [dark, 0, -1, 0, 1.6, 3, 1.4]]);
  mk('rifle', 24, [[blk, 8, 1, 0, 18, 2.6, 1.8], [blk, 19, 1.3, 0, 8, 1, 1], [dark, 6, 3.6, 0, 7, 1.8, 1.8], [dark, 4.5, -2.6, 0, 2, 4, 1.4], [wood, -5, 0.5, 0, 9, 3, 1.8], [dark, 0, -1.4, 0, 1.6, 3.2, 1.4]]);
  scene.add(pGun);
  // 가슴 손전등 — 멜빵에 단 등. 빛줄기 · 스포트라이트가 여기서 나간다
  chestLamp = new THREE.Group();
  chestLamp.add(part(GEO.box, mat('#1a1c1f', { roughness: 0.5, metalness: 0.5 }), 0, 0, 0, 3, 3.2, 3.6));
  const lens = new THREE.Mesh(GEO.cyl, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.1, 1.9) }));
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
function posePlayerRig(h, p, g, dt) {
  const u = h.userData, B = u.bones;
  const sp = p.stride || 0, moving = sp > 0.05;
  blendRig(h, !moving ? 'idle' : p.sprinting ? 'run' : 'walk', 8, dt, p.sprinting ? 1.05 : 1.15);
  h.updateMatrixWorld(true);
  fwd.set(Math.cos(p.angle), 0, Math.sin(p.angle)); lat.set(fwd.z, 0, -fwd.x);
  const melee = p.meleeAnim > 0 ? Math.sin((1 - p.meleeAnim / 0.2) * Math.PI) : 0;
  const key = (p.weapon && p.weapon.key) || 'pistol', long = key !== 'pistol', S = h.scale.x;
  // 몸의 기준점 — 가슴(Spine2). 오른쪽은 -lat
  if (B.Spine2) B.Spine2.getWorldPosition(chestP); else chestP.set(p.x, 36 * S, p.y);
  const right = gO.copy(lat).multiplyScalar(-1);
  // 손 목표 — 권총은 두 손을 모아 앞으로 쭉, 긴 총은 오른손이 개머리 쪽 손잡이 · 왼손이 총열 밑
  const grip = new THREE.Vector3().copy(chestP).addScaledVector(fwd, (long ? 7 : 15) * S + melee * 6).addScaledVector(right, (long ? 3.5 : 0.6) * S).addScaledVector(YAX, (long ? -4.5 : -2.5) * S);
  const fore = new THREE.Vector3().copy(grip).addScaledVector(fwd, (long ? 11 : 0.5) * S).addScaledVector(right, (long ? -2 : -1.4) * S).addScaledVector(YAX, (long ? 0.5 : 0) * S);
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
function makeCorpseRig(c) {
  let h;
  if (c.type === 'player') h = makeRig('xbot', { look: { skin: '#9a7a64', top: '#23303c', sleeve: '#23303c', pants: '#2a3442', hair: '#141210' } });
  else if (c.hazmat) h = makeRig('soldier', { tex: 'hazmat' });
  else {
    const hs = (Math.imul(Math.floor(c.x * 13 + c.y * 7), 2654435761) >>> 0);
    if (hs % 3 === 0) h = makeRig('michelle', { tex: ['zombie', 'zombie2', 'zombie3'][(hs >>> 4) % 3] });
    else h = makeRig('xbot', { look: { skin: '#6a7262', top: c.top || '#5a5a50', pants: c.pants || '#2d3440', sleeve: c.top || '#5a5a50' } });
  }
  const u = h.userData;
  blendRig(h, 'idle', 100, 0.01, 1);
  for (const k in u.acts) u.acts[k].paused = true;
  h.updateMatrixWorld(true);
  const r = () => Math.random();
  fwd.set(1, 0, 0); lat.set(0, 0, -1);
  aimBone(u.bones.LeftArm, tdir.set(0.2 + r() * 0.5, 0.2, 1), 1); aimBone(u.bones.RightArm, tdir.set(0.1 + r() * 0.6, 0.3, -1), 1);
  aimBone(u.bones.LeftUpLeg, tdir.set(0.15, -1, 0.25 + r() * 0.2), 0.8); aimBone(u.bones.RightUpLeg, tdir.set(-0.1, -1, -0.2 - r() * 0.2), 0.8);
  u.body.rotation.z = Math.PI / 2 * (r() < 0.5 ? 1 : -1); u.body.position.y = 4;
  u.mixer.stopAllAction();
  return h;
}

let lastHT = -1;
function updateHumans(g, p) {
  const seen = new Set();
  const dt = lastHT < 0 ? 0 : Math.max(0, Math.min(0.1, g.time - lastHT)); lastHT = g.time;
  const rigs = CHAR.ready;
  for (const z of g.zombies) {
    if (z.dead) continue;
    seen.add(z);
    let h = dyn.humans.get(z);
    if (!h) {
      const t = z.t, S = t.boss ? 2.3 : t.size >= 18 ? 1.55 : t.bloat ? 1.18 : t.scream ? 1.08 : t.speed > 100 ? 1 : 1.05;
      if (rigs) { h = zombieRig(z); h.scale.setScalar(S); }
      else { h = makeHuman(zombieLook(z)); h.scale.setScalar(S * 1.25); }
      dyn.humans.set(z, h); scene.add(h);
    }
    const d = Math.hypot(z.x - p.x, z.y - p.y);
    const vis = Math.max(z.lit, Math.min(1, Math.max(0, (180 - d) / 60)), g.lightning * 1.4, z.t.boss ? 0.5 : 0);
    h.visible = d < 1300;
    h.position.set(z.x, 0, z.y); h.rotation.y = -z.face;
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
    if (eyes) { const on = aggro || (t.weeper && z.startle > 0.5); eyes[0].visible = eyes[1].visible = on; }
    // 맞은 순간 하얗게 — 몸 전체를 잠깐 밝힌다
    setFlash(h, z.flash > 0);
    if (vis < 0.02 && d > 260) h.visible = h.visible && g.lightning > 0.05 ? true : h.visible;
  }
  for (const [z, h] of dyn.humans) if (!seen.has(z)) { removeHuman(h); dyn.humans.delete(z); }
  // 플레이어
  if (!player3 && rigs) { player3 = makePlayerRig(); player3.scale.setScalar(1.06); scene.add(player3); }
  if (player3 && player3.userData.rig) {
    player3.visible = !p.dead; if (pGun) pGun.visible = !p.dead;
    player3.position.set(p.x, 0, p.y); player3.rotation.y = -p.angle;
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
    player3.scale.setScalar(1.3);
    // 플레이어만 옅은 윤곽광 — 어둠 속에서도 내가 어디 있는지 보인다(감염체는 어둠에 숨는다)
    const rimmed = new Map();
    player3.traverse(o => { if (o.isMesh && o.material.isMeshStandardMaterial) { if (!rimmed.has(o.material)) rimmed.set(o.material, enhance(o.material.clone(), false, '0.05, 0.08, 0.12')); o.material = rimmed.get(o.material); } });
    scene.add(player3);
  }
  player3.visible = !p.dead;
  player3.position.set(p.x, 0, p.y); player3.rotation.y = -p.angle;
  const melee = p.meleeAnim > 0 ? Math.sin((1 - p.meleeAnim / 0.2) * Math.PI) : 0;
  poseHuman(player3, { ph: p.walkPhase, amp: p.stride || 0, lean: 1.2, arms: 'gun', melee });
}

function updateCorpses(g, near) {
  const seen = new Set();
  for (const c of g.corpses) {
    if (!near(c.x, c.y, 1100)) continue;
    seen.add(c);
    let o = dyn.corpses.get(c);
    if (!o) {
      const look = c.type === 'player' ? { top: '#2f3a44', pants: '#262b31', skin: '#a8866e' } :
        { top: c.hazmat ? '#d9d7cc' : c.top || '#5a5a50', pants: c.hazmat ? '#cfcdc2' : c.pants || '#2d3440', skin: '#8a8f7c', gore: true };
      if (CHAR.ready) {
        o = makeCorpseRig(c);
        o.scale.setScalar(c.type === 'brute' ? 1.5 : c.type === 'behemoth' ? 2.2 : c.type === 'bloater' ? 1.2 : 1);
        o.rotation.y = -(c.a || 0) + Math.PI;
        dyn.corpses.set(c, o); scene.add(o);
        o.position.set(c.x, 0, c.y);
        continue;
      }
      const h = makeHuman(look);
      const r = () => Math.random();
      poseHuman(h, { ph: 0, amp: 0, arms: 'hang' });
      h.userData.armL.a.rotation.x = 0.8 + r() * 0.8; h.userData.armR.a.rotation.x = -0.8 - r() * 0.8;
      h.userData.legL.a.rotation.x = 0.2 + r() * 0.3; h.userData.legR.a.rotation.x = -0.2 - r() * 0.3;
      o = new THREE.Group(); h.rotation.z = Math.PI / 2; h.position.set(-12, 4, 0); o.add(h);
      const S = c.type === 'brute' ? 1.5 : c.type === 'behemoth' ? 2.2 : c.type === 'bloater' ? 1.2 : 1;
      o.scale.setScalar(S * 1.25);
      o.rotation.y = -(c.a || 0) + Math.PI;
      dyn.corpses.set(c, o); scene.add(o);
    }
    o.position.set(c.x, 0, c.y);
  }
  for (const [c, o] of dyn.corpses) if (!seen.has(c)) { scene.remove(o); dyn.corpses.delete(c); }
}

const dm = new THREE.Matrix4(), dq = new THREE.Quaternion(), dpos = new THREE.Vector3(), dsc = new THREE.Vector3(), UPY = new THREE.Vector3(0, 1, 0);
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
    const hgt = q.kind === 'smoke' ? 20 + (1 - k) * 40 : q.kind === 'mist' ? 22 : 14 + k * 10;
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
    tp.set([b.px, 24, b.py, b.x, 24, b.y], m * 6); m++;
  }
  tracerGeo.setDrawRange(0, m * 2); tracerGeo.attributes.position.needsUpdate = true;
  // 수류탄
  nadeMeshes.forEach((o, i) => { const gr = (g.grenades || [])[i]; o.visible = !!gr; if (gr) o.position.set(gr.x, 5, gr.y); });
}

const LT_PICK = [];
const PICK_COL = { ammo: '#e8c04a', shells: '#d0503a', rounds: '#c08a3a', medkit: '#e8e8e0', battery: '#5ab0e8', nade: '#6a8a3a', goal: '#59b7d8', note: '#f0ece0' };
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
        if (src) { const gm = src.clone(); gm.visible = true; gm.position.set(0, 9, 0); gm.scale.setScalar(1.7); const w = new THREE.Group(); w.add(gm); gm.position.x = -(src.userData.len || 20) * 0.6; o.add(w); }
        else { o.add(part(GEO.box, mat('#20242a', { emissive: col('#f0b429'), emissiveIntensity: 0.6 }), 0, 6, 0, 22, 3, 4)); o.userData.fb = true; }
        if (!LT_PICK.includes(pk)) LT_PICK.push(pk);
      }
      else if (pk.type === 'goal') o.add(part(GEO.box, mat(c, { emissive: col(c), emissiveIntensity: 0.9 }), 0, 7, 0, 12, 10, 12));
      else if (pk.type === 'note') o.add(part(GEO.box, mat(c, { emissive: col(c), emissiveIntensity: 0.4 }), 0, 1, 0, 10, 0.6, 13));
      else o.add(part(GEO.box, mat(c, { emissive: col(c), emissiveIntensity: 0.55 }), 0, 4, 0, 9, 7, 9));
      const halo = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: TEX.glow, color: col(c), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.position.y = 0.8; halo.scale.set(46, 1, 46); o.add(halo);
      dyn.pickups.set(pk, o); scene.add(o);
    }
    o.position.set(pk.x, Math.sin(g.time * 3 + pk.x) * 1.5, pk.y);
    o.children[0].rotation.y = g.time * 1.2;
  }
  for (const [pk, o] of dyn.pickups) if (!seen.has(pk)) { scene.remove(o); dyn.pickups.delete(pk); }
  // 떨어진 총은 금빛으로 바닥을 비춰 멀리서도 보인다
  for (let i = LT_PICK.length - 1; i >= 0; i--) { const pk = LT_PICK[i]; if (pk.dead || !seen.has(pk)) { LT_PICK.splice(i, 1); continue; } pushLight(pk.x, 14, pk.y, 90, tmpC.set(0xf0b429), 1.1 + Math.sin(g.time * 4) * 0.3); }
}

function updateMisc(g, p, w) {
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
  spot.intensity = range > 0 ? 8 * (range / 430) : 0;
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
    du.uApex.value.set(ox, oy, oz); du.uDir.value.copy(dir); du.uRange.value = reach; du.uTime.value = g.time;
    du.uOrigin.value.set(p.x, 0, p.y);
    du.uScale.value = renderer.domElement.height * 0.9;
  }
  dust.visible = beam.visible;
  const haveGun = pGun && pGun.visible;
  if (haveGun) muzzle.position.copy(muzzleP).addScaledVector(XAXIS.clone().set(ca, 0, sa), 4); else muzzle.position.set(p.x + ca * 44, 26, p.y + sa * 44);
  R3D._fill.position.set(p.x - ca * 20, 70, p.y - sa * 20 + 30);
  muzzle.intensity = p.muzzle > 0 ? 5 : 0;
  R3D._flash.visible = p.muzzle > 0 && !p.dead;
  R3D._flashCore.visible = R3D._flash.visible;
  if (R3D._flash.visible) {
    if (haveGun) R3D._flash.position.copy(muzzleP).add(gTmp.set(ca * 5, 0, sa * 5)); else R3D._flash.position.set(p.x + ca * 34, 30, p.y + sa * 34);
    const k = 0.7 + Math.random() * 0.5; R3D._flash.scale.set(24 * k, 24 * k, 1);
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
  hemi.intensity = 0.6 + L * 3 + (SETTINGS.brightness - 50) * 0.01;
  moon.intensity = 0.95 + L * 1.6;
  // 서남쪽 높은 하늘 — 보이는 남쪽 벽면에 비스듬한 달빛, 그림자는 동북쪽 길로 눕는다. 그림자 지도의 칸에 맞춰 움직여 떨림을 막는다
  const sx = Math.round(camT.x / 8) * 8, sz = Math.round(camT.z / 8) * 8;
  moon.position.set(sx - 900, 1250, sz + 380); moon.target.position.set(sx, 0, sz);
}

/** 0 비 · 1 눈 · 2 모래 — 같은 선분 묶음을 길이 · 속도만 바꿔 쓴다 */
let RAIN_KIND = 0;
const RAIN_SEG = [[-4, -22], [-1.2, -2.2], [-16, -1.2]];
function resetRain() {
  const a = rainGeo.attributes.position.array, [sx, sy] = RAIN_SEG[RAIN_KIND];
  for (let i = 0; i < RAIN_N; i++) { const o = i * 6; a[o + 3] = a[o] + sx; a[o + 4] = a[o + 1] + sy; a[o + 5] = a[o + 2]; }
  rainGeo.attributes.position.needsUpdate = true;
}
function updateRain(g, p) {
  const a = rainGeo.attributes.position.array, dt = 1 / 60, st = g.storm || 0, K = curWorld ? kitOf(curWorld) : KIT.seoul;
  const [sx, sy] = RAIN_SEG[RAIN_KIND];
  const vy = [900, 70 + st * 60, 60][RAIN_KIND], vx = [160, 40 + st * 260, 420 + st * 600][RAIN_KIND];
  for (let i = 0; i < RAIN_N; i++) {
    const o = i * 6, wob = RAIN_KIND === 1 ? Math.sin(g.time * 1.3 + i) * 18 * dt : 0;
    a[o + 1] -= vy * dt; a[o + 4] -= vy * dt; a[o] -= vx * dt + wob; a[o + 3] -= vx * dt + wob;
    if (a[o + 4] < 0 || a[o] < -900) {
      const x = RAIN_KIND && a[o] < -900 ? 800 : (Math.random() - 0.5) * 1600, z = (Math.random() - 0.5) * 1400, y = RAIN_KIND === 2 ? Math.random() * 160 : RAIN_KIND && a[o] < -900 ? Math.random() * 700 : 500 + Math.random() * 200;
      a[o] = x; a[o + 1] = y; a[o + 2] = z; a[o + 3] = x + sx; a[o + 4] = y + sy; a[o + 5] = z;
    }
  }
  rainGeo.attributes.position.needsUpdate = true;
  rain.position.set(camT.x, 0, camT.z - 200);
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
