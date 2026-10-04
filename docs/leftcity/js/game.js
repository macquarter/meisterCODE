/* ═══════════════════════════════════════════
   LEFT CITY — 남겨진 도시 : 게임 루프 · 렌더 · 입력
   ═══════════════════════════════════════════ */
(() => {
'use strict';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
/** 캔버스 글자의 글꼴 — CSS 변수(var(--font))는 캔버스가 읽지 못해 기본 글꼴로 그려졌다. 화면 · 간판 모두 Pretendard 로 */
const CANVAS_FONT = '"Pretendard", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
window.LC_FONT = CANVAS_FONT;
if (document.fonts && document.fonts.load) for (const w of [400, 700]) document.fonts.load(`${w} 16px Pretendard`).catch(() => {});
const lerp = (a, b, t) => a + (b - a) * t;

const view = $('view');
const ctx = view.getContext('2d');
const mask = document.createElement('canvas');
const mctx = mask.getContext('2d');
/* 손전등 빛 층 — 어둠 막과 같은 절반 해상도. 빛을 여기 그리고 그림자 자리를 지운 뒤 화면에 더한다 */
const glowCv = document.createElement('canvas');
const gctx = glowCv.getContext('2d');

/* ═══════════ 해상도 ═══════════
   프레임 비용은 화면 픽셀 수에 거의 비례한다 — 어둠 막 · 불빛 · 비 · 바닥이 모두 화면 전체를 칠하기 때문이다.
   레티나 1440×900(2880×1800, 518만 픽셀)에서 17fps, 같은 장면 1280×800(102만)에서 59fps.
   그래서 기기 배율을 그대로 쓰지 않고 픽셀 예산 안에서 고르고(DPR), '자동'이면 실제 프레임을 보고
   해상도를 계단식으로 낮추거나 올린다. 어둠 막은 어차피 부드러운 빛이라 절반 해상도로 그린다. */
/* 화면 확대(ZOOM) — 큰 모니터에서 사람이 개미만 해지고 더 멀리 보이던 문제. 화면 높이 800px 를 1배로
   잡고 그보다 크면 확대한다(최대 2배). 그래서 1080p·1440p 에서도 보이는 도시의 넓이가 비슷하다.
   W · H 는 '논리 화면'(세계를 그리는 단위)이고, DEV 는 기기 배율, DPR = DEV × ZOOM 이 캔버스 배율이다. */
let W = 0, H = 0, DPR = 1, MDPR = 0.5, DEV = 1, ZOOM = 1, HUDZ = 1;
/* 화면 비율 — 기본(fill)은 창을 어떤 비율이든 꽉 채운다(3D 카메라가 좁은 화면에서 시야를 넓혀 맞춘다).
   '16:9'(wide)를 고르면 창이 그보다 좁거나 세로일 때 16:9 띠로 두고(레터박스), 세로 화면에서는 띠를 위쪽에 두어
   아래 빈 곳이 조작 버튼 자리가 된다(휴대용 게임기처럼). 3D 판도 이 크기를 쓴다 */
const STAGE = window.STAGE = { x: 0, y: 0, w: 1, h: 1 };
function stageFit() {
  const w = window.innerWidth, h = window.innerHeight;
  if (SETTINGS.get('aspect') !== 'wide' || w / Math.max(1, h) >= 16 / 9 - 0.02) Object.assign(STAGE, { x: 0, y: 0, w, h });
  else { const sh = Math.round(w * 9 / 16); Object.assign(STAGE, { x: 0, y: Math.round((h - sh) * (h > w ? 0.28 : 0.5)), w, h: sh }); }
  const st = document.getElementById('stage');
  if (st) Object.assign(st.style, { left: STAGE.x + 'px', top: STAGE.y + 'px', width: STAGE.w + 'px', height: STAGE.h + 'px', right: 'auto', bottom: 'auto' });
  document.documentElement.classList.toggle('letterbox', STAGE.h < h - 1);
}
/** 카메라 거리별로 보이는 '논리 화면'의 높이 · 너비 목표 (세계 단위) */
const CAM_VIEW = { near: [470, 780], mid: [600, 980], far: [800, 1280] };
const BUDGET = { high: 3.6e6, auto: 2.2e6, low: 0.85e6 };
const RES = { max: 1, ema: 16.7, holdT: 0, okT: 0, ceil: 9 };
function maxDPR() {
  const dev = Math.min(window.devicePixelRatio || 1, 2);
  const cap = Math.sqrt(BUDGET[SETTINGS.quality] / Math.max(1, STAGE.w * STAGE.h));
  return Math.max(0.5, Math.min(dev, cap));
}
function applyScale(s) {
  DEV = s; DPR = s * ZOOM; MDPR = DPR * 0.5;
  window.AFT_SCALE = DPR;          // 모형이 미리 그려 두는 그림(시체)의 해상도
  view.width = Math.max(1, Math.floor(W * DPR)); view.height = Math.max(1, Math.floor(H * DPR));
  mask.width = Math.max(1, Math.ceil(W * MDPR)); mask.height = Math.max(1, Math.ceil(H * MDPR));
  glowCv.width = mask.width; glowCv.height = mask.height;
  view.style.width = STAGE.w + 'px'; view.style.height = STAGE.h + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  mctx.setTransform(MDPR, 0, 0, MDPR, 0, 0);
}
function resize() {
  // 카메라 거리 — 원작 예고편처럼 사람이 크게 보이도록 '가까이'가 기본. 보이는 세계의 높이 · 너비 목표를
  // 정하고 둘 중 더 좁게 잡히는 쪽에 맞춘다(세로 휴대폰이 너무 좁아지지 않게). 1배 밑으로는 줄이지 않는다
  stageFit();
  const [th, tw] = CAM_VIEW[SETTINGS.cam] || CAM_VIEW.near;
  ZOOM = Math.max(1, Math.min(3.2, STAGE.h / th, STAGE.w / tw));
  W = STAGE.w / ZOOM; H = STAGE.h / ZOOM;
  // 글자 · HUD 도 큰 화면에서는 함께 키운다(데스크톱만 — 터치는 손가락 크기가 기준). 카메라 거리와는 따로
  const sz = Math.max(1, Math.min(2, STAGE.h / 800));
  HUDZ = matchMedia('(hover:none) and (pointer:coarse)').matches ? 1 : Math.max(1, Math.min(1.5, 1 + (sz - 1) * 0.8));
  document.documentElement.style.setProperty('--hudz', HUDZ);
  RES.max = maxDPR(); RES.ceil = 9; RES.holdT = 1;
  applyScale(RES.max);
}
/** 자동 화질 — 프레임 간격(ms)의 이동 평균(약 1초)이 22ms 를 넘으면 18% 낮추고,
    4초 동안 60fps 를 지키면 10% 올린다. 올렸다가 다시 떨어진 높이는 기억해 그 아래에서 멈춘다 */
/** 세부 묘사(재질 무늬 · 손전등 그림자 · 인물 윤곽 · 빗물 물결) — 자동 화질의 첫 단계. 해상도를 낮추기 전에 이것부터 끈다:
    화면이 흐려지는 것보다 벽돌 결이 사라지는 쪽이 덜 거슬린다. 소프트웨어 렌더러에서 무늬는 한 장에 약 2ms.
    다시 켰다가 또 버거우면(두 번째) 그 판에서는 끈 채로 둔다. '선명하게'는 늘 켜고, '가볍게'는 늘 끈다 */
const TEX = { on: true, strikes: 0, okT: 0 };
function texOn() { return SETTINGS.quality === 'high' || (SETTINGS.quality !== 'low' && TEX.on); }
function adaptRes(ms) {
  if (SETTINGS.quality !== 'auto' || G.state !== 'play') { RES.ema = 16.7; RES.okT = 0; return; }
  ms = Math.min(ms, 100);
  RES.ema += (ms - RES.ema) * 0.03;
  RES.holdT -= ms / 1000;
  if (RES.holdT > 0) return;
  if (TEX.on && RES.ema > 18.2) { TEX.on = false; TEX.strikes++; TEX.okT = 0; RES.ema = 16.7; RES.holdT = 1.5; return; }
  if (!TEX.on && TEX.strikes < 2 && DEV >= RES.max - 0.01) {
    TEX.okT = RES.ema < 16.9 ? TEX.okT + ms / 1000 : 0;
    if (TEX.okT > 10) { TEX.on = true; TEX.okT = 0; RES.holdT = 1.5; return; }
  }
  // 무리가 몰려오는 순간의 짧은 끊김에는 반응하지 않는다. 1배 밑으로는 정말 버거울 때만
  if (RES.ema > 22 && DEV > 0.55 && (DEV > 1.01 || RES.ema > 27)) {
    RES.ceil = Math.min(RES.ceil, DEV * 0.97);
    applyScale(Math.max(0.5, DEV * 0.82));
    RES.ema = 16.7; RES.holdT = 1.2; RES.okT = 0;
  } else if (RES.ema < 18) {
    RES.okT += ms / 1000;
    const up = Math.min(RES.max, RES.ceil, DEV * 1.1);
    if (RES.okT > 4 && up > DEV + 0.02) { applyScale(up); RES.holdT = 1.2; RES.okT = 0; }
  } else RES.okT = 0;
}
window.addEventListener('resize', resize);
resize();
// 앱을 내리거나 탭을 바꾸면 멈춘다 — 돌아왔을 때 이미 물려 있지 않게
document.addEventListener('visibilitychange', () => {
  if (document.hidden && typeof G !== 'undefined' && G.state === 'play') G.togglePause();
});
SETTINGS.onChange(k => { if (k === 'quality' || k === 'cam' || k === 'aspect' || k === null) resize(); });
/* 언어 — 고정 문구를 바꾸고, 지금 열린 화면을 새 언어로 다시 그린다 */
I18N.set(SETTINGS.lang);
document.addEventListener('DOMContentLoaded', () => I18N.apply());
if (document.readyState !== 'loading') I18N.apply();
SETTINGS.onChange(k => {
  if (k !== 'lang' && k !== null) return;
  I18N.set(SETTINGS.lang);
  I18N.apply();
  if (typeof UI === 'undefined') return;
  const open = id => !$(id).classList.contains('hidden');
  if (open('scrTitle')) UI.enterMenu();
  if (open('scrSettings')) UI.syncSettings();
  if (open('scrChapters')) UI.buildChapters();
  if (open('scrHowto')) UI.buildHowto();
  if (open('scrKeys')) UI.buildKeys();
  if (G.state === 'play' || G.state === 'pause') G.refreshHud();
});

const isTouch = matchMedia('(hover:none) and (pointer:coarse)').matches;
if (isTouch) document.body.classList.add('touch');
/** 터치 버튼 크기 */
function applyTouchSize() {
  for (const k of ['small', 'normal', 'large']) document.body.classList.toggle('ts-' + k, SETTINGS.touchSize === k);
}
applyTouchSize();
SETTINGS.onChange(k => { if (k === 'touchSize' || k === null) applyTouchSize(); });
/** 짧은 진동 — 지원 기기 · 설정이 켜졌을 때만. 너무 잦으면 손이 저리므로 간격을 둔다 */
let buzzT = 0;
function buzz(ms) {
  if (!isTouch || !SETTINGS.haptics || !navigator.vibrate) return;
  const now = performance.now();
  if (now < buzzT) return;
  buzzT = now + Math.max(120, ms * 3);
  try { navigator.vibrate(ms); } catch (e) { /* 막힌 환경 */ }
}

/* ═══════════ 입력 ═══════════ */
const keys = Object.create(null);
const input = { mx: W / 2, my: H / 2, firing: false, moveX: 0, moveY: 0, aimTouch: null, turnRate: 0, dragTurn: 0, hasMouse: !isTouch,
                // 터치 질주는 누르고 있는 버튼이 아니라 걸쇠다 — 두 엄지가 이미 스틱 위에 있어서
                sprintLatch: false, idleT: 0 };

/** 키 다시 묶기 대기 중이면 그 행동 id — 이때 누른 키는 게임으로 가지 않는다 */
let rebinding = null;
const WEAPON_OF = { w1: 'pistol', w2: 'smg', w3: 'shotgun', w4: 'rifle', w5: 'magnum', w6: 'auto', w7: 'lmg', w8: 'crossbow', w9: 'flamer', w10: 'launcher', w11: 'rail', w12: 'minigun' };

/** 누름 한 번에 일어나는 행동 (누르고 있는 행동은 프레임마다 KEYBIND.held 로 읽는다) */
function pressAction(act, e) {
  if (G.state === 'arms') {
    if (WEAPON_OF[act] || act === 'arms') { if (e) e.preventDefault(); G.closeArms(WEAPON_OF[act]); }
    return;
  }
  if (act === 'map' && (G.state === 'play' || G.state === 'map')) { if (e) e.preventDefault(); G.toggleMap(); return; }
  if (G.state !== 'play') return;
  const p = G.player;
  switch (act) {
    case 'arms':   if (e) e.preventDefault(); G.openArms(); break;
    case 'nade':   p.throwNade(G); break;
    case 'reload': p.reload(G); break;
    case 'melee':  p.melee(G); break;
    case 'cycle':  p.cycle(G); break;
    case 'light':  G.toggleLight(); break;
    default: if (WEAPON_OF[act]) p.select(WEAPON_OF[act], G);
  }
}

addEventListener('keydown', e => {
  if (rebinding) { e.preventDefault(); UI.finishRebind(e.code); return; }
  keys[e.code] = true;
  const act = KEYBIND.action(e.code);
  // 브라우저 기본 동작(스크롤 · 포커스 이동)을 막는다 — 게임 키일 때만
  if (act || ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) {
    if (G.state === 'play' || G.state === 'arms' || G.state === 'map') e.preventDefault();
  }
  if (!$('scrStory').classList.contains('hidden')) {
    if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); if (!e.repeat) UI.storyNext(); return; }
    if (e.code === 'Escape') { UI.storyEnd(); return; }
  }
  if (e.code === 'Escape') {
    if (Modal.close()) return;
    if (G.state === 'arms') { G.closeArms(); return; }
    if (G.state === 'map') { G.toggleMap(); return; }
    G.togglePause();
    return;
  }
  if (e.repeat) return;
  if (act) pressAction(act, e);
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; input.firing = false; });

view.addEventListener('mousemove', e => { input.mx = (e.clientX - STAGE.x) / ZOOM; input.my = (e.clientY - STAGE.y) / ZOOM; input.hasMouse = true; PAD.aim = null; });
view.addEventListener('mousedown', e => {
  SFX.resume();
  if (e.button === 0) { input.firing = true; return; }
  const code = 'Mouse' + e.button;
  keys[code] = true;
  const act = KEYBIND.action(code);
  if (act) pressAction(act, e);
});
addEventListener('mousedown', e => {
  // 키 설정 화면에서는 마우스 버튼(왼쪽 제외)도 받는다
  if (rebinding && e.button !== 0) { e.preventDefault(); UI.finishRebind('Mouse' + e.button); }
}, true);
addEventListener('mouseup', e => { if (e.button === 0) input.firing = false; else keys['Mouse' + e.button] = false; });
view.addEventListener('contextmenu', e => e.preventDefault());

/* ═══════════ 게임패드 (표준 배치) ═══════════
   왼쪽 스틱 이동 · 오른쪽 스틱 조준(손전등) · RT 사격 · LT/L3 질주 · RB 수류탄 · LB 밀치기
   X 재장전 · Y 다음 무기 · A 손전등 · B 무기 고르기 · Back/D-pad ↑ 전체 지도 · Start 일시정지.
   메뉴에서는 D-pad/왼쪽 스틱으로 고르고 A 로 누르고 B 로 돌아간다. */
const PAD = { connected: false, mx: 0, my: 0, aim: null, fire: false, sprint: false, prev: [], navT: 0, focus: null };
function padItems() {
  if (G.state === 'arms') return [...document.querySelectorAll('#arms .arm:not([disabled])')];
  const scr = document.querySelector('.screen:not(.hidden)');
  if (!scr) return [];
  if (scr.id === 'scrStory') return [$('storyTap')];      // A 로 넘긴다 (누르면 화면 전체의 storynext 로 올라간다)
  return [...scr.querySelectorAll('button:not([disabled]), .chapter:not(.chapter--locked), input[type=range]')]
    .filter(el => el.offsetParent !== null);
}
function padFocus(el) {
  if (PAD.focus) PAD.focus.classList.remove('padfocus');
  PAD.focus = el;
  if (!el) return;
  el.classList.add('padfocus');
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest' });
}
function padBack() {
  if (Modal.close()) return;
  if (G.state === 'pause') { G.togglePause(); return; }
  if (G.state === 'arms') { G.closeArms(); return; }
  if (G.state === 'map') { G.toggleMap(); return; }
  const scr = document.querySelector('.screen:not(.hidden)');
  const b = scr && scr.querySelector('[data-act=back],[data-act=setback],[data-act=keyback],[data-act=storyskip]');
  if (b) b.click();
}
function pollPad(dt) {
  const list = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null;
  for (const g of list) if (g && g.connected) { gp = g; break; }
  if (!gp) {
    if (PAD.connected) { PAD.connected = false; PAD.mx = PAD.my = 0; PAD.fire = PAD.sprint = false; PAD.aim = null; }
    return;
  }
  if (!PAD.connected) { PAD.connected = true; if (G.state === 'play') G.toast(T('게임패드 연결 — 배치는 일시정지 › 조작법'), 3); }
  const btn = i => !!gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.45);
  const down = i => btn(i) && !PAD.prev[i];
  const dz = v => Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82;
  const ax = dz(gp.axes[0] || 0), ay = dz(gp.axes[1] || 0), rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;

  if (G.state === 'play') {
    PAD.mx = ax; PAD.my = ay;
    // 화면 방향 → 세계 방향 (세로가 줄어든 만큼 되돌린다)
    if (Math.hypot(rx, ry) > 0.35) { PAD.aim = Math.atan2(ry / TILT, rx); input.hasMouse = false; }
    PAD.fire = btn(7); PAD.sprint = btn(6) || btn(10);
    if (down(5)) pressAction('nade');
    if (down(4)) pressAction('melee');
    if (down(2)) pressAction('reload');
    if (down(3) || down(15)) pressAction('cycle');
    if (down(0)) pressAction('light');
    if (down(1)) pressAction('arms');
    if (down(8) || down(12)) pressAction('map');
    if (down(9)) G.togglePause();
  } else {
    PAD.mx = PAD.my = 0; PAD.fire = PAD.sprint = false;
    if (G.state === 'map') { if (down(0) || down(1) || down(8) || down(12)) G.toggleMap(); }
    else {
      // 메뉴 — 위아래(또는 좌우)로 옮겨 다니고 A 로 누른다. 스틱은 길게 밀면 0.18초마다 한 칸
      PAD.navT -= dt;
      const items = padItems();
      let step = 0;
      if (down(13) || down(15)) step = 1;
      else if (down(12) || down(14)) step = -1;
      else if (PAD.navT <= 0 && (Math.abs(ay) > 0.6 || Math.abs(ax) > 0.6)) step = (Math.abs(ay) > Math.abs(ax) ? ay : ax) > 0 ? 1 : -1;
      if (step) PAD.navT = 0.18;
      if (items.length) {
        let i = items.indexOf(PAD.focus);
        if (i < 0) { i = 0; if (!step) padFocus(items[0]); }
        if (step) padFocus(items[(i + step + items.length) % items.length]);
        if (down(0) && PAD.focus) {
          if (PAD.focus.matches('input[type=range]')) { PAD.focus.stepUp(2); PAD.focus.dispatchEvent(new Event('input', { bubbles: true })); }
          else PAD.focus.click();
        }
      }
      if (down(1)) padBack();
      if (down(9) && G.state === 'pause') G.togglePause();
    }
  }
  PAD.prev = gp.buttons.map((_, i) => btn(i));
}
addEventListener('gamepaddisconnected', () => { PAD.connected = false; });

/* 터치: 좌 = 이동 스틱, 우 = 조준(또는 회전) 스틱.
   모바일 슈터의 표준을 따른다 — 스틱은 '떠 있다': 엄지가 닿는 자리에 생기므로 정해진 원을 찾을 필요가 없다.
   반응 곡선은 가운데가 섬세하고 끝에서 최대(데드존 12%). */
function bindPad(el, onVec, axisX) {
  const knob = el.querySelector('i');
  let id = null, ox = 0, oy = 0;
  const R = 46;
  const track = t => {
    let dx = t.clientX - ox, dy = t.clientY - oy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = dx / d * R; dy = dy / d * R; }
    if (axisX && axisX()) { dx = clamp(t.clientX - ox, -R, R); dy = 0; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    const m = Math.min(1, d / R), k = m < 0.12 ? 0 : Math.pow((m - 0.12) / 0.88, 1.25);
    const u = d > 0.001 ? k / m : 0;
    onVec(dx / R * u, dy / R * u, k, false, d / R);
  };
  /** float = 엄지가 닿은 자리로 스틱을 옮긴다 */
  const begin = (t, float) => {
    id = t.identifier;
    if (float) {
      el.classList.add('floating');
      el.style.left = (t.clientX - el.offsetWidth / 2) + 'px';
      el.style.top = (t.clientY - el.offsetHeight / 2) + 'px';
      el.style.right = 'auto'; el.style.bottom = 'auto';
      ox = t.clientX; oy = t.clientY;
    } else {
      const b = el.getBoundingClientRect();
      ox = b.left + b.width / 2; oy = b.top + b.height / 2;
    }
    track(t); SFX.resume();
  };
  const end = e => {
    for (const t of e.changedTouches) {
      if (t.identifier !== id) continue;
      id = null; knob.style.transform = '';
      el.classList.remove('floating');
      el.style.left = el.style.top = el.style.right = el.style.bottom = '';
      onVec(0, 0, 0, true);
    }
  };
  el.addEventListener('touchstart', e => { e.preventDefault(); if (id === null) begin(e.changedTouches[0], false); }, { passive: false });
  // 스틱 위에서 시작한 손가락은 스틱으로, 화면에서 시작한(떠 있는) 손가락은 창으로 이벤트가 온다 — 둘 다 듣는다(두 번 와도 같은 값)
  const mv = e => { for (const t of e.changedTouches) if (t.identifier === id) track(t); };
  for (const tg of [el, window]) {
    tg.addEventListener('touchmove', mv, { passive: true });
    tg.addEventListener('touchend', end);
    tg.addEventListener('touchcancel', end);
  }
  return { begin, active: () => id !== null };
}
const movePad = bindPad($('padMove'), (x, y, k, rel, raw) => { input.moveX = x; input.moveY = y; input.moveMag = k || 0; input.moveRaw = raw || 0; });
/* 오른쪽 스틱은 설정에 따라 넷 중 하나로 동작한다.
   auto  — 자동 조준(기본): 손대지 않으면 손전등이 가까운 적, 없으면 걷는 쪽을 비춘다(Archero · Survivor.io).
           끌면 그 방향을 곧바로 비추고, 짧게 톡 치면 가장 가까운 적으로 홱 돌린다(Brawl Stars 의 퀵 파이어)
   stick — 민 방향을 곧바로 바라본다(트윈 스틱)
   turn  — 원작: 좌우로 민 만큼 손전등이 그 방향으로 돈다 (회전 속도 조절)
   drag  — 원작 1.1: 오른쪽 화면을 좌우로 끌어 돈다 */
const TURN_MAX = 3.4;   // rad/s
let aimTap = null;
const aimPad = bindPad($('padTurn'), (x, y, m, released) => {
  if (SETTINGS.aim === 'turn') {
    input.turnRate = x * TURN_MAX;
    input.aimTouch = null;
    return;
  }
  input.turnRate = 0;
  if (released) {
    // 톡 치고 뗐다 — 가장 가까운 적을 비춘다
    if (aimTap && performance.now() - aimTap.t < 240 && !aimTap.moved) {
      const z = autoAimTarget(G, true);
      if (z) { G.player.angle = Math.atan2(z.y - G.player.y, z.x - G.player.x); input.manualHoldT = 1.4; }
    } else if (SETTINGS.aim === 'auto') input.manualHoldT = 0.9;   // 끌던 쪽을 잠깐 유지한 뒤 자동으로
    input.aimTouch = null; aimTap = null;
    return;
  }
  if (aimTap && m > 0.25) aimTap.moved = true;
  input.aimTouch = m > 0.25 ? Math.atan2(y / TILT, x) : input.aimTouch;     // 화면 방향 → 세계 방향
}, () => SETTINGS.aim === 'turn');

/* 화면 아무 데나 — 왼쪽 절반은 이동 스틱, 오른쪽 절반은 조준 스틱이 그 자리에 생긴다 */
view.addEventListener('touchstart', e => {
  if (G.state !== 'play') return;
  for (const t of e.changedTouches) {
    if (t.clientX < innerWidth * 0.5) { if (!movePad.active()) movePad.begin(t, true); }
    else if ((SETTINGS.aim === 'auto' || SETTINGS.aim === 'stick') && !aimPad.active()) {
      aimTap = { t: performance.now(), moved: false };
      aimPad.begin(t, true);
    }
  }
  e.preventDefault(); SFX.resume();
}, { passive: false });

/* 모바일 밀치기 — 오른쪽(조준 스틱 쪽)을 두 번 빠르게 톡톡 치면 밀친다. 버튼을 찾을 필요가 없다 */
let rightTapT = 0;
addEventListener('touchstart', e => {
  if (G.state !== 'play' || !SETTINGS.get('tapShove')) return;
  for (const t of e.changedTouches) {
    if (t.clientX < innerWidth * 0.5 || (t.target && t.target.closest && t.target.closest('.tbtn, .hud__btn, button'))) continue;
    const now = performance.now();
    if (now - rightTapT < 360) { G.player.melee(G); rightTapT = 0; }
    else rightTapT = now;
  }
}, { capture: true, passive: true });

/** 자동 조준의 표적 — 불빛을 받으면 깨는 '우는 것'은 일부러 비추지 않는다.
    가까운 순, 지금 보는 쪽이면 조금 더 우선. 벽 너머는 고르지 않는다 */
function autoAimTarget(g, wide) {
  const p = g.player, w = g.world, R = wide ? 460 : 380;
  let best = null, bs = Infinity;
  for (const z of g.zombies) {
    if (z.dead || (z.t.weeper && !z.rage)) continue;
    const dx = z.x - p.x, dy = z.y - p.y, d = Math.hypot(dx, dy);
    if (d > R || (!z.aggro && d > 220)) continue;
    const da = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - p.angle), Math.cos(Math.atan2(dy, dx) - p.angle)));
    const sc = d + da * 70 - (z.aggro ? 60 : 0);
    if (sc < bs && w.los(p.x, p.y, z.x, z.y)) { bs = sc; best = z; }
  }
  return best;
}
/** 자동 조준 — 표적이 있으면 그쪽으로, 없으면 걷는 쪽으로 손전등을 돌린다 (부드럽게, 초당 최대 9 rad) */
function autoFace(g, p, mx, my, dt) {
  g.aimT = (g.aimT || 0) - dt;
  if (g.aimT <= 0) { g.aimT = 0.1; g.aimTarget = autoAimTarget(g, false); }
  const z = g.aimTarget && !g.aimTarget.dead ? g.aimTarget : null;
  let want = null, rate = 9;
  if (z) want = Math.atan2(z.y - p.y, z.x - p.x);
  else if (Math.hypot(mx, my) > 0.2) { want = Math.atan2(my, mx); rate = 6; }
  if (want === null) return;
  const d = Math.atan2(Math.sin(want - p.angle), Math.cos(want - p.angle));
  p.angle += clamp(d, -rate * dt, rate * dt);
}
const autoAimOn = () => isTouch ? SETTINGS.aim === 'auto' : SETTINGS.deskAim === 'auto';

/** 원작에는 사격 버튼이 없다 — 자동 사격이 켜져 있으면 숨긴다. 드래그 조작이면 오른쪽 스틱도 숨긴다 */
function applyTouchLayout() {
  $('btnFire').classList.toggle('hidden', SETTINGS.autofire);
  $('padTurn').classList.toggle('hidden', SETTINGS.aim === 'drag');
  $('padTurn').classList.toggle('pad--aim', SETTINGS.aim === 'auto');
  $('padTurn').classList.toggle('pad--axis', SETTINGS.aim === 'turn');
  document.body.classList.toggle('nofire', SETTINGS.autofire);
}
SETTINGS.onChange(applyTouchLayout);
SETTINGS.onChange(k => { if (k === 'music') { const inGame = G.state === 'play' || G.state === 'pause' || G.state === 'arms' || G.state === 'map'; if (inGame) SFX.music(true); else SFX.menuMusic(SETTINGS.music); if (!SETTINGS.music) SFX.music(false); } });
applyTouchLayout();

/* drag — 원작 1.1 의 선택 조작: 화면 오른쪽 절반 어디든 좌우로 끌어 돈다 */
(() => {
  let id = null, lx = 0;
  view.addEventListener('touchstart', e => {
    if (SETTINGS.aim !== 'drag' || G.state !== 'play') return;
    for (const t of e.changedTouches) {
      if (id === null && t.clientX > innerWidth * 0.45) { id = t.identifier; lx = t.clientX; }
    }
    e.preventDefault(); SFX.resume();
  }, { passive: false });
  view.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) if (t.identifier === id) {
      input.dragTurn += (t.clientX - lx) * 0.0105; lx = t.clientX;
    }
    if (id !== null) e.preventDefault();
  }, { passive: false });
  const end = e => { for (const t of e.changedTouches) if (t.identifier === id) id = null; };
  view.addEventListener('touchend', end);
  view.addEventListener('touchcancel', end);
})();
$('btnFire').addEventListener('touchstart', e => { e.preventDefault(); input.firing = true; SFX.resume(); }, { passive: false });
$('btnFire').addEventListener('touchend', () => { input.firing = false; });
$('btnNade').addEventListener('touchstart', e => {
  e.preventDefault(); if (G.state === 'play') G.player.throwNade(G);
}, { passive: false });
$('btnSwap').addEventListener('touchstart', e => {
  e.preventDefault(); if (G.state === 'play') G.openArms();
}, { passive: false });
$('arms').addEventListener('click', e => {
  const b = e.target.closest('.arm');
  if (b && b.disabled) return;
  G.closeArms(b ? b.dataset.k : null);
});
$('btnMelee').addEventListener('touchstart', e => {
  e.preventDefault(); if (G.state === 'play') G.player.melee(G);
}, { passive: false });
$('btnReload').addEventListener('touchstart', e => {
  e.preventDefault(); if (G.state === 'play') G.player.reload(G);
}, { passive: false });
$('btnSprint').addEventListener('touchstart', e => {
  e.preventDefault();
  if (G.state !== 'play') return;
  if (!input.sprintLatch && G.player.winded) { SFX.dry(); return; }   // 숨이 찼으면 걸리지 않는다
  input.sprintLatch = !input.sprintLatch; input.idleT = 0;
  SFX.click();
}, { passive: false });
$('btnLight').addEventListener('touchstart', e => {
  e.preventDefault(); if (G.state === 'play') G.toggleLight();
}, { passive: false });

/* ═══════════ 임무 중 HUD 버튼 · 홈으로 · 시점 거리 · 버튼 배치 ═══════════ */
/* 오른쪽 위 일시정지 · 홈 — 터치에는 Esc 가 없어 멈출 길이 없었다. 홈은 게임을 멈춘 채로 한 번 묻는다 */
const Modal = {
  homeFrom: null,
  askHome() {
    if (G.state === 'map') G.toggleMap();
    if (G.state === 'arms') G.closeArms(null);
    if (G.state !== 'play' && G.state !== 'pause') return;
    this.homeFrom = G.state;
    G.state = 'pause'; input.firing = false;
    UI.hideScreens();
    $('homeAskNote').textContent = G.survival || G.challenge
      ? T('이번 판의 기록은 남지 않습니다.')
      : T('이번 임무의 진행은 저장되지 않습니다. 앞서 마친 장은 그대로 남습니다.');
    $('homeAsk').classList.remove('hidden');
  },
  homeAnswer(go) {
    $('homeAsk').classList.add('hidden');
    if (go) { G.state = 'title'; Radio.reset(); SFX.ambience(false); UI.enterMenu(); return; }
    if (this.homeFrom === 'play') { G.state = 'play'; UI.hideScreens(); } else UI.showPause();
  },
  /** 열린 모달을 닫는다(Esc · 게임패드 B) — 닫았으면 true */
  close() {
    if (!$('homeAsk').classList.contains('hidden')) { this.homeAnswer(false); return true; }
    if (SetLive.on && !$('scrSettings').classList.contains('hidden')) { $('scrSettings').querySelector('[data-act="setback"]').click(); return true; }
    if (!$('layoutEd').classList.contains('hidden')) { TLayout.close(); return true; }
    return false;
  }
};
$('btnHudHome').addEventListener('click', e => { e.stopPropagation(); SFX.click(); Modal.askHome(); });
$('btnHudPause').addEventListener('click', e => { e.stopPropagation(); SFX.click(); if (G.state === 'play') G.togglePause(); });

/* 설정 — 3D 판에서는 오른쪽(세로 화면은 아래쪽) 판으로 열리고, 나머지 자리에 실제 3D 화면이 그대로 보인다.
   시점 거리처럼 화면이 달라지는 설정을 끄는 대로 바로 확인한다. 게임 중(일시정지)이면 그 장면을, 타이틀에서 열면
   멈춘 미리 보기 판을 띄운다(기록 · 진행에 남지 않음). 카메라는 보이는 자리의 가운데에 인물이 오도록 비켜 준다 */
const SetLive = {
  on: false, preview: false,
  live: () => !!(window.R3D && window.R3D.ok && window.R3D.setFocus),
  open() {
    if (!this.live()) return;
    const scr = $('scrSettings');
    this.on = true;
    scr.classList.add('live');
    scr.dataset.preview = T('미리 보기');
    $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
    this.focus();
    if (G.state !== 'pause') {
      // 타이틀 — 판을 하나 띄운다. 무거운 준비(도시 · 덩어리)라 설정 판이 먼저 그려지도록 한 박자 뒤에
      scr.classList.add('loading');
      setTimeout(() => {
        if (!this.on || G.state === 'pause') return;
        this.preview = true;
        G.start('survival');
        G.state = 'pause';
        clearTimeout(G.cityCardT); $('cityCard').classList.remove('show');
        $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
        UI.show('scrSettings'); scr.classList.remove('loading');
        SFX.ambience(false); SFX.menuMusic(true);
      }, 60);
    }
  },
  /** 보이는 자리(설정 판 바깥)의 가운데 — 화면 비율 좌표 */
  focus() {
    if (!this.on) return;
    const port = innerHeight > innerWidth * 1.05;
    if (port) window.R3D.setFocus(0.5, (1 - 0.58) / 2);
    else { const pw = Math.min(440, innerWidth * 0.48) / innerWidth; window.R3D.setFocus((1 - pw) / 2, 0.5); }
  },
  close() {
    if (!this.on) return;
    this.on = false;
    $('scrSettings').classList.remove('live', 'loading');
    if (window.R3D && window.R3D.setFocus) window.R3D.setFocus(null);
    if (this.preview) {
      this.preview = false;
      G.state = 'title'; SFX.ambience(false);
      UI.settingsFrom = 'scrTitle';
    } else if (G.state === 'pause') { $('hud').classList.remove('hidden'); $('touch').classList.toggle('hidden', !isTouch); }
  }
};
window.addEventListener('resize', () => SetLive.focus());
if ($('setView')) $('setView').addEventListener('input', e => { SETTINGS.set('view3d', +e.target.value); $('setViewVal').textContent = e.target.value; });

/* 버튼 배치 — 터치 버튼을 끌어 옮긴다. 자리는 화면 비율 좌표(가운데 점)로 가로 · 세로 화면을 따로 기억하고,
   기억이 없는 버튼은 CSS 의 기본 자리에 둔다. 스틱은 엄지가 닿는 곳에 생기므로 옮길 것이 없다 */
const TLayout = {
  ids: ['btnSwap', 'btnMelee', 'btnReload', 'btnSprint', 'btnLight', 'btnNade', 'btnFire'],
  key: () => innerWidth >= innerHeight ? 'L' : 'P',
  load() { try { const o = JSON.parse(SETTINGS.get('tlayout') || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } },
  apply() {
    const m = this.load()[this.key()] || {};
    for (const id of this.ids) {
      const el = $(id), q = m[id];
      if (q && isFinite(q[0]) && isFinite(q[1])) {
        el.classList.add('tbtn--free');
        el.style.left = (clamp(q[0], 0, 1) * 100) + '%'; el.style.top = (clamp(q[1], 0, 1) * 100) + '%';
        el.style.right = el.style.bottom = 'auto';
      } else {
        el.classList.remove('tbtn--free');
        el.style.left = el.style.top = el.style.right = el.style.bottom = '';
      }
    }
  },
  open() {
    this.from = $('scrSettings').classList.contains('hidden') ? 'pause' : 'settings';
    this.touchWas = $('touch').classList.contains('hidden');
    UI.hideScreens();
    applyTouchLayout(); this.apply();
    $('touch').classList.remove('hidden');
    document.body.classList.add('tl-edit');
    $('layoutEd').classList.remove('hidden');
  },
  close() {
    document.body.classList.remove('tl-edit');
    $('layoutEd').classList.add('hidden');
    $('touch').classList.toggle('hidden', this.touchWas);
    if (this.from === 'settings') { UI.syncSettings(); UI.show('scrSettings'); } else UI.showPause();
  },
  reset() {
    const all = this.load(); delete all[this.key()];
    SETTINGS.set('tlayout', Object.keys(all).length ? JSON.stringify(all) : '');
    this.apply();
  }
};
(() => {
  let drag = null;
  $('touch').addEventListener('pointerdown', e => {
    if (!document.body.classList.contains('tl-edit')) return;
    const el = e.target.closest('.tbtn');
    if (!el) return;
    e.preventDefault(); e.stopPropagation();
    const r = el.getBoundingClientRect();
    drag = { el, id: e.pointerId, dx: e.clientX - (r.left + r.width / 2), dy: e.clientY - (r.top + r.height / 2), half: Math.max(r.width, r.height) / 2 };
    el.classList.add('dragging');
    try { el.setPointerCapture(e.pointerId); } catch (_) { /* 무시 */ }
  }, true);
  const move = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const W0 = innerWidth, H0 = innerHeight, m = Math.min(drag.half, 40);
    const x = clamp(e.clientX - drag.dx, m, W0 - m), y = clamp(e.clientY - drag.dy, m, H0 - m);
    const el = drag.el;
    el.classList.add('tbtn--free');
    el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.right = el.style.bottom = 'auto';
    drag.x = x / W0; drag.y = y / H0;
  };
  const up = e => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.el.classList.remove('dragging');
    if (drag.x !== undefined) {
      const all = TLayout.load(), k = TLayout.key();
      all[k] = Object.assign({}, all[k], { [drag.el.id]: [+drag.x.toFixed(4), +drag.y.toFixed(4)] });
      SETTINGS.set('tlayout', JSON.stringify(all));
    }
    drag = null; TLayout.apply();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
})();
SETTINGS.onChange(k => { if (k === 'tlayout' || k === null) TLayout.apply(); });
window.addEventListener('resize', () => TLayout.apply());
TLayout.apply();

/* ═══════════ 미션 변주 — 좀비 게임의 이름난 장면을 장마다 하나씩 ═══════════
   crescendo — 장치를 켜면 경보가 울리고, 다 될 때까지 몰려오는 무리를 버틴다(L4D 의 '크레센도 이벤트').
               끝나야 출구가 열린다 — 목표를 먼저 마쳐도 기다리고, 장치를 먼저 켜 두면 목표를 마치는 즉시 열린다
   gauntlet  — 경보가 울린 뒤 출구까지 쉼 없이 몰려오는 길을 뛴다(L4D2 '교구'의 다리 달리기)
   scavenge  — 흩어진 연료통을 하나씩 날라 탈것을 채워야 버티기가 시작된다(L4D2 '죽음의 중심가' 마지막)
   airdrop   — 섬광탄이 떨어진 자리에 보급이 내려온다. 60초 안에 열면 장비, 늦으면 놓친다(Dying Light). 선택 목표
   어느 것도 플레이어를 붙잡아 두지 않는다 — 혼자 하는 게임이라 도와줄 동료가 없다 */
/* ═══════════ 화성의 특전 무기 — 3 · 5 · 10 · 20분에 하나씩 열린다 ═══════════
   HUD 둘째 줄에 다음 무기와 남은 시간을 늘 보여 주고(기대감), 열리는 순간 큰 알림과 함께 손에 쥐어 준다 */
const Specials = {
  update(g) {
    const p = g.player;
    if (p.dead) return;
    for (const [k, t] of SPECIAL_UNLOCKS) {
      if (g.time < t || p.owned.has(k)) continue;
      const w = WEAPONS[k];
      p.owned.add(k); p.mag[k] = w.mag; p.equip(k);
      SFX.objective(); g.shake = Math.min(14, g.shake + 4);
      this.banner(T(w.name), SPECIAL_UNLOCKS.findIndex(q => q[0] === k) + 1);
      g.toast(T('특전 무기 — {w}', { w: T(w.name) }), 3);
    }
  },
  next(g) { return SPECIAL_UNLOCKS.find(([k]) => !g.player.owned.has(k)); },
  hud(g) {
    if (!g.survival || !g.world || g.world.theme.key !== 'mars') return '';
    const n = this.next(g), got = SPECIAL_UNLOCKS.filter(([k]) => g.player.owned.has(k)).length;
    if (!n) return T('특전 무기 4/4 — 전부 열렸다');
    const left = Math.max(0, Math.ceil(n[1] - g.time)), mm = (left / 60) | 0, ss = String(left % 60).padStart(2, '0');
    return T('특전 {n}/4 · 다음 {w} — {t}', { n: got, w: T(WEAPONS[n[0]].name), t: `${mm}:${ss}` });
  },
  banner(name, i) {
    let el = document.getElementById('unlockBanner');
    if (!el) { el = document.createElement('div'); el.id = 'unlockBanner'; el.className = 'unlock'; (document.getElementById('hud') || document.body).appendChild(el); }
    el.innerHTML = `<small>${T('특전 무기 {i}/4', { i })}</small><b>${name}</b>`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }
};

const Twist = {
  /** 출구까지 길의 f 지점(1 = 출발, 0 = 출구) 언저리의 트인 길 */
  routePoint(w, f, seed) {
    const rr = makeRng(seed);
    for (const tol of [0.05, 0.1, 0.2]) {
      const cand = w.reach.filter(i => Math.abs(w.toExit[i] / w.maxDist - f) < tol && w.roadNeighbours(i % w.w, (i / w.w) | 0) >= 5);
      if (cand.length) return w.tileCenter(cand[Math.floor(rr() * cand.length)]);
    }
    return { x: w.exit.x, y: w.exit.y };
  },
  setup(g) {
    const L = g.level, def = L.twist;
    g.tw = null; g.twObjs = [];
    if (!def || g.survival || g.challenge) return;
    const w = g.world, tw = Object.assign({ phase: 'idle' }, def);
    g.tw = tw;
    if (def.type === 'crescendo') {
      const q = this.routePoint(w, def.at ?? 0.3, L.seed ^ 0xc5e);
      tw.obj = { kind: 'panel', x: q.x, y: q.y, prog: 0, done: false, on: false };
      g.twObjs.push(tw.obj);
      if (L.objective.type === 'escape') { g.exitOpen = false; tw.waiting = '셔터가 열렸다 — 집결지로'; }
    } else if (def.type === 'scavenge') {
      tw.need = def.count || 3; tw.got = 0;
      tw.obj = { kind: 'tank', x: w.exit.x, y: w.exit.y, done: false };
      g.twObjs.push(tw.obj);
      const rr = makeRng(L.seed ^ 0xf0e1);
      for (let i = 0; i < tw.need; i++) {
        // 출구에서 멀리, 서로 떨어지게 — 날라 오는 길이 곧 싸움터다
        let best = null;
        for (let t = 0; t < 40; t++) {
          const q = w.pickPoint(w.exit.x, w.exit.y, 520, 1300, rr);
          if (g.pickups.some(k => k.type === 'fuel' && w.wrapDist(k.x, k.y, q.x, q.y) < 420) && t < 35) continue;
          best = q; break;
        }
        if (best) g.pickups.push(new Pickup(best.x, best.y, 'fuel'));
      }
    } else if (def.type === 'airdrop') {
      tw.at = def.at || 45;
    }
  },
  /** 출구를 열려는 순간 — 크레센도가 남았으면 기다리게 하고, 출구 달리기는 여기서 시작한다. true = 막았다 */
  blockExit(g, msg) {
    const tw = g.tw;
    if (!tw) return false;
    if (tw.type === 'crescendo' && !tw.obj.done) { tw.waiting = msg; g.toast(T(tw.blocked || '{name}을(를) 가동해야 길이 열린다', { name: T(tw.name) }), 3); return true; }
    if (tw.type === 'gauntlet' && tw.when === 'exit' && tw.phase === 'idle') this.startGauntlet(g);
    return false;
  },
  /** 마지막 버티기를 시작해도 되는가 — 연료를 다 채워야 */
  finaleReady(g) {
    const tw = g.tw;
    if (!tw || tw.type !== 'scavenge' || tw.got >= tw.need) return true;
    if (!tw.warned) { tw.warned = true; g.toast(T('{tank}에 연료가 없다 — 연료통 {n}개를 날라 와라', { tank: T(tw.tank || '배'), n: tw.need - tw.got }), 3.2); }
    return false;
  },
  startGauntlet(g) {
    const tw = g.tw;
    tw.phase = 'run'; tw.waveT = 1.5; tw.t = 0;
    SFX.alarm(200); g.shake = Math.min(14, g.shake + 6);
    g.toast(T(tw.msg || '경보 — 집결지까지 뛰어라'), 3);
    g.callHorde(g.hordeSize() + 2);
  },
  update(g, dt) {
    const tw = g.tw, p = g.player, w = g.world;
    if (!tw || p.dead) return;
    const D = g.dir;
    if (tw.type === 'crescendo') {
      const o = tw.obj;
      if (tw.phase === 'idle') {
        const near = Math.hypot(o.x - p.x, o.y - p.y) < 70;
        o.on = near;
        o.prog = near ? Math.min(1, o.prog + dt / 1.2) : Math.max(0, o.prog - dt * 2);
        if (o.prog >= 1) {
          g.makeCheckpoint(tw.name);
          tw.phase = 'run'; tw.left = tw.time || 25; tw.waveT = 0; tw.alarmT = 0; o.prog = 0;
          g.toast(T(tw.start || '{name} 가동 — 경보에 무리가 몰려온다. 버텨라', { name: T(tw.name) }), 3);
          for (const z of g.zombies) if (!z.t.weeper && Math.hypot(z.x - o.x, z.y - o.y) < 700) z.aggro = true;
        }
      } else if (tw.phase === 'run') {
        tw.left -= dt; o.prog = 1 - tw.left / (tw.time || 25);
        tw.alarmT -= dt;
        if (tw.alarmT <= 0) { tw.alarmT = 6; SFX.pan(o.x - p.x); SFX.alarm(Math.hypot(o.x - p.x, o.y - p.y)); SFX.pan(0); }
        tw.waveT -= dt;
        if (tw.waveT <= 0) tw.waveT = g.callHorde(g.hordeSize() + 1, o) ? (tw.every || 7) : 1;
        if (D && D.phase !== 'build') { D.phase = 'build'; D.t = 0; }                       // 경보가 울리는 동안은 숨 고르기 없음
        if (tw.left <= 0) {
          tw.phase = 'done'; o.done = true; o.prog = 1;
          SFX.objective(); g.stress(10);
          if (tw.waiting) { const m = tw.waiting; tw.waiting = null; g.openExit(T(m)); }
          else g.toast(T(tw.done || '{name} 완료 — 남은 목표를 마쳐라', { name: T(tw.name) }), 2.6);
          g.makeCheckpoint(tw.name);
        }
      }
    } else if (tw.type === 'gauntlet') {
      if (tw.phase === 'idle' && tw.when === 'half') {
        const d = w.toExit[w.idx(Math.floor(p.x / TILE), Math.floor(p.y / TILE))];
        if (d >= 0 && d <= w.maxDist * (tw.at || 0.5)) { g.makeCheckpoint('길의 절반'); this.startGauntlet(g); }
      } else if (tw.phase === 'run') {
        tw.t += dt; tw.waveT -= dt;
        if (D && D.phase !== 'build') { D.phase = 'build'; D.t = 0; }
        if (tw.waveT <= 0 && g.zombies.length < 56) {
          // 뒤쪽 · 옆에서 서넛씩 — 서 있으면 쌓이고, 달리면 빠져나갈 수 있다
          tw.waveT = 2.4;
          for (let i = 0; i < 3 + (Math.random() < 0.4 ? 1 : 0); i++) { const z = g.spawnZombie(380, 640); if (z) { z.aggro = true; z.horde = true; } }
        }
      }
    } else if (tw.type === 'scavenge') {
      const o = tw.obj;
      if (p.carry === 'fuel' && Math.hypot(o.x - p.x, o.y - p.y) < 120) {
        p.carry = null; tw.got++;
        SFX.objective(); g.stress(8);
        if (tw.got < tw.need) {
          g.toast(T('연료 {n}/{t} — 소리를 듣고 몰려온다', { n: tw.got, t: tw.need }), 2.4);
          g.callHorde(g.hordeSize(), o);
          g.makeCheckpoint('연료 {n}/{t}', { n: tw.got, t: tw.need });
        } else { o.done = true; tw.phase = 'done'; g.toast(T('{tank} 연료를 다 채웠다 — 이제 버텨라', { tank: T(tw.tank || '배') }), 2.6); }
      }
    } else if (tw.type === 'airdrop') {
      if (tw.phase === 'idle' && g.time >= tw.at) {
        const q = w.pickPoint(p.x, p.y, 380, 640);
        tw.obj = { kind: 'crate', x: q.x, y: q.y, fall: 1, done: false, lost: false };
        g.twObjs.push(tw.obj);
        tw.phase = 'fall'; tw.left = tw.window || 60;
        SFX.pan(q.x - p.x); SFX.horn(); SFX.pan(0);
        g.toast(T('보급 투하 — 붉은 섬광이 떨어진 곳(선택)'), 3);
      } else if (tw.phase === 'fall' || tw.phase === 'wait') {
        const o = tw.obj;
        o.fall = Math.max(0, o.fall - dt / 4);                                                  // 4초에 걸쳐 내려온다
        if (o.fall === 0) tw.phase = 'wait';
        tw.left -= dt;
        if (tw.phase === 'wait' && Math.hypot(o.x - p.x, o.y - p.y) < 46) {
          o.done = true; tw.phase = 'done';
          const loot = ['ammo', 'ammo', 'shells', 'rounds', 'rounds', 'nade', 'medkit', 'battery'];
          if (p.owned.has('crossbow')) loot.push('bolts');
          const drop = (g.level.drops || []).find(k => !p.owned.has(k));
          if (drop) loot.push('wpn_' + drop);
          for (const t of loot) { const q = w.pickPoint(o.x, o.y, 18, 70); g.pickups.push(new Pickup(q.x, q.y, t)); }
          SFX.objective(); g.toast(T('보급을 열었다 — 무리가 냄새를 맡았다'), 2.6);
          g.callHorde(g.hordeSize() + 1, o);
        } else if (tw.left <= 0) { o.lost = true; tw.phase = 'lost'; g.toast(T('보급을 놓쳤다 — 감염체가 먼저 닿았다')); }
      }
    }
  },
  /** HUD 둘째 줄 */
  hud(g) {
    const tw = g.tw;
    if (!tw) return '';
    if (tw.type === 'crescendo') {
      if (tw.phase === 'run') return T('{name} — {s}초 버텨라', { name: T(tw.name), s: Math.ceil(tw.left) });
      if (tw.phase === 'idle') return tw.obj.on ? T('{name} 가동 중…', { name: T(tw.name) }) : T('{name}을(를) 가동하라', { name: T(tw.name) });
    }
    if (tw.type === 'gauntlet' && tw.phase === 'run' && !g.exitOpen) return T(tw.msg || '경보 — 집결지까지 뛰어라');
    if (tw.type === 'gauntlet' && tw.phase === 'run') return T('경보 — 멈추지 말고 뛰어라');
    if (tw.type === 'scavenge' && tw.phase !== 'done') return T('연료 {n}/{t}', { n: tw.got, t: tw.need }) + (g.player.carry === 'fuel' ? ' — ' + T('{tank}(으)로', { tank: T(tw.tank || '배') }) : '');
    if (tw.type === 'airdrop' && (tw.phase === 'fall' || tw.phase === 'wait')) return T('보급 투하 {s}초 (선택)', { s: Math.max(0, Math.ceil(tw.left)) });
    return '';
  },
  /** 나침반이 가리킬 곳 — 지금 가장 급한 변주 목표 */
  target(g) {
    const tw = g.tw, p = g.player;
    if (!tw) return null;
    if (tw.type === 'crescendo' && tw.phase === 'idle' && (tw.waiting || g.level.objective.type === 'escape')) return tw.obj;
    if (tw.type === 'scavenge' && tw.phase !== 'done') {
      if (p.carry === 'fuel') return tw.obj;
      let best = null, bd = 1e9;
      for (const k of g.pickups) if (k.type === 'fuel' && !k.dead) { const d = Math.hypot(k.x - p.x, k.y - p.y); if (d < bd) { bd = d; best = k; } }
      return best;
    }
    if (tw.type === 'airdrop' && (tw.phase === 'fall' || tw.phase === 'wait')) return tw.obj;
    return null;
  },
  save(g) { const tw = g.tw; return tw ? { phase: tw.phase === 'run' ? 'idle' : tw.phase, got: tw.got || 0, done: !!(tw.obj && tw.obj.done) } : null; },
  restore(g, s) {
    const tw = g.tw;
    if (!tw || !s) return;
    if (tw.type === 'crescendo' && s.done) { tw.phase = 'done'; tw.obj.done = true; tw.obj.prog = 1; }
    if (tw.type === 'scavenge') {
      tw.got = s.got;
      let drop = s.got;                                     // 이미 넣은 만큼 연료통을 치운다(먼 것부터)
      for (const k of g.pickups) if (drop > 0 && k.type === 'fuel' && !k.dead) { k.dead = true; drop--; }
      if (tw.got >= tw.need) { tw.phase = 'done'; tw.obj.done = true; }
    }
    if (tw.type === 'airdrop' && s.phase !== 'idle') tw.phase = 'done';
    if (tw.type === 'gauntlet' && s.phase !== 'idle') this.startGauntlet(g);
  }
};

/* ═══════════ 도움말 ═══════════ */
/* 처음 마주치는 순간에 한 번만 뜨는 한 줄 설명. 본 것은 기억해 두고 다시 띄우지 않는다. */
const Hints = (() => {
  const KEY = 'aftermath.hints';
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { seen = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch (e) { /* 저장 불가여도 진행 */ } };

  // [키 표시, 설명]. 데스크톱과 터치가 다르면 그 자리에서 고른다.
  const TEXT = {
    move:     () => !isTouch ? SETTINGS.deskAim === 'auto' ? [['up', 'left', 'down', 'right'].map(a => KEYBIND.labelOf(a)).join(''), T('이동 · 손전등은 가까운 적과 걷는 쪽을 저절로 비춘다')] : [['up', 'left', 'down', 'right'].map(a => KEYBIND.labelOf(a)).join(''), T('이동 · 마우스로 손전등을 비춘다')]
      : SETTINGS.aim === 'auto' ? [T('왼쪽 화면'), T('아무 데나 눌러 끌면 걷는다 · 손전등은 가까운 적을 저절로 비춘다 · 오른쪽을 끌면 직접 비춘다')]
      : [T('왼쪽 스틱'), SETTINGS.aim === 'turn' ? T('이동 · 오른쪽 스틱을 좌우로 밀어 손전등을 돌린다')
        : SETTINGS.aim === 'drag' ? T('이동 · 오른쪽 화면을 좌우로 끌어 손전등을 돌린다')
        : T('이동 · 오른쪽 스틱으로 손전등을 비춘다')],
    autofire: () => SETTINGS.autofire
      ? (isTouch ? [T('자동 사격'), T('불빛에 들어온 적은 저절로 쏜다 — 손전등을 적에게 돌리자')]
                 : [T('클릭'), T('불빛 안에 들어온 적은 자동으로 쏜다. 직접 쏠 수도 있다')])
      : [isTouch ? T('사격') : T('클릭'), T('사격 — 손전등이 비추는 쪽으로만 나간다')],
    reload:   () => [isTouch ? T('장전') : KEYBIND.labelOf('reload'), T('재장전 — 탄창이 비면 자동으로도 갈아 끼운다')],
    melee:    () => [isTouch ? T('밀치기') : KEYBIND.labelOf('melee') + T(' · 우클릭'), T('붙잡히면 발이 묶인다 — 밀쳐내고 빠져나가라')],
    weeper:   () => [T('우는 것'), T('울음소리가 들리면 불빛을 돌리고 멀리 돌아가라 — 깨우면 끝까지 쫓아온다')],
    bloater:  () => [T('부푼 것'), T('가까이서 터지면 담즙을 뒤집어쓴다 — 멀리서 쏴라')],
    bile:     () => [T('담즙'), T('냄새를 맡고 무리가 몰려온다 — 등을 벽에 대고 수류탄을 준비하라')],
    horde:    () => [T('무리'), T('붉은 호가 가리키는 쪽에서 몰려온다 — 불빛을 그쪽으로 돌리거나 질주로 거리를 벌려라')],
    sprint:   () => isTouch ? [T('질주'), T('한 번 누르면 계속 달린다 · 발소리가 커서 멀리서도 깨운다')]
                            : [KEYBIND.labelOf('sprint'), T('질주 — 빠르지만 발소리가 커서 멀리서도 깨운다')],
    pickup:   () => ['', T('빛나는 물건은 밟으면 줍는다')],
    gundrop:  () => [T('무기'), T('쓰러뜨린 감염체가 총을 떨어뜨렸다 — 빛나는 총을 밟아 줍자')],
    battery:  () => [isTouch ? T('손전등') : KEYBIND.labelOf('light'), T('손전등을 꺼 두면 배터리가 다시 찬다 · 노란 상자는 한 번에 채운다')],
    nade:     () => [isTouch ? T('수류탄') : KEYBIND.labelOf('nade'), T('무리가 몰렸다 — 수류탄')],
    runner:   () => [T('달리는 것'), T('약하지만 빠르다. 멀리 있을 때 끊어 쏘자')],
    brute:    () => [T('거대한 것'), T('잘 밀리지 않는다. 수류탄을 아끼지 말 것')],
    crawler:  () => [T('기어다니는 것'), T('웅크렸다 튄다. 일정하게 다가오지 않는다')],
    spitter:  () => [T('뱉는 것'), T('거리를 두고 산을 뱉는다. 초록 웅덩이는 밟지 말 것')],
    behemoth: () => [T('그것'), T('붉은 선이 뜨면 옆으로 비켜라. 벽에 박으면 비틀거린다')],
    screamer: () => [T('비명 지르는 것'), T('숨을 들이켜는 소리가 들리면 먼저 쏴라 — 비명을 지르면 무리가 온다')],
    alarmcar: () => [T('경보기 차'), T('붉은 점이 깜빡이는 차는 경보기가 달렸다 — 쏘거나 부딪히면 울리고 무리가 온다')],
    leaper:   () => [T('덮치는 것'), T('웅크리면 곧 날아든다 — 옆으로 비키거나, 날아오는 순간 쏘면 떨어진다')],
    charger:  () => [T('들이받는 것'), T('땅을 긁으면 돌진한다 — 옆으로 비켜 벽에 박게 하라')],
    puller:   () => [T('휘감는 것'), T('기침 소리 뒤에 혀가 날아온다 — 옆으로 비키거나 그것을 쏴서 끊어라')],
    riot:     () => [T('진압 경찰'), T('앞에서는 총알을 막는다 — 밀쳐서 돌려세우거나 옆 · 뒤를 쏴라')],
    // 2부의 땅 — 처음 밟는 순간
    terr1:    () => [T('모래 더미'), T('발이 빠져 느려진다 — 감염체도 마찬가지')],
    terr2:    () => [T('얼음판'), T('멈추려 해도 미끄러진다 — 일찍 방향을 틀어라')],
    terr3:    () => [T('얕은 물'), T('모두가 느려진다 — 물가에서 싸우면 시간을 번다')],
    terr4:    () => [T('용암 균열'), T('밟고 있으면 데인다 — 감염체를 그 위로 끌어들여라')],
    terr5:    () => [T('진흙'), T('발이 빠져 느려진다 — 감염체도 마찬가지')],
    terr6:    () => [T('크레이터 바닥'), T('움푹한 바닥은 발이 무겁다 — 감염체도 마찬가지')],
    terr7:    () => [T('크레이터 둘레'), T('솟은 흙 테를 넘으면 느려진다 — 감염체도 마찬가지')]
  };
  // 지금 당장 알아야 하는 것은 줄 앞으로 끼워 넣는다
  const URGENT = new Set(['terr2', 'terr4', 'bile', 'weeper', 'horde', 'melee', 'reload', 'nade', 'runner', 'brute', 'crawler', 'spitter', 'behemoth', 'screamer', 'leaper', 'charger', 'puller', 'riot']);

  const queue = [];
  let cur = null, t = 0, gap = 0;

  function push(id) {
    if (!TEXT[id]) return;
    if (!SETTINGS.hints || seen[id] || cur === id || queue.includes(id)) return;
    if (URGENT.has(id)) queue.unshift(id); else queue.push(id);
    // 지금 알아야 하는 것은 느긋한 도움말을 끊고 바로 띄운다 (비명의 들이켜기는 1.6초뿐이다)
    if (URGENT.has(id) && cur && !URGENT.has(cur)) { hide(); gap = 0; }
  }
  function show(id) {
    if (!TEXT[id]) { cur = null; return; }                     // 문구가 없는 도움말은 건너뛴다(화성 크레이터에서 멈추던 오류)
    const [key, msg] = TEXT[id]();
    const el = $('hint'), k = el.querySelector('b');
    k.textContent = key; k.hidden = !key;
    el.querySelector('span').textContent = msg;
    el.classList.add('show');
    cur = id;
    t = id in { runner: 1, brute: 1, crawler: 1, spitter: 1, behemoth: 1, horde: 1, weeper: 1, bloater: 1, bile: 1, screamer: 1, leaper: 1, charger: 1, puller: 1, riot: 1 } ? 4.6 : 3.8;
    seen[id] = 1; save();
  }
  function hide() { $('hint').classList.remove('show'); cur = null; gap = 0.5; }

  return {
    /** 판을 시작할 때 — 대기열만 비우고, 본 기록은 유지한다 */
    begin() { queue.length = 0; if (cur) hide(); gap = 0; },
    /** 설정의 '처음부터 다시 보기' */
    reset() { seen = {}; save(); },
    get seenCount() { return Object.keys(seen).length; },
    has: id => !!seen[id],
    push,

    update(dt, g) {
      if (!SETTINGS.hints) { if (cur) hide(); queue.length = 0; return; }
      const p = g.player;
      if (p.dead) return;

      if (g.time > 0.6) push('move');
      if (g.time > 6) push('autofire');
      if (g.time > 24) push('sprint');
      const tr = g.world.terrAt ? g.world.terrAt(p.x, p.y) : 0;
      if (tr) push('terr' + tr);
      const w = p.weapon;
      if (!p.reloading && p.magOf(w) <= Math.ceil(w.mag * 0.34)) push('reload');
      if (p.battery < 30 && p.lightOn) push('battery');

      let close = 0, adjacent = false;
      for (const z of g.zombies) {
        if (z.dead) continue;
        const d = Math.hypot(z.x - p.x, z.y - p.y);
        if (d < z.r + p.r + 26) adjacent = true;
        if (z.aggro && d < 320) close++;
        if (z.lit > 0.5 && z.type !== 'walker' && !z.t.weeper) push(z.type);
        if (z.t.weeper && d < 560) push('weeper');
        if (z.screamPhase === 'wind') push('screamer');
        if (z.leapPhase === 'crouch' || z.tonguePhase === 'wind' || z.chargePhase === 'wind') push(z.type);
      }
      if (g.boss && !g.boss.dead && g.boss.aggro &&
          Math.hypot(g.boss.x - p.x, g.boss.y - p.y) < 700) push('behemoth');
      if (!seen.alarmcar && (g.frameNo || 0) % 20 === 0) for (const pr of g.world.props) if (pr.alarm && !pr.spent && Math.hypot(pr.x - p.x, pr.y - p.y) < 300) { push('alarmcar'); break; }
      if (adjacent) push('melee');
      if (g.hordeAt) push('horde');
      if (p.bile > 0) push('bile');
      if (close >= 4 && p.nades > 0) push('nade');
      for (const pk of g.pickups)
        if (Math.hypot(pk.x - p.x, pk.y - p.y) < 240) { push('pickup'); break; }

      if (cur) { t -= dt; if (t <= 0) hide(); }
      else if (gap > 0) gap -= dt;
      else if (queue.length) show(queue.shift());
    }
  };
})();

/* ═══════════ 무전 ═══════════
   이야기는 무전으로 들어온다 — 왼쪽 위 미션 줄 아래에 말하는 사람과 자막이 한 줄씩 뜬다.
   같은 열쇠(start · mid · done …)는 한 판에 한 번만. 길에서 주운 기록도 같은 자리에 잠깐 펼친다. */
const Radio = {
  q: [], cur: null, t: 0, fired: {},
  el() { return $('radio'); },
  reset() {
    this.q = []; this.cur = null; this.t = 0; this.fired = {};
    const el = this.el(); if (el) el.classList.remove('show');
  },
  /** 처음 불린 열쇠면 true */
  cue(key) {
    if (this.fired[key] || G.survival || G.levelIndex < 0) return false;
    this.fired[key] = true;
    const ch = STORY.chapters[G.levelIndex], lines = ch && ch.radio[key];
    if (lines) for (const l of lines) this.q.push({ spk: l[0], text: [l[1], l[2]] });
    return true;
  },
  /** 기록은 대사보다 앞에 끼운다 — 지금 보이는 대사는 짧게 끊는다 */
  showRecord(rec, fresh) {
    this.q.unshift({ rec, fresh, text: rec.text });
    if (this.cur && !this.cur.rec) this.t = Math.min(this.t, 0.4);
  },
  update(dt) {
    const el = this.el();
    if (!el) return;
    if (this.cur) {
      this.t -= dt;
      if (this.t > 0) return;
      this.cur = null; el.classList.remove('show');
      if (!this.q.length) SFX.radio(true);
      this.t = -0.35;                       // 다음 줄 전에 잠깐 비운다
      return;
    }
    if (this.t < 0) { this.t += dt; if (this.t < 0) return; }
    if (!this.q.length) return;
    const c = this.cur = this.q.shift();
    const text = LT(c.text);
    this.t = clamp(1.8 + text.length * (I18N.lang === 'en' ? 0.035 : 0.075), 3.2, 9);
    const who = el.querySelector('b'), say = el.querySelector('span');
    if (c.rec) {
      who.textContent = (c.fresh ? T('기록 발견') : T('기록')) + ' · ' + LT(c.rec.title);
      who.style.color = '#e8dcc0';
      el.classList.add('note');
      this.t += 1.5;
    } else {
      const sp = STORY.speakers[c.spk];
      who.textContent = LT(sp.name);
      who.style.color = sp.col;
      el.classList.remove('note');
      SFX.radio(false);
    }
    say.textContent = text;
    el.classList.add('show');
  }
};

/* 도전 과제 — 기기 안에만 남는다. 달성하면 오른쪽 위에 잠깐 띄운다 */
const Ach = {
  KEY: 'aftermath.ach', SKEY: 'aftermath.stats',
  got() { try { const o = JSON.parse(localStorage.getItem(this.KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } },
  has(id) { return !!this.got()[id]; },
  count() { return Object.keys(this.got()).filter(id => STORY.achievements.some(a => a.id === id)).length; },
  fresh: [],
  unlock(id) {
    const all = this.got();
    if (all[id]) return false;
    all[id] = Date.now();
    try { localStorage.setItem(this.KEY, JSON.stringify(all)); } catch (e) { return false; }
    const a = STORY.achievements.find(x => x.id === id);
    if (!a) return false;
    this.fresh.push(a);
    const el = $('achMark');
    if (el) {
      el.querySelector('span').textContent = LT(a.t);
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    }
    SFX.objective();
    return true;
  },
  stats() { try { const o = JSON.parse(localStorage.getItem(this.SKEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } },
  addKills(n) {
    const s = this.stats(); s.kills = (s.kills || 0) + n;
    try { localStorage.setItem(this.SKEY, JSON.stringify(s)); } catch (e) { /* 저장 불가 */ }
    if (s.kills >= 1000) this.unlock('k1000');
  },
  /** 한 판이 끝났을 때 */
  onFinish(g, won, grade) {
    this.addKills(g.kills);
    if (g.challenge) {
      const b = g.challengeBests();
      if (CHALLENGES.some(c => g.medalOf(c, b[c.id] | 0) >= 3)) this.unlock('gold1');
      if (CHALLENGES.every(c => g.medalOf(c, b[c.id] | 0) >= 3)) this.unlock('goldAll');
      return;
    }
    if (g.survival) {
      if (g.time >= 600) this.unlock('surv10');
      const b = g.cityBests();
      if (['seoul', 'tokyo', 'bangkok', 'singapore'].every(c => b[c] && b[c].t >= 180)) this.unlock('cities');
      if (Object.keys(SURVIVAL_CITIES).every(c => SURVIVAL_CITIES[c].bonus || (b[c] && b[c].t >= 180))) this.unlock('world');
      return;
    }
    if (!won) return;
    const i = g.levelIndex;
    const byCh = { 0: 'night1', 1: 'seoul', 2: 'tokyo', 3: 'bangkok', 4: 'dawn', 9: 'part2' };
    if (byCh[i]) this.unlock(byCh[i]);
    if (i === PART1_END && g.difficulty === 'hard') this.unlock('harddawn');
    if (grade === 'S') this.unlock('gradeS');
    if (g.player.dmgTaken <= 0) this.unlock('untouched');
    if (i === 0 && !g.nonPistol) this.unlock('pistol');
    if (i === 3 && !g.weeperWoke) this.unlock('hush');
    if ((i === PART1_END || i === LEVELS.length - 1) && !g.fromCheckpoint) this.unlock('clean');
  },
  onRecord() {
    const n = Records.all().length;
    if (n >= 10) this.unlock('rec10');
    if (n >= STORY.records.length) this.unlock('rec20');
  }
};

/* 기록 보관함 — 주운 기록의 id 목록 (기기 안에만) */
const Records = {
  KEY: 'aftermath.records',
  all() { try { const a = JSON.parse(localStorage.getItem(this.KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } },
  has(id) { return this.all().includes(id); },
  add(id) {
    const a = this.all();
    if (a.includes(id)) return false;
    a.push(id);
    try { localStorage.setItem(this.KEY, JSON.stringify(a)); } catch (e) { /* 저장 불가 */ }
    return true;
  },
  countFor(ch) { const a = this.all(); return STORY.records.filter(r => r.ch === ch && a.includes(r.id)).length; }
};
window.Hints = Hints;

/* ═══════════ 게임 ═══════════ */
/** 카메라 기울기 — 정수리(90°)가 아니라 60° 에서 내려다본다 */
const TILT = Math.sin(Math.PI / 3);              // 0.866 — 바닥의 세로 축소
const HSC = 480 * Math.cos(Math.PI / 3) / TILT;  // 높이 k=1 이 세계 y 로 얼마나 올라가는가 (≈277)
/** 화면에 보이는 세계의 세로 길이 */
const VH = () => H / TILT;
/** 세계 좌표 → 화면 좌표 (CSS px) */
function toScreen(cam, x, y) {
  if (R3) return R3.project(x, y);                     // 3D 판 — 원근 카메라로 투영
  return [x - cam.x, (y - cam.y) * TILT];
}
/** 3D 판(3d.html)의 그리개 — js/r3d.js 가 window.R3D 로 걸어 둔다. 없으면 2D 로 그린다 */
let R3 = null;
/** 세계 그리기용 변환을 건다 (DPR 포함) */
function worldTransform(c, cam, s = DPR) { c.setTransform(s, 0, 0, s * TILT, -cam.x * s, -cam.y * s * TILT); }
/** 입체 모형용 — 세로를 줄이지 않은 화면 공간(cam 만큼만 옮김). 모형이 y·sin60 − z·cos60 를 스스로 계산한다 */
function screenTransform(c, cam) { c.setTransform(DPR, 0, 0, DPR, -cam.x * DPR, -cam.y * DPR * TILT); }

const SPITTER_CAP = 2;
const SURVIVAL_UNLOCK = PART1_END + 1;
/** 도시 이름 카드에 쓰는 현지 표기 */
const CITY_LOCAL = { seoul: '서울 SEOUL', base: '대피 기지 EVAC BASE', tokyo: '東京 TOKYO', bangkok: 'กรุงเทพฯ BANGKOK', singapore: '新加坡 SINGAPORE',
  varanasi: 'वाराणसी VARANASI', cairo: 'القاهرة CAIRO', venice: 'VENEZIA', reykjavik: 'REYKJAVÍK', antarctic: 'ANTARCTICA', istanbul: 'İSTANBUL', rio: 'RIO DE JANEIRO', mars: 'MARS · 화성' };
const CITY_NAME = { seoul: '서울', tokyo: '도쿄', bangkok: '방콕', singapore: '싱가포르', base: '대피 기지',
  varanasi: '바라나시', cairo: '카이로', venice: '베네치아', reykjavik: '레이캬비크', antarctic: '남극 기지', istanbul: '이스탄불', rio: '리우데자네이루', mars: '화성' };
/** 처음 손전등이 벽이 아니라 갈 길을 비추도록 — 출구 쪽으로 몇 칸 따라간 곳과 트인 거리를 함께 본다 */
function openingAngle(w, p) {
  let tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
  for (let k = 0; k < 7 && w.toExit; k++) {
    let best = null, bd = w.toExit[w.idx(tx, ty)];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const d = w.toExit[w.idx(tx + dx, ty + dy)];
      if (d >= 0 && d < bd) { bd = d; best = [tx + dx, ty + dy]; }
    }
    if (!best) break;
    [tx, ty] = best;
  }
  const goal = Math.atan2((ty + 0.5) * TILE - p.y, (tx + 0.5) * TILE - p.x);
  let bestA = goal, bestS = -1e9;
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    const s = Math.min(480, w.ray(p.x, p.y, a, 480, true)) + 260 * Math.cos(a - goal);
    if (s > bestS) { bestS = s; bestA = a; }
  }
  return bestA;
}

/** 레벨 데이터 → 도시 생성 옵션 */
const cityOpts = L => ({ theme: L.city, river: !!L.river, landmarks: L.landmarks || [], goal: L.goal, approach: L.approach, terrain: L.terrain });

/* 무기 실루엣 (무기 고르기 화면) */
const ARM_ICON = {
  pistol:  '<svg viewBox="0 0 84 34"><path d="M24 9h34v7H40l-3 4h-4l2 10h-9l-3-12-3-2z"/></svg>',
  smg:     '<svg viewBox="0 0 84 34"><path d="M12 10h52v6h6v3H52l-2 4h-6l-2 8h-7l2-8h-6l-2 5h-6l1-6H18l-6-4z"/></svg>',
  shotgun: '<svg viewBox="0 0 84 34"><path d="M4 12h56v3h20v4H54l-2 3H30l-8 7H8l8-9H4z"/></svg>',
  rifle:   '<svg viewBox="0 0 84 34"><path d="M2 14h50v-3h10v3h20v3H54l-3 4H38l-2 9h-6l1-9H22l-12 6H2l6-7H2z"/></svg>',
  magnum:  '<svg viewBox="0 0 84 34"><path d="M20 9h40v6H44v5h-6l-2 3h-3l2 8h-9l-3-11-4-3zM40 14a4 4 0 1 0 0 .1z"/></svg>',
  auto:    '<svg viewBox="0 0 84 34"><path d="M4 11h58v4h18v4H56l-2 3h-6v7h-8v-7H30l-8 7H8l8-9H4zM44 19h6v6h-6z"/></svg>',
  lmg:     '<svg viewBox="0 0 84 34"><path d="M2 12h56v-2h8v2h16v3H58v4H46l-2 3h-4v8h-8v-8h-8l-10 6H4l6-7H2zM30 19h10v9H30z"/></svg>',
  crossbow:'<svg viewBox="0 0 84 34"><path d="M10 15h60v3H10zM52 4c6 4 6 22 0 26l-2-2c4-4 4-18 0-22zM20 18h12l-2 10h-6z"/><path d="M53 6L66 16 53 28" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  flamer:  '<svg viewBox="0 0 84 34"><path d="M6 12h46v6H38l-2 10h-8l2-10H6zM52 13h12l6-3v12l-6-3H52zM14 5h14v6H14z"/><path d="M72 16c4-3 8-2 10 0-2 2-6 4-10 0z"/></svg>',
  launcher:'<svg viewBox="0 0 84 34"><path d="M6 10h50v12H40l-2 8h-8l2-8H6zM56 9h20v14H56zM16 22h8v8h-8z"/></svg>',
  rail:    '<svg viewBox="0 0 84 34"><path d="M2 13h62v-4h14v4h4v6h-4v4H64v-4H50l-3 4H34l-2 8h-6l1-8H18l-10 5H2l5-7H2z"/><path d="M20 15h40v2H20z" fill="#7fe8ff"/></svg>',
  minigun: '<svg viewBox="0 0 84 34"><path d="M30 9h48v3H30zM30 14h48v3H30zM30 19h48v3H30zM10 8h22v16H10zM16 24h8v8h-8z"/></svg>'
};

const G = {
  deaths: {},                 // 챕터별 이번 세션 사망 수 — 쉬운 난이도 권유에 쓴다
  state: 'title',
  world: null, player: null, level: null, levelIndex: -1, survival: false,
  zombies: [], bullets: [], grenades: [], pickups: [], particles: [],
  spits: [], acids: [],
  decals: [], corpses: [], flashes: [],
  time: 0, shake: 0, kills: 0, score: 0, hurtSfxT: 0, beatT: 0,
  shots: 0, hits: 0, reloads: 0, hitMark: 0, hitKill: false,
  spawnT: 0, waveScale: 1,
  goalsLeft: 0, goalsTotal: 0, exitOpen: false, surviveLeft: 0, boss: null,
  lightning: 0, lightningT: 8 + Math.random() * 12,
  rain: [], puddles: [],
  toastT: 0,

  /* ── 진행도 저장 ── */
  /** 저장 배치 판 — 2 부터 4장(대피 기지)이 끼어들었다. 예전 저장의 4장 이후 진행 · 평가 · 체크포인트를 한 칸씩 민다 */
  migrateSaves() {
    try {
      let lay = +localStorage.getItem('aftermath.layout') || 1;
      const shift = (fp, fk) => {
        const pr = +(localStorage.getItem('aftermath.progress') || 0);
        if (fp(pr) !== pr) localStorage.setItem('aftermath.progress', fp(pr));
        const gr = JSON.parse(localStorage.getItem('aftermath.grades') || '{}'), out = {};
        for (const k in gr) out[fk(+k)] = gr[k];
        localStorage.setItem('aftermath.grades', JSON.stringify(out));
      };
      if (lay < 2) { shift(p => p > 3 ? p + 1 : p, k => k >= 3 ? k + 1 : k); lay = 2; }
      // 3 — 2부에 이스탄불(카이로 뒤) · 리우(레이캬비크 뒤)가 끼어들었다. 베네치아 이후를 민다
      if (lay < 3) { shift(p => p >= 10 ? p + 2 : p >= 8 ? p + 1 : p, k => k >= 9 ? k + 2 : k >= 7 ? k + 1 : k); lay = 3; }
      localStorage.setItem('aftermath.layout', String(lay));
    } catch (e) { /* 저장 불가 — 그대로 둔다 */ }
  },
  progress() { return +(localStorage.getItem('aftermath.progress') || 0); },
  // 서바이벌은 방콕(9장)까지 마치면 열린다
  survivalOpen() { return this.progress() >= SURVIVAL_UNLOCK || this.bestSurvival() > 0; },
  saveProgress(i) {
    if (i > this.progress()) localStorage.setItem('aftermath.progress', i);
  },
  bestSurvival() { return +(localStorage.getItem('aftermath.best') || 0); },
  /** 도전 기록 {id: 최고 점수} · 메달(0 없음, 1 동, 2 은, 3 금) */
  challengeBests() {
    try { const o = JSON.parse(localStorage.getItem('aftermath.chal') || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
  },
  medalOf(C, score) { return C.medals.filter(m => score >= m).length; },
  saveChallenge(C, score) {
    const all = this.challengeBests(), prev = all[C.id] | 0;
    const best = score > prev;
    if (best) { all[C.id] = score; try { localStorage.setItem('aftermath.chal', JSON.stringify(all)); } catch (e) { /* 저장 불가 */ } }
    return { best, prev, medal: this.medalOf(C, score), bestMedal: this.medalOf(C, Math.max(prev, score)) };
  },
  challengeOpen() { return this.progress() >= 2 || Object.keys(this.challengeBests()).length > 0; },
  /** 도시별 서바이벌 기록 {city: {t, kills}} */
  cityBests() {
    try { const o = JSON.parse(localStorage.getItem('aftermath.cityBest') || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
  },
  saveCityBest(city, t, kills) {
    const all = this.cityBests(), cur = all[city] || { t: 0, kills: 0 };
    if (t <= cur.t) return false;
    all[city] = { t, kills };
    try { localStorage.setItem('aftermath.cityBest', JSON.stringify(all)); } catch (e) { return false; }
    return true;
  },

  /** 챕터별 최고 평가 {index: 점수} */
  grades() {
    try {
      const o = JSON.parse(localStorage.getItem('aftermath.grades') || '{}');
      return o && typeof o === 'object' ? o : {};
    } catch (e) { return {}; }
  },
  saveGrade(i, value) {
    if (i < 0) return false;
    const all = this.grades();
    if ((all[i] | 0) >= value) return false;
    all[i] = value;
    try { localStorage.setItem('aftermath.grades', JSON.stringify(all)); } catch (e) { return false; }
    return true;
  },

  toast(msg, dur = 2.2) {
    const el = $('toast');
    el.textContent = T(msg); el.classList.add('show');
    this.toastT = dur;
  },

  /* ── 레벨 시작 ── */
  start(index, cp) {
    SFX.init(); SFX.resume();
    const C = typeof index === 'string' && index.startsWith('ch:') ? CHALLENGES.find(c => c.id === index.slice(3)) : null;
    this.challenge = C || null;
    this.survival = index === 'survival' || !!C;          // 도전은 서바이벌의 흐름(무한 소환 · 보급 · 이야기 없음)을 같이 쓴다
    this.levelIndex = this.survival ? -1 : index;
    const city = this.survivalCity || 'seoul';
    const L = C ? Object.assign({}, SURVIVAL, { drops: [] }, C, { objective: { type: 'endless' }, fixedKit: true })
      : this.survival
      ? Object.assign({}, SURVIVAL, { seed: (Math.random() * 1e9) | 0, city }, SURVIVAL_CITIES[city])
      : LEVELS[index];
    this.combo = 0; this.comboMax = 0; this.lastKillT = -9; this.chHordeT = C && C.rules && C.rules.hordeEvery ? 6 : 0;
    this.level = L;
    this.world = new World(L.seed, L.blocks, cityOpts(L));
    MODELS.military = !!this.world.theme.military;
    MODELS.region = this.world.theme.key;
    SFX.weather(this.world.theme.weather || 'rain');          // 기지의 감염체는 전투복 · 철모 차림이 많다
    Minimap.reset(this.world);

    const w = this.world;
    // 시작 무기는 난이도에 따라 — 체크포인트에서 이어 받을 때는 그때의 장비를 되살린다(아래)
    this.player = new Player(w.spawn.x, w.spawn.y, Object.assign({}, L, { own: startKit(L, this.difficulty || SETTINGS.difficulty) }));
    this.sinceGun = 0; this.lavaKills = 0;
    this.player.angle = openingAngle(w, this.player);
    this.lastHurt = null;
    this.hitDirs = [];
    this.zombies = []; this.bullets = []; this.grenades = []; this.pickups = [];
    this.spits = []; this.acids = [];
    this.particles = []; this.splashes = []; this.decals = []; this.corpses = []; this.flashes = [];
    this.time = 0; this.shake = 0; this.kills = 0; this.score = 0; this.spitGapT = 0; this.fromCheckpoint = false;
    this.nonPistol = false; this.weeperWoke = false; this.screams = 0;
    this.shots = 0; this.hits = 0; this.hitMark = 0;
    input.sprintLatch = false; input.idleT = 0; input.turnRate = 0; input.dragTurn = 0;
    Hints.begin(this);
    this.difficulty = SETTINGS.difficulty;   // 진입 시점의 난이도로 전적을 기록한다
    this.spawnT = 0; this.waveScale = 1; this.lightning = 0;
    this.nextBossT = 120;
    this.lightningT = 6 + Math.random() * 10;

    // 목표 설정
    const ob = L.objective;
    this.exitOpen = (ob.type === 'escape');
    this.boss = null;
    this.goalsTotal = this.goalsLeft = ob.count || 0;
    this.surviveLeft = ob.time || 0;

    // 보급품 배치
    const rng = makeRng(L.seed ^ 0x5bf03635);
    // 지도가 커진 만큼(이어 붙는 지도로 넓힌 3블록) 보급품도 늘린다 — 길 위의 밀도를 예전과 맞춘다
    const spread = Math.sqrt((L.blocks * L.blocks) / ((L.blocks - 3) * (L.blocks - 3)));
    const loot = n => Math.max(1, Math.round(n * SETTINGS.mod.loot * spread));
    const place = (type, n, minD) => {
      n = loot(n);
      for (let i = 0; i < n; i++) {
        const p = w.pickPoint(this.player.x, this.player.y, minD, 1e9, rng);
        this.pickups.push(new Pickup(p.x, p.y, type));
      }
    };
    place('ammo', L.supplies.ammo, 260);
    place('shells', L.supplies.shells, 300);
    place('rounds', L.supplies.rounds | 0, 320);
    place('medkit', L.supplies.medkit, 300);
    place('battery', L.supplies.battery, 260);
    place('nade', L.supplies.nade, 300);
    // 무기는 길에 놓지 않는다 — 쓰러뜨린 감염체가 떨어뜨린다(onKill · dropGun)
    if (ob.type === 'collect') place('goal', ob.count, 420);
    // 중계기 — 출구로 가는 길을 따라 고르게 (도로 거리 3/4 · 1/2 · 1/4 지점 근처의 트인 칸).
    // 흩어 놓으면 지도를 몇 바퀴씩 돌게 된다 — 길 위에 줄 세워 '지켜 내며 나아가는' 장이 되게 한다
    this.relays = []; this.relayOn = null;
    if (ob.type === 'signal') {
      const rr = makeRng(L.seed ^ 0x3e1a);
      for (let k = 0; k < ob.count; k++) {
        const f = 1 - (k + 1) / (ob.count + 1);
        const cand = w.reach.filter(i => {
          const d = w.toExit[i] / w.maxDist;
          return Math.abs(d - f) < 0.07 && w.roadNeighbours(i % w.w, (i / w.w) | 0) >= 5;
        });
        for (let t = 0; t < 60 && cand.length; t++) {
          const q = w.tileCenter(cand[Math.floor(rr() * cand.length)]);
          if (this.relays.some(r => w.wrapDist(r.x, r.y, q.x, q.y) < 520) && t < 50) continue;
          this.relays.push({ x: q.x, y: q.y, prog: 0, done: false, woke: false, beepT: 0 });
          break;
        }
      }
      this.goalsTotal = this.goalsLeft = this.relays.length;
    }
    this.holding = false; this.holdT = 0; this.bossCalled = false;
    Twist.setup(this);
    if (ob.type === 'finale') this.surviveLeft = ob.time;
    // 기록 — 이 장에 떨어진 종이 두 장. 이미 주운 것도 다시 놓인다 (보관함은 그대로)
    if (!this.survival) {
      const nr = makeRng(L.seed ^ 0x1ea7), got = [];
      for (const rec of STORY.records.filter(r => r.ch === index)) {
        let q = null;
        for (let k = 0; k < 40; k++) {
          q = w.pickPoint(this.player.x, this.player.y, 380, 1e9, nr);
          if (got.every(o => w.wrapDist(o.x, o.y, q.x, q.y) > 700)) break;
        }
        const pk = new Pickup(q.x, q.y, 'note'); pk.rec = rec;
        this.pickups.push(pk); got.push(q);
      }
    }
    Radio.reset();
    for (const id of ['cpMark', 'achMark']) { const el = $(id); if (el) el.classList.remove('show'); }

    // 초기 좀비
    const initial = Math.max(2, Math.round(L.spawn.initial * SETTINGS.mod.max));
    for (let i = 0; i < initial; i++) this.spawnZombie(560, 1600);
    // 우는 것 — 가는 길 중간쯤, 시작점에서 멀찍이
    this.gas = [];
    const nWeep = C ? (C.weepers | 0) : this.survival ? 2 : (L.weepers | 0);
    const wr = makeRng(L.seed ^ 0x77e1);
    for (let i = 0, tries = 0; i < nWeep && tries < 400; tries++) {
      const idx = w.reach[Math.floor(wr() * w.reach.length)], q = w.tileCenter(idx);
      const te = w.toExit[idx], tx = idx % w.w, ty = (idx / w.w) | 0;
      if (te < w.maxDist * 0.25 || te > w.maxDist * 0.75) continue;
      if (Math.hypot(q.x - this.player.x, q.y - this.player.y) < 700 || w.roadNeighbours(tx, ty) < 6) continue;
      if (this.zombies.some(z => z.t.weeper && Math.hypot(z.x - q.x, z.y - q.y) < 900)) continue;
      if (this.relays.some(r => w.wrapDist(r.x, r.y, q.x, q.y) < 650)) continue;   // 중계기 곁을 지키다 깨우는 일은 없게
      const z = new Zombie(q.x, q.y, 'weeper'); z.face = wr() * 6.28;
      this.zombies.push(z); i++;
    }
    this.flowT = 0; this.hordeAt = null; this.casings = []; this.kickX = 0; this.kickY = 0;
    this.freezeT = 0; this.lastStop = -9;
    w.updateFlow(this.player.x, this.player.y);
    this.directorReset();
    this.anchorT = 0;

    // 그것 — 탈출점 쪽에 자리잡는다. 길을 뚫으려면 지나야 한다
    if (ob.type === 'boss') {
      const e = w.exit, br = ZTYPES.behemoth.r;
      // pickPoint 는 범위를 못 맞추면 아무 도달 가능 타일이나 돌려준다.
      // 그대로 쓰면 보스가 지도 반대편에 떨어져 "다리를 막아선다"는 설계가 무너진다.
      const tryBand = (minD, maxD, tries) => {
        for (let i = 0; i < tries; i++) {
          const q = w.pickPoint(e.x, e.y, minD, maxD, rng);
          const d = Math.hypot(q.x - e.x, q.y - e.y);
          if (d < minD || d > maxD) continue;
          if (w.hits(q.x, q.y, br + 2)) continue;
          return q;
        }
        return null;
      };
      let spot = tryBand(140, 520, 220) || tryBand(90, 760, 220);
      if (!spot) {
        // 그래도 없으면 탈출점에서 가장 가까운, 몸이 들어가는 타일을 직접 고른다
        let bd = Infinity;
        for (const idx of w.reach) {
          const q = w.tileCenter(idx);
          const d = Math.hypot(q.x - e.x, q.y - e.y);
          if (d >= bd || w.hits(q.x, q.y, br + 2)) continue;
          bd = d; spot = q;
        }
      }
      if (!spot) spot = { x: e.x, y: e.y };
      this.boss = new Zombie(spot.x, spot.y, 'behemoth');
      this.zombies.push(this.boss);
    }

    // 오래된 핏자국 — 대피 검문소 둘레와 거리 곳곳 (트레일러: 막사 옆 바닥의 검붉은 얼룩)
    {
      const br = makeRng(L.seed ^ 0xb100d);
      const stain = (x, y, n, spread) => {
        for (let k = 0; k < n; k++) this.decals.push({ x: x + (br() - 0.5) * spread, y: y + (br() - 0.5) * spread * 0.7, r: 4 + br() * 9, a: 0.22 + br() * 0.2 });
        if (br() < 0.6) this.decals.push({ x, y, r: 22 + br() * 16, a: 0.45 + br() * 0.2, s: (br() * SPLATS) | 0, rot: br() * 6.283 });
      };
      for (const lm of w.landmarks) if (lm.kind === 'checkpoint')
        for (let i = 0; i < 5; i++) stain((lm.x + 1.5 + br() * (lm.w - 3)) * TILE, (lm.y + 2 + br() * (lm.h - 3)) * TILE, 6, 70);
      for (let i = 0; i < 22; i++) { const q = w.pickPoint(0, 0, 0, 1e9, br); stain(q.x, q.y, 5, 60); }
    }

    // 웅덩이 & 비
    this.puddles = [];
    for (let i = 0; i < 90; i++) {
      const p = w.pickPoint(0, 0, 0, 1e9, rng);
      this.puddles.push({ x: p.x + (rng() - 0.5) * 30, y: p.y + (rng() - 0.5) * 30,
        rx: 12 + rng() * 26, ry: 7 + rng() * 14 });
    }
    this.rain = [];
    for (let i = 0; i < 320; i++)
      this.rain.push({ x: Math.random() * (W + 400) - 200, y: Math.random() * H,
        v: 900 + Math.random() * 500, len: 12 + Math.random() * 16, a: 0.1 + Math.random() * 0.22 });

    if (C && C.rules && C.rules.boss) this.dropBoss(520, 900);
    this.checkpoint = cp && cp.level === index ? cp : null;
    if (this.checkpoint) this.applyCheckpoint(this.checkpoint);

    // 3D — 도시 · 덩어리 · 인물 · 첫 그림을 지금(브리핑 화면이 떠 있는 동안) 마쳐 둔다. 첫 프레임들이 멈칫거리지 않게
    if (window.R3D && window.R3D.ok && window.R3D.prime) window.R3D.prime(this);
    SFX.menuMusic(false);
    SFX.ambience(true);
    this.state = 'play';
    UI.enterPlay();
    // 도시 이름 카드 — 현지 글자와 함께 잠깐 떠올랐다 사라진다(전역 · 도전 모두)
    const cc = $('cityCard'), ck = this.world.theme.key;
    if (cc && CITY_LOCAL[ck]) {
      cc.querySelector('small').textContent = this.survival ? T('서바이벌') : this.challenge ? T('도전') : `CHAPTER ${this.levelIndex + 1}`;
      cc.querySelector('b').textContent = I18N.lang === 'en' ? CITY_LOCAL[ck].replace(/[가-힣·]+\s*/g, '').trim() : CITY_LOCAL[ck];
      cc.querySelector('span').textContent = this.survival || this.challenge ? T(CITY_NAME[ck] || '') : T(this.level.name);
      cc.classList.add('show'); clearTimeout(this.cityCardT); this.cityCardT = setTimeout(() => cc.classList.remove('show'), 3200);
    }
    this.refreshHud(true);
  },

  /* ── 체크포인트 ──────────────────────────────
     긴 장에서 한 번 죽었다고 처음부터 걷게 하지 않는다. 목표의 고비(상자 · 중계기 · 부두 · 길의 절반 …)마다
     지금 상태를 적어 두고, 사망 화면에서 그 자리부터 다시 할 수 있게 한다. 체력과 배터리는 조금 채워 준다. */
  makeCheckpoint(k, v) {
    if (this.survival || this.player.dead) return;
    const p = this.player;
    this.checkpoint = {
      level: this.levelIndex, label: { k, v: v || null },
      time: this.time, kills: this.kills, score: this.score, shots: this.shots, hits: this.hits,
      x: p.x, y: p.y, hp: p.hp, battery: p.battery, nades: p.nades, wpn: p.wpn,
      ammo: Object.assign({}, p.ammo), mag: Object.assign({}, p.mag), owned: [...p.owned],
      goals: this.pickups.filter(k => k.type === 'goal' && !k.dead).map(k => ({ x: k.x, y: k.y })), goalsLeft: this.goalsLeft,
      relays: (this.relays || []).map(r => ({ x: r.x, y: r.y, done: r.done })),
      bossHp: this.boss && !this.boss.dead ? this.boss.hp : null,
      fired: Object.assign({}, Radio.fired), notesFound: this.notesFound || 0,
      twist: Twist.save(this)
    };
    const el = $('cpMark');
    if (el) { el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
  },
  applyCheckpoint(cp) {
    const p = this.player, w = this.world;
    p.x = cp.x; p.y = cp.y;
    p.hp = Math.max(cp.hp, 60); p.battery = Math.max(cp.battery, 40); p.nades = Math.max(cp.nades, 1);
    p.ammo = Object.assign({}, cp.ammo); p.mag = Object.assign({}, cp.mag); p.owned = new Set(cp.owned);
    p.wpn = p.owned.has(cp.wpn) ? cp.wpn : 'pistol';
    Object.assign(this, { time: cp.time, kills: cp.kills, score: cp.score, shots: cp.shots, hits: cp.hits, notesFound: cp.notesFound });
    const ob = this.level.objective;
    if (ob.type === 'collect') {
      this.pickups = this.pickups.filter(k => k.type !== 'goal');
      for (const q of cp.goals) this.pickups.push(new Pickup(q.x, q.y, 'goal'));
      this.goalsLeft = cp.goalsLeft;
    }
    if (ob.type === 'signal') {
      this.relays = cp.relays.map(r => ({ x: r.x, y: r.y, done: r.done, prog: r.done ? 1 : 0, woke: r.done, beepT: 0 }));
      this.goalsLeft = this.relays.filter(r => !r.done).length;
    }
    if (ob.type === 'purge') this.goalsLeft = Math.max(0, this.goalsTotal - this.kills);
    if (this.boss && cp.bossHp != null) this.boss.hp = cp.bossHp;
    Twist.restore(this, cp.twist);
    p.carry = null;
    // 되살아난 자리 곁의 감염체는 치운다 — 들어서자마자 물리지 않게
    this.zombies = this.zombies.filter(z => z.t.boss || Math.hypot(z.x - p.x, z.y - p.y) > 520);
    Radio.fired = Object.assign({}, cp.fired, { start: true });
    this.fromCheckpoint = true;
    this.reanchor();
    w.updateFlow(p.x, p.y);
    p.angle = openingAngle(w, p);
  },
  /** 사망 화면의 '체크포인트부터' 버튼에 쓸 이름 */
  checkpointName() {
    const c = this.checkpoint;
    return c ? T(c.label.k, c.label.v ? Object.assign({}, c.label.v, c.label.v.item ? { item: T(c.label.v.item) } : {}) : undefined) : '';
  },

  /* ── 좀비 소환 ── */
  pickType() {
    const mix = this.level.mix;
    // 특수 감염체 상한 (L4D 처럼) — 뱉는 것은 동시에 둘까지. 넘으면 그 자리는 다른 종류로
    // 덮치는 것은 둘, 들이받는 것 · 휘감는 것은 하나까지 — 혼자 상대하는 게임이라 특수 감염체가 겹치지 않게
    const n = {};
    for (const z of this.zombies) if (!z.dead) n[z.type] = (n[z.type] || 0) + 1;
    const CAP = { spitter: SPITTER_CAP, screamer: 1, leaper: 2, charger: 1, puller: 1 };
    const capped = k => k in CAP && (n[k] || 0) >= CAP[k];
    let total = 0;
    for (const k in mix) if (ZTYPES[k] && !ZTYPES[k].special && !capped(k)) total += Math.max(0, mix[k]);
    if (total <= 0) return 'walker';
    let r = Math.random() * total, acc = 0;
    for (const k in mix) {
      if (!ZTYPES[k] || ZTYPES[k].special || capped(k)) continue;
      acc += Math.max(0, mix[k]);
      if (r <= acc) return k;
    }
    return 'walker';
  },
  spawnZombie(minD, maxD) {
    const p = this.world.pickPoint(this.player.x, this.player.y, minD, maxD);
    // 플레이어가 지금 보고 있는 곳에 갑자기 나타나지 않게
    const a = Math.atan2(p.y - this.player.y, p.x - this.player.x);
    let da = Math.abs(((a - this.player.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const d = Math.hypot(p.x - this.player.x, p.y - this.player.y);
    if (da < CONE_HALF + 0.05 && d < this.player.lightRange + 90) return null;
    const z = new Zombie(p.x, p.y, this.pickType());
    this.zombies.push(z);
    return z;
  },

  /* ── 연출가 ──────────────────────────────────
     Valve 가 GDC 2009 에서 공개한 Left 4 Dead 의 적응형 연출을 이 게임 크기에 맞춰 옮겼다.
     · 긴장도(intensity): 받은 피해에 비례해, 가까이서 적이 죽으면 거리에 반비례해 오른다.
       교전 중(300px 안에 추격자)에는 줄지 않고, 아니면 서서히 0 으로 내려간다.
     · build   — 위협을 채운다: 배회자 · 추적자 · 무리. 긴장도가 문턱(70)을 넘으면
     · sustain — 3‒5초 더 유지하고
     · fade    — 새 위협을 멈춘 채 지금 싸움이 자연스럽게 끝나기를 기다렸다가
     · relax   — 숨 고를 시간(16‒24초, 또는 충분히 전진할 때까지). 그리고 다시 build.
     · 무리는 무작위 간격으로, 75% 는 진행 경로의 뒤쪽에서. 오기 2초 전에 먼 비명이 먼저 들린다
       ("사건은 다가온다고 알릴 때 더 흥미롭다" — 같은 발표). */
  directorReset() {
    const ch = this.survival ? 3 : this.levelIndex;
    const ob = this.level.objective.type;
    this.dir = {
      phase: 'build', intensity: 0, t: 0,
      mobT: 15 - Math.min(3, ch * 0.4),               // 첫 무리까지
      stalkT: ch === 0 ? 16 : 8,                     // 첫 챕터는 혼자 걸을 시간을 조금 더 준다
      sinceMob: 0, horde: [], pending: null, count: 0, relaxFrom: null,
      every: (ob === 'survive' ? 22 : 32) - Math.min(8, ch * 1.1)
    };
  },
  /** 긴장도를 올린다 (피해 · 근접 처치 · 붙잡힘) */
  stress(v) { if (this.dir) this.dir.intensity = Math.min(100, this.dir.intensity + v); },
  hordeSize() {
    const ch = this.survival ? 2 + Math.floor(this.time / 40) : this.levelIndex;
    // 무리 크기는 직전 무리 직후엔 작고, 시간이 지날수록 최대치로 자란다 (연달은 무리의 균형)
    const grow = 0.55 + 0.45 * Math.min(1, (this.dir ? this.dir.sinceMob : 60) / 50);
    return Math.max(3, Math.round((4 + ch * 0.9) * grow * SETTINGS.mod.max * (this.level.objective.type === 'survive' ? 1.2 : 1)));
  },
  /** 무리가 올 자리: 75% 는 진행 경로의 뒤쪽(출구에서 더 먼 칸), 나머지는 시야 밖 아무 곳 */
  hordeSpot(fromX, fromY) {
    const p = this.player, w = this.world;
    const near = fromX !== undefined;
    const behindRoute = !near && Math.random() < 0.75;
    const pIdx = w.idx(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
    const myDist = w.toExit[pIdx];
    for (let i = 0; i < 60; i++) {
      const q = near ? w.pickPoint(fromX, fromY, 100, 520) : w.pickPoint(p.x, p.y, 480, 820);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      const qi = w.idx(Math.floor(q.x / TILE), Math.floor(q.y / TILE));
      if (d < (near ? 360 : 440) || !w.flow || w.flow[qi] <= 0) continue;
      const da = Math.abs(((Math.atan2(q.y - p.y, q.x - p.x) - p.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (da < 1.0 && w.los(p.x, p.y, q.x, q.y)) continue;            // 보고 있는 곳에서 솟아나지 않게
      // 지나온 길 = 출구에서 나보다 더 먼 칸
      if (behindRoute && i < 40 && myDist >= 0 && w.toExit[qi] < myDist + 3) continue;
      return q;
    }
    return null;
  },
  /** 무리를 예고한다 — 먼 비명이 먼저 들리고 2.2초 뒤 실제로 몰려온다 */
  callHorde(n, near) {
    const D = this.dir, p = this.player;
    if (!D || D.pending) return false;
    const spot = (near && this.hordeSpot(near.x, near.y)) || this.hordeSpot();
    if (!spot) return false;
    D.pending = { x: spot.x, y: spot.y, n, t: 2.2 };
    const a = Math.atan2(spot.y - p.y, spot.x - p.x);
    SFX.horde(Math.hypot(spot.x - p.x, spot.y - p.y) * 1.6, a);   // 아직 멀다
    this.hordeAt = { x: spot.x, y: spot.y, t: 4.2 };
    const side = Math.abs(((a - p.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > 2.2 ? T('뒤에서') : T('옆에서');
    this.toast(T('무리가 온다 — {side}', { side }));
    return true;
  },
  /** 예고했던 무리를 내보낸다 */
  releaseHorde() {
    const D = this.dir, q = D.pending, p = this.player, w = this.world;
    D.pending = null;
    const out = [];
    const room = 60 - this.zombies.length;
    for (let i = 0; i < Math.min(q.n, room); i++) {
      const s = i === 0 ? q : w.pickPoint(q.x, q.y, 0, 200);
      if (Math.hypot(s.x - p.x, s.y - p.y) < 360) continue;
      const z = new Zombie(s.x + (Math.random() - 0.5) * 20, s.y + (Math.random() - 0.5) * 20, this.pickType());
      if (z.t.boss) continue;
      z.aggro = true; z.horde = true;
      this.zombies.push(z); out.push(z);
    }
    if (!out.length) return;
    SFX.horde(Math.hypot(q.x - p.x, q.y - p.y), Math.atan2(q.y - p.y, q.x - p.x));
    if (Math.random() < 0.6 && this.lightningT > 2) {               // 번개가 무리를 드러낸다
      this.lightning = SETTINGS.flash ? 1 : 0.22; SFX.thunder();
      this.lightningT = 14 + Math.random() * 18;
    }
    D.horde.push(...out); D.count++; D.sinceMob = 0;
    if (this.hordeAt) this.hordeAt.t = Math.max(this.hordeAt.t, 2);
  },
  /** 비명 — 곁의 감염체를 깨우고 무리를 그 자리로 부른다 */
  onScream(z) {
    const p = this.player, d = Math.hypot(z.x - p.x, z.y - p.y);
    SFX.scream(d);
    this.shake = Math.min(14, this.shake + 6);
    this.stress(18);
    this.screams = (this.screams || 0) + 1;
    for (const o of this.zombies) if (!o.t.weeper && Math.hypot(o.x - z.x, o.y - z.y) < 720) o.aggro = true;
    const D = this.dir;
    if (D && D.pending) D.pending.n += 2;
    else this.callHorde(this.hordeSize(), { x: z.x, y: z.y });
    this.toast(T('비명 — 무리가 몰려온다'));
  },
  /** 늪 · 물 · 모래를 밟으면 눈에 보이게 — 물보라와 물결, 튀는 진흙, 모래 먼지. 감염체도 똑같이 느려지고 똑같이 튄다 */
  updateTerrFx(dt) {
    const w = this.world, p = this.player, R = this.ripples || (this.ripples = []);
    for (let i = R.length - 1; i >= 0; i--) if ((R[i].t += dt) >= R[i].max) R.splice(i, 1);
    if (this.beams) for (let i = this.beams.length - 1; i >= 0; i--) if ((this.beams[i].t += dt) >= this.beams[i].max) this.beams.splice(i, 1);
    if (this.shoves) for (let i = this.shoves.length - 1; i >= 0; i--) if ((this.shoves[i].t += dt) >= this.shoves[i].max) this.shoves.splice(i, 1);
    if (!w.terr) { p.terr = 0; return; }
    const fx = (e, moving, me) => {
      const tr = w.terrAt(e.x, e.y);
      e.terr = tr;
      if (tr !== 1 && tr !== 3 && tr !== 5 && tr !== 6 && tr !== 7) return;
      e.fxT = (e.fxT || 0) - dt;
      if (e.fxT > 0) return;
      const run = me ? p.sprinting : e.aggro;
      e.fxT = !moving ? (tr === 3 ? 0.7 : 9) : me ? (run ? 0.13 : 0.2) : 0.32;
      if (tr === 3) {                                                     // 물 — 발목에 이는 물결과 튀는 물방울
        if (R.length < 60) R.push({ x: e.x, y: e.y, t: 0, max: moving ? 0.9 : 1.4, r: (e.r || 12) * (moving ? 1.5 : 1.1) });
        if (!moving) return;
        for (let i = 0; i < (run ? 5 : 3); i++) {
          const a = Math.random() * 6.283, sp = 30 + Math.random() * 70;
          this.particles.push({ x: e.x, y: e.y, z: 4, vz: 90 + Math.random() * 110, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.6, max: 0.6, size: 1.2 + Math.random() * 1.2, col: '#cfe2ea', kind: 'drop' });
        }
      } else if (tr === 5) {                                              // 진흙 — 발에 붙었다 떨어지는 덩어리
        for (let i = 0; i < (run ? 4 : 2); i++) {
          const a = Math.random() * 6.283, sp = 20 + Math.random() * 50;
          this.particles.push({ x: e.x, y: e.y, z: 3, vz: 60 + Math.random() * 80, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.6, max: 0.6, size: 1.6 + Math.random() * 1.6, col: i % 2 ? '#3b2a1a' : '#5a4128', kind: 'drop' });
        }
      } else {                                                            // 모래 · 화성 흙 — 발밑에서 이는 먼지
        const red = tr >= 6;
        for (let i = 0; i < (red ? 3 : 2); i++) {
          const a = Math.random() * 6.283, sp = 10 + Math.random() * 30;
          this.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.9, max: 0.9, size: 5 + Math.random() * 4, col: red ? '#a0583a' : '#b49a6a', kind: 'smoke' });
        }
      }
    };
    fx(p, !p.dead && p.stride > 0.2, true);
    for (const z of this.zombies) {
      if (z.dead || Math.abs(z.x - p.x) > 700 || Math.abs(z.y - p.y) > 500) continue;
      const mv = z._fx !== undefined && Math.abs(z.x - z._fx) + Math.abs(z.y - z._fy) > 0.3;
      z._fx = z.x; z._fy = z.y;
      fx(z, mv, false);
    }
  },
  /** 레일건의 빛줄기 — 벽까지 곧게 뻗었다 사라진다 */
  beam(x, y, a, range) {
    const len = this.world.ray(x, y, a, range);
    (this.beams || (this.beams = [])).push({ x, y, x1: x + Math.cos(a) * len, y1: y + Math.sin(a) * len, t: 0, max: 0.35 });
    this.shake = Math.min(18, this.shake + 4);
  },
  /** 휘감는 것이 쓰러지면 매캐한 연기가 퍼진다 — 잠깐 앞이 흐리다 */
  smokeCloud(x, y) {
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * 6.283, sp = 20 + Math.random() * 70;
      this.particles.push({ x: x + Math.cos(a) * 10, y: y + Math.sin(a) * 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 2.4 + Math.random() * 1.6, max: 4,
        size: 14 + Math.random() * 12, col: i % 2 ? '#6a6658' : '#565248', kind: 'smoke' });
    }
    const d = Math.hypot(x - this.player.x, y - this.player.y);
    SFX.cough(d);
  },
  /** 부푼 것이 터졌다 — 녹색 가스가 남고, 가까웠으면 담즙을 뒤집어쓴다 */
  bloaterBurst(z) {
    const p = this.player, d = Math.hypot(z.x - p.x, z.y - p.y);
    this.gas.push({ x: z.x, y: z.y, t: 6, max: 6, r: 110 });
    SFX.burst(d);
    this.shake = Math.min(16, this.shake + 6);
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * 6.283, sp = 60 + Math.random() * 260;
      this.particles.push({ x: z.x, y: z.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.4 + Math.random() * 0.5, max: 0.9,
        size: 2 + Math.random() * 3, col: i % 3 ? '#7d9a3a' : '#b7c96a', kind: 'spark' });
    }
    if (d < 260) buzz(45);
    if (d < 140 && !p.dead) this.bileHit();
  },
  /** 담즙 — 9초 동안 시야가 흐려지고, 무리가 냄새를 맡고 몰려온다 */
  bileHit() {
    const p = this.player, D = this.dir;
    const fresh = !(p.bile > 0);
    p.bile = 9;
    SFX.splat();
    this.stress(30);
    if (!fresh) return;
    this.toast(T('담즙을 뒤집어썼다 — 무리가 몰려온다'));
    for (const z of this.zombies) if (!z.t.weeper && Math.hypot(z.x - p.x, z.y - p.y) < 700) z.aggro = true;
    if (D) {
      if (D.pending) D.pending.n += 3;
      else this.callHorde(this.hordeSize() + 3, { x: p.x, y: p.y });
    }
  },

  /** 경보기 달린 차 — 맞히면 울리고, 울리면 무리가 온다 (L4D 의 "이중 기대감") */
  triggerAlarm(pr) {
    if (!pr || !pr.alarm || pr.ringing || pr.spent) return;
    pr.ringing = 7; pr.spent = true;                             // 한 번 울리면 배터리가 다 닳는다
    SFX.pan(pr.x - this.player.x);
    SFX.alarm(Math.hypot(pr.x - this.player.x, pr.y - this.player.y));
    SFX.pan(0);
    this.toast(T('경보가 울린다 — 무리가 몰려온다'));
    // 숨 고르기 중이어도 경보는 무리를 부른다
    this.callHorde(this.hordeSize() + 2, pr);
  },
  hitProp(x, y) { this.triggerAlarm(this.world.propNear(x, y)); },
  alarmNear(x, y, r) {
    for (const pr of this.world.props) if (pr.alarm && Math.hypot(pr.x - x, pr.y - y) < r) this.triggerAlarm(pr);
  },
  updateDirector(dt) {
    const D = this.dir, p = this.player;
    if (!D || p.dead) return;
    D.t += dt; D.sinceMob += dt;
    if (D.horde.length > 30) D.horde = D.horde.filter(z => !z.dead);
    if (this.hordeAt) { this.hordeAt.t -= dt; if (this.hordeAt.t <= 0) this.hordeAt = null; }
    if (D.pending && (D.pending.t -= dt) <= 0) this.releaseHorde();
    for (const pr of this.world.props) if (pr.ringing) {
      pr.ringing -= dt;
      if (pr.ringing <= 0) pr.ringing = 0;
    }

    // 긴장도: 피해(Player.stress 누적) · 붙잡힘 → 올리고, 교전이 없으면 내린다
    if (p.stress) { this.stress(p.stress * 1.2); p.stress = 0; }
    if (p.grabbed) this.stress(p.grabbed * 9 * dt);
    let engaged = false;
    for (const z of this.zombies) if (z.aggro && Math.hypot(z.x - p.x, z.y - p.y) < 300) { engaged = true; break; }
    if (!engaged) D.intensity = Math.max(0, D.intensity - 7 * dt);
    D.engaged = engaged;

    // 그것과 싸우는 동안은 무리·추적자를 보내지 않는다 (L4D: 보스전은 적응형 연출의 바깥)
    const bossFight = this.boss && !this.boss.dead && this.boss.aggro && Math.hypot(this.boss.x - p.x, this.boss.y - p.y) < 900;
    D.bossFight = bossFight;
    if (D.phase === 'build' && !bossFight) {
      // 등 뒤의 추적자 — 조용한 시간에도 완전히 안전하지는 않다
      D.stalkT -= dt;
      if (D.stalkT <= 0 && this.zombies.length < 58) {
        D.stalkT = 7 + Math.random() * 6;
        const z = this.spawnZombie(430, 650);
        if (z) { z.aggro = true; z.stalker = true; }
      }
      D.mobT -= dt;
      if (D.mobT <= 0) {
        if (this.callHorde(this.hordeSize())) D.mobT = D.every * (0.8 + Math.random() * 0.5);
        else D.mobT = 2;
      }
      if (D.intensity >= 70) { D.phase = 'sustain'; D.t = 0; D.hold = 3 + Math.random() * 2; }
    } else if (D.phase === 'sustain') {
      if (D.t >= D.hold) { D.phase = 'fade'; D.t = 0; }
    } else if (D.phase === 'fade') {
      // 새 위협은 멈추고, 지금 싸움이 끝나 긴장이 내려올 때까지 기다린다
      // 오래 끌면(25초) 강제로 넘긴다 — 추격자가 끝없이 붙는 판에서 숨 고르기를 영영 못 주지 않도록
      if ((D.intensity < 35 && !engaged && !D.pending) || D.t > 25) {
        D.phase = 'relax'; D.t = 0; D.relaxFor = 16 + Math.random() * 8; D.relaxFrom = { x: p.x, y: p.y };
      }
    } else if (D.phase === 'relax') {
      const moved = Math.hypot(p.x - D.relaxFrom.x, p.y - D.relaxFrom.y);
      if (D.t >= D.relaxFor || moved > 1100) {
        D.phase = 'build'; D.t = 0;
        D.mobT = Math.max(D.mobT, 6 + Math.random() * 6);
        D.stalkT = 4 + Math.random() * 4;
      }
    }
  },
  /**
   * 지도는 가장자리 너머로 같은 도시가 이어 붙는다(원환). 그래서 모든 것을 플레이어에게 가장 가까운
   * 복사본 자리로 옮겨 둔다 — 반 지도(1400px 이상) 떨어진 것만 실제로 움직이므로 화면에서는 보이지 않는다.
   * 이렇게 해 두면 거리 · 그리기 · 충돌 계산은 평범한 좌표 그대로 쓸 수 있다.
   */
  reanchor() {
    const w = this.world, p = this.player, rx = p.x, ry = p.y;
    const fix = o => { const n = w.near(o.x, o.y, rx, ry); o.x = n.x; o.y = n.y; };
    for (const arr of [this.zombies, this.pickups, this.puddles, this.decals, this.corpses, this.casings, this.gas, this.acids, this.relays]) if (arr) arr.forEach(fix);
    w.props.forEach(fix); w.decor.forEach(fix); fix(w.exit);
    for (const sg of w.signs) {
      const n = w.near((sg.x + 0.5) * TILE, (sg.y + 0.5) * TILE, rx, ry);
      sg.x = Math.floor(n.x / TILE); sg.y = Math.floor(n.y / TILE);
    }
    for (const lm of w.landmarks) {                     // 랜드마크는 그릴 때 옮겨 그린다
      const cx = (lm.x + lm.w / 2) * TILE, cy = (lm.y + lm.h / 2) * TILE, n = w.near(cx, cy, rx, ry);
      lm.ox = n.x - cx; lm.oy = n.y - cy;
    }
  },

  /** 반동 — 카메라를 쏜 방향의 반대로 잠깐 민다 */
  recoil(ang, kick) {
    if (!SETTINGS.shake) return;
    this.kickX = (this.kickX || 0) - Math.cos(ang) * kick * 1.6;
    this.kickY = (this.kickY || 0) - Math.sin(ang) * kick * 1.6;
  },
  /** 탄피 — 튀어나가 굴러가다 멈추고, 판이 끝날 때까지 남는다 */
  ejectCasing(x, y, ang, key) {
    const side = ang + Math.PI / 2 + (Math.random() - 0.5) * 0.6, sp = 90 + Math.random() * 70;
    this.casings.push({ x: x + Math.cos(ang) * 8, y: y + Math.sin(ang) * 8,
      vx: Math.cos(side) * sp, vy: Math.sin(side) * sp, a: Math.random() * 6.28, spin: (Math.random() - 0.5) * 30,
      t: 0.5, shell: key === 'shotgun' });
    if (this.casings.length > 220) this.casings.shift();
  },
  /** 짧은 정지 — 처치의 무게. 연사로 화면이 끊기지 않게 간격을 둔다 */
  hitStop(s) {
    if (this.time - (this.lastStop || -9) < 0.14) return;
    this.lastStop = this.time;
    this.freezeT = Math.max(this.freezeT || 0, s);
  },

  /** 손전등 켜고 끄기 — F 키와 터치 버튼이 같이 쓴다 */
  toggleLight() {
    const p = this.player;
    p.lightOn = !p.lightOn;
    SFX.click();
    this.toast(p.lightOn ? T('손전등 ON') : T('손전등 OFF — 충전 중'));
    this.refreshHud();
  },

  /** 명중 확인 — 조준선에 짧은 X 표시와 확인음. 산탄이 한꺼번에 맞아도 소리는 한 번 */
  onHit(killed) {
    const fresh = this.hitMark < 0.06;
    if (killed) { this.hitMark = 0.24; this.hitKill = true; }
    else {
      if (fresh) this.hitKill = false;
      this.hitMark = Math.max(this.hitMark, 0.11);
    }
    if (killed || fresh) SFX.hitTick(killed);
  },

  /** 보스의 포효 — 주변에 새 개체를 떨어뜨린다 */
  summon(src, kind, n) {
    let placed = 0;
    // 좁은 골목에서 포효하면 자리가 잘 안 나온다 — 한 번씩만 시도하면 0마리가 된다
    for (let tries = 0; tries < 60 && placed < n; tries++) {
      const a = Math.random() * 6.283, r = 50 + Math.random() * 130;
      const x = src.x + Math.cos(a) * r, y = src.y + Math.sin(a) * r;
      if (this.world.hits(x, y, ZTYPES[kind].r + 2)) continue;
      const z = new Zombie(x, y, kind);
      z.aggro = true;
      this.zombies.push(z);
      placed++;
    }
    return placed;
  },

  /** 중계기: 곁(78px)에 머무는 동안 차오르고, 떠나면 천천히 식는다. 처음 켜는 순간 소리가 무리를 부른다 */
  updateRelays(dt, ob) {
    const p = this.player;
    let on = null;
    if (!p.dead) for (const r of this.relays) if (!r.done && Math.hypot(r.x - p.x, r.y - p.y) < 78) { on = r; break; }
    for (const r of this.relays) if (!r.done && r !== on) r.prog = Math.max(0, r.prog - dt * 0.04);
    this.relayOn = on;
    if (!on) return;
    if (!on.woke) {
      on.woke = true;
      this.toast(T('중계기 가동 — 켜질 때까지 곁을 지켜라'));
      for (const z of this.zombies) if (!z.t.weeper && Math.hypot(z.x - on.x, z.y - on.y) < 650) z.aggro = true;
      this.callHorde(this.hordeSize(), { x: on.x, y: on.y });
    }
    on.prog = Math.min(1, on.prog + dt / (ob.hold || 7));
    on.beepT -= dt;
    if (on.beepT <= 0) { on.beepT = 0.9 - on.prog * 0.55; SFX.relay(false); }
    if (on.prog < 1) return;
    on.done = true; this.relayOn = null;
    this.goalsLeft--; SFX.relay(true); this.stress(10);
    const n = this.goalsTotal - this.goalsLeft;
    if (this.goalsLeft > 0) { this.toast(T('중계기 {n}/{t} 가동', { n, t: this.goalsTotal })); Radio.cue(n === 1 ? 'mid' : 'mid2'); this.makeCheckpoint('중계기 {n}/{t}', { n, t: this.goalsTotal }); }
    else this.openExit(T('중계망 연결 — 집결지로 이동하라'));
  },
  /** 마지막 장: 부두에 닿으면 접안까지 버틴다. 중간에 그것이 온다. 다 버티면 현문이 열린다 */
  updateFinale(dt, ob) {
    const p = this.player, w = this.world;
    if (!this.holding) {
      if (p.dead || Math.hypot(p.x - w.exit.x, p.y - w.exit.y) > 340) return;
      if (!Twist.finaleReady(this)) return;
      this.holding = true; this.holdT = 0;
      this.toast(T(ob.holdMsg || '배가 들어온다 — {s}초 버텨라', { s: ob.time }));
      this.makeCheckpoint(ob.place || '3번 부두');
      SFX.horn(); Radio.cue('hold');
      this.callHorde(this.hordeSize() + 2);
      if (this.dir) { this.dir.every = 20; this.dir.mobT = Math.min(this.dir.mobT, 10); }
      // 갑판에서 보급품을 던져 준다 — 버틸 거리
      for (const type of ['ammo', 'ammo', 'shells', 'rounds', 'medkit', 'nade']) {
        const q = w.pickPoint(w.exit.x, w.exit.y, 90, 260);
        this.pickups.push(new Pickup(q.x, q.y, type));
      }
      return;
    }
    this.holdT += dt;
    this.surviveLeft = Math.max(0, this.surviveLeft - dt);
    // 버티는 동안의 숨 고르기는 짧게 — 끝까지 몰려온다
    if (this.dir && this.dir.phase === 'relax' && this.dir.t > 7) { this.dir.phase = 'build'; this.dir.t = 0; }
    if (!this.bossCalled && this.holdT >= ob.bossAt) {
      if (this.dropBoss(560, 1000)) { this.bossCalled = true; this.toast(T('무언가 큰 것이 온다')); Radio.cue('boss'); }
      else this.holdT -= 2;
    }
    if (this.surviveLeft <= 0) { SFX.horn(); this.openExit(T(ob.open || '현문이 내려왔다 — 배에 올라라')); }
  },
  /** 무전이 끼어들 때 — 목표가 반쯤 됐을 때('mid'), 탈출로 가까이('done') 등 */
  storyCues(ob) {
    if (this.survival || this.player.dead) return;
    if (this.time > 1.2) Radio.cue('start');
    const w = this.world, p = this.player;
    if (ob.type === 'escape') {
      const d = w.toExit[w.idx(Math.floor(p.x / TILE), Math.floor(p.y / TILE))];
      if (d >= 0 && d <= w.maxDist * 0.5 && Radio.cue('mid')) this.makeCheckpoint('길의 절반');
      if (d >= 0 && d <= w.maxDist * 0.16) Radio.cue('done');
    } else if (ob.type === 'collect') {
      if (this.goalsLeft <= Math.floor(this.goalsTotal / 2)) Radio.cue('mid');
    } else if (ob.type === 'survive') {
      if (this.surviveLeft <= ob.time / 2) Radio.cue('mid');
    } else if (ob.type === 'purge') {
      if (this.kills >= this.goalsTotal / 2 && Radio.cue('mid')) this.makeCheckpoint('소탕 {n}/{t}', { n: this.kills, t: this.goalsTotal });
    } else if (ob.type === 'boss') {
      if (this.boss && !this.boss.dead && this.boss.hp < this.boss.hpMax * 0.5 && Radio.cue('mid')) this.makeCheckpoint('그것의 체력 절반');
    }
  },

  onKill(z) {
    this.kills++;
    if (!(this.challenge && this.challenge.rules && this.challenge.rules.pistolOnly)) this.dropGun(z);
    // 가까이서 쓰러질수록 긴장도가 오른다 (L4D: 거리에 반비례). 처치에는 짧은 정지
    const d = Math.hypot(z.x - this.player.x, z.y - this.player.y);
    this.stress(Math.max(0, 14 * (1 - d / 360)));
    this.hitStop(z.t.boss ? 0.16 : d < 120 ? 0.055 : 0.035);
    if (this.challenge) {
      // 도전: 2.5초 안에 이어 쓰러뜨리면 배수가 오른다 (×1 → ×3)
      this.combo = this.time - this.lastKillT <= 2.5 ? this.combo + 1 : 1;
      this.lastKillT = this.time;
      this.comboMax = Math.max(this.comboMax, this.combo);
      this.score += Math.round(z.t.score * SETTINGS.mod.score * this.comboMul());
      if (z.t.boss) {
        const bonus = Math.max(0, Math.round(3000 - this.time * 15));
        this.score += bonus;
        this.toast(T('그것을 쓰러뜨렸다 — 시간 보너스 {n}', { n: bonus }));
        this.finishT = 1.2;
      }
    } else this.score += Math.round(z.t.score * SETTINGS.mod.score);
    if (z.t.boss) {
      this.boss = null;
      this.shake = Math.min(26, this.shake + 20);
      SFX.explode();
      if (this.level.objective.type === 'endless') { if (!this.challenge) this.toast(T('그것을 쓰러뜨렸다')); }
      else if (this.level.objective.type === 'boss' && !this.exitOpen) this.openExit(T('그것이 쓰러졌다 — 다리가 열렸다'));
      else this.toast(T('그것을 쓰러뜨렸다'));
    }
    if (this.level.objective.type === 'purge' && !this.exitOpen) {
      this.goalsLeft = Math.max(0, this.goalsTotal - this.kills);
      if (this.goalsLeft === 0) this.openExit(T('소탕 완료 — 집결지가 표시되었다'));
    }
  },
  comboMul() { return 1 + Math.min(Math.max(0, this.combo - 1), 8) * 0.25; },
  /** 쓰러진 감염체가 총을 떨어뜨린다 — 그 장의 drops 중 아직 없는 총을 먼저.
      큰 것 · 특수 감염체는 자주, 보통은 드물게. 오래 안 나오면(14기) 반드시 하나 */
  dropGun(z) {
    const pool = this.level.drops || [];
    if (!pool.length || this.player.dead) return;
    const p = this.player;
    const lying = new Set(this.pickups.filter(k => !k.dead && k.type.startsWith('wpn_')).map(k => k.type.slice(4)));
    const fresh = pool.filter(k => !p.owned.has(k) && !lying.has(k));
    this.sinceGun = (this.sinceGun || 0) + 1;
    const t = z.t, big = t.boss || t.size >= 18 || t.special || t.bloat || t.scream || t.spit;
    let chance = t.boss ? 1 : big ? 0.3 : 0.055;
    chance *= this.difficulty === 'easy' ? 1.5 : this.difficulty === 'hard' ? 0.7 : 1;
    if (!fresh.length) chance *= 0.35;                               // 다 가졌으면 탄약 삼아 가끔만
    const pity = fresh.length && this.sinceGun >= 14;
    if (!pity && Math.random() > chance) return;
    const k = fresh.length ? fresh[(Math.random() * fresh.length) | 0] : pool[(Math.random() * pool.length) | 0];
    if (lying.has(k)) return;
    const pk = new Pickup(z.x, z.y, 'wpn_' + k);
    this.pickups.push(pk);
    this.sinceGun = 0;
    if (fresh.includes(k)) { this.toast(T('{name}을(를) 떨어뜨렸다', { name: T(WEAPONS[k].name) })); Hints.push && Hints.push('gundrop'); }
  },
  onGoalItem() {
    this.goalsLeft--;
    SFX.objective();
    if (this.goalsLeft > 0) {
      this.toast(T('{item} 확보 — {n}개 남음', { item: T(this.level.objective.item || '보급 상자'), n: this.goalsLeft }));
      this.makeCheckpoint('{item} {n}/{t}', { item: this.level.objective.item || '보급 상자', n: this.goalsTotal - this.goalsLeft, t: this.goalsTotal });
    }
    else this.openExit(T('전부 확보했다 — 집결지로 이동하라'));
  },
  openExit(msg) {
    if (Twist.blockExit(this, msg)) return;
    this.exitOpen = true;
    this.toast(msg);
    SFX.objective();
    Radio.cue('done');
  },
  /** 길에 떨어진 기록을 주웠다 — 보관함에 남기고 무전 자리에 내용을 띄운다 */
  onRecord(pk) {
    const fresh = Records.add(pk.rec.id);
    Ach.onRecord();
    this.notesFound = (this.notesFound || 0) + 1;
    Radio.showRecord(pk.rec, fresh);
  },
  /** 그것을 플레이어에게서 min‒max 떨어진 곳에 내려보낸다 (서바이벌 · 마지막 장) */
  dropBoss(minD, maxD) {
    const p = this.player, br = ZTYPES.behemoth.r;
    for (let i = 0; i < 120; i++) {
      const q = this.world.pickPoint(p.x, p.y, minD, maxD);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < minD * 0.85 || this.world.hits(q.x, q.y, br + 2)) continue;
      this.boss = new Zombie(q.x, q.y, 'behemoth');
      this.boss.aggro = true;
      this.zombies.push(this.boss);
      SFX.roar(0);
      return true;
    }
    return false;
  },

  /** 쓰러진 자리의 큰 핏자국 — 맞은 방향으로 튄 모양. 자국이 가득 차면 가장 오래된 것부터 지운다 */
  splat(x, y, ang, size) {
    if (this.world.solid(x, y)) return;
    if (this.decals.length >= 420) this.decals.shift();
    this.decals.push({ x: x + Math.cos(ang) * 6, y: y + Math.sin(ang) * 6, r: 15 + size * 0.9 + Math.random() * 8,
                       a: 0.7 + Math.random() * 0.2, s: (Math.random() * SPLATS) | 0, rot: ang });
  },
  /** 폭발 자국 — 그을음 */
  scorch(x, y) {
    if (this.decals.length >= 420) this.decals.shift();
    this.decals.push({ x, y, r: 52, a: 0.6, s: -1, rot: Math.random() * 6.283 });
  },
  spawnBlood(x, y, ang, n) {
    // 맞은 자리의 붉은 안개 — 원작에서 총에 맞을 때마다 피어오르던 것
    for (let i = 0; i < 2; i++) {
      const a = ang + (Math.random() - 0.5) * 0.9, sp = 30 + Math.random() * 60;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.32 + Math.random() * 0.2, max: 0.5,
        size: 6 + Math.random() * 5, col: '#9a1a12', kind: 'mist' });
    }
    for (let i = 0; i < n; i++) {
      const a = ang + (Math.random() - 0.5) * 2.2, sp = 40 + Math.random() * 210;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.25 + Math.random() * 0.35, max: 0.6, size: 1.4 + Math.random() * 2.6,
        col: '#7d1410', kind: 'blood' });
    }
  },
  spawnSparks(x, y, ang) {
    for (let i = 0; i < 6; i++) {
      const a = ang + Math.PI + (Math.random() - 0.5) * 1.8, sp = 60 + Math.random() * 220;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.1 + Math.random() * 0.18, max: 0.28, size: 0.8 + Math.random() * 1.4,
        col: '#ffd88a', kind: 'spark' });
    }
  },

  /** 원작처럼 무기 고르는 동안은 시간이 멈춘다 */
  openArms() {
    if (this.state !== 'play' || this.player.dead) return;
    this.state = 'arms';
    input.firing = false;
    const p = this.player;
    // 화성에서는 특전 무기 넷도 늘 칸에 보인다 — 아직이면 열리기까지 남은 시간을 적어 기대하게 한다
    const ub = document.getElementById('unlockBanner'); if (ub) ub.classList.remove('show');   // 해금 알림이 무기 창 위에 겹치지 않게
    const mars = this.survival && this.world.theme.key === 'mars';
    $('armsRow').innerHTML = SLOT_ORDER.filter(k => !WEAPONS[k].special || p.owned.has(k) || mars).map(k => {
      const w = WEAPONS[k], own = p.owned.has(k);
      const mag = p.magOf(w), res = p.reserveOf(w);
      const empty = own && w.ammoKey && mag + res <= 0;
      const un = !own && w.special ? SPECIAL_UNLOCKS.find(q => q[0] === k) : null;
      const left = un ? Math.max(0, Math.ceil(un[1] - this.time)) : 0;
      const ammo = un ? `🔒 ${(left / 60) | 0}:${String(left % 60).padStart(2, '0')}` : !own ? T('없음') : w.ammoKey ? `${mag} / ${res}` : `${mag} / ∞`;
      return `<button class="arm${k === p.wpn ? ' on' : ''}${empty ? ' empty' : ''}${w.special ? ' arm--special' : ''}${un ? ' locked' : ''}" data-k="${k}"${own ? '' : ' disabled'}>
        ${ARM_ICON[k]}<b>${T(w.name)}</b><span>${ammo}</span>${isTouch ? '' : `<kbd>${KEYBIND.labelOf('w' + w.slot)}</kbd>`}</button>`;
    }).join('');
    $('armsNote').textContent = isTouch ? T('무기를 누르면 바로 이어집니다') : T('무기 키 또는 클릭 · {k} 로 닫기', { k: KEYBIND.labelOf('arms') });
    $('arms').classList.remove('hidden');
    SFX.click();
  },
  closeArms(key) {
    if (this.state !== 'arms') return;
    $('arms').classList.add('hidden');
    this.state = 'play';
    if (key) this.player.select(key, this);
  },

  /** 전체 지도 (원작 1.1) — 보는 동안 시간이 멈춘다 */
  toggleMap() {
    if (this.state === 'map') { $('bigmap').classList.add('hidden'); this.state = 'play'; return; }
    if (this.state !== 'play' || this.player.dead) return;
    this.state = 'map';
    input.firing = false;
    drawBigMap(this);
    $('bigMapNote').textContent = isTouch ? T('화면을 누르면 닫힙니다') : T('{k} 또는 Esc 로 닫기', { k: KEYBIND.labelOf('map') });
    $('bigmap').classList.remove('hidden');
    SFX.click();
  },

  /** 어디서 맞았는가 — 화면 가장자리 쪽 붉은 호로 0.9초 보여 준다 (같은 쪽이면 갱신) */
  hitFrom(x, y, kind) {
    buzz(28);
    if (kind) this.lastHurt = kind;
    const p = this.player, a = Math.atan2(y - p.y, x - p.x);
    if (!this.hitDirs) this.hitDirs = [];
    for (const h of this.hitDirs) if (Math.abs(Math.atan2(Math.sin(h.a - a), Math.cos(h.a - a))) < 0.45) { h.a = a; h.t = 0.9; return; }
    if (this.hitDirs.length < 6) this.hitDirs.push({ a, t: 0.9 });
  },
  togglePause() {
    if (this.state === 'play') { this.state = 'pause'; UI.showPause(); }
    else if (this.state === 'pause') { this.state = 'play'; UI.hideScreens(); }
  },

  finish(won) {
    this.state = 'result';
    Radio.reset();
    SFX.ambience(false);
    if (won) {
      SFX.win();
      if (!this.survival) this.saveProgress(this.levelIndex + 1);
    }
    if (this.challenge) this.chResult = this.saveChallenge(this.challenge, this.score);
    else if (this.survival) {
      const t = Math.floor(this.time);
      if (t > this.bestSurvival()) localStorage.setItem('aftermath.best', t);
      this.cityBest = this.saveCityBest(this.level.city, t, this.kills);
    }
    UI.showResult(won);
  },

  /* ── 업데이트 ── */
  update(dt) {
    this.time += dt;
    this.hurtSfxT = Math.max(0, this.hurtSfxT - dt);

    // 가까이 붙은 적의 수 → 심장박동
    let near = 0;
    for (const z of this.zombies)
      if (z.aggro && Math.hypot(z.x - this.player.x, z.y - this.player.y) < 260) near++;
    const tension = Math.min(1, near / 5 + (this.player.hp < 35 ? 0.45 : 0));
    SFX.droneLevel(tension);
    // 음악에 연출 상태를 넘긴다 — 긴장도 · 단계 · 그것 · 무리 · 우는 것과의 거리
    {
      const D = this.dir, pl = this.player;
      let weep = 0, hordeNear = false;
      for (const z of this.zombies) {
        const d = Math.hypot(z.x - pl.x, z.y - pl.y);
        if (z.t.weeper && !z.rage && d < 520) weep = Math.max(weep, 1 - d / 520);
        if (z.horde && d < 700) hordeNear = true;
      }
      SFX.musicState({ intensity: D ? D.intensity : 0, phase: D ? D.phase : 'build',
        boss: !!(this.boss && !this.boss.dead && this.boss.aggro), horde: !!(D && D.pending) || hordeNear, weeper: weep });
    }
    this.hitMark = Math.max(0, this.hitMark - dt);
    Hints.update(dt, this);
    this.beatT -= dt;
    if (tension > 0.15 && this.beatT <= 0) {
      SFX.heartbeat(tension);
      this.beatT = 1.15 - tension * 0.5;
    }
    this.shake = Math.max(0, this.shake - dt * 34);
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('toast').classList.remove('show'); }

    const p = this.player, w = this.world;

    /* 입력 → 이동 */
    let mx = 0, my = 0;
    if (KEYBIND.held('up', keys)) my -= 1;
    if (KEYBIND.held('down', keys)) my += 1;
    if (KEYBIND.held('left', keys)) mx -= 1;
    if (KEYBIND.held('right', keys)) mx += 1;
    mx += input.moveX + PAD.mx; my += input.moveY + PAD.my;
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }

    const moving = ml > 0.1;
    // 터치 — 엄지를 스틱 테두리 밖으로 한참(반지름의 1.6배) 끌어낸 채 0.35초 버티면 질주한다.
    // 그냥 끝까지 미는 것만으로는 걸린다(예전 94% 문턱은 너무 쉽게 걸렸다)
    input.edgeT = isTouch && SETTINGS.get('edgeSprint') && (input.moveRaw || 0) > 1.6 ? (input.edgeT || 0) + dt : 0;
    const edge = input.edgeT > 0.35 && !p.winded;
    if (this.edgeOn !== edge) { this.edgeOn = edge; $('padMove').classList.toggle('sprint', edge); }
    p.resolveSprint(KEYBIND.held('sprint', keys) || input.sprintLatch || PAD.sprint || edge, moving, dt);
    // 걸쇠는 숨이 차거나 0.6초 넘게 멈추면 스스로 풀린다 — 서 있는 동안 켜져 있다가
    // 다시 움직일 때 의도치 않게 질주(=소음)하지 않도록
    if (input.sprintLatch) {
      input.idleT = moving ? 0 : input.idleT + dt;
      if (p.winded || input.idleT > 0.6 || p.dead) input.sprintLatch = false;
    }
    // 붙잡히면 발이 묶인다 — 한 마리당 22%, 최대 60%. 포위되면 빠져나오기 어렵다
    const grab = 1 - Math.min(0.6, (p.grabN || 0) * 0.22);
    p.grabbed = p.grabN || 0; p.grabN = 0;
    // 터치 — 붙잡히면 저절로 밀친다(밀치기 쿨다운마다 한 번). 두 엄지가 이동 · 조준에 묶여 있어도 빠져나올 수 있게
    if (isTouch && SETTINGS.get('autoShove') && p.grabbed > 0 && !p.dead && p.meleeCool <= 0) { p.melee(this); this.autoShoves = (this.autoShoves || 0) + 1; }
    // 크게 다치면 절뚝인다 — "추격당하며 절뚝이며 안전지대로" (L4D)
    const limp = p.hp < 25 ? 0.8 : 1;
    // 지형 — 진흙 · 모래 더미 · 얕은 물은 발을 늦추고, 얼음판은 미끄러워 멈추려 해도 밀려간다
    const tr = w.terrAt(p.x, p.y);
    const speed = (p.dead ? 0 : 158) * (p.sprinting ? 1.42 : p.reloading ? 0.78 : 1) * grab * limp * TERRAIN_SLOW[tr] * (p.carry ? 0.88 : 1) * (p.slowT > 0 ? 0.55 : 1) * (p.weapon.heavy || 1);
    const tvx = !p.dead && (mx || my) ? mx * speed : 0, tvy = !p.dead && (mx || my) ? my * speed : 0;
    if (tr === 2) {
      const k = Math.min(1, dt * 1.6);
      p.ivx = (p.ivx || 0) + (tvx - (p.ivx || 0)) * k; p.ivy = (p.ivy || 0) + (tvy - (p.ivy || 0)) * k;
      if (!p.dead && (Math.abs(p.ivx) + Math.abs(p.ivy) > 4)) { const bx = p.x, by = p.y; w.slide(p, p.ivx * dt, p.ivy * dt); if (Math.hypot(p.x - bx, p.y - by) < Math.hypot(p.ivx, p.ivy) * dt * 0.3) { p.ivx *= -0.3; p.ivy *= -0.3; } }
      if (!(mx || my)) p.walkPhase += dt * 2;
    } else { p.ivx = tvx; p.ivy = tvy; }
    if (!p.dead && (mx || my) && tr !== 2) {
      const before = p.walkPhase;
      w.slide(p, mx * speed * dt, my * speed * dt);
      p.walkPhase += dt * (p.sprinting ? 13 : 8) * Math.min(1, ml * 1.6);
      // 보폭이 반 바퀴 돌 때마다 한 걸음
      if (Math.floor(p.walkPhase / Math.PI) !== Math.floor(before / Math.PI))
        SFX.step(p.sprinting, this.onPuddle(p.x, p.y), this.world.terrAt(p.x, p.y), this.world.theme.weather);
    }
    // 걸음 폭 — 멈추면 다리가 천천히 모인다
    const strideTo = !p.dead && (mx || my) ? Math.min(1, ml * 1.6) * (p.sprinting ? 1.25 : 1) : 0;
    p.stride = (p.stride || 0) + (strideTo - (p.stride || 0)) * Math.min(1, dt * 10);

    /* 조준 */
    const cam = this.camera();
    if (!p.dead && (input.turnRate || input.dragTurn)) {
      p.angle += input.turnRate * dt + input.dragTurn;
      input.dragTurn = 0;
    }
    input.manualHoldT = (input.manualHoldT || 0) - dt;
    if (input.aimTouch !== null) p.angle = input.aimTouch;
    else if (PAD.aim !== null) p.angle = PAD.aim;
    else if (autoAimOn() && !p.dead) { if (input.manualHoldT <= 0) autoFace(this, p, mx, my, dt); }
    else if (input.hasMouse && R3) { const q = R3.unproject(input.mx, input.my); if (q) p.angle = Math.atan2(q[1] - p.y, q[0] - p.x); }
    else if (input.hasMouse) p.angle = Math.atan2(cam.y + input.my / TILT - p.y, cam.x + input.mx - p.x);   // 화면 → 세계 (기울기 되돌림)

    p.update(dt, this);
    this.anchorT = (this.anchorT || 0) - dt;
    if (this.anchorT <= 0) { this.anchorT = 0.25; this.reanchor(); }

    // 반동은 빠르게 제자리로, 탄피는 굴러가다 멈춘다
    const kd = Math.pow(0.0005, dt);
    this.kickX *= kd; this.kickY *= kd;
    for (const c of this.casings) if (c.t > 0) {
      c.t -= dt; c.x += c.vx * dt; c.y += c.vy * dt; c.a += c.spin * dt;
      c.vx *= Math.pow(0.02, dt); c.vy *= Math.pow(0.02, dt); c.spin *= Math.pow(0.05, dt);
    }
    // 질주로 경보기 차에 부딪히면 울린다
    if (p.sprinting) for (const pr of w.props)
      if (pr.alarm && !pr.ringing && Math.hypot(pr.x - p.x, pr.y - p.y) < 36) this.triggerAlarm(pr);
    // 숨이 넘어가는 소리
    if (!p.dead && p.hp < 25) {
      this.breathT = (this.breathT || 0) - dt;
      if (this.breathT <= 0) { this.breathT = 1.6; SFX.breath(); }
    }

    /* 사격: 수동 + 불빛 안 자동사격 */
    if (!p.dead) {
      const manual = input.firing || KEYBIND.held('fire', keys) || PAD.fire;
      // 원작: 불빛을 적에게 비추면 사격은 저절로 된다. 불빛 안의 표적을 향해 쏜다
      const tgt = !manual && SETTINGS.autofire ? this.autoTarget() : null;
      if (p.cool <= 0 && (manual || tgt))
        p.fire(this, tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : undefined);
    }

    /* 엔티티 */
    for (const z of this.zombies) if (!z.dead) { SFX.pan(z.x - p.x); z.update(dt, this); }
    SFX.pan(0);
    this.separate(dt);
    for (const b of this.bullets) b.update(dt, this);
    for (const gr of this.grenades) gr.update(dt, this);
    for (const sp of this.spits) { SFX.pan(sp.x - p.x); sp.update(dt, this); }
    SFX.pan(0);

    // 산 웅덩이 — 밟고 있으면 계속 닳는다.
    // 겹친 웅덩이는 더하지 않고 가장 진한 쪽만 적용한다. 더하면 두 겹에 들어선 순간 즉사한다.
    let acidDps = 0;
    for (let i = this.acids.length - 1; i >= 0; i--) {
      const a = this.acids[i];
      a.t -= dt;
      if (a.t <= 0) { this.acids.splice(i, 1); continue; }
      if (!p.dead && Math.hypot(p.x - a.x, p.y - a.y) < a.r)
        acidDps = Math.max(acidDps, 10 * Math.min(1, a.t / a.max + 0.3));   // 식을수록 약해진다
    }
    // 폭풍 — 모래 폭풍 · 눈보라는 45초마다 한 번, 4초에 걸쳐 짙어져 12초 머물다 걷힌다
    const wx = w.theme.weather;
    if (wx === 'sandstorm' || wx === 'blizzard') {
      const c = (this.time - 18) % 45, prev = this.storm || 0;
      this.storm = this.time < 18 ? 0 : c < 4 ? c / 4 : c < 16 ? 1 : c < 20 ? 1 - (c - 16) / 4 : 0;
      SFX.storm(this.storm);
      if (prev === 0 && this.storm > 0) this.toast(wx === 'sandstorm' ? T('모래 폭풍이 온다 — 불빛이 반밖에 닿지 않는다') : T('눈보라가 온다 — 불빛이 반밖에 닿지 않는다'));
    } else this.storm = 0;
    // 용암 균열 — 밟고 있으면 데인다. 감염체도 데어 쓰러진다
    const onLava = !p.dead && w.terrAt(p.x, p.y) === 4;
    if (onLava) acidDps = Math.max(acidDps, 6);
    if (w.terrain === 'lava') for (const z of this.zombies) if (!z.dead && !z.t.boss && w.terrAt(z.x, z.y) === 4) {
      z.hp -= 16 * dt; z.burnT = 0.3;
      if (z.hp <= 0) { z.hurt(1, Math.random() * 6.28, this, 0); if (++this.lavaKills >= 10) Ach.unlock('lava'); }
    }
    // L4D 스피터처럼 서 있을수록 세진다 — 스쳐 지나가면 가볍고, 버티면 아프다
    p.inAcid = acidDps > 0 ? (p.inAcid || 0) + dt : Math.max(0, (p.inAcid || 0) - dt * 2);
    if (acidDps > 0) {
      this.lastHurt = onLava ? 'lava' : 'acid';
      p.hurt(acidDps * (0.3 + 0.7 * Math.min(1, p.inAcid / 1.6)) * SETTINGS.mod.dmg * dt);
      if (this.hurtSfxT <= 0) { this.hurtSfxT = 0.75; SFX.hurt(); }
    }
    for (const pk of this.pickups) pk.update(dt, this);
    this.updateTerrFx(dt);
    for (let i = this.gas.length - 1; i >= 0; i--) if ((this.gas[i].t -= dt) <= 0) this.gas.splice(i, 1);

    this.zombies = this.zombies.filter(z => !z.dead);
    this.bullets = this.bullets.filter(b => !b.dead);
    this.grenades = this.grenades.filter(g => !g.dead);
    this.spits = this.spits.filter(sp => !sp.dead);
    this.pickups = this.pickups.filter(p2 => !p2.dead);

    /* 파티클 */
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const q = this.particles[i];
      q.life -= dt;
      q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.vz !== undefined) { q.z += q.vz * dt; q.vz -= 520 * dt; if (q.z <= 0) { q.z = 0; q.vz = 0; q.vx *= 0.2; q.vy *= 0.2; q.life = Math.min(q.life, 0.12); } }
      const drag = Math.pow(q.kind === 'blood' ? 0.02 : q.kind === 'smoke' ? 0.25 : 0.08, dt);
      q.vx *= drag; q.vy *= drag;
      if (q.life <= 0) {
        if (q.kind === 'blood' && !w.solid(q.x, q.y)) {
          if (this.decals.length >= 420) this.decals.shift();
          this.decals.push({ x: q.x, y: q.y, r: q.size * 1.9, a: 0.3 + Math.random() * 0.28 });
        }
        this.particles.splice(i, 1);
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].t += dt;
      if (this.flashes[i].t >= this.flashes[i].life) this.flashes.splice(i, 1);
    }
    for (const c of this.corpses) {
      c.age += dt;
      // 날아가거나 밀려나는 쓰러짐 — 처음 순간에 맞은 쪽으로 미끄러진다(벽은 넘지 않는다)
      if (c.push > 0) {
        const d = Math.min(c.push, (c.how === 'blast' ? 90 : 110) * dt), nx = c.x + Math.cos(c.a) * d, ny = c.y + Math.sin(c.a) * d;
        if (!this.world.solid(nx, ny)) { c.x = nx; c.y = ny; c.push -= d; } else c.push = 0;
      }
    }

    /* 손전등에 비친 좀비 표시 (감지용) */
    const range = p.lightRange;
    if (range > 0) {
      for (const z of this.zombies) {
        const d = Math.hypot(z.x - p.x, z.y - p.y);
        if (d > range) continue;
        const a = Math.atan2(z.y - p.y, z.x - p.x);
        let da = Math.abs(((a - p.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (da < CONE_HALF && w.los(p.x, p.y, z.x, z.y, true)) z.lit = 1;
      }
    }

    /* 소환 */
    this.spawnT -= dt;
    const sp = this.level.spawn;
    if (this.survival) this.waveScale = 1 + this.time / 55;
    // 캠페인의 자잘한 소환은 연출가가 압박을 맡은 만큼 줄인다
    const rate = sp.rate * this.waveScale * SETTINGS.mod.spawn * (this.survival ? 1 : 0.6);
    const maxZ = Math.min(
      Math.round((sp.max + (this.survival ? Math.floor(this.time / 20) : 0)) * SETTINGS.mod.max), 60);
    if (this.spawnT <= 0 && this.zombies.length < maxZ) {
      this.spawnT = 1 / Math.max(0.05, rate);
      if (!this.dir || this.dir.phase === 'build' || this.dir.phase === 'sustain') this.spawnZombie(620, 1500);
    }
    // 추격 경로는 0.35초마다 다시 깐다
    this.flowT -= dt;
    if (this.flowT <= 0) { this.flowT = 0.35; this.world.updateFlow(p.x, p.y); }
    this.updateDirector(dt);
    // 서바이벌: 120초마다 그것이 한 마리씩. 이미 있으면 겹쳐 보내지 않는다.
    // 타이머는 "실제로 내려보냈을 때"만 다음으로 넘긴다 — 자리를 못 찾았다고
    // 시간을 흘려보내면 웨이브가 통째로 사라진다.
    if (this.survival && !this.challenge && this.time >= this.nextBossT) {
      if (this.boss && !this.boss.dead) {
        this.nextBossT = this.time + 60;
      } else {
        const br = ZTYPES.behemoth.r;
        let spot = null;
        for (let i = 0; i < 120 && !spot; i++) {
          const q = this.world.pickPoint(p.x, p.y, 700, 1500);
          // pickPoint 는 범위를 못 맞추면 아무 타일이나 준다 — 거리를 직접 검산한다
          if (Math.hypot(q.x - p.x, q.y - p.y) < 600) continue;
          if (this.world.hits(q.x, q.y, br + 2)) continue;
          spot = q;
        }
        if (spot) {
          this.boss = new Zombie(spot.x, spot.y, 'behemoth');
          this.boss.aggro = true;
          this.zombies.push(this.boss);
          SFX.roar(0);
          this.toast(T('무언가 큰 것이 내려왔다'));
          this.nextBossT = this.time + 150;
        } else {
          this.nextBossT = this.time + 15;    // 자리가 없으면 곧 다시 본다
        }
      }
    }

    if (this.survival && this.world.theme.key === 'mars') Specials.update(this);
    if (this.survival && this.time > 30) {
      const t = this.time;
      if (!this.challenge) this.level.mix = {
        walker:  Math.max(0.18, 0.7 - t / 400),
        runner:  Math.min(0.45, 0.28 + t / 520),
        brute:   Math.min(0.28, Math.max(0, (t - 60) / 520)),
        crawler: Math.min(0.26, Math.max(0, (t - 35) / 420)),
        spitter: Math.min(0.20, Math.max(0, (t - 90) / 600)),
        bloater: Math.min(0.10, Math.max(0, (t - 50) / 700)),
        screamer: Math.min(0.07, Math.max(0, (t - 70) / 800)),
        leaper:  Math.min(0.07, Math.max(0, (t - 80) / 900)),
        puller:  Math.min(0.05, Math.max(0, (t - 110) / 1000)),
        charger: Math.min(0.05, Math.max(0, (t - 140) / 1000)),
        riot:    Math.min(0.08, Math.max(0, (t - 60) / 700))
      };
      if (this.pickups.length < 6 && Math.random() < dt * 0.35) {
        let types = ['ammo', 'ammo', 'shells', 'medkit', 'battery', 'nade'];
        if (p.owned.has('rifle')) types.push('rounds');
        if (p.owned.has('crossbow')) types.push('bolts');
        if (this.challenge && this.challenge.rules && this.challenge.rules.pistolOnly) types = ['medkit', 'battery', 'nade', 'medkit'];
        const q = this.world.pickPoint(p.x, p.y, 300, 1400);
        this.pickups.push(new Pickup(q.x, q.y, types[(Math.random() * types.length) | 0]));
      }
    }

    /* 도전: 시간 · 정해진 무리 · 그것을 쓰러뜨린 뒤 마무리 */
    if (this.challenge) {
      const C = this.challenge, R = C.rules || {};
      if (R.hordeEvery && !p.dead) { this.chHordeT -= dt; if (this.chHordeT <= 0 && this.callHorde(this.hordeSize() + 2)) this.chHordeT = R.hordeEvery; }
      if (this.combo > 1 && this.time - this.lastKillT > 2.5) this.combo = 0;
      if (this.finishT > 0) { this.finishT -= dt; if (this.finishT <= 0) { this.finish(true); return; } }
      if (this.time >= C.time && !p.dead) { this.finish(true); return; }
    }

    /* 목표 진행 */
    const ob = this.level.objective;
    if (ob.type === 'survive' && !this.exitOpen) {
      this.surviveLeft -= dt;
      if (this.surviveLeft <= 0) { this.surviveLeft = 0; this.openExit(T('차단문 개방 — 지금이다')); }
    }
    if (ob.type === 'signal' && !this.exitOpen) this.updateRelays(dt, ob);
    if (ob.type === 'finale' && !this.exitOpen) this.updateFinale(dt, ob);
    Twist.update(this, dt);
    if (p.slowT > 0) p.slowT -= dt;
    this.storyCues(ob);
    Radio.update(dt);
    if (this.exitOpen && ob.type !== 'endless' &&
        Math.hypot(p.x - w.exit.x, p.y - w.exit.y) < 44) {
      this.finish(true); return;
    }

    /* 번개 */
    this.lightningT -= dt;
    this.lightning = Math.max(0, this.lightning - dt * 2.6);
    if (this.lightningT <= 0) {
      this.lightningT = 14 + Math.random() * 22;
      const wxx = this.world.theme.weather;
      if (wxx !== 'sandstorm' && wxx !== 'snow' && wxx !== 'blizzard') { this.lightning = SETTINGS.flash ? 1 : 0.22; SFX.thunder(); }
    }

    if (p.dead && this.state === 'play') this.finish(false);
  },

  /** 불빛 안의 가장 가까운 적 — 원작처럼 비추면 자동 사격 */
  /** 발밑이 젖어 있는지 — 발소리 음색을 바꾼다 */
  onPuddle(x, y) {
    for (const q of this.puddles) {
      const dx = (x - q.x) / q.rx, dy = (y - q.y) / q.ry;
      if (dx * dx + dy * dy <= 1) return true;
    }
    return false;
  },

  autoTarget() {
    const p = this.player, range = Math.max(p.lightRange, 190);
    let best = null, bd = 1e9;
    for (const z of this.zombies) {
      if (z.t.weeper && !z.rage) continue;          // 우는 것은 자동으로 쏘지 않는다 — 깨울지는 플레이어가 정한다
      const d = Math.hypot(z.x - p.x, z.y - p.y);
      if (d > range || d > bd) continue;
      const a = Math.atan2(z.y - p.y, z.x - p.x);
      let da = Math.abs(((a - p.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (da > (isTouch ? 0.42 : 0.30)) continue;   // 터치는 회전 조작이라 조금 더 너그럽게
      if (!this.world.los(p.x, p.y, z.x, z.y)) continue;
      best = z; bd = d;
    }
    return best;
  },

  /** 좀비끼리 겹치지 않게 밀어낸다 */
  separate(dt) {
    const zs = this.zombies;
    for (let i = 0; i < zs.length; i++) {
      const a = zs[i]; if (a.dead) continue;
      for (let j = i + 1; j < zs.length; j++) {
        const b = zs[j]; if (b.dead) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const min = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 > min * min || d2 < 0.01) continue;
        const d = Math.sqrt(d2), push = (min - d) * 0.5;
        const ux = dx / d * push, uy = dy / d * push;
        this.world.slide(a, -ux, -uy);
        this.world.slide(b, ux, uy);
      }
    }
  },

  camera() {
    const p = this.player, w = this.world;
    const lead = 62;
    // 플레이어를 놓을 화면 위치. 터치는 아래 40%를 스틱·버튼이, 위 10%를 HUD 가 덮으므로
    // 그 사이 트인 띠의 가운데쯤(40%)에 둔다 — 화면 정중앙이면 지도 끝에서 버튼 밑에 깔린다.
    const fy = focusY();
    let x = p.x + Math.cos(p.angle) * lead - W / 2;
    let y = p.y + Math.sin(p.angle) * lead - fy / TILT;
    // 지도 밖 허공이 보이지 않게 가둔다. 단, 위아래 UI 띠가 어차피 가리는 만큼은 넘어가도 된다
    // — 그래야 지도 끝에서도 플레이어가 탄약·게이지 밑에 깔리지 않는다.
    // 지도에 끝이 없으므로 카메라를 가두지 않는다
    if (this.shake > 0.1 && SETTINGS.shake) {
      x += (Math.random() - 0.5) * this.shake;
      y += (Math.random() - 0.5) * this.shake;
    }
    x += this.kickX || 0; y += this.kickY || 0;
    return { x, y };
  }
};

/** 플레이어를 놓을 화면 높이. 세로 터치 화면은 아래 40% 를 스틱·버튼이 덮어 위쪽(40%)에,
    가로 화면은 버튼이 양옆으로 비켜 있으니 가운데에 둔다 */
function focusY() { return isTouch && H > W ? H * 0.40 : H / 2; }

/* ═══════════ 렌더 ═══════════ */
function render() {
  const g = G, p = g.player, w = g.world;
  g.frameNo = (g.frameNo || 0) + 1;                   // 프레임마다 한 번 만드는 것들(그림자)의 열쇠
  MODELS.outline = texOn();                          // 인물 윤곽 · 빛 층 · 그림자 · 물결은 세부 묘사 단계(자동 화질이 버거우면 끈다)
  if (R3 && !R3.ok) R3 = null;                         // 3D 를 접었으면(WebGL 실패) 2D 로 그린다
  else if (!R3 && window.R3D && window.R3D.ok) R3 = window.R3D;
  if (R3) { render3D(g, p); return; }
  const cam = g.camera();
  placeCompass(...toScreen(cam, p.x, p.y));

  // 바닥 타일이 화면을 빈틈없이 덮으므로 배경을 따로 칠하지 않는다 (화면 전체 한 겹 절약)
  ctx.save();
  worldTransform(ctx, cam);

  drawGround(cam, w);
  drawDecorFlat(cam, w);
  drawExit(g, w);

  /* 혈흔 */
  ctx.fillStyle = '#3a0c0a';
  const dx0 = cam.x - 30, dx1 = cam.x + W + 30, dy0 = cam.y - 30, dy1 = cam.y + VH() + 30;   // 화면 밖 혈흔은 건너뛴다
  for (const d of g.decals) {
    if (d.x < dx0 - d.r || d.x > dx1 + d.r || d.y < dy0 - d.r || d.y > dy1 + d.r) continue;
    ctx.globalAlpha = d.a;
    if (d.s !== undefined) {
      const img = splatImg(d.s), R = d.r;
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
      ctx.drawImage(img, -R, -R, R * 2, R * 2);
      ctx.restore();
      continue;
    }
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.283); ctx.fill();
  }
  ctx.globalAlpha = 1;

  /* 탄피 */
  for (const c of g.casings) {
    if (c.x < cam.x - 20 || c.x > cam.x + W + 20 || c.y < cam.y - 20 || c.y > cam.y + VH() + 20) continue;
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
    ctx.fillStyle = c.shell ? '#9c2f24' : '#b8923a';
    ctx.fillRect(-2.5, -1.2, c.shell ? 6 : 4.5, c.shell ? 3 : 2.2);
    ctx.restore();
  }

  /* 산 웅덩이 */
  for (const a of g.acids) {
    const k = Math.min(1, a.t / a.max);
    const wob = 1 + Math.sin(g.time * 3 + a.phase) * 0.04;
    ctx.globalAlpha = 0.30 * k + 0.08;
    ctx.fillStyle = '#4e7a1e';
    ctx.beginPath(); ctx.ellipse(a.x, a.y, a.r * wob, a.r * 0.78 * wob, 0, 0, 6.283); ctx.fill();
    ctx.globalAlpha = 0.22 * k;
    ctx.fillStyle = '#8fd13c';
    ctx.beginPath(); ctx.ellipse(a.x, a.y, a.r * 0.52, a.r * 0.4, 0, 0, 6.283); ctx.fill();
  }
  ctx.globalAlpha = 1;

  /* 부푼 것의 가스 */
  for (const q of g.gas) {
    const k = q.t / q.max;
    ctx.globalAlpha = 0.28 * k;
    ctx.fillStyle = '#6f8a32';
    for (let i = 0; i < 5; i++) {
      const a = i * 1.257 + g.time * 0.3, r = q.r * (0.45 + 0.12 * Math.sin(g.time + i));
      ctx.beginPath(); ctx.arc(q.x + Math.cos(a) * r * 0.5, q.y + Math.sin(a) * r * 0.5, r * 0.7, 0, 6.283); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  /* 시체 */
  screenTransform(ctx, cam);
  for (const c of g.corpses) drawCorpse(c, cam);
  if (p.dead) drawCorpse(p.corpse || (p.corpse = { x: p.x, y: p.y, a: p.angle, type: 'player', age: 2 }), cam);
  worldTransform(ctx, cam);

  for (const pk of g.pickups) drawPickup(pk, g.time, cam);
  for (const r of g.relays || []) drawRelay(r, g, cam);
  for (const o of g.twObjs || []) drawTwist(o, g, cam);
  // 자동 조준의 표적 — 발밑에 옅은 노란 괄호. 무엇을 비추고 있는지 알 수 있게
  const at = g.aimTarget;
  if (at && !at.dead && autoAimOn() && at.lit > 0.2) {
    const r = at.r + 7, k = 0.35 + Math.sin(g.time * 8) * 0.1;
    ctx.strokeStyle = `rgba(240,180,41,${k})`; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; ctx.beginPath(); ctx.arc(at.x, at.y, r, a - 0.35, a + 0.35); ctx.stroke(); }
  }
  for (const gr of g.grenades) drawGrenade(gr);
  // 그것의 돌진 예고선 — 선딜 동안만 보이고, 비키라는 신호다
  // 들이받는 것 · 덮치는 것도 같은 예고선을 쓴다 — 덮치는 것은 짧고 가늘다
  for (const b of telegraphs(g)) {
    const len = w.ray(b.x, b.y, b.dir, b.len);
    ctx.save();
    // 방향이 굳으면 깜빡임을 멈추고 진해진다 — '지금 비켜라'
    ctx.strokeStyle = b.locked ? 'rgba(236,72,48,.62)' : `rgba(214,60,42,${0.26 + Math.sin(g.time * 22) * 0.12})`;
    ctx.lineWidth = b.w;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + Math.cos(b.dir) * len, b.y + Math.sin(b.dir) * len);
    ctx.stroke();
    ctx.restore();
  }
  // 휘감는 것의 혀
  for (const z of g.zombies) {
    if (z.dead || !z.tonguePhase || z.tonguePhase === 'wind') continue;
    ctx.strokeStyle = '#8a3a40'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(z.x, z.y - GUN_LIFT * 1.3); ctx.lineTo(z.tipX, z.tipY - GUN_LIFT * 0.8); ctx.stroke();
  }

  for (const sp of g.spits) {
    // 떨어질 곳 — 좁혀 들어오는 초록 고리. 여기서 비키면 된다
    const k = Math.min(1, sp.t / sp.dur);
    ctx.strokeStyle = `rgba(150,220,70,${0.25 + k * 0.45})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sp.tx, sp.ty, 18 + (1 - k) * 26, 0, 6.283); ctx.stroke();
    ctx.fillStyle = `rgba(120,190,50,${0.08 + k * 0.12})`;
    ctx.beginPath(); ctx.arc(sp.tx, sp.ty, 18, 0, 6.283); ctx.fill();
    const r = 4.5 + Math.sin(sp.phase) * 0.9, sy = sp.y - SPIT_LIFT - sp.h * ZK;
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.arc(sp.x, sp.y, r, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#7fbf33';
    ctx.beginPath(); ctx.arc(sp.x, sy, r, 0, 6.283); ctx.fill();
    ctx.fillStyle = 'rgba(190,240,130,.75)';
    ctx.beginPath(); ctx.arc(sp.x - sp.vx * 0.004, sy - sp.vy * 0.004, r * 0.5, 0, 6.283); ctx.fill();
  }

  /* 예광탄 — 총구 높이로 날아간다 */
  ctx.lineCap = 'round';
  // 레일건 빛줄기
  if (g.beams) for (const bm of g.beams) {
    const k = 1 - bm.t / bm.max;
    ctx.strokeStyle = `rgba(120,230,255,${0.9 * k})`; ctx.lineWidth = 2 + 6 * k;
    ctx.beginPath(); ctx.moveTo(bm.x, bm.y - GUN_LIFT); ctx.lineTo(bm.x1, bm.y1 - GUN_LIFT); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${k})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(bm.x, bm.y - GUN_LIFT); ctx.lineTo(bm.x1, bm.y1 - GUN_LIFT); ctx.stroke();
  }
  for (const b of g.bullets) {
    if (b.flame) continue;                                    // 불길은 불티 파티클로만
    ctx.strokeStyle = b.bolt ? 'rgba(200,170,120,.95)' : 'rgba(255,232,170,.85)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(b.px, b.py - GUN_LIFT); ctx.lineTo(b.x, b.y - GUN_LIFT); ctx.stroke();
  }

  // 밀치기 — 앞쪽으로 휘두르는 흰 부채꼴. 맞히면 더 진하다
  if (g.shoves) for (const sv of g.shoves) {
    const k = sv.t / sv.max, a0 = sv.a - 1.0 + k * 0.6, a1 = sv.a + 1.0 - k * 0.6, R1 = 30 + k * 34;
    ctx.fillStyle = `rgba(255,248,230,${(sv.hits ? 0.42 : 0.24) * (1 - k)})`;
    ctx.beginPath(); ctx.moveTo(sv.x, sv.y); ctx.arc(sv.x, sv.y, R1, a0, a1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - k)})`; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(sv.x, sv.y, R1, a0, a1); ctx.stroke();
  }
  // 물결 — 물에 들어선 발 둘레로 퍼지는 고리 (밀쳐진 감염체 발밑의 충격 고리도 같은 그림)
  if (g.ripples) {
    ctx.lineWidth = 1.2;
    for (const r of g.ripples) {
      const k = r.t / r.max;
      if (r.shove) { ctx.strokeStyle = `rgba(255,240,210,${0.8 * (1 - k)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r * (0.5 + k * 1.6), r.r * (0.5 + k * 1.6) * 0.6, 0, 0, 6.283); ctx.stroke(); ctx.lineWidth = 1.2; continue; }
      ctx.strokeStyle = `rgba(200,225,235,${0.45 * (1 - k)})`;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r * (0.6 + k * 1.4), r.r * (0.6 + k * 1.4) * 0.6, 0, 0, 6.283); ctx.stroke();
    }
  }
  for (const q of g.particles) {
    const k = clamp(q.life / q.max, 0, 1);
    if (q.kind === 'drop') { ctx.globalAlpha = Math.min(1, k * 2); ctx.fillStyle = q.col; ctx.fillRect(q.x - q.size / 2, q.y - q.z * 0.8 - q.size / 2, q.size, q.size); continue; }
    let r = q.size;
    if (q.kind === 'mist') { r *= 1 + (1 - k) * 2.2; ctx.globalAlpha = k * 0.45; }
    else if (q.kind === 'smoke') { r *= 1 + (1 - k) * 1.8; ctx.globalAlpha = k * 0.3; }
    else ctx.globalAlpha = k;
    ctx.fillStyle = q.col;
    ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 6.283); ctx.fill();
  }
  ctx.globalAlpha = 1;
  drawCity(cam, g, w);
  drawLandmarksTop(cam, w, g);
  drawXray(cam, g, w);
  ctx.restore();

  drawDarkness(cam, g, p, w);
  drawGlow(cam, g, p, w);
  drawRain(g, cam, p);
  if (p.bile > 0) drawBile(p.bile);
  drawHordeCue(cam, g, p);
  drawScreamCue(cam, g, p);
  drawHitDirs(cam, g, p, g.state === 'play' ? 1 / 60 : 0);
  drawCrosshair(g, p);
}

/** 3D 판 — 세계는 WebGL 캔버스에, 그 위 투명한 2D 캔버스에는 화면 표시만(조준선 · 피격 방향 · 무리 예고 · 담즙) */
function render3D(g, p) {
  const cam = g.camera();
  R3.render(g);
  placeCompass(...toScreen(cam, p.x, p.y));
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (p.bile > 0) drawBile(p.bile);
  if (g.lightning > 0.01) { ctx.fillStyle = `rgba(196,208,228,${g.lightning * (SETTINGS.flash ? 0.18 : 0.05)})`; ctx.fillRect(0, 0, W, H); }
  drawHordeCue3D(g, p);
  drawHitDirs(cam, g, p, g.state === 'play' ? 1 / 60 : 0);
  drawCrosshair(g, p);
}
/** 무리 예고 — 3D 판에서는 플레이어 화면 위치 둘레에 그 방향의 붉은 호 */
function drawHordeCue3D(g, p) {
  const h = g.hordeAt;
  if (!h || p.dead) return;
  const [sx, sy] = R3.project(p.x, p.y), [hx, hy] = R3.project(h.x, h.y);
  const a = Math.atan2(hy - sy, hx - sx), k = Math.min(1, h.t / 1.2), pulse = 0.55 + Math.sin(g.time * 14) * 0.25;
  ctx.strokeStyle = `rgba(214,52,40,${k * pulse})`; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(sx, sy, 58, a - 0.42, a + 0.42); ctx.stroke();
  ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, 68, a - 0.24, a + 0.24); ctx.stroke();
}

/** 담즙 — 가장자리부터 녹색으로 번지고 흘러내린다 */
function drawBile(t) {
  const k = Math.min(1, t / 2);
  const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.18, W / 2, H / 2, Math.max(W, H) * 0.7);
  gr.addColorStop(0, 'rgba(90,120,30,0)');
  gr.addColorStop(1, `rgba(90,120,30,${0.55 * k})`);
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = `rgba(120,150,50,${0.35 * k})`;
  for (let i = 0; i < 14; i++) {
    const x = (i * 97 + 31) % W, len = 40 + ((i * 53) % 90) + (9 - t) * 18;
    ctx.fillRect(x, 0, 3 + (i % 3), Math.min(H, len));
  }
}

/** 비명 지르는 것이 숨을 들이켜는 동안 — 어둠 위에 좁혀 드는 주황 고리. 어디서 오는지 보고 먼저 쏘라고 */
function drawScreamCue(cam, g, p) {
  for (const z of g.zombies) {
    if (z.screamPhase !== 'wind' || z.dead) continue;
    if (Math.hypot(z.x - p.x, z.y - p.y) > 760) continue;
    const k = 1 - Math.max(0, z.windT) / z.t.scream.wind;
    ctx.save(); worldTransform(ctx, cam);
    ctx.strokeStyle = `rgba(255,140,60,${0.35 + k * 0.5})`; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(z.x, z.y, 46 - k * 28, 0, 6.283); ctx.stroke();
    ctx.strokeStyle = `rgba(255,140,60,${0.15 + k * 0.2})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(z.x, z.y, 70 - k * 30, 0, 6.283); ctx.stroke();
    ctx.restore();
  }
}
/** 무리가 오는 쪽을 플레이어 둘레의 붉은 호로 3초간 가리킨다 (소리를 못 듣는 환경 대비) */
function drawHordeCue(cam, g, p) {
  const h = g.hordeAt;
  if (!h || p.dead) return;
  const a = Math.atan2(h.y - p.y, h.x - p.x), k = Math.min(1, h.t / 1.2);
  const pulse = 0.55 + Math.sin(g.time * 14) * 0.25;
  ctx.save();
  worldTransform(ctx, cam); ctx.translate(p.x, p.y);
  ctx.strokeStyle = `rgba(214,52,40,${k * pulse})`;
  ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, 0, 58, a - 0.42, a + 0.42); ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 68, a - 0.24, a + 0.24); ctx.stroke();
  ctx.restore();
}

/**
 * 목표 나침반은 플레이어 둘레를 돈다. 카메라가 지도 끝에 막히면 플레이어가 화면
 * 중앙에서 벗어나므로, 화면 중앙이 아니라 실제 플레이어 화면 위치에 매 프레임 붙인다.
 */
let compassX = -1, compassY = -1;
function placeCompass(sx, sy) {
  sx = Math.round(sx); sy = Math.round(sy);
  if (sx === compassX && sy === compassY) return;
  compassX = sx; compassY = sy;
  const el = $('hudCompass');
  el.style.left = (sx * ZOOM + STAGE.x) / HUDZ + 'px';            // HUD 는 레터박스에서 창 전체 기준
  el.style.top = (sy * ZOOM + STAGE.y) / HUDZ + 'px';
}

/**
 * 데스크톱 조준선 — 시스템 커서 대신 그린다. 탄 퍼짐만큼 벌어지고,
 * 장전 중엔 진행 고리가 돌며, 맞히면 X(처치는 붉게)가 잠깐 뜬다.
 */
let cursorHidden = false;
/** 피격 방향 — 플레이어 둘레의 붉은 호. 어둠 속에서 무엇이 어디서 무는지 알 수 있게 */
function drawHitDirs(cam, g, p, dt) {
  if (!g.hitDirs || !g.hitDirs.length) return;
  const [sx, sy] = toScreen(cam, p.x, p.y), R = Math.min(W, H) * 0.16 + 30;
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = g.hitDirs.length - 1; i >= 0; i--) {
    const h = g.hitDirs[i];
    h.t -= dt;
    if (h.t <= 0) { g.hitDirs.splice(i, 1); continue; }
    const k = Math.min(1, h.t / 0.5);
    // 화면에서의 방향 (세로 축소 반영)
    const a = Math.atan2(Math.sin(h.a) * TILT, Math.cos(h.a));
    ctx.strokeStyle = `rgba(220,48,36,${0.75 * k})`;
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(sx, sy - 12, R, a - 0.32, a + 0.32); ctx.stroke();
    ctx.strokeStyle = `rgba(255,140,120,${0.5 * k})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sx, sy - 12, R - 7, a - 0.2, a + 0.2); ctx.stroke();
  }
  ctx.restore();
}

function drawCrosshair(g, p) {
  const want = G.state === 'play' && input.hasMouse && !isTouch && !p.dead;
  if (want !== cursorHidden) { view.style.cursor = want ? 'none' : ''; cursorHidden = want; }
  if (!want) return;

  const x = input.mx, y = input.my, w = p.weapon;
  const gapR = 6 + w.spread * 55 + (p.cool > w.rate * 0.6 ? 3 : 0);
  ctx.save();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.lineCap = 'round';

  // 어두운 테두리를 먼저 깔아 밝은 바닥에서도 보이게
  for (const [col, lw] of [['rgba(0,0,0,.55)', 3.4], ['rgba(232,230,224,.9)', 1.5]]) {
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.beginPath();
      ctx.moveTo(x + dx * gapR, y + dy * gapR);
      ctx.lineTo(x + dx * (gapR + 6), y + dy * (gapR + 6));
      ctx.stroke();
    }
  }
  ctx.fillStyle = 'rgba(232,230,224,.9)';
  ctx.fillRect(x - 1, y - 1, 2, 2);

  if (p.reloading) {
    const r = gapR + 11;
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.stroke();
    ctx.strokeStyle = 'rgba(240,180,41,.95)';
    ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + p.reloadProgress * 6.283); ctx.stroke();
  }

  if (g.hitMark > 0) {
    const k = clamp(g.hitMark / (g.hitKill ? 0.24 : 0.11), 0, 1);
    const r0 = gapR + 2, r1 = gapR + (g.hitKill ? 13 : 9);
    ctx.strokeStyle = g.hitKill ? `rgba(222,64,48,${k})` : `rgba(255,255,255,${k * 0.95})`;
    ctx.lineWidth = g.hitKill ? 2.4 : 1.7;
    for (const a of [0.785, 2.356, 3.927, 5.498]) {
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
      ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** 지역의 땅빛 — [차도에 덧칠, 보도에 덧칠] */
const GROUND_TINT = {
  cairo: ['rgba(0,0,0,0)', 'rgba(160,124,76,.38)', 'rgba(150,118,74,.45)'],
  antarctic: ['rgba(0,0,0,0)', 'rgba(206,216,226,.6)', 'rgba(200,210,222,.55)'],
  reykjavik: ['rgba(0,0,0,0)', 'rgba(190,198,206,.42)', 'rgba(180,190,200,.4)'],
  varanasi: ['rgba(0,0,0,0)', 'rgba(110,80,50,.16)', 'rgba(120,90,55,.2)'],
  rio: ['rgba(0,0,0,0)', 'rgba(170,140,90,.14)', 'rgba(190,160,110,.22)'],
  mars: ['rgba(0,0,0,0)', 'rgba(150,62,30,.5)', 'rgba(160,70,36,.5)']
};
/** 지형 덧칠 — 칸 목록 [종류, x, y, 잡음] */
function drawTerrain(tt, t) {
  const P = () => new Path2D();
  const sand = P(), sandLine = P(), ice = P(), iceHi = P(), water = P(), ripple = P(), crust = P(), crack = P(), mud = P(), mudHi = P();
  for (let k = 0; k < tt.length; k += 4) {
    const v = tt[k], x = tt[k + 1], y = tt[k + 2], n = tt[k + 3], px = x * TILE, py = y * TILE, h = (x * 7 + y * 13) & 7;
    if (v === 1) {                                                   // 모래 더미 — 둥근 둔덕과 바람 결
      // 바람에 쓸린 긴 둔덕 — 이웃 칸과 겹쳐 하나의 모래톱이 된다
      const ox = (n - 8) * 2.2, oy = (h - 4) * 3, rx = 34 + (n & 7) * 2, ry = 14 + (h & 3) * 2;
      sand.moveTo(px + 24 + ox + rx, py + 24 + oy); sand.ellipse(px + 24 + ox, py + 24 + oy, rx, ry, -0.25, 0, 6.283);
      if (n & 1) { sandLine.moveTo(px + 4 + ox, py + 30 + oy); sandLine.quadraticCurveTo(px + 22 + ox, py + 20 + oy, px + 44 + ox, py + 22 + oy); }
    } else if (v === 2) {                                            // 얼음판 — 푸른 윤기와 긁힌 결
      ice.rect(px, py, TILE, TILE);
      iceHi.moveTo(px + 6 + h * 2, py + 40); iceHi.lineTo(px + 30 + h * 2, py + 8);
      iceHi.moveTo(px + 20 + h, py + 44); iceHi.lineTo(px + 40, py + 22);
    } else if (v === 3) {                                            // 얕은 물 — 어두운 수면과 번지는 물결
      water.rect(px, py, TILE, TILE);
      const ph = (t * 0.7 + n * 0.29) % 1, rx = 4 + ph * 12;
      ripple.moveTo(px + 14 + n * 1.5 + rx, py + 20 + h * 2); ripple.ellipse(px + 14 + n * 1.5, py + 20 + h * 2, rx, rx * 0.5, 0, 0, 6.283);
    } else if (v === 4) {                                            // 용암 균열 — 검게 굳은 겉과 붉게 빛나는 금
      crust.rect(px, py, TILE, TILE);
      crack.moveTo(px + 2, py + 18 + h * 2); crack.lineTo(px + 16, py + 26); crack.lineTo(px + 30, py + 14 + h); crack.lineTo(px + 46, py + 30);
      crack.moveTo(px + 16, py + 26); crack.lineTo(px + 22, py + 46);
    } else if (v === 5) {                                            // 진흙 — 번들거리는 갈색 웅덩이
      mud.moveTo(px + 24 + 23, py + 24); mud.ellipse(px + 24, py + 24, 23, 17 + (h & 3), 0.4 * h, 0, 6.283);
      mudHi.moveTo(px + 18 + 6, py + 18); mudHi.ellipse(px + 18, py + 18, 6, 2.5, -0.4, 0, 6.283);
    }
  }
  ctx.fillStyle = 'rgba(178,140,86,.4)'; ctx.fill(sand);
  ctx.strokeStyle = 'rgba(110,82,46,.35)'; ctx.lineWidth = 1.5; ctx.stroke(sandLine);
  ctx.fillStyle = 'rgba(150,186,214,.34)'; ctx.fill(ice);
  ctx.strokeStyle = 'rgba(235,245,255,.35)'; ctx.lineWidth = 1.2; ctx.stroke(iceHi);
  ctx.fillStyle = 'rgba(14,32,44,.62)'; ctx.fill(water);
  ctx.strokeStyle = 'rgba(140,180,200,.22)'; ctx.lineWidth = 1; ctx.stroke(ripple);
  ctx.fillStyle = 'rgba(22,14,10,.82)'; ctx.fill(crust);
  ctx.strokeStyle = 'rgba(255,110,30,.9)'; ctx.lineWidth = 2.6; ctx.lineJoin = 'round'; ctx.stroke(crack);
  ctx.fillStyle = 'rgba(56,40,26,.7)'; ctx.fill(mud);
  ctx.fillStyle = 'rgba(200,190,170,.16)'; ctx.fill(mudHi);
}
/** 화성의 크레이터 — 움푹한 바닥(어둡게)과 솟은 테(빛 받는 쪽은 밝게, 반대쪽은 그늘) */
function drawCraters(cam, w) {
  const cx = cam.x + W / 2, cy = cam.y + VH() / 2;
  for (const c of w.craters) {
    const q = w.near(c.x * TILE, c.y * TILE, cx, cy), R = c.r * TILE;
    if (q.x < cam.x - R * 1.4 || q.x > cam.x + W + R * 1.4 || q.y < cam.y - R * 1.4 || q.y > cam.y + VH() + R * 1.4) continue;
    const bowl = ctx.createRadialGradient(q.x + R * 0.2, q.y + R * 0.2, R * 0.1, q.x, q.y, R);
    bowl.addColorStop(0, 'rgba(40,14,8,.55)'); bowl.addColorStop(0.8, 'rgba(70,26,14,.45)'); bowl.addColorStop(1, 'rgba(90,34,18,.2)');
    ctx.fillStyle = bowl; ctx.beginPath(); ctx.arc(q.x, q.y, R, 0, 6.283); ctx.fill();
    ctx.lineWidth = TILE * 0.7;
    ctx.strokeStyle = 'rgba(210,120,80,.32)'; ctx.beginPath(); ctx.arc(q.x, q.y, R + TILE * 0.3, Math.PI * 0.75, Math.PI * 1.9); ctx.stroke();
    ctx.strokeStyle = 'rgba(30,10,6,.35)'; ctx.beginPath(); ctx.arc(q.x, q.y, R + TILE * 0.3, -0.1, Math.PI * 0.75); ctx.stroke();
  }
}
function drawGround(cam, w) {
  const x0 = Math.floor(cam.x / TILE), y0 = Math.floor(cam.y / TILE);
  const x1 = Math.ceil((cam.x + W) / TILE), y1 = Math.ceil((cam.y + VH()) / TILE);
  const at = (x, y) => w.at(x, y);
  const road = new Path2D(), side = new Path2D(), detail = [], terrT = [];

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = w.idx(x, y), d = w.deco[i];
      const n = ((x * 73856093) ^ (y * 19349663)) & 15;
      const px = x * TILE, py = y * TILE;
      if (w.terr && w.terr[i]) terrT.push(w.terr[i], x, y, n);
      if (d === D_BUILDING) {
        ctx.fillStyle = n < 5 ? '#12161d' : n < 11 ? '#0f131a' : '#161b23';
        ctx.fillRect(px, py, TILE, TILE);
      } else if (d === D_WATER) {
        // 강 — 검푸른 물, 빗방울 파문
        ctx.fillStyle = n < 8 ? '#0c1922' : '#0e1c26';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.strokeStyle = 'rgba(120,160,190,.10)'; ctx.lineWidth = 1;
        const ph = (G.time * 0.6 + n * 0.37) % 1;
        ctx.beginPath(); ctx.ellipse(px + 10 + n * 2, py + 14 + (n & 7) * 3, 4 + ph * 9, (4 + ph * 9) * 0.5, 0, 0, 6.283); ctx.stroke();
        const bank = w.theme.canals ? '#8a867c' : '#2b2f33';                                                  // 둑 — 운하는 흰 돌 테두리
        if (at(x, y - 1) === T_ROAD) { ctx.fillStyle = bank; ctx.fillRect(px, py, TILE, 5); }
        if (at(x, y + 1) === T_ROAD) { ctx.fillStyle = bank; ctx.fillRect(px, py + TILE - 5, TILE, 5); }
        if (at(x - 1, y) === T_ROAD) { ctx.fillStyle = bank; ctx.fillRect(px, py, 5, TILE); }
        if (at(x + 1, y) === T_ROAD) { ctx.fillStyle = bank; ctx.fillRect(px + TILE - 5, py, 5, TILE); }
      } else if (d === D_BRIDGE) {
        ctx.fillStyle = n < 8 ? '#2c3138' : '#2a2f36';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(px, py + TILE - 2, TILE, 2);   // 상판 이음매
        // 난간 — 물과 맞닿은 쪽
        if (w.deco[w.idx(x - 1, y)] === D_WATER) { ctx.fillStyle = '#4a5058'; ctx.fillRect(px, py, 5, TILE); }
        if (w.deco[w.idx(x + 1, y)] === D_WATER) { ctx.fillStyle = '#4a5058'; ctx.fillRect(px + TILE - 5, py, 5, TILE); }
      } else if (d === D_GRASS && w.theme.key === 'mars') {
        // 화성의 벌판 — 붉은 흙과 자갈
        ctx.fillStyle = '#3b1b10'; ctx.fillRect(px, py, TILE, TILE);
        if ((n & 3) === 0) { ctx.fillStyle = 'rgba(30,12,6,.35)'; ctx.beginPath(); ctx.arc(px + 10 + (n % 28), py + 12 + ((n * 7) % 24), 2.5 + (n & 1), 0, 6.283); ctx.fill(); }   // 드문드문 돌
      } else if (d === D_GRASS) {
        ctx.fillStyle = n < 6 ? '#1c271d' : n < 12 ? '#1a241b' : '#202c21';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = 'rgba(120,150,100,.08)';
        for (let k = 0; k < 4; k++) ctx.fillRect(px + ((n * 7 + k * 13) % 44), py + ((n * 11 + k * 17) % 44), 2, 3);
      } else if (d === D_PLAZA || d === D_LANDMARK) {
        // 광장 · 경내 — 포석
        ctx.fillStyle = d === D_LANDMARK ? '#2c2a27' : n < 8 ? '#393a38' : '#363735';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, py + 16.5); ctx.lineTo(px + TILE, py + 16.5);
        ctx.moveTo(px, py + 32.5); ctx.lineTo(px + TILE, py + 32.5);
        ctx.moveTo(px + 24.5, py); ctx.lineTo(px + 24.5, py + 16);
        ctx.moveTo(px + 12.5, py + 16); ctx.lineTo(px + 12.5, py + 32);
        ctx.moveTo(px + 36.5, py + 32); ctx.lineTo(px + 36.5, py + 48);
        ctx.stroke();
        const PT = GROUND_TINT[w.theme.key]; if (PT) { ctx.fillStyle = PT[2]; ctx.fillRect(px, py, TILE, TILE); }
      } else if (d === D_SIDEWALK) {
        side.rect(px, py, TILE, TILE);
        detail.push(i, x, y, 1);
      } else {
        road.rect(px, py, TILE, TILE);
        detail.push(i, x, y, 0);
      }
    }
  }
  // 차도 · 보도 — 결 무늬로 한 번씩만 칠한다. 칸마다 무늬와 단색을 번갈아 고르면 그때마다 무늬를 새로 준비해
  // 프레임이 크게 떨어진다(쓰레기 조각을 칸마다 그리던 판: 58 → 40fps)
  ctx.imageSmoothingEnabled = false;
  const tex = texOn();
  const st = w.theme.street;
  ctx.fillStyle = tex ? bakedPattern(st ? 'road_' + st : 'road') : ({ sand: '#6e5634', dirt: '#33281c', stone: '#3a3936', snow: '#8a929c', mars: '#4a1e10' })[st] || '#28292c'; ctx.fill(road);
  ctx.fillStyle = tex ? bakedPattern('side') : '#35362f'; ctx.fill(side);
  ctx.imageSmoothingEnabled = true;
  // 지역의 땅빛 — 모래 도시는 모래가 덮고, 눈 도시는 눈이 덮는다
  const GT = GROUND_TINT[w.theme.key];
  if (GT) { ctx.fillStyle = GT[0]; ctx.fill(road); ctx.fillStyle = GT[1]; ctx.fill(side); }
  // 그 위의 표시 — 색마다 한 경로로 모아 한 번씩
  const P = () => new Path2D();
  const curb = P(), shadow = P(), yellow = P(), zebra = P(), park = P(), hole = P(), holeTop = P(), trash = P();
  const ao1 = P(), ao2 = P(), ao3 = P();
  const bld = (x, y) => w.deco[w.idx(x, y)] === D_BUILDING;
  // 벽 밑의 그늘(앰비언트 오클루전) — 건물에 맞닿은 바닥이 벽 쪽으로 갈수록 어두워진다. 세 겹의 띠
  const ao = (x, y, px, py) => {
    if (bld(x, y - 1)) { ao1.rect(px, py, TILE, 5); ao2.rect(px, py + 5, TILE, 7); ao3.rect(px, py + 12, TILE, 10); }
    if (bld(x - 1, y)) { ao1.rect(px, py, 4, TILE); ao2.rect(px + 4, py, 5, TILE); }
    if (bld(x + 1, y)) { ao1.rect(px + TILE - 4, py, 4, TILE); ao2.rect(px + TILE - 9, py, 5, TILE); }
  };
  const sw = (x, y) => w.deco[w.idx(x, y)] === D_SIDEWALK;
  const rd = (x, y) => { const j = w.idx(x, y); return w.grid[j] === T_ROAD && (w.deco[j] === D_ASPHALT || w.deco[j] === D_PROP || w.deco[j] === D_RUBBLE); };
  for (let k = 0; k < detail.length; k += 4) {
    const i = detail[k], x = detail[k + 1], y = detail[k + 2], px = x * TILE, py = y * TILE;
    const h2 = ((x * 2654435761) ^ (y * 40503)) >>> 0;
    ao(x, y, px, py);
    if (detail[k + 3] === 1) {
      // 보도 가장자리 — 차도 쪽은 높은 연석
      if (rd(x, y + 1)) curb.rect(px, py + TILE - 4, TILE, 4);
      if (rd(x, y - 1)) curb.rect(px, py, TILE, 2.5);
      if (rd(x - 1, y)) curb.rect(px, py, 3, TILE);
      if (rd(x + 1, y)) curb.rect(px + TILE - 3, py, 3, TILE);
      if (h2 % 7 === 0) litter(trash, px, py, h2);
      continue;
    }
    if (sw(x, y - 1)) shadow.rect(px, py, TILE, 6);                       // 연석 그늘
    if (sw(x - 1, y)) shadow.rect(px, py, 4, TILE);
    const m = w.mark[i];                                                  // 중앙선 — 대로의 노란 겹선
    if (m === 1 && (y & 1) === 0) { yellow.rect(px - 3, py + 6, 2, TILE - 12); yellow.rect(px + 1, py + 6, 2, TILE - 12); }
    else if (m === 2 && (x & 1) === 0) { yellow.rect(px + 6, py - 3, TILE - 12, 2); yellow.rect(px + 6, py + 1, TILE - 12, 2); }
    const cw = w.cross[i];                                                // 횡단보도
    if (cw) for (let q = 0; q < 4; q++) {
      if (cw === 1) zebra.rect(px + 4 + q * 11, py + 6, 6, TILE - 12);
      else zebra.rect(px + 6, py + 4 + q * 11, TILE - 12, 6);
    }
    const dm = w.dirm[i];
    if (!cw && !m && dm && dm !== 3) {
      if (((x >> 2) + (y >> 2)) % 3 === 0) {                              // 길가 주차선
        if (dm === 2 && sw(x, y - 1)) park.rect(px + 2, py + 4, 2, 20);
        else if (dm === 2 && sw(x, y + 1)) park.rect(px + 2, py + TILE - 24, 2, 20);
        else if (dm === 1 && sw(x - 1, y)) park.rect(px + 4, py + 2, 20, 2);
        else if (dm === 1 && sw(x + 1, y)) park.rect(px + TILE - 24, py + 2, 20, 2);
      }
      if (h2 % 41 === 3) {                                                // 맨홀
        const mx = px + 14 + (h2 >> 8) % 20, my = py + 14 + (h2 >> 12) % 20;
        hole.moveTo(mx + 9, my); hole.arc(mx, my, 9, 0, 6.283);
        holeTop.moveTo(mx + 7.5, my); holeTop.arc(mx, my, 7.5, 0, 6.283);
      }
    }
    if (h2 % 5 === 0) litter(trash, px, py, h2);
  }
  ctx.fillStyle = 'rgba(0,0,0,.30)'; ctx.fill(ao1);
  ctx.fillStyle = 'rgba(0,0,0,.17)'; ctx.fill(ao2);
  ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fill(ao3);
  ctx.fillStyle = 'rgba(205,200,180,.20)'; ctx.fill(curb);
  ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.fill(shadow);
  ctx.fillStyle = 'rgba(214,180,70,.32)'; ctx.fill(yellow);
  ctx.fillStyle = 'rgba(230,228,218,.28)'; ctx.fill(zebra);
  ctx.fillStyle = 'rgba(222,220,206,.24)'; ctx.fill(park);
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fill(hole);
  ctx.fillStyle = '#2b2a28'; ctx.fill(holeTop);
  ctx.fillStyle = 'rgba(110,106,94,.28)'; ctx.fill(trash);                // 칙칙한 종이 — 밝으면 보급품처럼 보였다

  if (terrT.length) drawTerrain(terrT, G.time);
  if (w.craters) drawCraters(cam, w);
  /* 젖은 웅덩이 */
  ctx.fillStyle = 'rgba(130,165,200,.09)';
  for (const q of G.puddles) {
    if (q.x < cam.x - 60 || q.x > cam.x + W + 60 || q.y < cam.y - 60 || q.y > cam.y + VH() + 60) continue;
    ctx.beginPath(); ctx.ellipse(q.x, q.y, q.rx, q.ry, 0, 0, 6.283); ctx.fill();
  }
  drawLandmarksGround(cam, w);
}

/** 핏자국 그림 — 가운데 고인 검붉은 웅덩이, 맞은 방향(+x)으로 길게 튄 줄기와 방울. 몇 장만 만들어 돌려 찍는다 */
const SPLATS = 6, splatImgs = [];
function splatImg(k) {
  if (k < 0) {                                       // 그을음
    if (splatImgs.scorch) return splatImgs.scorch;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(8,8,8,.95)'); g.addColorStop(0.5, 'rgba(14,12,10,.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = 2;
    for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283 + Math.random() * 0.3; x.beginPath(); x.moveTo(64 + Math.cos(a) * 20, 64 + Math.sin(a) * 20); x.lineTo(64 + Math.cos(a) * (44 + Math.random() * 18), 64 + Math.sin(a) * (44 + Math.random() * 18)); x.stroke(); }
    return (splatImgs.scorch = c);
  }
  if (splatImgs[k]) return splatImgs[k];
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  let seed = 101 + k * 37; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const cx = 52, cy = 64;
  const blob = (bx, by, r, col) => {
    x.fillStyle = col; x.beginPath();
    for (let i = 0; i <= 14; i++) { const a = i / 14 * 6.283, rr = r * (0.7 + rnd() * 0.5); i ? x.lineTo(bx + Math.cos(a) * rr, by + Math.sin(a) * rr) : x.moveTo(bx + Math.cos(a) * rr, by + Math.sin(a) * rr); }
    x.closePath(); x.fill();
  };
  blob(cx, cy, 26, '#2a0504');
  for (let i = 0; i < 5; i++) blob(cx + (rnd() - 0.4) * 30, cy + (rnd() - 0.5) * 30, 8 + rnd() * 12, '#330605');
  blob(cx - 2, cy, 15, '#1c0303');
  // 튄 줄기
  x.strokeStyle = '#2e0504'; x.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = (rnd() - 0.5) * 1.3, len = 26 + rnd() * 38;
    x.lineWidth = 1.5 + rnd() * 3.5;
    x.beginPath(); x.moveTo(cx + Math.cos(a) * 18, cy + Math.sin(a) * 18); x.lineTo(cx + Math.cos(a) * (18 + len), cy + Math.sin(a) * (18 + len)); x.stroke();
    x.fillStyle = '#2e0504'; x.beginPath(); x.arc(cx + Math.cos(a) * (20 + len), cy + Math.sin(a) * (20 + len), 1.5 + rnd() * 3, 0, 6.283); x.fill();
  }
  for (let i = 0; i < 26; i++) {
    const a = (rnd() - 0.5) * 2.4, d = 22 + rnd() * 40;
    x.fillStyle = rnd() < 0.5 ? '#3a0706' : '#220403';
    x.beginPath(); x.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0.8 + rnd() * 2.4, 0, 6.283); x.fill();
  }
  // 젖은 윤기 — 손전등에 비치면 반짝인다
  x.fillStyle = 'rgba(160,40,30,.25)'; x.beginPath(); x.ellipse(cx - 6, cy - 6, 8, 4, -0.4, 0, 6.283); x.fill();
  return (splatImgs[k] = c);
}

/** 차도 — 덧씌운 자국 · 금 · 기름 얼룩 · 골재 알갱이 (288×288) */
function drawRoad(x) {
  const S = 288;
  let seed = 31; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  x.fillStyle = '#26282b'; x.fillRect(0, 0, S, S);
  // 얼룩덜룩한 덧씌우기 — 큰 사각 땜질과 둥근 얼룩
  for (let i = 0; i < 7; i++) { x.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,.018)' : 'rgba(0,0,0,.06)'; x.fillRect(rnd() * S, rnd() * S, 30 + rnd() * 70, 20 + rnd() * 60); }
  for (let i = 0; i < 26; i++) { x.fillStyle = rnd() < 0.4 ? 'rgba(255,255,255,.015)' : 'rgba(0,0,0,.045)'; x.beginPath(); x.ellipse(rnd() * S, rnd() * S, 8 + rnd() * 26, 5 + rnd() * 16, rnd() * 3, 0, 6.283); x.fill(); }
  // 골재 알갱이
  for (let i = 0; i < 2200; i++) { x.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.12)'; x.fillRect(rnd() * S, rnd() * S, 1, 1); }
  // 금 — 꺾인 가는 선
  x.strokeStyle = 'rgba(0,0,0,.3)'; x.lineWidth = 0.8;
  for (let i = 0; i < 6; i++) {
    let cx = rnd() * S, cy = rnd() * S, a = rnd() * 6.28;
    x.beginPath(); x.moveTo(cx, cy);
    for (let j = 0; j < 6; j++) { a += (rnd() - 0.5) * 1.3; cx += Math.cos(a) * (5 + rnd() * 9); cy += Math.sin(a) * (5 + rnd() * 9); x.lineTo(cx, cy); }
    x.stroke();
  }
  // 기름 얼룩
  for (let i = 0; i < 4; i++) { x.fillStyle = 'rgba(8,8,10,.22)'; x.beginPath(); x.ellipse(rnd() * S, rnd() * S, 6 + rnd() * 10, 4 + rnd() * 6, rnd() * 3, 0, 6.283); x.fill(); }
}
/** 보도 — 올리브빛 콘크리트 판석 (96×96) */
function drawSide(x) {
  const S = 96;
  let seed = 97; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  x.fillStyle = '#35362f'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {     // 판석마다 조금씩 다른 색
    const v = rnd(); x.fillStyle = v < 0.35 ? 'rgba(0,0,0,.08)' : v < 0.6 ? 'rgba(255,250,220,.03)' : 'rgba(0,0,0,0)';
    x.fillRect(i * 24, j * 24, 24, 24);
  }
  for (let i = 0; i < 700; i++) { x.fillStyle = rnd() < 0.5 ? 'rgba(255,255,240,.05)' : 'rgba(0,0,0,.1)'; x.fillRect(rnd() * S, rnd() * S, 1, 1); }
  for (let i = 0; i < 5; i++) { x.fillStyle = 'rgba(0,0,0,.08)'; x.beginPath(); x.ellipse(rnd() * S, rnd() * S, 5 + rnd() * 12, 3 + rnd() * 8, rnd() * 3, 0, 6.283); x.fill(); }
  x.fillStyle = 'rgba(0,0,0,.3)';
  for (let k2 = 0; k2 < S; k2 += 24) { x.fillRect(0, k2, S, 1); x.fillRect(k2, 0, 1, S); }
  x.fillStyle = 'rgba(255,255,240,.04)';
  for (let k2 = 0; k2 < S; k2 += 24) { x.fillRect(0, k2 + 1, S, 1); x.fillRect(k2 + 1, 0, 1, S); }
}
/** 길에 버려진 것 — 종이 · 전단 · 비닐. 칸의 해시로 자리와 모양을 정한다(매 프레임 같다). 한 경로에 모아 한 번에 칠한다 */
function litter(path, px, py, h) {
  const m = 1 + h % 3;
  for (let k = 0; k < m; k++) {
    const q = (h >>> (k * 6 + 3)) & 63, lx = px + 6 + (q & 7) * 4.6, ly = py + 6 + (q >> 3) * 4.6;
    const sz = 3 + ((h >>> (k * 3)) & 3);
    path.moveTo(lx, ly); path.lineTo(lx + sz, ly + 1); path.lineTo(lx + sz - 1, ly + sz * 0.8); path.lineTo(lx - 1, ly + sz * 0.7); path.closePath();
  }
}

/* ═══════════ 도시의 불빛 ═══════════
   정전된 도시에도 남은 불빛이 있다 — 비상 전원으로 깜빡이는 간판, 자판기, 등롱, 철탑 항공등,
   발전기가 돌아가는 야시장. 가산 합성이라 어둠 위에 떠 길잡이가 된다(적은 드러내지 않는다). */
function drawCityLights(cam, g, w) {
  const E = eyeOf(cam), t = g.time;
  const vis = (x, y, m) => !(x < cam.x - m || x > cam.x + W + m || y < cam.y - m || y > cam.y + VH() + m);
  const glow = (x, y, r, col, a) => {
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col.replace('A', a)); gr.addColorStop(1, col.replace('A', 0));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
  };
  // 간판 — 건물 벽면 중간 높이에 글자가 빛난다. 셋 중 하나는 꺼져 있고, 몇은 깜빡인다
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const sg of w.signs) {
    const bx = sg.x * TILE, by = sg.y * TILE;
    if (!vis(bx, by, 80)) continue;
    const dead = (sg.ph * 10 | 0) % 3 === 0;
    if (dead) continue;
    const flick = (sg.ph * 7 | 0) % 4 === 0 ? (Math.sin(t * 23 + sg.ph * 9) > 0.3 ? 1 : 0.15) : 0.85 + Math.sin(t * 2 + sg.ph) * 0.15;
    if (sg.side !== 's') continue;               // 기운 카메라에서 보이는 것은 남쪽 벽면의 간판뿐
    const [cx, cy] = liftPt(E, bx + TILE / 2, by + TILE, 0.07);
    glow(cx, cy, 34, hexA(sg.col), 0.16 * flick);
    ctx.globalAlpha = 0.75 * flick;
    ctx.fillStyle = sg.col;
    ctx.font = `600 ${sg.text.length > 4 ? 10 : 12}px ${CANVAS_FONT}`;
    ctx.fillText(sg.text, cx, cy);
    ctx.globalAlpha = 1;
  }
  // 자판기 · 노점 수레 · 신당
  for (const d of w.decor) {
    if (!vis(d.x, d.y, 60)) continue;
    if (d.kind === 'vending') glow(d.x + (d.wall === 'w' ? -16 : d.wall === 'e' ? 16 : 0), d.y + (d.wall === 'n' ? -16 : 0), 46, 'rgba(210,235,255,A)', 0.22);
    else if (d.kind === 'shrine') glow(d.x, d.y - 8, 26, 'rgba(255,190,90,A)', 0.2 + Math.sin(t * 3 + d.x) * 0.05);
  }
  // 용암 균열 — 어둠 속에서 스스로 빛나 경고가 된다
  if (w.terrain === 'lava') {
    const x0 = Math.floor(cam.x / TILE) - 1, y0 = Math.floor(cam.y / TILE) - 1, x1 = x0 + Math.ceil(W / TILE) + 2, y1 = y0 + Math.ceil(VH() / TILE) + 2;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (w.terr[w.idx(x, y)] === 4) glow((x + 0.5) * TILE, (y + 0.5) * TILE, 46, 'rgba(255,90,20,A)', 0.2 + Math.sin(t * 2 + x * 1.7 + y) * 0.05);
  }
  // 랜드마크의 불빛
  for (const lm of w.landmarks) {
    if (!lmVisible(cam, lm, 400)) continue;
    ctx.save(); ctx.translate(lm.ox || 0, lm.oy || 0);
    if (lm.beacon && Math.sin(t * 3.1 + lm.x) > 0.2) glow(lm.beacon[0], lm.beacon[1], 30, 'rgba(255,40,30,A)', 0.7);
    if (lm.lantern) glow(lm.lantern[0], lm.lantern[1], 70, 'rgba(255,90,50,A)', 0.28);
    if (lm.bulbs) for (const [x, y] of lm.bulbs) glow(x, y, 14, 'rgba(255,200,120,A)', 0.45 + Math.sin(t * 5 + x) * 0.08);
    if (lm.flood) { glow(lm.flood[0], lm.flood[1], 26, 'rgba(255,250,230,A)', 0.8); glow(lm.floodAt[0], lm.floodAt[1], 170, 'rgba(230,235,240,A)', 0.16); }
    if (lm.signGlow) { const f = Math.sin(t * 17 + lm.x) > -0.85 ? 1 : 0.2; glow(lm.signGlow[0], lm.signGlow[1], 40, 'rgba(230,90,70,A)', 0.35 * f); }
    if (lm.kind === 'scramble') {
      // 꺼지지 않은 대형 전광판 — 지직거리는 잡음 화면
      const corners = [[lm.x - 1, lm.y - 1], [lm.x + lm.w, lm.y - 1], [lm.x - 1, lm.y + lm.h], [lm.x + lm.w, lm.y + lm.h]];
      corners.forEach(([x, y], i) => {
        if (w.at(x, y) !== T_WALL) return;
        const p = liftPt(E, (x + 0.5) * TILE, (y + 0.5) * TILE, 0.13);
        const hue = (i * 90 + t * 20) % 360;
        ctx.fillStyle = `hsla(${hue},60%,55%,${0.12 + Math.random() * 0.1})`;
        ctx.fillRect(p[0] - 30, p[1] - 18, 60, 36);
        for (let k = 0; k < 6; k++) { ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`; ctx.fillRect(p[0] - 30, p[1] - 18 + Math.random() * 36, 60, 2); }
      });
    }
    ctx.restore();
  }
}
/** '#rrggbb' → 'rgba(r,g,b,A)' (A 자리에 투명도를 끼워 넣는다) */
function hexA(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},A)`;
}

/* ═══════════ 랜드마크 ═══════════
   ground: 바닥에 깔리는 것(엔티티 아래) · top: 높이가 있는 것(엔티티 위, 시점 기준으로 들어 올림).
   높이는 liftPt 의 k 로 — 건물(0.15)보다 높은 탑은 k 를 크게 준다. */
const tc = v => (v + 0.5) * TILE;          // 칸 중심 좌표
function lmVisible(cam, lm, m = 600) {
  const x = lm.x * TILE + (lm.ox || 0), y = lm.y * TILE + (lm.oy || 0);
  return !(x + lm.w * TILE < cam.x - m || x > cam.x + W + m || y + lm.h * TILE < cam.y - m || y > cam.y + VH() + m);
}
/** 바닥 사각형(타일 단위)을 높이 k 로 들어 올린 네 꼭짓점 */
function liftRect(E, x, y, w, h, k, inset = 0) {
  const X0 = x * TILE + inset, Y0 = y * TILE + inset, X1 = (x + w) * TILE - inset, Y1 = (y + h) * TILE - inset;
  return [liftPt(E, X0, Y0, k), liftPt(E, X1, Y0, k), liftPt(E, X1, Y1, k), liftPt(E, X0, Y1, k)];
}
function polyFill(pts, col) {
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath(); ctx.fill();
}
/** 기와지붕 — 처마가 살짝 들린 우진각. 바닥 사각형 위 k0(처마) → k1(용마루). 면마다 명암을 달리한다 */
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = v => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}
function hipRoof(E, x, y, w, h, k0, k1, col, ridgeCol, eave = 10) {
  const b = liftRect(E, x, y, w, h, k0, -eave);
  const along = w >= h;
  const inset = Math.min(w, h) / 2;
  const r0 = along ? liftPt(E, (x + inset) * TILE, (y + h / 2) * TILE, k1) : liftPt(E, (x + w / 2) * TILE, (y + inset) * TILE, k1);
  const r1 = along ? liftPt(E, (x + w - inset) * TILE, (y + h / 2) * TILE, k1) : liftPt(E, (x + w / 2) * TILE, (y + h - inset) * TILE, k1);
  const faces = along
    ? [[[b[0], b[1], r1, r0], 1.05], [[b[1], b[2], r1], 0.85], [[b[2], b[3], r0, r1], 0.75], [[b[3], b[0], r0], 0.95]]
    : [[[b[0], b[1], r0], 1.05], [[b[1], b[2], r1, r0], 0.85], [[b[2], b[3], r1], 0.75], [[b[3], b[0], r0, r1], 0.95]];
  for (const [pts, f] of faces) polyFill(pts, shade(col, f));
  ctx.strokeStyle = ridgeCol; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(r0[0], r0[1]); ctx.lineTo(r1[0], r1[1]);
  const hips = along ? [[b[0], r0], [b[3], r0], [b[1], r1], [b[2], r1]] : [[b[0], r0], [b[1], r0], [b[2], r1], [b[3], r1]];
  for (const [p, q] of hips) { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 2;               // 처마 끝선
  ctx.beginPath(); ctx.moveTo(b[0][0], b[0][1]);
  for (let i = 1; i <= 4; i++) ctx.lineTo(b[i % 4][0], b[i % 4][1]);
  ctx.stroke();
}
/** 벽 기둥 — 바닥 사각형을 k 까지 세운 상자 (보이는 옆면 + 윗면) */
function liftBox(E, x, y, w, h, k, side, top) {
  const b = liftRect(E, x, y, w, h, 0), t = liftRect(E, x, y, w, h, k);
  for (let i = 0; i < 4; i++) polyFill([b[i], b[(i + 1) % 4], t[(i + 1) % 4], t[i]], side);
  polyFill(t, top);
}

/** 공중에 뜬 상자 — 높이 k0 에서 k1 까지 (쌓인 컨테이너의 윗단) */
function liftBoxK(E, x, y, w, h, k0, k1, side, top) {
  const b = liftRect(E, x, y, w, h, k0), t = liftRect(E, x, y, w, h, k1);
  for (let i = 0; i < 4; i++) polyFill([b[i], b[(i + 1) % 4], t[(i + 1) % 4], t[i]], side);
  polyFill(t, top);
}

function drawLandmarksGround(cam, w) {
  for (const lm of w.landmarks) {
    if (!lmVisible(cam, lm)) continue;
    ctx.save(); ctx.translate(lm.ox || 0, lm.oy || 0);     // 이어 붙은 복사본 자리로
    if (lm.kind === 'palace') {
      // 정문에서 정전까지 박석 길
      ctx.fillStyle = '#45464a';
      ctx.fillRect((lm.gate.x + 1) * TILE + 8, (lm.hall.y + lm.hall.h) * TILE, 3 * TILE - 16, (lm.gate.y - lm.hall.y - lm.hall.h) * TILE);
    } else if (lm.kind === 'copacabana') {
      // 검고 흰 파도 무늬 돌길 — 해변 산책로
      const wk = lm.walk, X0 = wk.x * TILE, Y0 = wk.y * TILE, X1 = (wk.x + wk.w) * TILE, Y1 = (wk.y + wk.h) * TILE;
      ctx.fillStyle = '#d8d4c8'; ctx.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
      ctx.strokeStyle = '#26282a'; ctx.lineWidth = 7;
      for (let yy = Y0 + 10; yy < Y1; yy += 22) {
        ctx.beginPath();
        for (let xx = X0; xx <= X1; xx += 6) { const v = yy + Math.sin((xx - X0) / 26) * 7; xx === X0 ? ctx.moveTo(xx, v) : ctx.lineTo(xx, v); }
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(214,190,140,.55)'; ctx.fillRect(X0, Y1, X1 - X0, 2 * TILE);              // 모래사장
    } else if (lm.kind === 'redeemer') {
      // 바위 언덕 — 등고선
      const h = lm.hill, cx = (h.x + h.w / 2) * TILE, cy = (h.y + h.h / 2) * TILE;
      for (let r = 4; r >= 1; r--) {
        ctx.fillStyle = `rgba(${52 + r * 4},${64 + r * 4},${44 + r * 3},${0.22 + (4 - r) * 0.06})`;
        ctx.beginPath(); ctx.ellipse(cx, cy, (h.w / 2 + r * 0.6) * TILE, (h.h / 2 + r * 0.6) * TILE, 0, 0, 6.283); ctx.fill();
      }
    } else if (lm.kind === 'tower') {
      // 언덕 등고선
      for (let r = 5; r >= 2; r--) {
        ctx.fillStyle = `rgba(${40 + r * 2},${58 + r * 3},${38 + r * 2},${0.18 + (5 - r) * 0.05})`;
        ctx.beginPath(); ctx.arc(lm.cx * TILE, lm.cy * TILE, r * TILE, 0, 6.283); ctx.fill();
      }
    } else if (lm.kind === 'scramble') {
      // 사방 · 대각선 횡단보도
      const X0 = lm.x * TILE, Y0 = lm.y * TILE, X1 = (lm.x + lm.w) * TILE, Y1 = (lm.y + lm.h) * TILE;
      ctx.fillStyle = 'rgba(232,230,220,.30)';
      for (let x = X0 + 10; x < X1 - 10; x += 14) { ctx.fillRect(x, Y0 + 6, 7, 34); ctx.fillRect(x, Y1 - 40, 7, 34); }
      for (let y = Y0 + 10; y < Y1 - 10; y += 14) { ctx.fillRect(X0 + 6, y, 34, 7); ctx.fillRect(X1 - 40, y, 34, 7); }
      for (const [ax, ay, bx, by] of [[X0, Y0, X1, Y1], [X1, Y0, X0, Y1]]) {
        const len = Math.hypot(bx - ax, by - ay), a = Math.atan2(by - ay, bx - ax);
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(a);
        for (let t = 50; t < len - 50; t += 14) ctx.fillRect(t, -17, 7, 34);
        ctx.restore();
      }
    } else if (lm.kind === 'lattice') {
      ctx.fillStyle = '#3b3533';
      ctx.fillRect((lm.x + 3) * TILE, (lm.y + 3) * TILE, 3 * TILE, 3 * TILE);
    } else if (lm.kind === 'temple') {
      ctx.fillStyle = '#3e3f42';
      ctx.fillRect((lm.x + 4) * TILE + 6, (lm.y + 4) * TILE, TILE * 3 - 12, (lm.h - 4) * TILE);
    } else if (lm.kind === 'prang') {
      for (let r = 4; r >= 2; r--) {
        ctx.fillStyle = r % 2 ? '#4a4844' : '#55524c';
        ctx.fillRect((lm.cx - r) * TILE, (lm.cy - r) * TILE, r * 2 * TILE, r * 2 * TILE);
      }
    } else if (lm.kind === 'monument') {
      ctx.strokeStyle = 'rgba(220,210,170,.25)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(lm.cx * TILE, lm.cy * TILE, 2.4 * TILE, 0, 6.283); ctx.stroke();
      ctx.fillStyle = '#2e3a2c';
      ctx.beginPath(); ctx.arc(lm.cx * TILE, lm.cy * TILE, 1.5 * TILE, 0, 6.283); ctx.fill();
    } else if (lm.kind === 'market') {
      ctx.fillStyle = 'rgba(120,60,40,.18)';
      ctx.fillRect(lm.x * TILE, lm.y * TILE, lm.w * TILE, lm.h * TILE);
    } else if (lm.kind === 'checkpoint') {
      // 출입구로 이어지는 바퀴 자국과 흰 정지선
      ctx.fillStyle = 'rgba(0,0,0,.18)';
      ctx.fillRect((lm.x + 4) * TILE + 6, (lm.y + 5) * TILE, 10, 4 * TILE); ctx.fillRect((lm.x + 6) * TILE + 30, (lm.y + 5) * TILE, 10, 4 * TILE);
      ctx.fillStyle = 'rgba(230,230,220,.35)'; ctx.fillRect((lm.x + 4) * TILE, (lm.y + 8) * TILE + 4, 3 * TILE, 5);
    } else if (lm.kind === 'base') {
      // 헬기장 — 노란 원과 H, 정문으로 이어지는 바퀴 자국
      const [px, py] = [lm.pad[0] * TILE, lm.pad[1] * TILE];
      ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.fillRect((lm.x + 5) * TILE + 8, (lm.y + 8) * TILE, 12, 3 * TILE); ctx.fillRect((lm.x + 7) * TILE + 28, (lm.y + 8) * TILE, 12, 3 * TILE);
      ctx.strokeStyle = 'rgba(214,184,70,.42)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(px, py, 58, 0, 6.283); ctx.stroke();
      ctx.fillStyle = 'rgba(230,228,215,.38)';
      ctx.fillRect(px - 20, py - 24, 9, 48); ctx.fillRect(px + 11, py - 24, 9, 48); ctx.fillRect(px - 11, py - 4, 22, 8);
      ctx.fillStyle = 'rgba(230,230,220,.3)'; ctx.fillRect((lm.x + 4) * TILE, (lm.y + 10) * TILE + 6, 5 * TILE, 5);   // 정지선
    } else if (lm.kind === 'railyard') {
      // 자갈 바닥 · 침목 · 두 줄 레일 (블록 끝까지)
      ctx.fillStyle = 'rgba(70,64,58,.55)'; ctx.fillRect(lm.x * TILE, lm.y * TILE, lm.w * TILE, lm.h * TILE);
      for (const ty of lm.tracks) {
        const cy = (ty + 0.5) * TILE;
        ctx.fillStyle = '#3a2e24';
        for (let x = lm.x * TILE + 4; x < (lm.x + lm.w) * TILE; x += 14) ctx.fillRect(x, cy - 17, 7, 34);
        ctx.fillStyle = '#8a8f94';
        ctx.fillRect(lm.x * TILE, cy - 11, lm.w * TILE, 3); ctx.fillRect(lm.x * TILE, cy + 8, lm.w * TILE, 3);
      }
    } else if (lm.kind === 'gas') {
      ctx.fillStyle = 'rgba(160,160,150,.10)'; ctx.fillRect(lm.x * TILE, lm.y * TILE, lm.w * TILE, lm.h * TILE);
      ctx.fillStyle = 'rgba(30,20,10,.35)';
      for (const [x, y] of lm.pumps) { ctx.beginPath(); ctx.ellipse((x + 0.5) * TILE + 14, (y + 0.5) * TILE + 6, 16, 9, 0, 0, 6.283); ctx.fill(); }   // 기름 얼룩
    } else if (lm.kind === 'hawker') {
      // 물청소 자국이 남은 타일 바닥과 배수로
      ctx.fillStyle = 'rgba(150,160,150,.10)';
      ctx.fillRect(lm.x * TILE, lm.y * TILE, lm.w * TILE, lm.h * TILE);
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = lm.x; x <= lm.x + lm.w; x++) { ctx.moveTo(x * TILE, lm.y * TILE); ctx.lineTo(x * TILE, (lm.y + lm.h) * TILE); }
      for (let y = lm.y; y <= lm.y + lm.h; y++) { ctx.moveTo(lm.x * TILE, y * TILE); ctx.lineTo((lm.x + lm.w) * TILE, y * TILE); }
      ctx.stroke();
      ctx.fillStyle = '#1b1e20'; ctx.fillRect(lm.x * TILE, (lm.y + 1) * TILE + 2, lm.w * TILE, 5);
    } else if (lm.kind === 'grove') {
      // 나무 사이를 잇는 산책로
      ctx.strokeStyle = 'rgba(170,160,130,.22)'; ctx.lineWidth = 16; ctx.lineJoin = 'round';
      ctx.beginPath();
      lm.trees.forEach(([x, y], i) => i ? ctx.lineTo(x * TILE, y * TILE + 30) : ctx.moveTo(x * TILE, y * TILE + 30));
      ctx.stroke();
    } else if (lm.kind === 'port') {
      // 선체 밑은 바다, 안벽 끝에는 노란 경고선과 계선주
      const h = lm.hull;
      ctx.fillStyle = '#0c1922'; ctx.fillRect(h.x * TILE - 6, h.y * TILE, h.w * TILE + 12, h.h * TILE + 4);
      ctx.fillStyle = '#c9a227'; ctx.fillRect(lm.x * TILE, (lm.y + 4) * TILE, lm.w * TILE, 4);
      ctx.fillStyle = '#222';
      for (let x = lm.x + 1; x < lm.x + lm.w; x += 3) { ctx.beginPath(); ctx.arc(x * TILE, (lm.y + 4) * TILE + 9, 4, 0, 6.283); ctx.fill(); }
      ctx.strokeStyle = 'rgba(220,200,90,.18)'; ctx.lineWidth = 3;
      ctx.beginPath();
      for (let y = lm.y + 5.5; y < lm.y + lm.h; y += 2) { ctx.moveTo(lm.x * TILE + 8, y * TILE); ctx.lineTo((lm.x + lm.w) * TILE - 8, y * TILE); }
      ctx.stroke();
    }
    ctx.restore();
  }
  // 나무 그루터기 (밑동) — 우거진 잎은 위층에서
  for (const d of w.decor) if (d.kind === 'tree') {
    if (d.x < cam.x - 60 || d.x > cam.x + W + 60 || d.y < cam.y - 60 || d.y > cam.y + VH() + 60) continue;
    ctx.fillStyle = '#2b2219'; ctx.beginPath(); ctx.arc(d.x, d.y, 6, 0, 6.283); ctx.fill();
  }
}

function drawLandmarksTop(cam, w, g) {
  const E = eyeOf(cam);
  // 나무 — 잎이 시야를 가린다 (그 아래 감염체도)
  for (const d of w.decor) if (d.kind === 'tree') {
    if (d.x < cam.x - 80 || d.x > cam.x + W + 80 || d.y < cam.y - 80 || d.y > cam.y + VH() + 80) continue;
    const [x, y] = liftPt(E, d.x, d.y, 0.1);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(d.x + 4, d.y + 5, d.r, 0, 6.283); ctx.fill();
    // 줄기 — 밑동에서 잎 덩어리까지
    ctx.strokeStyle = '#2b2219'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(x, y + d.r * 0.3); ctx.stroke();
    // 잎 — 덩어리 여럿, 아래쪽은 어둡고 위쪽에 빛
    const h = ((d.x * 31 + d.y * 17) | 0) >>> 0;
    ctx.fillStyle = '#18281a';
    ctx.beginPath(); ctx.arc(x, y + 2, d.r, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#1e3020';
    for (let k = 0; k < 5; k++) {
      const a = k * 1.257 + (h % 7), rr = d.r * (0.5 + ((h >> k) & 3) * 0.06);
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * d.r * 0.45, y + Math.sin(a) * d.r * 0.4 - 1, rr, 0, 6.283); ctx.fill();
    }
    ctx.fillStyle = '#26402a'; ctx.beginPath(); ctx.arc(x - d.r * 0.25, y - d.r * 0.3, d.r * 0.55, 0, 6.283); ctx.fill();
    ctx.fillStyle = 'rgba(120,160,110,.12)'; ctx.beginPath(); ctx.arc(x - d.r * 0.35, y - d.r * 0.42, d.r * 0.28, 0, 6.283); ctx.fill();
  }
  for (const lm of w.landmarks) {
    if (!lmVisible(cam, lm, 300)) continue;
    const L = LANDMARK_TOP[lm.kind];
    if (L) { ctx.save(); ctx.translate(lm.ox || 0, lm.oy || 0); L(lm, E, g, w); ctx.restore(); }
  }
}

/** 사각뿔 — 시점 반대쪽 면부터 칠해 앞면이 위로 온다. 양지 · 음지 두 색 */
function pyramidAt(E, x, y, s, k, lit, dark) {
  const b = liftRect(E, x, y, s, s, 0), ap = liftPt(E, (x + s / 2) * TILE, (y + s / 2) * TILE, k);
  const cx = (x + s / 2) * TILE, cy = (y + s / 2) * TILE;
  // 면: 북(0-1) 동(1-2) 남(2-3) 서(3-0) — 시점과 같은 쪽의 면이 앞
  const faces = [[0, 1, E.y < cy, '#000'], [1, 2, E.x > cx, dark], [2, 3, E.y > cy, lit], [3, 0, E.x < cx, shade(lit, 0.82)]];
  for (const front of [false, true]) for (const [i, j, f, col] of faces) if (f === front) polyFill([b[i], b[j], ap], col === '#000' ? shade(dark, 0.8) : col);
  return ap;
}
/** 둥근 돔 — 받침 고리 위에 반구를 겹쳐 그린다 */
function domeAt(E, cx, cy, r, k, col, hi) {
  const c = liftPt(E, cx * TILE, cy * TILE, k), R = r * TILE;
  ctx.fillStyle = shade(col, 0.6); ctx.beginPath(); ctx.ellipse(c[0], c[1] + R * 0.18, R, R * 0.5, 0, 0, 6.283); ctx.fill();
  ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(c[0], c[1], R, R * 0.92, 0, Math.PI, 0); ctx.ellipse(c[0], c[1], R, R * 0.4, 0, 0, Math.PI); ctx.fill();
  if (hi) { ctx.fillStyle = hi; ctx.beginPath(); ctx.ellipse(c[0] - R * 0.35, c[1] - R * 0.45, R * 0.3, R * 0.22, -0.5, 0, 6.283); ctx.fill(); }
  return liftPt(E, cx * TILE, cy * TILE, k + r * 0.11);
}
/** 가는 탑 — 바닥에서 높이 k 까지 굵은 선으로 세운다 */
function spireAt(E, cx, cy, k0, k1, wd, col) {
  const a = liftPt(E, cx * TILE, cy * TILE, k0), b = liftPt(E, cx * TILE, cy * TILE, k1);
  ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.lineCap = 'butt';
  return b;
}

const LANDMARK_TOP = {
  /* 기자의 피라미드 — 셋이 크기대로 늘어서고 앞에 웅크린 스핑크스 */
  pyramids(lm, E) {
    for (const [x, y, s] of lm.pyr.slice().sort((a, b) => a[1] - b[1])) {
      const ap = pyramidAt(E, x, y, s, s * 0.13, '#c9a46a', '#7d6038');
      if (s >= 5) lm.beacon = ap;
    }
    const sp = lm.sphinx;
    liftBox(E, sp.x, sp.y, 3, 1, 0.04, '#8a6c44', '#a8865a');           // 엎드린 몸
    liftBox(E, sp.x + 2.2, sp.y - 0.1, 0.8, 1.2, 0.08, '#8a6c44', '#b0905f'); // 머리
  },
  /* 사원 — 모래빛 기도실 위 큰 돔, 두 미나렛, 안마당 분수 */
  mosque(lm, E, g) {
    const h = lm.hall;
    liftBox(E, h.x, h.y, h.w, h.h, 0.1, '#a8885e', '#c2a272');
    for (let i = 0; i < 4; i++) { const p = liftRect(E, h.x + 0.5 + i * 1.7, h.y + h.h - 0.02, 1, 0.02, 0.07); ctx.fillStyle = '#2a2018'; ctx.beginPath(); ctx.ellipse((p[0][0] + p[1][0]) / 2, p[0][1] + 8, 9, 12, 0, Math.PI, 0); ctx.fill(); }
    domeAt(E, h.x + h.w / 2, h.y + h.h / 2, 1.6, 0.1, '#6c8a8a', 'rgba(220,240,240,.25)');
    domeAt(E, h.x + 1.2, h.y + h.h / 2, 0.7, 0.1, '#6c8a8a');
    domeAt(E, h.x + h.w - 1.2, h.y + h.h / 2, 0.7, 0.1, '#6c8a8a');
    for (const [x, y] of lm.minarets) {
      spireAt(E, x, y, 0, 0.42, 14, '#c2a272');
      spireAt(E, x, y, 0.3, 0.33, 22, '#8a6c44');                         // 발코니
      const top = spireAt(E, x, y, 0.42, 0.5, 8, '#6c8a8a');
      lm.beacon = top;
    }
    const f = liftPt(E, lm.fountain[0] * TILE, lm.fountain[1] * TILE, 0.02);
    ctx.fillStyle = '#7d6a4c'; ctx.beginPath(); ctx.ellipse(f[0], f[1], 26, 18, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#2c4a54'; ctx.beginPath(); ctx.ellipse(f[0], f[1], 19, 13, 0, 0, 6.283); ctx.fill();
  },
  /* 계단 연못 — 물가로 내려가는 층층의 돌계단, 네 귀의 작은 사당 */
  kund(lm, E, g) {
    const t = lm.tank;
    for (let i = 0; i < 3; i++) {
      const r = liftRect(E, t.x - 1 + i * 0.35, t.y - 1 + i * 0.35, t.w + 2 - i * 0.7, t.h + 2 - i * 0.7, 0);
      ctx.strokeStyle = i % 2 ? '#8a7258' : '#a48a6a'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(r[0][0], r[0][1]); for (let q = 1; q <= 4; q++) ctx.lineTo(r[q % 4][0], r[q % 4][1]); ctx.stroke();
    }
    // 물 위 꽃불(디야) — 떠다니며 흔들린다
    for (let i = 0; i < 7; i++) {
      const x = (t.x + 0.6 + ((i * 1.7 + g.time * 0.15) % (t.w - 1.2))) * TILE, y = (t.y + 0.8 + (i * 0.67 % (t.h - 1.6))) * TILE;
      ctx.fillStyle = 'rgba(255,170,60,.85)'; ctx.beginPath(); ctx.arc(x, y + Math.sin(g.time * 2 + i) * 2, 3, 0, 6.283); ctx.fill();
    }
    for (const [x, y] of lm.shrines) {
      liftBox(E, x - 0.5, y - 0.5, 1, 1, 0.07, '#a65a32', '#c06a3a');
      pyramidAt(E, x - 0.4, y - 0.4, 0.8, 0.12, '#d07a44', '#8a4424');
    }
  },
  /* 시카라 사원 — 옥수수 모양으로 층층이 좁아지는 첨탑, 앞의 회랑과 주황 깃발 */
  mandir(lm, E, g) {
    const h = lm.hall;
    liftBox(E, h.x, h.y, h.w, h.h, 0.07, '#b49470', '#c9aa82');
    hipRoof(E, h.x, h.y, h.w, h.h, 0.07, 0.1, '#a88a64', '#6a5038', 6);
    const s = lm.sanctum;
    liftBox(E, s.x, s.y, 3, 3, 0.08, '#b49470', '#c9aa82');
    for (let i = 0; i < 6; i++) {
      const in_ = 0.2 + i * 0.2;
      liftBoxK(E, s.x + in_, s.y + in_, 3 - 2 * in_, 3 - 2 * in_, 0.08 + i * 0.05, 0.12 + i * 0.05, i % 2 ? '#a8845c' : '#bf9c72', '#d0b088');
    }
    const top = spireAt(E, s.x + 1.5, s.y + 1.5, 0.38, 0.46, 6, '#d9a640');
    const fl = liftPt(E, (s.x + 1.5) * TILE + 14 + Math.sin(g.time * 3) * 3, (s.y + 1.5) * TILE, 0.45);
    polyFill([top, fl, liftPt(E, (s.x + 1.5) * TILE, (s.y + 1.5) * TILE, 0.43)], '#e8742a');
    lm.beacon = top;
    for (const [x, y] of lm.gate) spireAt(E, x, y, 0, 0.12, 12, '#a48464');
  },
  /* 산마르코 광장 — 다섯 돔의 대성당, 붉은 벽돌 종탑, 두 돌기둥 */
  piazza(lm, E) {
    const c = lm.church;
    liftBox(E, c.x, c.y, c.w, c.h, 0.1, '#b8a890', '#cbbba2');
    for (let i = 0; i < 5; i++) { const p = liftRect(E, c.x + 0.4 + i * 1.12, c.y + c.h - 0.02, 0.9, 0.02, 0.07); ctx.fillStyle = i === 2 ? '#c9a440' : '#3a3028'; ctx.beginPath(); ctx.ellipse((p[0][0] + p[1][0]) / 2, p[0][1] + 6, 12, 15, 0, Math.PI, 0); ctx.fill(); }
    for (const [dx, dy, r] of [[3, 2, 1.1], [1.3, 2, 0.75], [4.7, 2, 0.75], [3, 0.9, 0.75], [3, 3.2, 0.75]]) {
      const top = domeAt(E, c.x + dx, c.y + dy, r, 0.1, '#6e7a72', 'rgba(220,230,220,.2)');
      spireAt(E, c.x + dx, c.y + dy, 0.1 + r * 0.11, 0.12 + r * 0.13, 3, '#c9a440');
    }
    const t = lm.tower;
    liftBox(E, t.x, t.y, 2, 2, 0.5, '#8e3a2a', '#a8442f');
    liftBox(E, t.x + 0.15, t.y + 0.15, 1.7, 1.7, 0.58, '#d8d0c0', '#e0d8c8');      // 종루
    lm.beacon = pyramidAt(E, t.x + 0.15, t.y + 0.15, 1.7, 0.72, '#6e8a72', '#4a5e4e');
    for (const [x, y] of lm.cols) { spireAt(E, x, y, 0, 0.2, 12, '#d4ccbc'); spireAt(E, x, y, 0.2, 0.24, 16, '#8a8478'); }
  },
  /* 계단 교회 — 현무암 기둥처럼 양옆으로 계단 지며 오르는 흰 콘크리트 탑 */
  hallgrim(lm, E) {
    const b = lm.body;
    for (let i = 0; i < 4; i++) {
      const in_ = i * 0.55;
      liftBox(E, b.x + in_, b.y + 1, b.w - 2 * in_, b.h - 1, 0.1 + i * 0.06, '#c4c6c6', '#d6d8d8');
    }
    liftBox(E, b.x + 1.8, b.y, 1.4, 2, 0.58, '#b8baba', '#cfd1d1');               // 중앙 탑
    lm.beacon = pyramidAt(E, b.x + 1.8, b.y + 0.3, 1.4, 0.72, '#9aa0a2', '#6a7072');
    spireAt(E, lm.statue[0], lm.statue[1], 0, 0.08, 18, '#5a5e60');
    spireAt(E, lm.statue[0], lm.statue[1], 0.08, 0.15, 8, '#3e5250');
  },
  /* 바이오돔 — 유리 돔 안의 초록(테라포밍한 온실) */
  biodome(lm, E) {
    const d = lm.dome;
    liftBox(E, d.x, d.y, d.w, d.h, 0.04, '#8a9098', '#a8aeb4');
    const c = liftPt(E, (d.x + d.w / 2) * TILE, (d.y + d.h / 2) * TILE, 0.04), R = d.w / 2 * TILE;
    ctx.fillStyle = 'rgba(60,140,80,.85)'; ctx.beginPath(); ctx.ellipse(c[0], c[1], R * 0.92, R * 0.6, 0, 0, 6.283); ctx.fill();
    for (let i = 0; i < 9; i++) { const a = i * 2.4, rr = R * 0.6 * ((i * 37) % 10) / 10; ctx.fillStyle = i % 2 ? '#2f7a44' : '#4a9a5a'; ctx.beginPath(); ctx.arc(c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr * 0.6 - 6, 9, 0, 6.283); ctx.fill(); }
    lm.beacon = domeAt(E, d.x + d.w / 2, d.y + d.h / 2, d.w / 2, 0.04, 'rgba(170,220,240,.28)', 'rgba(255,255,255,.35)');
    ctx.strokeStyle = 'rgba(220,240,250,.45)'; ctx.lineWidth = 1.4;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(c[0] + i * R * 0.3, c[1], Math.max(2, R * (1 - Math.abs(i) * 0.3) * 0.25), R * 0.92, 0, Math.PI, 0); ctx.stroke(); }
  },
  /* 귀환 로켓 — 발사대 위에 선 흰 몸통과 주황 띠 */
  rocket(lm, E) {
    const [x, y] = lm.pad;
    liftBox(E, x - 1.5, y - 1.5, 3, 3, 0.03, '#4a4e54', '#5a5e64');
    spireAt(E, x, y, 0.03, 0.62, 22, '#e8e8e4');
    spireAt(E, x, y, 0.3, 0.36, 23, '#e8641a');
    lm.beacon = spireAt(E, x, y, 0.62, 0.74, 12, '#c8ccd0');
    for (const s of [-1, 1]) { const b = liftPt(E, (x + s * 0.5) * TILE, y * TILE, 0.03), t = liftPt(E, (x + s * 0.25) * TILE, y * TILE, 0.16); ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(t[0], t[1]); ctx.stroke(); }
    const [tx, ty] = lm.tank; spireAt(E, tx, ty, 0, 0.18, 26, '#c8ccd0');
  },
  /* 아야 소피아 — 붉은빛 석회 벽, 큰 돔과 반 돔, 네 귀의 연필 같은 첨탑 */
  hagia(lm, E) {
    const h = lm.hall;
    liftBox(E, h.x, h.y, h.w, h.h, 0.12, '#b47a62', '#c8907a');
    for (let i = 0; i < 5; i++) { const p = liftRect(E, h.x + 0.6 + i * 1.3, h.y + h.h - 0.02, 1, 0.02, 0.08); ctx.fillStyle = '#2a1a14'; ctx.beginPath(); ctx.ellipse((p[0][0] + p[1][0]) / 2, p[0][1] + 8, 8, 11, 0, Math.PI, 0); ctx.fill(); }
    domeAt(E, h.x + 1.6, h.y + h.h / 2, 1.1, 0.12, '#7a7e86');
    domeAt(E, h.x + h.w - 1.6, h.y + h.h / 2, 1.1, 0.12, '#7a7e86');
    lm.beacon = domeAt(E, h.x + h.w / 2, h.y + h.h / 2, 2.1, 0.14, '#868a92', 'rgba(230,236,244,.25)');
    for (const [x, y] of lm.minarets) {
      spireAt(E, x, y, 0, 0.5, 10, '#d0c8bc');
      spireAt(E, x, y, 0.36, 0.38, 16, '#8a8478');                       // 발코니
      spireAt(E, x, y, 0.5, 0.6, 6, '#6a6e76');
    }
    const f = liftPt(E, lm.fountain[0] * TILE, lm.fountain[1] * TILE, 0.02);
    ctx.fillStyle = '#8a8478'; ctx.beginPath(); ctx.ellipse(f[0], f[1], 22, 15, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#2c4a54'; ctx.beginPath(); ctx.ellipse(f[0], f[1], 15, 10, 0, 0, 6.283); ctx.fill();
  },
  /* 갈라타 탑 — 둥근 돌 몸통, 꼭대기 전망 고리, 원뿔 지붕 */
  galata(lm, E) {
    const [x, y] = lm.tower;
    for (let k = 0; k < 0.42; k += 0.02) { const c = liftPt(E, x * TILE, y * TILE, k); ctx.fillStyle = k > 0.36 ? '#d8cbb0' : shade('#a89a82', 0.85 + k * 0.4); ctx.beginPath(); ctx.ellipse(c[0], c[1], TILE * 1.25, TILE * 0.9, 0, 0, 6.283); ctx.fill(); }
    const top = liftPt(E, x * TILE, y * TILE, 0.42), ap = liftPt(E, x * TILE, y * TILE, 0.62);
    ctx.fillStyle = '#4a5a6a'; ctx.beginPath(); ctx.moveTo(top[0] - TILE * 1.3, top[1]); ctx.lineTo(ap[0], ap[1]); ctx.lineTo(top[0] + TILE * 1.3, top[1]); ctx.closePath(); ctx.fill();
    lm.beacon = ap;
  },
  /* 구세주상 — 바위 언덕 꼭대기에서 두 팔을 벌린 흰 조각 */
  redeemer(lm, E) {
    const hl = lm.hill;
    liftBox(E, hl.x + 0.4, hl.y + 0.4, hl.w - 0.8, hl.h - 0.8, 0.12, '#4e5a44', '#5e6a50');
    liftBox(E, hl.x + 1.2, hl.y + 1.2, hl.w - 2.4, hl.h - 2.4, 0.24, '#5a6450', '#6a7458');
    const [sx, sy] = lm.statue;
    liftBox(E, sx - 0.5, sy - 0.5, 1, 1, 0.3, '#a8a49a', '#c8c4ba');                    // 받침
    spireAt(E, sx, sy, 0.3, 0.5, 9, '#e8e4dc');                                          // 몸
    const arm = liftPt(E, sx * TILE, sy * TILE, 0.46);
    ctx.strokeStyle = '#e8e4dc'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(arm[0] - 34, arm[1]); ctx.lineTo(arm[0] + 34, arm[1]); ctx.stroke();
    lm.beacon = spireAt(E, sx, sy, 0.5, 0.54, 8, '#f0ece4');                            // 머리
  },
  /* 코파카바나 — 야자수와 해변 매점 */
  copacabana(lm, E) {
    for (const [x, y] of lm.kiosks) { liftBox(E, x - 0.5, y - 0.5, 1, 1, 0.07, '#e0b860', '#f0d080'); domeAt(E, x, y, 0.6, 0.08, '#2a8a6a'); }
    for (const [x, y] of lm.palms) {
      const t = spireAt(E, x, y, 0, 0.34, 4, '#7a5a3a');
      ctx.strokeStyle = '#2f6a3a'; ctx.lineWidth = 4;
      for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; ctx.beginPath(); ctx.moveTo(t[0], t[1]); ctx.quadraticCurveTo(t[0] + Math.cos(a) * 18, t[1] - 10 + Math.sin(a) * 6, t[0] + Math.cos(a) * 30, t[1] + 6 + Math.sin(a) * 12); ctx.stroke(); }
    }
    if (!lm.beacon) lm.beacon = liftPt(E, (lm.x + 6.5) * TILE, (lm.y + 3.5) * TILE, 0.1);
  },
  /* 간헐천 들판 — 하늘빛 온천, 김, 몇십 초마다 솟는 물기둥 */
  geyser(lm, E, g) {
    for (const [x, y] of lm.pools) {
      const p = liftPt(E, x * TILE, y * TILE, 0);
      ctx.fillStyle = '#c8c4b0'; ctx.beginPath(); ctx.ellipse(p[0], p[1], TILE * 1.25, TILE * 0.95, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#3aa0b8'; ctx.beginPath(); ctx.ellipse(p[0], p[1], TILE * 0.95, TILE * 0.7, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = 'rgba(160,230,240,.4)'; ctx.beginPath(); ctx.ellipse(p[0] - 6, p[1] - 4, TILE * 0.45, TILE * 0.3, 0, 0, 6.283); ctx.fill();
    }
    const [vx, vy] = lm.vent, cyc = (g.time + 7) % 26, h = cyc < 5 ? Math.sin(cyc / 5 * Math.PI) : 0;
    const base = liftPt(E, vx * TILE, vy * TILE, 0);
    ctx.fillStyle = '#b0aa94'; ctx.beginPath(); ctx.ellipse(base[0], base[1], 30, 22, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#2a7088'; ctx.beginPath(); ctx.ellipse(base[0], base[1], 12, 8, 0, 0, 6.283); ctx.fill();
    // 김 — 늘 피어오르고, 분출하면 하얀 물기둥이 높이 선다
    for (let i = 0; i < 6; i++) {
      const ph = (g.time * 0.35 + i / 6) % 1, k = 0.04 + ph * (0.25 + h * 0.6);
      const q = liftPt(E, vx * TILE + Math.sin(i * 2.1 + g.time) * 10 * ph, vy * TILE, k);
      ctx.fillStyle = `rgba(230,236,240,${(1 - ph) * 0.28})`; ctx.beginPath(); ctx.arc(q[0], q[1], 10 + ph * 26, 0, 6.283); ctx.fill();
    }
    if (h > 0.02) {
      const tp = spireAt(E, vx, vy, 0, 0.75 * h, 10 + h * 10, `rgba(235,245,250,${0.55 + h * 0.3})`);
      lm.beacon = tp;
    }
  },
  /* 연구 기지 — 기둥 위 주황 · 초록 연구동, 레이더 돔, 연료 탱크, 헬기장 H */
  station(lm, E) {
    const pd = liftPt(E, lm.pad[0] * TILE, lm.pad[1] * TILE, 0);
    ctx.strokeStyle = 'rgba(230,200,60,.75)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(pd[0], pd[1], 70, 52, 0, 0, 6.283); ctx.stroke();
    ctx.fillStyle = 'rgba(230,200,60,.8)'; ctx.font = `900 48px ${CANVAS_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', pd[0], pd[1]);
    const C = ['#d8642a', '#3c7a52', '#d8642a'];
    lm.mods.forEach(([x, y, w, h], i) => {
      liftBox(E, x + 0.3, y + 0.3, w - 0.6, h - 0.6, 0.05, '#2a2c2e', '#3a3c3e');                 // 기둥 사이 그늘
      liftBoxK(E, x, y, w, h, 0.05, 0.13, shade(C[i], 0.72), C[i]);
      const r = liftRect(E, x, y, w, h, 0.1); ctx.strokeStyle = 'rgba(180,220,240,.55)'; ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.moveTo(r[3][0], r[3][1]); ctx.lineTo(r[2][0], r[2][1]); ctx.stroke(); ctx.setLineDash([]);
    });
    liftBox(E, lm.dome[0] - 1, lm.dome[1] - 1, 2, 2, 0.06, '#9aa0a4', '#b0b6ba');
    lm.beacon = domeAt(E, lm.dome[0], lm.dome[1], 0.95, 0.06, '#e6eaee', 'rgba(255,255,255,.5)');
    for (const [x, y] of lm.tanks) { spireAt(E, x, y, 0, 0.1, 34, '#6a7a86'); const tp = liftPt(E, x * TILE, y * TILE, 0.1); ctx.fillStyle = '#8a9aa6'; ctx.beginPath(); ctx.ellipse(tp[0], tp[1], 17, 12, 0, 0, 6.283); ctx.fill(); }
  },
  /* 궁궐: 돌담 + 홍예문 위 2층 문루 + 정전 겹지붕 */
  palace(lm, E, g, w) {
    const wallTiles = [];
    for (let y = lm.y; y < lm.y + lm.h; y++) for (let x = lm.x; x < lm.x + lm.w; x++) {
      const onEdge = x === lm.x || x === lm.x + lm.w - 1 || y === lm.y || y === lm.y + lm.h - 1;
      if (onEdge && w.at(x, y) === T_WALL) wallTiles.push([x, y]);
    }
    for (const [x, y] of wallTiles) liftBox(E, x, y, 1, 1, 0.05, '#5b5149', '#3a3f3c');
    // 문루 석축과 홍예 셋
    const gt = lm.gate;
    liftBox(E, gt.x, gt.y, gt.w, gt.h, 0.07, '#6b6359', '#57514a');
    for (let k = 1; k <= 3; k++) {
      const p = liftPt(E, (gt.x + k + 0.5) * TILE, (gt.y + gt.h) * TILE, 0.03);
      ctx.fillStyle = '#121416'; ctx.beginPath(); ctx.ellipse(p[0], p[1], 13, 9, 0, Math.PI, 0); ctx.fill();
    }
    hipRoof(E, gt.x, gt.y, gt.w, gt.h, 0.1, 0.14, '#3f5258', '#1b2224', 14);
    hipRoof(E, gt.x + 0.6, gt.y + 0.3, gt.w - 1.2, gt.h - 0.6, 0.15, 0.2, '#465a60', '#1b2224', 10);
    // 단청 띠
    const band = liftRect(E, gt.x, gt.y, gt.w, gt.h, 0.095, -6);
    ctx.strokeStyle = 'rgba(70,140,110,.55)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(band[0][0], band[0][1]); for (let i = 1; i <= 4; i++) ctx.lineTo(band[i % 4][0], band[i % 4][1]); ctx.stroke();
    // 정전
    const h = lm.hall;
    liftBox(E, h.x, h.y, h.w, h.h, 0.04, '#6b6359', '#5a554e');
    liftBox(E, h.x + 0.5, h.y + 0.3, h.w - 1, h.h - 0.6, 0.11, '#7a2e24', '#5a2a22');
    hipRoof(E, h.x, h.y, h.w, h.h, 0.12, 0.17, '#3c4f55', '#181f21', 16);
    hipRoof(E, h.x + 0.9, h.y + 0.4, h.w - 1.8, h.h - 0.8, 0.18, 0.24, '#43575d', '#181f21', 10);
  },
  /* 전파탑: 언덕 위에서 하늘로 — 시점에서 멀수록 꼭대기가 크게 벗어나 높이가 느껴진다 */
  tower(lm, E, g) {
    const bx = lm.cx * TILE, by = lm.cy * TILE;
    const mid = liftPt(E, bx, by, 0.55), deck = liftPt(E, bx, by, 0.75), top = liftPt(E, bx, by, 1.05);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#8c949c'; ctx.lineWidth = 16;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(mid[0], mid[1]); ctx.stroke();
    ctx.strokeStyle = '#a2aab2'; ctx.lineWidth = 11;
    ctx.beginPath(); ctx.moveTo(mid[0], mid[1]); ctx.lineTo(deck[0], deck[1]); ctx.stroke();
    ctx.fillStyle = '#6d757d'; ctx.beginPath(); ctx.arc(deck[0], deck[1], 24, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#c3c9cf'; ctx.beginPath(); ctx.arc(deck[0], deck[1], 18, 0, 6.283); ctx.fill();
    ctx.fillStyle = 'rgba(20,24,28,.85)';
    for (let a = 0; a < 6.28; a += 0.52) ctx.fillRect(deck[0] + Math.cos(a) * 13 - 2, deck[1] + Math.sin(a) * 13 - 2, 4, 4);
    ctx.strokeStyle = '#d6dade'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(deck[0], deck[1]); ctx.lineTo(top[0], top[1]); ctx.stroke();
    ctx.lineCap = 'butt';
    lm.beacon = top;
  },
  /* 붉은·흰 격자탑: 네 다리가 두 단의 전망대를 거쳐 안테나로 모인다 */
  lattice(lm, E) {
    const c = [lm.cx * TILE, lm.cy * TILE];
    const legs = [[lm.x + 3.5, lm.y + 3.5], [lm.x + 5.5, lm.y + 3.5], [lm.x + 5.5, lm.y + 5.5], [lm.x + 3.5, lm.y + 5.5]].map(([x, y]) => [x * TILE, y * TILE]);
    const ring = (k, s) => legs.map(([x, y]) => liftPt(E, c[0] + (x - c[0]) * s, c[1] + (y - c[1]) * s, k));
    const levels = [[0, 1], [0.22, 0.62], [0.42, 0.38], [0.6, 0.22], [0.85, 0.1]];
    const rings = levels.map(([k, s]) => ring(k, s));
    for (let i = 0; i + 1 < rings.length; i++) {
      const col = i % 2 ? '#e8e2da' : '#d23b2a';
      ctx.strokeStyle = col; ctx.lineWidth = 6 - i;
      ctx.beginPath();
      for (let j = 0; j < 4; j++) {
        ctx.moveTo(rings[i][j][0], rings[i][j][1]); ctx.lineTo(rings[i + 1][j][0], rings[i + 1][j][1]);
        // X 가새
        ctx.moveTo(rings[i][j][0], rings[i][j][1]); ctx.lineTo(rings[i + 1][(j + 1) % 4][0], rings[i + 1][(j + 1) % 4][1]);
      }
      ctx.stroke();
    }
    for (const [i, col] of [[1, '#b8322a'], [3, '#d23b2a']]) polyFill(rings[i], col);   // 전망대 둘
    const top = liftPt(E, c[0], c[1], 1.15), r4 = rings[4];
    ctx.strokeStyle = '#e8e2da'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo((r4[0][0] + r4[2][0]) / 2, (r4[0][1] + r4[2][1]) / 2); ctx.lineTo(top[0], top[1]); ctx.stroke();
    lm.beacon = top;
  },
  /* 절: 붉은 대문(가운데 큰 등롱) · 노점 지붕 · 본당 · 오층탑 */
  temple(lm, E, g) {
    for (const [x, y] of lm.stalls) {
      liftBox(E, x, y, 1, 1, 0.04, '#5a2a22', '#7a3026');
      hipRoof(E, x, y, 1, 1, 0.05, 0.07, '#3b3f44', '#2a2d31', 4);
    }
    const gt = lm.gate;
    for (const dx of [1, 3]) liftBox(E, gt.x + dx, gt.y, 1, 1, 0.1, '#9b2a20', '#b8322a');
    hipRoof(E, gt.x, gt.y - 0.2, gt.w, 1.4, 0.11, 0.15, '#2a2e33', '#181b1e', 12);
    const ln = liftPt(E, (gt.x + 2.5) * TILE, (gt.y + 0.5) * TILE, 0.07);
    ctx.fillStyle = '#c0281e'; ctx.beginPath(); ctx.ellipse(ln[0], ln[1], 15, 19, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(ln[0] - 15, ln[1] - 20, 30, 4); ctx.fillRect(ln[0] - 15, ln[1] + 16, 30, 4);
    lm.lantern = ln;
    const h = lm.hall;
    liftBox(E, h.x + 0.4, h.y + 0.3, h.w - 0.8, h.h - 0.6, 0.1, '#8a2a20', '#6a2219');
    hipRoof(E, h.x, h.y, h.w, h.h, 0.11, 0.2, '#2c3035', '#191c1f', 18);
    // 오층탑 — 지붕을 다섯 번 쌓아 올리며 점점 작게
    const p = lm.pagoda;
    for (let i = 0; i < 5; i++) {
      const s = 0.18 * i, k = 0.07 + i * 0.075;
      liftBox(E, p.x + s, p.y + s, 2 - 2 * s, 2 - 2 * s, k - 0.03, '#8a2a20', '#7a2419');
      hipRoof(E, p.x + s, p.y + s, 2 - 2 * s, 2 - 2 * s, k, k + 0.025, '#2a2e33', '#181b1e', 9 - i);
    }
    const sp = liftPt(E, (p.x + 1) * TILE, (p.y + 1) * TILE, 0.5), sb = liftPt(E, (p.x + 1) * TILE, (p.y + 1) * TILE, 0.42);
    ctx.strokeStyle = '#b89a4a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sb[0], sb[1]); ctx.lineTo(sp[0], sp[1]); ctx.stroke();
  },
  /* 쁘랑: 하얀 단을 겹겹이 올리고 자기 조각 점을 박은 탑 */
  prang(lm, E) {
    const tiers = (cx, cy, r0, k0, k1, n) => {
      for (let i = 0; i < n; i++) {
        const t = i / n, r = r0 * (1 - t * 0.82), k = k0 + (k1 - k0) * t;
        const p = liftPt(E, cx, cy, k);
        ctx.fillStyle = i % 2 ? '#d8d2c6' : '#c4bdb0';
        ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.283); ctx.fill();
        ctx.fillStyle = ['#c94f4f', '#4f8fc9', '#e0b84a', '#5aa86a'][i % 4];
        for (let a = (i * 0.4) % 1; a < 6.28; a += 0.9) ctx.fillRect(p[0] + Math.cos(a) * r * 0.75 - 1.5, p[1] + Math.sin(a) * r * 0.75 - 1.5, 3, 3);
      }
      const tip = liftPt(E, cx, cy, k1 + 0.12), bt = liftPt(E, cx, cy, k1);
      ctx.strokeStyle = '#d9c27a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bt[0], bt[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
    };
    for (const [x, y] of lm.minis) tiers(x * TILE, y * TILE, 26, 0.02, 0.3, 6);
    tiers(lm.cx * TILE, lm.cy * TILE, 76, 0.03, 0.7, 11);
  },
  /* 기념탑: 둥근 받침 위 가운데 탑과 네 날개 */
  monument(lm, E) {
    const cx = lm.cx * TILE, cy = lm.cy * TILE;
    liftBox(E, lm.cx - 1, lm.cy - 1, 2, 2, 0.05, '#77705f', '#8c8470');
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      const bx = cx + Math.cos(a) * 44, by = cy + Math.sin(a) * 44;
      const nx = -Math.sin(a) * 9, ny = Math.cos(a) * 9;
      const base = [[bx - nx, by - ny], [bx + nx, by + ny]];
      const t0 = liftPt(E, base[0][0], base[0][1], 0.42), t1 = liftPt(E, base[1][0], base[1][1], 0.42);
      polyFill([base[0], base[1], t1, t0], '#a9a18a');
      ctx.strokeStyle = '#d8cfb4'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(t0[0], t0[1]); ctx.lineTo(t1[0], t1[1]); ctx.stroke();
    }
    const top = liftPt(E, cx, cy, 0.28);
    ctx.fillStyle = '#b3aa90'; ctx.beginPath(); ctx.arc(top[0], top[1], 14, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#d4c48a'; ctx.beginPath(); ctx.arc(top[0], top[1], 7, 0, 6.283); ctx.fill();
  },
  /* 야시장: 줄무늬 천막 노점과 전구 줄 */
  market(lm, E, g) {
    const cols = ['#c0392b', '#2980b9', '#e67e22', '#27ae60', '#8e44ad'];
    lm.bulbs = [];
    lm.stalls.forEach(([x, y], i) => {
      liftBox(E, x, y, 1, 1, 0.03, '#4a3a2c', '#5a4636');
      const r = liftRect(E, x, y, 1, 1, 0.06, -5);
      polyFill(r, cols[i % cols.length]);
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3;
      ctx.beginPath();
      for (let k = 1; k < 4; k++) {
        const t = k / 4;
        ctx.moveTo(r[0][0] + (r[1][0] - r[0][0]) * t, r[0][1] + (r[1][1] - r[0][1]) * t);
        ctx.lineTo(r[3][0] + (r[2][0] - r[3][0]) * t, r[3][1] + (r[2][1] - r[3][1]) * t);
      }
      ctx.stroke();
    });
    // 전구 줄 — 노점 사이를 가로지른다
    ctx.strokeStyle = 'rgba(60,50,40,.8)'; ctx.lineWidth = 1;
    for (let y = lm.y + 1; y <= lm.y + 7; y += 2) {
      const a = liftPt(E, lm.x * TILE, (y + 0.5) * TILE, 0.09), b = liftPt(E, (lm.x + lm.w) * TILE, (y + 0.5) * TILE, 0.09);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      for (let t = 0.05; t < 1; t += 0.09) lm.bulbs.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  },
  /* 검문소: 모래주머니 담 · 콘크리트 방벽 · 조립식 막사 · 천막 · 투광등 */
  checkpoint(lm, E, g) {
    // 모래주머니 담 — 이어진 구간을 한 상자로 세우고, 자루 이음매는 한 번의 선 묶음으로
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1;
    const seams = new Path2D();
    for (const [x, y, w, h] of lm.runs) {
      liftBox(E, x + 0.08, y + 0.12, w - 0.16, h - 0.24, 0.035, '#6e6248', '#8a7c5c');
      const r = liftRect(E, x + 0.08, y + 0.12, w - 0.16, h - 0.24, 0.035, 0);
      if (w > 1) for (let k = 1; k < w * 2; k++) { const u = k / (w * 2); seams.moveTo(r[0][0] + (r[1][0] - r[0][0]) * u, r[0][1]); seams.lineTo(r[3][0] + (r[2][0] - r[3][0]) * u, r[3][1]); }
      else for (let k = 1; k < h * 2; k++) { const v = k / (h * 2); seams.moveTo(r[0][0], r[0][1] + (r[3][1] - r[0][1]) * v); seams.lineTo(r[1][0], r[1][1] + (r[2][1] - r[1][1]) * v); }
    }
    ctx.stroke(seams);
    for (const [x, y] of lm.blocks) liftBox(E, x + 0.15, y + 0.3, 0.7, 0.4, 0.04, '#7c7d7a', '#9a9b98');
    for (const [x, y] of lm.cabins) {
      liftBox(E, x + 0.05, y + 0.1, 1.9, 0.8, 0.09, '#c9cbc6', '#e0e2dd');
      const r = liftRect(E, x + 0.05, y + 0.9, 1.9, 0, 0.06);
      ctx.fillStyle = '#20262c';
      for (const t of [0.15, 0.55]) ctx.fillRect(r[0][0] + (r[1][0] - r[0][0]) * t, r[0][1] - 6, 18, 9);
    }
    const t = lm.tent;
    hipRoof(E, t.x, t.y, 2, 1, 0.02, 0.07, '#4a5236', '#2e3322', 4);
    const base = [lm.pole[0] * TILE, lm.pole[1] * TILE], top = liftPt(E, base[0], base[1], 0.42);
    ctx.strokeStyle = '#6a7076'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(top[0], top[1]); ctx.stroke();
    ctx.fillStyle = '#2a2d30'; ctx.fillRect(top[0] - 12, top[1] - 5, 24, 9);
    ctx.fillStyle = '#f2eedc'; ctx.fillRect(top[0] - 10, top[1] - 2, 20, 4);
    lm.flood = top; lm.floodAt = [(lm.x + 5.5) * TILE, (lm.y + 4.5) * TILE];
  },
  /* 대피 기지 본영: 검문소와 같은 모래주머니 · 막사 · 천막 · 투광등 위에, 2단으로 쌓인 컨테이너와 철망 울타리 */
  base(lm, E, g) {
    LANDMARK_TOP.checkpoint(lm, E, g);
    lm.floodAt = [lm.pad[0] * TILE, lm.pad[1] * TILE];
    const C = ['#8a2e24', '#2e4a6a', '#b8b8b0', '#4a5a3a', '#9a6a2a', '#7a2a2a'];
    const K = 0.08;
    lm.boxes.forEach(([x, y, n, lv], i) => {
      for (let l = 0; l < lv; l++) {
        const c = C[(i * 2 + l * 3 + x) % C.length];
        liftBoxK(E, x + 0.04, y + 0.06, n - 0.08, 0.88, K * l, K * (l + 1) - 0.004, shade(c, 0.66), c);
        const r = liftRect(E, x + 0.04, y + 0.06, n - 0.08, 0.88, K * (l + 1) - 0.004, 3);
        const f = [liftPt(E, (x + 0.04) * TILE, (y + 0.94) * TILE, K * l), liftPt(E, (x + n - 0.04) * TILE, (y + 0.94) * TILE, K * l)];
        ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 1; ctx.beginPath();
        for (let k = 1; k < n * 6; k++) {                                      // 골판 — 윗면과 앞면
          const t = k / (n * 6);
          ctx.moveTo(r[0][0] + (r[1][0] - r[0][0]) * t, r[0][1]); ctx.lineTo(r[3][0] + (r[2][0] - r[3][0]) * t, r[3][1]);
          const fx = f[0][0] + (f[1][0] - f[0][0]) * t; ctx.moveTo(fx, f[0][1]); ctx.lineTo(fx, f[0][1] - (K - 0.004) * HSC);
        }
        ctx.stroke();
      }
    });
    // 철망 — 기둥과 그물. 그물은 비쳐 보이게 옅은 마름모 격자로
    ctx.lineWidth = 1;
    for (const [x, y, w, h] of lm.fence) {
      const horiz = w > 1, len = horiz ? w : h;
      const a0 = horiz ? [x * TILE, (y + 0.5) * TILE] : [(x + 0.5) * TILE, y * TILE];
      const a1 = horiz ? [(x + w) * TILE, (y + 0.5) * TILE] : [(x + 0.5) * TILE, (y + h) * TILE];
      const H = 0.075 * HSC;
      ctx.fillStyle = 'rgba(150,158,160,.07)';
      ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.lineTo(a1[0], a1[1] - H); ctx.lineTo(a0[0], a0[1] - H); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(170,176,178,.22)'; ctx.beginPath();
      const steps = len * 6;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps, px = a0[0] + (a1[0] - a0[0]) * t, py = a0[1] + (a1[1] - a0[1]) * t;
        const d = 1 / steps * 3, qx = a0[0] + (a1[0] - a0[0]) * Math.min(1, t + d), qy = a0[1] + (a1[1] - a0[1]) * Math.min(1, t + d);
        ctx.moveTo(px, py); ctx.lineTo(qx, qy - H);
        ctx.moveTo(px, py - H); ctx.lineTo(qx, qy);
      }
      ctx.stroke();
      ctx.strokeStyle = '#7d8286'; ctx.lineWidth = 2.5; ctx.beginPath();
      for (let k = 0; k <= len; k++) { const t = k / len, px = a0[0] + (a1[0] - a0[0]) * t, py = a0[1] + (a1[1] - a0[1]) * t; ctx.moveTo(px, py); ctx.lineTo(px, py - H - 3); }
      ctx.moveTo(a0[0], a0[1] - H); ctx.lineTo(a1[0], a1[1] - H);
      ctx.stroke(); ctx.lineWidth = 1;
    }
  },
  /* 철로: 화차는 구조물로 그려지고, 여기서는 신호기만 */
  railyard(lm, E, g) {
    const b = [lm.signal[0] * TILE, lm.signal[1] * TILE], top = liftPt(E, b[0], b[1], 0.3);
    ctx.strokeStyle = '#4a4e52'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(top[0], top[1]); ctx.stroke();
    ctx.fillStyle = '#16181a'; ctx.fillRect(top[0] - 5, top[1] - 12, 10, 18);
    ctx.fillStyle = '#d23b2a'; ctx.beginPath(); ctx.arc(top[0], top[1] - 6, 3, 0, 6.283); ctx.fill();
    lm.beacon = [top[0], top[1] - 6];
  },
  /* 주유소: 매점 · 주유기 · 기둥 위 지붕(속이 보이게 테두리와 얇은 판만) · 가격 간판 */
  gas(lm, E, g) {
    const sh = lm.shop;
    liftBox(E, sh.x + 0.05, sh.y + 0.05, sh.w - 0.1, sh.h - 0.1, 0.1, '#5a5e62', '#3e4246');
    const fr = liftRect(E, sh.x + 0.05, sh.y + sh.h - 0.05, sh.w - 0.1, 0, 0.07);
    ctx.fillStyle = 'rgba(150,200,220,.25)'; ctx.fillRect(fr[0][0] + 8, fr[0][1] - 4, fr[1][0] - fr[0][0] - 16, 10);
    for (const [x, y] of lm.pumps) {
      liftBox(E, x + 0.3, y + 0.25, 0.4, 0.5, 0.06, '#b8372e', '#d8d2c6');
      const p = liftPt(E, (x + 0.5) * TILE, (y + 0.75) * TILE, 0.045);
      ctx.fillStyle = '#20262a'; ctx.fillRect(p[0] - 5, p[1] - 4, 10, 6);
    }
    const c = lm.canopy, r = liftRect(E, c.x, c.y, c.w, c.h, 0.2);
    ctx.strokeStyle = 'rgba(120,125,130,.6)'; ctx.lineWidth = 5;
    for (const [x, y] of [[c.x + 0.5, c.y + 0.5], [c.x + c.w - 0.5, c.y + 0.5], [c.x + 0.5, c.y + c.h - 0.5], [c.x + c.w - 0.5, c.y + c.h - 0.5]]) {
      const tp = liftPt(E, x * TILE, y * TILE, 0.2); ctx.beginPath(); ctx.moveTo(x * TILE, y * TILE); ctx.lineTo(tp[0], tp[1]); ctx.stroke();
    }
    polyFill(r, 'rgba(210,214,218,.16)');
    ctx.strokeStyle = 'rgba(200,60,50,.75)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(r[0][0], r[0][1]); for (let i = 1; i <= 4; i++) ctx.lineTo(r[i % 4][0], r[i % 4][1]); ctx.stroke();
    lm.bulbs = [];
    for (let i = 1; i < 4; i++) for (let j = 1; j < 3; j++) lm.bulbs.push([r[0][0] + (r[1][0] - r[0][0]) * i / 4, r[0][1] + (r[3][1] - r[0][1]) * j / 3]);
    const sb = [lm.sign[0] * TILE, lm.sign[1] * TILE], st = liftPt(E, sb[0], sb[1], 0.36);
    ctx.strokeStyle = '#5a5e62'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(sb[0], sb[1]); ctx.lineTo(st[0], st[1]); ctx.stroke();
    ctx.fillStyle = '#1a1c1e'; ctx.fillRect(st[0] - 16, st[1] - 26, 32, 28);
    ctx.fillStyle = '#c94a3a'; ctx.fillRect(st[0] - 14, st[1] - 24, 28, 8);
    ctx.fillStyle = '#e8d070'; ctx.font = `600 8px ${CANVAS_FONT}`; ctx.textAlign = 'center';
    ctx.fillText('— . —', st[0], st[1] - 6);
    lm.signGlow = [st[0], st[1] - 12];
  },
  /* 호커 센터: 노점 줄 · 둥근 탁자와 의자 · 기둥만 남은 지붕 틀(속이 보이게 선만 긋는다) */
  hawker(lm, E) {
    const cols = ['#c94f3d', '#3d7fc9', '#d9a43a', '#3a9a6a', '#9a4ac9'];
    lm.bulbs = [];
    lm.stalls.forEach(([x, y], i) => {
      liftBox(E, x, y, 1, 1, 0.06, '#3e3a36', '#55504a');
      const sg = liftRect(E, x, y + 0.85, 1, 0.15, 0.085, 3);
      polyFill(sg, cols[i % cols.length]);
      lm.bulbs.push(liftPt(E, (x + 0.5) * TILE, (y + 1) * TILE, 0.1));
    });
    for (const [x, y] of lm.tables) {
      const c = liftPt(E, (x + 0.5) * TILE, (y + 0.5) * TILE, 0.03);
      ctx.fillStyle = '#2a2c2e';
      for (let k = 0; k < 4; k++) { const a = k * 1.571 + 0.785; ctx.beginPath(); ctx.arc(c[0] + Math.cos(a) * 19, c[1] + Math.sin(a) * 15 + 6, 5, 0, 6.283); ctx.fill(); }
      ctx.fillStyle = '#8f8a80'; ctx.beginPath(); ctx.ellipse(c[0], c[1], 15, 13, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#a7a196'; ctx.beginPath(); ctx.ellipse(c[0] - 2, c[1] - 2, 10, 8, 0, 0, 6.283); ctx.fill();
    }
    const r = liftRect(E, lm.x, lm.y + 1, lm.w, lm.h - 1, 0.17);
    ctx.strokeStyle = 'rgba(120,130,135,.55)'; ctx.lineWidth = 4;
    for (const [bx, by] of [[lm.x, lm.y + 1], [lm.x + lm.w, lm.y + 1], [lm.x + lm.w, lm.y + lm.h], [lm.x, lm.y + lm.h]]) {
      const t = liftPt(E, bx * TILE, by * TILE, 0.17);
      ctx.beginPath(); ctx.moveTo(bx * TILE, by * TILE); ctx.lineTo(t[0], t[1]); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(150,160,165,.35)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(r[0][0], r[0][1]); for (let i = 1; i <= 4; i++) ctx.lineTo(r[i % 4][0], r[i % 4][1]);
    for (let k = 1; k < 4; k++) { const t = k / 4; ctx.moveTo(r[0][0] + (r[1][0] - r[0][0]) * t, r[0][1]); ctx.lineTo(r[3][0] + (r[2][0] - r[3][0]) * t, r[3][1]); }
    ctx.stroke();
    for (let k = 1; k < 4; k++) { const t = k / 4; lm.bulbs.push([r[0][0] + (r[1][0] - r[0][0]) * t, r[0][1] + (r[3][1] - r[0][1]) * 0.5]); }
  },
  /* 수직 정원: 넝쿨 감긴 강철 줄기가 넓은 갓으로 벌어진다. 갓 테두리에 불이 남아 있다 */
  grove(lm, E, g) {
    lm.bulbs = [];
    const t = g ? g.time : 0;
    for (const [tx, ty, k] of lm.trees) {
      const bx = tx * TILE, by = ty * TILE;
      const top = liftPt(E, bx, by, 0.62 * k), mid = liftPt(E, bx, by, 0.3 * k);
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#4a4550'; ctx.lineWidth = 20;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(mid[0], mid[1]); ctx.stroke();
      ctx.lineWidth = 13; ctx.beginPath(); ctx.moveTo(mid[0], mid[1]); ctx.lineTo(top[0], top[1]); ctx.stroke();
      ctx.strokeStyle = '#2f5a35'; ctx.lineWidth = 3;                     // 넝쿨
      ctx.beginPath();
      for (let s = 0; s <= 1; s += 0.08) { const p = liftPt(E, bx + Math.sin(s * 14) * 8 * (1 - s * 0.4), by, s * 0.62 * k); s ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
      ctx.stroke();
      // 갓 — 살대가 펼쳐진 얕은 그릇
      const R = 46 * k;
      ctx.strokeStyle = '#6a6070'; ctx.lineWidth = 3;
      ctx.beginPath();
      for (let a = 0; a < 6.28; a += 0.524) { ctx.moveTo(top[0], top[1]); ctx.lineTo(top[0] + Math.cos(a) * R, top[1] + Math.sin(a) * R * 0.8 - 10); }
      ctx.stroke();
      ctx.fillStyle = 'rgba(70,40,90,.55)';
      ctx.beginPath(); ctx.ellipse(top[0], top[1] - 10, R, R * 0.8, 0, 0, 6.283); ctx.fill();
      ctx.strokeStyle = '#8d6aa6'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(top[0], top[1] - 10, R, R * 0.8, 0, 0, 6.283); ctx.stroke();
      for (let a = 0; a < 6.28; a += 0.7) lm.bulbs.push([top[0] + Math.cos(a + t * 0.2) * R, top[1] - 10 + Math.sin(a + t * 0.2) * R * 0.8]);
      ctx.lineCap = 'butt';
    }
  },
  /* 항만: 정박한 화물선 · 갑판의 컨테이너 · 안벽의 컨테이너 더미 · 갠트리 크레인 둘 */
  port(lm, E) {
    const C = ['#a8452f', '#2f6aa8', '#c9a227', '#3a8a5a', '#7a4aa8', '#b7b2a8'];
    const h = lm.hull;
    // 뱃머리 — 선체 동쪽 끝에서 물 위로 뾰족하게
    {
      const X1 = (h.x + h.w) * TILE, Y0 = h.y * TILE + 4, Y1 = (h.y + h.h) * TILE - 4, tip = [X1 + TILE * 0.95, (Y0 + Y1) / 2];
      const g0 = [[X1, Y0], tip, [X1, Y1]], t0 = g0.map(([x, y]) => liftPt(E, x, y, 0.08));
      polyFill([g0[1], g0[2], t0[2], t0[1]], '#1f2830');
      polyFill([g0[0], g0[1], t0[1], t0[0]], '#26303b');
      polyFill(t0, '#3a3530');
    }
    liftBox(E, h.x, h.y, h.w, h.h, 0.08, lm.ice ? '#9a2a1c' : '#2a3440', lm.ice ? '#7a2016' : '#1f2830');   // 쇄빙선은 붉은 선체
    const deck = liftRect(E, h.x, h.y, h.w, h.h, 0.08, 6);
    polyFill(deck, '#3a3530');
    ctx.strokeStyle = '#8a2a20'; ctx.lineWidth = 3;                       // 흘수선 위 붉은 띠
    { const b = liftRect(E, h.x, h.y, h.w, h.h, 0.035); ctx.beginPath(); ctx.moveTo(b[3][0], b[3][1]); ctx.lineTo(b[2][0], b[2][1]); ctx.stroke(); }
    for (let i = 0; i < 4; i++) liftBox(E, h.x + 1 + i * 1.6, h.y + 0.6, 1.4, 1.8, 0.08 + 0.05 + (i % 2) * 0.04, shade(C[i], 0.7), C[i]);
    liftBox(E, h.x + h.w - 3, h.y + 0.3, 2.4, 2.4, 0.26, '#cfc9bd', '#e0dbd0');   // 선교
    { const r = liftRect(E, h.x + h.w - 3, h.y + 0.3, 2.4, 2.4, 0.22); ctx.strokeStyle = 'rgba(120,200,230,.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(r[3][0], r[3][1]); ctx.lineTo(r[2][0], r[2][1]); ctx.stroke(); }
    const mast = liftPt(E, (h.x + h.w - 1.8) * TILE, (h.y + 1.5) * TILE, 0.45), mb = liftPt(E, (h.x + h.w - 1.8) * TILE, (h.y + 1.5) * TILE, 0.26);
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(mb[0], mb[1]); ctx.lineTo(mast[0], mast[1]); ctx.stroke();
    lm.beacon = mast;
    // 현문 — 안벽에서 갑판까지 비스듬한 사다리
    const g0 = liftPt(E, (lm.rally.tx + 0.5) * TILE, (lm.rally.ty + 1) * TILE, 0), g1 = liftPt(E, (lm.rally.tx + 0.5) * TILE, (h.y + h.h) * TILE, 0.08);
    ctx.strokeStyle = '#9a9a92'; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(g0[0], g0[1]); ctx.lineTo(g1[0], g1[1]); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let s = 0.1; s < 1; s += 0.15) { const x = g0[0] + (g1[0] - g0[0]) * s, y = g0[1] + (g1[1] - g0[1]) * s; ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y); }
    ctx.stroke();
    // 안벽의 컨테이너
    lm.boxes.forEach(([x, y, n], i) => {
      const c = C[(i + 2) % C.length];
      liftBox(E, x, y, n, 1, 0.07 + (i % 3 === 0 ? 0.05 : 0), shade(c, 0.65), c);
      const r = liftRect(E, x, y, n, 1, 0.07 + (i % 3 === 0 ? 0.05 : 0), 4);
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let k = 1; k < n * 5; k++) { const t = k / (n * 5); ctx.moveTo(r[0][0] + (r[1][0] - r[0][0]) * t, r[0][1]); ctx.lineTo(r[3][0] + (r[2][0] - r[3][0]) * t, r[3][1]); }
      ctx.stroke();
    });
    // 갠트리 크레인 — 안벽 다리 둘에서 솟아 바다 위로 붐을 내민다
    for (const cx of lm.cranes) {
      const yb = (lm.y + 4.5) * TILE, K = 0.5;
      const legs = [[cx + 0.5, yb], [cx + 1.5, yb]].map(([x, y]) => [x * TILE, y]);
      ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 7;
      ctx.beginPath();
      for (const [x, y] of legs) { const t = liftPt(E, x, y, K); ctx.moveTo(x, y); ctx.lineTo(t[0], t[1]); }
      ctx.stroke();
      const a = liftPt(E, (cx + 1) * TILE, yb + 30, K), b = liftPt(E, (cx + 1) * TILE, (lm.y - 1.5) * TILE, K + 0.02);
      ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.strokeStyle = 'rgba(40,40,40,.8)'; ctx.lineWidth = 1.5;
      const hk = liftPt(E, (cx + 1) * TILE, (lm.y + 1.5) * TILE, K);
      const hd = liftPt(E, (cx + 1) * TILE, (lm.y + 1.5) * TILE, 0.2);
      ctx.beginPath(); ctx.moveTo(hk[0], hk[1]); ctx.lineTo(hd[0], hd[1]); ctx.stroke();
      ctx.fillStyle = '#c9a227'; ctx.fillRect(hd[0] - 8, hd[1], 16, 5);
    }
  },
  scramble() {}
};

/* ═══════════ 의사 3D 건물 ═══════════
   원작은 높은 곳에서 내려다보는 3D 카메라였다. 건물 지붕을 시점(화면 속 플레이어 자리)에서
   바깥쪽으로 (1+BLD_H) 배 밀어내면, 시점 쪽을 향한 벽면이 드러나 높이가 생긴다.
   지붕 전체가 시점 기준 한 번의 확대라서 이웃 타일의 지붕이 어긋나지 않는다. */
const BLD_H = 0.19;                                // 원작 예고편처럼 3‒4층 벽면이 서 보이게 (예전 0.15)
function eyeOf(cam) { return { x: cam.x + W / 2, y: cam.y + focusY() / TILT }; }
/* 60° 로 기울인 카메라: 바닥은 세로로 sin60 만큼 줄고(TILT), 높이는 화면에서 곧장 위로 cos60 만큼 선다.
   세계 좌표(줄이기 전)로 쓰면 높이 h 는 h·cos60/sin60 만큼 위(−y)로 — k=1 이 높이 480px(약 10칸).
   그래서 보이는 벽면은 남쪽 면뿐이고, 지붕은 바로 위로 떠 있다 */
const liftPt = (E, x, y, k) => [x, y - k * HSC];

/** 원뿔 끝점 중 건물 벽에 막힌 것을 지붕선까지 들어 올린다 — 빛이 벽면을 타고 오른다 */
function liftPoly(poly, w, E) {
  const ox = poly[0], oy = poly[1];
  for (let i = 2; i < poly.length; i += 2) {
    const x = poly[i], y = poly[i + 1], dx = x - ox, dy = y - oy, d = Math.hypot(dx, dy);
    if (d < 1) continue;
    if (dy >= 0) continue;                       // 보이는 벽(남쪽 면)에 닿은 빛만 — 북쪽으로 가던 빛
    const tx = Math.floor((x + dx / d * 3) / TILE), ty = Math.floor((y + dy / d * 3) / TILE);
    if (w.deco[w.idx(tx, ty)] !== D_BUILDING) continue;
    const q = liftPt(E, x, y, bldH(w, tx, ty));
    poly[i] = q[0]; poly[i + 1] = q[1];
  }
  return poly;
}

/** 필지마다 높이가 다르다 — 2‒4층. 세계마다 한 번 계산해 둔다 */
function bldH(w, x, y) {
  if (!w._bh) {
    w._bh = new Float32Array(w.w * w.h);
    for (let i = 0; i < w._bh.length; i++) {
      const l = w.lot[i] || (((i % w.w) >> 2) * 31 + ((i / w.w | 0) >> 2) * 17 + 1);
      w._bh[i] = BLD_H * (0.8 + ((Math.imul(l, 2654435761) >>> 0) % 6) * 0.1);
    }
  }
  return w._bh[w.idx(x, y)];
}
const FLOOR = 34;                                   // 한 층 높이 (세계 px)
const ZK = 1 / 480 * HSC;                           // 높이 1px → 세계 y 위로
const GUN_LIFT = 20 * 1.12 * ZK * MODELS.HK, SPIT_LIFT = 17 * ZK * MODELS.HK;
const WALLS = ['#262e39', '#2f2b29', '#2a3131', '#34302c', '#29313a', '#30343a'];
const lotHash = (w, x, y) => Math.imul(w.lot[w.idx(x, y)] || (x * 7 + y * 13), 2246822519) >>> 0;

/** 옥상 설비 배치 — 필지(같은 건물)마다 한 번 정한다. 칸마다 해시로 고르면 큰 지붕에 계단실이 바둑판처럼 늘어섰다.
    1 계단실(필지마다 하나) 2 실외기 3 물탱크 4 태양광 5 텃밭 6 안테나 7 환기구 8 물웅덩이 */
function roofFeat(w) {
  if (w._roof) return w._roof;
  const f = w._roof = new Uint8Array(w.w * w.h), lots = new Map();
  const isB = (x, y) => w.deco[w.idx(x, y)] === D_BUILDING;
  for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
    const i = y * w.w + x, lot = w.lot[i];
    if (!isB(x, y) || !lot) continue;
    if (!(isB(x + 1, y) && w.lot[w.idx(x + 1, y)] === lot && isB(x, y + 1) && w.lot[w.idx(x, y + 1)] === lot)) continue;
    if (!lots.has(lot)) lots.set(lot, []);
    lots.get(lot).push(i);
  }
  for (const [lot, tiles] of lots) {
    let h = Math.imul(lot, 2654435761) >>> 0;
    const next = () => (h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0);
    const take = code => { for (let t = 0; t < 6; t++) { const i = tiles[next() % tiles.length]; if (!f[i]) { f[i] = code; return; } } };
    take(1);
    const n = tiles.length;
    for (let k = 0; k < Math.max(1, n / 11); k++) take(2);
    for (let k = 0; k < n / 14; k++) take(7);
    if (next() % 3 === 0) take(3);
    if (next() % 5 === 0) take(4);
    if (next() % 4 === 0) take(5);
    if (next() % 6 === 0) take(6);
    if (next() % 3 === 0) take(8);
  }
  return f;
}
/** 한 줄의 창을 색마다 모으는 경로 — 칠하는 순서대로 */
let WIN = null;
const WIN_COLS = [['frame', 'rgba(190,186,170,.30)'], ['lit', 'rgba(201,154,82,.75)'], ['broken', '#040506'], ['glass', '#0f141a'],
                  ['glare', 'rgba(150,180,210,.12)'], ['mull', 'rgba(160,156,140,.28)'], ['sill', 'rgba(210,206,190,.34)'],
                  ['under', 'rgba(0,0,0,.3)'], ['band', 'rgba(0,0,0,.28)']];
/** 건물 한 줄 — 남쪽 벽면(창문·가게 앞) → 지붕(난간·옥상 설비).
    한 줄씩 북쪽부터 그리고 그 사이사이에 서 있는 것들을 끼워 넣어, 남쪽 건물이 북쪽의 사람을 가린다 */
function buildingRow(w, r, x0, x1) {
  const isB = (x, y) => w.deco[w.idx(x, y)] === D_BUILDING;
  const roofs = w.theme.roofs, R = roofs.length;
  // 벽면 바탕색 → 재료 결(벽돌 · 미장) → 창. 결은 한 줄의 벽을 한 경로로 모아 한 번에 칠한다 —
  // 칸마다 무늬와 단색을 번갈아 고르면 무늬를 매번 새로 준비해 프레임이 떨어진다
  const brick = new Path2D(), stucco = new Path2D();
  for (let x = x0; x <= x1; x++) {
    if (!isB(x, r)) continue;
    const h = bldH(w, x, r), hs = isB(x, r + 1) ? bldH(w, x, r + 1) : 0;
    if (h <= hs + 1e-4) continue;
    const px = x * TILE, base = (r + 1) * TILE, top = base - h * HSC, low = base - hs * HSC;
    const mat = wallMat(w, lotHash(w, x, r));
    ctx.fillStyle = mat[0];
    ctx.fillRect(px - 0.3, top, TILE + 0.6, low - top);
    (mat[1] ? brick : stucco).rect(px - 0.3, top, TILE + 0.6, low - top);
  }
  if (texOn()) {
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = bakedPattern('brick'); ctx.fill(brick);
    ctx.fillStyle = bakedPattern('stucco'); ctx.fill(stucco);
    ctx.imageSmoothingEnabled = true;
  }
  for (let x = x0; x <= x1; x++) {
    if (!isB(x, r)) continue;
    const h = bldH(w, x, r), hs = isB(x, r + 1) ? bldH(w, x, r + 1) : 0;
    if (h <= hs + 1e-4) continue;
    const px = x * TILE, base = (r + 1) * TILE, top = base - h * HSC;
    const lh = lotHash(w, x, r);
    const mat = wallMat(w, lh);
    // 층마다 창 두 개. 1층은 셔터 내린 가게나 유리문
    const hp = h * 480, hsp = hs * 480, nf = Math.floor(hp / FLOOR + 0.25);
    if (!WIN) WIN = { frame: new Path2D(), lit: new Path2D(), broken: new Path2D(), glass: new Path2D(), glare: new Path2D(),
                      mull: new Path2D(), sill: new Path2D(), under: new Path2D(), band: new Path2D() };
    for (let f = 0; f < nf; f++) {
      const zb = f * FLOOR, zt = Math.min(hp - 5, zb + FLOOR);
      if (zt <= hsp + 2) continue;
      const wh = Math.imul(lh ^ (x * 977 + f * 131), 2654435761) >>> 0;
      if (f === 0 && !hs) {
        const y1 = base - 2 * ZK, y2 = base - 25 * ZK;
        if (lh % 3 === 0) {
          ctx.fillStyle = '#3a4047'; ctx.fillRect(px + 3, y2, TILE - 6, y1 - y2);
          ctx.fillStyle = 'rgba(0,0,0,.35)';
          for (let k = 3; k < 23; k += 3) ctx.fillRect(px + 3, base - k * ZK, TILE - 6, 0.8);
        } else {
          ctx.fillStyle = '#10161d'; ctx.fillRect(px + 4, y2, TILE - 8, y1 - y2);
          ctx.fillStyle = 'rgba(150,180,210,.10)'; ctx.fillRect(px + 4, y2, TILE - 8, 2.5);
          ctx.fillStyle = mat[0]; ctx.fillRect(px + TILE / 2 - 1, y2, 2, y1 - y2);
        }
        ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(px, base - 28 * ZK, TILE, 2.4);   // 차양
        continue;
      }
      const v0 = Math.max(hsp + 1, zb + 9), v1 = Math.min(zt - 1, zb + 27);
      if (v1 <= v0) continue;
      for (const [wx, k] of [[px + 6, 0], [px + 28, 1]]) {
        const q = (wh >> (k * 7)) & 127, wy = base - v1 * ZK, wh2 = (v1 - v0) * ZK;
        // 창틀(밝은 테) → 유리 → 십자 창살 → 창턱. 원작의 벽처럼 창이 벽에서 도드라진다.
        // 창은 서로 겹치지 않으므로 색마다 한 경로에 모았다가 줄 끝에서 한 번씩 칠한다 (창 하나에 일곱 번 칠하던 것)
        WIN.frame.rect(wx - 1.5, wy - 1.5, 17, wh2 + 3);
        (q < 2 ? WIN.lit : q < 9 ? WIN.broken : WIN.glass).rect(wx, wy, 14, wh2);
        if (q >= 9) WIN.glare.rect(wx, wy, 14, wh2 * 0.35);
        WIN.mull.rect(wx + 6.4, wy, 1.2, wh2); WIN.mull.rect(wx, wy + wh2 * 0.45, 14, 1.1);
        WIN.sill.rect(wx - 2.5, wy + wh2 + 0.5, 19, 2);
        WIN.under.rect(wx - 2.5, wy + wh2 + 2.5, 19, 1.5);
      }
      WIN.band.rect(px, base - zb * ZK - 1, TILE, 1.6);                                           // 층 띠
    }
    // 바닥 쪽 그늘 · 처마 밝은 선
    if (!hs) { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(px, base - 5 * ZK, TILE, 5 * ZK); }
    ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(px, top, TILE, 2);
  }
  if (WIN) {
    for (const [k, col] of WIN_COLS) { ctx.fillStyle = col; ctx.fill(WIN[k]); }
    WIN = null;
  }
  // 지붕 — 필지마다 색과 높이. 방수층 무늬는 바탕을 다 칠한 뒤 한 번에 (아래 난간 · 설비는 그 위에)
  const roofPath = new Path2D();
  for (let x = x0; x <= x1; x++) {
    if (!isB(x, r)) continue;
    const i = w.idx(x, r), lot = w.lot[i], lift = bldH(w, x, r) * HSC;
    const k = lot ? lot % R : (((x * 73856093) ^ (r * 19349663)) & 15) % R;
    const px = x * TILE, py = r * TILE - lift;
    ctx.fillStyle = roofs[k];
    ctx.fillRect(px - 0.5, py - 0.5, TILE + 1, TILE + 1);
    roofPath.rect(px - 0.5, py - 0.5, TILE + 1, TILE + 1);
  }
  if (texOn()) {
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = bakedPattern('roof'); ctx.fill(roofPath);
    ctx.imageSmoothingEnabled = true;
  }
  for (let x = x0; x <= x1; x++) {
    if (!isB(x, r)) continue;
    const i = w.idx(x, r), lot = w.lot[i], lift = bldH(w, x, r) * HSC;
    const k = lot ? lot % R : (((x * 73856093) ^ (r * 19349663)) & 15) % R;
    const px = x * TILE, py = r * TILE - lift;
    // 난간 — 길이나 다른 건물과 맞닿은 가장자리
    const same = (dx, dy) => isB(x + dx, r + dy) && w.lot[w.idx(x + dx, r + dy)] === lot;
    ctx.fillStyle = 'rgba(160,176,198,.16)';
    if (!same(0, 1)) ctx.fillRect(px, py + TILE - 3.5, TILE, 3);
    if (!same(0, -1)) ctx.fillRect(px, py + 0.5, TILE, 3);
    if (!same(-1, 0)) ctx.fillRect(px + 0.5, py, 3, TILE);
    if (!same(1, 0)) ctx.fillRect(px + TILE - 3.5, py, 3, TILE);
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    if (!same(0, -1)) ctx.fillRect(px, py + 3.5, TILE, 3);
    if (!same(-1, 0)) ctx.fillRect(px + 3.5, py, 3, TILE);
    ctx.fillStyle = 'rgba(0,0,0,.1)';                                   // 난간 안쪽 그늘 (두 겹 — 깊이)
    if (!same(0, -1)) ctx.fillRect(px, py + 6.5, TILE, 5);
    if (!same(-1, 0)) ctx.fillRect(px + 6.5, py, 5, TILE);
    // 옥상 설비 — 계단실 · 실외기 · 환기구 · 물탱크 · 태양광 · 안테나 · 옥상 텃밭. 높이가 있어 남쪽 면과 윗면이 보인다
    const feat = roofFeat(w)[i];
    if (feat) {
      const hh = ((x * 2654435761) ^ (r * 40503)) >>> 0, T = w.theme.key;
      const rbox = (X, Y, Wd, Dp, e, side, top) => {
        ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.fillRect(X + 3, Y + 3, Wd, Dp);              // 지붕에 진 그늘
        ctx.fillStyle = side; ctx.fillRect(X, Y + Dp - e, Wd, e);
        ctx.fillStyle = top; ctx.fillRect(X, Y - e, Wd, Dp);
        ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fillRect(X, Y - e, Wd, 1.2);             // 윗면 모서리 빛
      };
      if (feat === 1) {                                                 // 계단실 — 한 층 높이의 작은 집, 남쪽에 문
        const ux = px + 6 + (hh >> 4) % 10, uy = py + 8 + (hh >> 8) % 10, mat = wallMat(w, lotHash(w, x, r));
        rbox(ux, uy, 30, 22, 18, shade(mat[0], 0.8), shade(roofs[k], 1.35));
        ctx.fillStyle = '#0d1014'; ctx.fillRect(ux + 18, uy + 22 - 13, 8, 12);
        if ((hh >> 12) % 4 === 0) { ctx.fillStyle = 'rgba(214,170,96,.7)'; ctx.fillRect(ux + 20, uy + 22 - 16, 4, 2); }   // 문 위 등
      } else if (feat === 2) {                                          // 실외기 둘
        for (let q = 0; q < 2; q++) {
          const ux = px + 6 + q * 20 + (hh >> 4) % 4, uy = py + 12 + (hh >> 8) % 12;
          rbox(ux, uy, 17, 12, 7, '#3a424c', '#59626c');
          ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.arc(ux + 8.5, uy - 1, 4, 0, 6.283); ctx.fill();
        }
      } else if (feat === 3 && T === 'seoul') {                         // 서울 옥상의 파란 물탱크
        const ux = px + 14 + (hh >> 5) % 12, uy = py + 14 + (hh >> 9) % 12;
        ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.arc(ux + 4, uy + 5, 9, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#3d5a6a'; ctx.beginPath(); ctx.arc(ux, uy - 4, 9, 0, 6.283); ctx.fill();
        ctx.fillRect(ux - 9, uy - 4, 18, 8);
        ctx.fillStyle = '#4c6e80'; ctx.beginPath(); ctx.arc(ux, uy - 8, 9, 0, 6.283); ctx.fill();
      } else if (feat === 3) {                                          // 다리 위 원통 물탱크
        const ux = px + 16 + (hh >> 5) % 12, uy = py + 18 + (hh >> 9) % 8;
        ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(ux + 4, uy + 4, 11, 8, 0, 0, 6.283); ctx.fill();
        ctx.strokeStyle = '#3a3c3e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ux - 7, uy); ctx.lineTo(ux - 7, uy - 10); ctx.moveTo(ux + 7, uy); ctx.lineTo(ux + 7, uy - 10); ctx.stroke();
        ctx.fillStyle = '#6a6458'; ctx.fillRect(ux - 10, uy - 24, 20, 14);
        ctx.fillStyle = '#857e70'; ctx.beginPath(); ctx.ellipse(ux, uy - 24, 10, 5, 0, 0, 6.283); ctx.fill();
      } else if (feat === 4) {                                          // 태양광 판
        for (let q = 0; q < 3; q++) for (let j = 0; j < 2; j++) {
          const ux = px + 5 + q * 13, uy = py + 8 + j * 16;
          ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(ux + 2, uy + 2, 11, 13);
          ctx.fillStyle = '#1d2c44'; ctx.fillRect(ux, uy - 3, 11, 13);
          ctx.fillStyle = 'rgba(140,170,220,.22)'; ctx.fillRect(ux, uy + 1, 11, 0.8); ctx.fillRect(ux + 5, uy - 3, 0.8, 13);
          ctx.fillStyle = 'rgba(200,220,255,.12)'; ctx.fillRect(ux, uy - 3, 11, 1.2);
        }
      } else if (feat === 5 && (T === 'seoul' || T === 'bangkok')) {    // 옥상 텃밭 — 화분과 상자
        for (let q = 0; q < 5; q++) {
          const ux = px + 8 + ((hh >> (q * 3)) % 30), uy = py + 8 + ((hh >> (q * 3 + 5)) % 30);
          ctx.fillStyle = '#3a2c22'; ctx.fillRect(ux - 4, uy - 2, 9, 6);
          ctx.fillStyle = q % 2 ? '#2f4a2a' : '#3e5a30'; ctx.beginPath(); ctx.arc(ux, uy - 4, 4.5, 0, 6.283); ctx.fill();
        }
      } else if (feat === 6) {                                          // 접시 안테나
        const ux = px + 20 + (hh >> 5) % 10, uy = py + 22 + (hh >> 9) % 10;
        ctx.strokeStyle = '#555a60'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ux, uy); ctx.lineTo(ux, uy - 10); ctx.stroke();
        ctx.fillStyle = '#9a9ea4'; ctx.beginPath(); ctx.ellipse(ux - 2, uy - 13, 7, 5, -0.5, 0, 6.283); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(ux - 1, uy - 12, 4, 3, -0.5, 0, 6.283); ctx.fill();
      } else if (feat === 7) {                                          // 환기구
        const ux = px + 10 + (hh >> 4) % 22, uy = py + 12 + (hh >> 8) % 20;
        rbox(ux, uy, 8, 8, 6, '#2e3236', '#4c5258');
        ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(ux + 2, uy - 4, 4, 4);
      } else if (feat === 8) {                                          // 지붕의 물웅덩이
        ctx.fillStyle = 'rgba(140,165,190,.07)'; ctx.beginPath(); ctx.ellipse(px + 24, py + 26, 14, 7, 0.3, 0, 6.283); ctx.fill();
      }
    }
  }
}

/** 필지의 외벽 재료 [색, 벽돌 여부] — 테마마다 다르다 (서울은 붉은 벽돌이 많고 도쿄는 타일 · 콘크리트) */
function wallMat(w, lh) {
  const m = w.theme.walls || [[WALLS[lh % WALLS.length], 0]];
  return m[(lh >>> 3) % m.length];
}
/** 벽돌 결 — 4px 줄마다 줄눈, 반 장씩 어긋난 세로 줄눈, 벽돌마다 조금씩 다른 색 */
/** 벽돌 결 — 4px 줄마다 줄눈, 반 장씩 어긋난 세로 줄눈, 벽돌마다 조금씩 다른 색 (96×48) */
function drawBrick(x) {
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const CH = 4, BW = 10;
  for (let r = 0; r < 48 / CH; r++) {
    const off = (r & 1) * BW / 2;
    for (let b = -1; b < 96 / BW + 1; b++) {
      const bx = b * BW + off, v = rnd();
      x.fillStyle = v < 0.3 ? 'rgba(0,0,0,.16)' : v < 0.55 ? 'rgba(255,220,200,.06)' : v < 0.6 ? 'rgba(0,0,0,.3)' : 'rgba(0,0,0,0)';
      x.fillRect(bx, r * CH, BW, CH);
      x.fillStyle = 'rgba(0,0,0,.32)'; x.fillRect(bx, r * CH, 1, CH);
    }
    x.fillStyle = 'rgba(0,0,0,.34)'; x.fillRect(0, r * CH + CH - 1, 96, 1);
    x.fillStyle = 'rgba(255,240,220,.05)'; x.fillRect(0, r * CH, 96, 0.7);
  }
}
/** 미장 · 타일 벽 — 얼룩과 빗물이 흘러내린 세로 자국 (96×96) */
function drawStucco(x) {
  let seed = 23; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 260; i++) { x.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.07)'; x.fillRect(rnd() * 96, rnd() * 96, 1 + rnd() * 2, 1 + rnd() * 2); }
  for (let i = 0; i < 9; i++) {
    const sx = rnd() * 96, sy = rnd() * 40, len = 20 + rnd() * 56;
    const g = x.createLinearGradient(0, sy, 0, sy + len);
    g.addColorStop(0, 'rgba(0,0,0,.16)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(sx, sy, 2 + rnd() * 4, len);
  }
  x.fillStyle = 'rgba(0,0,0,.08)'; for (let k = 0; k < 96; k += 24) x.fillRect(0, k, 96, 0.8);
}

/** 옥상 방수층 — 얼룩과 시트 이음매 (96×96) */
function drawRoof(x) {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) {
    x.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.05)';
    x.beginPath(); x.ellipse(rnd() * 96, rnd() * 96, 3 + rnd() * 10, 2 + rnd() * 6, rnd() * 3, 0, 6.283); x.fill();
  }
  x.fillStyle = 'rgba(0,0,0,.14)';
  for (let k = 0; k < 96; k += 32) { x.fillRect(0, k, 96, 1); x.fillRect(k + 11, 0, 1, 96); }
}

/** 미리 구운 무늬 — 화면 픽셀과 1:1 로 굽는다(가로 배율 DPR, 세로는 기울기 TILT 까지). 찍을 때 늘이거나 줄이지
    않으니 거르기(smoothing)를 꺼도 깨끗하고, 소프트웨어 렌더러에서도 단색 칠하기와 비슷한 비용이 된다.
    확대해 찍던 때는 카메라를 당기자 화면 전체를 거르며 늘이느라 58 → 43fps 까지 떨어졌다.
    그리는 배율이 바뀌면(자동 화질 · 카메라 거리) 다시 굽는다 */
/** 지역의 길 무늬 — 모래 · 흙 · 돌(베네치아 판석) · 눈 */
function streetPat(base, draw) {
  return x => { const S = 192; let seed = 53; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; x.fillStyle = base; x.fillRect(0, 0, S, S); draw(x, S, rnd); };
}
const drawSandRoad = streetPat('#6e5634', (x, S, r) => {
  for (let i = 0; i < 1800; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,225,170,.07)' : 'rgba(40,25,10,.1)'; x.fillRect(r() * S, r() * S, 1.5, 1.5); }
  x.lineWidth = 1.2; for (let i = 0; i < 46; i++) { const sx = r() * S, sy = r() * S; x.strokeStyle = r() < 0.5 ? 'rgba(40,25,8,.3)' : 'rgba(255,225,170,.12)'; x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(sx + 12, sy - 4, sx + 26, sy); x.stroke(); } });
const drawDirtRoad = streetPat('#33281c', (x, S, r) => {
  for (let i = 0; i < 26; i++) { x.fillStyle = r() < 0.5 ? 'rgba(10,6,3,.35)' : 'rgba(110,90,60,.16)'; x.beginPath(); x.ellipse(r() * S, r() * S, 8 + r() * 24, 5 + r() * 14, r() * 3, 0, 6.283); x.fill(); }
  for (let i = 0; i < 700; i++) { x.fillStyle = r() < 0.5 ? 'rgba(150,130,100,.25)' : 'rgba(0,0,0,.3)'; x.fillRect(r() * S, r() * S, 1.5, 1.5); } });
const drawStoneRoad = streetPat('#3a3936', (x, S, r) => {
  for (let row = 0; row < S / 24; row++) for (let c = -1; c < S / 40 + 1; c++) { const v = 52 + r() * 18; x.fillStyle = `rgb(${v},${v - 1},${v - 4})`; x.fillRect(c * 40 + (row % 2) * 20 + 1, row * 24 + 1, 38, 22); }
  for (let i = 0; i < 500; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.1)'; x.fillRect(r() * S, r() * S, 1, 1); } });
const drawSnowRoad = streetPat('#8a929c', (x, S, r) => {
  for (let i = 0; i < 24; i++) { x.fillStyle = r() < 0.6 ? 'rgba(60,72,90,.18)' : 'rgba(255,255,255,.18)'; x.beginPath(); x.ellipse(r() * S, r() * S, 12 + r() * 30, 6 + r() * 14, r() * 3, 0, 6.283); x.fill(); }
  x.fillStyle = 'rgba(55,65,80,.28)'; for (const tx of [44, 74, 124, 154]) x.fillRect(tx, 0, 8, S); });
const drawMarsRoad = streetPat('#4a1e10', (x, S, r) => {
  for (let i = 0; i < 26; i++) { x.fillStyle = r() < 0.5 ? 'rgba(20,6,2,.25)' : 'rgba(170,80,48,.18)'; x.beginPath(); x.ellipse(r() * S, r() * S, 10 + r() * 26, 6 + r() * 14, r() * 3, 0, 6.283); x.fill(); }
  for (let i = 0; i < 700; i++) { x.fillStyle = r() < 0.5 ? 'rgba(220,130,90,.12)' : 'rgba(0,0,0,.18)'; x.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2); } });
const PATS = { road_mars: [192, 192, drawMarsRoad], road_sand: [192, 192, drawSandRoad], road_dirt: [192, 192, drawDirtRoad], road_stone: [192, 192, drawStoneRoad], road_snow: [192, 192, drawSnowRoad], road: [288, 288, drawRoad], side: [96, 96, drawSide], brick: [96, 48, drawBrick], stucco: [96, 96, drawStucco], roof: [96, 96, drawRoof] };
const patCache = {};
function bakedPattern(key) {
  // 자동 화질이 배율을 조금씩 바꿀 때마다 다시 굽지 않게 1/4 단위로 묶는다 (그 정도 차이는 눈에 띄지 않는다)
  const R = Math.max(0.5, Math.min(4, Math.round(DPR * 4) / 4));
  const hit = patCache[key];
  if (hit && hit.R === R) return hit.p;
  const [Sw, Sh, draw] = PATS[key];
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(Sw * R)); c.height = Math.max(1, Math.round(Sh * R * TILT));
  const x = c.getContext('2d'); x.scale(c.width / Sw, c.height / Sh);
  draw(x);
  const p = ctx.createPattern(c, 'repeat');
  p.setTransform(new DOMMatrix().scale(Sw / c.width, Sh / c.height));
  patCache[key] = { R, p };
  return p;
}

/** 도시 — 건물 줄과 서 있는 것(사람 · 감염체 · 탈것 · 길가 장식)을 북쪽부터 번갈아 그린다 */
function drawCity(cam, g, w) {
  const x0 = Math.floor(cam.x / TILE) - 1, y0 = Math.floor(cam.y / TILE) - 1;
  // 지붕이 위로 떠 있으므로 화면 아래쪽 바깥의 건물도 그 지붕이 보일 수 있다
  const x1 = Math.ceil((cam.x + W) / TILE), y1 = Math.ceil((cam.y + VH()) / TILE) + 3;
  const rows = [];
  for (let r = y0; r <= y1; r++) rows.push([]);
  const put = (x, y, f, o, m = 90) => {
    if (x < cam.x - m || x > cam.x + W + m || y < cam.y - m || y > cam.y + VH() + m * 2) return;
    rows[clamp(Math.floor(y / TILE), y0, y1) - y0].push({ y, f, o });
  };
  for (const pr of w.props) put(pr.x, pr.y, 2, pr);
  for (const d of w.decor) if (MODELS.STANDING[d.kind]) put(d.x, d.y, 3, d, 60);
  let shown = 0;
  for (const z of g.zombies) { put(z.x, z.y, 0, z, 120); if (z.lit > 0.05) shown++; }
  // 화면에 감염체가 많이 드러나면 인형을 간단하게 그려 프레임을 지킨다.
  // 인형을 1.3배 키운 뒤로는 한 마리가 칠하는 넓이가 1.7배라 문턱도 그만큼 낮춘다 (22 → 16)
  MODELS.lod = shown + (g.lightning > 0.1 ? g.zombies.length : 0) > 16 ? 1 : 0;
  if (!g.player.dead) put(g.player.x, g.player.y, 1, g.player, 120);
  for (let r = y0; r <= y1; r++) {
    worldTransform(ctx, cam);
    buildingRow(w, r, x0, x1);
    const L = rows[r - y0];
    if (!L.length) continue;
    L.sort((a, b) => a.y - b.y);
    screenTransform(ctx, cam);
    for (const it of L) {
      if (it.f === 0) drawZombie(it.o);
      else if (it.f === 1) drawPlayer(it.o);
      else if (it.f === 2) MODELS.prop(ctx, it.o);
      else { const d = it.o, o = DECOR_OFF[d.wall] || DECOR_OFF.s; MODELS.decor(ctx, d, d.x + o[0], d.y + o[1]); }
    }
  }
  worldTransform(ctx, cam);
}

/** 남쪽 건물에 가려진 생존자 — 윤곽을 비쳐 보인다 */
function drawXray(cam, g, w) {
  const p = g.player;
  if (p.dead) return;
  const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
  let hid = false;
  for (let k = 1; k <= 3 && !hid; k++) for (let x = Math.floor((p.x - 7) / TILE); x <= Math.floor((p.x + 7) / TILE); x++) {
    if (w.deco[w.idx(x, ty + k)] !== D_BUILDING) continue;
    if ((ty + k) * TILE - bldH(w, x, ty + k) * HSC < p.y - 4) { hid = true; break; }
  }
  if (!hid) return;
  screenTransform(ctx, cam);
  ctx.globalAlpha = 0.42;
  MODELS.player(ctx, p, '#a9bccd');
  for (const z of g.zombies) {
    if (z.lit < 0.3 || Math.hypot(z.x - p.x, z.y - p.y) > 200) continue;
    MODELS.zombie(ctx, z, '#b9776a');
  }
  ctx.globalAlpha = 1;
  worldTransform(ctx, cam);
}

const DECOR_OFF = { n: [0, -16], w: [-16, 0], e: [16, 0], s: [0, 0] };
/** 바닥에 붙은 장식 — 강 위의 배, 세워 둔 자전거. 서 있는 장식은 drawCity 에서 입체로 */
function drawDecorFlat(cam, w) {
  const vis = (x, y, m) => !(x < cam.x - m || x > cam.x + W + m || y < cam.y - m || y > cam.y + VH() + m);
  for (const d of w.decor) {
    if (!vis(d.x, d.y, 60)) continue;
    const o = DECOR_OFF[d.wall] || DECOR_OFF.s, x = d.x + o[0], y = d.y + o[1];
    if (d.kind === 'boat') {
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.a);
      ctx.fillStyle = '#3a2c22'; ctx.beginPath(); ctx.ellipse(0, 0, 44, 9, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#4c3a2c'; ctx.fillRect(-20, -5, 26, 10);
      ctx.restore();
    } else if (d.kind === 'bike') {
      ctx.strokeStyle = '#6a737c'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x - 7, y, 5, 0, 6.283); ctx.arc(x + 7, y, 5, 0, 6.283); ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.stroke();
    }
  }
}

function drawExit(g, w) {
  if (!g.exitOpen || g.level.objective.type === 'endless') return;
  const t = g.time * 2.4;
  const r = 40 + Math.sin(t) * 5;
  ctx.save();
  ctx.translate(w.exit.x, w.exit.y);
  ctx.strokeStyle = 'rgba(120,220,255,.5)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.stroke();
  ctx.strokeStyle = 'rgba(120,220,255,.22)';
  ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, 6.283); ctx.stroke();
  ctx.fillStyle = 'rgba(120,220,255,.07)';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill();
  ctx.restore();
}

function drawPlayer(p) {
  MODELS.player(ctx, p);
  // 근접 밀치기 — 가슴 높이에서 반원으로 휘두른다
  const sw = p.meleeAnim > 0 ? Math.sin((1 - p.meleeAnim / 0.32) * Math.PI) : 0;
  if (sw > 0.02) {
    ctx.strokeStyle = `rgba(226,238,250,${0.3 * sw})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(p.x, p.y * TILT - 10, 34, 34 * TILT, 0, p.angle - 1, p.angle + 1); ctx.stroke();
  }
}

/** 돌진 · 도약 예고선 — 2D · 3D 가 함께 쓴다 */
function telegraphs(g) {
  const out = [];
  for (const z of g.zombies) {
    if (z.dead) continue;
    if (z.chargePhase === 'wind') out.push({ x: z.x, y: z.y, dir: z.chargeDir, len: z.t.boss ? 820 : 560, w: z.r * 1.8, locked: !!z.chargeLocked });
    else if (z.leapPhase === 'crouch' && z.t.leap) out.push({ x: z.x, y: z.y, dir: z.leapDir, len: z.t.leap.speed * z.t.leap.dur, w: z.r * 1.3, locked: z.crouchT <= z.t.leap.lock });
  }
  return out;
}
window.LC_TELEGRAPHS = telegraphs;
function drawZombie(z) {
  // Darkwood 처럼 — 거리·건물 같은 정적인 것은 어둠 속에서도 희미하게 보이지만,
  // 적은 손전등 원뿔 안에서만 형체가 있다. 밖에서는 붉은 눈(발광 층)만 남는다.
  // 바로 곁(손이 닿는 거리)과 번개만 예외다 — "번개가 치면 무리가 보인다"
  const p = G.player, d = Math.hypot(z.x - p.x, z.y - p.y);
  const vis = Math.max(z.lit, clamp((120 - d) / 50, 0, 1), G.lightning * 1.4, z.t.boss ? 0.5 : 0);
  if (vis <= 0.01) return;
  if (z.hp < z.hpMax * 0.5 && z.look) z.look.blood = true;
  ctx.globalAlpha = clamp(vis, 0, 1);
  // 손전등을 받으면 밝은 면이 플레이어 쪽을 향한다 (화면 좌표의 방향)
  const L = MODELS.light;
  if (z.lit > 0.05 && p.lightRange > 0) {
    const dx = p.x - z.x, dy = (p.y - z.y) * TILT, n = Math.hypot(dx, dy) || 1;
    L.x = dx / n; L.y = dy / n - 0.25; L.k = z.lit;
  } else { L.x = -0.55; L.y = -0.8; L.k = 0; }
  MODELS.zombie(ctx, z, z.flash > 0 ? '#f4f1ea' : null);    // 맞은 순간 하얗게 번쩍인다
  L.x = -0.55; L.y = -0.8; L.k = 0;
  ctx.globalAlpha = 1;
}

function drawCorpse(c, cam) {
  if (c.x < cam.x - 60 || c.x > cam.x + W + 60 || c.y < cam.y - 60 || c.y > cam.y + VH() + 60) return;
  ctx.globalAlpha = clamp(1 - c.age / 240, 0.25, 1);
  // 쓰러지는 첫 1초 — 폭발엔 떠올랐다 떨어지고, 밀치기엔 돌고, 무릎 꿇으면 잠깐 작게 웅크린다
  const a = c.age || 0;
  if (a < 1 && c.how) {
    const cy = c.y * TILT;
    let lift = 0, rot = 0, sq = 1;
    if (c.how === 'blast') { const k = Math.min(1, a / 0.75); lift = Math.sin(k * Math.PI) * 34; rot = (1 - k) * 4; }
    else if (c.how === 'spin') { const k = Math.min(1, a / 0.6); rot = (1 - k * k) * -3; }
    else if (c.how === 'knees') { const k = Math.min(1, a / 0.85); sq = k < 0.5 ? 0.82 : 0.82 + (k - 0.5) * 0.36; }
    else if (c.how === 'crumple') { const k = Math.min(1, a / 0.8); sq = 0.75 + 0.25 * k; }
    ctx.save(); ctx.translate(c.x, cy - lift); ctx.rotate(rot); ctx.scale(sq, sq); ctx.translate(-c.x, -cy);
    MODELS.corpse(ctx, c);
    ctx.restore(); ctx.globalAlpha = 1;
    return;
  }
  MODELS.corpse(ctx, c);
  ctx.globalAlpha = 1;
}

function drawPickup(pk, time, cam) {
  if (pk.p.icon === 'goal') {
    // 보급 상자 — 끈으로 묶은 나무 궤짝이 바닥에 놓여 있다
    screenTransform(ctx, cam);
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath(); ctx.ellipse(pk.x + 2, (pk.y + 3) * TILT, 15, 9, 0, 0, 6.283); ctx.fill();
    const at = MODELS.box(ctx, pk.x, pk.y, 0.35, -10, 10, -8, 8, 0, 15, '#6a8a96', '#4f6e7a', (c2, f) => {
      c2.fillStyle = 'rgba(0,0,0,.3)';
      for (const u of [0.22, 0.78]) { const a = f(u - 0.03, 0), b = f(u + 0.03, 0), c = f(u + 0.03, 1), e = f(u - 0.03, 1);
        c2.beginPath(); c2.moveTo(a[0], a[1]); c2.lineTo(b[0], b[1]); c2.lineTo(c[0], c[1]); c2.lineTo(e[0], e[1]); c2.fill(); }
    });
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); for (const lx of [-5.6, 5.6]) { const a = at(lx, -8, 15), b = at(lx, 8, 15); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); } ctx.stroke();
    ctx.fillStyle = '#59b7d8'; { const c = at(0, 0, 15); ctx.fillRect(c[0] - 3, c[1] - 1.5, 6, 3); }
    worldTransform(ctx, cam);
    return;
  }
  const y = pk.y + Math.sin(pk.bob) * 2.5;
  ctx.save();
  ctx.translate(pk.x, y);
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.beginPath(); ctx.ellipse(0, 8, 11, 5, 0, 0, 6.283); ctx.fill();
  ctx.fillStyle = pk.p.col;
  if (pk.p.icon === 'goal') {
    ctx.fillRect(-9, -9, 18, 18);
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(-9, -2, 18, 4);
  } else if (pk.p.icon === 'bat') {
    ctx.fillRect(-4, -9, 8, 17); ctx.fillRect(-2, -12, 4, 3);
  } else if (pk.p.icon === 'med') {
    ctx.fillRect(-8, -6, 16, 12);
    ctx.fillStyle = '#f4efe8'; ctx.fillRect(-1.5, -3.5, 3, 7); ctx.fillRect(-4.5, -1.5, 9, 3);
  } else if (pk.p.icon === 'gun') {
    ctx.fillRect(-10, -3, 20, 6);
    ctx.fillRect(-4, 0, 5, 7);
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(4, -2, 7, 3);
  } else if (pk.p.icon === 'round') {
    for (let k = -1; k <= 1; k++) {
      ctx.fillRect(k * 5 - 1.5, -8, 3, 15);
      ctx.fillStyle = '#d8c070'; ctx.fillRect(k * 5 - 1.5, -10, 3, 3); ctx.fillStyle = pk.p.col;
    }
  } else if (pk.p.icon === 'shell') {
    ctx.fillRect(-7, -6, 5, 13); ctx.fillRect(1, -6, 5, 13);
    ctx.fillStyle = '#e8e2d0'; ctx.fillRect(-7, -6, 5, 4); ctx.fillRect(1, -6, 5, 4);
  } else if (pk.p.icon === 'note') {
    // 종이 한 장 — 바람에 살짝 들린다
    ctx.rotate(Math.sin(pk.bob * 0.7) * 0.15);
    ctx.fillStyle = '#e8e2d0'; ctx.fillRect(-8, -10, 16, 20);
    ctx.fillStyle = '#c9c2ae'; ctx.beginPath(); ctx.moveTo(4, -10); ctx.lineTo(8, -6); ctx.lineTo(4, -6); ctx.fill();
    ctx.fillStyle = 'rgba(60,60,60,.55)';
    for (let k = 0; k < 4; k++) ctx.fillRect(-5, -4 + k * 4, k === 3 ? 6 : 10, 1.2);
  } else if (pk.p.icon === 'nade') {
    ctx.beginPath(); ctx.arc(0, 1, 6.5, 0, 6.283); ctx.fill();
    ctx.fillRect(-1.5, -9, 3, 4);
  } else if (pk.p.icon === 'fuel') {
    // 붉은 연료통 — 손잡이와 주둥이
    ctx.fillRect(-8, -9, 16, 19);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(-5, -6, 10, 2); ctx.fillRect(-6, -2, 12, 1.5);
    ctx.fillStyle = '#9a2a1e'; ctx.fillRect(-4, -13, 6, 4); ctx.fillRect(4, -12, 3, 4);
  } else {
    ctx.fillRect(-8, -5, 16, 10);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(-6, -3, 3, 6); ctx.fillRect(-1.5, -3, 3, 6); ctx.fillRect(3, -3, 3, 6);
  }
  ctx.restore();
}

/* ═══════════ 여정 지도 ═══════════
   대략의 해안선(손으로 짚은 몇십 개 점)만으로 동아시아 · 동남아를 그리고, 지나온 길은 실선, 이번 길은
   점선이 1.6초에 걸쳐 그어진다. 정확한 지도가 아니라 '얼마나 멀리 왔는가'를 보이려는 그림이다. */
const COAST = [
  // 대륙 — 말레이반도 끝에서 시계 방향으로 한 바퀴 (경도, 위도)
  [[103.9, 1.3], [104.3, 1.7], [103.4, 3.9], [103.0, 5.6], [102.1, 6.3], [100.6, 7.4], [100.0, 9.3], [99.3, 10.6], [99.9, 12.6], [100.5, 13.4],
   [101.3, 12.7], [102.5, 12.1], [103.6, 10.6], [104.8, 10.2], [105.1, 8.7], [106.6, 9.7], [107.2, 10.5], [109.2, 11.6], [109.3, 13.5], [108.7, 15.6],
   [107.1, 17.1], [105.8, 18.8], [106.7, 20.6], [108.0, 21.6], [109.7, 21.5], [110.4, 20.4], [111.0, 21.5], [113.5, 22.2], [116.5, 23.0], [118.7, 24.6],
   [119.6, 26.2], [121.0, 28.0], [121.9, 30.0], [121.8, 31.3], [120.8, 32.6], [119.4, 34.7], [120.4, 36.1], [122.5, 37.2], [120.8, 37.7], [118.9, 37.5],
   [117.7, 38.6], [118.9, 39.2], [121.0, 39.0], [121.6, 39.6], [122.3, 40.5], [124.3, 39.9], [125.2, 38.0], [126.6, 37.4], [126.2, 35.2], [126.4, 34.4],
   [127.6, 34.7], [129.3, 35.2], [129.5, 36.5], [128.6, 38.5], [127.6, 39.8], [129.7, 40.9], [130.7, 42.3], [131, 46], [90, 46], [90, 16],
   [94.4, 16.0], [97.6, 16.5], [98.6, 13.0], [98.4, 10.0], [98.3, 8.0], [100.3, 5.5], [101.3, 2.8], [103.5, 1.4]],
  // 일본 (규슈 · 혼슈 · 시코쿠를 한 덩어리로)
  [[129.9, 33.2], [130.2, 31.4], [131.1, 31.4], [131.8, 33.0], [132.6, 33.0], [133.3, 33.4], [134.7, 33.8], [135.3, 34.5], [136.9, 34.5], [137.4, 34.7],
   [138.7, 34.7], [139.8, 35.0], [140.4, 35.2], [140.9, 36.9], [141.0, 38.3], [141.5, 39.6], [141.4, 41.4], [140.3, 41.2], [140.0, 40.1], [139.7, 38.5],
   [138.6, 37.8], [137.3, 37.4], [136.7, 36.7], [135.9, 35.7], [134.4, 35.6], [132.6, 35.4], [131.0, 34.3]],
  // 홋카이도
  [[140.0, 41.6], [141.2, 41.9], [143.3, 42.0], [145.4, 43.3], [144.5, 44.1], [141.7, 45.4], [141.4, 43.4], [140.4, 43.2]],
  // 타이완 · 하이난
  [[120.1, 23.0], [121.0, 25.2], [121.9, 24.9], [120.9, 22.0]],
  [[108.6, 19.2], [110.0, 20.1], [111.0, 19.6], [110.1, 18.4], [109.0, 18.4]],
  // 수마트라 · 보르네오 일부
  [[95.3, 5.6], [97.5, 5.2], [100.4, 2.2], [103.7, -0.9], [106.1, -3.1], [104.7, -5.9], [102.3, -4.0], [100.4, -1.0], [98.6, 1.7], [96.4, 3.4]],
  [[109.0, 1.6], [110.4, 1.7], [111.8, 2.9], [113.0, 3.2], [115.5, 5.4], [116.8, 6.9], [119.2, 5.3], [117.9, 1.0], [116.6, -2.4], [113.0, -3.2], [110.2, -2.9], [109.0, -0.5]],
  // 필리핀 (루손 · 민다나오를 거칠게)
  [[120.6, 18.5], [122.2, 18.5], [122.0, 16.2], [121.6, 14.2], [124.0, 12.5], [125.6, 11.0], [126.5, 7.3], [125.4, 5.6], [123.0, 7.5], [122.0, 6.9],
   [123.4, 10.5], [120.9, 13.7], [120.0, 16.0]]
];
// 지나는 길 — 도시 사이 바닷길/육로를 대략 짚은 경유점
const LEGS = {
  'seoul>tokyo': [[127.0, 37.55], [126.3, 35.0], [128.6, 34.0], [131.0, 33.7], [134.0, 33.4], [137.5, 34.2], [139.7, 35.68]],
  'tokyo>bangkok': [[139.7, 35.68], [137.0, 33.6], [131.5, 30.5], [125.0, 25.0], [119.5, 21.0], [113.0, 18.0], [109.5, 9.5], [106.5, 7.6], [104.0, 8.0], [102.2, 10.6], [100.8, 12.8], [100.5, 13.75]],
  'bangkok>singapore': [[100.5, 13.75], [99.6, 11.0], [99.4, 9.0], [100.4, 6.5], [101.6, 3.2], [103.82, 1.35]]
};
const ORDER = ['seoul', 'tokyo', 'bangkok', 'singapore'];
/* 2부 — 세계 지도. 아프리카 · 유라시아 남쪽 · 남아메리카 동쪽 · 남극을 몇십 점으로만 */
const COAST2 = [
  // 유라시아 — 지브롤터에서 북유럽 · 시베리아를 돌아 동아시아 · 동남아 · 인도 · 아라비아 · 지중해 북안
  [[-9.5, 37], [-9, 43], [-2, 43.5], [-4.5, 48.5], [2, 51], [8, 54], [10, 57.5], [12, 56], [18, 60], [22, 65], [25, 71], [40, 68], [60, 70], [80, 73], [110, 76], [140, 72], [155, 60],
   [155, 45], [131, 43], [129.5, 36], [126.5, 34.5], [126.6, 37.4], [125, 39.5], [121, 39], [118, 38.5], [121, 37], [119.5, 34.5], [122, 30], [117, 23.5], [110, 21], [108, 21.5], [106, 18], [109, 12], [106, 9], [103, 10.5],
   [100.5, 13.4], [99.5, 9.5], [100.5, 6], [101.5, 3], [103.9, 1.3], [101, 4], [98.5, 8], [98.3, 13], [97.5, 16.5], [94.4, 16], [92, 21], [88.5, 21.6], [86.5, 20], [80.3, 15.5], [80, 10], [77.5, 8], [76, 10], [73, 17],
   [72.5, 21], [70, 22.5], [67, 24.8], [61, 25.2], [57, 26.5], [56, 24.5], [59.8, 22.4], [57, 18.5], [52, 16], [45, 12.8], [43.3, 12.8], [42.5, 15.5], [39, 21.5], [35, 28], [34.3, 28.1], [32.6, 29.9], [32.3, 31.2],
   [34.5, 31.6], [35.9, 35.3], [36, 36.8], [30, 36.3], [27, 37.2], [26.3, 40.2], [23, 40.5], [22.5, 36.6], [21.2, 37.9], [19.4, 41.8], [16, 43.5], [13.6, 45.6], [12.3, 45.4], [12.4, 44.2], [14.2, 42.2], [16.2, 41.3], [18.5, 40.1],
   [16.6, 38.2], [15.6, 40.1], [12, 41.9], [10.2, 43.9], [7.5, 43.8], [3, 43.2], [3.2, 41.7], [0, 39.5], [-0.5, 38], [-2.1, 36.7], [-5.4, 36.1]],
  // 아프리카
  [[-17, 14.7], [-16.3, 21], [-13, 27.5], [-9.6, 30.4], [-6.8, 34], [-5.9, 35.8], [-2, 35.1], [3, 36.8], [10.2, 37.2], [11, 35.2], [10, 33.6], [12, 32.9], [15.3, 32.3], [19.9, 30.9], [20, 32.2], [23, 32.6], [25, 31.6], [29.5, 31],
   [32.3, 31.3], [32.6, 29.9], [33.5, 27.5], [35.5, 23.8], [37.3, 19], [38.5, 17.9], [41.5, 14.5], [43.3, 12.5], [44.5, 10.4], [51.2, 11.8], [51, 10.5], [49.5, 6.5], [46, 2], [41.5, -2], [39.2, -6.5], [40.5, -10.5], [40.6, -15],
   [35.4, -22.5], [32.6, -26], [32, -28.8], [30, -31.3], [27.5, -33.5], [22.5, -34], [18.4, -34.2], [17.8, -32], [15, -26.5], [12.3, -18.8], [11.8, -15.8], [13.7, -11.5], [12.2, -6], [8.8, -1], [9.6, 3.8], [8.5, 4.5],
   [5.5, 4.2], [4, 6.3], [1.2, 6.1], [-2, 4.7], [-7.5, 4.4], [-11.4, 6.9], [-13.3, 9], [-15, 11], [-16.8, 12.4]],
  // 마다가스카르 · 스리랑카 · 영국 · 아이슬란드 · 그린란드
  [[49.3, -12], [50.5, -15.5], [47.2, -25], [44, -24.8], [43.3, -21.5], [44.4, -16.5], [47, -15.2]],
  [[79.8, 6.2], [80, 9.8], [81.8, 7.6], [81.2, 6.2]],
  [[-5.6, 50.1], [1.4, 51.2], [1.7, 52.8], [0, 53.5], [-1.6, 55.6], [-1.8, 57.6], [-3.3, 58.6], [-5, 58.6], [-6.2, 56.5], [-4.9, 55], [-3, 54.8], [-4.6, 53.3], [-4.2, 52.3], [-5.2, 51.7]],
  [[-24.3, 65.5], [-22, 66.4], [-16.2, 66.5], [-13.6, 65.2], [-15, 64.3], [-18.8, 63.4], [-22.6, 63.8]],
  [[-55, 60], [-43, 60], [-38, 65.5], [-22, 70], [-19, 75], [-25, 80], [-60, 80], [-70, 77], [-56, 70], [-53, 66]],
  // 남아메리카
  [[-80, 9], [-77, 8.5], [-75.5, 10.6], [-71.5, 12.4], [-68, 10.6], [-62, 10.5], [-57, 6], [-52, 5], [-50, 0], [-44, -2.5], [-35, -5.5], [-35, -9], [-39, -15], [-40.5, -22], [-48.5, -26], [-53.4, -33.8], [-58.4, -34.6],
   [-57.5, -38], [-62.3, -38.8], [-65, -42], [-67.5, -46], [-68.5, -51], [-69, -53], [-71.5, -54.3], [-75, -52], [-74, -45], [-73.5, -40], [-71.5, -30], [-70.4, -18.5], [-76, -14], [-81.3, -5], [-80, 0], [-78.5, 7]],
  // 오스트레일리아 · 수마트라 · 보르네오
  [[114, -22], [122, -18], [130, -12.5], [137, -12], [142, -10.8], [146, -19], [153.5, -25], [150, -37], [141, -38.4], [135, -35], [129, -31.6], [115, -34], [113.5, -26]],
  [[95.3, 5.6], [97.5, 5.2], [100.4, 2.2], [103.7, -0.9], [106.1, -3.1], [104.7, -5.9], [102.3, -4.0], [100.4, -1.0], [98.6, 1.7], [96.4, 3.4]],
  [[109, 1.6], [111.8, 2.9], [115.5, 5.4], [119.2, 5.3], [117.9, 1], [116.6, -2.4], [113, -3.2], [110.2, -2.9]],
  // 남극 — 반도가 북쪽으로 뻗는다
  [[-80, -73], [-75, -71.5], [-68, -67.5], [-63, -64.5], [-57, -63.3], [-59, -65], [-62, -69], [-55, -75], [-40, -78], [-20, -73], [0, -70], [30, -69.5], [60, -67], [90, -66], [120, -66.5], [160, -69], [160, -90], [-80, -90]]
];
const LEGS2 = {
  'singapore>varanasi': [[103.82, 1.35], [100.5, 4], [97.5, 6.5], [92, 11], [89, 17.5], [88.2, 21.6], [88.3, 22.6], [86.5, 24.4], [84.5, 25.4], [83.0, 25.32]],
  'varanasi>cairo': [[83.0, 25.32], [86, 24.5], [88.2, 21.6], [86, 15], [82.2, 6], [77, 5.8], [66, 13], [55, 13.3], [46, 12.4], [43.4, 12.6], [39.5, 19.5], [35.8, 25.5], [33.6, 28], [32.6, 29.8], [31.24, 30.04]],
  'cairo>venice': [[31.24, 30.04], [31.6, 31.4], [29, 33], [24, 34.5], [20, 36.2], [18.8, 39.6], [17, 41.6], [14, 44], [12.34, 45.44]],
  'venice>reykjavik': [[12.34, 45.44], [14, 43.5], [17.5, 40.5], [18, 38.3], [14.5, 36.5], [10, 37.6], [4, 37.6], [-2, 36.2], [-6, 35.9], [-10, 37], [-10, 43.5], [-8, 48], [-6.5, 49.5], [-11, 53], [-14, 59], [-21.9, 64.15]],
  'cairo>istanbul': [[31.24, 30.04], [31.6, 31.6], [30, 33], [27.5, 35.4], [26.2, 37.5], [26, 39.6], [26.4, 40.2], [27.6, 40.7], [28.98, 41.01]],
  'istanbul>venice': [[28.98, 41.01], [27.6, 40.7], [26.4, 40.2], [25.2, 38.5], [24.5, 36.2], [21.5, 36.4], [19.2, 38.6], [18.6, 40.3], [17, 41.6], [14, 44], [12.34, 45.44]],
  'reykjavik>rio': [[-21.9, 64.15], [-27, 56], [-30, 40], [-27, 18], [-25, 2], [-31, -10], [-38, -18], [-43.2, -22.9]],
  'rio>antarctic': [[-43.2, -22.9], [-46, -32], [-52, -44], [-58, -54], [-62, -60], [-64.05, -64.77]],
  'reykjavik>antarctic': [[-21.9, 64.15], [-27, 56], [-30, 40], [-27, 18], [-25, 2], [-31, -18], [-43, -38], [-55, -52], [-61, -58], [-63, -62.5], [-64.05, -64.77]]
};
const ORDER2 = ['singapore', 'varanasi', 'cairo', 'istanbul', 'venice', 'reykjavik', 'rio', 'antarctic'];
let journeyRaf = 0;
function drawJourney(cv, j) {
  cancelAnimationFrame(journeyRaf);
  const c = cv.getContext('2d'), Wd = cv.width, Hd = cv.height;
  const two = ORDER2.indexOf(j.to) > 0;
  const CO = two ? COAST2 : COAST, LG = two ? LEGS2 : LEGS, OR = two ? ORDER2 : ORDER;
  const [L0, L1, A0, A1] = two ? [-82, 160, -82, 82] : [94, 146, -4, 44];
  const P = ([lo, la]) => [(lo - L0) / (L1 - L0) * Wd, (A1 - la) / (A1 - A0) * Hd];
  const path = (pts, close) => { c.beginPath(); pts.forEach((q, i) => { const [x, y] = P(q); i ? c.lineTo(x, y) : c.moveTo(x, y); }); if (close) c.closePath(); };
  const legPts = (k, upto) => {
    const pts = LG[k]; if (upto >= 1) return pts;
    let len = 0; const seg = [];
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); len += d; }
    const out = [pts[0]]; let left = len * upto;
    for (let i = 1; i < pts.length; i++) {
      if (left >= seg[i - 1]) { out.push(pts[i]); left -= seg[i - 1]; continue; }
      const t = left / seg[i - 1]; out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]); break;
    }
    return out;
  };
  const toI = OR.indexOf(j.to), t0 = performance.now();
  const frame = now => {
    const k = Math.min(1, (now - t0) / 1600), e = 1 - Math.pow(1 - k, 3);
    c.clearRect(0, 0, Wd, Hd);
    c.fillStyle = '#04070b'; c.fillRect(0, 0, Wd, Hd);
    c.strokeStyle = 'rgba(120,150,180,.07)'; c.lineWidth = 1;          // 경위선
    const gs = two ? 20 : 5;
    for (let lo = Math.ceil(L0 / gs) * gs; lo <= L1; lo += gs) { c.beginPath(); const [x] = P([lo, 0]); c.moveTo(x, 0); c.lineTo(x, Hd); c.stroke(); }
    for (let la = Math.ceil(A0 / gs) * gs; la <= A1; la += gs) { c.beginPath(); const [, y] = P([0, la]); c.moveTo(0, y); c.lineTo(Wd, y); c.stroke(); }
    for (const poly of CO) { path(poly, true); c.fillStyle = '#121a20'; c.fill(); c.strokeStyle = 'rgba(150,170,180,.35)'; c.lineWidth = 1.2; c.stroke(); }
    // 지나온 길 — 실선
    for (let i = 1; i < toI; i++) { path(LG[OR[i - 1] + '>' + OR[i]]); c.strokeStyle = 'rgba(232,226,208,.45)'; c.lineWidth = 2; c.setLineDash([]); c.stroke(); }
    // 이번 길 — 점선이 그어진다
    path(legPts(j.from + '>' + j.to, e)); c.strokeStyle = '#f0b429'; c.lineWidth = 2.5; c.setLineDash([7, 6]); c.stroke(); c.setLineDash([]);
    OR.forEach((id, i) => {
      const [x, y] = P(STORY.cities[id]);
      const here = id === j.to && k >= 1, past = i < toI || here;
      c.fillStyle = id === j.to ? '#f0b429' : past ? '#e8e2d0' : 'rgba(150,160,170,.5)';
      c.beginPath(); c.arc(x, y, id === j.to ? 5 + (here ? Math.sin(now / 200) * 1.5 : 0) : 4, 0, 6.283); c.fill();
      if (here) { c.strokeStyle = 'rgba(240,180,41,.4)'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, 11 + (now / 60) % 14, 0, 6.283); c.stroke(); }
      c.font = `600 14px ${CANVAS_FONT}`; c.fillStyle = past ? '#e8e2d0' : 'rgba(170,175,180,.6)';
      const right = id === 'tokyo' || id === 'singapore' && two;
      c.textAlign = right ? 'right' : 'left';
      c.fillText(T(CITY_NAME[id]), x + (right ? -10 : 10), y + (id === 'singapore' || id === 'antarctic' ? 16 : -8));
    });
    if (!$('scrStory').classList.contains('hidden')) journeyRaf = requestAnimationFrame(frame);
  };
  journeyRaf = requestAnimationFrame(frame);
}

/** 비상 중계기 — 철제 함과 안테나. 바닥 고리가 가동 정도를 보여 준다 */
function drawRelay(r, g, cam) {
  if (r.x < cam.x - 120 || r.x > cam.x + W + 120 || r.y < cam.y - 160 || r.y > cam.y + VH() + 120) return;
  const on = r === g.relayOn;
  ctx.lineWidth = 3;
  ctx.strokeStyle = r.done ? 'rgba(120,230,140,.55)' : 'rgba(240,180,41,.22)';
  ctx.beginPath(); ctx.arc(r.x, r.y, 78, 0, 6.283); ctx.stroke();
  if (!r.done && r.prog > 0) {
    ctx.strokeStyle = on ? 'rgba(240,200,80,.9)' : 'rgba(240,180,41,.5)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(r.x, r.y, 78, -Math.PI / 2, -Math.PI / 2 + r.prog * 6.283); ctx.stroke();
  }
  screenTransform(ctx, cam);
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.beginPath(); ctx.ellipse(r.x + 3, (r.y + 4) * TILT, 16, 10, 0, 0, 6.283); ctx.fill();
  const at = MODELS.box(ctx, r.x, r.y, 0, -11, 11, -8, 8, 0, 26, '#4e5a60', '#39444a');
  const base = at(0, 0, 26), tip = at(0, 0, 74);
  ctx.strokeStyle = '#9aa4aa'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
  ctx.lineWidth = 1.5;
  for (const h of [44, 58]) { const a = at(-7, 0, h), b = at(7, 0, h); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  const blink = r.done ? 1 : on ? (Math.sin(g.time * 14) > 0 ? 1 : 0.3) : (Math.sin(g.time * 3 + r.x) > 0.6 ? 1 : 0.25);
  ctx.fillStyle = r.done ? `rgba(120,240,140,${blink})` : `rgba(255,180,50,${blink})`;
  ctx.beginPath(); ctx.arc(tip[0], tip[1], 3.5, 0, 6.283); ctx.fill();
  const panel = at(0, 8, 16);
  ctx.fillStyle = r.done ? '#5fd17a' : on ? '#f0c040' : '#6b5a2a';
  ctx.fillRect(panel[0] - 5, panel[1] - 2, 10, 4);
  worldTransform(ctx, cam);
}

/** 미션 변주의 물건 — 제어반(크레센도) · 보급 상자(투하) · 연료 넣는 자리(탈것) */
function drawTwist(o, g, cam) {
  if (o.x < cam.x - 140 || o.x > cam.x + W + 140 || o.y < cam.y - 200 || o.y > cam.y + VH() + 140) return;
  const tw = g.tw;
  if (o.kind === 'tank') {
    if (o.done || g.player.carry !== 'fuel') return;
    ctx.strokeStyle = `rgba(224,80,58,${0.4 + Math.sin(g.time * 5) * 0.2})`; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(o.x, o.y, 120, 0, 6.283); ctx.stroke();
    return;
  }
  if (o.kind === 'panel') {
    const running = tw && tw.phase === 'run';
    ctx.lineWidth = 3; ctx.strokeStyle = o.done ? 'rgba(120,230,140,.55)' : 'rgba(240,180,41,.25)';
    ctx.beginPath(); ctx.arc(o.x, o.y, 70, 0, 6.283); ctx.stroke();
    if (!o.done && o.prog > 0) { ctx.strokeStyle = running ? 'rgba(255,90,60,.9)' : 'rgba(240,200,80,.9)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(o.x, o.y, 70, -Math.PI / 2, -Math.PI / 2 + o.prog * 6.283); ctx.stroke(); }
    screenTransform(ctx, cam);
    const at = MODELS.box(ctx, o.x, o.y, 0, -10, 10, -7, 7, 0, 30, '#5a5048', '#433b35');
    const top = at(0, 0, 38), blink = o.done ? 1 : running ? (Math.sin(g.time * 16) > 0 ? 1 : 0.2) : (Math.sin(g.time * 4) > 0.3 ? 1 : 0.3);
    ctx.fillStyle = o.done ? `rgba(120,240,140,${blink})` : running ? `rgba(255,70,50,${blink})` : `rgba(255,180,50,${blink})`;
    ctx.beginPath(); ctx.arc(top[0], top[1], 4, 0, 6.283); ctx.fill();
    worldTransform(ctx, cam);
    return;
  }
  if (o.kind === 'crate') {
    if (o.lost) return;
    const lift = (o.fall || 0) * 260;
    if (!o.done) { const gl = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, 120); gl.addColorStop(0, `rgba(255,60,40,${0.35 + Math.sin(g.time * 9) * 0.1})`); gl.addColorStop(1, 'rgba(255,60,40,0)'); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(o.x, o.y, 120, 0, 6.283); ctx.fill(); }
    screenTransform(ctx, cam);
    MODELS.box(ctx, o.x, o.y, 0, -11, 11, -11, 11, lift, lift + 16, o.done ? '#4a4a40' : '#5a6a48', '#46543a');
    if (lift > 0) { const at = MODELS.box(ctx, o.x, o.y, 0, -1, 1, -1, 1, lift + 16, lift + 17, '#999', '#888'); const t = at(0, 0, lift + 60); ctx.fillStyle = 'rgba(220,220,210,.85)'; ctx.beginPath(); ctx.ellipse(t[0], t[1], 26, 12, 0, Math.PI, 0); ctx.fill(); }
    worldTransform(ctx, cam);
  }
}

function drawGrenade(gr) {
  ctx.save();
  ctx.translate(gr.x, gr.y); ctx.rotate(gr.spin);
  ctx.fillStyle = '#4a5540';
  ctx.beginPath(); ctx.arc(0, 0, 5, 0, 6.283); ctx.fill();
  ctx.fillStyle = gr.fuse < 0.45 && ((gr.fuse * 14) | 0) % 2 ? '#ff6a4a' : '#2b3128';
  ctx.fillRect(-1.5, -8, 3, 4);
  ctx.restore();
}

/* 어둠 마스크: 검은 막에 손전등 모양의 구멍을 뚫는다.
   원작 화면을 재 보면 평균 밝기는 255 중 약 22, 거의 검은 픽셀은 70% 안팎이다 — 완전한 암흑이
   아니라 도로와 건물 윤곽이 희미하게 보이는 밤이고, 손전등이 그 위를 하얗게 쓸고 지나간다.
   막의 기본 농도는 밝기 설정(0‒100)으로 조절한다. */
function darkLevel(g) {
  // 원작 예고편의 밤 — 불빛 밖도 거리 · 벽 · 사람 윤곽은 읽힌다. 눈만 보이는 깊은 어둠은 밝기를 낮춰서
  const base = 0.66 - (SETTINGS.brightness - 50) * 0.0048;   // 0 → 0.9, 50 → 0.66, 100 → 0.42
  return clamp(base - g.lightning * (SETTINGS.flash ? 0.72 : 0.25), 0.06, 0.985);
}

/** 손전등 그림자 — 불빛 안의 사람 · 탈것이 빛 반대쪽으로 길게 그림자를 드리운다.
    원작은 그림자가 발밑 원 하나뿐이었다. 세계 좌표 다각형 { pts, bx, by, ex, ey } 목록을 프레임마다 한 번 만든다.
    · 사람: 빛 쪽 반대로 사다리꼴. 서 있는 몸이 화면에서 위(북)로 솟으므로, 그림자가 북쪽으로 갈 때는
      몸이 가리는 만큼(머리 높이) 떨어진 데서 시작한다 — 제 몸을 제 그림자가 덮지 않게
    · 탈것: 빛을 등진 모서리마다 빛 반대로 늘인 사각형 (몸체 안쪽은 칠하지 않는다) */
let SHADOWS = [], shadowFrame = -1;
function lightShadows(g, p, w, range) {
  if (shadowFrame === g.frameNo) return SHADOWS;
  shadowFrame = g.frameNo;
  const out = SHADOWS = [];
  if (range <= 0 || p.dead) return out;
  const ca = Math.cos(p.angle), sa = Math.sin(p.angle), cosH = Math.cos(CONE_HALF + 0.14);
  const inBeam = (x, y, pad) => {
    const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
    if (d < 16 || d > range + pad) return 0;
    return (dx * ca + dy * sa) / d >= cosH ? d : 0;
  };
  for (const z of g.zombies) {
    if (z.dead) continue;
    const d = inBeam(z.x, z.y, 10);
    if (!d) continue;
    const ux = (z.x - p.x) / d, uy = (z.y - p.y) / d, nx = -uy, ny = ux;
    const r = (z.t.crawl ? 9 : Math.min(16, 6 + z.t.size * 0.45)) * MODELS.CS;
    const s0 = r * 0.4 + Math.max(0, -uy) * MODELS.headZ(z) * ZK * 0.92;
    const L = Math.min(range - d + 40, 60 + d * 0.5);
    if (L <= s0 + 8) continue;
    const r1 = r * (1.2 + L / 300);
    const bx = z.x + ux * s0, by = z.y + uy * s0, ex = z.x + ux * L, ey = z.y + uy * L;
    out.push({ pts: [bx + nx * r, by + ny * r, ex + nx * r1, ey + ny * r1, ex - nx * r1, ey - ny * r1, bx - nx * r, by - ny * r], bx, by, ex, ey });
  }
  for (const pr of w.props) {
    const d = inBeam(pr.x, pr.y, 60);
    if (!d) continue;
    const c = Math.cos(pr.a), s = Math.sin(pr.a), hx = pr.w / 2, hy = pr.h / 2;
    const C = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map(([u, v]) => [pr.x + u * c - v * s, pr.y + u * s + v * c]);
    const L = Math.min(range - d + 80, 140 + d * 0.4);
    const lift = (pr.kind === 'bus' || pr.kind === 'truck' || pr.kind === 'mtruck' || pr.kind === 'wagon' ? 30 : 20) * ZK;
    const ux0 = (pr.x - p.x) / d, uy0 = (pr.y - p.y) / d, off = Math.max(0, -uy0) * lift;
    for (let i = 0; i < 4; i++) {
      const a = C[i], b = C[(i + 1) % 4];
      const mx = (a[0] + b[0]) / 2 - pr.x, my = (a[1] + b[1]) / 2 - pr.y;
      if (mx * (a[0] + b[0] - 2 * p.x) + my * (a[1] + b[1] - 2 * p.y) <= 0) continue;     // 빛을 향한 모서리
      const da = Math.hypot(a[0] - p.x, a[1] - p.y), db = Math.hypot(b[0] - p.x, b[1] - p.y);
      const ua = [(a[0] - p.x) / da, (a[1] - p.y) / da], ub = [(b[0] - p.x) / db, (b[1] - p.y) / db];
      const a0 = [a[0] + ua[0] * off, a[1] + ua[1] * off], b0 = [b[0] + ub[0] * off, b[1] + ub[1] * off];
      out.push({ pts: [a0[0], a0[1], b0[0], b0[1], b[0] + ub[0] * L, b[1] + ub[1] * L, a[0] + ua[0] * L, a[1] + ua[1] * L],
                 bx: (a0[0] + b0[0]) / 2, by: (a0[1] + b0[1]) / 2, ex: pr.x + ux0 * L, ey: pr.y + uy0 * L });
    }
  }
  return out;
}
function shadowPath(c, sh) {
  const q = sh.pts;
  c.beginPath(); c.moveTo(q[0], q[1]);
  for (let i = 2; i < q.length; i += 2) c.lineTo(q[i], q[i + 1]);
  c.closePath();
}

function drawDarkness(cam, g, p, w) {
  const dark = darkLevel(g);
  const E = eyeOf(cam);
  mctx.setTransform(MDPR, 0, 0, MDPR, 0, 0);
  mctx.globalCompositeOperation = 'source-over';
  mctx.clearRect(0, 0, W, H);
  mctx.fillStyle = `rgba(4,6,10,${dark})`;
  mctx.fillRect(0, 0, W, H);

  mctx.globalCompositeOperation = 'destination-out';
  mctx.save();
  worldTransform(mctx, cam, MDPR);

  // 주변 미광 (손전등이 꺼져도 남는 최소 시야)
  const amb = p.lightOn && p.battery > 0 ? 128 : 92;
  let gr = mctx.createRadialGradient(p.x, p.y, 6, p.x, p.y, amb);
  gr.addColorStop(0, 'rgba(0,0,0,.86)');
  gr.addColorStop(0.55, 'rgba(0,0,0,.34)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  mctx.fillStyle = gr;
  mctx.beginPath(); mctx.arc(p.x, p.y, amb, 0, 6.283); mctx.fill();

  // 손전등 원뿔 (벽에 가려짐) — 폭이 다른 세 겹을 겹쳐 가장자리를 흐린다.
  // 건물 벽에 닿은 빛은 벽면을 타고 올라가도록 끝점을 지붕선까지 들어 올린다.
  const range = p.lightRange;
  if (range > 0) {
    const layers = [[CONE_HALF, 84, 0.62], [CONE_HALF * 0.7, 56, 0.6], [CONE_HALF * 0.38, 40, 0.7]];
    for (const [half, rays, alpha] of layers) {
      const poly = liftPoly(w.conePoly(p.x, p.y, p.angle, half, range, rays), w, E);
      mctx.beginPath();
      mctx.moveTo(poly[0], poly[1]);
      for (let i = 2; i < poly.length; i += 2) mctx.lineTo(poly[i], poly[i + 1]);
      mctx.closePath();
      gr = mctx.createRadialGradient(p.x, p.y, 10, p.x, p.y, range);
      gr.addColorStop(0, `rgba(0,0,0,${alpha})`);
      gr.addColorStop(0.6, `rgba(0,0,0,${alpha * 0.85})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      mctx.fillStyle = gr;
      mctx.fill();
    }
  }

  // 손전등 그림자 — 열린 빛을 그림자 자리만 다시 어둡게 (끝으로 갈수록 옅게)
  if (range > 0 && texOn()) {
    mctx.globalCompositeOperation = 'source-over';
    for (const sh of lightShadows(g, p, w, range)) {
      const gr = mctx.createLinearGradient(sh.bx, sh.by, sh.ex, sh.ey);
      gr.addColorStop(0, `rgba(4,6,10,${dark * 0.62})`); gr.addColorStop(1, 'rgba(4,6,10,0)');
      mctx.fillStyle = gr; shadowPath(mctx, sh); mctx.fill();
    }
    mctx.globalCompositeOperation = 'destination-out';
  }

  // 폭발 섬광
  for (const f of g.flashes) {
    const k = 1 - f.t / f.life;
    const r = f.r * (0.5 + 0.5 * (1 - k));
    gr = mctx.createRadialGradient(f.x, f.y, 4, f.x, f.y, r);
    gr.addColorStop(0, `rgba(0,0,0,${k})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    mctx.fillStyle = gr;
    mctx.beginPath(); mctx.arc(f.x, f.y, r, 0, 6.283); mctx.fill();
  }
  // 총구 화염
  if (p.muzzle > 0) {
    const r = 160;
    gr = mctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, r);
    gr.addColorStop(0, 'rgba(0,0,0,.55)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    mctx.fillStyle = gr;
    mctx.beginPath(); mctx.arc(p.x, p.y, r, 0, 6.283); mctx.fill();
  }
  mctx.restore();
  // 비네트 — 화면 가장자리를 한 겹 더 어둡게. 따로 화면 전체를 칠하지 않고 절반 해상도의 막에 얹는다
  mctx.globalCompositeOperation = 'source-over';
  const vg = mctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,.55)');
  mctx.fillStyle = vg;
  mctx.fillRect(0, 0, W, H);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(mask, 0, 0, view.width, view.height);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

/** 손전등 빛 — 절반 해상도 층에 그려 그림자 자리를 지우고 화면에 더한다.
    · 가장자리가 부드럽게: 폭이 다른 두 겹(넓고 옅은 것 + 좁고 짙은 것)
    · 가운데 '핫스폿': 실제 손전등처럼 조금 앞에서 가장 밝다
    · 젖은 아스팔트의 번들거림: 빛줄기 방향으로 길게 늘어난 옅은 반사
    · 그림자: 사람 · 탈것 뒤의 빛을 지운다 (겹친 그림자도 한 번만) */
function drawBeam(cam, g, p, w, range) {
  const E = eyeOf(cam);
  gctx.setTransform(1, 0, 0, 1, 0, 0);
  gctx.globalCompositeOperation = 'source-over';
  gctx.clearRect(0, 0, glowCv.width, glowCv.height);
  worldTransform(gctx, cam, MDPR);
  const layer = (half, rays, stops) => {
    const poly = liftPoly(w.conePoly(p.x, p.y, p.angle, half, range, rays), w, E);
    gctx.beginPath(); gctx.moveTo(poly[0], poly[1]);
    for (let i = 2; i < poly.length; i += 2) gctx.lineTo(poly[i], poly[i + 1]);
    gctx.closePath();
    const gr = gctx.createRadialGradient(p.x, p.y, 8, p.x, p.y, range);
    for (const [k, c] of stops) gr.addColorStop(k, c);
    gctx.fillStyle = gr; gctx.fill();
  };
  // 원작의 손전등은 노랗지 않고 거의 흰빛이다. 넓은 겹이 가장자리를, 좁은 겹이 핫스폿을 만든다
  layer(CONE_HALF * 1.02, 56, [[0, 'rgba(230,228,222,.24)'], [0.5, 'rgba(200,202,206,.10)'], [1, 'rgba(180,190,200,0)']]);
  layer(CONE_HALF * 0.6, 40, [[0, 'rgba(240,236,228,.12)'], [0.16, 'rgba(250,246,238,.36)'], [0.42, 'rgba(225,226,228,.16)'], [1, 'rgba(200,205,210,0)']]);
  // 젖은 길의 번들거림 — 빛줄기 가운데를 따라 길쭉한 반사 (벽에 막힌 곳까지만)
  if (texOn()) {
    const reach = Math.min(range * 0.62, w.ray(p.x, p.y, p.angle, range));
    const cx = p.x + Math.cos(p.angle) * reach * 0.62, cy = p.y + Math.sin(p.angle) * reach * 0.62;
    gctx.save(); gctx.translate(cx, cy); gctx.rotate(p.angle);
    const gr = gctx.createRadialGradient(0, 0, 0, 0, 0, reach * 0.55);
    gr.addColorStop(0, 'rgba(200,215,230,.16)'); gr.addColorStop(1, 'rgba(200,215,230,0)');
    gctx.scale(1, 0.22); gctx.fillStyle = gr;
    gctx.beginPath(); gctx.arc(0, 0, reach * 0.55, 0, 6.283); gctx.fill();
    gctx.restore();
  }
  // 그림자 — 빛을 지운다
  gctx.globalCompositeOperation = 'destination-out';
  for (const sh of lightShadows(g, p, w, range)) {
    const gr = gctx.createLinearGradient(sh.bx, sh.by, sh.ex, sh.ey);
    gr.addColorStop(0, 'rgba(0,0,0,.92)'); gr.addColorStop(0.7, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    gctx.fillStyle = gr; shadowPath(gctx, sh); gctx.fill();
  }
  gctx.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(glowCv, 0, 0, view.width, view.height);
  ctx.restore();
}

/* 가산 발광 레이어: 불빛의 따뜻함, 눈, 목표 지점 */
function drawGlow(cam, g, p, w) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  worldTransform(ctx, cam);

  const range = p.lightRange;
  if (range > 0) {
    if (!texOn()) {
      const poly = liftPoly(w.conePoly(p.x, p.y, p.angle, CONE_HALF * 0.96, range, 64), w, eyeOf(cam));
      ctx.beginPath();
      ctx.moveTo(poly[0], poly[1]);
      for (let i = 2; i < poly.length; i += 2) ctx.lineTo(poly[i], poly[i + 1]);
      ctx.closePath();
      const gr = ctx.createRadialGradient(p.x, p.y, 8, p.x, p.y, range);
      // 원작의 손전등은 노랗지 않고 거의 흰빛(밝은 픽셀 평균 RGB ≈ 145,138,138)이다
      gr.addColorStop(0, 'rgba(236,232,226,.42)');
      gr.addColorStop(0.45, 'rgba(205,205,208,.17)');
      gr.addColorStop(1, 'rgba(180,190,200,0)');
      ctx.fillStyle = gr; ctx.fill();
    } else {
      ctx.restore();
      drawBeam(cam, g, p, w, range);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      worldTransform(ctx, cam);
    }
  }

  // 빗방울이 떨어진 자리 — 손전등 빛 안에서만 보이는 작은 물결 (젖은 길)
  if (range > 0 && texOn()) {
    const S = g.splashes || (g.splashes = []), reach = w.ray(p.x, p.y, p.angle, range);
    for (let i = 0; i < 2; i++) {
      const a = p.angle + (Math.random() - 0.5) * CONE_HALF * 1.6, d = 30 + Math.random() * Math.min(range * 0.8, reach + 30);
      S.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, t: 0 });
    }
    ctx.lineWidth = 0.9;
    const P1 = new Path2D(), P2 = new Path2D();
    for (let i = S.length - 1; i >= 0; i--) {
      const q = S[i]; q.t += 1 / 60;
      if (q.t > 0.26 || w.solid(q.x, q.y)) { S.splice(i, 1); continue; }
      const rr = 1 + q.t * 22, P = q.t < 0.1 ? P1 : P2;
      P.moveTo(q.x + rr, q.y); P.ellipse(q.x, q.y, rr, rr * 0.55, 0, 0, 6.283);
    }
    ctx.strokeStyle = 'rgba(210,222,236,.2)'; ctx.stroke(P1);
    ctx.strokeStyle = 'rgba(210,222,236,.07)'; ctx.stroke(P2);
  }

  // 폭발 — 원작 예고편의 노랗고 흰 별 모양 섬광. 짧게 뻗었다가 사그라든다
  for (const f of g.flashes) {
    if (f.burst === undefined) continue;
    const k = 1 - f.t / f.life;
    if (k <= 0.35) continue;
    const kk = (k - 0.35) / 0.65, R = 40 + (1 - kk) * 70;
    ctx.fillStyle = `rgba(255,236,150,${0.55 * kk})`;
    ctx.beginPath();
    for (let i = 0; i < 22; i++) {
      const a = f.burst + i / 22 * 6.283, rr = i & 1 ? R * 0.32 : R * (0.7 + ((i * 7919) % 13) / 13 * 0.6);
      i ? ctx.lineTo(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr) : ctx.moveTo(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
    const gr = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, R * 0.6);
    gr.addColorStop(0, `rgba(255,255,240,${0.9 * kk})`); gr.addColorStop(1, 'rgba(255,220,120,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(f.x, f.y, R * 0.6, 0, 6.283); ctx.fill();
  }

  // 산 웅덩이와 날아오는 산 — 어둠 속에서 스스로 빛나 경고가 된다
  for (const a of g.acids) {
    const k = Math.min(1, a.t / a.max);
    const gr = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, a.r * 1.5);
    gr.addColorStop(0, `rgba(118,200,44,${0.17 * k})`);
    gr.addColorStop(1, 'rgba(70,140,20,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(a.x, a.y, a.r * 1.5, 0, 6.283); ctx.fill();
  }
  for (const sp of g.spits) {
    // 떨어질 곳은 어둠 속에서도 보여야 피한다
    ctx.strokeStyle = `rgba(150,230,70,${0.18 + Math.min(1, sp.t / sp.dur) * 0.3})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sp.tx, sp.ty, 18 + (1 - Math.min(1, sp.t / sp.dur)) * 26, 0, 6.283); ctx.stroke();
    const gr = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, 26);
    gr.addColorStop(0, 'rgba(150,230,70,.30)');
    gr.addColorStop(1, 'rgba(90,170,30,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(sp.x, sp.y, 26, 0, 6.283); ctx.fill();
  }

  // 우는 것 — 아주 희미한 창백한 기운. 깨어날수록 짙어지고 눈이 붉어진다
  for (const z of g.zombies) {
    if (!z.t.weeper || z.rage) continue;
    const d = Math.hypot(z.x - p.x, z.y - p.y);
    if (d > 460) continue;
    const a = (0.05 + (z.startle || 0) * 0.16) * (1 - d / 460);
    const gr = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, 46);
    gr.addColorStop(0, `rgba(220,215,205,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(z.x, z.y, 46, 0, 6.283); ctx.fill();
  }

  // 어둠 속의 눈 — 접근을 알아챌 수 있는 유일한 단서
  for (const z of g.zombies) {
    if (!z.aggro && !(z.t.weeper && z.startle > 0.5)) continue;
    const d = Math.hypot(z.x - p.x, z.y - p.y);
    if (d > 560) continue;
    const a = clamp((1 - d / 560) * 0.5, 0, 0.5) * (0.7 + Math.sin(g.time * 6 + z.phase) * 0.3);
    ctx.fillStyle = `rgba(190,40,30,${a})`;
    const hz = MODELS.headZ(z) * ZK, fw = z.t.crawl ? 8 : 4 + z.t.size * 0.12;
    const ex = z.x + Math.cos(z.face) * fw;
    const ey = z.y + Math.sin(z.face) * fw - hz;
    const nx = -Math.sin(z.face) * 2.6, ny = Math.cos(z.face) * 2.6;
    ctx.beginPath(); ctx.arc(ex + nx, ey + ny, 1.7, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.arc(ex - nx, ey - ny, 1.7, 0, 6.283); ctx.fill();
  }

  drawCityLights(cam, g, w);

  // 경보기 차 — 평소엔 계기판의 붉은 점이 천천히 깜빡인다(건드리지 말라는 신호).
  // 울리면 비상등이 번갈아 번쩍인다
  for (const pr of w.props) {
    if (!pr.alarm || (pr.spent && !pr.ringing) || Math.hypot(pr.x - p.x, pr.y - p.y) > 900) continue;
    if (pr.ringing) {
      const on = ((g.time * 4) | 0) % 2;
      for (const sgn of [-1, 1]) {
        const hx = pr.x + Math.cos(pr.a) * pr.w * 0.5 * sgn, hy = pr.y + Math.sin(pr.a) * pr.w * 0.5 * sgn;
        const gr = ctx.createRadialGradient(hx, hy, 0, hx, hy, 70);
        gr.addColorStop(0, `rgba(255,170,60,${on ? 0.5 : 0.12})`);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(hx, hy, 70, 0, 6.283); ctx.fill();
      }
    } else if ((g.time + pr.x * 0.001) % 1.6 < 0.12) {
      ctx.fillStyle = 'rgba(255,40,30,.75)';
      ctx.beginPath(); ctx.arc(pr.x + Math.cos(pr.a) * 4, pr.y + Math.sin(pr.a) * 4, 1.6, 0, 6.283); ctx.fill();
    }
  }

  // 보급품 반짝임
  for (const pk of g.pickups) {
    const d = Math.hypot(pk.x - p.x, pk.y - p.y);
    if (d > 700) continue;
    const gr = ctx.createRadialGradient(pk.x, pk.y, 0, pk.x, pk.y, 34);
    gr.addColorStop(0, pk.type === 'goal' ? 'rgba(90,190,230,.30)' : pk.type === 'note' ? 'rgba(240,235,220,.22)' : 'rgba(230,200,120,.16)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(pk.x, pk.y, 34, 0, 6.283); ctx.fill();
  }

  // 중계기 — 꺼진 것은 호박색, 켜진 것은 초록. 가동 중이면 맥박처럼
  for (const r of g.relays || []) {
    if (Math.hypot(r.x - p.x, r.y - p.y) > 900) continue;
    const k = r.done ? 0.32 : 0.18 + (r === g.relayOn ? 0.18 + Math.sin(g.time * 10) * 0.08 : 0);
    const gr = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, 90);
    gr.addColorStop(0, r.done ? `rgba(120,230,140,${k})` : `rgba(240,180,41,${k})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(r.x, r.y, 90, 0, 6.283); ctx.fill();
  }

  // 탈출 지점
  if (g.exitOpen && g.level.objective.type !== 'endless') {
    const gr = ctx.createRadialGradient(w.exit.x, w.exit.y, 0, w.exit.x, w.exit.y, 120);
    gr.addColorStop(0, 'rgba(80,200,255,.20)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(w.exit.x, w.exit.y, 120, 0, 6.283); ctx.fill();
  }

  // 총구 · 폭발
  if (p.muzzle > 0) {
    const mx = p.x + Math.cos(p.angle) * 22 * MODELS.CS, my = p.y + Math.sin(p.angle) * 22 * MODELS.CS - GUN_LIFT;
    const gr = ctx.createRadialGradient(mx, my, 0, mx, my, 60);
    gr.addColorStop(0, 'rgba(255,220,150,.55)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(mx, my, 60, 0, 6.283); ctx.fill();
  }
  for (const f of g.flashes) {
    const k = 1 - f.t / f.life;
    const gr = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
    gr.addColorStop(0, `rgba(255,250,240,${0.62 * k})`);
    gr.addColorStop(0.35, `rgba(255,205,140,${0.34 * k})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill();
  }
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
}

let rainT = 0;
function drawRain(g, cam, p) {
  const dt = 1 / 60;
  rainT += dt;
  const wx = g.world && g.world.theme.weather;
  if (wx === 'snow' || wx === 'blizzard' || wx === 'sandstorm') return drawWeather(g, cam, p, wx, dt);
  ctx.strokeStyle = 'rgba(180,200,225,1)';
  // 빗줄기는 화면 단위다 — 카메라를 당겨도 굵기 · 길이가 실제 화면에서 같도록 확대만큼 줄인다
  const zk = 1 / ZOOM;
  ctx.lineWidth = Math.max(0.45, 1.1 * zk);
  // 손전등 빛줄기 안의 빗방울은 반짝인다 — 따로 모아 밝게 한 번 더
  const range = p && !p.dead ? p.lightRange : 0, ca = Math.cos(p ? p.angle : 0), sa = Math.sin(p ? p.angle : 0), cosH = Math.cos(CONE_HALF);
  const lit = range > 0 && texOn() ? new Path2D() : null;
  ctx.beginPath();
  for (const r of g.rain) {
    r.y += r.v * dt * zk; r.x -= r.v * 0.22 * dt * zk;
    if (r.y > H) { r.y = -20; r.x = Math.random() * (W + 400) - 100; }
    if (r.x < -60) r.x = W + 40;
    const x2 = r.x - r.len * 0.22 * zk, y2 = r.y + r.len * zk;
    if (lit) {
      const dx = cam.x + r.x - p.x, dy = cam.y + y2 / TILT - p.y, d = Math.hypot(dx, dy);
      if (d < range * 0.85 && d > 20 && (dx * ca + dy * sa) / d > cosH) { lit.moveTo(r.x, r.y); lit.lineTo(x2, y2); continue; }
    }
    ctx.globalAlpha = r.a;
    ctx.moveTo(r.x, r.y); ctx.lineTo(x2, y2);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  if (lit) { ctx.strokeStyle = 'rgba(225,232,242,.55)'; ctx.stroke(lit); }

  if (g.lightning > 0.01) {
    // 원작의 번개는 화면 전체를 순간적으로 밝힌다(평균 밝기 22 → 120). 섬광을 끈 설정에선 약하게
    ctx.fillStyle = `rgba(196,208,228,${g.lightning * (SETTINGS.flash ? 0.34 : 0.08)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

/** 눈 · 눈보라 · 모래 폭풍 — 비 대신. 폭풍이 짙어지면 화면이 뿌옇게 덮인다 */
function drawWeather(g, cam, p, wx, dt) {
  const zk = 1 / ZOOM, st = g.storm || 0, sand = wx === 'sandstorm';
  const wind = (sand ? 260 : wx === 'blizzard' ? 120 : 30) * (1 + st * 2.5);
  ctx.fillStyle = sand ? 'rgba(214,170,110,.55)' : 'rgba(235,240,248,.75)';
  ctx.beginPath();
  const n = Math.floor(g.rain.length * (sand ? 0.6 + st * 0.4 : wx === 'snow' ? 0.5 : 0.7 + st * 0.3));
  for (let k = 0; k < n; k++) {
    const r = g.rain[k];
    r.y += (sand ? 40 : r.v * 0.14) * dt * zk; r.x += (wind + Math.sin(rainT * 2 + k) * 20) * dt * zk;
    if (r.y > H) { r.y = -10; r.x = Math.random() * (W + 400) - 200; }
    if (r.x > W + 60) { r.x = -40; r.y = Math.random() * H; }
    const sz = (sand ? 1.2 : 1.6 + (k % 3) * 0.7) * Math.max(0.6, zk);
    if (sand) ctx.rect(r.x, r.y, sz * 5, sz * 0.8); else { ctx.moveTo(r.x + sz, r.y); ctx.arc(r.x, r.y, sz, 0, 6.283); }
  }
  ctx.fill();
  if (st > 0) { ctx.fillStyle = sand ? `rgba(150,110,60,${0.3 * st})` : `rgba(200,212,226,${0.26 * st})`; ctx.fillRect(0, 0, W, H); }
  if (g.lightning > 0.01 && !sand) { ctx.fillStyle = `rgba(196,208,228,${g.lightning * (SETTINGS.flash ? 0.2 : 0.06)})`; ctx.fillRect(0, 0, W, H); }
}

function drawVignette() {
  const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32,
                                      W / 2, H / 2, Math.max(W, H) * 0.78);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(1, 'rgba(0,0,0,.55)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, W, H);
}

/* ═══════════ 지도 ═══════════
   원작 1.1 업데이트: "새 전체 지도와 특히 도움이 되는 화면 미니맵".
   도시를 타일당 1px 로 한 번 그려 두고, 미니맵은 플레이어 둘레만 잘라 원형으로 보여 준다. */
function mapImage(w) {
  const c = document.createElement('canvas');
  c.width = w.w; c.height = w.h;
  const m = c.getContext('2d'), img = m.createImageData(w.w, w.h);
  for (let i = 0; i < w.w * w.h; i++) {
    const d = w.deco[i], solid = w.grid[i] === T_WALL;
    let r, gg, b;
    if (d === D_WATER) [r, gg, b] = [24, 52, 78];
    else if (d === D_LANDMARK) [r, gg, b] = [150, 92, 60];
    else if (d === D_GRASS) [r, gg, b] = G.world && G.world.theme.key === 'mars' ? [96, 44, 26] : solid ? [30, 60, 34] : [46, 78, 48];
    else if (d === D_BUILDING) [r, gg, b] = [22, 26, 32];
    else if (solid) [r, gg, b] = [52, 56, 62];
    else if (d === D_PLAZA || d === D_BRIDGE) [r, gg, b] = [104, 104, 100];
    else if (d === D_SIDEWALK) [r, gg, b] = [74, 78, 84];
    else [r, gg, b] = [92, 96, 102];
    img.data[i * 4] = r; img.data[i * 4 + 1] = gg; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
  }
  m.putImageData(img, 0, 0);
  return c;
}

const Minimap = {
  img: null, cv: null,
  reset(w) { this.img = mapImage(w); this.cv = $('minimap'); },
  draw(g) {
    if (!this.img || !this.cv) return;
    const c = this.cv.getContext('2d'), S = this.cv.width, p = g.player;
    const span = 30;                                // 지름에 담는 타일 수
    const k = S / span, px = p.x / TILE, py = p.y / TILE;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 1, 0, 6.283); c.clip();
    c.imageSmoothingEnabled = false;
    c.globalAlpha = 0.9;
    // 지도가 이어 붙으므로 원본 그림을 이웃 칸까지 깔아 둔다
    const W0 = this.img.width, H0 = this.img.height;
    const bx = ((px % W0) + W0) % W0, by = ((py % H0) + H0) % H0;
    for (const ox of [-W0, 0, W0]) for (const oy of [-H0, 0, H0])
      c.drawImage(this.img, (ox - (bx - span / 2)) * k, (oy - (by - span / 2)) * k, W0 * k, H0 * k);
    c.globalAlpha = 1;
    const dot = (wx, wy, col, r) => {
      let x = (wx / TILE - px) * k + S / 2, y = (wy / TILE - py) * k + S / 2;
      const d = Math.hypot(x - S / 2, y - S / 2), lim = S / 2 - r - 3;
      if (d > lim) { x = S / 2 + (x - S / 2) / d * lim; y = S / 2 + (y - S / 2) / d * lim; }  // 가장자리에 붙인다
      c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill();
    };
    const ob = g.level.objective;
    for (const pk of g.pickups) if (pk.type === 'goal') dot(pk.x, pk.y, '#59b7d8', 5);
    for (const r of g.relays || []) dot(r.x, r.y, r.done ? '#7fe08a' : '#f0b429', 5);
    for (const o of g.twObjs || []) if (!o.done && !o.lost && o.kind !== 'tank') dot(o.x, o.y, o.kind === 'crate' ? '#ff5a4a' : '#f0b429', 5);
    for (const pk of g.pickups) if (pk.type === 'fuel' && !pk.dead) dot(pk.x, pk.y, '#e0503a', 4);
    if ((g.exitOpen || ob.type === 'finale') && ob.type !== 'endless') dot(g.world.exit.x, g.world.exit.y, '#78dcff', 6);
    // 플레이어 — 바라보는 쪽을 가리키는 삼각형
    c.translate(S / 2, S / 2); c.rotate(p.angle);
    c.fillStyle = '#f0b429';
    c.beginPath(); c.moveTo(10, 0); c.lineTo(-6, -6); c.lineTo(-3, 0); c.lineTo(-6, 6); c.closePath(); c.fill();
    c.restore();
  }
};

/** 게임 중 전체 지도 — 지금 있는 곳 · 바라보는 쪽 · 남은 보급 상자 · 집결지 · 랜드마크 */
function drawBigMap(g) {
  const w = g.world, cv = $('bigMapCv'), img = Minimap.img || mapImage(w);
  const css = Math.floor(Math.min(innerWidth - 32, innerHeight - 96, 720));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = cv.height = Math.floor(css * dpr); cv.style.width = cv.style.height = css + 'px';
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = '#07090c'; c.fillRect(0, 0, css, css);
  const k = css / Math.max(w.w, w.h), ox = (css - w.w * k) / 2, oy = (css - w.h * k) / 2;
  c.imageSmoothingEnabled = false;
  c.drawImage(img, ox, oy, w.w * k, w.h * k);
  // 원환 지도 — 좌표를 지도 한 장 안으로 접는다
  const fold = (x, y) => { const WW = w.w * TILE, HH = w.h * TILE; x %= WW; if (x < 0) x += WW; y %= HH; if (y < 0) y += HH; return [ox + x / TILE * k, oy + y / TILE * k]; };
  c.font = `600 12px ${CANVAS_FONT}`; c.textAlign = 'center'; c.textBaseline = 'bottom';
  for (const lm of w.landmarks) {
    const x = ox + (lm.x + lm.w / 2) * k, y = oy + lm.y * k, tw = c.measureText(T(lm.name)).width;
    c.fillStyle = 'rgba(0,0,0,.65)'; c.fillRect(x - tw / 2 - 4, y - 17, tw + 8, 16);
    c.fillStyle = '#f2c98a'; c.fillText(T(lm.name), x, y - 3);
  }
  const mark = (x, y, col, r) => { const [sx, sy] = fold(x, y); c.fillStyle = col; c.beginPath(); c.arc(sx, sy, r, 0, 6.283); c.fill(); c.strokeStyle = 'rgba(0,0,0,.75)'; c.lineWidth = 2; c.stroke(); };
  for (const pk of g.pickups) if (pk.type === 'goal') mark(pk.x, pk.y, '#59b7d8', 5);
  for (const r of g.relays || []) mark(r.x, r.y, r.done ? '#7fe08a' : '#f0b429', 6);
  for (const o of g.twObjs || []) if (!o.lost && o.kind !== 'tank') mark(o.x, o.y, o.done ? '#7fe08a' : o.kind === 'crate' ? '#ff5a4a' : '#f0b429', 6);
  for (const pk of g.pickups) if (pk.type === 'fuel' && !pk.dead) mark(pk.x, pk.y, '#e0503a', 5);
  if ((g.exitOpen || g.level.objective.type === 'finale') && g.level.objective.type !== 'endless') mark(w.exit.x, w.exit.y, '#78dcff', 7);
  // 나 — 바라보는 쪽 화살표와 손전등 부채
  const [px, py] = fold(g.player.x, g.player.y);
  c.save(); c.translate(px, py); c.rotate(g.player.angle);
  c.fillStyle = 'rgba(240,226,180,.18)'; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 34, -0.45, 0.45); c.closePath(); c.fill();
  c.fillStyle = '#f0b429'; c.strokeStyle = 'rgba(0,0,0,.8)'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(11, 0); c.lineTo(-7, -7); c.lineTo(-3, 0); c.lineTo(-7, 7); c.closePath(); c.stroke(); c.fill();
  c.restore();
}

/** 브리핑 화면의 구역 전체 지도 — 같은 시드라 실제 판과 같은 도시다 */
function drawBriefMap(L) {
  const cv = $('briefMap'), c = cv.getContext('2d'), w = new World(L.seed, L.blocks, cityOpts(L));
  const S = cv.width, k = S / Math.max(w.w, w.h);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = '#07090c'; c.fillRect(0, 0, S, S);
  c.imageSmoothingEnabled = false;
  const ox = (S - w.w * k) / 2, oy = (S - w.h * k) / 2;
  c.drawImage(mapImage(w), ox, oy, w.w * k, w.h * k);
  const mark = (pt, col) => {
    c.fillStyle = col;
    c.beginPath(); c.arc(ox + pt.x / TILE * k, oy + pt.y / TILE * k, 5, 0, 6.283); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = 2; c.stroke();
  };
  c.font = `600 11px ${CANVAS_FONT}`; c.textAlign = 'center'; c.textBaseline = 'bottom';
  for (const lm of w.landmarks) {
    const x = ox + (lm.x + lm.w / 2) * k, y = oy + lm.y * k;
    c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(x - c.measureText(T(lm.name)).width / 2 - 3, y - 15, c.measureText(T(lm.name)).width + 6, 14);
    c.fillStyle = '#f2c98a'; c.fillText(T(lm.name), x, y - 2);
  }
  mark(w.spawn, '#f0b429');
  if (L.objective.type !== 'endless') mark(w.exit, '#78dcff');
}

/* ═══════════ HUD ═══════════ */
let hudT = 0;
G.refreshHud = function (force) {
  const p = this.player, ob = this.level.objective;
  $('hudChapter').textContent = this.challenge ? `CHALLENGE · ${T(this.challenge.name)}` : this.survival ? 'SURVIVAL' : `CHAPTER ${this.levelIndex + 1}`;

  let obj;
  if (this.challenge) obj = T('남은 {s}초 · 점수 {score}', { s: Math.max(0, Math.ceil(this.challenge.time - this.time)), score: this.score.toLocaleString() })
    + (this.combo > 1 ? `  ×${this.comboMul().toFixed(2).replace(/0$/, '')}` : '');
  else if (ob.type === 'endless') obj = T('생존 {s}초 · 점수 {score}', { s: Math.floor(this.time), score: this.score });
  else if (this.exitOpen) obj = ob.type === 'finale' ? T(ob.board || '현문으로 승선하라') : T('집결지로 이동하라');
  else if (ob.type === 'signal') obj = this.relayOn ? T('중계기 가동 중 {p}% — 곁을 지켜라', { p: Math.floor(this.relayOn.prog * 100) })
    : T('중계기 {n}/{t} 가동', { n: this.goalsTotal - this.goalsLeft, t: this.goalsTotal });
  else if (ob.type === 'finale') obj = this.holding ? T(ob.hud || '접안까지 {s}초 — 버텨라', { s: Math.ceil(this.surviveLeft) }) : T(ob.go || '3번 부두로 가라');
  else if (ob.type === 'collect') obj = T('{item} {n}/{t} 확보', { item: T(ob.item || '보급 상자'), n: this.goalsTotal - this.goalsLeft, t: this.goalsTotal });
  else if (ob.type === 'survive') obj = T('{s}초 버텨라', { s: Math.ceil(this.surviveLeft) });
  else if (ob.type === 'purge') obj = T('감염체 {n}/{t} 소탕', { n: this.kills, t: this.goalsTotal });
  else if (ob.type === 'boss') obj = T('그것을 쓰러뜨려라');
  else obj = T('탈출로를 찾아라');
  $('hudObjective').textContent = obj;
  const TN = ['', '모래 — 느려짐', '', '얕은 물 — 느려짐', '', '진흙 — 느려짐', '크레이터 바닥 — 느려짐', '크레이터 둘레 — 느려짐'], tr = p.terr || 0, terEl = $('hudTerr');
  if (terEl) {
    const txt = TN[tr] ? T(TN[tr]) + ` −${Math.round((1 - TERRAIN_SLOW[tr]) * 100)}%` : '';
    if (terEl.textContent !== txt) { terEl.textContent = txt; terEl.hidden = !txt; terEl.dataset.t = tr; }
  }
  const sub = Twist.hud(this) || Specials.hud(this), subEl = $('hudSub');
  if (subEl && subEl.textContent !== sub) { subEl.textContent = sub; subEl.hidden = !sub; }

  $('hudKills').textContent = this.kills;
  const t = Math.floor(this.time);
  $('hudClock').textContent = `${String((t / 60) | 0).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;

  $('gaugeHealth').style.width = (p.hp / p.hpMax * 100) + '%';
  $('gaugeBattery').style.width = p.battery + '%';
  $('valHealth').textContent = Math.ceil(p.hp);
  $('valBattery').textContent = Math.ceil(p.battery);
  $('gaugeStam').style.width = (p.stam / p.stamMax * 100) + '%';
  document.querySelector('.gauge--health').classList.toggle('low', p.hp < 30);
  document.querySelector('.gauge--battery').classList.toggle('charging', !!p.charging);
  document.querySelector('.gauge--stam').classList.toggle('low', p.winded);

  const wp = p.weapon, inMag = p.magOf(wp), spare = p.reserveOf(wp);
  $('hudAmmo').textContent = inMag;
  // 원작 HUD 처럼 총 그림자와 탄창의 남은 알을 눈금으로
  const icon = $('hudGunIcon');
  if (icon.dataset.k !== wp.key) { icon.dataset.k = wp.key; icon.firstChild.setAttribute('d', GUN_ICONS[wp.key] || ''); }
  const pipW = Math.min(4, 120 / wp.mag);
  const pips = $('hudPips');
  pips.parentNode.style.width = (wp.mag * pipW) + 'px';
  pips.style.width = (inMag * pipW) + 'px';
  pips.parentNode.style.setProperty('--pip', pipW + 'px');
  $('hudReserve').textContent = spare === Infinity ? '/ ∞' : '/ ' + spare;
  $('hudWeapon').textContent = p.reloading ? T('장전 중') : T(wp.name);
  const gun = document.querySelector('.ammo__gun');
  gun.classList.toggle('dry', inMag <= Math.max(1, wp.mag * 0.2));
  gun.classList.toggle('reloading', p.reloading);
  $('hudReloadBar').style.width = (p.reloadProgress * 100) + '%';
  $('hudNades').textContent = p.nades;
  if (isTouch) {
    $('btnSprint').classList.toggle('on', input.sprintLatch || !!this.edgeOn);
    // 밀치기 버튼 — 손이 닿는 거리에 감염체가 있으면 커지고 맥박친다
    { let reach = false; for (const z of this.zombies) if (!z.dead && Math.abs(z.x - p.x) < 70 && Math.abs(z.y - p.y) < 70 && Math.hypot(z.x - p.x, z.y - p.y) < 42 + z.r + p.r) { reach = true; break; }
      $('btnMelee').classList.toggle('ready', reach); }
    $('btnSprint').classList.toggle('dim', p.winded);
    $('btnLight').classList.toggle('off', !p.lightOn || p.battery <= 0);
  }

  const slots = $('hudSlots');
  const sig = SLOT_ORDER.filter(k => p.owned.has(k)).join(',') + '|' + wp.key;
  if (slots.dataset.sig !== sig) {
    slots.dataset.sig = sig;
    slots.innerHTML = SLOT_ORDER.filter(k => p.owned.has(k)).map(k =>
      `<span class="${k === wp.key ? 'on' : ''}">${WEAPONS[k].slot > 9 ? ['0', '-', '='][WEAPONS[k].slot - 10] : WEAPONS[k].slot} ${T(WEAPONS[k].name)}</span>`).join('');
  }

  const bossBar = $('bossBar');
  if (this.boss && !this.boss.dead) {
    bossBar.hidden = false;
    $('bossFill').style.width = (this.boss.hp / this.boss.hpMax * 100) + '%';
    bossBar.classList.toggle('winding', this.boss.chargePhase === 'wind');
  } else bossBar.hidden = true;

  $('damageFlash').style.opacity = SETTINGS.flash
    ? Math.min(0.62, p.hurtFlash * 0.55 + (p.hp < 28 ? 0.18 + Math.sin(this.time * 5) * 0.05 : 0))
    : Math.min(0.20, p.hurtFlash * 0.18 + (p.hp < 28 ? 0.1 : 0));

  Minimap.draw(this);

  // 목표 방향 나침반
  const compass = $('hudCompass');
  let tx = null, ty = null;
  if (ob.type === 'endless') { compass.style.display = 'none'; }
  else {
    compass.style.display = '';
    if (this.exitOpen || ob.type === 'finale') { tx = this.world.exit.x; ty = this.world.exit.y; }
    else if (ob.type === 'signal') {
      let bd = 1e9;
      for (const r of this.relays) { if (r.done) continue; const d = Math.hypot(r.x - p.x, r.y - p.y); if (d < bd) { bd = d; tx = r.x; ty = r.y; } }
    }
    else if (ob.type === 'boss' && this.boss && !this.boss.dead) { tx = this.boss.x; ty = this.boss.y; }
    else {
      let best = null, bd = 1e9;
      for (const pk of this.pickups) {
        if (ob.type === 'collect' && pk.type !== 'goal') continue;
        const d = Math.hypot(pk.x - p.x, pk.y - p.y);
        if (d < bd) { bd = d; best = pk; }
      }
      if (ob.type === 'collect' && best) { tx = best.x; ty = best.y; }
    }
    // 미션 변주 — 지금 급한 것(크레센도 장치 · 연료통 · 보급)이 있으면 그쪽을 먼저 가리킨다
    const twt = Twist.target(this);
    if (twt) { tx = twt.x; ty = twt.y; }
    $('hudMeter').style.opacity = tx === null ? '0' : '1';
    if (tx === null) { compass.style.opacity = '0'; }
    else {
      compass.style.opacity = '1';
      const ang = Math.atan2(ty - p.y, tx - p.x) * 180 / Math.PI + 90;
      compass.querySelector('svg').style.transform = `rotate(${ang}deg) translateY(-76px)`;
      $('hudDistance').textContent = $('hudMeter').textContent = Math.round(Math.hypot(tx - p.x, ty - p.y) / TILE * 2.4) + 'm';
    }
  }
};

/** 무기 그림자 — 오른쪽을 향한 옆모습 (viewBox 64×20) */
const GUN_ICONS = {
  pistol:  'M18 5h24v5H29l-3 8h-7l3-8h-4z',
  smg:     'M2 6h44v1h10v2H46v2H33v8h-4v-8h-5l-1 6h-4l1-6h-9v-1H2z',
  shotgun: 'M2 9l12-3h48v3H48v3H36v-3H28l-2 3h-5l-1-3-18 4z',
  rifle:   'M2 8l14-2h46v2H46v3h-6v-2H30l-2 7h-4l1-7-23 3zM22 2h14v3H22z'
};

/* ═══════════ 화면 전환 ═══════════ */
const UI = {
  screens: ['scrTitle', 'scrChapters', 'scrHowto', 'scrBrief', 'scrCity', 'scrPause', 'scrResult',
            'scrSettings', 'scrEnding', 'scrKeys', 'scrAbout', 'scrStory', 'scrJournal', 'scrChallenge'],
  settingsFrom: 'scrTitle',
  hideScreens() { this.screens.forEach(s => $(s).classList.add('hidden')); },
  show(id) { this.hideScreens(); $(id).classList.remove('hidden'); },

  /** 조작법 — 지금 묶인 키로 그린다 */
  buildHowto() {
    const k = a => `<kbd>${KEYBIND.labelOf(a)}</kbd>`;
    const rows = [
      [k('up') + k('left') + k('down') + k('right'), T('이동 (방향키도 됨)')],
      [T('<kbd>마우스</kbd>'), T('손전등 방향 · 조준')],
      [T('<kbd>클릭</kbd>') + k('fire'), T('사격 (불빛 안의 적은 자동 사격)')],
      [k('w1') + k('w2') + k('w3') + k('w4') + k('cycle'), T('무기 전환 (권총 · SMG · 샷건 · 소총)')],
      [k('w5') + k('w6') + k('w7') + k('w8'), T('늘어난 칸 (매그넘 · 자동 샷건 · 경기관총 · 석궁)')],
      [k('arms'), T('무기 고르기 — 고르는 동안 시간이 멈춘다')],
      [k('reload'), T('재장전 (약실이 비면 자동 장전)')],
      [k('melee') + T('<kbd>우클릭</kbd>'), T('근접 밀치기 — 달라붙은 적을 떼어낸다')],
      [k('nade'), T('수류탄 투척')],
      [k('light'), T('손전등 on / off (배터리 절약)')],
      [k('sprint'), T('전력 질주 (기력 소모 — 바닥나면 숨이 찬다)')],
      [k('map'), T('전체 지도 — 보는 동안 시간이 멈춘다')],
      ['<kbd>Esc</kbd>', T('일시정지')]
    ];
    $('howtoKeys').innerHTML = rows.map(([keys, txt]) => `<div>${keys}<span>${txt}</span></div>`).join('');
  },

  /** 키 설정 목록 */
  buildKeys() {
    $('keyList').innerHTML = KEYBIND.ACTIONS.map(a =>
      `<div class="keymap__row"><span>${T(a.name)}</span>` +
      `<button type="button" class="keymap__key${KEYBIND.code(a.id) !== a.def ? ' changed' : ''}" data-bind="${a.id}">${KEYBIND.labelOf(a.id)}</button></div>`).join('');
    $('keyReset').disabled = KEYBIND.isDefault();
  },
  startRebind(id) {
    this.cancelRebind();
    rebinding = id;
    const b = document.querySelector(`[data-bind="${id}"]`);
    if (b) { b.classList.add('wait'); b.textContent = T('키를 누르세요…'); }
    $('keyMsg').textContent = T("'{a}' 에 쓸 키를 누르세요 · Esc 취소", { a: KEYBIND.nameOf(id) });
  },
  cancelRebind() {
    if (!rebinding) return;
    rebinding = null;
    this.buildKeys();
    $('keyMsg').textContent = '';
  },
  finishRebind(code) {
    const id = rebinding;
    if (!id) return;
    if (code === 'Escape') { this.cancelRebind(); return; }
    if (KEYBIND.reserved(code)) { $('keyMsg').textContent = T('{k} 는 쓸 수 없습니다', { k: KEYBIND.label(code) }); return; }
    rebinding = null;
    const swapped = KEYBIND.set(id, code);
    this.buildKeys();
    $('keyMsg').textContent = swapped
      ? T("{k} → {a} · '{b}' 은(는) {kb} 로 바꿨습니다", { k: KEYBIND.label(code), a: KEYBIND.nameOf(id), b: KEYBIND.nameOf(swapped), kb: KEYBIND.labelOf(swapped) })
      : T('{k} → {a}', { k: KEYBIND.label(code), a: KEYBIND.nameOf(id) });
    for (const k of [id, swapped]) {
      const b = k && document.querySelector(`[data-bind="${k}"]`);
      if (b) { b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 500); }
    }
    SFX.click();
  },
  enterPlay() {
    this.hideScreens();
    $('arms').classList.add('hidden');
    applyTouchLayout();
    $('hud').classList.remove('hidden');
    $('touch').classList.toggle('hidden', !isTouch);
  },
  enterMenu() {
    $('arms').classList.add('hidden');
    $('hud').classList.add('hidden');
    $('touch').classList.add('hidden');
    $('appVersion').textContent = 'v' + APP.version;
    SFX.menuMusic(true);
    const b = G.bestSurvival();
    $('bestSurvival').textContent = b ? T('{m}분 {s}초', { m: Math.floor(b / 60), s: b % 60 }) : '—';
    $('recordChip').title = T('서바이벌 최고 기록');
    /* 타이틀 — 글자 대신 아이콘. 큰 버튼 하나(이어서 할 곳까지 보여 준다) · 모드 넷 · 도구 넷.
       잠긴 모드는 자물쇠와 진행 숫자만 두고, 여는 조건은 툴팁 · 화면 낭독기로 */
    const prog = G.progress(), next = Math.min(prog, LEVELS.length - 1), L = LEVELS[next];
    const ck = L && L.city, city = ck && CITY_LOCAL[ck] ? (I18N.lang === 'en' ? CITY_LOCAL[ck].replace(/[가-힣·]+\s*/g, '').trim() : CITY_LOCAL[ck]) : '';
    $('playLabel').textContent = prog > 0 ? T('이어하기') : T('시작');
    $('playSub').textContent = `CH ${next + 1}${city ? ' · ' + city : ''}`;
    $('btnPlay').setAttribute('aria-label', `${$('playLabel').textContent} — CHAPTER ${next + 1}`);
    const lock = (btn, chip, open, n, t, why) => {
      btn.disabled = !open; chip.hidden = open;
      chip.querySelector('b').textContent = t ? `${n}/${t}` : '';
      btn.title = open ? '' : why;
      btn.setAttribute('aria-label', btn.querySelector('span').textContent + (open ? '' : ' — ' + why));
    };
    // 원작처럼 서바이벌은 이야기를 끝까지 본 뒤에 열린다
    lock($('btnSurvival'), $('lockSurvival'), G.survivalOpen(), Math.min(prog, SURVIVAL_UNLOCK), SURVIVAL_UNLOCK, T('1부(5장)를 마치면 열린다'));
    lock($('btnChallenge'), $('lockChallenge'), G.challengeOpen(), Math.min(prog, 2), 2, T('2장을 마치면 열린다'));
    const nr = Records.all().length;
    $('journalBadge').textContent = `${nr}/${STORY.records.length}`;
    $('btnJournal').title = T('기록 {n}/{t} · 도전 과제 ★{a}', { n: nr, t: STORY.records.length, a: Ach.count() });
    $('btnJournal').setAttribute('aria-label', $('btnJournal').title);
    this.show('scrTitle');
  },
  buildChapters() {
    const list = $('chapterList');
    const unlocked = G.progress();
    const grades = G.grades();
    list.innerHTML = '';
    LEVELS.forEach((L, i) => {
      const locked = i > unlocked;
      if (i === 0 || i === PART1_END + 1) {
        const hd = document.createElement('div');
        hd.className = 'chapters__part';
        hd.textContent = i === 0 ? T('1부 — 남겨진 도시') : T('2부 — 새벽호의 항해');
        list.appendChild(hd);
      }
      const el = document.createElement('div');
      el.className = 'chapter' + (locked ? ' chapter--locked' : '');
      if (!locked) { el.tabIndex = 0; el.setAttribute('role', 'button'); el.addEventListener('keydown', e => { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); el.click(); } }); }
      const best = grades[i] | 0;
      const mark = locked ? T('잠김')
        : best ? `<b class="chapter__grade" data-g="${UI.letter(best)}">${UI.letter(best)}</b>` +
                 `<span class="chapter__score">${best}</span>`
        : i < unlocked ? T('클리어') : '▶';
      el.innerHTML =
        `<span class="chapter__no">${String(i + 1).padStart(2, '0')}</span>` +
        `<span class="chapter__name">${T(L.name)}<span class="chapter__city">${T(CITY_NAME[L.city] || '')}</span><br><span class="chapter__goal">${T(L.goals[0])}</span>` +
        (locked ? '' : `<span class="chapter__recs">${T('기록 {n}/{t}', { n: Records.countFor(i), t: STORY.records.filter(r => r.ch === i).length })}</span>`) + `</span>` +
        `<span class="chapter__mark">${mark}</span>`;
      if (!locked) el.addEventListener('click', () => { SFX.click(); UI.brief(i); });
      list.appendChild(el);
    });
  },
  /** 카드 넘기기 이야기 (프롤로그). 끝나거나 건너뛰면 then() */
  story(cards, then, noMark) {
    this.storyCards = cards; this.storyAt = 0; this.storyThen = then; this.storyNoMark = !!noMark;
    this.show('scrStory');
    this.storyDraw();
  },
  storyDraw() {
    const el = $('storyCard'), c = this.storyCards[this.storyAt];
    el.classList.toggle('title', !!c.title);
    el.classList.toggle('small', !!c.journey);
    $('storyMap').classList.toggle('hidden', !c.journey);
    if (c.journey) {
      const j = c.journey;
      el.textContent = `${T(CITY_NAME[j.from])} → ${T(CITY_NAME[j.to])}\n${LT(j.how)}`;
      drawJourney($('storyMap'), j);
    } else el.textContent = c.title ? c.title : LT(c);
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  },
  storyNext() {
    if (this.storyAt + 1 < this.storyCards.length) { this.storyAt++; this.storyDraw(); return; }
    this.storyEnd();
  },
  storyEnd() {
    if (!this.storyNoMark) try { localStorage.setItem('aftermath.prologue', '1'); } catch (e) { /* 무시 */ }
    cancelAnimationFrame(journeyRaf);
    const f = this.storyThen; this.storyThen = null;
    if (f) f();
  },
  prologue(then) { this.story([...STORY.prologue, { title: 'LEFT CITY' }], then); },
  /** 도시가 바뀌는 장 앞이면 여정 지도를 먼저 보여 준다 */
  journeyThen(i, then) {
    const j = STORY.journey[i];
    if (!j) { then(); return; }
    this.story([{ journey: j }], then, true);
  },
  showJournal() {
    const got = Records.all();
    $('journalCount').textContent = `${got.length}/${STORY.records.length}`;
    const ach = Ach.got();
    $('achCount').textContent = `${Ach.count()}/${STORY.achievements.length}`;
    $('achList').innerHTML = STORY.achievements.map(a =>
      `<div class="ach${ach[a.id] ? ' on' : ''}"><b>${ach[a.id] ? '★' : '☆'} ${LT(a.t)}</b><span>${LT(a.d)}</span></div>`).join('');
    let html = '';
    LEVELS.forEach((L, i) => {
      const recs = STORY.records.filter(r => r.ch === i);
      if (!recs.length) return;
      html += `<div class="journal__ch">CHAPTER ${i + 1} · ${i <= G.progress() ? T(L.name) : '???'}</div>`;
      for (const r of recs) html += got.includes(r.id)
        ? `<div class="journal__rec"><b>${LT(r.title)}</b><p>${LT(r.text)}</p></div>`
        : `<div class="journal__rec missing"><b>???</b><p>${T('아직 찾지 못했다')}</p></div>`;
    });
    $('journalList').innerHTML = html;
    this.show('scrJournal');
  },
  /** 메달 이름 (0 없음) */
  medalName(m) { return [T('메달 없음'), T('동메달'), T('은메달'), T('금메달')][m]; },
  /** 도전 결과 한 줄 — 받은 메달과 다음 메달까지 */
  medalLine() {
    const C = G.challenge, m = G.medalOf(C, G.score);
    const next = C.medals[m];
    return m >= 3 ? T('{medal} — {score}점', { medal: this.medalName(m), score: G.score.toLocaleString() })
      : T('{medal} — {score}점 · {next}까지 {n}점', { medal: this.medalName(m), score: G.score.toLocaleString(), next: this.medalName(m + 1), n: (next - G.score).toLocaleString() });
  },
  showChallenges() {
    const bests = G.challengeBests();
    $('challengeList').innerHTML = CHALLENGES.map(c => {
      const b = bests[c.id] | 0, m = G.medalOf(c, b);
      return `<button class="chal" data-act="chstart" data-id="${c.id}">
        <span class="chal__medal m${m}" aria-label="${this.medalName(m)}"></span>
        <b>${T(c.name)}<small>${T(CITY_NAME[c.city])}</small></b>
        <span class="chal__note">${T(c.note)}</span>
        <span class="chal__best">${b ? T('최고 {s}점', { s: b.toLocaleString() }) + ' · ' + this.medalName(m) : T('기록 없음')}</span>
      </button>`;
    }).join('');
    this.show('scrChallenge');
  },
  /** 서바이벌 도시 고르기 — 도시마다 최고 기록을 붙인다 */
  showCities() {
    const bests = G.cityBests();
    for (const b of document.querySelectorAll('#scrCity .city')) {
      let sm = b.querySelector('small');
      if (!sm) { sm = document.createElement('small'); b.appendChild(sm); }
      const r = bests[b.dataset.city];
      sm.textContent = r ? T('최고 {m}분 {s}초 · {k}기 처치', { m: Math.floor(r.t / 60), s: r.t % 60, k: r.kills }) : T('기록 없음');
    }
    this.show('scrCity');
  },
  brief(i) {
    G.pendingLevel = i;
    const L = LEVELS[i];
    $('briefNo').textContent = `CHAPTER ${i + 1}`;
    $('briefTitle').textContent = T(L.name);
    $('briefText').textContent = T(L.brief);
    const kit = startKit(L, SETTINGS.difficulty).map(k => T(WEAPONS[k].name)).join(' · ');
    const pool = (L.drops || []).filter(k => !startKit(L, SETTINGS.difficulty).includes(k)).map(k => T(WEAPONS[k].name)).join(' · ');
    $('briefGoals').innerHTML = L.goals.map(g => `<li>${T(g)}</li>`).join('') +
      (L.twist && L.twist.brief ? `<li class="brief__twist">${T(L.twist.brief)}</li>` : '') +
      `<li class="brief__kit">${T('시작 무기: {k}', { k: kit })}${pool ? ' — ' + T('{p}은(는) 감염체가 떨어뜨린다', { p: pool }) : ''}</li>`;
    drawBriefMap(L);
    this.show('scrBrief');
  },
  /** 일시정지 중 현재 판의 전황 — 멈춘 김에 상황을 보라고 */
  showPause() {
    const p = G.player, ob = G.level.objective;
    const t = Math.floor(G.time);
    const acc = G.shots ? Math.round(G.hits / G.shots * 100) : null;
    $('pauseWhere').textContent = G.challenge ? T('도전 · {name}', { name: T(G.challenge.name) }) : G.survival
      ? T('서바이벌 · {d}', { d: T(DIFFICULTY[G.difficulty].name) })
      : `CHAPTER ${G.levelIndex + 1} — ${T(G.level.name)} · ${T(DIFFICULTY[G.difficulty].name)}`;

    const wp = p.weapon;
    const rows = [
      [T('경과'), `${String((t / 60) | 0).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`],
      [T('처치'), T('{n}기', { n: G.kills })],
      [T('명중률'), acc === null ? '—' : `${acc}%`],
      [T('받은 피해'), `${Math.round(p.dmgTaken)}`],
      [T('체력 · 배터리'), `${Math.round(p.hp)} · ${Math.round(p.battery)}`],
      [T('장비'), `${T(wp.name)} ${p.magOf(wp)}${p.reserveOf(wp) === Infinity ? '' : '/' + p.reserveOf(wp)}`]
    ];
    if (ob.type === 'collect') rows.push([T(ob.item || '보급 상자'), `${G.goalsTotal - G.goalsLeft}/${G.goalsTotal}`]);
    if (ob.type === 'survive') rows.push([T('남은 시간'), T('{s}초', { s: Math.ceil(G.surviveLeft) })]);
    if (ob.type === 'purge') rows.push([T('소탕'), `${G.kills}/${G.goalsTotal}`]);
    if (ob.type === 'signal') rows.push([T('중계기'), `${G.goalsTotal - G.goalsLeft}/${G.goalsTotal}`]);
    if (ob.type === 'finale') rows.push([T(ob.row || '접안'), G.exitOpen ? T(ob.rowOpen || '현문 개방') : G.holding ? T('{s}초', { s: Math.ceil(G.surviveLeft) }) : T(ob.rowGo || '부두로 이동 중')]);
    if (ob.type === 'boss') rows.push([T('그것'), G.boss && !G.boss.dead
      ? `${Math.max(0, Math.round(G.boss.hp / G.boss.hpMax * 100))}%` : T('처치')]);
    $('pauseStats').innerHTML = rows.map(r =>
      `<div><dt>${r[0]}</dt><dd>${r[1]}</dd></div>`).join('');
    (this.syncSettings(), this.show('scrPause'));
  },

  /** 전역을 끝낸 뒤의 마무리 화면 — 챕터별 평가를 모아 보여 준다 */
  /** 엔딩 — 1부(싱가포르 출항)와 2부(남극) 둘. 1부 엔딩에는 2부로 가는 단추가 붙는다 */
  showEnding(part = 2) {
    const E = part === 1 ? STORY.epilogue : STORY.epilogue2, n = part === 1 ? PART1_END + 1 : LEVELS.length;
    $('btnPart2').classList.toggle('hidden', part !== 1);
    $('endingKicker').textContent = LT(E.kicker);
    $('endingTitle').textContent = LT(E.title);
    $('endingText').innerHTML = E.text.map(t => `<p>${LT(t)}</p>`).join('') + '<p class="ending__credit">LEFT CITY</p>';
    const grades = G.grades();
    const done = LEVELS.slice(0, n).map((L, i) => grades[i] | 0).filter(v => v > 0);
    const sum = done.reduce((a, b) => a + b, 0);
    const avg = done.length ? Math.round(sum / done.length) : 0;

    const rows = [
      [T('클리어'), T('{n}개 챕터', { n })],
      [T('기록'), `${Records.all().length}/${STORY.records.length}`],
      [T('평가 남긴 챕터'), `${done.length}/${n}`],
      [T('평균 평가'), done.length ? `${UI.letter(avg)} (${avg})` : '—'],
      [T('최고 평가'), done.length ? `${UI.letter(Math.max(...done))} (${Math.max(...done)})` : '—'],
      [T('난이도'), DIFFICULTY[G.difficulty] ? T(DIFFICULTY[G.difficulty].name) : '—'],
      [T('마지막 처치'), T('{n}기', { n: G.kills })]
    ];
    $('endingStats').innerHTML = rows.map(r =>
      `<div><dt>${r[0]}</dt><dd>${r[1]}</dd></div>`).join('');
    $('endingNote').textContent = part === 1 ? T('새벽호의 항해는 계속된다 — 2부에서 다섯 지역이 기다린다.') : done.length < n
      ? T('아직 평가가 남지 않은 챕터가 있다. 챕터 선택에서 다시 들어갈 수 있다.')
      : T('모든 챕터에 기록을 남겼다. 더 높은 난이도가 기다린다.');

    G.state = 'title';
    SFX.ambience(false);
    SFX.win();
    $('hud').classList.add('hidden');
    $('touch').classList.add('hidden');
    this.show('scrEnding');
  },

  /** 평가 점수를 등급 문자로. rate() 와 같은 경계를 쓴다 */
  letter(v) { return v >= 88 ? 'S' : v >= 73 ? 'A' : v >= 57 ? 'B' : v >= 38 ? 'C' : 'D'; },

  /** 설정 화면을 현재 설정값에 맞춰 그린다 */
  syncSettings() {
    $('setVolume').value = SETTINGS.volume;
    $('setVolVal').textContent = SETTINGS.volume;
    for (const b of document.querySelectorAll('.seg [data-set]'))
      b.classList.toggle('on', b.dataset.val === String(SETTINGS.get(b.dataset.set)));
    $('setBright').value = SETTINGS.brightness;
    $('setBrightVal').textContent = SETTINGS.brightness;
    $('setDiffNote').textContent = `${T(SETTINGS.mod.name)} — ${T(SETTINGS.mod.note)}`;
    if ($('setView')) { $('setView').value = SETTINGS.get('view3d'); $('setViewVal').textContent = SETTINGS.get('view3d'); }
    for (const b of document.querySelectorAll('.tog[data-set]'))
      b.setAttribute('aria-pressed', String(!!SETTINGS.get(b.dataset.set)));
    const n = Hints.seenCount;
    $('hintsReset').disabled = n === 0;
    $('hintsReset').textContent = n ? T('본 도움말 {n}개 — 처음부터 다시 보기', { n }) : T('아직 본 도움말이 없다');
  },

  /** 플레이 결과를 0‒100 으로 환산하고 등급을 매긴다 */
  rate(won) {
    const acc = G.shots ? G.hits / G.shots : 0;
    const taken = G.player.dmgTaken;
    const ob = G.level.objective;

    let pts = 0;
    pts += Math.min(34, acc * 45);                     // 명중률 (75% 에서 만점)
    pts += Math.max(0, 32 - taken / 6);                // 받은 피해 (192 이상이면 0점)
    pts += Math.min(20, G.kills * 0.5);                // 처치 (40기에서 만점)
    // 속도 — 시간이 목표 자체인 모드에는 적용하지 않는다
    if (ob.type !== 'survive' && ob.type !== 'endless') {
      const par = ob.type === 'finale' ? 150 + ob.time : 90 + (G.goalsTotal || 1) * 45;
      pts += Math.max(0, Math.min(14, 14 * par / Math.max(par * 0.4, G.time)));
    } else {
      pts += 14 * Math.min(1, G.time / Math.max(30, ob.time || 180));
    }
    pts *= DIFFICULTY[G.difficulty].score;             // 난이도 보정
    if (!won) pts *= 0.45;                             // 사망은 절반 이하로

    const v = Math.max(0, Math.min(100, Math.round(pts)));
    return { value: v, grade: this.letter(v), acc, taken };
  },

  showResult(won) {
    const s = $('scrResult');
    s.classList.toggle('fail', !won);
    $('resultTitle').textContent = G.challenge ? T('도전 종료') : won ? (G.survival ? T('기록 종료') : T('생존')) : T('사망');
    const nextBtn = s.querySelector('[data-act="next"]');
    if (won && !G.survival && G.levelIndex === PART1_END) {
      nextBtn.classList.remove('hidden');
      nextBtn.textContent = T('1부 엔딩 보기');
    } else if (won && !G.survival && G.levelIndex + 1 < LEVELS.length) {
      nextBtn.classList.remove('hidden');
      nextBtn.textContent = T('다음 챕터 — {name}', { name: T(LEVELS[G.levelIndex + 1].name) });
    } else if (won && !G.survival) {
      nextBtn.classList.remove('hidden');
      nextBtn.textContent = T('엔딩 보기');
    } else nextBtn.classList.add('hidden');

    const story = !G.survival && STORY.chapters[G.levelIndex];
    $('resultSub').textContent = G.challenge ? UI.medalLine()
      : won
      ? (G.survival ? T('도시는 여전히 그대로다.') : story ? LT(story.outro) : T('숨을 고를 시간은 짧다.'))
      : T('불빛이 꺼졌다. ') + T(DEATH_TIP[G.lastHurt] || DEATH_TIP.crowd);

    // 같은 챕터에서 두 번 넘게 쓰러지면 한 단계 쉬운 난이도로 다시 할 수 있게 권한다 (강요하지 않는다)
    if (!won && !G.survival) G.deaths[G.levelIndex] = (G.deaths[G.levelIndex] || 0) + 1;
    const easier = !won && !G.survival && (G.deaths[G.levelIndex] || 0) >= 2 && G.difficulty !== 'easy';
    const cb = s.querySelector('[data-act="checkpoint"]');
    const hasCp = !won && !G.survival && G.checkpoint && G.checkpoint.level === G.levelIndex;
    cb.classList.toggle('hidden', !hasCp);
    if (hasCp) cb.textContent = T('체크포인트부터 — {name}', { name: G.checkpointName() });
    const eb = s.querySelector('[data-act="retryeasy"]');
    eb.classList.toggle('hidden', !easier);
    if (easier) eb.textContent = T('{d} 난이도로 다시', { d: T(DIFFICULTY[G.difficulty === 'hard' ? 'normal' : 'easy'].name) });

    const r = this.rate(won);
    const best = won && !G.survival ? G.saveGrade(G.levelIndex, r.value) : false;
    Ach.fresh = [];
    Ach.onFinish(G, won, r.grade);
    const gradeEl = $('resultGrade');
    gradeEl.hidden = !!G.challenge;
    gradeEl.dataset.g = r.grade;
    gradeEl.querySelector('b').textContent = r.grade;
    gradeEl.querySelector('span').textContent = best ? T('최고 기록 {v}', { v: r.value }) : T('평가 {v}', { v: r.value });
    gradeEl.classList.toggle('best', best);

    const t = Math.floor(G.time);
    const rows = [
      [T('생존 시간'), `${String((t / 60) | 0).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`],
      [T('처치'), T('{n}기', { n: G.kills })],
      [T('명중률'), G.shots ? `${Math.round(r.acc * 100)}% (${G.hits}/${G.shots})` : '—'],
      [T('받은 피해'), `${Math.round(r.taken)}`],
      [T('점수'), `${G.score}`],
      [T('난이도'), T(DIFFICULTY[G.difficulty].name)]
    ];
    if (G.challenge) {
      const C = G.challenge, cr = G.chResult || {};
      rows.push([T('최대 연속'), T('{n}연속 · ×{m}', { n: G.comboMax, m: (1 + Math.min(Math.max(0, G.comboMax - 1), 8) * 0.25).toFixed(2).replace(/0$/, '') })]);
      rows.push([T('최고 점수') + (cr.best ? ' ★' : ''), Math.max(cr.prev | 0, G.score).toLocaleString()]);
      rows.push([T('메달 문턱'), C.medals.map(m => m.toLocaleString()).join(' · ')]);
    } else if (G.survival) {
      const cb = G.cityBests()[G.level.city];
      if (cb) rows.push([T('{city} 최고', { city: T(CITY_NAME[G.level.city]) }) + (G.cityBest ? ' ★' : ''), T('{m}분 {s}초', { m: Math.floor(cb.t / 60), s: cb.t % 60 })]);
      rows.push([T('최고 기록'), T('{m}분 {s}초', { m: Math.floor(G.bestSurvival() / 60), s: G.bestSurvival() % 60 })]);
    } else if (G.notesFound) rows.push([T('주운 기록'), T('{n}장', { n: G.notesFound })]);
    for (const a of Ach.fresh) rows.push([T('도전 과제'), '★ ' + LT(a.t)]);
    $('resultStats').innerHTML = rows.map(r =>
      `<div><dt>${r[0]}</dt><dd>${r[1]}</dd></div>`).join('');

    $('hud').classList.add('hidden');
    $('touch').classList.add('hidden');
    this.show('scrResult');
  }
};

/** 무엇에 쓰러졌는가에 따른 한 줄 요령 */
const DEATH_TIP = {
  spit:   '초록 고리가 보이면 옆으로 — 산은 서 있던 자리로 떨어진다.',
  acid:   '초록 웅덩이는 오래 서 있을수록 아프다. 지나가되 멈추지 말 것.',
  lava:   '붉게 빛나는 균열은 밟지 말 것. 대신 저것들을 그 위로 끌어들여라.',
  charge: '붉은 선이 진해지면 방향이 굳은 것 — 그때 옆으로 비켜라. 벽에 박으면 비틀거린다.',
  behemoth: '그것에게 붙지 말 것. 거리를 두고 돌진을 벽으로 유도하라.',
  brute:  '덩치는 붙기 전에 — 샷건이나 수류탄으로.',
  runner: '달리는 것은 멀리서 끊어 쏴라. 붙으면 밀치기로 떼어 낸다.',
  crawler: '기는 것은 웅크렸다 튄다 — 튀는 순간 옆으로.',
  bloater: '부푼 것은 멀리서 쏴라.',
  leaper: '덮치는 것이 웅크리면 옆으로 — 날아오는 순간 쏘면 떨어져 뒹군다.',
  puller: '기침 소리가 들리면 옆으로 비켜라. 혀에 감기면 그것을 쏴서 끊는다.',
  riot:   '진압 경찰은 앞에서 쏘지 말 것 — 밀쳐서 돌려세우고 등을 쏴라. 수류탄은 방패를 무시한다.',
  crowd:  '둘러싸이면 밀치기로 떼어 내고 트인 길로 빠져나가라. 막다른 골목은 피할 것.'
};

/* 버튼 배선 */
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  SFX.init(); SFX.resume(); SFX.click();
  if (G.state === 'title' && !SFX.musicOn) SFX.menuMusic(true);   // 첫 클릭 전에는 소리를 낼 수 없다
  const act = btn.dataset.act;
  switch (act) {
    case 'campaign':
      if (G.progress() === 0 && !localStorage.getItem('aftermath.prologue')) UI.prologue(() => UI.brief(0));
      else UI.brief(Math.min(G.progress(), LEVELS.length - 1));
      break;
    case 'storynext': UI.storyNext(); break;
    case 'storyskip': UI.storyEnd(); break;
    case 'prologue': UI.prologue(() => UI.showJournal()); break;
    case 'journal': UI.showJournal(); break;
    case 'chapters': UI.buildChapters(); UI.show('scrChapters'); break;
    case 'survival': if (G.survivalOpen()) UI.showCities(); break;
    case 'survcity': G.survivalCity = btn.dataset.city; G.start('survival'); break;
    // 조작법·설정은 일시정지에서도 열리므로 돌아갈 화면을 기억해 둔다
    case 'howto':
    case 'keys':
      UI.settingsFrom = G.state === 'pause' ? 'scrPause' : 'scrTitle';
      UI.buildHowto(); UI.show('scrHowto'); break;
    case 'keymap':
      UI.keysFrom = $('scrHowto').classList.contains('hidden') ? 'scrSettings' : 'scrHowto';
      if (UI.keysFrom === 'scrSettings' || !UI.settingsFrom) UI.settingsFrom = UI.settingsFrom || 'scrTitle';
      UI.buildKeys(); UI.show('scrKeys'); break;
    case 'keyreset':
      UI.cancelRebind(); KEYBIND.reset(); UI.buildKeys(); $('keyMsg').textContent = T('기본 키로 되돌렸습니다'); break;
    case 'keyback':
      UI.cancelRebind();
      if (UI.keysFrom === 'scrHowto') { UI.buildHowto(); UI.show('scrHowto'); }
      else { UI.syncSettings(); UI.show('scrSettings'); }
      break;
    case 'settings':
      UI.settingsFrom = G.state === 'pause' ? 'scrPause' : 'scrTitle';
      UI.syncSettings(); UI.show('scrSettings'); SetLive.open(); break;
    case 'hintsreset':
      Hints.reset(); UI.syncSettings(); break;
    case 'setback':
      SetLive.close();
      if (UI.settingsFrom === 'scrPause') UI.showPause();
      else UI.enterMenu();
      break;
    case 'back':     UI.enterMenu(); break;
    case 'about':
      $('aboutVersion').textContent = `${APP.name} ${APP.version}`;
      $('aboutMsg').textContent = '';
      $('btnCopyErrors').disabled = !(localStorage.getItem('aftermath.errors') || '').length;
      UI.show('scrAbout'); break;
    case 'copyerrors': {
      const log = localStorage.getItem('aftermath.errors') || '[]';
      const text = `${APP.name} ${APP.version} · ${navigator.userAgent}\n${log}`;
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
        .then(() => { $('aboutMsg').textContent = T('오류 기록을 복사했습니다 — 제보할 때 붙여 넣어 주세요'); })
        .catch(() => { $('aboutMsg').textContent = T('복사할 수 없는 환경입니다'); });
      break;
    }
    case 'wipe':
      if (confirm(T('챕터 진행 · 평가 · 서바이벌 기록을 지웁니다. 설정과 키 설정은 남습니다. 계속할까요?'))) {
        for (const k of ['aftermath.layout', 'aftermath.progress', 'aftermath.grades', 'aftermath.best', 'aftermath.hints', 'aftermath.errors', 'aftermath.records', 'aftermath.cityBest', 'aftermath.prologue', 'aftermath.ach', 'aftermath.stats', 'aftermath.chal']) try { localStorage.removeItem(k); } catch (e) { /* 무시 */ }
        $('aboutMsg').textContent = T('진행 기록을 지웠습니다');
      }
      break;
    case 'start':    G.start(G.pendingLevel); break;
    case 'resume':   G.togglePause(); break;
    case 'homeno':   Modal.homeAnswer(false); break;
    case 'homeyes':  Modal.homeAnswer(true); break;
    case 'layout':   TLayout.open(); break;
    case 'layoutdone': TLayout.close(); break;
    case 'layoutreset': TLayout.reset(); break;
    case 'restart':  G.start(G.challenge ? 'ch:' + G.challenge.id : G.survival ? 'survival' : G.levelIndex); break;
    case 'challenges': if (G.challengeOpen()) UI.showChallenges(); break;
    case 'chstart': G.start('ch:' + btn.dataset.id); break;
    case 'checkpoint': if (G.checkpoint) G.start(G.levelIndex, G.checkpoint); break;
    case 'retryeasy':
      SETTINGS.set('difficulty', G.difficulty === 'hard' ? 'normal' : 'easy');
      G.deaths[G.levelIndex] = 0;
      G.start(G.levelIndex); break;
    case 'quit':     G.state = 'title'; SFX.ambience(false); UI.enterMenu(); break;
    case 'next':
      if (G.levelIndex === PART1_END) UI.showEnding(1);
      else if (G.levelIndex + 1 < LEVELS.length) { const n = G.levelIndex + 1; UI.journeyThen(n, () => UI.brief(n)); }
      else UI.showEnding(2);
      break;
    case 'part2': { const n = PART1_END + 1; UI.journeyThen(n, () => UI.brief(n)); break; }
  }
});

/* 전체 지도 — 터치는 미니맵을 눌러 열고 아무 데나 눌러 닫는다. 마우스로도 지도 위를 누르면 닫힌다 */
$('minimap').addEventListener('click', () => { if (G.state === 'play') G.toggleMap(); });
$('minimap').addEventListener('touchend', e => { e.preventDefault(); if (G.state === 'play') G.toggleMap(); }, { passive: false });
$('bigmap').addEventListener('click', () => { if (G.state === 'map') G.toggleMap(); });

/* 키 설정 — 행동 버튼을 누르면 다음 키를 기다린다 */
$('keyList').addEventListener('click', e => {
  const b = e.target.closest('[data-bind]');
  if (!b) return;
  e.stopPropagation();
  SFX.init(); SFX.resume(); SFX.click();
  if (rebinding === b.dataset.bind) UI.cancelRebind(); else UI.startRebind(b.dataset.bind);
});
// 키가 바뀌면 다음 도움말 · 무기 고르기 화면이 새 키로 뜬다
KEYBIND.onChange(() => { if (!$('scrHowto').classList.contains('hidden')) UI.buildHowto(); });

/* 설정 위젯 배선 */
$('setVolume').addEventListener('input', e => {
  SETTINGS.set('volume', +e.target.value);
  $('setVolVal').textContent = SETTINGS.volume;
  SFX.applyVolume();
});
$('setVolume').addEventListener('change', () => { SFX.init(); SFX.resume(); SFX.beep(); });
$('setBright').addEventListener('input', e => {
  SETTINGS.set('brightness', +e.target.value);
  $('setBrightVal').textContent = SETTINGS.brightness;
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-set]');
  if (!b) return;
  SFX.init(); SFX.resume();
  if (b.dataset.val) SETTINGS.set(b.dataset.set, b.dataset.val);
  else SETTINGS.toggle(b.dataset.set);
  SFX.click();
  UI.syncSettings();
});

/* ═══════════ 루프 ═══════════ */
/* 타이틀 배경: 암흑 속에서 붉은 눈들이 떠오른다 (트레일러 마지막 장면) */
const attract = [];
function drawAttract(dt) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#05070a';
  ctx.fillRect(0, 0, W, H);

  while (attract.length < 46)
    attract.push({ x: Math.random() * W, y: Math.random() * H,
      s: 0.4 + Math.random() * 1.5, ph: Math.random() * 6.28,
      v: 4 + Math.random() * 12, blink: Math.random() * 5 });

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const gr = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, Math.max(W, H) * 0.42);
  gr.addColorStop(0, 'rgba(120,20,16,.13)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);

  for (const e of attract) {
    e.ph += dt * 0.7; e.blink -= dt;
    e.x += Math.sin(e.ph) * e.v * dt;
    e.y -= e.v * 0.18 * dt;
    if (e.y < -20) { e.y = H + 20; e.x = Math.random() * W; }
    const open = e.blink > 0 ? 1 : (e.blink < -0.14 ? (e.blink = 2 + Math.random() * 6, 1) : 0.05);
    const a = (0.22 + 0.3 * Math.abs(Math.sin(e.ph * 0.6))) * open;
    ctx.fillStyle = `rgba(200,44,32,${a})`;
    const r = 1.6 * e.s, gap = 4.4 * e.s;
    ctx.beginPath(); ctx.arc(e.x - gap, e.y, r, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.arc(e.x + gap, e.y, r, 0, 6.283); ctx.fill();
  }
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
  // 번개 — 트레일러 끝처럼 붉은 눈들 위로 가끔 하늘이 하얗게 터진다 (섬광 설정을 따른다)
  attractFlash.t -= dt;
  if (attractFlash.t <= 0) { attractFlash.t = 7 + Math.random() * 9; attractFlash.k = 1; if (SFX.ready && G.state === 'title') SFX.thunder(); }
  if (attractFlash.k > 0) {
    attractFlash.k = Math.max(0, attractFlash.k - dt * 2.2);
    const k = attractFlash.k * (SETTINGS.flash ? 0.22 : 0.05) * (0.6 + Math.random() * 0.4);
    ctx.fillStyle = `rgba(200,212,232,${k})`; ctx.fillRect(0, 0, W, H);
  }
  drawVignette();
}
const attractFlash = { t: 4, k: 0 };

let last = performance.now();
const fpsEl = $('fpsMeter');
let fpsN = 0, fpsT = 0;
/* ═══════════ 오류에 버티기 ═══════════
   한 프레임에서 예외가 나도 루프는 계속 돈다(다음 프레임을 먼저 예약한다). 예전엔 예외 한 번에
   requestAnimationFrame 이 다시 걸리지 않아 화면이 그대로 굳었다. 오류는 기기에 최근 20건만 남긴다
   (버그 제보용 · 밖으로 보내지 않는다). 같은 오류가 계속되면 타이틀로 돌아갈 수 있는 안내를 띄운다. */
let errRun = 0, errNoticeT = 0;
function logError(kind, err) {
  try {
    const list = JSON.parse(localStorage.getItem('aftermath.errors') || '[]');
    list.push({ t: new Date().toISOString(), v: APP_VERSION, kind, msg: String(err && (err.stack || err.message) || err).slice(0, 600), state: G.state });
    localStorage.setItem('aftermath.errors', JSON.stringify(list.slice(-20)));
  } catch (e) { /* 저장 불가여도 진행 */ }
}
function recoverCanvas() {
  try {
    if (ctx.reset) ctx.reset();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    mctx.globalCompositeOperation = 'source-over';
  } catch (e) { /* 무시 */ }
}
window.addEventListener('error', e => logError('error', e.error || e.message));
window.addEventListener('unhandledrejection', e => logError('promise', e.reason));

function frame(now) {
  requestAnimationFrame(frame);
  try {
    step(now);
    errRun = 0;
  } catch (err) {
    errRun++;
    logError('frame', err);
    recoverCanvas();
    if (performance.now() > errNoticeT) {
      errNoticeT = performance.now() + 8000;
      console.error(err);
    }
    // 계속 같은 자리에서 넘어지면 게임을 멈추고 안내한다
    if (errRun > 90 && (G.state === 'play' || G.state === 'map' || G.state === 'arms')) {
      errRun = 0;
      G.state = 'pause'; UI.showPause();
      G.toast(T('문제가 생겨 일시정지했습니다 — 재시작하거나 타이틀로 돌아가세요'), 5);
    }
  }
}
function step(now) {
  const ms = now - last;
  const dt = Math.min(0.05, ms / 1000);
  last = now;
  adaptRes(ms);
  pollPad(dt);
  if (SETTINGS.fps) {
    fpsN++; fpsT += ms;
    if (fpsT >= 500) {
      fpsEl.hidden = false;
      fpsEl.textContent = `${Math.round(fpsN * 1000 / fpsT)} fps · ${(W * DPR | 0)}×${(H * DPR | 0)}${SETTINGS.quality === 'auto' ? T(' 자동') : ''}`;
      fpsN = 0; fpsT = 0;
    }
  } else if (!fpsEl.hidden) fpsEl.hidden = true;

  // 게임 속도(설정 1 · 2 · 3배) — 세상의 시간만 늦춘다. 3배가 처음부터의 빠르기
  const gdt = dt * (SETTINGS.get('speed') || 3) / 3;
  if (G.state === 'play' && G.freezeT > 0) {
    G.freezeT -= gdt;                                  // 처치 직후의 짧은 정지 — 그림만 그린다
    render();
  } else if (G.state === 'play') {
    G.update(gdt);
    if (G.state === 'play' || G.state === 'result') render();
    hudT -= dt;
    if (hudT <= 0) { hudT = 0.07; G.refreshHud(); }
  } else if (G.state === 'pause' || G.state === 'result' || G.state === 'arms' || G.state === 'map') {
    if (G.world) render();
  } else {
    if (R3) R3.hide();
    drawAttract(dt);
  }
}

G.migrateSaves();                // 저장 배치를 먼저 맞춘 뒤에 타이틀을 그린다
UI.enterMenu();
// 3D 판 — 타이틀을 보는 동안 렌더러 · 인물 모형 · 셰이더를 미리 준비한다(첫 판의 멈칫거림을 메뉴 쪽으로 옮긴다)
addEventListener('load', () => setTimeout(() => {
  // 간판 글자를 그리기 전에 글꼴부터 — 늦으면 3D 간판이 기본 글꼴로 구워진다
  const go = () => (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { if (window.R3D && window.R3D.preload && window.R3D.ok && G.state === 'title') window.R3D.preload(); });
  if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 1500 }); else go();
}, 400));
requestAnimationFrame(frame);

/** 세계 좌표 → 화면 좌표 (시험·도구용) */
G.toScreen = (x, y) => toScreen(G.camera(), x, y).map(v => v * ZOOM);   // CSS px (마우스 좌표와 같은 단위)
/** 짧은 진동 (엔티티에서 폭발 등에 쓴다) */
G.buzz = buzz;
/** 현재 어둠 농도 (0‒1) — 밝기 설정 확인용 */
G.darkLevel = () => darkLevel(G);
/** 3D 판이 읽는 화면 정보 — 논리 화면 크기 · 확대 · 기울기 없는 원래 손전등 원뿔 반각 */
G.view = () => ({ W, H, ZOOM, DPR });
G.tex = TEX;
window.G = G; window.LC_INPUT = input;   // 자동 점검(프레임 단위 동작 확인)이 입력을 넣을 때 쓴다
window.UI = UI;
window.Records = Records;
window.Ach = Ach;
window.Radio = Radio;
})();
