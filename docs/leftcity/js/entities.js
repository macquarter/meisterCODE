/* ═══════════════════════════════════════════
   LEFT CITY — 남겨진 도시 : 엔티티
   ═══════════════════════════════════════════ */

const WEAPONS = {
  pistol:  { key: 'pistol',  name: '권총', slot: 1, rate: 0.40, dmg: 21, spread: 0.028,
             range: 540, speed: 1300, pellets: 1, ammoKey: null,   kick: 1.8, sfx: 'pistol', knock: 7,
             mag: 12, reload: 1.05 },
  smg:     { key: 'smg',     name: 'SMG',  slot: 2, rate: 0.085, dmg: 17, spread: 0.075,
             range: 620, speed: 1500, pellets: 1, ammoKey: 'smg',  kick: 2.2, sfx: 'shot', knock: 5,
             mag: 30, reload: 1.75 },
  shotgun: { key: 'shotgun', name: '샷건', slot: 3, rate: 0.74, dmg: 15, spread: 0.20,
             range: 430, speed: 1200, pellets: 8, ammoKey: 'shell', kick: 8, sfx: 'shotgun', knock: 11,
             mag: 6,  reload: 2.15 },
  // 소총 — 원작의 네 번째 무기. 느리지만 한 발이 줄 선 감염체 여럿을 꿰뚫는다
  rifle:   { key: 'rifle',   name: '소총', slot: 4, rate: 0.82, dmg: 92, spread: 0.004,
             range: 900, speed: 2300, pellets: 1, ammoKey: 'rifle', kick: 5.5, sfx: 'rifle', knock: 22,
             mag: 5,  reload: 2.35, pierce: 3 },
  // ── 늘어난 무기 칸 — 감염체가 떨어뜨리거나 보급 상자에서 나온다. 탄은 기존 탄을 나눠 쓴다(석궁만 화살) ──
  magnum:  { key: 'magnum',  name: '매그넘', slot: 5, rate: 0.55, dmg: 74, spread: 0.012,
             range: 720, speed: 1900, pellets: 1, ammoKey: 'rifle', kick: 4.6, sfx: 'magnum', knock: 16,
             mag: 6,  reload: 1.9, pierce: 1, pick: 12, ap: true },   // ap — 진압 방패를 뚫는다
  auto:    { key: 'auto',    name: '자동 샷건', slot: 6, rate: 0.27, dmg: 13, spread: 0.22,
             range: 400, speed: 1200, pellets: 7, ammoKey: 'shell', kick: 6.5, sfx: 'shotgun', knock: 9,
             mag: 10, reload: 2.8, pick: 16 },
  lmg:     { key: 'lmg',     name: '경기관총', slot: 7, rate: 0.07, dmg: 19, spread: 0.09,
             range: 680, speed: 1600, pellets: 1, ammoKey: 'smg', kick: 2.6, sfx: 'shot', knock: 6,
             mag: 75, reload: 3.6, pierce: 1, heavy: 0.86, pick: 110, ap: true },
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
      if (!w.ammoKey) { this.mag[k] = w.mag; continue; }
      const take = Math.min(w.mag, this.ammo[w.ammoKey]);
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
  reload(g, auto) {
    if (this.dead || this.reloadT > 0) return false;
    const w = this.weapon;
    if (this.magOf(w) >= w.mag) { if (!auto) SFX.click(); return false; }
    if (this.reserveOf(w) <= 0) {
      if (!auto) { SFX.dry(); if (g) g.toast('예비 탄약이 없다'); }
      return false;
    }
    this.reloadKey = w.key;
    this.reloadSpan = w.reload;
    this.reloadT = w.reload;
    SFX.reload();
    return true;
  }
  cancelReload() { this.reloadT = 0; this.reloadKey = null; }
  /** 주워서 즉시 손에 드는 경로 — 약실을 공짜로 채워 주지 않고 예비탄에서 당겨 온다 */
  equip(key) {
    this.cancelReload();
    this.wpn = key;
    const w = WEAPONS[key];
    const need = w.mag - this.magOf(w);
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
    const need = w.mag - this.magOf(w);
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
      this.stam = Math.max(0, this.stam - 24 * dt);
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
    const step = this.sprinting ? Player.NOISE_SPRINT : (moving && !this.dead ? Player.NOISE_WALK : 0);
    if (step > this.noise) this.noise = step;
    return this.sprinting;
  }

  /** 근접 밀치기 — 탄이 없거나 몰렸을 때의 마지막 수단 */
  melee(g) {
    if (this.dead || this.meleeCool > 0) return false;
    this.meleeCool = 0.58;
    this.meleeAnim = 0.32;                                   // 밀치기 — 몸을 실어 두 팔로 내지른다(예전 0.2초는 눈에 잘 안 띄었다)
    (g.shoves || (g.shoves = [])).push({ x: this.x, y: this.y, a: this.angle, t: 0, max: 0.34, hits: 0 });
    this.noise = Math.max(this.noise, 0.34);
    this.cancelReload();
    this.cool = Math.max(this.cool, 0.22);
    SFX.melee();
    let hits = 0, killed = false;
    for (const z of g.zombies) {
      if (z.dead) continue;
      const dx = z.x - this.x, dy = z.y - this.y;
      const d = Math.hypot(dx, dy);
      // 사방으로 — 몸을 크게 휘둘러 둘레 전부를 떼어 낸다. 등 뒤에서 껴안은 것도 밀린다(앞쪽이 조금 더 멀리)
      if (d > 46 + z.r) continue;
      const a = Math.atan2(dy, dx);
      const front = Math.cos(a - this.angle) > 0.3;
      z.hurt(front ? 24 : 18, a, g, 0, 'melee');
      if (z.dead) killed = true;
      if (!z.dead && !z.t.boss) {
        // 밀려나는 것이 눈에 보이게 — 순간이동 대신 0.28초 동안 미끄러지며(약 80) 뒤로 젖혀지고 팔을 허우적댄다
        const brute = z.type === 'brute' || z.type === 'charger';
        z.kbV = (brute ? 140 : 380) * (front ? 1 : 0.85); z.kbA = a; z.shoved = brute ? 0.3 : 0.6; z.shoveA = a;
        z.stagger = Math.max(z.stagger, brute ? 0.2 : 0.62);
        for (let i = 0; i < 5; i++) { const pa = a + Math.PI + (Math.random() - 0.5) * 1.6, sp = 40 + Math.random() * 60;
          g.particles.push({ x: z.x, y: z.y, vx: Math.cos(pa) * sp, vy: Math.sin(pa) * sp, life: 0.6, max: 0.6, size: 6 + Math.random() * 5, col: '#8a8478', kind: 'smoke' }); }
        (g.ripples || (g.ripples = [])).push({ x: z.x, y: z.y, t: 0, max: 0.35, r: 22, shove: true });
      }
      hits++;
    }
    const sh = g.shoves[g.shoves.length - 1]; if (sh) sh.hits = hits;
    if (hits) { SFX.meleeHit(0); g.shake = Math.min(18, g.shake + 7); g.onHit(killed); g.freezeT = Math.max(g.freezeT || 0, 0.055); if (g.buzz) g.buzz(25); }
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
    return 430 * low * (this.bile > 0 ? 0.7 : 1) * storm;       // 담즙에 눈이 흐려진다
  }

  hurt(dmg) {
    if (this.dead) return;
    this.hp -= dmg;
    this.dmgTaken += dmg;
    this.stress = (this.stress || 0) + dmg;                   // 연출가가 읽는 긴장도
    this.hurtFlash = Math.min(1, this.hurtFlash + dmg / 34);
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
      const spread = this.dark ? w.spread * 1.45 + 0.025 : w.spread;
      const a = base + (Math.random() - 0.5) * spread * 2;
      const b = new Bullet(mx, my, a, w.dmg, w.range * (0.85 + Math.random() * 0.3), w.speed, w.pierce | 0, w.knock);
      if (w.burn) { b.burn = w.burn; b.flame = true; }
      if (w.rail) b.rail = true;
      if (w.key === 'crossbow') b.bolt = true;
      if (w.ap || w.rail) b.ap = true;
      g.bullets.push(b);
    }
    if (w.rail && g.beam) g.beam(mx, my, base, w.range);
    this.muzzle = w.pellets > 1 ? 0.1 : w.flame ? 0.03 : 0.06;
    this.noise = w.silent ? 0.12 : 1;
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
      this.battery = Math.max(0, this.battery - (g.level.batteryDrain || 1.25) * SETTINGS.mod.battery * dt);
      this.offT = 0;
      if (this.battery === 0) { this.lightOn = false; g.toast(T('배터리 방전 — 꺼 두면 다시 충전된다')); }
    } else if (!this.lightOn && this.battery < 100) {
      // 꺼 두면 손잡이 발전기가 천천히 채운다 — 어둠 속에서 버티는 시간과 맞바꾼다(0.8초 뒤부터 초당 3.2)
      this.offT = (this.offT || 0) + dt;
      if (this.offT > 0.8) this.battery = Math.min(100, this.battery + 3.2 * dt);
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
      g.corpses.push({ x: this.x, y: this.y, a: ang, type: this.type, age: 0, how, push, hazmat: !!(this.look && this.look.hazmat), top: this.look && this.look.top, pants: this.look && this.look.pants });   // 맞은 방향으로 쓰러진다
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
      const nx = Math.cos(a) * speed * dt, ny = Math.sin(a) * speed * dt;
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
    if (this.t.weeper) { this.updateWeeper(dt, g, p, d, dx, dy); return; }

    // 감지: 소리 · 불빛 · 근접
    if (!this.aggro) {
      const heard = d < this.t.hear * (1 + p.noise * 1.6);
      if ((heard && g.world.los(this.x, this.y, p.x, p.y)) || this.lit > 0.1) {
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
    if (this.shoved > 0) this.shoved -= dt;
    if (this.kbV > 1) {                                   // 밀치기에 밀려 미끄러진다 — 빠르게 시작해 금세 멈춘다
      g.world.slide(this, Math.cos(this.kbA) * this.kbV * dt, Math.sin(this.kbA) * this.kbV * dt);
      this.kbV *= Math.pow(0.004, dt);
    }
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

    let speed, target;
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
      // 뱉는 것은 거리를 유지한다 — 너무 붙으면 물러난다
      target = Math.atan2(dy, dx);
      // 시야가 막혀 있으면 도로를 따라 돌아 들어온다 (시야 확인은 0.3초마다)
      this.losT = (this.losT || 0) - dt;
      if (this.losT <= 0) { this.losT = 0.25 + Math.random() * 0.1; this.seen = d < 70 || g.world.los(this.x, this.y, p.x, p.y); }
      if (!this.seen) { const fa = g.world.flowDir(this.x, this.y); if (fa !== null) target = fa; }
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
    if (d < this.r + p.r + 3 && !p.dead) {
      p.grabN = (p.grabN || 0) + (this.t.boss ? 0 : 1);
      // 여럿이 붙어도 피해는 덜 늘어난다 — 포위의 무서움은 피해보다 발이 묶이는 데서 온다
      p.hurt(this.t.dmg * SETTINGS.mod.dmg * dt / (1 + 0.3 * Math.max(0, (p.grabbed || 0) - 1)));
      g.hitFrom(this.x, this.y, this.type);
      g.shake = Math.min(10, g.shake + 14 * dt);
      const push = 46 * dt;
      g.world.slide(p, (p.x - this.x) / d * push, (p.y - this.y) / d * push);
      if (g.hurtSfxT <= 0) { SFX.hurt(); g.hurtSfxT = 0.55; }
    }
    this.lit = Math.max(0, this.lit - dt * 3);
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
          if (!this.struck || this.struck.size === 0) g.hits++;   // 명중률은 탄 하나당 한 번
          g.onHit(z.dead);
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
  fuel:        { label: '연료통을 들었다', col: '#d0402e', icon: 'fuel' }   // 미션 변주 '연료 모으기' — 하나씩 날라 탈것에 넣는다
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
      case 'ammo':    p.ammo.smg += 35; break;           // 결핍이 선택을 무겁게 한다 (RE)
      case 'shells':  p.ammo.shell += 8; break;
      case 'medkit':  p.hp = Math.min(p.hpMax, p.hp + 40); break;
      case 'battery': p.battery = Math.min(100, p.battery + 55);
                      if (!p.lightOn) p.lightOn = true; break;
      case 'nade':    p.nades += 2; break;
      case 'wpn_smg':     p.owned.add('smg');     p.ammo.smg += 60;  p.equip('smg'); break;
      case 'wpn_shotgun': p.owned.add('shotgun'); p.ammo.shell += 12; p.equip('shotgun'); break;
      case 'rounds':  p.ammo.rifle += 10; break;
      case 'bolts':   p.ammo.bolt += 6; break;
      case 'wpn_rifle':   p.owned.add('rifle');   p.ammo.rifle += 15; p.equip('rifle'); break;
      default:
        if (this.type.startsWith('wpn_')) {                  // 늘어난 칸의 무기 — 저마다의 탄을 조금 들고 온다
          const k = this.type.slice(4), w = WEAPONS[k];
          if (w) { p.owned.add(k); if (w.ammoKey) p.ammo[w.ammoKey] += w.pick || 0; p.equip(k); g.toast(T('{w} 획득', { w: T(w.name) })); return; }
        }
      case 'goal':    g.onGoalItem(); return;
      case 'note':    g.onRecord(this); return;
    }
    g.toast(this.p.label);
  }
}
