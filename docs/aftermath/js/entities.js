/* ═══════════════════════════════════════════
   AFTERMATH — 잔존 : 엔티티
   ═══════════════════════════════════════════ */

const WEAPONS = {
  pistol:  { key: 'pistol',  name: '권총', slot: 1, rate: 0.40, dmg: 21, spread: 0.028,
             range: 540, speed: 1300, pellets: 1, ammoKey: null,   kick: 1.8, sfx: 'pistol' },
  smg:     { key: 'smg',     name: 'SMG',  slot: 2, rate: 0.085, dmg: 17, spread: 0.075,
             range: 620, speed: 1500, pellets: 1, ammoKey: 'smg',  kick: 2.2, sfx: 'shot' },
  shotgun: { key: 'shotgun', name: '샷건', slot: 3, rate: 0.74, dmg: 15, spread: 0.20,
             range: 430, speed: 1200, pellets: 8, ammoKey: 'shell', kick: 8, sfx: 'shotgun' }
};
const SLOT_ORDER = ['pistol', 'smg', 'shotgun'];

const ZTYPES = {
  walker: { hp: 62,  speed: 47,  dmg: 17, r: 13, size: 12, hear: 330, score: 10,
            body: '#4b5548', head: '#6d7466' },
  runner: { hp: 38,  speed: 112, dmg: 12, r: 11, size: 10, hear: 480, score: 18,
            body: '#5a4740', head: '#7d6455' },
  brute:  { hp: 300, speed: 41,  dmg: 36, r: 20, size: 19, hear: 300, score: 60,
            body: '#3f4a52', head: '#5b6a72' }
};

/* ── 플레이어 ──────────────────────────────── */
class Player {
  constructor(x, y, level) {
    this.x = x; this.y = y; this.r = 12;
    this.angle = -Math.PI / 2;
    this.hp = this.hpMax = 100;
    this.owned = new Set(level.own);
    this.ammo = { smg: level.startAmmo.smg | 0, shell: level.startAmmo.shell | 0 };
    this.wpn = this.owned.has('smg') && this.ammo.smg > 0 ? 'smg' : 'pistol';
    this.nades = level.startNades;
    this.battery = 100;
    this.lightOn = true;
    this.cool = 0; this.nadeCool = 0;
    this.hurtFlash = 0; this.muzzle = 0;
    this.walkPhase = 0; this.sprinting = false;
    this.noise = 0;              // 최근 총성 — 좀비를 부른다
    this.dead = false;
  }

  /** 탄이 떨어진 총은 자동으로 권총으로 되돌아간다 */
  get weapon() {
    const w = WEAPONS[this.wpn];
    if (w.ammoKey && this.ammo[w.ammoKey] <= 0) return WEAPONS.pistol;
    return w;
  }
  ammoOf(w) { return w.ammoKey ? this.ammo[w.ammoKey] : Infinity; }

  select(key, g) {
    if (!this.owned.has(key) || this.wpn === key) return;
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
      if (!w.ammoKey || this.ammo[w.ammoKey] > 0) { this.select(k, g); return; }
    }
  }

  get lightRange() {
    if (!this.lightOn || this.battery <= 0) return 0;
    const low = this.battery < 22 ? 0.72 + Math.random() * 0.28 : 1;  // 저전력 깜빡임
    return 430 * low;
  }

  hurt(dmg) {
    if (this.dead) return;
    this.hp -= dmg;
    this.hurtFlash = Math.min(1, this.hurtFlash + dmg / 34);
    if (this.hp <= 0) { this.hp = 0; this.dead = true; SFX.death(); }
  }

  fire(g) {
    if (this.cool > 0 || this.dead) return false;
    const w = this.weapon;
    this.cool = w.rate;
    for (let i = 0; i < w.pellets; i++) {
      const a = this.angle + (Math.random() - 0.5) * w.spread * 2;
      g.bullets.push(new Bullet(
        this.x + Math.cos(this.angle) * 14,
        this.y + Math.sin(this.angle) * 14,
        a, w.dmg, w.range * (0.85 + Math.random() * 0.3), w.speed));
    }
    if (w.ammoKey) this.ammo[w.ammoKey] = Math.max(0, this.ammo[w.ammoKey] - 1);
    this.muzzle = w.pellets > 1 ? 0.1 : 0.06;
    this.noise = 1;
    g.shake = Math.min(14, g.shake + w.kick);
    SFX[w.sfx]();
    return true;
  }

  throwNade(g) {
    if (this.nades <= 0 || this.nadeCool > 0 || this.dead) return;
    this.nades--; this.nadeCool = 0.7;
    g.grenades.push(new Grenade(
      this.x + Math.cos(this.angle) * 16,
      this.y + Math.sin(this.angle) * 16,
      this.angle));
    SFX.nadeThrow();
  }

  update(dt, g) {
    this.cool = Math.max(0, this.cool - dt);
    this.nadeCool = Math.max(0, this.nadeCool - dt);
    this.muzzle = Math.max(0, this.muzzle - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.4);
    this.noise = Math.max(0, this.noise - dt * 1.4);
    if (this.lightOn && this.battery > 0) {
      this.battery = Math.max(0, this.battery - (g.level.batteryDrain || 1.25) * dt);
      if (this.battery === 0) g.toast('배터리 방전 — 시야를 잃었다');
    }
  }
}

/* ── 좀비 ──────────────────────────────────── */
class Zombie {
  constructor(x, y, type) {
    const t = ZTYPES[type];
    this.type = type; this.t = t;
    this.x = x; this.y = y; this.r = t.r;
    this.hp = t.hp; this.hpMax = t.hp;
    this.face = Math.random() * Math.PI * 2;
    this.aggro = false;
    this.steer = 0; this.steerHold = 0;
    this.wanderDir = Math.random() * Math.PI * 2;
    this.wanderT = 1 + Math.random() * 3;
    this.phase = Math.random() * 6.28;
    this.growlT = 1 + Math.random() * 6;
    this.stagger = 0;
    this.lit = 0;
    this.dead = false;
  }

  hurt(dmg, ang, g) {
    this.hp -= dmg;
    this.aggro = true;
    if (this.type !== 'brute') this.stagger = 0.09;
    g.spawnBlood(this.x, this.y, ang, this.type === 'brute' ? 10 : 6);
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      g.corpses.push({ x: this.x, y: this.y, a: this.face, type: this.type, age: 0 });
      g.spawnBlood(this.x, this.y, ang, 16);
      g.onKill(this);
      SFX.zombieDie(Math.hypot(this.x - g.player.x, this.y - g.player.y));
    }
  }

  update(dt, g) {
    const p = g.player;
    const dx = p.x - this.x, dy = p.y - this.y;
    const d = Math.hypot(dx, dy) || 1;

    // 감지: 소리 · 불빛 · 근접
    if (!this.aggro) {
      const heard = d < this.t.hear * (1 + p.noise * 1.6);
      if ((heard && g.world.los(this.x, this.y, p.x, p.y)) || this.lit > 0.1) {
        this.aggro = true;
        if (this.type === 'runner') SFX.screech(d); else SFX.growl(d);
      }
    }

    this.growlT -= dt;
    if (this.growlT <= 0) {
      this.growlT = this.aggro ? 2 + Math.random() * 3 : 5 + Math.random() * 9;
      if (d < 760) SFX.growl(d);
    }

    if (this.stagger > 0) { this.stagger -= dt; return; }

    let speed, target;
    if (this.aggro) {
      speed = this.t.speed * (this.type === 'runner'
        ? (0.9 + Math.sin(g.time * 3 + this.phase) * 0.12) : 1);
      target = Math.atan2(dy, dx);
    } else {
      this.wanderT -= dt;
      if (this.wanderT <= 0) { this.wanderT = 2 + Math.random() * 4; this.wanderDir = Math.random() * 6.283; }
      speed = this.t.speed * 0.28;
      target = this.wanderDir;
    }

    // 벽 회피: 목표 각도에서 조금씩 벌려가며 통과 가능한 방향을 찾는다
    this.steerHold -= dt;
    const offsets = this.steerHold > 0
      ? [this.steer, 0, 0.55, -0.55, 1.1, -1.1, 1.7, -1.7, 2.5, -2.5]
      : [0, 0.55, -0.55, 1.1, -1.1, 1.7, -1.7, 2.5, -2.5];
    let moved = false;
    for (const off of offsets) {
      const a = target + off;
      const nx = Math.cos(a) * speed * dt, ny = Math.sin(a) * speed * dt;
      if (!g.world.hits(this.x + nx, this.y + ny, this.r)) {
        this.x += nx; this.y += ny; this.face = a;
        if (off !== 0) { this.steer = off; this.steerHold = 0.5; }
        moved = true; break;
      }
    }
    if (!moved) this.wanderT = 0;
    this.phase += dt * (this.aggro ? 9 : 3);

    // 접촉 공격
    if (d < this.r + p.r + 3 && !p.dead) {
      p.hurt(this.t.dmg * dt);
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
  constructor(x, y, ang, dmg, range, speed) {
    this.x = x; this.y = y; this.px = x; this.py = y;
    this.vx = Math.cos(ang) * speed; this.vy = Math.sin(ang) * speed;
    this.ang = ang; this.dmg = dmg; this.left = range; this.dead = false;
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
        g.spawnSparks(this.x, this.y, this.ang);
        SFX.hitWall(Math.hypot(this.x - g.player.x, this.y - g.player.y));
        return;
      }
      for (const z of g.zombies) {
        if (z.dead) continue;
        if (Math.hypot(z.x - this.x, z.y - this.y) < z.r + 3) {
          z.hurt(this.dmg, this.ang, g);
          SFX.hitFlesh(Math.hypot(this.x - g.player.x, this.y - g.player.y));
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
      z.hurt(200 * (1 - d / R) + 40, Math.atan2(z.y - this.y, z.x - this.x), g);
    }
    const pd = Math.hypot(g.player.x - this.x, g.player.y - this.y);
    if (pd < R * 0.75 && !g.player.dead) g.player.hurt(34 * (1 - pd / (R * 0.75)));
  }
}

/* ── 보급품 / 무기 / 목표물 ────────────────── */
const PICKUPS = {
  ammo:        { label: 'SMG 탄약 +50',  col: '#d8c48a', icon: 'ammo' },
  shells:      { label: '산탄 +8',       col: '#c08a4a', icon: 'shell' },
  medkit:      { label: '구급킷 +40',    col: '#e05a4f', icon: 'med' },
  battery:     { label: '배터리 +55',    col: '#f0b429', icon: 'bat' },
  nade:        { label: '수류탄 +2',     col: '#7fa05a', icon: 'nade' },
  wpn_smg:     { label: 'SMG 획득',      col: '#9fb4c8', icon: 'gun' },
  wpn_shotgun: { label: '샷건 획득',     col: '#c8a878', icon: 'gun' },
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
      case 'ammo':    p.ammo.smg += 50; break;
      case 'shells':  p.ammo.shell += 8; break;
      case 'medkit':  p.hp = Math.min(p.hpMax, p.hp + 40); break;
      case 'battery': p.battery = Math.min(100, p.battery + 55);
                      if (!p.lightOn) p.lightOn = true; break;
      case 'nade':    p.nades += 2; break;
      case 'wpn_smg':     p.owned.add('smg');     p.ammo.smg += 60;  p.wpn = 'smg'; break;
      case 'wpn_shotgun': p.owned.add('shotgun'); p.ammo.shell += 12; p.wpn = 'shotgun'; break;
      case 'goal':    g.onGoalItem(); return;
    }
    g.toast(this.p.label);
  }
}
