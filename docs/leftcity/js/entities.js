/* ═══════════════════════════════════════════
   LEFT CITY — 남겨진 도시 : 엔티티
   ═══════════════════════════════════════════ */

const WEAPONS = {
  pistol:  { key: 'pistol',  name: '권총', slot: 1, rate: 0.40, dmg: 21, spread: 0.028,
             range: 540, speed: 1300, pellets: 1, ammoKey: null,   kick: 1.8, sfx: 'pistol', knock: 7,
             mag: 12, reload: 1.05, loud: 0.8 },
  smg:     { key: 'smg',     name: 'SMG',  slot: 2, rate: 0.085, dmg: 17, spread: 0.075,
             range: 620, speed: 1500, pellets: 1, ammoKey: 'smg',  kick: 2.2, sfx: 'shot', knock: 5,
             mag: 30, reload: 1.75, loud: 0.9 },
  shotgun: { key: 'shotgun', name: '샷건', slot: 3, rate: 0.74, dmg: 15, spread: 0.20,
             range: 430, speed: 1200, pellets: 8, ammoKey: 'shell', kick: 8, sfx: 'shotgun', knock: 11,
             mag: 6,  reload: 2.15, loud: 1.25 },
  // 소총 — 원작의 네 번째 무기. 느리지만 한 발이 줄 선 감염체 여럿을 꿰뚫는다
  rifle:   { key: 'rifle',   name: '소총', slot: 4, rate: 0.82, dmg: 92, spread: 0.004,
             range: 900, speed: 2300, pellets: 1, ammoKey: 'rifle', kick: 5.5, sfx: 'rifle', knock: 22,
             mag: 5,  reload: 2.35, pierce: 3, loud: 1.15 },
  // ── 늘어난 무기 칸 — 감염체가 떨어뜨리거나 보급 상자에서 나온다. 탄은 기존 탄을 나눠 쓴다(석궁만 화살) ──
  magnum:  { key: 'magnum',  name: '매그넘', slot: 5, rate: 0.55, dmg: 74, spread: 0.012,
             range: 720, speed: 1900, pellets: 1, ammoKey: 'rifle', kick: 4.6, sfx: 'magnum', knock: 16,
             mag: 6,  reload: 1.9, pierce: 1, pick: 12, ap: true, loud: 1.35 },   // ap — 진압 방패를 뚫는다
  auto:    { key: 'auto',    name: '자동 샷건', slot: 6, rate: 0.27, dmg: 13, spread: 0.22,
             range: 400, speed: 1200, pellets: 7, ammoKey: 'shell', kick: 6.5, sfx: 'shotgun', knock: 9,
             mag: 10, reload: 2.8, pick: 16, loud: 1.25 },
  lmg:     { key: 'lmg',     name: '경기관총', slot: 7, rate: 0.07, dmg: 19, spread: 0.09,
             range: 680, speed: 1600, pellets: 1, ammoKey: 'smg', kick: 2.6, sfx: 'shot', knock: 6,
             mag: 75, reload: 3.6, pierce: 1, heavy: 0.86, pick: 110, ap: true, loud: 1.05 },
  // 석궁 — 소리가 거의 없어 무리를 깨우지 않는다. 한 발에 여럿을 꿰뚫는다
  crossbow:{ key: 'crossbow', name: '석궁', slot: 8, rate: 0.9, dmg: 130, spread: 0.003,
             range: 820, speed: 1350, pellets: 1, ammoKey: 'bolt', kick: 1.4, sfx: 'bow', knock: 14,
             mag: 1, reload: 0.95, pierce: 4, silent: true, pick: 8, ap: true },
  // ── 특전 무기 — 화성 서바이벌에서만, 3 · 5 · 10 · 20분에 하나씩 열린다. 예비탄이 끝없다(탄창 · 재장전은 있다) ──
  flamer:  { key: 'flamer',  name: '화염방사기', slot: 9, rate: 0.045, dmg: 7, spread: 0.2,
             range: 240, speed: 560, pellets: 2, ammoKey: null, kick: 0.5, sfx: 'flame', knock: 2,
             mag: 140, reload: 2.4, burn: 2.6, flame: true, special: true },
  launcher:{ key: 'launcher', name: '유탄 발사기', slot: 10, rate: 0.72, dmg: 0, spread: 0.02,
             range: 600, speed: 620, pellets: 1, ammoKey: null, kick: 5, sfx: 'launch', knock: 0,
             mag: 6, reload: 2.6, launcher: true, special: true },
  rail:    { key: 'rail',    name: '레일건', slot: 11, rate: 1.1, dmg: 420, spread: 0,
             range: 1500, speed: 5200, pellets: 1, ammoKey: null, kick: 9, sfx: 'rail', knock: 30,
             mag: 4, reload: 2.2, pierce: 99, rail: true, special: true },
  minigun: { key: 'minigun', name: '미니건', slot: 12, rate: 0.03, dmg: 16, spread: 0.11,
             range: 700, speed: 1700, pellets: 1, ammoKey: null, kick: 1.6, sfx: 'shot', knock: 5,
             mag: 300, reload: 4.4, spin: true, heavy: 0.74, special: true }
};
const SLOT_ORDER = ['pistol', 'smg', 'shotgun', 'rifle', 'magnum', 'auto', 'lmg', 'crossbow', 'flamer', 'launcher', 'rail', 'minigun'];
/** 특전 무기 — 화성에서 열리는 차례와 시각(초) */
const SPECIAL_UNLOCKS = [['flamer', 180], ['launcher', 300], ['rail', 600], ['minigun', 1200]];
/** 생존자 특성 · 도감 금메달 · 오늘의 도시 변수 — game.js 의 Rank.apply 가 판마다 채운다(도전은 늘 기본값) */
const PK = { hp: 1, reload: 1, drain: 1, charge: 1, shove: 0, shoveCd: 1, stam: 1, ammo: 1, nade: 0, med: 1, spread: 1, gold: {},
  noise: 1, step: 1, mag: 1, armor: 1, lamp: 1, speed: 1, dmg: 1, stamUse: 1, fx: 1 };   // 아래 줄은 장비(rc.31) · fx 는 레벨에 따라 커지는 효과
/** 탄창 크기 — 확장 탄창 장비가 늘린다(특전 무기 · 한 발짜리 석궁은 그대로) */
function magCap(w) { return w.special || w.mag <= 1 ? w.mag : Math.round(w.mag * PK.mag); }

const ZTYPES = {
  walker: { hp: 62,  speed: 47,  dmg: 17, r: 13, size: 12, hear: 330, score: 10,
            body: '#4b5548', head: '#6d7466' },
  runner: { hp: 38,  speed: 112, dmg: 12, r: 11, size: 10, hear: 480, score: 18,
            body: '#5a4740', head: '#7d6455' },
  brute:  { hp: 300, speed: 41,  dmg: 30, r: 20, size: 19, hear: 300, score: 60,
            body: '#3f4a52', head: '#5b6a72' },
  // 기어다니는 것 — 바닥에 붙어 웅크렸다 튀어나온다. 약하지만 작고 빠르다
  crawler: { hp: 30, speed: 124, dmg: 11, r: 9,  size: 8,  hear: 300, score: 16,
             body: '#55483c', head: '#766251', crawl: true },
  // 뱉는 것 — 거리를 두고 산을 뱉는다. 물러서는 것만으로는 안전하지 않다
  spitter: { hp: 74, speed: 46, dmg: 9, r: 14, size: 13, hear: 540, score: 38,
             body: '#44513f', head: '#6d7f52',
             spit: { range: 310, hold: 215, cool: 3.1, speed: 250, dmg: 12, pool: 4.0 } },
  // 우는 것 — 길가에 웅크려 운다. 불빛을 오래 비추거나, 가까이 가거나, 뛰거나, 곁에서 쏘면 깨어나
  // 끝까지 쫓아온다 (L4D 의 마녀). 무리처럼 생기지 않고 판마다 정해진 자리에 놓인다
  weeper: { hp: 280, speed: 250, dmg: 46, r: 12, size: 11, hear: 0, score: 120,
            body: '#b9b4ab', head: '#d8d3c9', weeper: true, special: true },
  // 부푼 것 — 느리게 다가와 붙으면 터진다. 가까이서 터지면 담즙을 뒤집어쓰고 무리가 몰려온다 (L4D 의 부머)
  bloater: { hp: 44, speed: 44, dmg: 0, r: 17, size: 17, hear: 300, score: 30,
             body: '#5f6b46', head: '#7d8a5a', bloat: true },
  // 비명 지르는 것 (원작의 Screamer) — 플레이어를 보면 멈춰 서서 숨을 들이켜고(1.6초) 비명으로 무리를 부른다.
  // 그 전에 쓰러뜨리면 막을 수 있다. 맞을 때마다 들이켜기가 조금씩 늦춰진다 — 먼저 쏘라는 표적
  screamer: { hp: 66, speed: 62, dmg: 10, r: 12, size: 12, hear: 560, score: 45,   // 비명은 한 마리당 한 번
              body: '#5d4b48', head: '#9a7c70', scream: { wind: 1.6, cool: 15, range: 560, delay: 0.25 } },
  // ── L4D2 에서 빌린 특수 감염체 — 혼자 하는 게임이라 붙잡아 묶어 두는 것은 없다. 치고 빠지거나 끌어당길 뿐 ──
  // 덮치는 것 (헌터) — 웅크려 숨을 고르고(0.7초) 몸을 날린다. 맞으면 넘어지듯 밀리지만 붙잡지는 않는다.
  // 날아오는 도중에 맞히면 떨어져 뒹군다 — 받아치는 맛
  leaper: { hp: 78, speed: 64, dmg: 8, r: 11, size: 11, hear: 520, score: 40,
            body: '#3c4148', head: '#8a7466',
            leap: { min: 80, range: 330, crouch: 0.7, lock: 0.22, speed: 560, dur: 0.6, dmg: 20, knock: 64, cool: 2.8 } },
  // 들이받는 것 (차저) — 한쪽 팔이 비대하다. 잠깐 땅을 긁고 직선으로 돌진한다. 들이받히면 크게 밀려나 잠시 휘청이지만
  // 붙들려 가지는 않는다. 벽에 박으면 한참 비틀거린다 — 비켜서서 벽으로 유도하라
  charger: { hp: 420, speed: 46, dmg: 20, r: 17, size: 16, hear: 380, score: 90,
             body: '#4a4038', head: '#7a6252',
             charge: { wind: 0.85, dash: 1.0, cool: 5.2, mul: 4.6, min: 150, max: 520, dmg: 22, knock: 96, slow: 0.8, stun: 1.5 } },
  // 휘감는 것 (스모커) — 멀리서 기침하다(0.6초) 혀를 쏜다. 혀는 곧게 날아가니 옆으로 비키면 빗나간다.
  // 감기면 0.5초 동안 끌려가고 한동안 발이 무겁다. 그것을 맞히면 혀가 끊긴다. 죽으면 매캐한 연기를 남긴다
  puller: { hp: 120, speed: 44, dmg: 8, r: 12, size: 13, hear: 600, score: 50,
            body: '#4d4a40', head: '#8a8070',
            tongue: { range: 400, hold: 270, wind: 0.6, speed: 980, drag: 160, pull: 0.5, slow: 1.3, dmg: 6, cool: 6.5 } },
  // 진압 경찰 (언커먼) — 방패와 방탄복. 앞에서 쏜 총알은 거의 막는다. 옆 · 뒤를 노리거나, 밀쳐서 돌려세우거나, 터뜨려라
  riot: { hp: 130, speed: 46, dmg: 16, r: 14, size: 13, hear: 330, score: 35,
          body: '#23262a', head: '#6d7466', armor: { arc: 1.25, mul: 0.08 } },
  // 그것 — 마지막 다리를 막아선 개체. 한 마리뿐이고, 죽어야 길이 열린다
  behemoth: { hp: 1150, speed: 40, dmg: 44, r: 24, size: 26, hear: 1600, score: 500,
              body: '#2f3a42', head: '#4a5a64', boss: true,
              charge: { wind: 1.0, dash: 1.15, cool: 4.2, mul: 3.4, min: 190, max: 700, dmg: 42 },
              roar: { cool: 12, spawn: 2, kind: 'crawler' } }
};

/* ── 플레이어 ──────────────────────────────── */
class Player {
  constructor(x, y, level) {
    this.x = x; this.y = y; this.r = 12;
    this.angle = -Math.PI / 2;
    this.hp = this.hpMax = 100;
    this.owned = new Set(level.own);
    this.ammo = { smg: level.startAmmo.smg | 0, shell: level.startAmmo.shell | 0, rifle: level.startAmmo.rifle | 0, bolt: level.startAmmo.bolt | 0 };
    // 무기별 약실. 시작 시 예비탄에서 한 탄창씩 채워 둔다.
    this.mag = {};
    for (const k of SLOT_ORDER) {
      const w = WEAPONS[k];
      if (!this.owned.has(k)) { this.mag[k] = 0; continue; }
      if (!w.ammoKey) { this.mag[k] = magCap(w); continue; }
      const take = Math.min(magCap(w), this.ammo[w.ammoKey]);
      this.mag[k] = take; this.ammo[w.ammoKey] -= take;
    }
    this.reloadT = 0; this.reloadKey = null; this.reloadSpan = 1; this.dryT = 0;
    this.wpn = this.owned.has('smg') && this.mag.smg > 0 ? 'smg' : 'pistol';
    this.nades = level.startNades;
    this.stam = this.stamMax = 100;
    this.stamCool = 0; this.winded = false;
    this.meleeCool = 0; this.meleeAnim = 0;
    this.dmgTaken = 0;           // 전적 집계용
    this.battery = 100;
    this.lightOn = true;
    this.cool = 0; this.nadeCool = 0;
    this.hurtFlash = 0; this.muzzle = 0;
    this.walkPhase = 0; this.sprinting = false;
    this.noise = 0;              // 최근 총성 — 좀비를 부른다
    this.dead = false;
  }

  /** 약실·예비탄이 모두 마른 총은 자동으로 권총으로 되돌아간다 */
  get weapon() {
    const w = WEAPONS[this.wpn];
    if (w.ammoKey && this.ammo[w.ammoKey] <= 0 && (this.mag[w.key] | 0) <= 0) return WEAPONS.pistol;
    return w;
  }
  /** 예비 탄약 (권총은 무한) */
  reserveOf(w) { return w.ammoKey ? this.ammo[w.ammoKey] : Infinity; }
  /** 약실에 남은 탄 */
  magOf(w) { return this.mag[w.key] | 0; }
  ammoOf(w) { return this.reserveOf(w); }
  get reloading() { return this.reloadT > 0; }
  /** 재장전 진행률 0→1 (HUD 바) */
  get reloadProgress() { return this.reloadT > 0 ? 1 - this.reloadT / this.reloadSpan : 0; }

  /** 탄창 교체. auto = 빈 약실에서 자동으로 걸린 것이라 실패음을 내지 않는다 */
  /** 빠른 장전(rc.39) — 장전 막대의 밝은 구간(진행 45‒65%)에서 한 번 더 누르면 바로 끝난다. 일찍 누르면 걸려서 0.45초 늦는다. 한 번만 */
  static get ACTIVE() { return [0.45, 0.65]; }
  activeReload(g) {
    if (this.reloadTried) return false;
    this.reloadTried = true;
    const k = this.reloadProgress, [a, b] = Player.ACTIVE;
    if (k >= a && k <= b) { this.finishReload(); this.activeOk = (this.activeOk | 0) + 1; if (g) { g.fastReloads = (g.fastReloads | 0) + 1; if (g.ruleToast) g.ruleToast('fastrl', T('빠른 장전 — 밝은 구간에서 한 번 더 누르면 바로 끝난다')); } return true; }
    if (k < a) { this.reloadT += 0.45; this.reloadSpan += 0.45; this.jam = 0.45; SFX.dry(); }
    return false;
  }
  reload(g, auto) {
    if (this.reloadT > 0 && !auto && !this.dead) return this.activeReload(g);
    if (this.dead || this.reloadT > 0) return false;
    this.reloadTried = false; this.jam = 0;
    const w = this.weapon;
    if (this.magOf(w) >= magCap(w)) { if (!auto) SFX.click(); return false; }
    if (this.reserveOf(w) <= 0) {
      if (!auto) { SFX.dry(); if (g) g.toast('예비 탄약이 없다'); }
      return false;
    }
    // 탄창 버림 규칙 — 남은 탄을 탄창째 버린다(무한 권총은 그대로)
    const R = (g || window.G || {}).rules;
    if (R && R.mag && w.ammoKey && this.magOf(w) > 0) {
      this.mag[w.key] = 0;
      if (g && g.ruleToast) g.ruleToast('mag', T('탄창째 버렸다 — 남은 탄을 세어 가며 쏴라'));
    }
    this.reloadKey = w.key;
    this.reloadSpan = w.reload * PK.reload;
    this.reloadT = w.reload * PK.reload;
    SFX.reload();
    return true;
  }
  cancelReload() { this.reloadT = 0; this.reloadKey = null; }
  /** 주워서 즉시 손에 드는 경로 — 약실을 공짜로 채워 주지 않고 예비탄에서 당겨 온다 */
  equip(key) {
    this.cancelReload();
    this.wpn = key;
    const w = WEAPONS[key];
    const need = magCap(w) - this.magOf(w);
    if (need > 0) {
      const take = w.ammoKey ? Math.min(need, this.ammo[w.ammoKey]) : need;
      this.mag[key] = this.magOf(w) + take;
      if (w.ammoKey) this.ammo[w.ammoKey] -= take;
    }
  }
  finishReload() {
    const w = WEAPONS[this.reloadKey];
    this.reloadT = 0; this.reloadKey = null;
    if (!w) return;
    const need = magCap(w) - this.magOf(w);
    const take = w.ammoKey ? Math.min(need, this.ammo[w.ammoKey]) : need;
    if (take <= 0) return;
    this.mag[w.key] += take;
    if (w.ammoKey) this.ammo[w.ammoKey] -= take;
    SFX.reloadDone();
  }

  /** 달리기 — 기력을 소모한다. 다 쓰면 숨이 차 한동안 못 달린다 */
  resolveSprint(want, moving, dt) {
    // 바닥까지 쓰면 숨이 차고(winded), 기력이 WIND_CLEAR 까지 돌아올 때까지는 못 달린다.
    // 하한을 0 으로 두어야 0 에서 깔끔히 끊긴다 — 하한이 양수면 달리기가 덜덜 떨린다.
    this.sprinting = !!(want && moving && !this.dead && this.stam > (this.winded ? Player.WIND_CLEAR : 0));
    if (this.sprinting) {
      this.stam = Math.max(0, this.stam - 24 * PK.stamUse * dt);
      this.stamCool = 0.5;
      if (this.stam <= 0 && !this.winded) { this.winded = true; SFX.gasp(); }
    } else if (this.stamCool > 0) {
      this.stamCool -= dt;
    } else {
      this.stam = Math.min(this.stamMax, this.stam + 20 * dt);
      if (this.winded && this.stam >= Player.WIND_CLEAR) this.winded = false;
    }
    // 발소리도 좀비를 부른다. 질주는 빠른 대신 멀리까지 들린다 —
    // 기력은 "달릴 수 있는가"를, 이 소리는 "달려도 되는가"를 묻는다.
    const step = (this.sprinting ? Player.NOISE_SPRINT : (moving && !this.dead ? Player.NOISE_WALK : 0)) * PK.step;
    if (step > this.noise) this.noise = step;
    return this.sprinting;
  }

  /** 근접 밀치기 — 탄이 없거나 몰렸을 때의 마지막 수단 */
  melee(g) {
    if (this.dead || this.meleeCool > 0) return false;
    this.meleeCool = 0.58 * PK.shoveCd;
    this.meleeAnim = 0.32;                                   // 밀치기 — 몸을 실어 두 팔로 내지른다(예전 0.2초는 눈에 잘 안 띄었다)
    // 밀치기 연출(rc.36) — 원형 고리 대신 레퍼런스(근접 공격의 '스미어 한 장 + 맞은 자리 섬광 + 파편 + 짧은 정지')를 따른다.
    // sw: 휘두르는 방향(번갈아), pts: 맞은 자리(섬광을 그린다)
    g.shoveSw = -(g.shoveSw || 1);
    (g.shoves || (g.shoves = [])).push({ x: this.x, y: this.y, a: this.angle, t: 0, max: 0.24, hits: 0, sw: g.shoveSw, pts: [] });
    this.noise = Math.max(this.noise, 0.34);
    this.cancelReload();
    this.cool = Math.max(this.cool, 0.22);
    SFX.melee();
    // 되살아남 규칙 — 곁에 쓰러진 것은 짓밟아 끝낸다
    if (g.rules && g.rules.rise) for (const c of g.corpses) if (c.rise > 0 && Math.hypot(c.x - this.x, c.y - this.y) < 70 + (PK.shove || 0)) { c.rise = 0; g.spawnBlood(c.x, c.y, Math.random() * 6.28, 10); }
    let hits = 0, killed = false;
    for (const z of g.zombies) {
      if (z.dead) continue;
      const dx = z.x - this.x, dy = z.y - this.y;
      const d = Math.hypot(dx, dy);
      // 사방으로 — 몸을 크게 휘둘러 둘레 전부를 떼어 낸다. 등 뒤에서 껴안은 것도 밀린다(앞쪽이 조금 더 멀리)
      if (d > 46 + PK.shove + z.r) continue;
      const a = Math.atan2(dy, dx);
      const front = Math.cos(a - this.angle) > 0.3;
      // 처형(rc.39) — 완벽 밀치기로 넘어진 것을 한 번 더 밀치면 끝낸다
      if (z.down > 0 && !z.t.boss) { z.hurt(z.hp + 1, a, g, 0, 'melee'); g.execs = (g.execs | 0) + 1; killed = true; g.freezeT = Math.max(g.freezeT || 0, 0.12); hits++; continue; }
      // 완벽 밀치기(rc.39) — 붙은 지 0.35초 안(덤벼드는 순간) · 뛰어드는 것 · 돌진하는 것을 밀치면 넘어뜨린다
      const perfect = !z.t.boss && ((z.biteAt >= 0 && g.time - z.biteAt < 0.35) || z.leapPhase === 'air' || z.chargePhase === 'dash');
      z.hurt(front ? 24 : 18, a, g, 0, 'melee');
      if (z.dead) killed = true;
      if (!z.dead && !z.t.boss) {
        // 밀려나는 것이 눈에 보이게 — 순간이동 대신 0.28초 동안 미끄러지며(약 80) 뒤로 젖혀지고 팔을 허우적댄다
        const brute = z.type === 'brute' || z.type === 'charger';
        // 덩치도 한 걸음은 물러나야 한다 — 예전(140 · 0.2초)은 밀려도 닿는 거리 안이라 곧바로 다시 붙었다
        z.kbV = (brute ? 270 : 380) * (front ? 1 : 0.85); z.kbA = a; z.shoved = brute ? 0.45 : 0.6; z.shoveA = a;
        z.stagger = Math.max(z.stagger, brute ? 0.5 : 0.62);
        if (perfect) {
          z.down = 1.8; z.stagger = Math.max(z.stagger, 1.8); z.kbV *= 1.3; z.biteAt = -1;
          g.perfects = (g.perfects | 0) + 1; g.freezeT = Math.max(g.freezeT || 0, 0.14);
          if (g.ruleToast) g.ruleToast('perfect', T('완벽한 밀치기 — 넘어진 것을 한 번 더 밀치면 끝낸다')); else if (g.toast) g.toast(T('완벽한 밀치기'));
        }
      }
      // 맞은 자리 — 섬광 하나와 밀린 쪽으로 튀는 흙먼지 · 불티 몇 점(가벼운 타격엔 3‒8 점이면 충분하다)
      const cx = z.x - Math.cos(a) * z.r * 0.8, cy = z.y - Math.sin(a) * z.r * 0.8;
      const sv0 = g.shoves[g.shoves.length - 1]; if (sv0) sv0.pts.push({ x: cx, y: cy, a, big: z.type === 'brute' || z.type === 'charger' || !!z.t.boss });
      for (let i = 0; i < 5; i++) { const pa = a + (Math.random() - 0.5) * 1.1, sp = 120 + Math.random() * 150, l = 0.28 + Math.random() * 0.18;
        g.particles.push({ x: cx, y: cy, vx: Math.cos(pa) * sp, vy: Math.sin(pa) * sp, life: l, max: l, size: 2 + Math.random() * 1.6, col: '#cbbfa6' }); }
      for (let i = 0; i < 3; i++) { const pa = a + (Math.random() - 0.5) * 1.6, sp = 200 + Math.random() * 140;
        g.particles.push({ x: cx, y: cy, vx: Math.cos(pa) * sp, vy: Math.sin(pa) * sp, life: 0.16, max: 0.16, size: 1.6, col: '#fff1c8', kind: 'spark' }); }
      hits++;
    }
    const sh = g.shoves[g.shoves.length - 1]; if (sh) sh.hits = hits;
    // 짧은 정지(약 4‒5 프레임) · 짧고 굵은 흔들림 · 카메라를 앞으로 툭 — 맞혔다는 손맛
    if (hits) { SFX.meleeHit(0); g.shake = Math.min(14, g.shake + 5); g.onHit(killed); g.freezeT = Math.max(g.freezeT || 0, hits > 1 ? 0.085 : 0.065); if (g.recoil) g.recoil(this.angle + Math.PI, 3); if (g.buzz) g.buzz(25); }
    return true;
  }

  select(key, g) {
    if (!this.owned.has(key) || this.wpn === key) return;
    this.cancelReload();
    this.wpn = key;
    SFX.click();
    if (g) g.toast(T('{w} 장착', { w: T(WEAPONS[key].name) }));
  }
  cycle(g) {
    const list = SLOT_ORDER.filter(k => this.owned.has(k));
    const i = list.indexOf(this.wpn);
    for (let n = 1; n <= list.length; n++) {
      const k = list[(i + n) % list.length];
      const w = WEAPONS[k];
      if (!w.ammoKey || this.ammo[w.ammoKey] > 0 || this.magOf(w) > 0) { this.select(k, g); return; }
    }
  }

  /** 어둠 — 손전등이 꺼졌거나(방전 포함) 담즙에 눈이 가렸다. 이때는 조준이 크게 흔들린다 */
  get dark() { return !this.lightOn || this.battery <= 0; }
  /** 자동 사격 · 자동 조준이 함께 쓰는 사거리 — 불빛이 닿는 곳, 어두우면 가까운 곳(230)만.
      예전엔 조준은 380 까지 표적을 물고 사격은 불빛 사거리(꺼지면 190)만 봐서, 불이 꺼지거나 폭풍이 오면
      먼 적에 손전등이 고정된 채 총이 멈췄다 */
  fireRange() { return Math.max(this.lightRange, 230); }
  get lightRange() {
    if (!this.lightOn || this.battery <= 0) return 0;
    const low = this.battery < 22 ? 0.72 + Math.random() * 0.28 : 1;  // 저전력 깜빡임
    const storm = typeof G !== 'undefined' && G.storm ? 1 - 0.45 * G.storm : 1;   // 모래 폭풍 · 눈보라가 불빛을 삼킨다
    const shower = typeof G !== 'undefined' && G.shower ? 1 - 0.18 * G.shower : 1;   // 소나기 — 빗줄기에 불빛이 짧아진다
    return 430 * PK.lamp * low * (this.bile > 0 ? 0.7 : 1) * storm * shower;       // 담즙에 눈이 흐려진다
  }

  hurt(dmg) {
    if (this.dead) return;
    dmg *= PK.armor;                                          // 방탄 조끼
    this.hp -= dmg;
    this.dmgTaken += dmg;
    this.stress = (this.stress || 0) + dmg;                   // 연출가가 읽는 긴장도
    this.hurtFlash = Math.min(1, this.hurtFlash + dmg / 34);
    this.calmT = 0;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; SFX.death(); }
  }

  /** aim 을 주면 그 방향으로 쏜다 — 자동 사격이 불빛 안의 표적을 겨눌 때 */
  fire(g, aim) {
    if (this.cool > 0 || this.dead || this.reloadT > 0) return false;
    const base = aim === undefined ? this.angle : aim;
    const w = this.weapon;
    if (this.magOf(w) <= 0) {
      if (this.dryT <= 0) { SFX.dry(); this.dryT = 0.32; }
      this.reload(g, true);
      return false;
    }
    // 미니건은 총열이 돌아야 빨라진다 — 처음 몇 발은 느리다
    if (w.spin) { this.spinUp = Math.min(1, (this.spinUp || 0) + 0.06); this.cool = w.rate / (0.22 + 0.78 * this.spinUp); }
    else this.cool = w.rate;
    this.mag[w.key] = this.magOf(w) - 1;
    g.shots += w.pellets;
    if (w.key !== 'pistol') g.nonPistol = true;
    const mx = this.x + Math.cos(base) * 14, my = this.y + Math.sin(base) * 14;
    if (w.launcher) {
      // 유탄 — 닿는 순간 터진다
      g.grenades.push(new Grenade(mx, my, base + (Math.random() - 0.5) * w.spread * 2, { impact: true, speed: w.speed }));
    } else for (let i = 0; i < w.pellets; i++) {
      // 어둠 속 사격 — 탄이 45% 더 퍼지고 손이 떨린다(약 1.4° 더). 불빛 아래에서 쏘는 게 훨씬 낫다
      const spread = (this.dark ? w.spread * 1.45 + 0.025 : w.spread) * PK.spread;
      const a = base + (Math.random() - 0.5) * spread * 2;
      const b = new Bullet(mx, my, a, w.dmg * (w.special ? 1 : PK.dmg), w.range * (0.85 + Math.random() * 0.3), w.speed, w.pierce | 0, w.knock);
      if (w.burn) { b.burn = w.burn; b.flame = true; }
      if (w.rail) b.rail = true;
      if (w.key === 'crossbow') b.bolt = true;
      if (w.ap || w.rail) b.ap = true;
      g.bullets.push(b);
    }
    if (w.rail && g.beam) g.beam(mx, my, base, w.range);
    this.muzzle = w.pellets > 1 ? 0.1 : w.flame ? 0.03 : 0.06;
    // 총성 — 총마다 크기가 다르고(권총 0.8 · 매그넘 1.35) 소음기가 60% 줄인다. 들은 감염체만 깨어난다
    const loud = w.silent ? 0.12 : (w.loud || 1) * (w.special ? 1 : PK.noise);
    this.noise = Math.max(this.noise, loud); this.shotLoud = loud;
    if (!w.silent && g.noiseRing) g.noiseRing(this.x, this.y, loud);
    g.shake = Math.min(14, g.shake + w.kick);
    g.recoil(base, w.kick);                                   // 카메라가 반동 방향으로 튄다
    if (!w.flame && !w.launcher && !w.silent) g.ejectCasing(this.x, this.y, base, w.key);   // 탄피는 바닥에 남는다
    if (w.pellets > 1) g.world.slide(this, -Math.cos(base) * 6, -Math.sin(base) * 6);   // 산탄의 밀림
    SFX[w.sfx]();
    return true;
  }

  /** 형제 동작(fire·melee·reload)과 같이 성공 여부를 돌려준다 */
  throwNade(g) {
    if (this.nades <= 0 || this.nadeCool > 0 || this.dead) {
      if (this.nades <= 0 && !this.dead && this.nadeCool <= 0) {
        this.nadeCool = 0.35;          // 빈 손으로 연타해도 소리가 겹치지 않게
        SFX.dry();
      }
      return false;
    }
    this.nades--; this.nadeCool = 0.7;
    g.grenades.push(new Grenade(
      this.x + Math.cos(this.angle) * 16,
      this.y + Math.sin(this.angle) * 16,
      this.angle));
    SFX.nadeThrow();
    return true;
  }

  update(dt, g) {
    if (this.cool <= 0 && this.spinUp > 0) this.spinUp = Math.max(0, this.spinUp - dt * 1.4);
    this.cool = Math.max(0, this.cool - dt);
    this.nadeCool = Math.max(0, this.nadeCool - dt);
    this.muzzle = Math.max(0, this.muzzle - dt);
    this.meleeCool = Math.max(0, this.meleeCool - dt);
    this.meleeAnim = Math.max(0, this.meleeAnim - dt);
    this.dryT = Math.max(0, this.dryT - dt);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.finishReload();
    }
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.4);
    this.noise = Math.max(0, this.noise - dt * 1.4);
    this.bile = Math.max(0, (this.bile || 0) - dt);
    if (this.lightOn && this.battery > 0) {
      this.battery = Math.max(0, this.battery - (g.level.batteryDrain || 1.25) * SETTINGS.mod.battery * PK.drain * (PK.lamp > 1 ? 1.1 : 1) * dt);
      this.offT = 0;
      if (this.battery === 0) { this.lightOn = false; g.toast(T('배터리 방전 — 꺼 두면 다시 충전된다')); }
    } else if (!this.lightOn && this.battery < 100) {
      // 꺼 두면 손잡이 발전기가 천천히 채운다 — 어둠 속에서 버티는 시간과 맞바꾼다(0.8초 뒤부터 초당 3.2)
      this.offT = (this.offT || 0) + dt;
      if (this.offT > 0.8) this.battery = Math.min(100, this.battery + 3.2 * PK.charge * dt);
    }
    this.charging = !this.lightOn && this.battery < 100 && (this.offT || 0) > 0.8;
  }
}

/* ── 좀비 ──────────────────────────────────── */
Player.WIND_CLEAR = 45;     // 숨이 돌아오는 기력 문턱
Player.NOISE_SPRINT = 0.38; // 질주 중 발소리 (청각 범위 ×1.6)
Player.NOISE_WALK = 0.1;    // 걸을 때 (×1.16)

class Zombie {
  constructor(x, y, type) {
    const t = ZTYPES[type];
    this.type = type; this.t = t;
    this.x = x; this.y = y; this.r = t.r;
    const hp = Math.round(t.hp * SETTINGS.mod.hp);
    this.hp = hp; this.hpMax = hp;
    this.face = Math.random() * Math.PI * 2;
    this.aggro = false;
    this.stand = Math.random() < 0.75;      // 잠든 도시(이야기 판): 넷 중 셋은 제자리에 서 있고, 하나는 느릿느릿 서성인다
    this.steer = 0; this.steerHold = 0;
    this.wanderDir = Math.random() * Math.PI * 2;
    this.wanderT = 1 + Math.random() * 3;
    this.phase = Math.random() * 6.28;
    this.growlT = 1 + Math.random() * 6;
    this.stagger = 0;
    this.lit = 0;
    this.chargeT = 2.5;                     // 그것: 다음 돌진까지
    this.chargePhase = '';                  // '' | 'wind' | 'dash'
    this.chargeDir = 0;
    this.roarT = 4;
    this.spitT = 1 + Math.random() * 2;     // 뱉는 것: 첫 사격까지의 여유
    this.lungeT = Math.random() * 1.2;      // 기어다니는 것: 웅크림↔도약 주기
    this.lunging = false;
    this.dead = false;
  }

  hurt(dmg, ang, g, knock = 0, src = '') {
    if (PK.gold[this.type]) dmg *= 1.06;                      // 도감 금메달 — 약점을 안다
    // 진압 경찰 — 앞에서 온 총알은 방패가 받는다. 밀치기는 몸을 돌려세워 등을 드러낸다. 폭발은 그대로
    const ar = this.t.armor;
    // 석궁 · 매그넘 · 경기관총(ap)은 방패째 꿰뚫는다 — 불꽃만 튀고 피해는 그대로
    if (ar && src === 'ap' && this.hp > 0 && g.spawnSparks) {
      const front = Math.abs(Math.atan2(Math.sin(ang - this.face - Math.PI), Math.cos(ang - this.face - Math.PI))) < ar.arc;
      if (front) { g.spawnSparks(this.x + Math.cos(this.face) * 12, this.y + Math.sin(this.face) * 12, ang); this.aggro = true; }
    }
    if (ar && src !== 'blast' && src !== 'ap' && this.hp > 0) {
      const front = Math.abs(Math.atan2(Math.sin(ang - this.face - Math.PI), Math.cos(ang - this.face - Math.PI))) < ar.arc;
      if (src === 'melee') { this.face += (Math.random() < 0.5 ? -1 : 1) * 2.2; this.stagger = Math.max(this.stagger, 0.9); this.aggro = true; if (front) return; }
      else if (front) {
        dmg *= ar.mul; this.aggro = true; this.flash = 0.05;
        // 처음 막혔을 때 한 번 — 도움말을 꺼 둔 사람도 이것만은 알아야 한다
        if (!g.shieldTold && src !== 'melee') { g.shieldTold = true; if (g.toast) g.toast(T('방패에 막혔다 — 밀쳐서 돌려세우고 등을 쏴라'), 3); }
        if (g.spawnSparks) g.spawnSparks(this.x + Math.cos(this.face) * 12, this.y + Math.sin(this.face) * 12, ang);
        SFX.pan(this.x - g.player.x); SFX.ric(Math.hypot(this.x - g.player.x, this.y - g.player.y)); SFX.pan(0);
        this.hp -= dmg; if (this.hp > 0) return;
        dmg = 0;
      }
    }
    // 덮치는 것 — 날아오는 도중에 맞으면 떨어져 뒹군다(받아치기). 그 한 방은 더 아프다
    if (this.leapPhase === 'air') { dmg *= 1.6; this.leapPhase = ''; this.leapT = this.t.leap.cool; this.stagger = Math.max(this.stagger, 1.0); this.skeet = 0.5; }
    else if (this.leapPhase === 'crouch' && dmg >= 10) { this.leapPhase = ''; this.leapT = 1.2; }
    // 휘감는 것 — 맞으면 혀가 끊긴다
    if (this.tonguePhase) this.cutTongue(g);
    this.hp -= dmg;
    this.aggro = true;
    if (this.t.weeper && !this.rage && this.hp > 0) this.enrage(g);
    if (this.screamPhase === 'wind') this.windT = Math.min(this.t.scream.wind, this.windT + this.t.scream.delay);
    this.flash = 0.07;                                        // 맞은 순간 하얗게
    this.recoil = 0.28; this.hitAng = ang || 0;                // 맞은 쪽으로 몸이 젖혀진다(3D)
    if (this.type !== 'brute' && this.type !== 'charger' && !this.t.boss) this.stagger = Math.max(this.stagger, 0.09);
    // 넉백 — 맞은 방향으로 밀린다. 덩치는 덜 밀린다
    if (knock) {
      const k = knock * (this.t.boss ? 0.08 : this.type === 'brute' || this.type === 'charger' ? 0.3 : 1);
      g.world.slide(this, Math.cos(ang) * k, Math.sin(ang) * k);
    }
    g.spawnBlood(this.x, this.y, ang, this.type === 'brute' ? 10 : 6);
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      // 쓰러지는 모습 일곱 — 무엇에 어떻게 맞았는지로 고른다
      //   blast 폭발에 날아감 · spin 밀치기에 돌며 쓰러짐 · crumple 불에 타 주저앉음 · back 큰 반동에 뒤로 날아감
      //   head 강한 한 발에 뻣뻣이 넘어감 · knees 무릎 꿇었다 엎어짐 · face 그대로 앞으로 엎어짐
      const how = src === 'blast' ? 'blast' : src === 'melee' ? 'spin' : src === 'fire' || this.burn > 0 ? 'crumple'
        : knock >= 12 ? 'back' : dmg >= 60 ? 'head' : (Math.random() < 0.5 ? 'knees' : 'face');
      const push = how === 'blast' ? 52 : how === 'back' ? 28 : how === 'spin' ? 14 : 0;
      const cps = { x: this.x, y: this.y, a: ang, type: this.type, age: 0, how, push, hazmat: !!(this.look && this.look.hazmat), top: this.look && this.look.top, pants: this.look && this.look.pants };   // 맞은 방향으로 쓰러진다
      // 되살아남 규칙 — 보통 감염체의 절반 가까이가 4‒9초 뒤 다시 일어난다(폭발 · 불 · 밀치기로 쓰러진 것, 정예, 이미 한 번 일어난 것은 그대로)
      if (g.rules && g.rules.rise && this.dormantKind() && !this.elite && !this.risen && how !== 'blast' && how !== 'crumple' && how !== 'spin' && Math.random() < 0.45) cps.rise = 4 + Math.random() * 5;
      g.corpses.push(cps);
      g.spawnBlood(this.x, this.y, ang, 16);
      if (g.splat) g.splat(this.x, this.y, ang, this.t.size || 12);   // 원작처럼 큰 핏자국이 남는다
      g.onKill(this);
      if (this.t.bloat) g.bloaterBurst(this);
      if (this.t.tongue && g.smokeCloud) g.smokeCloud(this.x, this.y);
      SFX.pan(this.x - g.player.x);
      SFX.zombieDie(Math.hypot(this.x - g.player.x, this.y - g.player.y));
      SFX.pan(0);
    }
  }

  /** 벽 회피: 목표 각도에서 조금씩 벌려가며 통과 가능한 방향을 찾는다. 움직였으면 true */
  steerMove(target, speed, dt, g) {
    this.steerHold -= dt;
    // 지형 — 진흙 · 모래 · 얕은 물은 저것들도 늦춘다. 얼음판에서는 조금 미끄러져 굼뜨다
    const tr = g.world.terrAt(this.x, this.y);
    if (tr) speed *= tr === 2 ? 0.86 : TERRAIN_SLOW[tr];
    const offsets = this.steerHold > 0
      ? [this.steer, 0, 0.55, -0.55, 1.1, -1.1, 1.7, -1.7, 2.5, -2.5]
      : [0, 0.55, -0.55, 1.1, -1.1, 1.7, -1.7, 2.5, -2.5];
    for (const off of offsets) {
      const a = target + off;
      const sk = speed * (this.spdK || 1);                     // 정예는 조금 더 빠르다
      const nx = Math.cos(a) * sk * dt, ny = Math.sin(a) * sk * dt;
      if (!g.world.hits(this.x + nx, this.y + ny, this.r)) {
        this.x += nx; this.y += ny; this.face = a;
        if (off !== 0) { this.steer = off; this.steerHold = 0.5; }
        return true;
      }
    }
    return false;
  }

  /* ── 우는 것 ──
     웅크린 채 운다. 깨어남(startle) 0→1: 불빛(오래 비출수록) · 가까움 · 질주 · 곁의 총성이 채우고,
     조용하면 천천히 빠진다. 1 이 되면 비명과 함께 9초 동안 전력으로 쫓는다. */
  enrage(g) {
    this.rage = true; this.rageT = 9; this.aggro = true; this.startle = 1;
    g.weeperWoke = true;
    const d = Math.hypot(g.player.x - this.x, g.player.y - this.y);
    SFX.wail(d);
    g.shake = Math.min(18, g.shake + 8);
    g.stress(25);
    g.toast('우는 것이 깨어났다');
  }
  updateWeeper(dt, g, p, d, dx, dy) {
    this.lit = Math.max(0, this.lit - dt * 3);
    if (!this.rage) {
      this.aggro = false;
      this.startle = Math.max(0, (this.startle || 0) - 0.22 * dt);
      if (!p.dead) {
        if (this.lit > 0.5 && d < 380) this.startle += 0.85 * dt;     // 불빛을 비추면 (1.2초쯤)
        if (d < 120) this.startle += 1.7 * dt;                         // 바로 곁
        if (p.sprinting && d < 300) this.startle += 1.2 * dt;          // 뛰는 발소리
        if (p.noise > 0.95 && d < 360) this.startle += 0.07;           // 총성 (한 발에 0.2 남짓)
      }
      this.sobT = (this.sobT || 0) - dt;
      if (this.sobT <= 0 && d < 820) { this.sobT = 1.3 + Math.random() * 0.8 - this.startle * 0.6; SFX.sob(d, this.startle); }
      this.phase += dt * (1.5 + this.startle * 6);                       // 깨어날수록 어깨가 빨리 들썩인다
      if (this.startle >= 1) this.enrage(g);
      return;
    }
    this.rageT -= dt;
    if (this.stagger > 0) { this.stagger -= dt; this.phase += dt * 6; return; }   // 밀려나 비틀대는 동안은 붙잡지 못한다
    let target = Math.atan2(dy, dx);
    this.losT = (this.losT || 0) - dt;
    if (this.losT <= 0) { this.losT = 0.25; this.seen = d < 70 || g.world.los(this.x, this.y, p.x, p.y); }
    if (!this.seen) { const fa = g.world.flowDir(this.x, this.y); if (fa !== null) target = fa; }
    this.steerMove(target, this.t.speed, dt, g);
    this.phase += dt * 14;
    if (d < this.r + p.r + 4 && !p.dead) {
      p.grabN = (p.grabN || 0) + 2;                                      // 붙잡히면 거의 못 움직인다
      p.hurt(this.t.dmg * SETTINGS.mod.dmg * dt);
      g.shake = Math.min(12, g.shake + 20 * dt);
      if (g.hurtSfxT <= 0) { SFX.hurt(); g.hurtSfxT = 0.45; }
    }
    if (this.rageT <= 0 || p.dead) { this.rage = false; this.startle = 0; this.aggro = false; }   // 그 자리에 다시 주저앉는다
  }

  /** 잠든 도시에서 서 있는 종류 — 특수 감염체는 여전히 사냥한다(눈에 띄면 온다) */
  dormantKind() { const t = this.t; return !(t.special || t.spit || t.tongue || t.leap || t.charge || t.scream || t.boss || t.weeper); }
  /** 깨울까 — 소리(총성은 벽 너머까지 · 질주는 가까이 · 걸음은 바로 곁), 부딪힘, 1초 남짓 비춘 불빛, 곁의 것이 깨어남 */
  wakeCheck(dt, g, p, d) {
    if (p.dead) return false;
    if (d < this.r + p.r + 12) return true;                                     // 부딪힘
    const H = this.t.hear * (g.sense ? g.sense.h : 1), A = g.acou || { step: 1, shot: 1 };
    let heard = false;
    if (p.noise >= 0.6) {                                                       // 총성 — 화면의 총성 고리만큼 들린다(벽 너머는 60% 까지). 소음기 · 골목은 작게, 대로는 멀리
      const R = H * (1 + p.noise * 1.6) * A.shot;
      if (d < R && (d < R * 0.6 || g.world.los(this.x, this.y, p.x, p.y))) return true;
    } else if (p.noise > 0.05) {                                                // 발소리 — 질주는 약 200, 걸음은 바로 곁. 보이는 곳에서만. 빗소리에 묻힌다
      const R = H * p.noise * 1.6 * A.step;
      if (d < R && g.world.los(this.x, this.y, p.x, p.y)) heard = true;
    }
    // 의심(rc.39) — 발소리는 바로 깨우지 않는다. 고개를 돌리고(머리 위 '?') 0.7초 남짓 귀를 기울이다 깬다. 그 사이 멈추면 가라앉는다
    if (heard) this.sus = (this.sus || 0) + dt / 0.7;
    else if (this.sus > 0) this.sus = Math.max(0, this.sus - dt * 0.8);
    if (this.sus >= 1) return true;
    if (this.lit > 0.5) {                                                       // 불빛 — 비추는 동안 천천히 고개를 돌리다 깬다
      this.litT = (this.litT || 0) + dt * (d < 160 ? 1.8 : 1);
      if (this.litT > (g.sense ? g.sense.lit : 1.1)) return true;
    } else this.litT = Math.max(0, (this.litT || 0) - dt * 0.5);
    if (this.chainT > 0 && (this.chainT -= dt) <= 0) return true;
    return false;
  }
  /** 깨어난다 — 비명과 함께 0.5초 몸을 일으키고, 곁에 서 있던 것들도 줄줄이 깬다 */
  wake(g, d, chain) {
    this.aggro = true; this.wakeHold = 0.5; this.litT = 0; this.sus = 0;
    g.woke = (g.woke | 0) + 1;                                               // 장 평가 — 깨운 수
    if (this.type === 'runner' || this.type === 'crawler') SFX.screech(d); else SFX.growl(d);
    if (!chain) return;
    for (const o of g.zombies) {
      if (o === this || o.dead || o.aggro || o.chainT > 0 || !o.dormantKind()) continue;
      const od = Math.hypot(o.x - this.x, o.y - this.y);
      const CR = g.sense ? g.sense.chain : 170;
      if (od < CR) o.chainT = 0.25 + od / CR * 0.6 + Math.random() * 0.3;
    }
  }
  /** 잠든 동안 — 서 있는 것은 제자리에서 흔들리고, 비추면 천천히 이쪽으로 돈다. 서성이는 것은 느리게 걷는다 */
  idle(dt, g, p, dx, dy) {
    if (this.litT > 0.2 || this.sus > 0.05) {
      const want = Math.atan2(dy, dx), da = Math.atan2(Math.sin(want - this.face), Math.cos(want - this.face));
      this.face += Math.max(-1.6 * dt, Math.min(1.6 * dt, da));
      this.phase += dt * 1.5;
      return;
    }
    if (this.stand) {
      this.phase += dt * 0.9;
      this.wanderT -= dt;
      if (this.wanderT <= 0) { this.wanderT = 3 + Math.random() * 6; this.face += (Math.random() - 0.5) * 1.2; }
      return;
    }
    this.wanderT -= dt;
    if (this.wanderT <= 0) { this.wanderT = 2 + Math.random() * 4; this.wanderDir = Math.random() * 6.283; }
    if (!this.steerMove(this.wanderDir, this.t.speed * 0.22, dt, g)) this.wanderT = 0;
    this.phase += dt * 2.4;
  }

  cutTongue(g, quiet) {
    if (!this.tonguePhase) return;
    const was = this.tonguePhase;
    this.tonguePhase = ''; this.tongueLen = 0; this.tongueT = this.t.tongue.cool;
    if (was === 'pull' || was === 'fly') { this.stagger = Math.max(this.stagger, 0.7); if (!quiet) SFX.snap(Math.hypot(this.x - g.player.x, this.y - g.player.y)); }
  }
  /* 덮치는 것: 웅크림 → 비행 → (명중하면 튕겨 나가 잠깐 멍함). true 를 돌려주면 이번 프레임의 다른 움직임을 건너뛴다 */
  updateLeap(dt, g, p, d, dx, dy) {
    const L = this.t.leap;
    if (this.leapT === undefined) this.leapT = 0.4 + Math.random() * 0.6;
    if (this.leapPhase === 'crouch') {
      this.crouchT -= dt;
      if (this.crouchT > L.lock) { this.face = Math.atan2(dy, dx); this.leapDir = this.face; }
      this.phase += dt * 3;
      if (this.crouchT <= 0) { this.leapPhase = 'air'; this.airT = L.dur; SFX.pounce(d); }
      return true;
    }
    if (this.leapPhase === 'air') {
      this.airT -= dt;
      const st = L.speed * dt, nx = Math.cos(this.leapDir) * st, ny = Math.sin(this.leapDir) * st;
      if (g.world.hits(this.x + nx, this.y + ny, this.r)) { this.leapPhase = ''; this.leapT = L.cool; this.stagger = 0.5; SFX.slam(d * 1.6); return true; }
      this.x += nx; this.y += ny; this.phase += dt * 6;
      if (!p.dead && Math.hypot(p.x - this.x, p.y - this.y) < this.r + p.r + 6) {
        // 덮쳐서 넘어뜨리듯 밀어낸다 — 붙잡지는 않는다. 저것은 튕겨 나가 잠깐 멍하다
        p.hurt(L.dmg * SETTINGS.mod.dmg);
        g.hitFrom(this.x, this.y, 'leaper');
        g.world.slide(p, Math.cos(this.leapDir) * L.knock, Math.sin(this.leapDir) * L.knock);
        p.slowT = Math.max(p.slowT || 0, 0.35);
        g.world.slide(this, -Math.cos(this.leapDir) * 34, -Math.sin(this.leapDir) * 34);
        g.shake = Math.min(20, g.shake + 10);
        SFX.hurt();
        this.leapPhase = ''; this.leapT = L.cool; this.stagger = 0.6;
        return true;
      }
      if (this.airT <= 0) { this.leapPhase = ''; this.leapT = L.cool * 0.6; this.stagger = 0.25; }
      return true;
    }
    this.leapT -= dt;
    if (this.aggro && this.leapT <= 0 && !p.dead && d > L.min && d < L.range && g.world.los(this.x, this.y, p.x, p.y)) {
      this.leapPhase = 'crouch'; this.crouchT = L.crouch; this.face = Math.atan2(dy, dx); this.leapDir = this.face;
      SFX.hiss(d);
      return true;
    }
    return false;
  }
  /* 휘감는 것: 기침(예고) → 혀가 곧게 날아감 → 맞으면 0.5초 끌어당김. 비키면 빗나간다 */
  updateTongue(dt, g, p, d, dx, dy) {
    const T0 = this.t.tongue;
    if (this.tongueT === undefined) this.tongueT = 2 + Math.random() * 2;
    if (this.tonguePhase === 'wind') {
      this.windT -= dt; this.face = Math.atan2(dy, dx); this.tongueDir = this.face; this.phase += dt * 5;
      if (this.windT <= 0) {
        if (!g.world.los(this.x, this.y, p.x, p.y)) { this.tonguePhase = ''; this.tongueT = 1.5; return true; }
        this.tonguePhase = 'fly'; this.tongueLen = 0; SFX.lash(d);
      }
      return true;
    }
    if (this.tonguePhase === 'fly') {
      this.tongueLen += T0.speed * dt;
      const tx = this.x + Math.cos(this.tongueDir) * this.tongueLen, ty = this.y + Math.sin(this.tongueDir) * this.tongueLen;
      this.tipX = tx; this.tipY = ty;
      if (!p.dead && Math.hypot(p.x - tx, p.y - ty) < p.r + 9) {
        this.tonguePhase = 'pull'; this.pullT = T0.pull;
        p.hurt(T0.dmg * SETTINGS.mod.dmg); g.hitFrom(this.x, this.y, 'puller');
        p.slowT = Math.max(p.slowT || 0, T0.slow);
        g.shake = Math.min(14, g.shake + 6); SFX.hurt();
        g.toast(T('혀에 감겼다 — 쏘면 끊긴다'), 1.6);
      } else if (this.tongueLen >= T0.range || g.world.hits(tx, ty, 2)) { this.tonguePhase = 'back'; }
      return true;
    }
    if (this.tonguePhase === 'pull') {
      this.pullT -= dt;
      const dd = Math.hypot(this.x - p.x, this.y - p.y) || 1;
      if (dd > this.r + p.r + 30) g.world.slide(p, (this.x - p.x) / dd * T0.drag * dt, (this.y - p.y) / dd * T0.drag * dt);
      this.tipX = p.x; this.tipY = p.y; this.tongueLen = dd; this.face = Math.atan2(p.y - this.y, p.x - this.x);
      if (this.pullT <= 0 || p.dead) { this.tonguePhase = 'back'; }
      return true;
    }
    if (this.tonguePhase === 'back') {
      this.tongueLen -= T0.speed * 1.4 * dt;
      this.tipX = this.x + Math.cos(this.tongueDir) * Math.max(0, this.tongueLen); this.tipY = this.y + Math.sin(this.tongueDir) * Math.max(0, this.tongueLen);
      if (this.tongueLen <= 0) { this.tonguePhase = ''; this.tongueLen = 0; this.tongueT = T0.cool; }
      return true;
    }
    this.tongueT -= dt;
    if (this.aggro && this.tongueT <= 0 && !p.dead && d < T0.range * 0.92 && d > 90 && g.world.los(this.x, this.y, p.x, p.y)) {
      this.tonguePhase = 'wind'; this.windT = T0.wind; this.face = Math.atan2(dy, dx);
      SFX.cough(d);
      return true;
    }
    return false;
  }

  update(dt, g) {
    const p = g.player;
    const dx = p.x - this.x, dy = p.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    if (this.flash > 0) this.flash -= dt;
    if (this.recoil > 0) this.recoil -= dt;
    // 불붙은 것 — 초당 14씩 타들어 가며 불티를 흩뿌린다
    if (this.burn > 0) {
      this.burn -= dt; this.hp -= 14 * dt; this.aggro = true;
      if (Math.random() < dt * 14) g.particles.push({ x: this.x + (Math.random() - 0.5) * 10, y: this.y + (Math.random() - 0.5) * 10, vx: (Math.random() - 0.5) * 20, vy: -20 - Math.random() * 30, life: 0.5, max: 0.5, size: 2 + Math.random() * 2, col: Math.random() < 0.5 ? '#ffa030' : '#ff5a1a', kind: 'spark' });
      if (this.hp <= 0 && !this.dead) { this.hp = 0.5; this.hurt(1, this.face, g, 0, 'fire'); if (this.dead) return; }
    }
    // 밀치기에 밀려 미끄러진다 — 빠르게 시작해 금세 멈춘다. 우는 것도 예외가 아니다(예전엔 우는 것만 밀치기를 무시해 붙으면 떼어 낼 수 없었다)
    if (this.shoved > 0) this.shoved -= dt;
    if (this.kbV > 1) {
      g.world.slide(this, Math.cos(this.kbA) * this.kbV * dt, Math.sin(this.kbA) * this.kbV * dt);
      this.kbV *= Math.pow(0.004, dt);
    }
    if (this.t.weeper) { this.updateWeeper(dt, g, p, d, dx, dy); return; }

    // 잠든 도시 — 이야기 판의 보통 감염체는 그냥 서 있다. 소리 · 부딪힘 · 오래 비춘 불빛 · 깨어난 곁의 것만이 깨운다
    if (!this.aggro && g.dormant && this.dormantKind()) {
      if (this.wakeCheck(dt, g, p, d)) this.wake(g, d, true);
      else {
        this.lit = Math.max(0, this.lit - dt * 3);
        this.idle(dt, g, p, dx, dy);
        return;
      }
    }
    if (this.wakeHold > 0) {                              // 깨어나는 순간 — 고개를 돌리고 몸을 일으킨다(0.5초). 그 틈에 쏘거나 물러설 수 있다
      this.wakeHold -= dt; this.face = Math.atan2(dy, dx); this.phase += dt * 4;
      this.lit = Math.max(0, this.lit - dt * 3);
      return;
    }

    // 감지: 소리 · 불빛 · 근접
    if (!this.aggro) {
      const R = this.t.hear * (1 + p.noise * 1.6);
      // 큰 총성은 벽을 돌아서도 들린다(들리는 거리의 60%까지) — 조용히 쏠수록 깨우는 무리가 작다
      const heard = d < R && (p.noise >= 0.6 && d < R * 0.6 || g.world.los(this.x, this.y, p.x, p.y));
      if (heard || this.lit > 0.1) {
        this.aggro = true;
        if (this.type === 'runner' || this.type === 'crawler') SFX.screech(d);
        else SFX.growl(d);
      }
    }

    this.growlT -= dt;
    if (this.growlT <= 0) {
      this.growlT = this.aggro ? 2 + Math.random() * 3 : 5 + Math.random() * 9;
      if (d < 760) SFX.growl(d);
    }

    if (this.skeet > 0) this.skeet -= dt;
    if (this.down > 0) this.down -= dt;
    if (this.stagger > 0) { this.stagger -= dt; if (this.tonguePhase === 'pull') this.cutTongue(g, true); return; }
    if (this.t.leap && this.updateLeap(dt, g, p, d, dx, dy)) return;
    if (this.t.tongue && this.updateTongue(dt, g, p, d, dx, dy)) return;

    // ── 그것 · 들이받는 것: 직선으로 돌진한다 (그것은 포효로 무리도 부른다) ──
    if (this.t.charge && this.aggro) {
      const rr = this.t.roar, ch = this.t.charge;

      if (rr) this.roarT -= dt;
      if (rr && this.roarT <= 0) {
        this.roarT = rr.cool;
        SFX.roar(d);
        g.shake = Math.min(18, g.shake + 7);
        for (const o of g.zombies) if (o !== this) o.aggro = true;   // 전부 깨운다
        g.summon(this, rr.kind, rr.spawn);
        g.toast('포효 — 무리가 몰려온다');
      }

      if (this.chargePhase === 'wind') {
        this.chargeT -= dt;
        // 선딜 앞부분만 플레이어를 따라 돌고, 마지막 0.4초는 방향을 굳힌다 — 예고선을 보고 옆으로 비킬 수 있게.
        // (끝까지 따라 돌면 예고선이 플레이어를 쫓아다녀 피할 방법이 없었다)
        if (this.chargeT > 0.4) { this.face = Math.atan2(dy, dx); this.chargeDir = this.face; }
        else this.chargeLocked = true;
        if (this.chargeT <= 0) { this.chargePhase = 'dash'; this.chargeT = ch.dash; this.chargeLocked = false; SFX.charge(d); }
        this.phase += dt * 14;
        return;                                   // 선딜 동안은 제자리 — 피할 틈을 준다
      }
      if (this.chargePhase === 'dash') {
        this.chargeT -= dt;
        const step = this.t.speed * ch.mul * dt;
        const nx = Math.cos(this.chargeDir) * step, ny = Math.sin(this.chargeDir) * step;
        if (g.world.hits(this.x + nx, this.y + ny, this.r)) {
          // 벽에 박으면 스스로 비틀거린다 — 유일한 안정적 반격 창구
          this.chargePhase = ''; this.chargeT = ch.cool * 0.6;
          this.stagger = ch.stun || 1.1; g.shake = Math.min(22, g.shake + (this.t.boss ? 14 : 8));
          SFX.slam(d);
          return;
        }
        this.x += nx; this.y += ny;
        // 들이받는 것은 가는 길의 무리를 옆으로 쳐낸다
        if (!this.t.boss) for (const o of g.zombies) {
          if (o === this || o.dead || o.t.boss) continue;
          const ox = o.x - this.x, oy = o.y - this.y, od = Math.hypot(ox, oy);
          if (od < this.r + o.r + 4 && od > 0) { const side = Math.sign(-Math.sin(this.chargeDir) * ox + Math.cos(this.chargeDir) * oy) || 1; g.world.slide(o, -Math.sin(this.chargeDir) * side * 26, Math.cos(this.chargeDir) * side * 26); o.stagger = Math.max(o.stagger, 0.5); }
        }
        if (!p.dead && Math.hypot(p.x - this.x, p.y - this.y) < this.r + p.r + 4) {
          p.hurt(ch.dmg * SETTINGS.mod.dmg);
          g.hitFrom(this.x, this.y, 'charge');
          // 비스듬히 쳐낸다 — 가는 길에서 밀려나며 붙들려 가지는 않는다
          const k = ch.knock || 54, side = Math.sign(-Math.sin(this.chargeDir) * (p.x - this.x) + Math.cos(this.chargeDir) * (p.y - this.y)) || 1;
          g.world.slide(p, Math.cos(this.chargeDir) * k * 0.8 - Math.sin(this.chargeDir) * side * k * 0.4, Math.sin(this.chargeDir) * k * 0.8 + Math.cos(this.chargeDir) * side * k * 0.4);
          if (ch.slow) p.slowT = Math.max(p.slowT || 0, ch.slow);
          g.shake = Math.min(24, g.shake + 16);
          SFX.hurt();
          this.chargePhase = ''; this.chargeT = ch.cool;
          if (!this.t.boss) this.stagger = 0.5;
        }
        if (this.chargeT <= 0) { this.chargePhase = ''; this.chargeT = ch.cool; }
        this.phase += dt * 12;
        return;
      }
      this.chargeT -= dt;
      if (this.chargeT <= 0 && d > ch.min && d < ch.max && g.world.los(this.x, this.y, p.x, p.y)) {
        this.chargePhase = 'wind'; this.chargeT = ch.wind; this.chargeLocked = false;
        SFX.growl(d);
      }
    }

    // 비명 지르는 것: 보이면 멈춰 서서 숨을 들이켜고, 다 들이켜면 비명으로 무리를 부른다
    const sc = this.t.scream;
    if (sc && this.aggro) {
      if (this.screamT === undefined) this.screamT = 0.8 + Math.random() * 0.8;
      if (this.screamPhase === 'wind') {
        this.windT -= dt;
        this.face = Math.atan2(dy, dx);
        this.phase += dt * 4;
        if (this.windT <= 0) { this.screamPhase = ''; this.screamT = Infinity; g.onScream(this); }   // 한 번 지르면 목이 쉰다 — 그 뒤로는 그냥 달려든다
        return;
      }
      this.screamT -= dt;
      if (this.screamT <= 0 && d < sc.range && !p.dead && g.world.los(this.x, this.y, p.x, p.y)) {
        this.screamPhase = 'wind'; this.windT = sc.wind;
        SFX.inhale(d);
        return;
      }
    }

    // 뱉는 것: 사거리 안이고 시야가 트였으면 멈춰서 산을 뱉는다
    const sp = this.t.spit;
    if (sp && this.aggro) {
      this.spitT -= dt;
      // 여럿이 한꺼번에 뱉지 않는다 — 모든 뱉는 것이 1.6초 간격을 나눠 쓴다(웅덩이가 겹겹이 깔리던 문제)
      if (d < sp.range && this.spitT <= 0 && g.time >= (g.spitGapT || 0) && g.world.los(this.x, this.y, p.x, p.y)) {
        this.spitT = sp.cool * (0.85 + Math.random() * 0.3);
        g.spitGapT = g.time + 1.6;
        const a = Math.atan2(dy, dx);
        g.spits.push(new Spit(this.x + Math.cos(a) * 16, this.y + Math.sin(a) * 16, a, sp, p.x, p.y));
        this.face = a;
        SFX.spit(d);
      }
    }

    let speed, target, A = null;
    if (this.aggro) {
      speed = this.t.speed;
      // 원작의 감염체는 비틀거리지 않고 달려든다(리뷰: "Left 4 Dead 의 달리는 무리").
      // 배회할 때는 느릿하지만, 플레이어를 알아챈 뒤 1초 남짓이면 전력으로 뛴다
      this.aggroT = (this.aggroT || 0) + dt;
      // 전력 질주는 걷는 플레이어(158)와 비슷하다 — 걸어서는 떨칠 수 없고, 질주(224)해야 벌어진다
      if (this.type === 'walker') speed *= 1 + 2.1 * Math.min(1, this.aggroT / 1.2);
      if (this.type === 'spitter') speed *= 1 + 1.05 * Math.min(1, this.aggroT / 1.2);
      if (this.type === 'bloater') {
        speed *= 1.5;
        this.gurgleT = (this.gurgleT || 0) - dt;
        if (this.gurgleT <= 0 && d < 600) { this.gurgleT = 1.8 + Math.random(); SFX.gurgle(d); }   // 다가오는 소리로 먼저 알린다
      }
      if (this.type === 'runner') speed *= 1.42 * (0.9 + Math.sin(g.time * 3 + this.phase) * 0.12);
      if (this.t.crawl) {
        // 웅크렸다 튀는 리듬 — 일정 속도로 다가오지 않아 거리를 재기 어렵다
        this.lungeT -= dt;
        if (this.lungeT <= 0) {
          this.lunging = !this.lunging;
          this.lungeT = this.lunging ? 0.45 + Math.random() * 0.3 : 0.5 + Math.random() * 0.45;
        }
        speed *= this.lunging ? 1.5 : 0.22;
      }
      // 동료 — 보통 감염체는 플레이어보다 가까운 동료에게 달려든다(특수 감염체는 늘 플레이어를 노린다)
      A = this.allyTarget(g, d, dt);
      // 뱉는 것은 거리를 유지한다 — 너무 붙으면 물러난다
      target = A ? Math.atan2(A.y - this.y, A.x - this.x) : Math.atan2(dy, dx);
      // 시야가 막혀 있으면 도로를 따라 돌아 들어온다 (시야 확인은 0.3초마다)
      this.losT = (this.losT || 0) - dt;
      if (this.losT <= 0) { this.losT = 0.25 + Math.random() * 0.1; this.seen = d < 70 || g.world.los(this.x, this.y, p.x, p.y); }
      if (!this.seen && !A) { const fa = g.world.flowDir(this.x, this.y); if (fa !== null) target = fa; }
      const hold = sp ? sp.hold : this.t.tongue ? this.t.tongue.hold : 0;
      if (hold && this.seen) {
        if (d < hold * 0.75) { target += Math.PI; speed *= 0.8; }
        else if (d < hold) speed = 0;
      }
      if (this.t.leap) {
        speed *= 1.6;                                                  // 덮치는 것은 낮게 웅크려 재빨리 다가온다
        // 숨을 고르는 동안은 달려들지 않고 옆으로 돈다 — 다음 도약을 볼 틈을 준다
        if (this.seen && this.leapT > 0 && d < 200 && d > 60) { if (!this.circ) this.circ = Math.random() < 0.5 ? 1 : -1; target += this.circ * 1.45; speed *= 0.55; }
      }
      if (this.type === 'riot') speed *= 1 + 1.4 * Math.min(1, this.aggroT / 1.2);
      if (this.type === 'charger') speed *= 1.25;
    } else {
      this.aggroT = 0;
      this.wanderT -= dt;
      if (this.wanderT <= 0) { this.wanderT = 2 + Math.random() * 4; this.wanderDir = Math.random() * 6.283; }
      speed = this.t.speed * 0.28;
      target = this.wanderDir;
    }

    if (!this.steerMove(target, speed, dt, g)) this.wanderT = 0;
    this.phase += dt * (this.aggro ? 9 : 3);

    // 부푼 것은 붙으면 터진다
    if (this.t.bloat && this.aggro && d < this.r + p.r + 8 && !p.dead) { this.hurt(this.hp + 1, Math.atan2(dy, dx), g); return; }

    // 접촉 공격 — 붙잡힌 만큼 발이 묶인다 (다음 프레임 이동에 반영)
    if (d < this.r + p.r + 3 && !p.dead) { if (!(this.biteAt >= 0)) this.biteAt = g.time; } else this.biteAt = -1;   // 덤벼든 순간(완벽 밀치기 창)
    if (d < this.r + p.r + 3 && !p.dead) {
      p.grabN = (p.grabN || 0) + (this.t.boss ? 0 : 1);
      // 여럿이 붙어도 피해는 덜 늘어난다 — 포위의 무서움은 피해보다 발이 묶이는 데서 온다
      p.hurt(this.t.dmg * (this.dmgK || 1) * SETTINGS.mod.dmg * dt / (1 + 0.3 * Math.max(0, (p.grabbed || 0) - 1)));
      if (g.rules && g.rules.bite && !this.t.boss) {                    // 감염 규칙 — 물린 만큼 독이 돈다
        if (!(p.infect > 0)) g.ruleToast('bite', T('물렸다 — 독이 돈다. 구급킷으로만 낫는다'));
        p.infect = Math.min(1, (p.infect || 0) + dt * 0.3);
      }
      g.hitFrom(this.x, this.y, this.type);
      g.shake = Math.min(10, g.shake + 14 * dt);
      const push = 46 * dt;
      g.world.slide(p, (p.x - this.x) / d * push, (p.y - this.y) / d * push);
      if (g.hurtSfxT <= 0) { SFX.hurt(); g.hurtSfxT = 0.55; }
    }
    if (A && !A.dead && Math.hypot(A.x - this.x, A.y - this.y) < this.r + A.r + 3) A.hurt(this.t.dmg * (this.dmgK || 1) * SETTINGS.mod.dmg * dt, g);
    this.lit = Math.max(0, this.lit - dt * 3);
  }
  /** 노릴 동료 — 0.4초마다 다시 고른다. 플레이어보다 10% 넘게 가깝고 320 안일 때만 */
  allyTarget(g, d, dt) {
    const L = g.allies;
    if (!L || !L.length || this.t.special || this.t.spit || this.t.tongue || this.t.leap || this.t.charge || this.t.bloat || this.t.boss) return null;
    if ((this.allyT = (this.allyT || 0) - dt) > 0) return this.ally && !this.ally.dead ? this.ally : null;
    this.allyT = 0.4; this.ally = null;
    let bd = Math.min(320, d * 0.9);
    for (const a of L) { if (a.dead) continue; const ad = Math.hypot(a.x - this.x, a.y - this.y); if (ad < bd) { bd = ad; this.ally = a; } }
    return this.ally;
  }
}

/* ── 총알 ──────────────────────────────────── */
class Bullet {
  constructor(x, y, ang, dmg, range, speed, pierce = 0, knock = 6) {
    this.x = x; this.y = y; this.px = x; this.py = y;
    this.knock = knock;
    this.vx = Math.cos(ang) * speed; this.vy = Math.sin(ang) * speed;
    this.ang = ang; this.dmg = dmg; this.left = range; this.dead = false;
    this.pierce = pierce;          // 더 꿰뚫을 수 있는 몸의 수
    this.struck = pierce ? new Set() : null;
  }
  update(dt, g) {
    const steps = 3;
    for (let s = 0; s < steps && !this.dead; s++) {
      this.px = this.x; this.py = this.y;
      const sx = this.vx * dt / steps, sy = this.vy * dt / steps;
      this.x += sx; this.y += sy;
      this.left -= Math.hypot(sx, sy);
      if (this.left <= 0) { this.dead = true; return; }
      if (g.world.solid(this.x, this.y)) {
        this.dead = true;
        g.hitProp(this.x, this.y);                            // 경보기 달린 차를 쏘면 울린다
        if (this.flame) return;                               // 불길은 벽에 닿으면 사그라든다
        g.spawnSparks(this.x, this.y, this.ang);
        SFX.hitWall(Math.hypot(this.x - g.player.x, this.y - g.player.y));
        return;
      }
      if (this.flame && Math.random() < 0.5) g.particles.push({ x: this.x, y: this.y, vx: this.vx * 0.1 + (Math.random() - 0.5) * 40, vy: this.vy * 0.1 + (Math.random() - 0.5) * 40, life: 0.32, max: 0.32, size: 3 + Math.random() * 3, col: Math.random() < 0.5 ? '#ffb040' : '#ff6a20', kind: 'spark' });
      for (const z of g.zombies) {
        if (z.dead) continue;
        if (this.struck && this.struck.has(z)) continue;
        if (Math.hypot(z.x - this.x, z.y - this.y) < z.r + (this.flame ? 9 : 3)) {
          if (this.burn) { z.burn = Math.max(z.burn || 0, this.burn); }
          z.hurt(this.dmg, this.ang, g, this.knock, this.flame ? 'fire' : this.ap ? 'ap' : '');
          if (!this.ally) {                                    // 동료의 탄은 내 명중률 · 명중 표시에 넣지 않는다
            if (!this.struck || this.struck.size === 0) g.hits++;   // 명중률은 탄 하나당 한 번
            g.onHit(z.dead);
          }
          SFX.hitFlesh(Math.hypot(this.x - g.player.x, this.y - g.player.y));
          if (this.pierce > 0) {
            // 꿰뚫을 때마다 힘이 빠진다
            this.pierce--; this.struck.add(z); this.dmg *= 0.72;
            continue;
          }
          this.dead = true; return;
        }
      }
      // 개미지옥의 입 — 입이나 치켜든 촉수에 맞으면 움츠린다
      if (g.maws && g.maws.length && window.LC_PITS && LC_PITS.shot(g, this.x, this.y, this.dmg)) {
        g.spawnBlood && g.spawnBlood(this.x, this.y, this.ang, 5);
        SFX.hitFlesh(Math.hypot(this.x - g.player.x, this.y - g.player.y));
        if (this.flame) continue;
        this.dead = true; return;
      }
    }
  }
}

/* ── 동료 (rc.31) ─────────────────────────────
   초록 신호탄에 닿으면 생존자 셋이 합류해 곁에서 싸운다(Left 4 Dead 의 봇처럼). 저마다 총 한 자루 · 탄은 끝없되
   탄창을 갈아 끼우는 틈이 있다. 쓰러지면 일어나지 않는다. 플레이어를 둘러싼 자리(뒤 · 옆)를 지키며 따라오고,
   손전등 없이도 보이는 가까운 감염체(460 안 · 시야)를 쏜다 */
const ALLY_KIT = [
  { name: ['민준', 'Minjun'], wpn: 'smg', top: '#4a5a3a', pants: '#2d3326', skin: '#c49a7c', hair: '#18140f', slot: 2.3 },
  { name: ['레나', 'Lena'], wpn: 'shotgun', top: '#6a3a30', pants: '#2a2a30', skin: '#e0b89a', hair: '#7a4a22', slot: -2.3 },
  { name: ['오코', 'Oko'], wpn: 'rifle', top: '#3a4a5e', pants: '#24282e', skin: '#7a5440', hair: '#0e0c0a', slot: Math.PI }
];
class Ally {
  constructor(x, y, i) {
    const k = ALLY_KIT[i % ALLY_KIT.length];
    this.kit = k; this.i = i; this.x = x; this.y = y; this.r = 11;
    this.hp = this.hpMax = 160; this.angle = Math.random() * 6.28; this.dead = false;
    this.wpn = k.wpn; this.magLeft = WEAPONS[k.wpn].mag; this.cool = 0.4 + i * 0.15; this.reloadT = 0;
    this.walkPhase = 0; this.stride = 0; this.meleeAnim = 0; this.target = null; this.scanT = 0; this.muzzle = 0; this.hurtFlash = 0;
  }
  get weapon() { return WEAPONS[this.wpn]; }
  get name() { return LT(this.kit.name); }
  hurt(dmg, g) {
    if (this.dead) return;
    this.hp -= dmg * 0.75; this.hurtFlash = 1;
    if (this.hp <= 0) {
      this.hp = 0; this.dead = true;
      if (g) { g.toast(T('{n}이(가) 쓰러졌다', { n: this.name }), 2.4); g.corpses.push({ x: this.x, y: this.y, a: this.angle + Math.PI, type: 'ally', age: 0, how: 'knees', push: 0, top: this.kit.top, pants: this.kit.pants, skin: this.kit.skin, hair: this.kit.hair }); SFX.death && SFX.death(); }
    }
  }
  update(dt, g) {
    if (this.dead) return;
    const p = g.player, w = g.world;
    this.cool = Math.max(0, this.cool - dt); this.muzzle = Math.max(0, this.muzzle - dt); this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3);
    if (this.reloadT > 0 && (this.reloadT -= dt) <= 0) this.magLeft = WEAPONS[this.wpn].mag;
    // 너무 떨어지면(1000 넘게) 곁으로 따라붙는다 — 길이 막혀 혼자 남지 않게
    if (Math.hypot(p.x - this.x, p.y - this.y) > 1000) { const q = w.pickPoint(p.x, p.y, 60, 160); this.x = q.x; this.y = q.y; }
    // 표적 — 0.2초마다 가까운 감염체를 고른다
    if ((this.scanT -= dt) <= 0) {
      this.scanT = 0.2; let best = null, bd = 460;
      for (const z of g.zombies) {
        if (z.dead || (z.t.weeper && !z.rage)) continue;     // 우는 것은 건드리지 않는다
        const d = Math.hypot(z.x - this.x, z.y - this.y);
        if (d < bd && w.los(this.x, this.y, z.x, z.y)) { bd = d; best = z; }
      }
      this.target = best;
    }
    const t = this.target && !this.target.dead ? this.target : null;
    // 자리 — 플레이어가 바라보는 쪽을 기준으로 뒤 · 옆. 싸울 때는 조금 더 붙는다
    const sa = p.angle + this.kit.slot, sd = t ? 58 : 74;
    const tx = p.x + Math.cos(sa) * sd, ty = p.y + Math.sin(sa) * sd;
    const dx = tx - this.x, dy = ty - this.y, dd = Math.hypot(dx, dy);
    let moved = 0;
    if (dd > 14) {
      const sp = (dd > 220 ? 230 : 165) * Math.min(1, dd / 60);
      const before = [this.x, this.y];
      w.slide(this, dx / dd * sp * dt, dy / dd * sp * dt);
      moved = Math.hypot(this.x - before[0], this.y - before[1]);
    }
    // 서로 · 플레이어와 겹치지 않게
    for (const o of [p, ...(g.allies || [])]) {
      if (o === this || o.dead) continue;
      const ox = this.x - o.x, oy = this.y - o.y, od = Math.hypot(ox, oy) || 1;
      if (od < 26) w.slide(this, ox / od * (26 - od) * 0.5, oy / od * (26 - od) * 0.5);
    }
    this.stride = Math.min(1, moved / Math.max(dt, 1e-3) / 160);
    this.walkPhase += moved * 0.09;
    const want = t ? Math.atan2(t.y - this.y, t.x - this.x) : (dd > 14 ? Math.atan2(dy, dx) : p.angle);
    const da = Math.atan2(Math.sin(want - this.angle), Math.cos(want - this.angle));
    this.angle += Math.max(-9 * dt, Math.min(9 * dt, da));
    if (!t || this.reloadT > 0 || this.cool > 0 || Math.abs(da) > 0.3) return;
    const W = WEAPONS[this.wpn];
    if (this.magLeft <= 0) { this.reloadT = W.reload * 1.3; return; }
    this.magLeft--; this.cool = W.rate * 1.35; this.muzzle = 0.06;
    const mx = this.x + Math.cos(this.angle) * 14, my = this.y + Math.sin(this.angle) * 14;
    for (let i = 0; i < W.pellets; i++) {
      const a = this.angle + (Math.random() - 0.5) * W.spread * 2.4;
      const b = new Bullet(mx, my, a, W.dmg * 0.7, W.range * 0.8, W.speed, W.pierce | 0, W.knock * 0.7);
      b.ally = true; g.bullets.push(b);
    }
    // 동료의 총성도 무리를 깨운다(소리는 플레이어 것보다 작게 친다)
    for (const z of g.zombies) if (!z.aggro && !z.t.weeper && Math.hypot(z.x - this.x, z.y - this.y) < 420) z.aggro = true;
    SFX.pan(this.x - p.x); (SFX[W.sfx] || SFX.shot).call(SFX); SFX.pan(0);
  }
}

/* ── 수류탄 ────────────────────────────────── */
class Grenade {
  constructor(x, y, ang, o) {
    const sp = (o && o.speed) || 400;
    this.x = x; this.y = y; this.r = 5;
    this.vx = Math.cos(ang) * sp; this.vy = Math.sin(ang) * sp;
    this.fuse = 1.35; this.dead = false; this.spin = 0;
    this.impact = !!(o && o.impact);                // 유탄 — 벽이나 감염체에 닿으면 바로 터진다
    if (this.impact) this.fuse = 1.6;
  }
  update(dt, g) {
    this.fuse -= dt; this.spin += dt * 14;
    if (this.impact) {
      const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
      const hitZ = g.zombies.some(z => !z.dead && Math.hypot(z.x - nx, z.y - ny) < z.r + 6);
      if (hitZ || g.world.hits(nx, ny, this.r) || this.fuse <= 0) { this.x = nx; this.y = ny; this.explode(g); this.dead = true; return; }
      this.x = nx; this.y = ny;
      return;
    }
    const drag = Math.pow(0.16, dt);
    this.vx *= drag; this.vy *= drag;
    if (!g.world.hits(this.x + this.vx * dt, this.y, this.r)) this.x += this.vx * dt;
    else this.vx *= -0.45;
    if (!g.world.hits(this.x, this.y + this.vy * dt, this.r)) this.y += this.vy * dt;
    else this.vy *= -0.45;
    if (this.fuse <= 0) { this.explode(g); this.dead = true; }
  }
  explode(g) {
    const R = 150;
    g.flashes.push({ x: this.x, y: this.y, t: 0, life: 0.5, r: R * 2.1, burst: Math.random() * 6.283 });
    if (g.buzz && Math.hypot(this.x - g.player.x, this.y - g.player.y) < 420) g.buzz(70);
    g.shake = 24;
    SFX.explode();
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * 6.283, sp = 90 + Math.random() * 440;
      g.particles.push({ x: this.x, y: this.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.3 + Math.random() * 0.5, max: 0.8, size: 1 + Math.random() * 3.4,
        col: i % 4 ? '#ffffff' : '#ffd9a0', kind: 'spark' });
    }
    // 원작 예고편의 수류탄 — 노랗고 흰 폭발 뒤로 회색 연기가 피어오른다
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * 6.283, sp = 20 + Math.random() * 70;
      g.particles.push({ x: this.x + Math.cos(a) * 14, y: this.y + Math.sin(a) * 14, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
        life: 1.1 + Math.random() * 0.9, max: 2, size: 12 + Math.random() * 12, col: '#6a6864', kind: 'smoke' });
    }
    if (g.splat) g.scorch && g.scorch(this.x, this.y);
    for (const z of g.zombies) {
      if (z.dead) continue;
      const d = Math.hypot(z.x - this.x, z.y - this.y);
      if (d > R || !g.world.los(this.x, this.y, z.x, z.y)) continue;
      z.hurt(200 * (1 - d / R) + 40, Math.atan2(z.y - this.y, z.x - this.x), g, 30 * (1 - d / R), 'blast');
    }
    if (g.maws && window.LC_PITS) for (const m of g.maws) {
      const d = Math.hypot(m.nx - this.x, m.ny - this.y);
      if (m.near && !(m.dormant > 0) && d < R + 20) LC_PITS.hurt(g, m, 220 * (1 - d / (R + 20)) + 60);
    }
    const pd = Math.hypot(g.player.x - this.x, g.player.y - this.y);
    if (pd < R * 0.75 && !g.player.dead) g.player.hurt(34 * (1 - pd / (R * 0.75)));
    g.alarmNear(this.x, this.y, R);                               // 폭발은 근처 차 경보를 울린다
  }
}

/* ── 보급품 / 무기 / 목표물 ────────────────── */
/** 뱉는 것의 산 덩이. 벽이나 플레이어에 닿으면 터져 웅덩이를 남긴다 */
/** 뱉은 산 — L4D 의 스피터처럼 '그 자리'로 포물선을 그리며 떨어진다.
    던질 때 서 있던 곳을 겨누므로 움직이면 피하고, 서 있으면 맞는다. 땅에는 떨어질 곳이 미리 표시된다.
    (예전엔 플레이어보다 두 배 빠른 직선탄이라 뒤로 물러나도 피할 수 없었다 — 후반 사망 원인 1위) */
class Spit {
  constructor(x, y, ang, sp, tx, ty) {
    this.x = this.x0 = x; this.y = this.y0 = y;
    const d0 = tx !== undefined ? Math.hypot(tx - x, ty - y) : sp.range;
    const d = Math.min(sp.range, Math.max(60, d0));
    this.tx = x + Math.cos(ang) * d; this.ty = y + Math.sin(ang) * d;
    this.dur = d / sp.speed;
    this.t = 0;
    this.h = 0;                                   // 그리기용 높이 (세계 px)
    this.vx = Math.cos(ang) * sp.speed;
    this.vy = Math.sin(ang) * sp.speed;
    this.sp = sp;
    this.phase = Math.random() * 6.28;
    this.dead = false;
  }
  burst(g) {
    if (this.dead) return;
    this.dead = true;
    const p = g.player;
    // 떨어진 자리에 아직 서 있었다면 직격
    if (!p.dead && Math.hypot(p.x - this.x, p.y - this.y) < p.r + 16) {
      p.hurt(this.sp.dmg * SETTINGS.mod.dmg);
      g.hitFrom(this.x0, this.y0, 'spit');
      SFX.hurt();
    }
    g.acids.push({ x: this.x, y: this.y, r: 34 + Math.random() * 8,
                   t: this.sp.pool, max: this.sp.pool, phase: Math.random() * 6.28 });
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * 6.283, v = 30 + Math.random() * 90;
      g.particles.push({ x: this.x, y: this.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
                         life: 0.3 + Math.random() * 0.3, t: 0, col: '#9ad14e', r: 1.6 });
    }
    SFX.spitHit(Math.hypot(this.x - g.player.x, this.y - g.player.y));
  }
  update(dt, g) {
    this.t += dt;
    this.phase += dt * 14;
    const k = Math.min(1, this.t / this.dur);
    const nx = this.x0 + (this.tx - this.x0) * k, ny = this.y0 + (this.ty - this.y0) * k;
    // 벽(건물)에 막히면 거기서 터진다 — 낮게 날 때만
    this.h = Math.sin(k * Math.PI) * Math.min(70, this.dur * 90);
    if (this.h < 24 && g.world.solid(nx, ny)) { this.burst(g); return; }
    this.x = nx; this.y = ny;
    if (k >= 1) this.burst(g);
  }
}

const PICKUPS = {
  ammo:        { label: 'SMG 탄약 +35',  col: '#d8c48a', icon: 'ammo' },
  shells:      { label: '산탄 +8',       col: '#c08a4a', icon: 'shell' },
  medkit:      { label: '구급킷 +40',    col: '#e05a4f', icon: 'med' },
  battery:     { label: '배터리 +55',    col: '#f0b429', icon: 'bat' },
  nade:        { label: '수류탄 +2',     col: '#7fa05a', icon: 'nade' },
  wpn_smg:     { label: 'SMG 획득',      col: '#9fb4c8', icon: 'gun' },
  wpn_shotgun: { label: '샷건 획득',     col: '#c8a878', icon: 'gun' },
  rounds:      { label: '소총탄 +10',    col: '#b9b08a', icon: 'round' },
  wpn_rifle:   { label: '소총 획득',     col: '#a8b89a', icon: 'gun' },
  wpn_magnum:  { label: '매그넘 획득',   col: '#c8c8d0', icon: 'gun' },
  wpn_auto:    { label: '자동 샷건 획득', col: '#c89868', icon: 'gun' },
  wpn_lmg:     { label: '경기관총 획득', col: '#9aa890', icon: 'gun' },
  wpn_crossbow:{ label: '석궁 획득',     col: '#b89a6a', icon: 'gun' },
  bolts:       { label: '화살 +6',       col: '#c8a878', icon: 'round' },
  goal:        { label: '보급 상자 확보', col: '#59b7d8', icon: 'goal' },
  note:        { label: '기록', col: '#e8e2d0', icon: 'note' },
  fuel:        { label: '연료통을 들었다', col: '#d0402e', icon: 'fuel' },   // 미션 변주 '연료 모으기' — 하나씩 날라 탈것에 넣는다
  gear:        { label: '장비', col: '#ffcf5a', icon: 'gear' },                  // 정예 · 그것이 떨어뜨리는 장비(rc.31)
  cache:       { label: '정예의 짐', col: '#ffcf5a', icon: 'cache' },           // 장비를 다 모았으면 대신 탄 · 수류탄 · 총
  stash:       { label: '지켜진 보급', col: '#ffcf5a', icon: 'cache' }          // rc.39 — 잠든 무리가 둘러선 곁길 보급. 깨우지 않고 가져갈 수 있을까
};

class Pickup {
  constructor(x, y, type) {
    this.x = x; this.y = y; this.type = type;
    this.p = PICKUPS[type]; this.bob = Math.random() * 6.283; this.dead = false;
  }
  update(dt, g) {
    this.bob += dt * 2.4;
    const p = g.player;
    if (Math.hypot(p.x - this.x, p.y - this.y) > 26) return;
    if (this.type === 'fuel') {                              // 한 번에 하나만 든다(이미 들고 있으면 그대로 둔다)
      if (p.carry) return;
      p.carry = 'fuel'; this.dead = true; SFX.pickup(); g.toast(T(this.p.label)); return;
    }
    this.dead = true;
    SFX.pickup();
    switch (this.type) {
      case 'ammo':    p.ammo.smg += Math.round(35 * PK.ammo); break;           // 결핍이 선택을 무겁게 한다 (RE)
      case 'shells':  p.ammo.shell += Math.round(8 * PK.ammo); break;
      case 'medkit':  p.hp = Math.min(p.hpMax, p.hp + 40 * PK.med); p.infect = 0; break;
      case 'battery': p.battery = Math.min(100, p.battery + 55);
                      if (!p.lightOn) p.lightOn = true; break;
      case 'nade':    p.nades += 2; break;
      case 'wpn_smg':     p.owned.add('smg');     p.ammo.smg += 60;  p.equip('smg'); break;
      case 'wpn_shotgun': p.owned.add('shotgun'); p.ammo.shell += 12; p.equip('shotgun'); break;
      case 'rounds':  p.ammo.rifle += Math.round(10 * PK.ammo); break;
      case 'bolts':   p.ammo.bolt += Math.round(6 * PK.ammo); break;
      case 'wpn_rifle':   p.owned.add('rifle');   p.ammo.rifle += 15; p.equip('rifle'); break;
      default:
        if (this.type.startsWith('wpn_')) {                  // 늘어난 칸의 무기 — 저마다의 탄을 조금 들고 온다
          const k = this.type.slice(4), w = WEAPONS[k];
          if (w) { p.owned.add(k); if (w.ammoKey) p.ammo[w.ammoKey] += w.pick || 0; p.equip(k); g.toast(T('{w} 획득', { w: T(w.name) })); return; }
        }
      case 'goal':    g.onGoalItem(); return;
      case 'note':    g.onRecord(this); return;
      case 'gear':    g.onGear(this); return;
      case 'cache':   g.onCache(this); return;
      case 'stash':   g.stashes = (g.stashes | 0) + 1; g.onCache(this); return;
    }
    g.toast(this.p.label);
  }
}
