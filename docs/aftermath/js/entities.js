/* ═══════════════════════════════════════════
   AFTERMATH — 잔존 : 엔티티
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
             mag: 5,  reload: 2.35, pierce: 3 }
};
const SLOT_ORDER = ['pistol', 'smg', 'shotgun', 'rifle'];

const ZTYPES = {
  walker: { hp: 62,  speed: 47,  dmg: 17, r: 13, size: 12, hear: 330, score: 10,
            body: '#4b5548', head: '#6d7466' },
  runner: { hp: 38,  speed: 112, dmg: 12, r: 11, size: 10, hear: 480, score: 18,
            body: '#5a4740', head: '#7d6455' },
  brute:  { hp: 300, speed: 41,  dmg: 36, r: 20, size: 19, hear: 300, score: 60,
            body: '#3f4a52', head: '#5b6a72' },
  // 기어다니는 것 — 바닥에 붙어 웅크렸다 튀어나온다. 약하지만 작고 빠르다
  crawler: { hp: 30, speed: 124, dmg: 11, r: 9,  size: 8,  hear: 300, score: 16,
             body: '#55483c', head: '#766251', crawl: true },
  // 뱉는 것 — 거리를 두고 산을 뱉는다. 물러서는 것만으로는 안전하지 않다
  spitter: { hp: 74, speed: 46, dmg: 9, r: 14, size: 13, hear: 540, score: 38,
             body: '#44513f', head: '#6d7f52',
             spit: { range: 310, hold: 215, cool: 2.8, speed: 340, dmg: 15, pool: 4.5 } },
  // 우는 것 — 길가에 웅크려 운다. 불빛을 오래 비추거나, 가까이 가거나, 뛰거나, 곁에서 쏘면 깨어나
  // 끝까지 쫓아온다 (L4D 의 마녀). 무리처럼 생기지 않고 판마다 정해진 자리에 놓인다
  weeper: { hp: 280, speed: 250, dmg: 46, r: 12, size: 11, hear: 0, score: 120,
            body: '#b9b4ab', head: '#d8d3c9', weeper: true, special: true },
  // 부푼 것 — 느리게 다가와 붙으면 터진다. 가까이서 터지면 담즙을 뒤집어쓰고 무리가 몰려온다 (L4D 의 부머)
  bloater: { hp: 44, speed: 44, dmg: 0, r: 17, size: 17, hear: 300, score: 30,
             body: '#5f6b46', head: '#7d8a5a', bloat: true },
  // 그것 — 마지막 다리를 막아선 개체. 한 마리뿐이고, 죽어야 길이 열린다
  behemoth: { hp: 1500, speed: 40, dmg: 44, r: 24, size: 26, hear: 1600, score: 500,
              body: '#2f3a42', head: '#4a5a64', boss: true,
              charge: { wind: 0.85, dash: 1.15, cool: 4.2, mul: 3.4, min: 190, max: 700, dmg: 42 },
              roar: { cool: 9, spawn: 3, kind: 'crawler' } }
};

/* ── 플레이어 ──────────────────────────────── */
class Player {
  constructor(x, y, level) {
    this.x = x; this.y = y; this.r = 12;
    this.angle = -Math.PI / 2;
    this.hp = this.hpMax = 100;
    this.owned = new Set(level.own);
    this.ammo = { smg: level.startAmmo.smg | 0, shell: level.startAmmo.shell | 0, rifle: level.startAmmo.rifle | 0 };
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
    this.meleeAnim = 0.2;
    this.noise = Math.max(this.noise, 0.34);
    this.cancelReload();
    this.cool = Math.max(this.cool, 0.22);
    SFX.melee();
    let hits = 0, killed = false;
    for (const z of g.zombies) {
      if (z.dead) continue;
      const dx = z.x - this.x, dy = z.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 42 + z.r) continue;
      const a = Math.atan2(dy, dx);
      let da = a - this.angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > 1.0) continue;
      z.hurt(24, a, g);
      if (z.dead) killed = true;
      if (!z.dead && !z.t.boss) {
        const brute = z.type === 'brute';
        g.world.slide(z, Math.cos(a) * (brute ? 22 : 56), Math.sin(a) * (brute ? 22 : 56));
        z.stagger = Math.max(z.stagger, brute ? 0.14 : 0.44);
      }
      hits++;
    }
    if (hits) { SFX.meleeHit(0); g.shake = Math.min(14, g.shake + 3.6); g.onHit(killed); }
    return true;
  }

  select(key, g) {
    if (!this.owned.has(key) || this.wpn === key) return;
    this.cancelReload();
    this.wpn = key;
    SFX.click();
    if (g) g.toast(`${WEAPONS[key].name} 장착`);
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

  get lightRange() {
    if (!this.lightOn || this.battery <= 0) return 0;
    const low = this.battery < 22 ? 0.72 + Math.random() * 0.28 : 1;  // 저전력 깜빡임
    return 430 * low * (this.bile > 0 ? 0.7 : 1);       // 담즙에 눈이 흐려진다
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
    this.cool = w.rate;
    this.mag[w.key] = this.magOf(w) - 1;
    g.shots += w.pellets;
    for (let i = 0; i < w.pellets; i++) {
      const a = base + (Math.random() - 0.5) * w.spread * 2;
      g.bullets.push(new Bullet(
        this.x + Math.cos(base) * 14,
        this.y + Math.sin(base) * 14,
        a, w.dmg, w.range * (0.85 + Math.random() * 0.3), w.speed, w.pierce | 0, w.knock));
    }
    this.muzzle = w.pellets > 1 ? 0.1 : 0.06;
    this.noise = 1;
    g.shake = Math.min(14, g.shake + w.kick);
    g.recoil(base, w.kick);                                   // 카메라가 반동 방향으로 튄다
    g.ejectCasing(this.x, this.y, base, w.key);               // 탄피는 바닥에 남는다
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
      if (this.battery === 0) g.toast('배터리 방전 — 시야를 잃었다');
    }
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

  hurt(dmg, ang, g, knock = 0) {
    this.hp -= dmg;
    this.aggro = true;
    if (this.t.weeper && !this.rage && this.hp > 0) this.enrage(g);
    this.flash = 0.07;                                        // 맞은 순간 하얗게
    if (this.type !== 'brute' && !this.t.boss) this.stagger = 0.09;
    // 넉백 — 맞은 방향으로 밀린다. 덩치는 덜 밀린다
    if (knock) {
      const k = knock * (this.t.boss ? 0.08 : this.type === 'brute' ? 0.3 : 1);
      g.world.slide(this, Math.cos(ang) * k, Math.sin(ang) * k);
    }
    g.spawnBlood(this.x, this.y, ang, this.type === 'brute' ? 10 : 6);
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      g.corpses.push({ x: this.x, y: this.y, a: ang, type: this.type, age: 0 });   // 맞은 방향으로 쓰러진다
      g.spawnBlood(this.x, this.y, ang, 16);
      g.onKill(this);
      if (this.t.bloat) g.bloaterBurst(this);
      SFX.zombieDie(Math.hypot(this.x - g.player.x, this.y - g.player.y));
    }
  }

  /** 벽 회피: 목표 각도에서 조금씩 벌려가며 통과 가능한 방향을 찾는다. 움직였으면 true */
  steerMove(target, speed, dt, g) {
    this.steerHold -= dt;
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

  update(dt, g) {
    const p = g.player;
    const dx = p.x - this.x, dy = p.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    if (this.flash > 0) this.flash -= dt;
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

    if (this.stagger > 0) { this.stagger -= dt; return; }

    // ── 그것: 포효로 무리를 부르고, 직선으로 돌진한다 ──
    if (this.t.boss && this.aggro) {
      const rr = this.t.roar, ch = this.t.charge;

      this.roarT -= dt;
      if (this.roarT <= 0) {
        this.roarT = rr.cool;
        SFX.roar(d);
        g.shake = Math.min(18, g.shake + 7);
        for (const o of g.zombies) if (o !== this) o.aggro = true;   // 전부 깨운다
        g.summon(this, rr.kind, rr.spawn);
        g.toast('포효 — 무리가 몰려온다');
      }

      if (this.chargePhase === 'wind') {
        this.chargeT -= dt;
        this.face = Math.atan2(dy, dx);
        this.chargeDir = this.face;
        if (this.chargeT <= 0) { this.chargePhase = 'dash'; this.chargeT = ch.dash; SFX.charge(d); }
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
          this.stagger = 1.1; g.shake = Math.min(22, g.shake + 14);
          SFX.slam(d);
          return;
        }
        this.x += nx; this.y += ny;
        if (!p.dead && Math.hypot(p.x - this.x, p.y - this.y) < this.r + p.r + 4) {
          p.hurt(ch.dmg * SETTINGS.mod.dmg);
          g.hitFrom(this.x, this.y);
          g.world.slide(p, Math.cos(this.chargeDir) * 54, Math.sin(this.chargeDir) * 54);
          g.shake = Math.min(24, g.shake + 16);
          SFX.hurt();
          this.chargePhase = ''; this.chargeT = ch.cool;
        }
        if (this.chargeT <= 0) { this.chargePhase = ''; this.chargeT = ch.cool; }
        this.phase += dt * 12;
        return;
      }
      this.chargeT -= dt;
      if (this.chargeT <= 0 && d > ch.min && d < ch.max && g.world.los(this.x, this.y, p.x, p.y)) {
        this.chargePhase = 'wind'; this.chargeT = ch.wind;
        SFX.growl(d);
      }
    }

    // 뱉는 것: 사거리 안이고 시야가 트였으면 멈춰서 산을 뱉는다
    const sp = this.t.spit;
    if (sp && this.aggro) {
      this.spitT -= dt;
      if (d < sp.range && this.spitT <= 0 && g.world.los(this.x, this.y, p.x, p.y)) {
        this.spitT = sp.cool * (0.85 + Math.random() * 0.3);
        const a = Math.atan2(dy, dx);
        g.spits.push(new Spit(this.x + Math.cos(a) * 16, this.y + Math.sin(a) * 16, a, sp));
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
      if (sp) {
        if (d < sp.hold * 0.75) { target += Math.PI; speed *= 0.8; }
        else if (d < sp.hold) speed = 0;
      }
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
      g.hitFrom(this.x, this.y);
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
        g.spawnSparks(this.x, this.y, this.ang);
        SFX.hitWall(Math.hypot(this.x - g.player.x, this.y - g.player.y));
        return;
      }
      for (const z of g.zombies) {
        if (z.dead) continue;
        if (this.struck && this.struck.has(z)) continue;
        if (Math.hypot(z.x - this.x, z.y - this.y) < z.r + 3) {
          z.hurt(this.dmg, this.ang, g, this.knock);
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
    }
  }
}

/* ── 수류탄 ────────────────────────────────── */
class Grenade {
  constructor(x, y, ang) {
    const sp = 400;
    this.x = x; this.y = y; this.r = 5;
    this.vx = Math.cos(ang) * sp; this.vy = Math.sin(ang) * sp;
    this.fuse = 1.35; this.dead = false; this.spin = 0;
  }
  update(dt, g) {
    this.fuse -= dt; this.spin += dt * 14;
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
    g.flashes.push({ x: this.x, y: this.y, t: 0, life: 0.5, r: R * 2.1 });
    if (g.buzz && Math.hypot(this.x - g.player.x, this.y - g.player.y) < 420) g.buzz(70);
    g.shake = 24;
    SFX.explode();
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * 6.283, sp = 90 + Math.random() * 440;
      g.particles.push({ x: this.x, y: this.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.3 + Math.random() * 0.5, max: 0.8, size: 1 + Math.random() * 3.4,
        col: i % 4 ? '#ffffff' : '#ffd9a0', kind: 'spark' });
    }
    for (const z of g.zombies) {
      if (z.dead) continue;
      const d = Math.hypot(z.x - this.x, z.y - this.y);
      if (d > R || !g.world.los(this.x, this.y, z.x, z.y)) continue;
      z.hurt(200 * (1 - d / R) + 40, Math.atan2(z.y - this.y, z.x - this.x), g, 30 * (1 - d / R));
    }
    const pd = Math.hypot(g.player.x - this.x, g.player.y - this.y);
    if (pd < R * 0.75 && !g.player.dead) g.player.hurt(34 * (1 - pd / (R * 0.75)));
    g.alarmNear(this.x, this.y, R);                               // 폭발은 근처 차 경보를 울린다
  }
}

/* ── 보급품 / 무기 / 목표물 ────────────────── */
/** 뱉는 것의 산 덩이. 벽이나 플레이어에 닿으면 터져 웅덩이를 남긴다 */
class Spit {
  constructor(x, y, ang, sp) {
    this.x = x; this.y = y;
    this.vx = Math.cos(ang) * sp.speed;
    this.vy = Math.sin(ang) * sp.speed;
    this.sp = sp;
    this.life = sp.range / sp.speed + 0.25;
    this.phase = Math.random() * 6.28;
    this.dead = false;
  }
  burst(g) {
    if (this.dead) return;
    this.dead = true;
    g.acids.push({ x: this.x, y: this.y, r: 44 + Math.random() * 10,
                   t: this.sp.pool, max: this.sp.pool, phase: Math.random() * 6.28 });
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * 6.283, v = 30 + Math.random() * 90;
      g.particles.push({ x: this.x, y: this.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
                         life: 0.3 + Math.random() * 0.3, t: 0, col: '#9ad14e', r: 1.6 });
    }
    SFX.spitHit(Math.hypot(this.x - g.player.x, this.y - g.player.y));
  }
  update(dt, g) {
    this.life -= dt;
    this.phase += dt * 14;
    if (this.life <= 0) { this.burst(g); return; }
    const steps = 2;
    for (let i = 0; i < steps; i++) {
      this.x += this.vx * dt / steps;
      this.y += this.vy * dt / steps;
      if (g.world.solid(this.x, this.y)) { this.burst(g); return; }
      const p = g.player;
      if (!p.dead && Math.hypot(p.x - this.x, p.y - this.y) < p.r + 5) {
        p.hurt(this.sp.dmg * SETTINGS.mod.dmg);
        g.hitFrom(this.x, this.y);
        SFX.hurt();
        this.burst(g);
        return;
      }
    }
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
  goal:        { label: '보급 상자 확보', col: '#59b7d8', icon: 'goal' }
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
      case 'wpn_rifle':   p.owned.add('rifle');   p.ammo.rifle += 15; p.equip('rifle'); break;
      case 'goal':    g.onGoalItem(); return;
    }
    g.toast(this.p.label);
  }
}
