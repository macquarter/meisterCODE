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
const input = { mx: W / 2, my: H / 2, firing: false, moveX: 0, moveY: 0, aimTouch: null, hasMouse: !isTouch };

addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
  if (e.code === 'Escape') G.togglePause();
  if (e.code === 'KeyG' && G.state === 'play') G.player.throwNade(G);
  if (G.state === 'play') {
    if (e.code === 'Digit1') G.player.select('pistol', G);
    if (e.code === 'Digit2') G.player.select('smg', G);
    if (e.code === 'Digit3') G.player.select('shotgun', G);
    if (e.code === 'KeyQ')   G.player.cycle(G);
    if (e.code === 'KeyR')   G.player.reload(G);
    if (e.code === 'KeyE')   G.player.melee(G);
  }
  if (e.code === 'KeyF' && G.state === 'play') {
    G.player.lightOn = !G.player.lightOn;
    SFX.click();
    G.toast(G.player.lightOn ? '손전등 ON' : '손전등 OFF — 배터리 절약');
  }
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

/* 터치: 좌 = 이동 스틱, 우 = 조준 스틱 */
function bindPad(el, onVec) {
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
bindPad($('padTurn'), (x, y, m) => { input.aimTouch = m > 0.35 ? Math.atan2(y, x) : null; });
$('btnFire').addEventListener('touchstart', e => { e.preventDefault(); input.firing = true; SFX.resume(); }, { passive: false });
$('btnFire').addEventListener('touchend', () => { input.firing = false; });
$('btnNade').addEventListener('touchstart', e => {
  e.preventDefault(); if (G.state === 'play') G.player.throwNade(G);
}, { passive: false });
$('btnSwap').addEventListener('touchstart', e => {
  e.preventDefault(); if (G.state === 'play') G.player.cycle(G);
}, { passive: false });
$('btnMelee').addEventListener('touchstart', e => {
  e.preventDefault(); if (G.state === 'play') G.player.melee(G);
}, { passive: false });
$('btnReload').addEventListener('touchstart', e => {
  e.preventDefault(); if (G.state === 'play') G.player.reload(G);
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
    move:     () => isTouch ? ['왼쪽 스틱', '이동 · 오른쪽 스틱으로 손전등을 돌린다']
                            : ['WASD', '이동 · 마우스로 손전등을 비춘다'],
    autofire: () => SETTINGS.autofire
      ? [isTouch ? '사격' : '클릭', '불빛 안에 들어온 적은 자동으로 쏜다. 직접 쏠 수도 있다']
      : [isTouch ? '사격' : '클릭', '사격 — 손전등이 비추는 쪽으로만 나간다'],
    reload:   () => [isTouch ? '장전' : 'R', '재장전 — 탄창이 비면 자동으로도 갈아 끼운다'],
    melee:    () => [isTouch ? '밀치기' : 'E · 우클릭', '달라붙은 적을 밀쳐낸다'],
    sprint:   () => ['Shift', '질주 — 빠르지만 발소리가 커서 멀리서도 깨운다'],
    pickup:   () => ['', '빛나는 물건은 밟으면 줍는다'],
    battery:  () => isTouch ? ['', '배터리가 떨어져 간다 — 노란 상자로 채운다']
                            : ['F', '손전등을 꺼서 배터리를 아낀다 · 노란 상자로 채운다'],
    nade:     () => [isTouch ? '수류탄' : 'G', '무리가 몰렸다 — 수류탄'],
    runner:   () => ['달리는 것', '약하지만 빠르다. 멀리 있을 때 끊어 쏘자'],
    brute:    () => ['거대한 것', '잘 밀리지 않는다. 수류탄을 아끼지 말 것'],
    crawler:  () => ['기어다니는 것', '웅크렸다 튄다. 일정하게 다가오지 않는다'],
    spitter:  () => ['뱉는 것', '거리를 두고 산을 뱉는다. 초록 웅덩이는 밟지 말 것'],
    behemoth: () => ['그것', '붉은 선이 뜨면 옆으로 비켜라. 벽에 박으면 비틀거린다']
  };
  // 지금 당장 알아야 하는 것은 줄 앞으로 끼워 넣는다
  const URGENT = new Set(['melee', 'reload', 'nade', 'runner', 'brute', 'crawler', 'spitter', 'behemoth']);

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
    t = id in { runner: 1, brute: 1, crawler: 1, spitter: 1, behemoth: 1 } ? 4.6 : 3.8;
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
      if (!isTouch && g.time > 24) push('sprint');
      const w = p.weapon;
      if (!p.reloading && p.magOf(w) <= Math.ceil(w.mag * 0.34)) push('reload');
      if (p.battery < 30 && p.lightOn) push('battery');

      let close = 0, adjacent = false;
      for (const z of g.zombies) {
        if (z.dead) continue;
        const d = Math.hypot(z.x - p.x, z.y - p.y);
        if (d < z.r + p.r + 26) adjacent = true;
        if (z.aggro && d < 320) close++;
        if (z.lit > 0.5 && z.type !== 'walker') push(z.type);
      }
      if (g.boss && !g.boss.dead && g.boss.aggro &&
          Math.hypot(g.boss.x - p.x, g.boss.y - p.y) < 700) push('behemoth');
      if (adjacent) push('melee');
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
    const L = this.survival
      ? Object.assign({}, SURVIVAL, { seed: (Math.random() * 1e9) | 0 })
      : LEVELS[index];
    this.level = L;
    this.world = new World(L.seed, L.blocks);

    const w = this.world;
    this.player = new Player(w.spawn.x, w.spawn.y, L);
    this.zombies = []; this.bullets = []; this.grenades = []; this.pickups = [];
    this.spits = []; this.acids = [];
    this.particles = []; this.decals = []; this.corpses = []; this.flashes = [];
    this.time = 0; this.shake = 0; this.kills = 0; this.score = 0;
    this.shots = 0; this.hits = 0; this.hitMark = 0;
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
    for (const k in mix) if (ZTYPES[k]) total += Math.max(0, mix[k]);
    if (total <= 0) return 'walker';
    let r = Math.random() * total, acc = 0;
    for (const k in mix) {
      if (!ZTYPES[k]) continue;
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
    if (da < 0.5 && d < this.player.lightRange + 90) return;
    this.zombies.push(new Zombie(p.x, p.y, this.pickType()));
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

    p.resolveSprint(!!(keys.ShiftLeft || keys.ShiftRight), ml > 0.1, dt);
    const speed = (p.dead ? 0 : 158) * (p.sprinting ? 1.42 : p.reloading ? 0.78 : 1);
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
    if (input.aimTouch !== null) p.angle = input.aimTouch;
    else if (input.hasMouse) p.angle = Math.atan2(input.my - (p.y - cam.y), input.mx - (p.x - cam.x));

    p.update(dt, this);

    /* 사격: 수동 + 불빛 안 자동사격 */
    if (!p.dead) {
      let wantFire = input.firing || keys.Space;
      if (!wantFire && SETTINGS.autofire) wantFire = !!this.autoTarget();
      if (wantFire) {
        if (p.cool <= 0) p.fire(this);
      }
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
        if (da < 0.46 && w.los(p.x, p.y, z.x, z.y)) z.lit = 1;
      }
    }

    /* 소환 */
    this.spawnT -= dt;
    const sp = this.level.spawn;
    if (this.survival) this.waveScale = 1 + this.time / 55;
    const rate = sp.rate * this.waveScale * SETTINGS.mod.spawn;
    const maxZ = Math.min(
      Math.round((sp.max + (this.survival ? Math.floor(this.time / 20) : 0)) * SETTINGS.mod.max), 60);
    if (this.spawnT <= 0 && this.zombies.length < maxZ) {
      this.spawnT = 1 / Math.max(0.05, rate);
      this.spawnZombie(620, 1500);
    }
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
        spitter: Math.min(0.20, Math.max(0, (t - 90) / 600))
      };
      if (this.pickups.length < 6 && Math.random() < dt * 0.35) {
        const types = ['ammo', 'ammo', 'shells', 'medkit', 'battery', 'nade'];
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
      const d = Math.hypot(z.x - p.x, z.y - p.y);
      if (d > range || d > bd) continue;
      const a = Math.atan2(z.y - p.y, z.x - p.x);
      let da = Math.abs(((a - p.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (da > 0.30) continue;
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
    const fy = isTouch ? H * 0.40 : H / 2;
    let x = p.x + Math.cos(p.angle) * lead - W / 2;
    let y = p.y + Math.sin(p.angle) * lead - fy;
    // 지도 밖 허공이 보이지 않게 가둔다. 단, 위아래 UI 띠가 어차피 가리는 만큼은 넘어가도 된다
    // — 그래야 지도 끝에서도 플레이어가 탄약·게이지 밑에 깔리지 않는다.
    const over0 = isTouch ? H * 0.10 : 70, over1 = isTouch ? H * 0.40 : 130;
    const mx = w.w * TILE - W, my = w.h * TILE - H;
    x = mx > 0 ? clamp(x, 0, mx) : mx / 2;
    y = my > 0 ? clamp(y, -over0, my + over1) : my / 2;
    if (this.shake > 0.1 && SETTINGS.shake) {
      x += (Math.random() - 0.5) * this.shake;
      y += (Math.random() - 0.5) * this.shake;
    }
    return { x, y };
  }
};

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
  ctx.restore();

  drawDarkness(cam, g, p, w);
  drawGlow(cam, g, p, w);
  drawRain(g);
  drawVignette();
  drawCrosshair(g, p);
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

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * w.w + x, d = w.deco[i];
      const n = ((x * 73856093) ^ (y * 19349663)) & 15;
      const px = x * TILE, py = y * TILE;
      if (d === D_BUILDING) {
        ctx.fillStyle = n < 5 ? '#12161d' : n < 11 ? '#0f131a' : '#161b23';
        ctx.fillRect(px, py, TILE, TILE);
        // 도로에 면한 벽면 — 빛을 받아 건물 윤곽이 드러난다
        if (w.at(x, y + 1) === T_ROAD) {
          ctx.fillStyle = 'rgba(168,188,212,.16)';
          ctx.fillRect(px, py + TILE - 7, TILE, 7);
        }
        if (w.at(x, y - 1) === T_ROAD) {
          ctx.fillStyle = 'rgba(0,0,0,.5)';
          ctx.fillRect(px, py, TILE, 4);
        }
        if (w.at(x - 1, y) === T_ROAD) {
          ctx.fillStyle = 'rgba(140,160,185,.09)';
          ctx.fillRect(px, py, 4, TILE);
        }
        if (w.at(x + 1, y) === T_ROAD) {
          ctx.fillStyle = 'rgba(140,160,185,.09)';
          ctx.fillRect(px + TILE - 4, py, 4, TILE);
        }
      } else if (d === D_PROP) {
        // 구조물이 놓인 자리의 아스팔트 (구조물 자체는 뒤에서 그린다)
        ctx.fillStyle = n < 6 ? '#272d36' : '#232932';
        ctx.fillRect(px, py, TILE, TILE);
      } else if (d === D_SIDEWALK) {
        ctx.fillStyle = n < 8 ? '#343b45' : '#2f363f';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.strokeStyle = 'rgba(255,255,255,.05)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + .5, py + .5, TILE - 1, TILE - 1);
      } else {
        ctx.fillStyle = n < 6 ? '#272d36' : n < 12 ? '#232932' : '#2b323c';
        ctx.fillRect(px, py, TILE, TILE);
        // 중앙 차선
        if (x % 11 === 6 && (y & 1) === 0) {
          ctx.fillStyle = 'rgba(210,200,160,.12)';
          ctx.fillRect(px + TILE / 2 - 2, py + 10, 4, TILE - 20);
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
}

/** 버려진 차량과 화물 컨테이너 — 손전등에 색이 살아난다 */
function drawProps(cam, w) {
  for (const pr of w.props) {
    if (pr.x < cam.x - 90 || pr.x > cam.x + W + 90 ||
        pr.y < cam.y - 90 || pr.y > cam.y + H + 90) continue;
    ctx.save();
    ctx.translate(pr.x, pr.y); ctx.rotate(pr.a);
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(-pr.w / 2 - 2, -pr.h / 2 + 3, pr.w + 4, pr.h);
    ctx.fillStyle = pr.col;
    ctx.fillRect(-pr.w / 2, -pr.h / 2, pr.w, pr.h);
    if (pr.kind === 'car') {
      ctx.fillStyle = 'rgba(10,14,18,.85)';                 // 유리
      ctx.fillRect(-pr.w * 0.16, -pr.h / 2 + 3, pr.w * 0.34, pr.h - 6);
      ctx.fillStyle = 'rgba(255,255,255,.10)';              // 지붕 하이라이트
      ctx.fillRect(-pr.w / 2, -pr.h / 2, pr.w, 3);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,.26)';                    // 컨테이너 골판
      for (let i = -pr.w / 2 + 6; i < pr.w / 2 - 2; i += 8) ctx.fillRect(i, -pr.h / 2 + 2, 3, pr.h - 4);
      ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1;
      ctx.strokeRect(-pr.w / 2 + .5, -pr.h / 2 + .5, pr.w - 1, pr.h - 1);
    }
    ctx.restore();
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
  ctx.save();
  ctx.translate(z.x, z.y);
  ctx.rotate(z.face);
  ctx.fillStyle = 'rgba(0,0,0,.42)';
  ctx.beginPath(); ctx.ellipse(0, 3, S + 3, S, 0, 0, 6.283); ctx.fill();

  if (z.t.boss) {
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
    ctx.globalAlpha = clamp(1 - z.hp / z.hpMax, 0, 1) * 0.5;
    ctx.fillStyle = '#6b1310';
    ctx.beginPath(); ctx.arc(0, 0, z.t.size * 0.8, 0, 6.283); ctx.fill();
    ctx.globalAlpha = 1;
  }
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

/* 어둠 마스크: 검은 막에 손전등 모양의 구멍을 뚫는다 */
function drawDarkness(cam, g, p, w) {
  const dark = clamp(0.965 - g.lightning * 0.62, 0.18, 0.99);
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

  // 손전등 원뿔 (벽에 가려짐) — 폭이 다른 세 겹을 겹쳐 가장자리를 흐린다
  const range = p.lightRange;
  if (range > 0) {
    const layers = [[0.46, 80, 0.50], [0.33, 56, 0.55], [0.19, 40, 0.62]];
    for (const [half, rays, alpha] of layers) {
      const poly = w.conePoly(p.x, p.y, p.angle, half, range, rays);
      mctx.beginPath();
      mctx.moveTo(poly[0], poly[1]);
      for (let i = 2; i < poly.length; i += 2) mctx.lineTo(poly[i], poly[i + 1]);
      mctx.closePath();
      gr = mctx.createRadialGradient(p.x, p.y, 10, p.x, p.y, range);
      gr.addColorStop(0, `rgba(0,0,0,${alpha})`);
      gr.addColorStop(0.66, `rgba(0,0,0,${alpha * 0.88})`);
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
    const poly = w.conePoly(p.x, p.y, p.angle, 0.44, range, 64);
    ctx.beginPath();
    ctx.moveTo(poly[0], poly[1]);
    for (let i = 2; i < poly.length; i += 2) ctx.lineTo(poly[i], poly[i + 1]);
    ctx.closePath();
    const gr = ctx.createRadialGradient(p.x, p.y, 8, p.x, p.y, range);
    gr.addColorStop(0, 'rgba(255,228,168,.20)');
    gr.addColorStop(0.5, 'rgba(226,210,170,.085)');
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

  // 어둠 속의 눈 — 접근을 알아챌 수 있는 유일한 단서
  for (const z of g.zombies) {
    if (!z.aggro) continue;
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
    ctx.fillStyle = `rgba(190,205,230,${g.lightning * 0.16})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawVignette() {
  const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32,
                                      W / 2, H / 2, Math.max(W, H) * 0.78);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(1, 'rgba(0,0,0,.72)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, W, H);
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
  screens: ['scrTitle', 'scrChapters', 'scrHowto', 'scrBrief', 'scrPause', 'scrResult',
            'scrSettings', 'scrEnding'],
  settingsFrom: 'scrTitle',
  hideScreens() { this.screens.forEach(s => $(s).classList.add('hidden')); },
  show(id) { this.hideScreens(); $(id).classList.remove('hidden'); },
  enterPlay() {
    this.hideScreens();
    $('hud').classList.remove('hidden');
    $('touch').classList.toggle('hidden', !isTouch);
  },
  enterMenu() {
    $('hud').classList.add('hidden');
    $('touch').classList.add('hidden');
    const b = G.bestSurvival();
    $('bestSurvival').textContent = b ? `${Math.floor(b / 60)}분 ${b % 60}초` : '—';
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
    for (const b of $('setDiff').querySelectorAll('button'))
      b.classList.toggle('on', b.dataset.val === SETTINGS.difficulty);
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
    case 'survival': G.start('survival'); break;
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

  if (G.state === 'play') {
    G.update(dt);
    if (G.state === 'play' || G.state === 'result') render();
    hudT -= dt;
    if (hudT <= 0) { hudT = 0.07; G.refreshHud(); }
  } else if (G.state === 'pause' || G.state === 'result') {
    if (G.world) render();
  } else {
    drawAttract(dt);
  }
  requestAnimationFrame(frame);
}

UI.enterMenu();
requestAnimationFrame(frame);

window.G = G;
window.UI = UI;
})();
