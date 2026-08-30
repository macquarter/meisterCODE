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
view.addEventListener('mousedown', e => { if (e.button === 0) { input.firing = true; SFX.resume(); } });
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

/* ═══════════ 게임 ═══════════ */
const G = {
  state: 'title',
  world: null, player: null, level: null, levelIndex: -1, survival: false,
  zombies: [], bullets: [], grenades: [], pickups: [], particles: [],
  decals: [], corpses: [], flashes: [],
  time: 0, shake: 0, kills: 0, score: 0, hurtSfxT: 0, beatT: 0,
  spawnT: 0, waveScale: 1,
  goalsLeft: 0, goalsTotal: 0, exitOpen: false, surviveLeft: 0,
  lightning: 0, lightningT: 8 + Math.random() * 12,
  rain: [], puddles: [],
  toastT: 0,

  /* ── 진행도 저장 ── */
  progress() { return +(localStorage.getItem('aftermath.progress') || 0); },
  saveProgress(i) {
    if (i > this.progress()) localStorage.setItem('aftermath.progress', i);
  },
  bestSurvival() { return +(localStorage.getItem('aftermath.best') || 0); },

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
    this.particles = []; this.decals = []; this.corpses = []; this.flashes = [];
    this.time = 0; this.shake = 0; this.kills = 0; this.score = 0;
    this.spawnT = 0; this.waveScale = 1; this.lightning = 0;
    this.lightningT = 6 + Math.random() * 10;

    // 목표 설정
    const ob = L.objective;
    this.exitOpen = (ob.type === 'escape');
    this.goalsTotal = this.goalsLeft = ob.count || 0;
    this.surviveLeft = ob.time || 0;

    // 보급품 배치
    const rng = makeRng(L.seed ^ 0x5bf03635);
    const place = (type, n, minD) => {
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
    for (let i = 0; i < L.spawn.initial; i++) this.spawnZombie(560, 1600);

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

    SFX.rain(true);
    this.state = 'play';
    UI.enterPlay();
    this.refreshHud(true);
  },

  /* ── 좀비 소환 ── */
  pickType() {
    const mix = this.level.mix;
    let r = Math.random(), acc = 0;
    for (const k of ['runner', 'brute', 'walker']) {
      acc += mix[k] || 0;
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

  onKill(z) {
    this.kills++;
    this.score += z.t.score;
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
    if (this.state === 'play') { this.state = 'pause'; UI.show('scrPause'); }
    else if (this.state === 'pause') { this.state = 'play'; UI.hideScreens(); }
  },

  finish(won) {
    this.state = 'result';
    SFX.rain(false);
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

    p.sprinting = !!(keys.ShiftLeft || keys.ShiftRight) && ml > 0.1;
    const speed = (p.dead ? 0 : 158) * (p.sprinting ? 1.42 : 1);
    if (!p.dead && (mx || my)) {
      w.slide(p, mx * speed * dt, my * speed * dt);
      p.walkPhase += dt * (p.sprinting ? 13 : 8) * Math.min(1, ml * 1.6);
    }

    /* 조준 */
    const cam = this.camera();
    if (input.aimTouch !== null) p.angle = input.aimTouch;
    else if (input.hasMouse) p.angle = Math.atan2(input.my - (p.y - cam.y), input.mx - (p.x - cam.x));

    p.update(dt, this);

    /* 사격: 수동 + 불빛 안 자동사격 */
    if (!p.dead) {
      let wantFire = input.firing || keys.Space;
      if (!wantFire) wantFire = !!this.autoTarget();
      if (wantFire) {
        if (p.cool <= 0) p.fire(this);
      }
    }

    /* 엔티티 */
    for (const z of this.zombies) if (!z.dead) z.update(dt, this);
    this.separate(dt);
    for (const b of this.bullets) b.update(dt, this);
    for (const gr of this.grenades) gr.update(dt, this);
    for (const pk of this.pickups) pk.update(dt, this);

    this.zombies = this.zombies.filter(z => !z.dead);
    this.bullets = this.bullets.filter(b => !b.dead);
    this.grenades = this.grenades.filter(g => !g.dead);
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
    const rate = sp.rate * this.waveScale;
    const maxZ = Math.min(sp.max + (this.survival ? Math.floor(this.time / 20) : 0), 60);
    if (this.spawnT <= 0 && this.zombies.length < maxZ) {
      this.spawnT = 1 / Math.max(0.05, rate);
      this.spawnZombie(620, 1500);
    }
    if (this.survival && this.time > 30) {
      const t = this.time;
      this.level.mix = { walker: Math.max(0.2, 0.7 - t / 400), runner: Math.min(0.5, 0.3 + t / 500),
                         brute: Math.min(0.3, Math.max(0, (t - 60) / 500)) };
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
      this.lightning = 1; SFX.thunder();
    }

    if (p.dead && this.state === 'play') this.finish(false);
  },

  /** 불빛 안의 가장 가까운 적 — 원작처럼 비추면 자동 사격 */
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
    let x = p.x + Math.cos(p.angle) * lead - W / 2;
    let y = p.y + Math.sin(p.angle) * lead - H / 2;
    // 지도 밖 허공이 보이지 않게 가둔다
    const mx = w.w * TILE - W, my = w.h * TILE - H;
    x = mx > 0 ? clamp(x, 0, mx) : mx / 2;
    y = my > 0 ? clamp(y, 0, my) : my / 2;
    if (this.shake > 0.1) {
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

  /* 시체 */
  for (const c of g.corpses) drawCorpse(c);

  for (const pk of g.pickups) drawPickup(pk, g.time);
  for (const gr of g.grenades) drawGrenade(gr);
  for (const z of g.zombies) drawZombie(z);
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
  // 총 + 손전등
  ctx.fillStyle = '#1a1f25';
  ctx.fillRect(6, -3, 17, 6);
  ctx.fillStyle = '#f4e2a8';
  ctx.fillRect(21, -2, 4, 4);
  ctx.restore();
}

function drawZombie(z) {
  const sway = Math.sin(z.phase) * (z.aggro ? 3.2 : 1.6);
  ctx.save();
  ctx.translate(z.x, z.y);
  ctx.rotate(z.face);
  ctx.fillStyle = 'rgba(0,0,0,.42)';
  ctx.beginPath(); ctx.ellipse(0, 3, z.t.size + 3, z.t.size, 0, 0, 6.283); ctx.fill();
  ctx.fillStyle = z.t.body;
  ctx.beginPath(); ctx.arc(0, 0, z.t.size, 0, 6.283); ctx.fill();
  // 팔 — 앞으로 뻗은
  ctx.fillStyle = z.t.head;
  ctx.fillRect(2, -z.t.size + 1 + sway * 0.4, z.t.size + 4, 4);
  ctx.fillRect(2, z.t.size - 5 - sway * 0.4, z.t.size + 4, 4);
  // 머리
  ctx.beginPath(); ctx.arc(z.t.size * 0.42, sway * 0.3, z.t.size * 0.52, 0, 6.283); ctx.fill();
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
  else obj = '탈출로를 찾아라';
  $('hudObjective').textContent = obj;

  $('hudKills').textContent = this.kills;
  const t = Math.floor(this.time);
  $('hudClock').textContent = `${String((t / 60) | 0).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;

  $('gaugeHealth').style.width = (p.hp / p.hpMax * 100) + '%';
  $('gaugeBattery').style.width = p.battery + '%';
  document.querySelector('.gauge--health').classList.toggle('low', p.hp < 30);

  const wp = p.weapon, rounds = p.ammoOf(wp);
  $('hudAmmo').textContent = rounds === Infinity ? '∞' : rounds;
  $('hudWeapon').textContent = wp.name;
  document.querySelector('.ammo__gun').classList.toggle('dry', rounds !== Infinity && rounds <= 5);
  $('hudNades').textContent = p.nades;

  const slots = $('hudSlots');
  const sig = SLOT_ORDER.filter(k => p.owned.has(k)).join(',') + '|' + wp.key;
  if (slots.dataset.sig !== sig) {
    slots.dataset.sig = sig;
    slots.innerHTML = SLOT_ORDER.filter(k => p.owned.has(k)).map(k =>
      `<span class="${k === wp.key ? 'on' : ''}">${WEAPONS[k].slot} ${WEAPONS[k].name}</span>`).join('');
  }

  $('damageFlash').style.opacity =
    Math.min(0.62, p.hurtFlash * 0.55 + (p.hp < 28 ? 0.18 + Math.sin(this.time * 5) * 0.05 : 0));

  // 목표 방향 나침반
  const compass = $('hudCompass');
  let tx = null, ty = null;
  if (ob.type === 'endless') { compass.style.display = 'none'; }
  else {
    compass.style.display = '';
    if (this.exitOpen) { tx = this.world.exit.x; ty = this.world.exit.y; }
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
  screens: ['scrTitle', 'scrChapters', 'scrHowto', 'scrBrief', 'scrPause', 'scrResult'],
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
    list.innerHTML = '';
    LEVELS.forEach((L, i) => {
      const locked = i > unlocked;
      const el = document.createElement('div');
      el.className = 'chapter' + (locked ? ' chapter--locked' : '');
      el.innerHTML =
        `<span class="chapter__no">${String(i + 1).padStart(2, '0')}</span>` +
        `<span class="chapter__name">${L.name}<br><span class="chapter__goal">${L.goals[0]}</span></span>` +
        `<span class="chapter__mark">${locked ? '잠김' : i < unlocked ? '클리어' : '▶'}</span>`;
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
      nextBtn.textContent = '엔딩 — 타이틀로';
    } else nextBtn.classList.add('hidden');

    $('resultSub').textContent = won
      ? (G.survival ? '도시는 여전히 그대로다.'
        : G.levelIndex + 1 >= LEVELS.length
          ? '다리를 건넜다. 뒤돌아보지 않았다.'
          : '숨을 고를 시간은 짧다.')
      : '불빛이 꺼졌다.';

    const t = Math.floor(G.time);
    const rows = [
      ['생존 시간', `${String((t / 60) | 0).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`],
      ['처치', `${G.kills}기`],
      ['점수', `${G.score}`],
      ['잔여 체력', `${Math.round(G.player.hp)}`]
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
    case 'howto':    UI.show('scrHowto'); break;
    case 'back':     UI.enterMenu(); break;
    case 'start':    G.start(G.pendingLevel); break;
    case 'resume':   G.togglePause(); break;
    case 'restart':  G.start(G.survival ? 'survival' : G.levelIndex); break;
    case 'quit':     G.state = 'title'; SFX.rain(false); UI.enterMenu(); break;
    case 'next':
      if (G.levelIndex + 1 < LEVELS.length) UI.brief(G.levelIndex + 1);
      else { G.state = 'title'; UI.enterMenu(); }
      break;
  }
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
})();
