/* ═══════════════════════════════════════════
   AFTERMATH — 잔존 : 게임 루프 · 렌더 · 입력
   ═══════════════════════════════════════════ */
(() => {
'use strict';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;

const view = $('view');
const ctx = view.getContext('2d');
const mask = document.createElement('canvas');
const mctx = mask.getContext('2d');

let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  for (const c of [view, mask]) {
    c.width = Math.floor(W * DPR); c.height = Math.floor(H * DPR);
    c.style.width = W + 'px'; c.style.height = H + 'px';
  }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  mctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);
resize();

const isTouch = matchMedia('(hover:none) and (pointer:coarse)').matches;
if (isTouch) document.body.classList.add('touch');

/* ═══════════ 입력 ═══════════ */
const keys = Object.create(null);
const input = { mx: W / 2, my: H / 2, firing: false, moveX: 0, moveY: 0, aimTouch: null, turnRate: 0, dragTurn: 0, hasMouse: !isTouch,
                // 터치 질주는 누르고 있는 버튼이 아니라 걸쇠다 — 두 엄지가 이미 스틱 위에 있어서
                sprintLatch: false, idleT: 0 };

addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
  if (G.state === 'arms') {
    const pick = { Digit1: 'pistol', Digit2: 'smg', Digit3: 'shotgun', Digit4: 'rifle' }[e.code];
    if (pick || e.code === 'Escape' || e.code === 'Tab') { e.preventDefault(); G.closeArms(pick); }
    return;
  }
  if (e.code === 'Tab' && G.state === 'play') { e.preventDefault(); G.openArms(); return; }
  if (e.code === 'Escape') G.togglePause();
  if (e.code === 'KeyG' && G.state === 'play') G.player.throwNade(G);
  if (G.state === 'play') {
    if (e.code === 'Digit1') G.player.select('pistol', G);
    if (e.code === 'Digit2') G.player.select('smg', G);
    if (e.code === 'Digit3') G.player.select('shotgun', G);
    if (e.code === 'Digit4') G.player.select('rifle', G);
    if (e.code === 'KeyQ')   G.player.cycle(G);
    if (e.code === 'KeyR')   G.player.reload(G);
    if (e.code === 'KeyE')   G.player.melee(G);
  }
  if (e.code === 'KeyF' && G.state === 'play') G.toggleLight();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; input.firing = false; });

view.addEventListener('mousemove', e => { input.mx = e.clientX; input.my = e.clientY; input.hasMouse = true; });
view.addEventListener('mousedown', e => {
  SFX.resume();
  if (e.button === 0) input.firing = true;
  else if (e.button === 2 && G.state === 'play') G.player.melee(G);
});
addEventListener('mouseup', () => { input.firing = false; });
view.addEventListener('contextmenu', e => e.preventDefault());

/* 터치: 좌 = 이동 스틱, 우 = 회전(또는 조준) 스틱 */
function bindPad(el, onVec, axisX) {
  const knob = el.querySelector('i');
  let id = null, ox = 0, oy = 0;
  const R = 46;
  const start = e => {
    const t = e.changedTouches[0];
    id = t.identifier;
    const b = el.getBoundingClientRect();
    ox = b.left + b.width / 2; oy = b.top + b.height / 2;
    move(e); SFX.resume();
  };
  const move = e => {
    for (const t of e.changedTouches) {
      if (t.identifier !== id) continue;
      let dx = t.clientX - ox, dy = t.clientY - oy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      if (axisX && axisX()) { dx = clamp(t.clientX - ox, -R, R); dy = 0; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      onVec(dx / R, dy / R, Math.min(1, d / R));
    }
  };
  const end = e => {
    for (const t of e.changedTouches) {
      if (t.identifier !== id) continue;
      id = null; knob.style.transform = '';
      onVec(0, 0, 0);
    }
  };
  el.addEventListener('touchstart', e => { e.preventDefault(); start(e); }, { passive: false });
  el.addEventListener('touchmove',  e => { e.preventDefault(); move(e); },  { passive: false });
  el.addEventListener('touchend',   end);
  el.addEventListener('touchcancel', end);
}
bindPad($('padMove'), (x, y) => { input.moveX = x; input.moveY = y; });
/* 오른쪽 스틱은 설정에 따라 셋 중 하나로 동작한다.
   turn  — 원작: 좌우로 민 만큼 손전등이 그 방향으로 돈다 (회전 속도 조절)
   stick — 민 방향을 곧바로 바라본다 */
const TURN_MAX = 3.4;   // rad/s
bindPad($('padTurn'), (x, y, m) => {
  if (SETTINGS.aim === 'turn') {
    const k = Math.max(0, Math.abs(x) - 0.12) / 0.88;
    input.turnRate = Math.sign(x) * Math.pow(k, 1.35) * TURN_MAX;
    input.aimTouch = null;
  } else {
    input.turnRate = 0;
    input.aimTouch = m > 0.35 ? Math.atan2(y, x) : null;
  }
}, () => SETTINGS.aim === 'turn');

/** 원작에는 사격 버튼이 없다 — 자동 사격이 켜져 있으면 숨긴다. 드래그 조작이면 오른쪽 스틱도 숨긴다 */
function applyTouchLayout() {
  $('btnFire').classList.toggle('hidden', SETTINGS.autofire);
  $('padTurn').classList.toggle('hidden', SETTINGS.aim === 'drag');
  $('padTurn').classList.toggle('pad--axis', SETTINGS.aim === 'turn');
  document.body.classList.toggle('nofire', SETTINGS.autofire);
}
SETTINGS.onChange(applyTouchLayout);
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

/* ═══════════ 도움말 ═══════════ */
/* 처음 마주치는 순간에 한 번만 뜨는 한 줄 설명. 본 것은 기억해 두고 다시 띄우지 않는다. */
const Hints = (() => {
  const KEY = 'aftermath.hints';
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { seen = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch (e) { /* 저장 불가여도 진행 */ } };

  // [키 표시, 설명]. 데스크톱과 터치가 다르면 그 자리에서 고른다.
  const TEXT = {
    move:     () => !isTouch ? ['WASD', '이동 · 마우스로 손전등을 비춘다']
      : ['왼쪽 스틱', SETTINGS.aim === 'turn' ? '이동 · 오른쪽 스틱을 좌우로 밀어 손전등을 돌린다'
        : SETTINGS.aim === 'drag' ? '이동 · 오른쪽 화면을 좌우로 끌어 손전등을 돌린다'
        : '이동 · 오른쪽 스틱으로 손전등을 비춘다'],
    autofire: () => SETTINGS.autofire
      ? (isTouch ? ['자동 사격', '불빛에 들어온 적은 저절로 쏜다 — 손전등을 적에게 돌리자']
                 : ['클릭', '불빛 안에 들어온 적은 자동으로 쏜다. 직접 쏠 수도 있다'])
      : [isTouch ? '사격' : '클릭', '사격 — 손전등이 비추는 쪽으로만 나간다'],
    reload:   () => [isTouch ? '장전' : 'R', '재장전 — 탄창이 비면 자동으로도 갈아 끼운다'],
    melee:    () => [isTouch ? '밀치기' : 'E · 우클릭', '붙잡히면 발이 묶인다 — 밀쳐내고 빠져나가라'],
    weeper:   () => ['우는 것', '울음소리가 들리면 불빛을 돌리고 멀리 돌아가라 — 깨우면 끝까지 쫓아온다'],
    bloater:  () => ['부푼 것', '가까이서 터지면 담즙을 뒤집어쓴다 — 멀리서 쏴라'],
    bile:     () => ['담즙', '냄새를 맡고 무리가 몰려온다 — 등을 벽에 대고 수류탄을 준비하라'],
    horde:    () => ['무리', '붉은 호가 가리키는 쪽에서 몰려온다 — 불빛을 그쪽으로 돌리거나 질주로 거리를 벌려라'],
    sprint:   () => isTouch ? ['질주', '한 번 누르면 계속 달린다 · 발소리가 커서 멀리서도 깨운다']
                            : ['Shift', '질주 — 빠르지만 발소리가 커서 멀리서도 깨운다'],
    pickup:   () => ['', '빛나는 물건은 밟으면 줍는다'],
    battery:  () => [isTouch ? '손전등' : 'F', '손전등을 꺼서 배터리를 아낀다 · 노란 상자로 채운다'],
    nade:     () => [isTouch ? '수류탄' : 'G', '무리가 몰렸다 — 수류탄'],
    runner:   () => ['달리는 것', '약하지만 빠르다. 멀리 있을 때 끊어 쏘자'],
    brute:    () => ['거대한 것', '잘 밀리지 않는다. 수류탄을 아끼지 말 것'],
    crawler:  () => ['기어다니는 것', '웅크렸다 튄다. 일정하게 다가오지 않는다'],
    spitter:  () => ['뱉는 것', '거리를 두고 산을 뱉는다. 초록 웅덩이는 밟지 말 것'],
    behemoth: () => ['그것', '붉은 선이 뜨면 옆으로 비켜라. 벽에 박으면 비틀거린다']
  };
  // 지금 당장 알아야 하는 것은 줄 앞으로 끼워 넣는다
  const URGENT = new Set(['bile', 'weeper', 'horde', 'melee', 'reload', 'nade', 'runner', 'brute', 'crawler', 'spitter', 'behemoth']);

  const queue = [];
  let cur = null, t = 0, gap = 0;

  function push(id) {
    if (!SETTINGS.hints || seen[id] || cur === id || queue.includes(id)) return;
    if (URGENT.has(id)) queue.unshift(id); else queue.push(id);
  }
  function show(id) {
    const [key, msg] = TEXT[id]();
    const el = $('hint'), k = el.querySelector('b');
    k.textContent = key; k.hidden = !key;
    el.querySelector('span').textContent = msg;
    el.classList.add('show');
    cur = id;
    t = id in { runner: 1, brute: 1, crawler: 1, spitter: 1, behemoth: 1, horde: 1, weeper: 1, bloater: 1, bile: 1 } ? 4.6 : 3.8;
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

    update(dt, g) {
      if (!SETTINGS.hints) { if (cur) hide(); queue.length = 0; return; }
      const p = g.player;
      if (p.dead) return;

      if (g.time > 0.6) push('move');
      if (g.time > 6) push('autofire');
      if (g.time > 24) push('sprint');
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
      }
      if (g.boss && !g.boss.dead && g.boss.aggro &&
          Math.hypot(g.boss.x - p.x, g.boss.y - p.y) < 700) push('behemoth');
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
window.Hints = Hints;

/* ═══════════ 게임 ═══════════ */
/** 레벨 데이터 → 도시 생성 옵션 */
const cityOpts = L => ({ theme: L.city, river: !!L.river, landmarks: L.landmarks || [], goal: L.goal });

/* 무기 실루엣 (무기 고르기 화면) */
const ARM_ICON = {
  pistol:  '<svg viewBox="0 0 84 34"><path d="M24 9h34v7H40l-3 4h-4l2 10h-9l-3-12-3-2z"/></svg>',
  smg:     '<svg viewBox="0 0 84 34"><path d="M12 10h52v6h6v3H52l-2 4h-6l-2 8h-7l2-8h-6l-2 5h-6l1-6H18l-6-4z"/></svg>',
  shotgun: '<svg viewBox="0 0 84 34"><path d="M4 12h56v3h20v4H54l-2 3H30l-8 7H8l8-9H4z"/></svg>',
  rifle:   '<svg viewBox="0 0 84 34"><path d="M2 14h50v-3h10v3h20v3H54l-3 4H38l-2 9h-6l1-9H22l-12 6H2l6-7H2z"/></svg>'
};

const G = {
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
  progress() { return +(localStorage.getItem('aftermath.progress') || 0); },
  survivalOpen() { return this.progress() >= LEVELS.length || this.bestSurvival() > 0; },
  saveProgress(i) {
    if (i > this.progress()) localStorage.setItem('aftermath.progress', i);
  },
  bestSurvival() { return +(localStorage.getItem('aftermath.best') || 0); },

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

  toast(msg) {
    const el = $('toast');
    el.textContent = msg; el.classList.add('show');
    this.toastT = 2.2;
  },

  /* ── 레벨 시작 ── */
  start(index) {
    SFX.init(); SFX.resume();
    this.survival = index === 'survival';
    this.levelIndex = this.survival ? -1 : index;
    const city = this.survivalCity || 'seoul';
    const L = this.survival
      ? Object.assign({}, SURVIVAL, { seed: (Math.random() * 1e9) | 0, city }, SURVIVAL_CITIES[city])
      : LEVELS[index];
    this.level = L;
    this.world = new World(L.seed, L.blocks, cityOpts(L));
    Minimap.reset(this.world);

    const w = this.world;
    this.player = new Player(w.spawn.x, w.spawn.y, L);
    this.zombies = []; this.bullets = []; this.grenades = []; this.pickups = [];
    this.spits = []; this.acids = [];
    this.particles = []; this.decals = []; this.corpses = []; this.flashes = [];
    this.time = 0; this.shake = 0; this.kills = 0; this.score = 0;
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
    const loot = n => Math.max(1, Math.round(n * SETTINGS.mod.loot));
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
    for (const wk of (L.drops || [])) {
      const q = w.pickPoint(this.player.x, this.player.y, 240, 900, rng);
      this.pickups.push(new Pickup(q.x, q.y, 'wpn_' + wk));
    }
    if (ob.type === 'collect') place('goal', ob.count, 420);

    // 초기 좀비
    const initial = Math.max(2, Math.round(L.spawn.initial * SETTINGS.mod.max));
    for (let i = 0; i < initial; i++) this.spawnZombie(560, 1600);
    // 우는 것 — 가는 길 중간쯤, 시작점에서 멀찍이
    this.gas = [];
    const nWeep = this.survival ? 2 : (L.weepers | 0);
    const wr = makeRng(L.seed ^ 0x77e1);
    for (let i = 0, tries = 0; i < nWeep && tries < 400; tries++) {
      const idx = w.reach[Math.floor(wr() * w.reach.length)], q = w.tileCenter(idx);
      const te = w.toExit[idx], tx = idx % w.w, ty = (idx / w.w) | 0;
      if (te < w.maxDist * 0.25 || te > w.maxDist * 0.75) continue;
      if (Math.hypot(q.x - this.player.x, q.y - this.player.y) < 700 || w.roadNeighbours(tx, ty) < 6) continue;
      if (this.zombies.some(z => z.t.weeper && Math.hypot(z.x - q.x, z.y - q.y) < 900)) continue;
      const z = new Zombie(q.x, q.y, 'weeper'); z.face = wr() * 6.28;
      this.zombies.push(z); i++;
    }
    this.flowT = 0; this.hordeAt = null; this.casings = []; this.kickX = 0; this.kickY = 0;
    this.freezeT = 0; this.lastStop = -9;
    w.updateFlow(this.player.x, this.player.y);
    this.directorReset();

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

    SFX.ambience(true);
    this.state = 'play';
    UI.enterPlay();
    this.refreshHud(true);
  },

  /* ── 좀비 소환 ── */
  pickType() {
    const mix = this.level.mix;
    let total = 0;
    for (const k in mix) if (ZTYPES[k] && !ZTYPES[k].special) total += Math.max(0, mix[k]);
    if (total <= 0) return 'walker';
    let r = Math.random() * total, acc = 0;
    for (const k in mix) {
      if (!ZTYPES[k] || ZTYPES[k].special) continue;
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
    const pIdx = Math.floor(p.y / TILE) * w.w + Math.floor(p.x / TILE);
    const myDist = w.toExit[pIdx];
    for (let i = 0; i < 60; i++) {
      const q = near ? w.pickPoint(fromX, fromY, 100, 520) : w.pickPoint(p.x, p.y, 480, 820);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      const qi = Math.floor(q.y / TILE) * w.w + Math.floor(q.x / TILE);
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
    SFX.horde(Math.hypot(spot.x - p.x, spot.y - p.y) * 1.6, a - p.angle);   // 아직 멀다
    this.hordeAt = { x: spot.x, y: spot.y, t: 4.2 };
    const side = Math.abs(((a - p.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > 2.2 ? '뒤에서' : '옆에서';
    this.toast(`무리가 온다 — ${side}`);
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
    SFX.horde(Math.hypot(q.x - p.x, q.y - p.y), Math.atan2(q.y - p.y, q.x - p.x) - p.angle);
    if (Math.random() < 0.6 && this.lightningT > 2) {               // 번개가 무리를 드러낸다
      this.lightning = SETTINGS.flash ? 1 : 0.22; SFX.thunder();
      this.lightningT = 14 + Math.random() * 18;
    }
    D.horde.push(...out); D.count++; D.sinceMob = 0;
    if (this.hordeAt) this.hordeAt.t = Math.max(this.hordeAt.t, 2);
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
    this.toast('담즙을 뒤집어썼다 — 무리가 몰려온다');
    for (const z of this.zombies) if (!z.t.weeper && Math.hypot(z.x - p.x, z.y - p.y) < 700) z.aggro = true;
    if (D) {
      if (D.pending) D.pending.n += 3;
      else this.callHorde(this.hordeSize() + 3, { x: p.x, y: p.y });
    }
  },

  /** 경보기 달린 차 — 맞히면 울리고, 울리면 무리가 온다 (L4D 의 "이중 기대감") */
  triggerAlarm(pr) {
    if (!pr || !pr.alarm || pr.ringing) return;
    pr.ringing = 7;
    SFX.alarm(Math.hypot(pr.x - this.player.x, pr.y - this.player.y));
    this.toast('경보가 울린다 — 무리가 몰려온다');
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

    if (D.phase === 'build') {
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
    this.toast(p.lightOn ? '손전등 ON' : '손전등 OFF — 배터리 절약');
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

  onKill(z) {
    this.kills++;
    // 가까이서 쓰러질수록 긴장도가 오른다 (L4D: 거리에 반비례). 처치에는 짧은 정지
    const d = Math.hypot(z.x - this.player.x, z.y - this.player.y);
    this.stress(Math.max(0, 14 * (1 - d / 360)));
    this.hitStop(z.t.boss ? 0.16 : d < 120 ? 0.055 : 0.035);
    this.score += Math.round(z.t.score * SETTINGS.mod.score);
    if (z.t.boss) {
      this.boss = null;
      this.shake = Math.min(26, this.shake + 20);
      SFX.explode();
      if (this.level.objective.type === 'endless') this.toast('그것을 쓰러뜨렸다');
      else if (!this.exitOpen) this.openExit('그것이 쓰러졌다 — 다리가 열렸다');
    }
    if (this.level.objective.type === 'purge' && !this.exitOpen) {
      this.goalsLeft = Math.max(0, this.goalsTotal - this.kills);
      if (this.goalsLeft === 0) this.openExit('소탕 완료 — 집결지가 표시되었다');
    }
  },
  onGoalItem() {
    this.goalsLeft--;
    SFX.objective();
    if (this.goalsLeft > 0) this.toast(`보급 상자 확보 — ${this.goalsLeft}개 남음`);
    else this.openExit('전부 확보했다 — 집결지로 이동하라');
  },
  openExit(msg) {
    this.exitOpen = true;
    this.toast(msg);
    SFX.objective();
  },

  spawnBlood(x, y, ang, n) {
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
    $('armsRow').innerHTML = SLOT_ORDER.map(k => {
      const w = WEAPONS[k], own = p.owned.has(k);
      const mag = p.magOf(w), res = p.reserveOf(w);
      const empty = own && w.ammoKey && mag + res <= 0;
      const ammo = !own ? '없음' : w.ammoKey ? `${mag} / ${res}` : `${mag} / ∞`;
      return `<button class="arm${k === p.wpn ? ' on' : ''}${empty ? ' empty' : ''}" data-k="${k}"${own ? '' : ' disabled'}>
        ${ARM_ICON[k]}<b>${w.name}</b><span>${ammo}</span>${isTouch ? '' : `<kbd>${w.slot}</kbd>`}</button>`;
    }).join('');
    $('armsNote').textContent = isTouch ? '무기를 누르면 바로 이어집니다' : '숫자키 또는 클릭 · Tab 으로 닫기';
    $('arms').classList.remove('hidden');
    SFX.click();
  },
  closeArms(key) {
    if (this.state !== 'arms') return;
    $('arms').classList.add('hidden');
    this.state = 'play';
    if (key) this.player.select(key, this);
  },

  togglePause() {
    if (this.state === 'play') { this.state = 'pause'; UI.showPause(); }
    else if (this.state === 'pause') { this.state = 'play'; UI.hideScreens(); }
  },

  finish(won) {
    this.state = 'result';
    SFX.ambience(false);
    if (won) {
      SFX.win();
      if (!this.survival) this.saveProgress(this.levelIndex + 1);
    }
    if (this.survival) {
      const t = Math.floor(this.time);
      if (t > this.bestSurvival()) localStorage.setItem('aftermath.best', t);
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
    if (keys.KeyW || keys.ArrowUp) my -= 1;
    if (keys.KeyS || keys.ArrowDown) my += 1;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1;
    if (keys.KeyD || keys.ArrowRight) mx += 1;
    mx += input.moveX; my += input.moveY;
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }

    const moving = ml > 0.1;
    p.resolveSprint(!!(keys.ShiftLeft || keys.ShiftRight) || input.sprintLatch, moving, dt);
    // 걸쇠는 숨이 차거나 0.6초 넘게 멈추면 스스로 풀린다 — 서 있는 동안 켜져 있다가
    // 다시 움직일 때 의도치 않게 질주(=소음)하지 않도록
    if (input.sprintLatch) {
      input.idleT = moving ? 0 : input.idleT + dt;
      if (p.winded || input.idleT > 0.6 || p.dead) input.sprintLatch = false;
    }
    // 붙잡히면 발이 묶인다 — 한 마리당 22%, 최대 60%. 포위되면 빠져나오기 어렵다
    const grab = 1 - Math.min(0.6, (p.grabN || 0) * 0.22);
    p.grabbed = p.grabN || 0; p.grabN = 0;
    // 크게 다치면 절뚝인다 — "추격당하며 절뚝이며 안전지대로" (L4D)
    const limp = p.hp < 25 ? 0.8 : 1;
    const speed = (p.dead ? 0 : 158) * (p.sprinting ? 1.42 : p.reloading ? 0.78 : 1) * grab * limp;
    if (!p.dead && (mx || my)) {
      const before = p.walkPhase;
      w.slide(p, mx * speed * dt, my * speed * dt);
      p.walkPhase += dt * (p.sprinting ? 13 : 8) * Math.min(1, ml * 1.6);
      // 보폭이 반 바퀴 돌 때마다 한 걸음
      if (Math.floor(p.walkPhase / Math.PI) !== Math.floor(before / Math.PI))
        SFX.step(p.sprinting, this.onPuddle(p.x, p.y));
    }

    /* 조준 */
    const cam = this.camera();
    if (!p.dead && (input.turnRate || input.dragTurn)) {
      p.angle += input.turnRate * dt + input.dragTurn;
      input.dragTurn = 0;
    }
    if (input.aimTouch !== null) p.angle = input.aimTouch;
    else if (input.hasMouse) p.angle = Math.atan2(input.my - (p.y - cam.y), input.mx - (p.x - cam.x));

    p.update(dt, this);

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
      const manual = input.firing || keys.Space;
      // 원작: 불빛을 적에게 비추면 사격은 저절로 된다. 불빛 안의 표적을 향해 쏜다
      const tgt = !manual && SETTINGS.autofire ? this.autoTarget() : null;
      if (p.cool <= 0 && (manual || tgt))
        p.fire(this, tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : undefined);
    }

    /* 엔티티 */
    for (const z of this.zombies) if (!z.dead) z.update(dt, this);
    this.separate(dt);
    for (const b of this.bullets) b.update(dt, this);
    for (const gr of this.grenades) gr.update(dt, this);
    for (const sp of this.spits) sp.update(dt, this);

    // 산 웅덩이 — 밟고 있으면 계속 닳는다.
    // 겹친 웅덩이는 더하지 않고 가장 진한 쪽만 적용한다. 더하면 두 겹에 들어선 순간 즉사한다.
    let acidDps = 0;
    for (let i = this.acids.length - 1; i >= 0; i--) {
      const a = this.acids[i];
      a.t -= dt;
      if (a.t <= 0) { this.acids.splice(i, 1); continue; }
      if (!p.dead && Math.hypot(p.x - a.x, p.y - a.y) < a.r)
        acidDps = Math.max(acidDps, 13 * Math.min(1, a.t / a.max + 0.3));   // 식을수록 약해진다
    }
    if (acidDps > 0) {
      p.hurt(acidDps * SETTINGS.mod.dmg * dt);
      if (this.hurtSfxT <= 0) { this.hurtSfxT = 0.75; SFX.hurt(); }
    }
    for (const pk of this.pickups) pk.update(dt, this);
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
      const drag = Math.pow(q.kind === 'blood' ? 0.02 : 0.08, dt);
      q.vx *= drag; q.vy *= drag;
      if (q.life <= 0) {
        if (q.kind === 'blood' && this.decals.length < 420 && !w.solid(q.x, q.y))
          this.decals.push({ x: q.x, y: q.y, r: q.size * 1.9, a: 0.3 + Math.random() * 0.28 });
        this.particles.splice(i, 1);
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].t += dt;
      if (this.flashes[i].t >= this.flashes[i].life) this.flashes.splice(i, 1);
    }
    for (const c of this.corpses) c.age += dt;

    /* 손전등에 비친 좀비 표시 (감지용) */
    const range = p.lightRange;
    if (range > 0) {
      for (const z of this.zombies) {
        const d = Math.hypot(z.x - p.x, z.y - p.y);
        if (d > range) continue;
        const a = Math.atan2(z.y - p.y, z.x - p.x);
        let da = Math.abs(((a - p.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (da < CONE_HALF && w.los(p.x, p.y, z.x, z.y)) z.lit = 1;
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
    if (this.survival && this.time >= this.nextBossT) {
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
          this.toast('무언가 큰 것이 내려왔다');
          this.nextBossT = this.time + 150;
        } else {
          this.nextBossT = this.time + 15;    // 자리가 없으면 곧 다시 본다
        }
      }
    }

    if (this.survival && this.time > 30) {
      const t = this.time;
      this.level.mix = {
        walker:  Math.max(0.18, 0.7 - t / 400),
        runner:  Math.min(0.45, 0.28 + t / 520),
        brute:   Math.min(0.28, Math.max(0, (t - 60) / 520)),
        crawler: Math.min(0.26, Math.max(0, (t - 35) / 420)),
        spitter: Math.min(0.20, Math.max(0, (t - 90) / 600)),
        bloater: Math.min(0.10, Math.max(0, (t - 50) / 700))
      };
      if (this.pickups.length < 6 && Math.random() < dt * 0.35) {
        const types = ['ammo', 'ammo', 'shells', 'medkit', 'battery', 'nade'];
        if (p.owned.has('rifle')) types.push('rounds');
        const q = this.world.pickPoint(p.x, p.y, 300, 1400);
        this.pickups.push(new Pickup(q.x, q.y, types[(Math.random() * types.length) | 0]));
      }
    }

    /* 목표 진행 */
    const ob = this.level.objective;
    if (ob.type === 'survive' && !this.exitOpen) {
      this.surviveLeft -= dt;
      if (this.surviveLeft <= 0) { this.surviveLeft = 0; this.openExit('차단문 개방 — 지금이다'); }
    }
    if (this.exitOpen && ob.type !== 'endless' &&
        Math.hypot(p.x - w.exit.x, p.y - w.exit.y) < 44) {
      this.finish(true); return;
    }

    /* 번개 */
    this.lightningT -= dt;
    this.lightning = Math.max(0, this.lightning - dt * 2.6);
    if (this.lightningT <= 0) {
      this.lightningT = 14 + Math.random() * 22;
      this.lightning = SETTINGS.flash ? 1 : 0.22; SFX.thunder();
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
    let y = p.y + Math.sin(p.angle) * lead - fy;
    // 지도 밖 허공이 보이지 않게 가둔다. 단, 위아래 UI 띠가 어차피 가리는 만큼은 넘어가도 된다
    // — 그래야 지도 끝에서도 플레이어가 탄약·게이지 밑에 깔리지 않는다.
    const port = isTouch && H > W;
    const over0 = port ? H * 0.10 : isTouch ? H * 0.22 : 70, over1 = port ? H * 0.40 : isTouch ? H * 0.30 : 130;
    const mx = w.w * TILE - W, my = w.h * TILE - H;
    x = mx > 0 ? clamp(x, 0, mx) : mx / 2;
    y = my > 0 ? clamp(y, -over0, my + over1) : my / 2;
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
  const cam = g.camera();
  placeCompass(p.x - cam.x, p.y - cam.y);

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#05070a';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  drawGround(cam, w);
  drawProps(cam, w);
  drawExit(g, w);

  /* 혈흔 */
  ctx.fillStyle = '#3a0c0a';
  for (const d of g.decals) {
    ctx.globalAlpha = d.a;
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.283); ctx.fill();
  }
  ctx.globalAlpha = 1;

  /* 탄피 */
  for (const c of g.casings) {
    if (c.x < cam.x - 20 || c.x > cam.x + W + 20 || c.y < cam.y - 20 || c.y > cam.y + H + 20) continue;
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
  for (const c of g.corpses) drawCorpse(c);

  for (const pk of g.pickups) drawPickup(pk, g.time);
  for (const gr of g.grenades) drawGrenade(gr);
  // 그것의 돌진 예고선 — 선딜 동안만 보이고, 비키라는 신호다
  if (g.boss && !g.boss.dead && g.boss.chargePhase === 'wind') {
    const b = g.boss, len = w.ray(b.x, b.y, b.chargeDir, 820);
    ctx.save();
    ctx.strokeStyle = `rgba(214,60,42,${0.3 + Math.sin(g.time * 22) * 0.16})`;
    ctx.lineWidth = b.r * 1.8;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + Math.cos(b.chargeDir) * len, b.y + Math.sin(b.chargeDir) * len);
    ctx.stroke();
    ctx.restore();
  }

  for (const z of g.zombies) drawZombie(z);
  for (const sp of g.spits) {
    const r = 4.5 + Math.sin(sp.phase) * 0.9;
    ctx.fillStyle = '#7fbf33';
    ctx.beginPath(); ctx.arc(sp.x, sp.y, r, 0, 6.283); ctx.fill();
    ctx.fillStyle = 'rgba(190,240,130,.75)';
    ctx.beginPath(); ctx.arc(sp.x - sp.vx * 0.004, sp.y - sp.vy * 0.004, r * 0.5, 0, 6.283); ctx.fill();
  }
  if (!p.dead) drawPlayer(p);
  else drawCorpse({ x: p.x, y: p.y, a: p.angle, type: 'player', age: 2 });

  /* 예광탄 */
  ctx.lineCap = 'round';
  for (const b of g.bullets) {
    ctx.strokeStyle = 'rgba(255,232,170,.85)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(b.px, b.py); ctx.lineTo(b.x, b.y); ctx.stroke();
  }

  for (const q of g.particles) {
    ctx.globalAlpha = clamp(q.life / q.max, 0, 1);
    ctx.fillStyle = q.col;
    ctx.beginPath(); ctx.arc(q.x, q.y, q.size, 0, 6.283); ctx.fill();
  }
  ctx.globalAlpha = 1;
  drawBuildings(cam, w);
  drawLandmarksTop(cam, w, g);
  ctx.restore();

  drawDarkness(cam, g, p, w);
  drawGlow(cam, g, p, w);
  drawRain(g);
  drawVignette();
  if (p.bile > 0) drawBile(p.bile);
  drawHordeCue(cam, g, p);
  drawCrosshair(g, p);
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

/** 무리가 오는 쪽을 플레이어 둘레의 붉은 호로 3초간 가리킨다 (소리를 못 듣는 환경 대비) */
function drawHordeCue(cam, g, p) {
  const h = g.hordeAt;
  if (!h || p.dead) return;
  const a = Math.atan2(h.y - p.y, h.x - p.x), k = Math.min(1, h.t / 1.2);
  const pulse = 0.55 + Math.sin(g.time * 14) * 0.25;
  ctx.save();
  ctx.translate(p.x - cam.x, p.y - cam.y);
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
  el.style.left = sx + 'px';
  el.style.top = sy + 'px';
}

/**
 * 데스크톱 조준선 — 시스템 커서 대신 그린다. 탄 퍼짐만큼 벌어지고,
 * 장전 중엔 진행 고리가 돌며, 맞히면 X(처치는 붉게)가 잠깐 뜬다.
 */
let cursorHidden = false;
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

function drawGround(cam, w) {
  const x0 = Math.max(0, Math.floor(cam.x / TILE)), y0 = Math.max(0, Math.floor(cam.y / TILE));
  const x1 = Math.min(w.w - 1, Math.ceil((cam.x + W) / TILE)), y1 = Math.min(w.h - 1, Math.ceil((cam.y + H) / TILE));
  const at = (x, y) => w.at(x, y);

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * w.w + x, d = w.deco[i];
      const n = ((x * 73856093) ^ (y * 19349663)) & 15;
      const px = x * TILE, py = y * TILE;
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
        if (at(x, y - 1) === T_ROAD) { ctx.fillStyle = '#2b2f33'; ctx.fillRect(px, py, TILE, 5); }      // 둑
        if (at(x, y + 1) === T_ROAD) { ctx.fillStyle = '#2b2f33'; ctx.fillRect(px, py + TILE - 5, TILE, 5); }
      } else if (d === D_BRIDGE) {
        ctx.fillStyle = n < 8 ? '#2c3138' : '#2a2f36';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(px, py + TILE - 2, TILE, 2);   // 상판 이음매
        // 난간 — 물과 맞닿은 쪽
        if (w.deco[i - 1] === D_WATER) { ctx.fillStyle = '#4a5058'; ctx.fillRect(px, py, 5, TILE); }
        if (w.deco[i + 1] === D_WATER) { ctx.fillStyle = '#4a5058'; ctx.fillRect(px + TILE - 5, py, 5, TILE); }
      } else if (d === D_GRASS) {
        ctx.fillStyle = n < 6 ? '#1c271d' : n < 12 ? '#1a241b' : '#202c21';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = 'rgba(120,150,100,.08)';
        for (let k = 0; k < 4; k++) ctx.fillRect(px + ((n * 7 + k * 13) % 44), py + ((n * 11 + k * 17) % 44), 2, 3);
      } else if (d === D_PLAZA || d === D_LANDMARK) {
        // 광장 · 경내 — 포석
        ctx.fillStyle = d === D_LANDMARK ? '#2a2826' : n < 8 ? '#363a3f' : '#33373c';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, py + 16.5); ctx.lineTo(px + TILE, py + 16.5);
        ctx.moveTo(px, py + 32.5); ctx.lineTo(px + TILE, py + 32.5);
        ctx.moveTo(px + 24.5, py); ctx.lineTo(px + 24.5, py + 16);
        ctx.moveTo(px + 12.5, py + 16); ctx.lineTo(px + 12.5, py + 32);
        ctx.moveTo(px + 36.5, py + 32); ctx.lineTo(px + 36.5, py + 48);
        ctx.stroke();
      } else if (d === D_SIDEWALK) {
        ctx.fillStyle = n < 8 ? '#343b45' : '#2f363f';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.strokeStyle = 'rgba(255,255,255,.05)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + .5, py + .5, TILE - 1, TILE - 1);
      } else {
        ctx.fillStyle = n < 6 ? '#272d36' : n < 12 ? '#232932' : '#2b323c';
        ctx.fillRect(px, py, TILE, TILE);
        // 중앙선 — 대로의 노란 겹선
        const m = w.mark[i];
        if (m === 1 && (y & 1) === 0) {
          ctx.fillStyle = 'rgba(214,180,70,.32)';
          ctx.fillRect(px - 3, py + 6, 2, TILE - 12); ctx.fillRect(px + 1, py + 6, 2, TILE - 12);
        } else if (m === 2 && (x & 1) === 0) {
          ctx.fillStyle = 'rgba(214,180,70,.32)';
          ctx.fillRect(px + 6, py - 3, TILE - 12, 2); ctx.fillRect(px + 6, py + 1, TILE - 12, 2);
        }
        // 횡단보도
        const cw = w.cross[i];
        if (cw) {
          ctx.fillStyle = 'rgba(230,228,218,.28)';
          for (let k = 0; k < 4; k++) {
            if (cw === 1) ctx.fillRect(px + 4 + k * 11, py + 6, 6, TILE - 12);
            else ctx.fillRect(px + 6, py + 4 + k * 11, TILE - 12, 6);
          }
        }
      }
    }
  }

  /* 젖은 웅덩이 */
  ctx.fillStyle = 'rgba(130,165,200,.09)';
  for (const q of G.puddles) {
    if (q.x < cam.x - 60 || q.x > cam.x + W + 60 || q.y < cam.y - 60 || q.y > cam.y + H + 60) continue;
    ctx.beginPath(); ctx.ellipse(q.x, q.y, q.rx, q.ry, 0, 0, 6.283); ctx.fill();
  }
  drawLandmarksGround(cam, w);
}

/* ═══════════ 도시의 불빛 ═══════════
   정전된 도시에도 남은 불빛이 있다 — 비상 전원으로 깜빡이는 간판, 자판기, 등롱, 철탑 항공등,
   발전기가 돌아가는 야시장. 가산 합성이라 어둠 위에 떠 길잡이가 된다(적은 드러내지 않는다). */
function drawCityLights(cam, g, w) {
  const E = eyeOf(cam), t = g.time;
  const vis = (x, y, m) => !(x < cam.x - m || x > cam.x + W + m || y < cam.y - m || y > cam.y + H + m);
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
    let cx, cy;
    if (sg.side === 's') { [cx, cy] = liftPt(E, bx + TILE / 2, by + TILE, 0.07); }
    else if (sg.side === 'w') { [cx, cy] = liftPt(E, bx, by + TILE / 2, 0.07); }
    else { [cx, cy] = liftPt(E, bx + TILE, by + TILE / 2, 0.07); }
    glow(cx, cy, 34, hexA(sg.col), 0.16 * flick);
    ctx.globalAlpha = 0.75 * flick;
    ctx.fillStyle = sg.col;
    ctx.font = `600 ${sg.text.length > 4 ? 10 : 12}px var(--font), sans-serif`;
    ctx.fillText(sg.text, cx, cy);
    ctx.globalAlpha = 1;
  }
  // 자판기 · 노점 수레 · 신당
  for (const d of w.decor) {
    if (!vis(d.x, d.y, 60)) continue;
    if (d.kind === 'vending') glow(d.x + (d.wall === 'w' ? -16 : d.wall === 'e' ? 16 : 0), d.y + (d.wall === 'n' ? -16 : 0), 46, 'rgba(210,235,255,A)', 0.22);
    else if (d.kind === 'shrine') glow(d.x, d.y - 8, 26, 'rgba(255,190,90,A)', 0.2 + Math.sin(t * 3 + d.x) * 0.05);
  }
  // 랜드마크의 불빛
  for (const lm of w.landmarks) {
    if (!lmVisible(cam, lm, 400)) continue;
    if (lm.beacon && Math.sin(t * 3.1 + lm.x) > 0.2) glow(lm.beacon[0], lm.beacon[1], 30, 'rgba(255,40,30,A)', 0.7);
    if (lm.lantern) glow(lm.lantern[0], lm.lantern[1], 70, 'rgba(255,90,50,A)', 0.28);
    if (lm.bulbs) for (const [x, y] of lm.bulbs) glow(x, y, 14, 'rgba(255,200,120,A)', 0.45 + Math.sin(t * 5 + x) * 0.08);
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
  const x = lm.x * TILE, y = lm.y * TILE;
  return !(x + lm.w * TILE < cam.x - m || x > cam.x + W + m || y + lm.h * TILE < cam.y - m || y > cam.y + H + m);
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

function drawLandmarksGround(cam, w) {
  for (const lm of w.landmarks) {
    if (!lmVisible(cam, lm)) continue;
    if (lm.kind === 'palace') {
      // 정문에서 정전까지 박석 길
      ctx.fillStyle = '#45464a';
      ctx.fillRect((lm.gate.x + 1) * TILE + 8, (lm.hall.y + lm.hall.h) * TILE, 3 * TILE - 16, (lm.gate.y - lm.hall.y - lm.hall.h) * TILE);
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
    }
  }
  // 나무 그루터기 (밑동) — 우거진 잎은 위층에서
  for (const d of w.decor) if (d.kind === 'tree') {
    if (d.x < cam.x - 60 || d.x > cam.x + W + 60 || d.y < cam.y - 60 || d.y > cam.y + H + 60) continue;
    ctx.fillStyle = '#2b2219'; ctx.beginPath(); ctx.arc(d.x, d.y, 6, 0, 6.283); ctx.fill();
  }
}

function drawLandmarksTop(cam, w, g) {
  const E = eyeOf(cam);
  // 나무 — 잎이 시야를 가린다 (그 아래 감염체도)
  for (const d of w.decor) if (d.kind === 'tree') {
    if (d.x < cam.x - 80 || d.x > cam.x + W + 80 || d.y < cam.y - 80 || d.y > cam.y + H + 80) continue;
    const [x, y] = liftPt(E, d.x, d.y, 0.1);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(d.x + 4, d.y + 5, d.r, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#1e3020'; ctx.beginPath(); ctx.arc(x, y, d.r, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#26402a'; ctx.beginPath(); ctx.arc(x - d.r * 0.25, y - d.r * 0.25, d.r * 0.62, 0, 6.283); ctx.fill();
  }
  for (const lm of w.landmarks) {
    if (!lmVisible(cam, lm, 300)) continue;
    const L = LANDMARK_TOP[lm.kind];
    if (L) L(lm, E, g, w);
  }
}

const LANDMARK_TOP = {
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
  scramble() {}
};

/* ═══════════ 의사 3D 건물 ═══════════
   원작은 높은 곳에서 내려다보는 3D 카메라였다. 건물 지붕을 시점(화면 속 플레이어 자리)에서
   바깥쪽으로 (1+BLD_H) 배 밀어내면, 시점 쪽을 향한 벽면이 드러나 높이가 생긴다.
   지붕 전체가 시점 기준 한 번의 확대라서 이웃 타일의 지붕이 어긋나지 않는다. */
const BLD_H = 0.15;
function eyeOf(cam) { return { x: cam.x + W / 2, y: cam.y + focusY() }; }
const liftPt = (E, x, y, k) => [E.x + (x - E.x) * (1 + k), E.y + (y - E.y) * (1 + k)];

/** 원뿔 끝점 중 건물 벽에 막힌 것을 지붕선까지 들어 올린다 — 빛이 벽면을 타고 오른다 */
function liftPoly(poly, w, E) {
  const ox = poly[0], oy = poly[1];
  for (let i = 2; i < poly.length; i += 2) {
    const x = poly[i], y = poly[i + 1], dx = x - ox, dy = y - oy, d = Math.hypot(dx, dy);
    if (d < 1) continue;
    const tx = Math.floor((x + dx / d * 3) / TILE), ty = Math.floor((y + dy / d * 3) / TILE);
    if (tx < 0 || ty < 0 || tx >= w.w || ty >= w.h || w.deco[ty * w.w + tx] !== D_BUILDING) continue;
    const q = liftPt(E, x, y, BLD_H);
    poly[i] = q[0]; poly[i + 1] = q[1];
  }
  return poly;
}

function drawBuildings(cam, w) {
  const E = eyeOf(cam), K = BLD_H;
  const x0 = Math.max(0, Math.floor(cam.x / TILE) - 1), y0 = Math.max(0, Math.floor(cam.y / TILE) - 1);
  const x1 = Math.min(w.w - 1, Math.ceil((cam.x + W) / TILE)), y1 = Math.min(w.h - 1, Math.ceil((cam.y + H) / TILE));
  const isB = (x, y) => x < 0 || y < 0 || x >= w.w || y >= w.h || w.deco[y * w.w + x] === D_BUILDING;

  // 벽면 — 시점을 향한 면만. 면 방향별로 한 경로에 모아 칠한다
  const faces = { s: [], n: [], e: [] };
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!isB(x, y)) continue;
    const px = x * TILE, py = y * TILE, qx = px + TILE, qy = py + TILE;
    if (E.y > qy && !isB(x, y + 1)) faces.s.push(px, qy, qx, qy);
    if (E.y < py && !isB(x, y - 1)) faces.n.push(px, py, qx, py);
    if (E.x < px && !isB(x - 1, y)) faces.e.push(px, py, px, qy);
    if (E.x > qx && !isB(x + 1, y)) faces.e.push(qx, py, qx, qy);
  }
  const cols = { s: '#252d38', n: '#10141a', e: '#1a2029' };
  ctx.strokeStyle = 'rgba(0,0,0,.42)';
  ctx.lineWidth = 2;
  for (const k in faces) {
    const f = faces[k];
    if (!f.length) continue;
    ctx.fillStyle = cols[k];
    ctx.beginPath();
    for (let i = 0; i < f.length; i += 4) {
      const a = liftPt(E, f[i], f[i + 1], K), b = liftPt(E, f[i + 2], f[i + 3], K);
      ctx.moveTo(f[i], f[i + 1]); ctx.lineTo(f[i + 2], f[i + 3]);
      ctx.lineTo(b[0], b[1]); ctx.lineTo(a[0], a[1]); ctx.closePath();
    }
    ctx.fill();
    // 층 구분선
    ctx.beginPath();
    for (let i = 0; i < f.length; i += 4) for (const t of [0.34, 0.67]) {
      const a = liftPt(E, f[i], f[i + 1], K * t), b = liftPt(E, f[i + 2], f[i + 3], K * t);
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    }
    ctx.stroke();
  }

  // 지붕 — 시점 기준으로 (1+K) 배 확대한 좌표계에서 바닥 평면과 같은 방식으로 그린다
  ctx.save();
  ctx.translate(E.x, E.y); ctx.scale(1 + K, 1 + K); ctx.translate(-E.x, -E.y);
  // 지붕 색은 필지마다 — 같은 건물은 한 색, 옆 건물은 다른 색으로 도시의 결이 보인다
  const roofs = w.theme.roofs, R = roofs.length;
  for (let c = 0; c < R; c++) {
    ctx.fillStyle = roofs[c];
    ctx.beginPath();
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!isB(x, y) || x < 0 || y < 0 || x >= w.w || y >= w.h) continue;
      const lot = w.lot[y * w.w + x];
      const k = lot ? lot % R : (((x * 73856093) ^ (y * 19349663)) & 15) % R;
      if (k === c) ctx.rect(x * TILE - 0.5, y * TILE - 0.5, TILE + 1, TILE + 1);
    }
    ctx.fill();
  }
  // 필지 경계 — 같은 블록 안의 다른 건물 사이에 얕은 틈
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!isB(x, y) || x < 0 || y < 0 || x >= w.w - 1 || y >= w.h - 1) continue;
    const l = w.lot[y * w.w + x];
    if (isB(x + 1, y) && w.lot[y * w.w + x + 1] !== l) { ctx.moveTo((x + 1) * TILE, y * TILE); ctx.lineTo((x + 1) * TILE, (y + 1) * TILE); }
    if (isB(x, y + 1) && w.lot[(y + 1) * w.w + x] !== l) { ctx.moveTo(x * TILE, (y + 1) * TILE); ctx.lineTo((x + 1) * TILE, (y + 1) * TILE); }
  }
  ctx.stroke();
  // 난간선과 옥상 설비
  ctx.strokeStyle = 'rgba(160,176,198,.16)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!isB(x, y)) continue;
    const px = x * TILE, py = y * TILE;
    if (!isB(x, y + 1)) { ctx.moveTo(px, py + TILE - 2); ctx.lineTo(px + TILE, py + TILE - 2); }
    if (!isB(x, y - 1)) { ctx.moveTo(px, py + 2); ctx.lineTo(px + TILE, py + 2); }
    if (!isB(x - 1, y)) { ctx.moveTo(px + 2, py); ctx.lineTo(px + 2, py + TILE); }
    if (!isB(x + 1, y)) { ctx.moveTo(px + TILE - 2, py); ctx.lineTo(px + TILE - 2, py + TILE); }
  }
  ctx.stroke();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!isB(x, y) || !isB(x + 1, y) || !isB(x, y + 1)) continue;
    const h = ((x * 2654435761) ^ (y * 40503)) >>> 0;
    if (h % 9 !== 0) continue;
    const ux = x * TILE + 10 + (h >> 4) % 16, uy = y * TILE + 10 + (h >> 8) % 16;
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(ux + 3, uy + 4, 22, 16);
    ctx.fillStyle = '#2a323c'; ctx.fillRect(ux, uy, 22, 16);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(ux + 11, uy + 8, 5, 0, 6.283); ctx.fill();
  }
  ctx.restore();
}

/** 버려진 탈것과 화물 · 나라별 길가 장식 — 손전등에 색이 살아난다 */
function drawProps(cam, w) {
  const vis = (x, y, m) => !(x < cam.x - m || x > cam.x + W + m || y < cam.y - m || y > cam.y + H + m);
  for (const pr of w.props) {
    if (!vis(pr.x, pr.y, 90)) continue;
    ctx.save();
    ctx.translate(pr.x, pr.y); ctx.rotate(pr.a);
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(-pr.w / 2 - 2, -pr.h / 2 + 3, pr.w + 4, pr.h);
    if (pr.kind === 'tuktuk') {
      // 뚝뚝 — 앞바퀴 하나, 지붕 천막
      ctx.fillStyle = '#2a2d31'; ctx.fillRect(-pr.w / 2, -pr.h / 2, pr.w, pr.h);
      ctx.fillStyle = pr.col; ctx.fillRect(-pr.w / 2 + 2, -pr.h / 2 - 1, pr.w * 0.62, pr.h + 2);
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(-pr.w / 2 + 2, -pr.h / 2 - 1, pr.w * 0.62, 3);
      ctx.fillStyle = '#16181b'; ctx.beginPath(); ctx.arc(pr.w / 2 - 3, 0, 4, 0, 6.283); ctx.fill();
      ctx.restore(); continue;
    }
    ctx.fillStyle = pr.col;
    ctx.fillRect(-pr.w / 2, -pr.h / 2, pr.w, pr.h);
    if (pr.kind === 'car') {
      ctx.fillStyle = 'rgba(10,14,18,.85)';                 // 유리
      ctx.fillRect(-pr.w * 0.16, -pr.h / 2 + 3, pr.w * 0.34, pr.h - 6);
      ctx.fillStyle = 'rgba(255,255,255,.10)';              // 지붕 하이라이트
      ctx.fillRect(-pr.w / 2, -pr.h / 2, pr.w, 3);
    } else if (pr.kind === 'bus') {
      ctx.fillStyle = 'rgba(10,14,18,.8)';                  // 옆 창 줄
      for (let i = -pr.w / 2 + 8; i < pr.w / 2 - 10; i += 12) { ctx.fillRect(i, -pr.h / 2 + 2, 8, 4); ctx.fillRect(i, pr.h / 2 - 6, 8, 4); }
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(-pr.w / 2 + 4, -pr.h / 2 + 9, pr.w - 8, pr.h - 18);   // 지붕 환기구
      ctx.fillStyle = 'rgba(10,14,18,.85)'; ctx.fillRect(pr.w / 2 - 7, -pr.h / 2 + 3, 5, pr.h - 6);            // 앞유리
    } else {
      ctx.fillStyle = 'rgba(0,0,0,.26)';                    // 컨테이너 골판
      for (let i = -pr.w / 2 + 6; i < pr.w / 2 - 2; i += 8) ctx.fillRect(i, -pr.h / 2 + 2, 3, pr.h - 4);
      ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1;
      ctx.strokeRect(-pr.w / 2 + .5, -pr.h / 2 + .5, pr.w - 1, pr.h - 1);
    }
    ctx.restore();
  }
  // 길가 장식 (밟고 지나갈 수 있는 것들)
  for (const d of w.decor) {
    if (!vis(d.x, d.y, 60)) continue;
    const off = d.wall === 'n' ? [0, -16] : d.wall === 'w' ? [-16, 0] : d.wall === 'e' ? [16, 0] : [0, 0];
    const x = d.x + off[0], y = d.y + off[1];
    if (d.kind === 'boat') {
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.a);
      ctx.fillStyle = '#3a2c22'; ctx.beginPath(); ctx.ellipse(0, 0, 44, 9, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#4c3a2c'; ctx.fillRect(-20, -5, 26, 10);
      ctx.restore();
    } else if (d.kind === 'vending') {
      ctx.fillStyle = '#d9dde2'; ctx.fillRect(x - 9, y - 7, 18, 14);
      ctx.fillStyle = '#7a8b99'; ctx.fillRect(x - 7, y - 5, 14, 6);
    } else if (d.kind === 'cart') {
      ctx.fillStyle = '#5a4030'; ctx.fillRect(x - 12, y - 7, 24, 14);
      ctx.fillStyle = d.col; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(x, y, 15, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1;
    } else if (d.kind === 'parasol') {
      ctx.fillStyle = '#3d4248'; ctx.fillRect(x - 10, y - 10, 20, 20);
      ctx.fillStyle = d.col; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(x, y, 16, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1;
    } else if (d.kind === 'bike') {
      ctx.strokeStyle = '#6a737c'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x - 7, y, 5, 0, 6.283); ctx.arc(x + 7, y, 5, 0, 6.283); ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.stroke();
    } else if (d.kind === 'shrine') {
      ctx.fillStyle = '#6b5a3a'; ctx.fillRect(x - 2, y - 2, 4, 10);
      ctx.fillStyle = '#c9a34a'; ctx.fillRect(x - 8, y - 9, 16, 10);
      ctx.fillStyle = '#8a3a2a'; ctx.beginPath(); ctx.moveTo(x - 10, y - 9); ctx.lineTo(x, y - 16); ctx.lineTo(x + 10, y - 9); ctx.fill();
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
  const bob = Math.sin(p.walkPhase) * 1.4;
  ctx.save();
  ctx.translate(p.x, p.y + bob);
  ctx.rotate(p.angle);
  // 그림자
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.beginPath(); ctx.ellipse(0, 3, 14, 11, 0, 0, 6.283); ctx.fill();
  // 몸통
  ctx.fillStyle = p.hurtFlash > 0.05 ? '#8c4a45' : '#2f3a44';
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, 6.283); ctx.fill();
  ctx.strokeStyle = 'rgba(190,210,230,.28)'; ctx.lineWidth = 1.5; ctx.stroke();
  // 어깨
  ctx.fillStyle = '#39454f';
  ctx.fillRect(-4, -12, 9, 5); ctx.fillRect(-4, 7, 9, 5);
  // 근접 밀치기 — 총을 앞으로 내지르는 모션
  const sw = p.meleeAnim > 0 ? Math.sin((1 - p.meleeAnim / 0.2) * Math.PI) : 0;
  // 총 + 손전등
  ctx.fillStyle = '#1a1f25';
  ctx.fillRect(6 + sw * 9, -3, 17, 6);
  ctx.fillStyle = '#f4e2a8';
  ctx.fillRect(21 + sw * 9, -2, 4, 4);
  if (sw > 0.02) {
    ctx.strokeStyle = `rgba(226,238,250,${0.3 * sw})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, 34, -1.0, 1.0); ctx.stroke();
  }
  ctx.restore();
}

function drawZombie(z) {
  const sway = Math.sin(z.phase) * (z.aggro ? 3.2 : 1.6);
  const S = z.t.size;
  // Darkwood 처럼 — 거리·건물 같은 정적인 것은 어둠 속에서도 희미하게 보이지만,
  // 적은 손전등 원뿔 안에서만 형체가 있다. 밖에서는 붉은 눈(발광 층)만 남는다.
  // 바로 곁(손이 닿는 거리)과 번개만 예외다 — "번개가 치면 무리가 보인다"
  const p = G.player, d = Math.hypot(z.x - p.x, z.y - p.y);
  const vis = Math.max(z.lit, clamp((120 - d) / 50, 0, 1), G.lightning * 1.4, z.t.boss ? 0.5 : 0);
  if (vis <= 0.01) return;
  ctx.save();
  const a0 = clamp(vis, 0, 1);
  ctx.globalAlpha = a0;
  ctx.translate(z.x, z.y);
  ctx.rotate(z.face);
  ctx.fillStyle = 'rgba(0,0,0,.42)';
  ctx.beginPath(); ctx.ellipse(0, 3, S + 3, S, 0, 0, 6.283); ctx.fill();

  if (z.t.weeper) {
    // 우는 것 — 무릎을 끌어안고 웅크린 창백한 형체, 늘어진 검은 머리. 깨어나면 일어서 긴 손톱을 뻗는다
    if (!z.rage) {
      const sob = Math.sin(z.phase * 3) * (1 + (z.startle || 0) * 2);
      ctx.fillStyle = z.t.body;
      ctx.beginPath(); ctx.ellipse(-2, 0, S * 1.05, S * 0.9 + sob * 0.4, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#141414';
      ctx.beginPath(); ctx.ellipse(S * 0.35, 0, S * 0.62, S * 0.7, 0, 0, 6.283); ctx.fill();      // 늘어뜨린 머리카락
      ctx.fillStyle = z.t.head;
      ctx.fillRect(S * 0.2, -S * 0.75, S * 0.9, 3); ctx.fillRect(S * 0.2, S * 0.75 - 3, S * 0.9, 3);  // 무릎을 감싼 팔
    } else {
      ctx.fillStyle = z.t.body;
      ctx.beginPath(); ctx.ellipse(0, 0, S * 0.9, S * 0.75, 0, 0, 6.283); ctx.fill();
      ctx.strokeStyle = z.t.head; ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (const s2 of [-1, 1]) { ctx.moveTo(2, s2 * S * 0.6); ctx.lineTo(S * 2.1, s2 * (S * 0.5 + sway)); }
      ctx.stroke();
      ctx.fillStyle = '#141414'; ctx.beginPath(); ctx.arc(S * 0.4, 0, S * 0.55, 0, 6.283); ctx.fill();
    }
  } else if (z.t.bloat) {
    // 부푼 것 — 터질 듯한 몸통에 고름 주머니
    const pulse = 1 + Math.sin(z.phase * 0.8) * 0.04;
    ctx.fillStyle = z.t.body;
    ctx.beginPath(); ctx.ellipse(-2, 0, S * 1.08 * pulse, S * pulse, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = 'rgba(183,201,106,.55)';
    for (const [bx, by, br] of [[-6, -7, 4], [3, 8, 5], [-9, 6, 3], [6, -4, 3]]) { ctx.beginPath(); ctx.arc(bx, by, br, 0, 6.283); ctx.fill(); }
    ctx.fillStyle = z.t.head;
    ctx.beginPath(); ctx.arc(S * 0.7, 0, S * 0.36, 0, 6.283); ctx.fill();
  } else if (z.t.boss) {
    // 그것 — 굽은 등과 비대한 팔. 돌진 선딜에는 몸이 부풀어 오른다
    const w = z.chargePhase === 'wind' ? 1 + Math.sin(z.phase * 2) * 0.09 : 1;
    ctx.fillStyle = z.t.body;
    ctx.beginPath(); ctx.ellipse(0, 0, S * 1.12 * w, S * w, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = z.t.head;
    ctx.fillRect(S * 0.2, -S - 2 + sway * 0.6, S * 1.5, 8);
    ctx.fillRect(S * 0.2, S - 6 - sway * 0.6, S * 1.5, 8);
    ctx.beginPath(); ctx.arc(S * 0.72, sway * 0.3, S * 0.46, 0, 6.283); ctx.fill();
    // 등줄기
    ctx.fillStyle = 'rgba(16,20,24,.55)';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.ellipse(-S * 0.45, i * S * 0.3, S * 0.2, S * 0.12, 0, 0, 6.283); ctx.fill();
    }
  } else if (z.t.crawl) {
    // 기어다니는 것 — 바닥에 눌린 납작한 실루엣, 팔은 옆으로 넓게
    ctx.fillStyle = z.t.body;
    ctx.beginPath(); ctx.ellipse(0, 0, S * 1.5, S * 0.78, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = z.t.head;
    const reach = S * (z.lunging ? 1.9 : 1.2);
    ctx.fillRect(S * 0.5, -S - 1 + sway * 0.5, reach, 3);
    ctx.fillRect(S * 0.5, S - 2 - sway * 0.5, reach, 3);
    ctx.beginPath(); ctx.arc(S * 1.1, sway * 0.2, S * 0.5, 0, 6.283); ctx.fill();
  } else {
    ctx.fillStyle = z.t.body;
    ctx.beginPath(); ctx.arc(0, 0, S, 0, 6.283); ctx.fill();
    // 팔 — 앞으로 뻗은
    ctx.fillStyle = z.t.head;
    ctx.fillRect(2, -S + 1 + sway * 0.4, S + 4, 4);
    ctx.fillRect(2, S - 5 - sway * 0.4, S + 4, 4);
    // 머리
    ctx.beginPath(); ctx.arc(S * 0.42, sway * 0.3, S * 0.52, 0, 6.283); ctx.fill();
    // 뱉는 것 — 등에 부푼 산 주머니
    if (z.t.spit) {
      const pulse = 0.82 + Math.sin(z.phase * 1.4) * 0.14;
      ctx.fillStyle = `rgba(126,186,48,${z.spitT < 0.5 ? 0.95 : 0.6})`;
      ctx.beginPath(); ctx.ellipse(-S * 0.5, 0, S * 0.62 * pulse, S * 0.52 * pulse, 0, 0, 6.283); ctx.fill();
    }
  }
  // 피해 표시
  if (z.hp < z.hpMax) {
    ctx.globalAlpha = a0 * clamp(1 - z.hp / z.hpMax, 0, 1) * 0.5;
    ctx.fillStyle = '#6b1310';
    ctx.beginPath(); ctx.arc(0, 0, z.t.size * 0.8, 0, 6.283); ctx.fill();
  }
  // 맞은 순간 하얗게 번쩍인다
  if (z.flash > 0) {
    ctx.globalAlpha = a0 * 0.75;
    ctx.fillStyle = '#f4f1ea';
    ctx.beginPath(); ctx.arc(0, 0, z.t.size * 1.02, 0, 6.283); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawCorpse(c) {
  ctx.save();
  ctx.translate(c.x, c.y); ctx.rotate(c.a);
  ctx.globalAlpha = clamp(1 - c.age / 240, 0.25, 1);
  ctx.fillStyle = c.type === 'player' ? '#3a2f2c' : '#2a2f28';
  ctx.beginPath(); ctx.ellipse(0, 0, 15, 9, 0, 0, 6.283); ctx.fill();
  ctx.fillStyle = 'rgba(90,16,12,.5)';
  ctx.beginPath(); ctx.ellipse(-4, 0, 20, 13, 0, 0, 6.283); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawPickup(pk, time) {
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
  } else if (pk.p.icon === 'nade') {
    ctx.beginPath(); ctx.arc(0, 1, 6.5, 0, 6.283); ctx.fill();
    ctx.fillRect(-1.5, -9, 3, 4);
  } else {
    ctx.fillRect(-8, -5, 16, 10);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(-6, -3, 3, 6); ctx.fillRect(-1.5, -3, 3, 6); ctx.fillRect(3, -3, 3, 6);
  }
  ctx.restore();
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
  const base = 0.74 - (SETTINGS.brightness - 50) * 0.0044;   // 0 → 0.96, 50 → 0.74, 100 → 0.52
  return clamp(base - g.lightning * (SETTINGS.flash ? 0.72 : 0.25), 0.06, 0.985);
}

function drawDarkness(cam, g, p, w) {
  const dark = darkLevel(g);
  const E = eyeOf(cam);
  mctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  mctx.globalCompositeOperation = 'source-over';
  mctx.clearRect(0, 0, W, H);
  mctx.fillStyle = `rgba(3,4,6,${dark})`;
  mctx.fillRect(0, 0, W, H);

  mctx.globalCompositeOperation = 'destination-out';
  mctx.save();
  mctx.translate(-cam.x, -cam.y);

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

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(mask, 0, 0);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

/* 가산 발광 레이어: 불빛의 따뜻함, 눈, 목표 지점 */
function drawGlow(cam, g, p, w) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(-cam.x, -cam.y);

  const range = p.lightRange;
  if (range > 0) {
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
    const ex = z.x + Math.cos(z.face) * z.t.size * 0.6;
    const ey = z.y + Math.sin(z.face) * z.t.size * 0.6;
    const nx = -Math.sin(z.face) * 2.6, ny = Math.cos(z.face) * 2.6;
    ctx.beginPath(); ctx.arc(ex + nx, ey + ny, 1.7, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.arc(ex - nx, ey - ny, 1.7, 0, 6.283); ctx.fill();
  }

  drawCityLights(cam, g, w);

  // 경보기 차 — 평소엔 계기판의 붉은 점이 천천히 깜빡인다(건드리지 말라는 신호).
  // 울리면 비상등이 번갈아 번쩍인다
  for (const pr of w.props) {
    if (!pr.alarm || Math.hypot(pr.x - p.x, pr.y - p.y) > 900) continue;
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
    gr.addColorStop(0, pk.type === 'goal' ? 'rgba(90,190,230,.30)' : 'rgba(230,200,120,.16)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(pk.x, pk.y, 34, 0, 6.283); ctx.fill();
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
    const mx = p.x + Math.cos(p.angle) * 22, my = p.y + Math.sin(p.angle) * 22;
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
function drawRain(g) {
  const dt = 1 / 60;
  rainT += dt;
  ctx.strokeStyle = 'rgba(180,200,225,1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const r of g.rain) {
    r.y += r.v * dt; r.x -= r.v * 0.22 * dt;
    if (r.y > H) { r.y = -20; r.x = Math.random() * (W + 400) - 100; }
    if (r.x < -60) r.x = W + 40;
    ctx.globalAlpha = r.a;
    ctx.moveTo(r.x, r.y); ctx.lineTo(r.x - r.len * 0.22, r.y + r.len);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (g.lightning > 0.01) {
    // 원작의 번개는 화면 전체를 순간적으로 밝힌다(평균 밝기 22 → 120). 섬광을 끈 설정에선 약하게
    ctx.fillStyle = `rgba(196,208,228,${g.lightning * (SETTINGS.flash ? 0.34 : 0.08)})`;
    ctx.fillRect(0, 0, W, H);
  }
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
    else if (d === D_GRASS) [r, gg, b] = solid ? [30, 60, 34] : [46, 78, 48];
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
    c.drawImage(this.img, px - span / 2, py - span / 2, span, span, 0, 0, S, S);
    c.globalAlpha = 1;
    const dot = (wx, wy, col, r) => {
      let x = (wx / TILE - px) * k + S / 2, y = (wy / TILE - py) * k + S / 2;
      const d = Math.hypot(x - S / 2, y - S / 2), lim = S / 2 - r - 3;
      if (d > lim) { x = S / 2 + (x - S / 2) / d * lim; y = S / 2 + (y - S / 2) / d * lim; }  // 가장자리에 붙인다
      c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill();
    };
    const ob = g.level.objective;
    for (const pk of g.pickups) if (pk.type === 'goal') dot(pk.x, pk.y, '#59b7d8', 5);
    if (g.exitOpen && ob.type !== 'endless') dot(g.world.exit.x, g.world.exit.y, '#78dcff', 6);
    // 플레이어 — 바라보는 쪽을 가리키는 삼각형
    c.translate(S / 2, S / 2); c.rotate(p.angle);
    c.fillStyle = '#f0b429';
    c.beginPath(); c.moveTo(10, 0); c.lineTo(-6, -6); c.lineTo(-3, 0); c.lineTo(-6, 6); c.closePath(); c.fill();
    c.restore();
  }
};

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
  c.font = '600 11px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'bottom';
  for (const lm of w.landmarks) {
    const x = ox + (lm.x + lm.w / 2) * k, y = oy + lm.y * k;
    c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(x - c.measureText(lm.name).width / 2 - 3, y - 15, c.measureText(lm.name).width + 6, 14);
    c.fillStyle = '#f2c98a'; c.fillText(lm.name, x, y - 2);
  }
  mark(w.spawn, '#f0b429');
  if (L.objective.type !== 'endless') mark(w.exit, '#78dcff');
}

/* ═══════════ HUD ═══════════ */
let hudT = 0;
G.refreshHud = function (force) {
  const p = this.player, ob = this.level.objective;
  $('hudChapter').textContent = this.survival ? 'SURVIVAL' : `CHAPTER ${this.levelIndex + 1}`;

  let obj;
  if (ob.type === 'endless') obj = `생존 ${Math.floor(this.time)}초 · 점수 ${this.score}`;
  else if (this.exitOpen) obj = '집결지로 이동하라';
  else if (ob.type === 'collect') obj = `보급 상자 ${this.goalsTotal - this.goalsLeft}/${this.goalsTotal} 확보`;
  else if (ob.type === 'survive') obj = `${Math.ceil(this.surviveLeft)}초 버텨라`;
  else if (ob.type === 'purge') obj = `감염체 ${this.kills}/${this.goalsTotal} 소탕`;
  else if (ob.type === 'boss') obj = '그것을 쓰러뜨려라';
  else obj = '탈출로를 찾아라';
  $('hudObjective').textContent = obj;

  $('hudKills').textContent = this.kills;
  const t = Math.floor(this.time);
  $('hudClock').textContent = `${String((t / 60) | 0).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;

  $('gaugeHealth').style.width = (p.hp / p.hpMax * 100) + '%';
  $('gaugeBattery').style.width = p.battery + '%';
  $('gaugeStam').style.width = (p.stam / p.stamMax * 100) + '%';
  document.querySelector('.gauge--health').classList.toggle('low', p.hp < 30);
  document.querySelector('.gauge--stam').classList.toggle('low', p.winded);

  const wp = p.weapon, inMag = p.magOf(wp), spare = p.reserveOf(wp);
  $('hudAmmo').textContent = inMag;
  $('hudReserve').textContent = spare === Infinity ? '/ ∞' : '/ ' + spare;
  $('hudWeapon').textContent = p.reloading ? '장전 중' : wp.name;
  const gun = document.querySelector('.ammo__gun');
  gun.classList.toggle('dry', inMag <= Math.max(1, wp.mag * 0.2));
  gun.classList.toggle('reloading', p.reloading);
  $('hudReloadBar').style.width = (p.reloadProgress * 100) + '%';
  $('hudNades').textContent = p.nades;
  if (isTouch) {
    $('btnSprint').classList.toggle('on', input.sprintLatch);
    $('btnSprint').classList.toggle('dim', p.winded);
    $('btnLight').classList.toggle('off', !p.lightOn || p.battery <= 0);
  }

  const slots = $('hudSlots');
  const sig = SLOT_ORDER.filter(k => p.owned.has(k)).join(',') + '|' + wp.key;
  if (slots.dataset.sig !== sig) {
    slots.dataset.sig = sig;
    slots.innerHTML = SLOT_ORDER.filter(k => p.owned.has(k)).map(k =>
      `<span class="${k === wp.key ? 'on' : ''}">${WEAPONS[k].slot} ${WEAPONS[k].name}</span>`).join('');
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
    if (this.exitOpen) { tx = this.world.exit.x; ty = this.world.exit.y; }
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
    if (tx === null) { compass.style.opacity = '0'; }
    else {
      compass.style.opacity = '1';
      const ang = Math.atan2(ty - p.y, tx - p.x) * 180 / Math.PI + 90;
      compass.querySelector('svg').style.transform = `rotate(${ang}deg) translateY(-76px)`;
      $('hudDistance').textContent = Math.round(Math.hypot(tx - p.x, ty - p.y) / TILE * 2.4) + 'm';
    }
  }
};

/* ═══════════ 화면 전환 ═══════════ */
const UI = {
  screens: ['scrTitle', 'scrChapters', 'scrHowto', 'scrBrief', 'scrCity', 'scrPause', 'scrResult',
            'scrSettings', 'scrEnding'],
  settingsFrom: 'scrTitle',
  hideScreens() { this.screens.forEach(s => $(s).classList.add('hidden')); },
  show(id) { this.hideScreens(); $(id).classList.remove('hidden'); },
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
    const b = G.bestSurvival();
    $('bestSurvival').textContent = b ? `${Math.floor(b / 60)}분 ${b % 60}초` : '—';
    // 원작처럼 서바이벌은 이야기를 끝까지 본 뒤에 열린다
    const open = G.survivalOpen();
    $('btnSurvival').disabled = !open;
    $('btnSurvival').textContent = open ? '서바이벌' : `서바이벌 — 전역 완수 시 개방 (${Math.min(G.progress(), LEVELS.length)}/${LEVELS.length})`;
    this.show('scrTitle');
  },
  buildChapters() {
    const list = $('chapterList');
    const unlocked = G.progress();
    const grades = G.grades();
    list.innerHTML = '';
    LEVELS.forEach((L, i) => {
      const locked = i > unlocked;
      const el = document.createElement('div');
      el.className = 'chapter' + (locked ? ' chapter--locked' : '');
      const best = grades[i] | 0;
      const mark = locked ? '잠김'
        : best ? `<b class="chapter__grade" data-g="${UI.letter(best)}">${UI.letter(best)}</b>` +
                 `<span class="chapter__score">${best}</span>`
        : i < unlocked ? '클리어' : '▶';
      el.innerHTML =
        `<span class="chapter__no">${String(i + 1).padStart(2, '0')}</span>` +
        `<span class="chapter__name">${L.name}<br><span class="chapter__goal">${L.goals[0]}</span></span>` +
        `<span class="chapter__mark">${mark}</span>`;
      if (!locked) el.addEventListener('click', () => { SFX.click(); UI.brief(i); });
      list.appendChild(el);
    });
  },
  brief(i) {
    G.pendingLevel = i;
    const L = LEVELS[i];
    $('briefNo').textContent = `CHAPTER ${i + 1}`;
    $('briefTitle').textContent = L.name;
    $('briefText').textContent = L.brief;
    $('briefGoals').innerHTML = L.goals.map(g => `<li>${g}</li>`).join('');
    drawBriefMap(L);
    this.show('scrBrief');
  },
  /** 일시정지 중 현재 판의 전황 — 멈춘 김에 상황을 보라고 */
  showPause() {
    const p = G.player, ob = G.level.objective;
    const t = Math.floor(G.time);
    const acc = G.shots ? Math.round(G.hits / G.shots * 100) : null;
    $('pauseWhere').textContent = G.survival
      ? `서바이벌 · ${DIFFICULTY[G.difficulty].name}`
      : `CHAPTER ${G.levelIndex + 1} — ${G.level.name} · ${DIFFICULTY[G.difficulty].name}`;

    const wp = p.weapon;
    const rows = [
      ['경과', `${String((t / 60) | 0).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`],
      ['처치', `${G.kills}기`],
      ['명중률', acc === null ? '—' : `${acc}%`],
      ['받은 피해', `${Math.round(p.dmgTaken)}`],
      ['체력 · 배터리', `${Math.round(p.hp)} · ${Math.round(p.battery)}`],
      ['장비', `${wp.name} ${p.magOf(wp)}${p.reserveOf(wp) === Infinity ? '' : '/' + p.reserveOf(wp)}`]
    ];
    if (ob.type === 'collect') rows.push(['보급 상자', `${G.goalsTotal - G.goalsLeft}/${G.goalsTotal}`]);
    if (ob.type === 'survive') rows.push(['남은 시간', `${Math.ceil(G.surviveLeft)}초`]);
    if (ob.type === 'purge') rows.push(['소탕', `${G.kills}/${G.goalsTotal}`]);
    if (ob.type === 'boss') rows.push(['그것', G.boss && !G.boss.dead
      ? `${Math.max(0, Math.round(G.boss.hp / G.boss.hpMax * 100))}%` : '처치']);
    $('pauseStats').innerHTML = rows.map(r =>
      `<div><dt>${r[0]}</dt><dd>${r[1]}</dd></div>`).join('');
    this.show('scrPause');
  },

  /** 전역을 끝낸 뒤의 마무리 화면 — 챕터별 평가를 모아 보여 준다 */
  showEnding() {
    const grades = G.grades();
    const done = LEVELS.map((L, i) => grades[i] | 0).filter(v => v > 0);
    const sum = done.reduce((a, b) => a + b, 0);
    const avg = done.length ? Math.round(sum / done.length) : 0;

    const rows = [
      ['클리어', `${LEVELS.length}개 챕터`],
      ['평가 남긴 챕터', `${done.length}/${LEVELS.length}`],
      ['평균 평가', done.length ? `${UI.letter(avg)} (${avg})` : '—'],
      ['최고 평가', done.length ? `${UI.letter(Math.max(...done))} (${Math.max(...done)})` : '—'],
      ['난이도', DIFFICULTY[G.difficulty] ? DIFFICULTY[G.difficulty].name : '—'],
      ['마지막 처치', `${G.kills}기`]
    ];
    $('endingStats').innerHTML = rows.map(r =>
      `<div><dt>${r[0]}</dt><dd>${r[1]}</dd></div>`).join('');
    $('endingNote').textContent = done.length < LEVELS.length
      ? '아직 평가가 남지 않은 챕터가 있다. 챕터 선택에서 다시 들어갈 수 있다.'
      : '모든 챕터에 기록을 남겼다. 더 높은 난이도가 기다린다.';

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
      b.classList.toggle('on', b.dataset.val === SETTINGS.get(b.dataset.set));
    $('setBright').value = SETTINGS.brightness;
    $('setBrightVal').textContent = SETTINGS.brightness;
    $('setDiffNote').textContent = `${SETTINGS.mod.name} — ${SETTINGS.mod.note}`;
    for (const b of document.querySelectorAll('.tog[data-set]'))
      b.setAttribute('aria-pressed', String(!!SETTINGS.get(b.dataset.set)));
    const n = Hints.seenCount;
    $('hintsReset').disabled = n === 0;
    $('hintsReset').textContent = n ? `본 도움말 ${n}개 — 처음부터 다시 보기` : '아직 본 도움말이 없다';
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
      const par = 90 + (G.goalsTotal || 1) * 45;
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
    $('resultTitle').textContent = won ? (G.survival ? '기록 종료' : '생존') : '사망';
    const nextBtn = s.querySelector('[data-act="next"]');
    if (won && !G.survival && G.levelIndex + 1 < LEVELS.length) {
      nextBtn.classList.remove('hidden');
      nextBtn.textContent = `다음 챕터 — ${LEVELS[G.levelIndex + 1].name}`;
    } else if (won && !G.survival) {
      nextBtn.classList.remove('hidden');
      nextBtn.textContent = '엔딩 보기';
    } else nextBtn.classList.add('hidden');

    $('resultSub').textContent = won
      ? (G.survival ? '도시는 여전히 그대로다.'
        : G.levelIndex + 1 >= LEVELS.length
          ? '다리를 건넜다. 뒤돌아보지 않았다.'
          : '숨을 고를 시간은 짧다.')
      : '불빛이 꺼졌다.';

    const r = this.rate(won);
    const best = won && !G.survival ? G.saveGrade(G.levelIndex, r.value) : false;
    const gradeEl = $('resultGrade');
    gradeEl.hidden = false;
    gradeEl.dataset.g = r.grade;
    gradeEl.querySelector('b').textContent = r.grade;
    gradeEl.querySelector('span').textContent = best ? `최고 기록 ${r.value}` : `평가 ${r.value}`;
    gradeEl.classList.toggle('best', best);

    const t = Math.floor(G.time);
    const rows = [
      ['생존 시간', `${String((t / 60) | 0).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`],
      ['처치', `${G.kills}기`],
      ['명중률', G.shots ? `${Math.round(r.acc * 100)}% (${G.hits}/${G.shots})` : '—'],
      ['받은 피해', `${Math.round(r.taken)}`],
      ['점수', `${G.score}`],
      ['난이도', DIFFICULTY[G.difficulty].name]
    ];
    if (G.survival) rows.push(['최고 기록', `${Math.floor(G.bestSurvival() / 60)}분 ${G.bestSurvival() % 60}초`]);
    $('resultStats').innerHTML = rows.map(r =>
      `<div><dt>${r[0]}</dt><dd>${r[1]}</dd></div>`).join('');

    $('hud').classList.add('hidden');
    $('touch').classList.add('hidden');
    this.show('scrResult');
  }
};

/* 버튼 배선 */
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  SFX.init(); SFX.resume(); SFX.click();
  const act = btn.dataset.act;
  switch (act) {
    case 'campaign': UI.brief(Math.min(G.progress(), LEVELS.length - 1)); break;
    case 'chapters': UI.buildChapters(); UI.show('scrChapters'); break;
    case 'survival': if (G.survivalOpen()) UI.show('scrCity'); break;
    case 'survcity': G.survivalCity = btn.dataset.city; G.start('survival'); break;
    // 조작법·설정은 일시정지에서도 열리므로 돌아갈 화면을 기억해 둔다
    case 'howto':
    case 'keys':
      UI.settingsFrom = G.state === 'pause' ? 'scrPause' : 'scrTitle';
      UI.show('scrHowto'); break;
    case 'settings':
      UI.settingsFrom = G.state === 'pause' ? 'scrPause' : 'scrTitle';
      UI.syncSettings(); UI.show('scrSettings'); break;
    case 'hintsreset':
      Hints.reset(); UI.syncSettings(); break;
    case 'setback':
      if (UI.settingsFrom === 'scrPause') UI.showPause();
      else UI.enterMenu();
      break;
    case 'back':     UI.enterMenu(); break;
    case 'start':    G.start(G.pendingLevel); break;
    case 'resume':   G.togglePause(); break;
    case 'restart':  G.start(G.survival ? 'survival' : G.levelIndex); break;
    case 'quit':     G.state = 'title'; SFX.ambience(false); UI.enterMenu(); break;
    case 'next':
      if (G.levelIndex + 1 < LEVELS.length) UI.brief(G.levelIndex + 1);
      else UI.showEnding();
      break;
  }
});

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
  drawVignette();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (G.state === 'play' && G.freezeT > 0) {
    G.freezeT -= dt;                                   // 처치 직후의 짧은 정지 — 그림만 그린다
    render();
  } else if (G.state === 'play') {
    G.update(dt);
    if (G.state === 'play' || G.state === 'result') render();
    hudT -= dt;
    if (hudT <= 0) { hudT = 0.07; G.refreshHud(); }
  } else if (G.state === 'pause' || G.state === 'result' || G.state === 'arms') {
    if (G.world) render();
  } else {
    drawAttract(dt);
  }
  requestAnimationFrame(frame);
}

UI.enterMenu();
requestAnimationFrame(frame);

/** 현재 어둠 농도 (0‒1) — 밝기 설정 확인용 */
G.darkLevel = () => darkLevel(G);
window.G = G;
window.UI = UI;
})();
