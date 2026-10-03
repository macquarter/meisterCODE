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

const R3D = { ok: false };
window.R3D = R3D;

/* ── 설정 ── */
const CH = 16;                         // 덩어리 한 변(칸)
const FLOOR_PX = 34;                   // 한 층 높이 (세계 px)
const HMUL = 1.12;                     // 2D 판의 건물 높이(BLD_H) → 3D 높이 배수 — 원작처럼 벽이 높게 선다
const BLD_H3 = 0.19;
const PITCH = 0.93;                    // 카메라 내려다보는 각 (라디안, 약 53°)
const DIST = 640;                      // 카메라 거리
const FOV = 38;
const HUMAN_H = 40;                    // 사람 키 (세계 px)

let renderer, scene, camera, cv, curWorld = null;
let hemi, moon, spot, spotTarget, muzzle, blast;
const chunks = new Map();
const tmpV = new THREE.Vector3();

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

const TEX = {};
function makeTextures() {
  // 아스팔트 — 땜질 · 금 · 골재. 젖은 길이라 거칠기를 낮게(손전등이 번들거리며 반사된다)
  TEX.asphalt = canvasTex(512, 512, (x, W, H) => {
    const r = rng(31);
    x.fillStyle = '#3a3c40'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 14; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.09)'; x.fillRect(r() * W, r() * H, 50 + r() * 140, 40 + r() * 110); }
    for (let i = 0; i < 9000; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.13)'; x.fillRect(r() * W, r() * H, 1.5, 1.5); }
    x.strokeStyle = 'rgba(0,0,0,.45)'; x.lineWidth = 1.4;
    for (let i = 0; i < 10; i++) { let cx = r() * W, cy = r() * H, a = r() * 6.28; x.beginPath(); x.moveTo(cx, cy); for (let j = 0; j < 7; j++) { a += (r() - 0.5) * 1.3; cx += Math.cos(a) * (8 + r() * 16); cy += Math.sin(a) * (8 + r() * 16); x.lineTo(cx, cy); } x.stroke(); }
    for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(10,10,12,.25)'; x.beginPath(); x.ellipse(r() * W, r() * H, 10 + r() * 22, 6 + r() * 12, r() * 3, 0, 6.283); x.fill(); }
  });
  TEX.sidewalk = canvasTex(256, 256, (x, W, H) => {
    const r = rng(97);
    x.fillStyle = '#5e5d55'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const v = r(); x.fillStyle = v < 0.35 ? 'rgba(0,0,0,.08)' : v < 0.6 ? 'rgba(255,250,220,.04)' : 'rgba(0,0,0,0)'; x.fillRect(i * 64, j * 64, 64, 64); }
    for (let i = 0; i < 2600; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,240,.06)' : 'rgba(0,0,0,.1)'; x.fillRect(r() * W, r() * H, 1.5, 1.5); }
    x.fillStyle = 'rgba(0,0,0,.35)'; for (let k = 0; k < W; k += 64) { x.fillRect(0, k, W, 2); x.fillRect(k, 0, 2, H); }
  });
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
  TEX.roof = canvasTex(256, 256, (x, W, H) => {
    const r = rng(7);
    x.fillStyle = '#8a8c90'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.09)'; x.beginPath(); x.ellipse(r() * W, r() * H, 6 + r() * 24, 4 + r() * 14, r() * 3, 0, 6.283); x.fill(); }
    for (let i = 0; i < 3000; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.08)'; x.fillRect(r() * W, r() * H, 1.5, 1.5); }
    x.fillStyle = 'rgba(0,0,0,.18)'; for (let k = 0; k < W; k += 85) { x.fillRect(0, k, W, 2); x.fillRect(k + 30, 0, 2, H); }
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
  // 핏자국
  TEX.splat = canvasTex(128, 128, (x) => {
    const r = rng(101);
    const blob = (bx, by, rr, col) => { x.fillStyle = col; x.beginPath(); for (let i = 0; i <= 14; i++) { const a = i / 14 * 6.283, q = rr * (0.7 + r() * 0.5); i ? x.lineTo(bx + Math.cos(a) * q, by + Math.sin(a) * q) : x.moveTo(bx + Math.cos(a) * q, by + Math.sin(a) * q); } x.closePath(); x.fill(); };
    blob(56, 64, 26, '#3a0605'); for (let i = 0; i < 5; i++) blob(56 + (r() - 0.4) * 30, 64 + (r() - 0.5) * 30, 8 + r() * 12, '#420706');
    x.strokeStyle = '#3a0605'; x.lineCap = 'round';
    for (let i = 0; i < 7; i++) { const a = (r() - 0.5) * 1.3, len = 26 + r() * 36; x.lineWidth = 2 + r() * 4; x.beginPath(); x.moveTo(56 + Math.cos(a) * 18, 64 + Math.sin(a) * 18); x.lineTo(56 + Math.cos(a) * (18 + len), 64 + Math.sin(a) * (18 + len)); x.stroke(); }
    for (let i = 0; i < 30; i++) { const a = (r() - 0.5) * 2.4, d = 22 + r() * 40; x.fillStyle = '#3a0706'; x.beginPath(); x.arc(56 + Math.cos(a) * d, 64 + Math.sin(a) * d, 1 + r() * 2.5, 0, 6.283); x.fill(); }
  }, false);
  TEX.dot = canvasTex(32, 32, (x) => { const g = x.createRadialGradient(16, 16, 0, 16, 16, 15); g.addColorStop(0, 'rgba(60,8,6,1)'); g.addColorStop(0.7, 'rgba(60,8,6,.8)'); g.addColorStop(1, 'rgba(60,8,6,0)'); x.fillStyle = g; x.fillRect(0, 0, 32, 32); }, false);
  TEX.glow = canvasTex(64, 64, (x) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 31); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); }, false);
  TEX.fence = canvasTex(64, 64, (x) => { x.clearRect(0, 0, 64, 64); x.strokeStyle = 'rgba(200,205,208,.9)'; x.lineWidth = 1.5; for (let k = -64; k < 128; k += 12) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + 64, 64); x.stroke(); x.beginPath(); x.moveTo(k + 64, 0); x.lineTo(k, 64); x.stroke(); } });
}

const MAT = {};
function makeMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  MAT.asphalt = std({ map: TEX.asphalt, roughness: 0.42, metalness: 0.05 });       // 젖은 아스팔트
  MAT.sidewalk = std({ map: TEX.sidewalk, roughness: 0.7 });
  MAT.curb = std({ color: 0x8a8a84, roughness: 0.8 });
  MAT.plaza = std({ map: TEX.plaza, roughness: 0.6 });
  MAT.grass = std({ map: TEX.grass, roughness: 0.95 });
  MAT.water = std({ color: 0x0a1820, roughness: 0.08, metalness: 0.3 });
  MAT.bridge = std({ color: 0x4a4e54, roughness: 0.6 });
  MAT.paint = std({ color: 0xd8d6cc, roughness: 0.5 });
  MAT.yellow = std({ color: 0xc9a83a, roughness: 0.5 });
  MAT.brick = std({ map: TEX.brick, vertexColors: true, roughness: 0.85, emissive: 0xffffff, emissiveMap: TEX.brickLit, emissiveIntensity: 0.9 });
  MAT.stucco = std({ map: TEX.stucco, vertexColors: true, roughness: 0.85, emissive: 0xffffff, emissiveMap: TEX.stuccoLit, emissiveIntensity: 0.9 });
  MAT.shop = std({ map: TEX.shop, vertexColors: true, roughness: 0.7 });
  MAT.roof = std({ map: TEX.roof, vertexColors: true, roughness: 0.9 });
  MAT.parapet = std({ color: 0x6a6c70, roughness: 0.85 });
  MAT.stone = std({ color: 0x77736a, roughness: 0.85 });
  MAT.rooftop = std({ color: 0x7a7e84, roughness: 0.7 });
  MAT.fence = std({ map: TEX.fence, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.6 });
  // 건물이 플레이어를 가리면 그 둘레를 체크무늬로 뚫어 비친다 (원작처럼 플레이어가 벽 뒤로 사라지지 않게)
  for (const k of ['brick', 'stucco', 'shop', 'roof', 'parapet', 'stone', 'rooftop']) seeThrough(MAT[k]);
}
const SEE = { pos: { value: new THREE.Vector2(-9999, -9999) }, depth: { value: 0 }, rad: { value: 120 } };
function seeThrough(m) {
  m.onBeforeCompile = sh => {
    sh.uniforms.uSeePos = SEE.pos; sh.uniforms.uSeeDepth = SEE.depth; sh.uniforms.uSeeRad = SEE.rad;
    sh.fragmentShader = 'uniform vec2 uSeePos; uniform float uSeeDepth; uniform float uSeeRad;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
      { float d = length(gl_FragCoord.xy - uSeePos) / uSeeRad;
        if (d < 1.0 && gl_FragCoord.z < uSeeDepth) {
          float k = smoothstep(0.55, 1.0, d);
          vec2 q = mod(floor(gl_FragCoord.xy), 2.0);
          if (k < 0.5 || (k < 0.85 && q.x == q.y)) discard;
        } }`);
  };
}

/* ═══════════ 세계 덩어리 — 바닥 · 건물 ═══════════ */
function bh(w, x, y) {
  const i = w.idx(x, y);
  const l = w.lot[i] || (((i % w.w) >> 2) * 31 + ((i / w.w | 0) >> 2) * 17 + 1);
  return BLD_H3 * (0.8 + ((Math.imul(l, 2654435761) >>> 0) % 6) * 0.1) * 480 * HMUL;
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
  const B = {}; const get = k => B[k] || (B[k] = new Bucket());
  const T = TILE, x0 = cx * CH, y0 = cy * CH;
  const deco = (x, y) => w.deco[w.idx(x, y)];
  const isB = (x, y) => deco(x, y) === D_BUILDING;
  const isRoadish = (x, y) => { const d = deco(x, y), gr = w.grid[w.idx(x, y)]; return gr === T_ROAD && (d === D_ASPHALT || d === D_PROP || d === D_RUBBLE); };
  const SW_H = 3;
  for (let y = y0; y < y0 + CH; y++) for (let x = x0; x < x0 + CH; x++) {
    const i = w.idx(x, y), d = w.deco[i], gr = w.grid[i];
    const X0 = x * T, Z0 = y * T, X1 = X0 + T, Z1 = Z0 + T;
    if (d === D_BUILDING) {
      const h = bh(w, x, y), wm = wallMat3(w, x, y), wc = col(wm[0], 1.5), brick = wm[1];
      const lot = w.lot[i];
      const rc = col(ROOFS3[(lot || (x * 7 + y * 3)) % ROOFS3.length], 1.25);
      floorQuad(get('roof'), X0, Z0, X1, Z1, h, 300, rc);
      // 바깥 벽 — 이웃이 건물이 아니거나 낮으면 그 높이부터
      const sides = [[0, 1, X0, Z1, X1, Z1, [0, 0, 1]], [0, -1, X1, Z0, X0, Z0, [0, 0, -1]], [1, 0, X1, Z1, X1, Z0, [1, 0, 0]], [-1, 0, X0, Z0, X0, Z1, [-1, 0, 0]]];
      for (const [dx, dy, ax, az, bx, bz, n] of sides) {
        const hn = isB(x + dx, y + dy) ? bh(w, x + dx, y + dy) : 0;
        if (h <= hn + 0.5) continue;
        const uu = dx === 0 ? (dy > 0 ? X0 : -X1) : (dx > 0 ? -Z1 : Z0);
        if (hn === 0) {
          wallQuad(get('shop'), ax, az, bx, bz, 0, FLOOR_PX, n, wc, uu, 1 / FLOOR_PX);
          wallQuad(get(brick ? 'brick' : 'stucco'), ax, az, bx, bz, FLOOR_PX, h, n, wc, uu);
        } else wallQuad(get(brick ? 'brick' : 'stucco'), ax, az, bx, bz, hn, h, n, wc, uu);
        // 난간 — 지붕 가장자리를 둘러 낮은 벽
        const same = isB(x + dx, y + dy) && w.lot[w.idx(x + dx, y + dy)] === lot;
        if (!same) {
          const P = get('parapet'), ph = 6, t = 3, ix = -n[0] * t, iz = -n[2] * t;
          wallQuad(P, ax, az, bx, bz, h, h + ph, n, null, 0);
          wallQuad(P, bx + ix, bz + iz, ax + ix, az + iz, h, h + ph, [-n[0], 0, -n[2]], null, 0);
          P.quad([ax, h + ph, az], [bx, h + ph, bz], [bx + ix, h + ph, bz + iz], [ax + ix, h + ph, az + iz], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
        }
      }
      // 옥상 설비 — 필지마다 해시로 (계단실 · 실외기)
      const hh = ((x * 2654435761) ^ (y * 40503)) >>> 0;
      if (isB(x + 1, y) && isB(x, y + 1) && w.lot[w.idx(x + 1, y)] === lot && w.lot[w.idx(x, y + 1)] === lot) {
        if (hh % 11 === 3) roofBox(get('rooftop'), X0 + 8, Z0 + 10, 30, 24, h, 26);
        else if (hh % 7 === 1) { roofBox(get('rooftop'), X0 + 6, Z0 + 14, 16, 11, h, 9); roofBox(get('rooftop'), X0 + 26, Z0 + 14, 16, 11, h, 9); }
        else if (hh % 9 === 4) roofBox(get('rooftop'), X0 + 18, Z0 + 18, 9, 9, h, 7);
      }
      continue;
    }
    if (d === D_WATER) { floorQuad(get('water'), X0, Z0, X1, Z1, -8, 200); bankWalls(w, get('curb'), x, y, X0, Z0, X1, Z1); continue; }
    if (d === D_BRIDGE) { floorQuad(get('bridge'), X0, Z0, X1, Z1, 0, 200); continue; }
    if (d === D_GRASS) { floorQuad(get('grass'), X0, Z0, X1, Z1, 1, 200); continue; }
    if (d === D_PLAZA || d === D_LANDMARK) {
      floorQuad(get('plaza'), X0, Z0, X1, Z1, 0, 160);
      if (gr === T_WALL) lmBlock(get('stone'), w, x, y, X0, Z0, X1, Z1);
      else if (gr === T_WATER) fencePanel(get('fence'), w, x, y, X0, Z0, X1, Z1);
      continue;
    }
    if (d === D_SIDEWALK) {
      floorQuad(get('sidewalk'), X0, Z0, X1, Z1, SW_H, 160);
      // 연석 — 차도와 맞닿은 쪽에 높이 3 의 옆면
      const C = get('curb');
      if (isRoadish(x, y + 1)) wallQuad(C, X0, Z1, X1, Z1, 0, SW_H, [0, 0, 1], null, 0);
      if (isRoadish(x, y - 1)) wallQuad(C, X1, Z0, X0, Z0, 0, SW_H, [0, 0, -1], null, 0);
      if (isRoadish(x + 1, y)) wallQuad(C, X1, Z1, X1, Z0, 0, SW_H, [1, 0, 0], null, 0);
      if (isRoadish(x - 1, y)) wallQuad(C, X0, Z0, X0, Z1, 0, SW_H, [-1, 0, 0], null, 0);
      continue;
    }
    // 차도
    floorQuad(get('asphalt'), X0, Z0, X1, Z1, 0, 420);
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
    if (k === 'brick' || k === 'stucco' || k === 'shop' || k === 'parapet' || k === 'stone' || k === 'rooftop') m.castShadow = true;
    if (k === 'fence') { m.castShadow = true; m.receiveShadow = false; }
    g.add(m);
  }
  return g;
}
function roofBox(B, x, z, wd, dp, y, h) {
  const x1 = x + wd, z1 = z + dp, y1 = y + h;
  B.quad([x, y1, z], [x, y1, z1], [x1, y1, z1], [x1, y1, z], [0, 1, 0], [[0, 0], [0, 1], [1, 1], [1, 0]]);
  wallQuad(B, x, z1, x1, z1, y, y1, [0, 0, 1], null, 0);
  wallQuad(B, x1, z, x, z, y, y1, [0, 0, -1], null, 0);
  wallQuad(B, x1, z1, x1, z, y, y1, [1, 0, 0], null, 0);
  wallQuad(B, x, z, x, z1, y, y1, [-1, 0, 0], null, 0);
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
  const need = new Set();
  for (let dy = -3; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) {
    const key = (ccx + dx) + ',' + (ccy + dy);
    need.add(key);
    if (!chunks.has(key)) {
      const g = buildChunk(w, ccx + dx, ccy + dy);
      chunks.set(key, g); scene.add(g);
      break;                                              // 한 프레임에 하나씩 — 끊김 없이
    }
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
function mat(hex, o = {}) {
  const key = hex + JSON.stringify(o);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial(Object.assign({ color: col(hex, o.k || 1), roughness: 0.75 }, o.k ? {} : {}, Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'k')))));
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
  const mTop = mat(look.top), mPants = mat(look.pants), mSkin = mat(look.skin, { roughness: 0.6 }), mShoe = mat(look.shoes || '#16181b');
  root.add(part(GEO.pelvis, mPants, 0, 19, 0));
  spine.add(part(GEO.torso, mTop, 0.4, 8.6, 0, 0.82, 1, 1.18));
  const head = new THREE.Group(); head.position.set(1.2, 19.6, 0); spine.add(head);
  head.add(part(GEO.head, mSkin, 0, 0, 0));
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
  const armL = limb(spine, 0, 14.5, 7.2, GEO.armU, GEO.armL, look.sleeve ? mat(look.sleeve) : mTop, mSkin, GEO.hand, mSkin, 9.5, 9);
  const armR = limb(spine, 0, 14.5, -7.2, GEO.armU, GEO.armL, look.sleeve ? mat(look.sleeve) : mTop, mSkin, GEO.hand, mSkin, 9.5, 9);
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
function paint(hex) { return mat(hex, { roughness: 0.32, metalness: 0.35 }); }
const GLASS = () => mat('#121820', { roughness: 0.08, metalness: 0.6 });
function bx(g, m, x, y, z, sx, sy, sz) { const o = part(GEO.box, m, x, y, z, sx, sy, sz); o.receiveShadow = true; g.add(o); return o; }
function wheelsOn(g, xs, hz, r) { const m = mat('#0d0e10', { roughness: 0.9 }); for (const x of xs) for (const sd of [-1, 1]) g.add(part(GEO.wheel, m, x, r, sd * hz, r, r, 3)); }
function makeProp(pr) {
  const g = new THREE.Group(), L = pr.w, Wd = pr.h, k = pr.kind;
  if (k === 'car') {
    bx(g, paint(pr.col), 0, 8, 0, L, 9, Wd);
    bx(g, paint(pr.col), -L * 0.06, 16.5, 0, L * 0.52, 8, Wd * 0.86);
    bx(g, GLASS(), -L * 0.06, 16.6, 0, L * 0.53, 6, Wd * 0.88);
    bx(g, mat('#fff4d0', { emissive: col('#fff4d0'), emissiveIntensity: 0.15 }), L / 2, 9, Wd * 0.32, 0.6, 2.4, 4).position.z = Wd * 0.32;
    bx(g, mat('#c02018', { emissive: col('#c02018'), emissiveIntensity: 0.5 }), -L / 2, 9.5, 0, 0.6, 2.2, Wd * 0.8);
    wheelsOn(g, [-L * 0.32, L * 0.32], Wd / 2 - 1, 4.4);
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
const dyn = { props: new Map(), decor: new Map(), signs: new Map(), humans: new Map(), corpses: new Map(), pickups: new Map() };
let player3 = null, splatMesh, dotMesh, particles, partGeo, tracerGeo, tracers, rain, rainGeo, exitRing, exitBeam, signLights = [], nadeMeshes = [];
const MAXP = 600, MAXDEC = 450, RAIN_N = 1400;

function init() {
  cv = document.createElement('canvas');
  cv.id = 'view3d';
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  const stage = document.getElementById('stage');
  stage.insertBefore(cv, stage.firstChild);
  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040507);
  scene.fog = new THREE.FogExp2(0x06080c, 0.00062);
  camera = new THREE.PerspectiveCamera(FOV, 1, 20, 4000);
  makeTextures(); makeMaterials(); makeGeos();

  // 달빛과 하늘빛 — 아주 어둡게. 거리와 벽의 윤곽만 겨우 읽힌다
  hemi = new THREE.HemisphereLight(0x7b8aa4, 0x1a1c22, 0.85);
  moon = new THREE.DirectionalLight(0x8a9cc0, 0.5);
  moon.position.set(-300, 800, -500);
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
  for (let i = 0; i < 2; i++) { const l = new THREE.PointLight(0xffffff, 0, 170, 0); signLights.push(l); scene.add(l); }
  const exitL = new THREE.PointLight(0x50c8ff, 0, 220, 0); scene.add(exitL); R3D._exitL = exitL;

  // 핏자국 · 작은 핏방울 — 바닥에 눕힌 판의 인스턴스
  const decMat = (tex) => new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.25, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 });
  splatMesh = new THREE.InstancedMesh(GEO.plane, decMat(TEX.splat), MAXDEC); splatMesh.count = 0; splatMesh.receiveShadow = true; splatMesh.frustumCulled = false;
  dotMesh = new THREE.InstancedMesh(GEO.plane, decMat(TEX.dot), MAXDEC); dotMesh.count = 0; dotMesh.receiveShadow = true; dotMesh.frustumCulled = false;
  scene.add(splatMesh, dotMesh);
  // 파티클 — 피 · 불똥 · 안개 · 연기
  partGeo = new THREE.BufferGeometry();
  partGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(MAXP * 3), 3));
  partGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(MAXP * 3), 3));
  particles = new THREE.Points(partGeo, new THREE.PointsMaterial({ size: 5, vertexColors: true, map: TEX.glow, transparent: true, depthWrite: false, sizeAttenuation: true }));
  particles.frustumCulled = false; scene.add(particles);
  // 총알 궤적
  tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(200 * 6), 3));
  tracers = new THREE.LineSegments(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.8 }));
  tracers.frustumCulled = false; scene.add(tracers);
  // 비 — 카메라 둘레 상자 안에서 떨어지는 짧은 선
  rainGeo = new THREE.BufferGeometry();
  const rp = new Float32Array(RAIN_N * 6);
  for (let i = 0; i < RAIN_N; i++) { const x = (Math.random() - 0.5) * 1600, y = Math.random() * 700, z = (Math.random() - 0.5) * 1400; rp.set([x, y, z, x - 4, y - 22, z], i * 6); }
  rainGeo.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
  rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0x9fb2c8, transparent: true, opacity: 0.32 }));
  rain.frustumCulled = false; scene.add(rain);
  // 출구 — 빛나는 고리와 옅은 빛기둥
  exitRing = new THREE.Mesh(GEO.ring, new THREE.MeshBasicMaterial({ color: 0x50c8ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
  exitRing.scale.set(40, 1, 40);
  exitBeam = new THREE.Mesh(new THREE.CylinderGeometry(30, 34, 260, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x50c8ff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  scene.add(exitRing, exitBeam);
  for (let i = 0; i < 6; i++) { const n = part(GEO.ico, mat('#3a4a2a', { roughness: 0.5 }), 0, 0, 0, 3.2, 3.2, 3.2); n.visible = false; nadeMeshes.push(n); scene.add(n); }
  window.addEventListener('resize', size);
  size();
}
function size() {
  if (!renderer) return;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, SETTINGS.quality === 'low' ? 0.75 : 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
  camera.updateProjectionMatrix();
}

function resetWorld(w) {
  clearChunks();
  for (const k of ['props', 'decor', 'signs', 'humans', 'corpses', 'pickups']) { for (const [, o] of dyn[k]) scene.remove(o); dyn[k].clear(); }
  if (player3) { scene.remove(player3); player3 = null; }
  for (const lm of LM3) scene.remove(lm); LM3.length = 0;
  curWorld = w;
  buildLandmarks(w);
}

/* 카메라 — 플레이어 앞쪽(바라보는 방향)으로 조금 당긴 곳을 남쪽 위에서 내려다본다 */
const camT = new THREE.Vector3();
function placeCamera(g) {
  const p = g.player, lead = 70;
  const tx = p.x + Math.cos(p.angle) * lead, tz = p.y + Math.sin(p.angle) * lead;
  camT.set(tx, 12, tz);
  const sh = g.shake > 0.1 && SETTINGS.shake ? g.shake * 0.8 : 0;
  camera.position.set(tx + (Math.random() - 0.5) * sh + (g.kickX || 0), DIST * Math.sin(PITCH), tz + DIST * Math.cos(PITCH) + (Math.random() - 0.5) * sh + (g.kickY || 0));
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
R3D.hide = () => { if (cv) cv.style.display = 'none'; };

/* ═══════════ 매 프레임 ═══════════ */
R3D.render = g => {
  if (!renderer) init();
  const w = g.world, p = g.player;
  if (w !== curWorld) resetWorld(w);
  cv.style.display = '';
  placeCamera(g);
  syncChunks(w, camT.x, camT.z);
  const near = (x, y, m) => Math.abs(x - camT.x) < m && Math.abs(y - camT.z) < m * 1.1;

  // 탈것 · 장식 · 간판 — 게임이 플레이어 곁의 사본으로 옮겨 둔 자리
  for (const pr of w.props) {
    let o = dyn.props.get(pr);
    if (!near(pr.x, pr.y, 1100)) { if (o) o.visible = false; continue; }
    if (!o) { o = makeProp(pr); dyn.props.set(pr, o); scene.add(o); }
    o.visible = true; o.position.set(pr.x, 0, pr.y); o.rotation.y = -pr.a;
  }
  for (const d of w.decor) {
    if (d.kind === 'tree' && w.deco[w.idx(Math.floor(d.x / TILE), Math.floor(d.y / TILE))] === D_BUILDING) continue;
    let o = dyn.decor.get(d);
    if (!near(d.x, d.y, 1100)) { if (o) o.visible = false; continue; }
    if (!o) { o = makeDecor(d); dyn.decor.set(d, o); scene.add(o); }
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
  updateMisc(g, p, w);
  updateLights(g, p, w);
  updateRain(g, p);
  // 플레이어를 가리는 벽 · 지붕은 둘레를 뚫어 비친다
  tmpV.set(p.x, 22, p.y).project(camera);
  const bw = renderer.domElement.width, bh2 = renderer.domElement.height;
  SEE.pos.value.set((tmpV.x + 1) / 2 * bw, (tmpV.y + 1) / 2 * bh2);
  SEE.depth.value = (tmpV.z + 1) / 2 - 0.0004;
  SEE.rad.value = 95 * bh2 / Math.max(1, window.innerHeight) * Math.max(1, window.innerHeight / 800);
  renderer.render(scene, camera);
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
  lit.sort((a, b) => a[0] - b[0]);
  signLights.forEach((l, i) => {
    const s = lit[i];
    if (!s) { l.intensity = 0; return; }
    const [, sg, o, f] = s;
    l.color.set(sg.col); l.intensity = 1.3 * f;
    l.position.copy(o.position); l.position.y = FLOOR_PX * 1.1;
    const dir = new THREE.Vector3(0, 0, 1).applyEuler(o.rotation); l.position.addScaledVector(dir, 22);
  });
}

function zombieLook(z) {
  const k = MODELS.lookOf(z), t = z.t;
  const look = { top: k.top, pants: k.pants, skin: k.skin, hair: k.hair, eyes: true };
  if (k.hazmat) { look.hood = '#e2e0d6'; look.hair = null; }
  if (k.helmet) { look.helmet = '#3d4330'; look.hair = null; }
  if (t.bloat) { look.belly = t.body; look.skin = t.head; }
  if (t.spit) look.sac = '#7da040';
  if (t.weeper) { look.top = t.body; look.pants = t.body; look.skin = t.head; look.hair = '#121212'; }
  if (t.boss || t.size >= 18) { look.top = t.boss ? t.body : '#3b3f3a'; look.skin = t.boss ? t.head : k.skin; look.sleeve = t.boss ? t.head : k.skin; }
  if (t.scream) { look.top = t.body; look.skin = t.head; }
  return look;
}
function updateHumans(g, p) {
  const seen = new Set();
  for (const z of g.zombies) {
    if (z.dead) continue;
    seen.add(z);
    let h = dyn.humans.get(z);
    if (!h) {
      h = makeHuman(zombieLook(z));
      const t = z.t, S = t.boss ? 2.3 : t.size >= 18 ? 1.55 : t.bloat ? 1.18 : t.scream ? 1.08 : t.speed > 100 ? 1 : 1.05;
      h.scale.setScalar(S * 1.25);
      dyn.humans.set(z, h); scene.add(h);
    }
    const d = Math.hypot(z.x - p.x, z.y - p.y);
    const vis = Math.max(z.lit, Math.min(1, Math.max(0, (180 - d) / 60)), g.lightning * 1.4, z.t.boss ? 0.5 : 0);
    h.visible = d < 1300;
    h.position.set(z.x, 0, z.y); h.rotation.y = -z.face;
    const t = z.t, ph = z.phase, aggro = !!z.aggro;
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
      poseHuman(h, { ph, amp: aggro ? 1 : 0.55, arms, lean: t.boss ? 6 : t.speed > 100 ? 5 : 2.6, sway: Math.sin(ph) * (aggro ? 3 : 1.4), head: { tilt: z.look ? (z.look.tilt || 0) * 0.08 : 0 } });
    }
    const eyes = h.userData.head.userData.eyes;
    if (eyes) { const on = aggro || (t.weeper && z.startle > 0.5); eyes[0].visible = eyes[1].visible = on; }
    // 맞은 순간 하얗게 — 몸 전체를 잠깐 밝힌다
    h.userData.flash = z.flash > 0;
    if (vis < 0.02 && d > 260) h.visible = h.visible && g.lightning > 0.05 ? true : h.visible;
  }
  for (const [z, h] of dyn.humans) if (!seen.has(z)) { scene.remove(h); dyn.humans.delete(z); }
  // 플레이어
  if (!player3) {
    player3 = makeHuman({ top: '#2f3a44', pants: '#262b31', skin: '#c9a184', hair: '#1d1a17', shoes: '#121416', sleeve: '#2f3a44' });
    const gun = new THREE.Group(); gun.position.set(10, 13.5, -2.2);
    gun.add(part(GEO.box, mat('#15181c', { roughness: 0.5, metalness: 0.5 }), 6, 0, 0, 16, 2.6, 2));
    gun.add(part(GEO.cyl, mat('#f4e2a8', { emissive: col('#fff2c8'), emissiveIntensity: 2 }), 14.5, -1.8, 0, 1.2, 1.5, 1.2));
    gun.children[1].rotation.z = Math.PI / 2;
    player3.userData.spine.add(gun);
    player3.add(part(GEO.box, mat('#3b3428'), -6.5, 30, 0, 5, 12, 10));   // 배낭
    player3.scale.setScalar(1.3);
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
        { top: c.hazmat ? '#d9d7cc' : c.top || '#5a5a50', pants: c.hazmat ? '#cfcdc2' : c.pants || '#2d3440', skin: '#8a8f7c' };
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
  let ns = 0, nd = 0;
  for (const d of g.decals) {
    if (!near(d.x, d.y, 1000)) continue;
    const big = d.s !== undefined;
    if (big ? ns >= MAXDEC : nd >= MAXDEC) continue;
    const r = d.r * (big ? 2 : 1.6);
    dq.setFromAxisAngle(UPY, -(d.rot || 0));
    dpos.set(d.x, big ? 0.6 : 0.5, d.y); dsc.set(r, 1, r);
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
  for (const q of g.particles) {
    if (n >= MAXP) break;
    const k = Math.max(0, Math.min(1, q.life / q.max));
    const hgt = q.kind === 'smoke' ? 20 + (1 - k) * 40 : q.kind === 'mist' ? 22 : 14 + k * 10;
    pos[n * 3] = q.x; pos[n * 3 + 1] = hgt; pos[n * 3 + 2] = q.y;
    pcol.set(q.col); const a = q.kind === 'smoke' ? 0.35 * k : q.kind === 'mist' ? 0.5 * k : k;
    cl[n * 3] = pcol.r * a; cl[n * 3 + 1] = pcol.g * a; cl[n * 3 + 2] = pcol.b * a;
    n++;
  }
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

const PICK_COL = { ammo: '#e8c04a', shells: '#d0503a', rounds: '#c08a3a', medkit: '#e8e8e0', battery: '#5ab0e8', nade: '#6a8a3a', goal: '#59b7d8', note: '#f0ece0' };
function updatePickups(g, near) {
  const seen = new Set();
  for (const pk of g.pickups) {
    if (pk.dead || !near(pk.x, pk.y, 1000)) continue;
    seen.add(pk);
    let o = dyn.pickups.get(pk);
    if (!o) {
      const c = PICK_COL[pk.type] || '#f0b429';
      o = new THREE.Group();
      if (pk.type && pk.type.startsWith('wpn_')) o.add(part(GEO.box, mat('#20242a', { emissive: col('#f0b429'), emissiveIntensity: 0.6 }), 0, 6, 0, 22, 3, 4));
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
}

function updateMisc(g, p, w) {
  const open = g.exitOpen && g.level.objective.type !== 'endless';
  exitRing.visible = exitBeam.visible = open;
  R3D._exitL.intensity = open ? 2.2 : 0;
  if (open) {
    exitRing.position.set(w.exit.x, 0.8, w.exit.y); exitRing.rotation.y = g.time * 0.6;
    exitBeam.position.set(w.exit.x, 130, w.exit.y);
    R3D._exitL.position.set(w.exit.x, 40, w.exit.y);
  }
}

function updateLights(g, p, w) {
  const range = p.dead ? 0 : p.lightRange;
  const ca = Math.cos(p.angle), sa = Math.sin(p.angle);
  spot.position.set(p.x + ca * 8, 46, p.y + sa * 8);
  spotTarget.position.set(p.x + ca * 200, 0, p.y + sa * 200);
  spot.intensity = range > 0 ? 14 * (range / 430) : 0;
  spot.distance = Math.max(10, range * 1.25);
  muzzle.position.set(p.x + ca * 24, 24, p.y + sa * 24);
  R3D._fill.position.set(p.x - ca * 20, 70, p.y - sa * 20 + 30);
  muzzle.intensity = p.muzzle > 0 ? 7 : 0;
  // 폭발 섬광
  let fl = null;
  for (const f of g.flashes) if (!fl || f.t < fl.t) fl = f;
  if (fl) { const k = 1 - fl.t / fl.life; blast.position.set(fl.x, 40, fl.y); blast.intensity = 14 * k; } else blast.intensity = 0;
  // 번개 — 하늘빛이 순간 밝아진다
  const L = SETTINGS.flash ? g.lightning : g.lightning * 0.3;
  hemi.intensity = 0.85 + L * 3 + (SETTINGS.brightness - 50) * 0.012;
  moon.intensity = 0.5 + L * 1.6;
  moon.position.set(camT.x - 420, 760, camT.z + 520); moon.target.position.copy(camT);   // 카메라 쪽 하늘 — 보이는 벽면에 달빛
}

function updateRain(g, p) {
  const a = rainGeo.attributes.position.array, dt = 1 / 60;
  for (let i = 0; i < RAIN_N; i++) {
    const o = i * 6;
    a[o + 1] -= 900 * dt; a[o + 4] -= 900 * dt; a[o] -= 160 * dt; a[o + 3] -= 160 * dt;
    if (a[o + 4] < 0) {
      const x = (Math.random() - 0.5) * 1600, z = (Math.random() - 0.5) * 1400, y = 500 + Math.random() * 200;
      a[o] = x; a[o + 1] = y; a[o + 2] = z; a[o + 3] = x - 4; a[o + 4] = y - 22; a[o + 5] = z;
    }
  }
  rainGeo.attributes.position.needsUpdate = true;
  rain.position.set(camT.x, 0, camT.z - 200);
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
function boxAt(g, m, x, y, z, sx, sy, sz) { const o = part(GEO.box, m, x, y, z, sx, sy, sz); o.receiveShadow = true; g.add(o); return o; }
function buildLandmarks(w) {
  for (const lm of w.landmarks) {
    const g = new THREE.Group(), T = TILE, X = v => v * T, k = lm.kind;
    g.userData.lm = lm;
    const stoneM = mat('#8a857a', { roughness: 0.85 }), darkRoof = mat('#2a2e33', { roughness: 0.6 }), red = mat('#9a2a20', { roughness: 0.6 });
    if (k === 'palace') {
      const H = lm.hall, G = lm.gate;
      boxAt(g, red, X(H.x + H.w / 2), 30, X(H.y + H.h / 2), X(H.w) - 20, 40, X(H.h) - 20);
      hipRoof(g, X(H.x), X(H.y), X(H.w), X(H.h), 50, 34, darkRoof, 14);
      hipRoof(g, X(G.x), X(G.y), X(G.w), X(G.h), 34, 22, darkRoof, 10);
      // 담장 기와 — 둘레 담 위에 어두운 기와 띠
      boxAt(g, darkRoof, X(lm.x + lm.w / 2), 32, X(lm.y) + 24, X(lm.w), 5, 30);
    } else if (k === 'temple') {
      const H = lm.hall;
      boxAt(g, red, X(H.x + H.w / 2), 26, X(H.y + H.h / 2), X(H.w) - 20, 32, X(H.h) - 20);
      hipRoof(g, X(H.x), X(H.y), X(H.w), X(H.h), 42, 36, darkRoof, 16);
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
      boxAt(g, mat('#7a7e84', { roughness: 0.6 }), X(c.x + c.w / 2), 70, X(c.y + c.h / 2), X(c.w), 5, X(c.h));
      boxAt(g, red, X(c.x + c.w / 2), 70, X(c.y + c.h / 2), X(c.w) + 1, 4, X(c.h) + 1).scale.y = 2;
      g.add(part(GEO.cyl, mat('#5a5e62'), X(lm.sign[0]), 50, X(lm.sign[1]), 2.5, 100, 2.5));
      boxAt(g, mat('#c94a3a', { emissive: col('#ff5a40'), emissiveIntensity: 0.8 }), X(lm.sign[0]), 104, X(lm.sign[1]), 30, 26, 4);
    } else if (k === 'hawker') {
      const C = ['#c94f3d', '#3d7fc9', '#d9a43a', '#3a9a6a', '#9a4ac9'];
      lm.stalls.forEach(([x, y], i) => boxAt(g, mat(C[i % C.length], { emissive: col(C[i % C.length]), emissiveIntensity: 0.25 }), X(x + 0.5), 24, X(y + 1) - 2, X(1) - 4, 8, 2));
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
      boxAt(g, mat('#2a2622', { roughness: 0.6, metalness: 0.3 }), X(h.x + h.w / 2), 16, X(h.y + h.h / 2), X(h.w), 44, X(h.h) - 4);
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
    }
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
    if (o.userData.screens) for (const m of o.userData.screens) m.color.setHSL(((g.time * 20) % 360) / 360, 0.5, 0.25 + Math.random() * 0.15);
  }
}

R3D.ok = true;
