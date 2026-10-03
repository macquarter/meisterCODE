'use strict';
/* ═══════════ 모형 ═══════════
   60° 로 기울인 카메라에서 서 있는 사람·감염체·탈것을 입체로 그린다.

   좌표: 앞(x) · 옆(y) · 위(z), 단위는 세계 px. 화면으로는
     X = x,  Y = y·sin60 − z·cos60
   (호출하는 쪽이 cam 만큼 옮긴 '화면 공간' 변환을 걸어 둔다 — 원이 찌그러지지 않는다).

   인형은 공(관절·몸통·머리)과 막대(팔다리)로 짜고, 카메라에서 먼 것부터 칠한다.
   카메라는 남쪽 위에서 북쪽을 내려다보므로 '가까움' = 0.5·y + 0.866·z.
   공은 그늘 → 바탕 → 하이라이트 세 번 칠해 둥글게, 막대는 그늘 위에 밝은 줄을 얹는다. */
const MODELS = (() => {
  const TL = Math.sin(Math.PI / 3), UP = Math.cos(Math.PI / 3);

  /* ── 색 ── */
  const rgbC = new Map(), toneC = new Map();
  function rgb(hex) {
    let v = rgbC.get(hex);
    if (!v) { const n = parseInt(hex.slice(1), 16); v = [n >> 16 & 255, n >> 8 & 255, n & 255]; rgbC.set(hex, v); }
    return v;
  }
  /** f<1 어둡게, f>1 흰빛 쪽으로 */
  function tone(hex, f) {
    const key = hex + f;
    let s = toneC.get(key);
    if (s) return s;
    const [r, g, b] = rgb(hex);
    const m = f <= 1 ? c => Math.round(c * f) : c => Math.round(c + (255 - c) * (f - 1));
    s = `rgb(${m(r)},${m(g)},${m(b)})`;
    toneC.set(key, s);
    return s;
  }

  /* ── 인형 뼈대 ── */
  class Rig {
    constructor(x, y, face, S = 1) {
      this.x = x; this.y = y; this.c = Math.cos(face); this.s = Math.sin(face); this.S = S;
      this.parts = [];
    }
    pt(fx, fy, fz) {
      const S = this.S, wx = this.x + (fx * this.c - fy * this.s) * S, wy = this.y + (fx * this.s + fy * this.c) * S;
      return [wx, wy * TL - fz * S * UP, wy * 0.5 + fz * S * 0.866];
    }
    ball(fx, fy, fz, r, col, hl = true) {
      const p = this.pt(fx, fy, fz);
      this.parts.push({ t: 0, X: p[0], Y: p[1], k: p[2], r: r * this.S, col, hl });
    }
    limb(a, b, r, col) {
      const p = this.pt(a[0], a[1], a[2]), q = this.pt(b[0], b[1], b[2]);
      this.parts.push({ t: 1, X: p[0], Y: p[1], X2: q[0], Y2: q[1], k: (p[2] + q[2]) / 2, r: r * this.S, col });
    }
    /** 팔다리 두 마디 + 끝 공 */
    chain(a, b, c, r1, r2, c1, c2, end, endCol) {
      this.limb(a, b, r1, c1); this.limb(b, c, r2, c2);
      if (end) this.ball(c[0], c[1], c[2], end, endCol || c2, false);
    }
    draw(ctx, over) {
      const P = this.parts.sort((a, b) => a.k - b.k);
      ctx.lineCap = 'round';
      if (api.lod) {
        // 많이 보일 때 — 그늘 층을 빼고 한 번씩만 칠한다
        for (const q of P) {
          const col = over || q.col;
          if (q.t === 0) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(q.X, q.Y, q.r, 0, 6.283); ctx.fill(); }
          else { ctx.strokeStyle = col; ctx.lineWidth = q.r * 2; ctx.beginPath(); ctx.moveTo(q.X, q.Y); ctx.lineTo(q.X2, q.Y2); ctx.stroke(); }
        }
        return;
      }
      for (const q of P) {
        const col = over || q.col;
        if (q.t === 0) {
          ctx.fillStyle = tone(col, 0.58);
          ctx.beginPath(); ctx.arc(q.X, q.Y, q.r, 0, 6.283); ctx.fill();
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(q.X - q.r * 0.12, q.Y - q.r * 0.17, q.r * 0.8, 0, 6.283); ctx.fill();
          if (q.hl && q.r > 2.4) {
            ctx.fillStyle = tone(col, 1.22);
            ctx.beginPath(); ctx.arc(q.X - q.r * 0.3, q.Y - q.r * 0.4, q.r * 0.36, 0, 6.283); ctx.fill();
          }
        } else {
          ctx.strokeStyle = tone(col, 0.58); ctx.lineWidth = q.r * 2;
          ctx.beginPath(); ctx.moveTo(q.X, q.Y); ctx.lineTo(q.X2, q.Y2); ctx.stroke();
          ctx.strokeStyle = col; ctx.lineWidth = q.r * 1.25;
          const o = q.r * 0.3;
          ctx.beginPath(); ctx.moveTo(q.X - o * 0.4, q.Y - o); ctx.lineTo(q.X2 - o * 0.4, q.Y2 - o); ctx.stroke();
        }
      }
    }
  }

  function shadow(ctx, x, y, rx, a = 0.4) {
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.beginPath(); ctx.ellipse(x, y * TL, rx, rx * 0.55, 0, 0, 6.283); ctx.fill();
  }

  /* ── 사람 꼴 ──
     o: x y face S ph(걸음 위상) amp(보폭 0‒1.3) lean(앞으로 숙임) arms('gun'|'reach'|'swing'|'hang'|'claw')
        skin top pants hair shoes bulk(어깨 너비 배수) sway head:{dx,dz,r} extra(rig, bob) */
  function humanRig(o) {
    const R = new Rig(o.x, o.y, o.face, o.S || 1);
    const s = Math.sin(o.ph || 0), c = Math.cos(o.ph || 0), amp = o.amp || 0, L = o.lean || 0;
    const B = o.bulk || 1, bob = Math.abs(c) * 0.8 * amp, sw = o.sway || 0;
    const sk = o.skin, top = o.top, pn = o.pants, sh = o.shoes || '#16181b';
    // 다리 — 한쪽이 앞으로 갈 때 반대쪽은 뒤로, 앞으로 가는 발이 들린다
    for (const sd of [-1, 1]) {
      if (o.noLeg === sd) continue;
      const ps = sd * s, fx = ps * 6 * amp, fz = Math.max(0, sd * c) * 2.6 * amp;
      const hip = [L * 0.1, sd * 2.5 * B, 12.5 + bob];
      const knee = [fx * 0.5 + 1.4 + amp * 0.4, sd * 2.6 * B, 6.6 + fz * 0.6];
      const ank = [fx, sd * 2.7 * B, 1.3 + fz];
      R.chain(hip, knee, ank, 2.05 * B, 1.75 * B, pn, pn);
      R.ball(fx + 1.2, sd * 2.7 * B, 0.9 + fz, 1.55, sh, false);
    }
    // 몸통
    R.ball(L * 0.25, 0, 13.2 + bob, 3.6 * B, pn);
    R.ball(L * 0.55, 0, 16.4 + bob, 3.9 * B, top);
    R.ball(L, 0, 19.8 + bob, 4.5 * B, top);
    for (const sd of [-1, 1]) R.ball(L, sd * 3.9 * B, 21 + bob, 2.5 * B, top, false);
    // 머리 — 머리카락이 정수리와 뒤통수를 덮는다
    const hd = o.head || {};
    const hx = L * 1.2 + 0.8 + (hd.dx || 0), hy = hd.dy || 0, hz = 25 + bob + (hd.dz || 0), hr = hd.r || 3.3;
    R.ball(hx, hy, hz, hr, sk);
    if (o.hair) R.ball(hx - 1.3, hy, hz + 0.6, hr * 0.9, o.hair, false);
    if (o.hood) {                                     // 방호복 두건과 어두운 보안경
      R.ball(hx - 0.6, hy, hz + 0.4, hr * 1.12, o.hood, false);
      R.ball(hx + hr * 0.75, hy, hz - 0.2, hr * 0.55, '#1c2a30', false);
    }
    // 팔
    const S1 = 21 + bob, arms = o.arms || 'hang';
    for (const sd of [-1, 1]) {
      if (o.noArm === sd) continue;
      const shd = [L, sd * 4.2 * B, S1];
      let el, hn;
      if (arms === 'gun') {
        const m = o.melee || 0;
        el = sd > 0 ? [L + 3.5 + m * 3, 4.6, 17.4] : [L + 5 + m * 4, -4.4, 18.4];
        hn = sd > 0 ? [L + 8 + m * 7, 1.4, 19] : [L + 11 + m * 7, -0.4, 19.5];
      } else if (arms === 'reach') {
        const k = sd * sw;
        el = [L + 6, sd * 4.6 * B, S1 + k * 0.4];
        hn = [L + 12.5, sd * 3.6 * B, S1 + 0.4 + k];
      } else if (arms === 'swing') {
        const a = -sd * s * Math.min(1, amp);
        el = [L + a * 4, sd * 4.9 * B, 16.8];
        hn = [L + a * 7.5 + 2.5, sd * 4.2 * B, 15 + Math.abs(a) * 2.5];
      } else if (arms === 'claw') {
        const k = sd * sw;
        el = [L + 7, sd * 5.6 * B, S1 - 1 + k * 0.3];
        hn = [L + 15, sd * 5 * B, S1 - 2 + k];
      } else {   // hang
        const a = sd * s * 1.6 * amp;
        el = [L + 1 + a * 0.4, sd * 5.2 * B, 15.8];
        hn = [L + 2 + a, sd * 5.4 * B, o.knuckle ? 1.5 : 11];
      }
      R.chain(shd, el, hn, 1.6 * B, 1.4 * B, o.sleeve || top, o.fore || sk, 1.35 * B, sk);
      if (arms === 'claw') for (const d of [-1, 0, 1])
        R.limb(hn, [hn[0] + 4.5, hn[1] + d * 1.3, hn[2] - 0.6], 0.45, '#2a2420');
    }
    if (o.extra) o.extra(R, bob, L);
    return R;
  }

  /* ── 감염체의 생김새 — 개체마다 옷과 피부가 다르다 ── */
  const SHIRTS = ['#6b6e6a', '#4a5560', '#7a6a55', '#5a3a36', '#8a8678', '#3b4a3a', '#5d5a70', '#9a958a', '#3d3f4a', '#6a4a3a'];
  const PANTS = ['#2d3440', '#3b3a33', '#4a4234', '#24282e', '#3f4a5a', '#2f2a26'];
  const SKINS = ['#7d8a73', '#8a8f7c', '#9a9484', '#6f7d6a', '#8c8a78'];
  const HAIRS = ['#1a1714', '#2e2620', '#4a4038', '#121212', null];
  function lookOf(z) {
    if (z.look) return z.look;
    const r = () => Math.random();
    const pick = a => a[(r() * a.length) | 0];
    z.look = {
      top: pick(SHIRTS), pants: pick(PANTS), skin: pick(SKINS), hair: pick(HAIRS),
      blood: r() < 0.55, tilt: (r() - 0.5) * 2.4,
      noLeg: z.type === 'crawler' && r() < 0.5 ? (r() < 0.5 ? -1 : 1) : 0,
      // 대피 요원이었던 것들 — 흰 방호복 (원작 트레일러 0:25 의 흰 옷 무리)
      hazmat: (z.type === 'walker' || z.type === 'runner') && r() < 0.14
    };
    if (z.look.hazmat) { z.look.top = '#d9d7cc'; z.look.pants = '#cfcdc2'; z.look.hair = null; }
    return z.look;
  }
  const blood = (R, x, z, r) => R.ball(x, 0.8, z, r, '#4a1512', false);

  function zombie(ctx, z, over) {
    const t = z.t, k = lookOf(z), ph = z.phase, sway = Math.sin(ph) * (z.aggro ? 3 : 1.4);
    const amp = z.aggro ? 1 : 0.55;
    let R;
    if (t.weeper && !z.rage) {
      // 무릎을 끌어안고 웅크린 형체 — 흐느낄 때마다 어깨가 들썩인다
      shadow(ctx, z.x, z.y, 12);
      R = new Rig(z.x, z.y, z.face, 1.1);
      const sob = Math.max(0, Math.sin(ph * 3)) * (0.6 + (z.startle || 0) * 1.6);
      const dress = t.body, sk = t.head, hair = '#121212';
      R.ball(-2.5, 0, 3.8, 4.2, dress);
      for (const sd of [-1, 1]) {
        R.limb([-1, sd * 2.4, 3.5], [4, sd * 2.6, 8.6], 2, sk);
        R.limb([4, sd * 2.6, 8.6], [6.5, sd * 2.4, 1.2], 1.7, sk);
        R.ball(4, sd * 2.6, 8.6, 2.2, sk, false);
      }
      R.ball(0, 0, 9.5 + sob, 4.6, dress);
      for (const sd of [-1, 1]) R.chain([0.6, sd * 4, 12 + sob], [3.6, sd * 4.4, 9.8], [5.6, sd * 1.2, 9.2], 1.4, 1.2, dress, sk, 1.1, sk);
      R.ball(3, 0, 13 + sob, 3.3, sk);
      R.ball(2.4, 0, 14.2 + sob, 3.6, hair, false);
      R.ball(4.6, -1.4, 10.6 + sob, 2.3, hair, false);
      R.ball(4.6, 1.4, 10.6 + sob, 2.3, hair, false);
      R.draw(ctx, over);
      return;
    }
    if (t.crawl) {
      // 바닥에 엎드려 팔로 끌고 온다. 다리 하나가 없는 개체도 있다
      shadow(ctx, z.x, z.y, 14, 0.36);
      R = new Rig(z.x, z.y, z.face, 1.1);
      const s = Math.sin(ph), reach = z.lunging ? 4 : 0;
      R.ball(-6, 0, 3.2, 3.5, k.pants);
      R.ball(-1.5, 0, 4, 3.9, k.top);
      R.ball(3, 0, 4.8, 4.3, k.top);
      if (k.blood) blood(R, 2, 7.6, 1.8);
      for (const sd of [-1, 1]) {
        const a = sd * s;
        R.chain([3.4, sd * 4, 5.6], [7.5 + a * 2.5 + reach * 0.5, sd * 6.6, 4.6], [11.5 + a * 3.5 + reach, sd * 5.4, 0.9], 1.5, 1.3, k.top, k.skin, 1.3, k.skin);
        if (k.noLeg === sd) { R.ball(-8.5, sd * 2.2, 2.4, 2.2, '#4a1512', false); continue; }
        R.chain([-7, sd * 2.2, 3], [-12, sd * 3 + a * 0.6, 1.8], [-17, sd * 3.4 - a, 1.2], 1.9, 1.6, k.pants, k.pants, 1.4, '#16181b');
      }
      R.ball(7.4, 0, 6.6, 3.1, k.skin);
      if (k.hair) R.ball(6.7, 0, 7.4, 2.9, k.hair, false);
      R.draw(ctx, over);
      return;
    }
    let o;
    if (t.boss) {
      // 그것 — 굽은 등과 땅을 짚는 비대한 팔. 돌진 선딜엔 몸이 부푼다
      const puff = z.chargePhase === 'wind' ? 1 + Math.sin(ph * 2) * 0.05 : 1;
      o = { S: 2.35 * puff, lean: 6, arms: 'hang', knuckle: true, bulk: 1.45, amp: 0.7,
            skin: t.head, top: t.body, pants: '#23292e', sleeve: t.head, head: { r: 2.7, dz: -2.2, dx: 1 },
            extra(R2, bob, L) {
              for (let i = 0; i < 4; i++) R2.ball(L * (0.2 + i * 0.25) - 2.6, 0, 15 + i * 2 + bob, 1.6, '#1c2328', false);
              R2.ball(L + 1, -3.2, 18 + bob, 2.4, '#4a1512', false);
            } };
      shadow(ctx, z.x, z.y, t.size * 1.25, 0.45);
    } else if (t.bloat) {
      const pulse = 1 + Math.sin(ph * 0.8) * 0.05;
      o = { S: 1.25, lean: 0.5, arms: 'hang', bulk: 1.15, amp: 0.45, skin: t.head, top: k.top, pants: k.pants,
            head: { r: 2.7, dz: 0.4 }, hair: null, sleeve: t.head,
            extra(R2, bob) {
              R2.ball(1.8, 0, 15.5 + bob, 7.6 * pulse, t.body);
              for (const [bx, by, bz, br] of [[6.5, -3, 18, 1.8], [7.2, 2.6, 13.5, 2.2], [4, 5, 19.5, 1.5], [5.5, -4.5, 12.5, 1.4]])
                R2.ball(bx * pulse, by * pulse, bz + bob, br, '#b7c96a', false);
            } };
      shadow(ctx, z.x, z.y, 15);
    } else if (t.weeper) {
      o = { S: 1.08, lean: 6, arms: 'claw', amp: 1.25, sway, skin: t.head, top: t.body, pants: t.body, sleeve: t.head,
            hair: '#121212', head: { dz: -1 },
            extra(R2, bob, L) { R2.ball(L * 1.1 - 1.2, 0, 21.5 + bob, 3.2, '#121212', false); } };
      shadow(ctx, z.x, z.y, 11);
    } else if (t.scream) {
      // 비명 지르는 것 — 마르고 길다. 들이켤 때 고개를 젖히고 팔을 벌리며, 입이 붉게 벌어진다
      const wind = z.screamPhase === 'wind', open = wind ? 1 - Math.max(0, z.windT) / t.scream.wind : 0;
      o = { S: 1.12, lean: wind ? -2.5 : 3.2, arms: wind ? 'claw' : 'swing', amp: wind ? 0.15 : amp, skin: t.head, top: t.body, pants: k.pants, hair: '#1a1714',
            head: { dz: wind ? 1.4 : -0.4, dx: wind ? -1.2 : 0 },
            extra(R2, bob, L) {
              R2.ball(L + 2.6, 0, 22 + bob + (wind ? 1.4 : 0), 1 + open * 1.6, '#5a0e0c', false);   // 벌어진 입
              for (const sd of [-1, 1]) R2.ball(L - 1, sd * 2.6, 17.5 + bob, 1.2, '#3a2a28', false);     // 드러난 갈비
            } };
      shadow(ctx, z.x, z.y, 11);
    } else if (t.spit) {
      const pulse = 0.85 + Math.sin(ph * 1.4) * 0.15, hot = z.spitT < 0.5;
      o = { S: 1.18, lean: 1, arms: 'hang', amp, skin: k.skin, top: k.top, pants: k.pants, hair: k.hair,
            head: { dx: -1.4, dz: 0.8 },
            extra(R2, bob, L) {
              R2.ball(L + 3, 0, 20.5 + bob, 3.5 * pulse, hot ? '#9ad14e' : '#6f9a34');
              R2.ball(L - 2.4, 0, 19 + bob, 3.2 * pulse, '#5a7a2a', false);
            } };
      shadow(ctx, z.x, z.y, 12);
    } else if (t.size >= 18) {   // brute
      o = { S: 1.75, lean: 2.2, arms: 'hang', bulk: 1.3, amp, skin: k.skin, top: '#3b3f3a', pants: k.pants,
            sleeve: k.skin, head: { r: 2.9, dz: -0.6 }, hair: null,
            extra(R2, bob, L) { if (k.blood) blood(R2, L + 4.3, 18 + bob, 1.6); } };
      shadow(ctx, z.x, z.y, t.size);
    } else if (t.speed > 100) {   // runner
      o = { S: 1.06, lean: 5, arms: 'swing', amp: z.aggro ? 1.3 : 0.6, skin: k.skin, top: k.top, pants: k.pants, hair: k.hair,
            head: { dy: k.tilt * 0.3 },
            extra(R2, bob, L) { if (k.blood) blood(R2, L + 4.3, 19 + bob, 1.4); } };
      shadow(ctx, z.x, z.y, 10);
    } else {   // walker
      o = { S: 1.14, lean: 2.6, arms: 'reach', amp: amp * 0.85, sway, skin: k.skin, top: k.top, pants: k.pants, hair: k.hair,
            head: { dy: k.tilt, dz: -0.6 },
            extra(R2, bob, L) { if (k.blood) blood(R2, L + 4.4, 19.5 + bob, 1.5); } };
      shadow(ctx, z.x, z.y, 11);
    }
    if (k.hazmat && !t.boss && !t.bloat && !t.spit && !t.scream && t.size < 18) { o.hood = '#e2e0d6'; o.sleeve = k.top; }
    o.x = z.x; o.y = z.y; o.face = z.face; o.ph = ph; o.sway = o.sway ?? sway;
    R = humanRig(o);
    R.draw(ctx, over);
  }

  /** 생존자 — 어두운 재킷, 배낭, 두 손으로 든 총과 총열 아래 손전등 */
  function player(ctx, p, over) {
    shadow(ctx, p.x, p.y, 11);
    const melee = p.meleeAnim > 0 ? Math.sin((1 - p.meleeAnim / 0.2) * Math.PI) : 0;
    const R = humanRig({
      x: p.x, y: p.y, face: p.angle, S: 1.12, ph: p.walkPhase, amp: p.stride || 0, lean: 1.2, arms: 'gun', melee,
      skin: '#c9a184', top: p.hurtFlash > 0.05 ? '#7a3e3a' : '#2f3a44', pants: '#262b31', hair: '#1d1a17', shoes: '#121416',
      sleeve: '#2f3a44', fore: '#2f3a44',
      extra(R2, bob, L) {
        R2.ball(L - 3.8, 0, 19 + bob, 3.4, '#3b3428');               // 배낭
        R2.ball(L - 3.4, 0, 22.4 + bob, 2.2, '#4a4234', false);
        const m = melee * 7;
        R2.limb([L + 6.5 + m, 0.6, 19.6], [L + 19 + m, 0.2, 20.2], 1.25, '#15181c');
        R2.ball(L + 19.5 + m, 0.2, 19.2, 1.35, '#f4e2a8', false);
      }
    });
    R.draw(ctx, over);
  }

  /** 쓰러진 몸 — 맞은 방향으로 팔다리를 벌리고 엎어진다 */
  function corpse(ctx, c) {
    if (!c.look) {
      const r = () => Math.random();
      c.look = { top: SHIRTS[(r() * SHIRTS.length) | 0], pants: PANTS[(r() * PANTS.length) | 0],
                 skin: c.type === 'player' ? '#a8866e' : SKINS[(r() * SKINS.length) | 0],
                 a1: (r() - 0.5) * 1.2, a2: (r() - 0.5) * 1.2, l1: (r() - 0.5) * 0.8, l2: (r() - 0.5) * 0.8 };
      if (c.type === 'player') { c.look.top = '#2f3a44'; c.look.pants = '#262b31'; }
      if (c.hazmat) { c.look.top = '#d9d7cc'; c.look.pants = '#cfcdc2'; }
    }
    // 쓰러진 몸은 움직이지 않는다 — 한 번 그려 둔 그림을 옮겨 찍는다 (시체 40구에서도 프레임이 버틴다)
    if (!c.img) {
      const S0 = c.type === 'brute' ? 1.6 : c.type === 'behemoth' ? 2.3 : c.type === 'bloater' ? 1.3 : 1.1;
      const half = Math.ceil(26 * S0), dpr = Math.min(4, window.AFT_SCALE || window.devicePixelRatio || 1);
      const cv = document.createElement('canvas');
      cv.width = cv.height = half * 2 * dpr;
      const cx = cv.getContext('2d');
      cx.setTransform(dpr, 0, 0, dpr, half * dpr, half * dpr);
      corpseBody(cx, c, S0);
      c.img = cv; c.half = half;
    }
    ctx.drawImage(c.img, c.x - c.half, c.y * TL - c.half, c.half * 2, c.half * 2);
  }
  function corpseBody(ctx, c, S) {
    const k = c.look;
    ctx.fillStyle = 'rgba(70,12,10,.55)';
    ctx.beginPath(); ctx.ellipse(-Math.cos(c.a) * 3, -Math.sin(c.a) * 3 * TL, 16 * S, 10 * S, 0, 0, 6.283); ctx.fill();
    const R = new Rig(0, 0, c.a, S);
    R.ball(-5, 0, 1.6, 3.4, k.pants, false);
    R.ball(0, 0, 2, 4.2, k.top, false);
    R.ball(5, 0, 2, 4.4, k.top, false);
    R.ball(10, 0.5, 1.8, 3.1, k.skin, false);
    R.chain([5, -4, 2], [8 + k.a1 * 4, -8, 1], [10 + k.a1 * 7, -11, 0.8], 1.5, 1.3, k.top, k.skin, 1.2);
    R.chain([5, 4, 2], [6 + k.a2 * 4, 8.5, 1], [3 + k.a2 * 8, 12, 0.8], 1.5, 1.3, k.top, k.skin, 1.2);
    R.chain([-6, -2.4, 1.6], [-12, -3.5 + k.l1 * 3, 1.2], [-18, -4 + k.l1 * 6, 1], 1.9, 1.6, k.pants, k.pants, 1.4, '#16181b');
    R.chain([-6, 2.4, 1.6], [-12, 4 + k.l2 * 3, 1.2], [-17, 5.5 + k.l2 * 6, 1], 1.9, 1.6, k.pants, k.pants, 1.4, '#16181b');
    R.draw(ctx);
  }

  /* ── 상자 꼴 (탈것·화물) ──
     지역 좌표 직사각형 [x0,x1]×[y0,y1] 를 z0→z1 로 세운다. 카메라 쪽(남쪽)을 보는 옆면과 윗면만 칠한다.
     deco(ctx, at, n, i): 보이는 옆면마다 불린다. at(u, v) = 면 위의 점(u: 모서리 따라 0‒1, v: 아래→위 0‒1) */
  function box(ctx, x, y, a, x0, x1, y0, y1, z0, z1, top, side, deco) {
    const c = Math.cos(a), s = Math.sin(a);
    const W = (lx, ly) => [x + lx * c - ly * s, y + lx * s + ly * c];
    const P = [W(x0, y0), W(x1, y0), W(x1, y1), W(x0, y1)];
    const N = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // 각 모서리의 바깥 방향(지역)
    for (let i = 0; i < 4; i++) {
      const ny = N[i][0] * s + N[i][1] * c, nx = N[i][0] * c - N[i][1] * s;
      if (ny <= 0.02) continue;
      const A = P[i], B = P[(i + 1) % 4];
      const at = (u, v) => { const wx = A[0] + (B[0] - A[0]) * u, wy = A[1] + (B[1] - A[1]) * u, wz = z0 + (z1 - z0) * v; return [wx, wy * TL - wz * UP]; };
      const f = 0.5 + 0.2 * ny - 0.1 * nx;
      ctx.fillStyle = tone(side, Math.max(0.3, f));
      const q0 = at(0, 0), q1 = at(1, 0), q2 = at(1, 1), q3 = at(0, 1);
      ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.lineTo(q2[0], q2[1]); ctx.lineTo(q3[0], q3[1]); ctx.closePath(); ctx.fill();
      if (deco) deco(ctx, at, i, ny);
    }
    ctx.fillStyle = top;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) { const X = P[i][0], Y = P[i][1] * TL - z1 * UP; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
    ctx.closePath(); ctx.fill();
    return (lx, ly, lz) => { const p = W(lx, ly); return [p[0], p[1] * TL - lz * UP]; };
  }
  /** 면 위의 사각 조각 (창문 등) */
  function patch(ctx, at, u0, u1, v0, v1, col) {
    const a = at(u0, v0), b = at(u1, v0), d = at(u1, v1), e = at(u0, v1);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(d[0], d[1]); ctx.lineTo(e[0], e[1]); ctx.closePath(); ctx.fill();
  }
  function quad(ctx, pts, col) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath(); ctx.fill();
  }
  function wheels(ctx, pr, xs, hy, r) {
    const c = Math.cos(pr.a), s = Math.sin(pr.a);
    ctx.fillStyle = '#0b0c0e';
    for (const lx of xs) for (const sy of [-1, 1]) {
      const wx = pr.x + lx * c - sy * hy * s, wy = pr.y + lx * s + sy * hy * c;
      ctx.beginPath(); ctx.ellipse(wx, wy * TL - r * UP, r * 0.9, r, 0, 0, 6.283); ctx.fill();
    }
  }
  const hash = (x, y) => (((x * 73856093) ^ (y * 19349663)) >>> 0);
  const GLASS = '#18212b';

  /** 버려진 승용차 — 차체, 유리 실내, 앞뒤 유리, 전조등·후미등. 몇 대는 앞유리가 깨졌다 */
  function car(ctx, pr) {
    const hx = pr.w / 2, hy = pr.h / 2, col = pr.col, h = hash(pr.x | 0, pr.y | 0);
    const cracked = h % 4 === 0;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    shadowRect(ctx, pr, hx + 2, hy + 2);
    wheels(ctx, pr, [-hx * 0.62, hx * 0.62], hy * 0.9, 4);
    const at = box(ctx, pr.x, pr.y, pr.a, -hx, hx, -hy, hy, 3.5, 11, col, col, (c2, f, i) => {
      if (i === 1) { patch(c2, f, 0.08, 0.3, 0.45, 0.8, '#d8d2b8'); patch(c2, f, 0.7, 0.92, 0.45, 0.8, '#d8d2b8'); }       // 전조등
      else if (i === 3) { patch(c2, f, 0.06, 0.26, 0.5, 0.8, '#7a1a16'); patch(c2, f, 0.74, 0.94, 0.5, 0.8, '#7a1a16'); } // 후미등
      else { patch(c2, f, 0, 1, 0.3, 0.38, 'rgba(0,0,0,.25)'); patch(c2, f, 0.5, 0.52, 0.38, 1, 'rgba(0,0,0,.3)'); }      // 몰딩 · 문틈
    });
    const cx0 = -hx * 0.5, cx1 = hx * 0.16, cy = hy * 0.84, zr = 18.5;
    box(ctx, pr.x, pr.y, pr.a, cx0, cx1, -cy, cy, 11, zr, tone(col, 1.06), GLASS, (c2, f, i) => {
      if (i === 0 || i === 2) { patch(c2, f, 0.47, 0.53, 0, 1, tone(col, 0.7)); patch(c2, f, 0, 1, 0.78, 0.9, 'rgba(160,190,220,.12)'); }
    });
    // 앞유리 · 뒷유리 — 기울어진 면
    const ws = [at(cx1, -cy, zr), at(cx1, cy, zr), at(hx * 0.5, cy * 0.96, 11), at(hx * 0.5, -cy * 0.96, 11)];
    quad(ctx, ws, GLASS);
    if (cracked) {
      ctx.strokeStyle = 'rgba(200,215,230,.35)'; ctx.lineWidth = 0.7;
      const m = at(hx * 0.34, cy * 0.2, 14.5);
      ctx.beginPath();
      for (let k = 0; k < 6; k++) { const a2 = k * 1.05 + (h & 7) * 0.2; ctx.moveTo(m[0], m[1]); ctx.lineTo(m[0] + Math.cos(a2) * 5, m[1] + Math.sin(a2) * 3); }
      ctx.stroke();
    } else quad(ctx, [ws[0], ws[1], at(hx * 0.28, cy * 0.5, 16.5), at(hx * 0.28, -cy * 0.2, 16.5)], 'rgba(170,200,230,.13)');
    quad(ctx, [at(cx0, -cy, zr), at(cx0, cy, zr), at(-hx * 0.8, cy * 0.96, 11), at(-hx * 0.8, -cy * 0.96, 11)], GLASS);
    // 지붕 하이라이트와 사이드미러
    quad(ctx, [at(cx0 + 2, -cy + 1.5, zr), at(cx1 - 2, -cy + 1.5, zr), at(cx1 - 2, -cy + 3.5, zr), at(cx0 + 2, -cy + 3.5, zr)], 'rgba(255,255,255,.10)');
    ctx.fillStyle = tone(col, 0.7);
    for (const sy of [-1, 1]) { const m = at(cx1 + 1.5, sy * (hy + 1.6), 12.5); ctx.fillRect(m[0] - 1.4, m[1] - 1, 2.8, 2); }
  }

  function shadowRect(ctx, pr, hx, hy) {
    const c = Math.cos(pr.a), s = Math.sin(pr.a);
    ctx.beginPath();
    for (const [lx, ly] of [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]]) {
      const wx = pr.x + lx * c - ly * s + 2, wy = pr.y + lx * s + ly * c + 3;
      ctx.lineTo(wx, wy * TL);
    }
    ctx.closePath(); ctx.fill();
  }

  /** 버스 — 창문 띠, 앞유리, 지붕 냉방기 */
  function bus(ctx, pr) {
    const hx = pr.w / 2, hy = pr.h / 2, col = pr.col;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    shadowRect(ctx, pr, hx + 2, hy + 2);
    wheels(ctx, pr, [-hx * 0.62, hx * 0.6], hy * 0.92, 5);
    const at = box(ctx, pr.x, pr.y, pr.a, -hx, hx, -hy, hy, 3, 30, tone(col, 1.05), col, (c2, f, i) => {
      if (i === 0 || i === 2) {
        patch(c2, f, 0.03, 0.97, 0.52, 0.88, GLASS);
        for (let u = 0.03; u < 0.97; u += 0.135) patch(c2, f, u, u + 0.016, 0.52, 0.88, tone(col, 0.8));
        patch(c2, f, 0.03, 0.97, 0.82, 0.88, 'rgba(160,190,220,.10)');
        patch(c2, f, 0, 1, 0.2, 0.27, 'rgba(0,0,0,.22)');
      } else if (i === 1) {
        patch(c2, f, 0.06, 0.94, 0.42, 0.92, GLASS);
        patch(c2, f, 0.08, 0.22, 0.12, 0.24, '#d8d2b8'); patch(c2, f, 0.78, 0.92, 0.12, 0.24, '#d8d2b8');
        patch(c2, f, 0.25, 0.75, 0.94, 1, '#c9a24a');                 // 행선지 표시
      } else {
        patch(c2, f, 0.08, 0.92, 0.5, 0.86, GLASS);
        patch(c2, f, 0.06, 0.18, 0.15, 0.3, '#7a1a16'); patch(c2, f, 0.82, 0.94, 0.15, 0.3, '#7a1a16');
      }
    });
    quad(ctx, [at(-hx * 0.5, -hy * 0.55, 30), at(hx * 0.1, -hy * 0.55, 30), at(hx * 0.1, hy * 0.55, 30), at(-hx * 0.5, hy * 0.55, 30)], tone(col, 0.82));
    box(ctx, pr.x, pr.y, pr.a, -hx * 0.42, -hx * 0.05, -hy * 0.45, hy * 0.45, 30, 33, '#8a9096', '#6a7076');
  }

  /** 화물 컨테이너 — 골판 */
  function container(ctx, pr) {
    const hx = pr.w / 2, hy = pr.h / 2, col = pr.col;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    shadowRect(ctx, pr, hx + 2, hy + 2);
    box(ctx, pr.x, pr.y, pr.a, -hx, hx, -hy, hy, 0, 28, tone(col, 1.04), col, (c2, f, i) => {
      const n = i === 0 || i === 2 ? 14 : 5;
      for (let k = 1; k < n; k++) patch(c2, f, k / n - 0.012, k / n + 0.012, 0.03, 0.97, 'rgba(0,0,0,.28)');
      patch(c2, f, 0, 1, 0.95, 1, 'rgba(255,255,255,.12)');
      if (i === 3 || i === 1) { patch(c2, f, 0.49, 0.51, 0, 1, 'rgba(0,0,0,.45)'); patch(c2, f, 0.2, 0.24, 0.1, 0.9, 'rgba(160,160,160,.35)'); }
    });
  }

  /** 뚝뚝 — 낮은 차체, 앞바퀴 하나, 기둥 넷 위의 천막 지붕 */
  function tuktuk(ctx, pr) {
    const hx = pr.w / 2, hy = pr.h / 2, col = pr.col;
    ctx.fillStyle = 'rgba(0,0,0,.4)';
    shadowRect(ctx, pr, hx + 1, hy + 1);
    wheels(ctx, pr, [-hx * 0.6], hy * 0.9, 3.4);
    const c = Math.cos(pr.a), s = Math.sin(pr.a);
    ctx.fillStyle = '#0b0c0e';
    { const wx = pr.x + hx * 0.75 * c, wy = pr.y + hx * 0.75 * s; ctx.beginPath(); ctx.ellipse(wx, wy * TL - 3.4 * UP, 3, 3.4, 0, 0, 6.283); ctx.fill(); }
    const at = box(ctx, pr.x, pr.y, pr.a, -hx, hx * 0.45, -hy, hy, 3, 10, col, col, (c2, f) => patch(c2, f, 0, 1, 0.75, 0.88, 'rgba(255,255,255,.18)'));
    box(ctx, pr.x, pr.y, pr.a, hx * 0.45, hx * 0.9, -hy * 0.35, hy * 0.35, 3, 9, tone(col, 0.85), col);
    box(ctx, pr.x, pr.y, pr.a, -hx * 0.9, -hx * 0.35, -hy * 0.85, hy * 0.85, 10, 14, '#3a2f2a', '#2a2420');
    ctx.strokeStyle = '#8a9096'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const [lx, ly] of [[-hx * 0.9, -hy * 0.9], [-hx * 0.9, hy * 0.9], [hx * 0.4, -hy * 0.9], [hx * 0.4, hy * 0.9]]) {
      const a = at(lx, ly, 10), b = at(lx, ly, 22); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    }
    ctx.stroke();
    box(ctx, pr.x, pr.y, pr.a, -hx * 1.02, hx * 0.5, -hy * 1.02, hy * 1.02, 22, 24, tone('#2a2d31', 1.1), '#2a2d31',
      (c2, f) => { for (let u = 0; u < 1; u += 0.2) patch(c2, f, u, u + 0.1, 0, 1, col); });
  }

  /** 군용 차량 (험비) — 넓고 낮은 차체, 각진 실내, 지붕 해치, 앞 그릴과 예비 바퀴 */
  function humvee(ctx, pr) {
    const hx = pr.w / 2, hy = pr.h / 2, col = pr.col;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    shadowRect(ctx, pr, hx + 2, hy + 2);
    wheels(ctx, pr, [-hx * 0.6, hx * 0.6], hy * 0.95, 5.2);
    const at = box(ctx, pr.x, pr.y, pr.a, -hx, hx, -hy, hy, 4.5, 12, tone(col, 1.04), col, (c2, f, i) => {
      if (i === 1) { for (let u = 0.22; u < 0.8; u += 0.09) patch(c2, f, u, u + 0.04, 0.35, 0.85, 'rgba(0,0,0,.35)'); patch(c2, f, 0.05, 0.16, 0.5, 0.8, '#d8d2b8'); patch(c2, f, 0.84, 0.95, 0.5, 0.8, '#d8d2b8'); }
      else patch(c2, f, 0, 1, 0.25, 0.32, 'rgba(0,0,0,.25)');
    });
    box(ctx, pr.x, pr.y, pr.a, -hx * 0.72, hx * 0.22, -hy * 0.86, hy * 0.86, 12, 21, tone(col, 1.08), col, (c2, f, i) => {
      if (i === 0 || i === 2) for (const u of [0.08, 0.55]) patch(c2, f, u, u + 0.34, 0.45, 0.85, GLASS);
      else if (i === 1) patch(c2, f, 0.08, 0.92, 0.45, 0.88, GLASS);
    });
    box(ctx, pr.x, pr.y, pr.a, -hx * 0.4, -hx * 0.1, -hy * 0.3, hy * 0.3, 21, 23, tone(col, 0.9), tone(col, 0.8));   // 해치
    const sp = at(-hx - 1.5, 0, 9);                                                                                  // 뒤에 단 예비 바퀴
    ctx.fillStyle = '#121416'; ctx.beginPath(); ctx.ellipse(sp[0], sp[1], 4, 5, 0, 0, 6.283); ctx.fill();
  }
  /** 박스 트럭 — 낮은 운전석과 높은 짐칸 */
  function truck(ctx, pr) {
    const hx = pr.w / 2, hy = pr.h / 2, col = pr.col;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    shadowRect(ctx, pr, hx + 2, hy + 2);
    wheels(ctx, pr, [-hx * 0.62, -hx * 0.38, hx * 0.68], hy * 0.9, 5);
    box(ctx, pr.x, pr.y, pr.a, hx * 0.42, hx, -hy * 0.9, hy * 0.9, 4, 22, '#c9c4b8', '#b3ad9f', (c2, f, i) => {
      if (i === 1) { patch(c2, f, 0.08, 0.92, 0.5, 0.9, GLASS); patch(c2, f, 0.06, 0.2, 0.12, 0.26, '#d8d2b8'); patch(c2, f, 0.8, 0.94, 0.12, 0.26, '#d8d2b8'); }
      else if (i === 0 || i === 2) patch(c2, f, 0.35, 0.9, 0.52, 0.88, GLASS);
    });
    box(ctx, pr.x, pr.y, pr.a, -hx, hx * 0.38, -hy, hy, 4, 32, tone('#d9d6cf', 1.02), '#cfcbc2', (c2, f, i) => {
      patch(c2, f, 0, 1, 0.42, 0.62, tone(col, 1));                                     // 회사 띠
      if (i === 3) { patch(c2, f, 0.49, 0.51, 0.05, 0.95, 'rgba(0,0,0,.35)'); for (let v = 0.2; v < 0.9; v += 0.2) patch(c2, f, 0, 1, v, v + 0.012, 'rgba(0,0,0,.18)'); }
    });
  }

  /** 화차 — 녹슨 유개차. 아래에 대차 둘, 옆면에 미닫이 문 */
  function wagon(ctx, pr) {
    const hx = pr.w / 2, hy = pr.h / 2, col = pr.col;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    shadowRect(ctx, pr, hx + 2, hy + 2);
    box(ctx, pr.x, pr.y, pr.a, -hx * 0.9, -hx * 0.55, -hy * 0.8, hy * 0.8, 0, 6, '#1a1c1e', '#141618');
    box(ctx, pr.x, pr.y, pr.a, hx * 0.55, hx * 0.9, -hy * 0.8, hy * 0.8, 0, 6, '#1a1c1e', '#141618');
    box(ctx, pr.x, pr.y, pr.a, -hx, hx, -hy, hy, 6, 34, tone(col, 1.06), col, (c2, f, i) => {
      const n = i === 0 || i === 2 ? 18 : 6;
      for (let k = 1; k < n; k++) patch(c2, f, k / n - 0.006, k / n + 0.006, 0.04, 0.96, 'rgba(0,0,0,.22)');
      if (i === 0 || i === 2) { patch(c2, f, 0.38, 0.62, 0.06, 0.92, tone(col, 0.82)); patch(c2, f, 0.495, 0.505, 0.06, 0.92, 'rgba(0,0,0,.5)'); }
      patch(c2, f, 0, 1, 0.94, 1, 'rgba(255,255,255,.1)');
    });
  }

  function prop(ctx, pr) {
    if (pr.kind === 'car') car(ctx, pr);
    else if (pr.kind === 'wagon') wagon(ctx, pr);
    else if (pr.kind === 'humvee') humvee(ctx, pr);
    else if (pr.kind === 'truck') truck(ctx, pr);
    else if (pr.kind === 'bus') bus(ctx, pr);
    else if (pr.kind === 'tuktuk') tuktuk(ctx, pr);
    else container(ctx, pr);
  }

  /** 길가 장식 — 자판기 · 파라솔 · 노점 수레 · 신당 */
  function decor(ctx, d, x, y) {
    if (d.kind === 'vending') {
      const a = d.wall === 'n' ? Math.PI / 2 : d.wall === 'w' ? 0 : d.wall === 'e' ? Math.PI : -Math.PI / 2;
      ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(x, y * TL, 11, 7, 0, 0, 6.283); ctx.fill();
      box(ctx, x, y, a, -6, 6, -9, 9, 0, 27, '#c4c9cf', '#d9dde2', (c2, f, i) => {
        if (i !== 1) return;                                     // 앞면: 진열창 · 버튼 · 배출구
        patch(c2, f, 0.08, 0.92, 0.5, 0.92, '#7a8b99');
        for (let u = 0.12; u < 0.9; u += 0.19) patch(c2, f, u, u + 0.12, 0.58, 0.68, tone(d.col || '#c94a3a', 1));
        patch(c2, f, 0.2, 0.8, 0.08, 0.2, '#22262a');
      });
    } else if (d.kind === 'parasol' || d.kind === 'cart') {
      const top = d.kind === 'cart' ? 20 : 24;
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x + 3, (y + 3) * TL, 15, 9, 0, 0, 6.283); ctx.fill();
      if (d.kind === 'cart') {
        box(ctx, x, y, 0, -12, 12, -7, 7, 3, 12, '#6a4c38', '#5a4030');
        ctx.fillStyle = '#0b0c0e';
        for (const sx of [-8, 8]) { ctx.beginPath(); ctx.ellipse(x + sx, (y + 7) * TL - 2, 2.6, 3, 0, 0, 6.283); ctx.fill(); }
      } else {
        box(ctx, x, y, 0, -7, 7, -5, 5, 0, 9, '#4a5056', '#3d4248');
      }
      ctx.strokeStyle = '#8a9096'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, y * TL - 4 * UP); ctx.lineTo(x, y * TL - top * UP); ctx.stroke();
      const cy = y * TL - top * UP;
      ctx.fillStyle = tone(d.col, 0.6); ctx.beginPath(); ctx.ellipse(x, cy + 1.5, 16, 13.8, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = d.col;
      ctx.beginPath(); ctx.ellipse(x, cy, 16, 13.5, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.18)';
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x, cy - 2); ctx.ellipse(x, cy, 16, 13.5, 0, k * 1.571, k * 1.571 + 0.55); ctx.fill(); }
    } else if (d.kind === 'bin') {
      // 골목의 파란 쓰레기통 둘 (트레일러의 벽돌 골목)
      const a = d.wall === 'n' ? 0 : d.wall === 'w' || d.wall === 'e' ? Math.PI / 2 : 0;
      const ox = d.wall === 'w' ? -5 : d.wall === 'e' ? 5 : 0, oy = d.wall === 'n' ? -5 : 0;
      ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(x + ox + 2, (y + oy + 3) * TL, 15, 8, 0, 0, 6.283); ctx.fill();
      for (const k of [-1, 1]) {
        const c = Math.cos(a), s = Math.sin(a), bx = x + ox + k * 7.5 * c, by = y + oy + k * 7.5 * s;
        box(ctx, bx, by, a, -6, 6, -5.5, 5.5, 0, 15, '#2e5f8a', '#2a5478', (c2, f, i) => patch(c2, f, 0, 1, 0.85, 1, 'rgba(255,255,255,.12)'));
        box(ctx, bx, by, a, -6.5, 6.5, -6, 6, 15, 17, '#1f4466', '#1b3b58');
      }
    } else if (d.kind === 'shrine') {
      ctx.strokeStyle = '#6b5a3a'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(x, y * TL); ctx.lineTo(x, y * TL - 14 * UP); ctx.stroke();
      const at = box(ctx, x, y, 0, -6, 6, -5, 5, 14, 24, '#c9a34a', '#b38f3c');
      ctx.fillStyle = '#8a3a2a';
      const a = at(-8, 0, 24), b = at(0, 0, 32), c = at(8, 0, 24);
      ctx.beginPath(); ctx.moveTo(a[0], a[1] + 3); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1] + 3); ctx.closePath(); ctx.fill();
    }
  }
  const STANDING = { vending: 1, parasol: 1, cart: 1, shrine: 1, bin: 1 };

  /** 머리 높이 (세계 px) — 어둠 속 눈이 이 높이에 뜬다 */
  function headZ(z) {
    const t = z.t;
    if (t.crawl) return 7;
    if (t.weeper && !z.rage) return 13;
    const S = t.boss ? 2.35 : t.bloat ? 1.25 : t.size >= 18 ? 1.75 : t.speed > 100 ? 1.06 : 1.15;
    return 24 * S;
  }

  /* 화면에서 높이 h(세계 px)는 세계 y 로 h·UP/TL 만큼 위 */
  const ZK = UP / TL;
  const api = { zombie, player, corpse, prop, decor, STANDING, headZ, box, tone, ZK, TL, UP, lod: 0 };
  return api;
})();
window.MODELS = MODELS;
