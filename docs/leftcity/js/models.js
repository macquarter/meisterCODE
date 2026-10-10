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
  /* 사람 크기 — 원작 예고편처럼 사람이 화면에서 또렷하게 서 보이도록 인형만 키우고(CS) 키를 조금 더 세운다(UPR).
     부딪힘 크기는 그대로다. 눈 · 총구 높이(headZ · HK)도 같은 배수를 쓴다 */
  const CS = 0.82, UPR = UP * 1.22, HK = CS * 1.22;

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
      this.x = x; this.y = y; this.c = Math.cos(face); this.s = Math.sin(face); this.S = S * CS;
      this.parts = [];
    }
    pt(fx, fy, fz) {
      const S = this.S, wx = this.x + (fx * this.c - fy * this.s) * S, wy = this.y + (fx * this.s + fy * this.c) * S;
      return [wx, wy * TL - fz * S * UPR, wy * 0.5 + fz * S * 0.866];
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
      // 빛 방향(화면) — 손전등 안이면 손전등 쪽, 아니면 위 왼쪽의 희미한 하늘빛. 밝은 면이 빛을 향한다
      const lx = api.light.x, ly = api.light.y, lit = api.light.k;
      if (api.lod) {
        // 많이 보일 때 — 그늘 층을 빼고 한 번씩만 칠한다
        for (const q of P) {
          const col = over || q.col;
          if (q.t === 0) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(q.X, q.Y, q.r, 0, 6.283); ctx.fill(); }
          else { ctx.strokeStyle = col; ctx.lineWidth = q.r * 2; ctx.beginPath(); ctx.moveTo(q.X, q.Y); ctx.lineTo(q.X2, q.Y2); ctx.stroke(); }
        }
        return;
      }
      // 윤곽 — 어두운 테를 먼저 한 번. 밝은 바닥 위에서도 몸이 또렷하게 떨어진다
      if (!over && api.outline) {
        ctx.fillStyle = ctx.strokeStyle = 'rgba(6,7,9,.85)';
        for (const q of P) {
          if (q.t === 0) { ctx.beginPath(); ctx.arc(q.X, q.Y, q.r + 0.8, 0, 6.283); ctx.fill(); }
          else { ctx.lineWidth = q.r * 2 + 1.6; ctx.beginPath(); ctx.moveTo(q.X, q.Y); ctx.lineTo(q.X2, q.Y2); ctx.stroke(); }
        }
      }
      const hi = 1.18 + lit * 0.22;
      for (const q of P) {
        const col = over || q.col;
        if (q.t === 0) {
          ctx.fillStyle = tone(col, 0.55);
          ctx.beginPath(); ctx.arc(q.X, q.Y, q.r, 0, 6.283); ctx.fill();
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(q.X + lx * q.r * 0.16, q.Y + ly * q.r * 0.18, q.r * 0.8, 0, 6.283); ctx.fill();
          if (q.hl && q.r > 2.4) {
            ctx.fillStyle = tone(col, hi);
            ctx.beginPath(); ctx.arc(q.X + lx * q.r * 0.4, q.Y + ly * q.r * 0.42, q.r * 0.36, 0, 6.283); ctx.fill();
          }
        } else {
          ctx.strokeStyle = tone(col, 0.55); ctx.lineWidth = q.r * 2;
          ctx.beginPath(); ctx.moveTo(q.X, q.Y); ctx.lineTo(q.X2, q.Y2); ctx.stroke();
          ctx.strokeStyle = col; ctx.lineWidth = q.r * 1.25;
          const ox = lx * q.r * 0.34, oy = ly * q.r * 0.34;
          ctx.beginPath(); ctx.moveTo(q.X + ox, q.Y + oy); ctx.lineTo(q.X2 + ox, q.Y2 + oy); ctx.stroke();
          if (lit > 0.3 && q.r > 1.2) {                      // 손전등을 받은 쪽 가장자리 빛
            ctx.strokeStyle = tone(col, hi); ctx.lineWidth = q.r * 0.45;
            ctx.beginPath(); ctx.moveTo(q.X + ox * 1.7, q.Y + oy * 1.7); ctx.lineTo(q.X2 + ox * 1.7, q.Y2 + oy * 1.7); ctx.stroke();
          }
        }
      }
    }
  }

  function shadow(ctx, x, y, rx, a = 0.4) {
    rx *= CS;
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
    // 몸통 — 골반 공 위로 허리에서 가슴까지 매끈한 원통, 어깨
    R.ball(L * 0.25, 0, 13.2 + bob, 3.6 * B, pn);
    R.limb([L * 0.4, 0, 14.6 + bob], [L * 0.9, 0, 19.2 + bob], 4.1 * B, top);
    R.ball(L, 0, 19.8 + bob, 4.5 * B, top);
    for (const sd of [-1, 1]) R.ball(L, sd * 3.9 * B, 21 + bob, 2.5 * B, top, false);
    // 머리 — 머리카락이 정수리와 뒤통수를 덮는다
    const hd = o.head || {};
    const hx = L * 1.2 + 0.8 + (hd.dx || 0), hy = hd.dy || 0, hz = 25 + bob + (hd.dz || 0), hr = hd.r || 3.3;
    R.ball(hx, hy, hz, hr, sk);
    if (o.hair) R.ball(hx - 1.3, hy, hz + 0.6, hr * 0.9, o.hair, false);
    if (o.faceCol) {                                  // 얼굴 — 꺼진 눈두덩 둘과 벌어진 입 (돌아서면 머리에 가려진다)
      for (const sd of [-1, 1]) R.ball(hx + hr * 0.78, hy + sd * hr * 0.34, hz + hr * 0.1, hr * 0.15, o.faceCol, false);
      R.ball(hx + hr * 0.82, hy, hz - hr * 0.44, hr * 0.17, '#33100d', false);
    }
    if (o.helmet) {                                   // 철모 — 머리보다 넓고 낮게 얹힌다
      R.ball(hx - 0.4, hy, hz + 1.1, hr * 1.18, o.helmet);
      R.ball(hx + hr * 0.5, hy, hz + 0.2, hr * 0.5, tone(o.helmet, 0.7), false);
    }
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
        el = sd > 0 ? [L + 3.5 + m * 6, 4.6, 17.4] : [L + 5 + m * 7, -4.4, 18.4];
        hn = sd > 0 ? [L + 8 + m * 12, 1.4 + m * 2, 19] : [L + 11 + m * 12, -0.4 - m * 2, 19.5];
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
  const REGION_WEAR = {
    varanasi: { top: ['#c9822a', '#d8cfb8', '#8a3a4a', '#e2dccb', '#3a6a8a', '#b8402a', '#d9b040'], pants: ['#d0c8b4', '#6a5a48', '#e0dccb'], long: 0.35 },
    cairo: { top: ['#c8bca0', '#8a8070', '#3a4a5a', '#d8d0bc', '#5a4a3a', '#e4e0d4'], pants: ['#4a4234', '#6a6050'], long: 0.6, hood: 0.3 },
    venice: { top: ['#2a2a34', '#5a2a2a', '#3a3a2a', '#6a6050', '#1e2a3a'], pants: ['#1e2024', '#2f2a26', '#3a3a40'], long: 0.1 },
    istanbul: { top: ['#5a4a3a', '#3a4a5a', '#8a2a2a', '#c8c0b0', '#2a2e34', '#6a5a4a'], pants: ['#2a2a2e', '#3a3a40'], long: 0.4, hood: 0.2 },
    mars: { top: ['#e8e4dc', '#e8641a', '#c9ccd1', '#d8d4cc', '#5a6a7a'], pants: ['#c9ccd1', '#8a9098'], long: 0, hood: 0.6 },
    moscow: { top: ['#3a3a40', '#5a4a3a', '#2a3a4a', '#6a2a2a', '#4a4a3a', '#7a7468'], pants: ['#24262a', '#2e3036'], long: 0.7, hood: 0.6 },
    nairobi: { top: ['#e8641a', '#2e7d32', '#f2d24a', '#c62828', '#1a5a9a', '#e0e0e0', '#7a3a8a'], pants: ['#2a2e34', '#4a4a3a', '#1e2a44'], long: 0, hood: 0 },
    rio: { top: ['#f2d24a', '#2e7d32', '#e0e0e0', '#1a5a9a', '#e86a4a', '#f0e0c0'], pants: ['#3a4a6a', '#5a5040'], long: 0, hood: 0 },
    reykjavik: { top: ['#c8c0b0', '#4a5a6a', '#6a4a3a', '#2a3a4a', '#8a3a2a'], pants: ['#24282e', '#2d3440'], long: 0, hood: 0.4 },
    antarctic: { top: ['#c83a2a', '#d8642a', '#e0b030', '#2a4a8a', '#c8402e'], pants: ['#2a2e34', '#1e2226'], long: 0.2, hood: 0.8 }
  };
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
    // 대피 기지 — 마지막까지 남았던 병사들. 얼룩무늬 전투복과 철모
    else if (api.military && (z.type === 'walker' || z.type === 'runner' || z.type === 'crawler') && r() < 0.5) {
      z.look.top = pick(['#4a5236', '#525a3c', '#43492f']); z.look.pants = pick(['#3e4430', '#454a34']);
      z.look.helmet = z.type !== 'crawler' && r() < 0.8; if (z.look.helmet) z.look.hair = null;
    }
    // 2부의 지역 — 그곳 사람들의 옷차림 (긴 옷은 위아래가 같은 색)
    else if (REGION_WEAR[api.region] && !z.t.boss && !z.t.weeper && !z.t.bloat && r() < 0.75) {
      const Rw = REGION_WEAR[api.region], long = r() < Rw.long;
      z.look.top = pick(Rw.top); z.look.pants = long ? z.look.top : pick(Rw.pants);
      if (Rw.hood && r() < Rw.hood) z.look.hair = null;
    }
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
    } else if (t.leap) {
      // 덮치는 것 — 후드를 뒤집어쓴 마른 몸. 웅크리면 낮게 가라앉고, 날 때는 몸을 앞으로 뻗는다
      const cr = z.leapPhase === 'crouch', air = z.leapPhase === 'air';
      o = { S: cr ? 0.86 : 1.04, lean: air ? 10 : cr ? 8 : 5.5, arms: 'claw', amp: cr ? 0.1 : amp, skin: t.head, top: t.body, pants: '#24272b', hair: null,
            head: { dz: cr ? -1.6 : -0.6, dx: 0.8 },
            extra(R2, bob, L) { R2.ball(L + 0.6, 0, 21.4 + bob, 3.5, t.body, false); R2.ball(L + 2.4, 0, 20.4 + bob, 1.6, '#0c0c0c', false); } };
      shadow(ctx, z.x, z.y, air ? 8 : 11, air ? 0.22 : 0.4);
    } else if (t.charge) {
      // 들이받는 것 — 한쪽 팔이 비대하게 부풀어 땅에 끌린다. 다른 팔은 말라붙었다
      const wind = z.chargePhase === 'wind';
      o = { S: 1.5 * (wind ? 1 + Math.sin(ph * 2) * 0.04 : 1), lean: z.chargePhase === 'dash' ? 7 : 4, arms: 'hang', bulk: 1.2, amp, skin: t.head, top: t.body, pants: '#2a2622', sleeve: t.head, hair: null,
            head: { r: 2.4, dz: -1.4, dx: 1 },
            extra(R2, bob, L) {
              R2.chain([L - 0.5, 5.2, 18 + bob], [L + 2.5, 8, 10.5 + bob], [L + 4, 7.2, 2.4 + bob], 3.6, 3.2, t.head, t.head, 3.4, '#5a4436');
              R2.ball(L - 0.5, 5.4, 18 + bob, 4, t.head);
            } };
      shadow(ctx, z.x, z.y, 17);
    } else if (t.tongue) {
      // 휘감는 것 — 키가 크고 얼굴 한쪽이 혹으로 덮였다. 기침할 때 몸이 앞으로 꺾인다
      const wind = z.tonguePhase === 'wind';
      o = { S: 1.24, lean: wind ? 6 : 1.5, arms: 'hang', amp: amp * 0.8, skin: t.head, top: t.body, pants: '#2b2a26', hair: '#1a1714',
            head: { dz: 0.6, dx: wind ? 1.4 : 0 },
            extra(R2, bob, L) {
              for (const [bx, by, bz, br] of [[L + 2.2, 2.2, 22 + bob, 1.9], [L + 1.2, 3.2, 20.2 + bob, 1.5], [L - 0.6, 3.6, 17.5 + bob, 1.7], [L + 0.4, -3, 16.5 + bob, 1.3]]) R2.ball(bx, by, bz, br, '#7a5a3a', false);
            } };
      shadow(ctx, z.x, z.y, 12);
    } else if (t.armor) {
      // 진압 경찰 — 헬멧과 방탄복, 앞으로 든 투명 방패
      o = { S: 1.16, lean: 2.4, arms: 'hang', amp: amp * 0.85, bulk: 1.1, skin: k.skin, top: t.body, pants: '#1d2024', sleeve: t.body, hair: null,
            head: { dz: -0.4 },
            extra(R2, bob, L) {
              R2.ball(L + 0.4, 0, 22.4 + bob, 3.5, '#15181b');                                          // 헬멧
              R2.ball(L + 3, 0, 21.6 + bob, 1.4, '#7a8a96', false);                                     // 안면 보호대
              for (const sy of [-4.6, -1.6, 1.4, 4.4]) R2.limb([L + 6.5, sy, 4 + bob], [L + 6.5, sy, 19 + bob], 1.9, 'rgba(150,170,185,.55)');   // 방패
              R2.limb([L + 6.6, -4.6, 19 + bob], [L + 6.6, 4.4, 19 + bob], 0.8, '#d8dde2');
            } };
      shadow(ctx, z.x, z.y, 13);
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
    if (!o.hood) o.faceCol = '#241513';
    if (k.hazmat && !t.boss && !t.bloat && !t.spit && !t.scream && t.size < 18) { o.hood = '#e2e0d6'; o.sleeve = k.top; o.faceCol = null; }
    if (k.helmet && o.head) { o.helmet = '#3d4330'; o.sleeve = k.top; }
    // 밀쳐진 감염체 — 뒤로 크게 젖혀지고 팔을 허우적댄다
    if (z.shoved > 0) { const k = Math.min(1, z.shoved / 0.35); o.lean = -7 * k; o.arms = 'claw'; o.amp = 0.2; }
    o.x = z.x; o.y = z.y; o.face = z.face; o.ph = ph; o.sway = o.sway ?? sway;
    R = humanRig(o);
    R.draw(ctx, over);
  }

  /** 생존자 — 어두운 재킷, 배낭, 두 손으로 든 총과 총열 아래 손전등 */
  function player(ctx, p, over) {
    shadow(ctx, p.x, p.y, 11);
    const melee = p.meleeAnim > 0 ? Math.sin((1 - p.meleeAnim / 0.32) * Math.PI) : 0;
    const R = humanRig({
      x: p.x, y: p.y, face: p.angle, S: 1.12, ph: p.walkPhase, amp: p.stride || 0, lean: 1.2 + melee * 5, arms: 'gun', melee,
      skin: '#c9a184', top: p.hurtFlash > 0.05 ? '#7a3e3a' : '#2f3a44', pants: '#262b31', hair: '#1d1a17', shoes: '#121416',
      sleeve: '#2f3a44', fore: '#2f3a44',
      extra(R2, bob, L) {
        R2.ball(L - 3.8, 0, 19 + bob, 3.4, '#3b3428');               // 배낭
        R2.ball(L - 3.4, 0, 22.4 + bob, 2.2, '#4a4234', false);
        const m = melee * 12;
        R2.limb([L + 6.5 + m, 0.6, 19.6], [L + 19 + m, 0.2, 20.2], 1.25, '#15181c');
        R2.ball(L + 19.5 + m, 0.2, 19.2, 1.35, '#f4e2a8', false);
      }
    });
    R.draw(ctx, over);
  }

  /** 동료 (rc.31) — 저마다 다른 옷, 배낭 없이 총만 든 생존자 */
  function ally(ctx, a, over) {
    shadow(ctx, a.x, a.y, 11);
    const k = a.kit;
    const R = humanRig({
      x: a.x, y: a.y, face: a.angle, S: 1.08, ph: a.walkPhase, amp: a.stride || 0, lean: 1.2, arms: 'gun', melee: 0,
      skin: k.skin, top: a.hurtFlash > 0.05 ? '#7a3e3a' : k.top, pants: k.pants, hair: k.hair, shoes: '#121416', sleeve: k.top, fore: k.top,
      extra(R2, bob, L) { R2.limb([L + 6.5, 0.6, 19.6], [L + 18, 0.2, 20.2], 1.25, '#15181c'); }
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
      else if (c.top && c.type !== 'player') { c.look.top = c.top; c.look.pants = c.pants || c.look.pants; }   // 쓰러지기 전 옷 그대로
      if (c.skin) c.look.skin = c.skin;                                     // 동료 — 사람의 살빛 그대로
    }
    // 쓰러진 몸은 움직이지 않는다 — 한 번 그려 둔 그림을 옮겨 찍는다 (시체 40구에서도 프레임이 버틴다)
    if (!c.img) {
      const S0 = c.type === 'brute' ? 1.6 : c.type === 'behemoth' ? 2.3 : c.type === 'charger' ? 1.5 : c.type === 'bloater' ? 1.3 : 1.1;
      const half = Math.ceil(26 * S0 * CS), dpr = Math.min(4, window.AFT_SCALE || window.devicePixelRatio || 1);
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
    ctx.beginPath(); ctx.ellipse(-Math.cos(c.a) * 3, -Math.sin(c.a) * 3 * TL, 16 * S * CS, 10 * S * CS, 0, 0, 6.283); ctx.fill();
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

  /** 군용 트럭 — 각진 올리브색 운전석, 활대 위로 씌운 방수포 짐칸 */
  function mtruck(ctx, pr) {
    const hx = pr.w / 2, hy = pr.h / 2, col = '#4a5236';
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    shadowRect(ctx, pr, hx + 2, hy + 2);
    wheels(ctx, pr, [-hx * 0.66, -hx * 0.4, hx * 0.66], hy * 0.92, 6);
    box(ctx, pr.x, pr.y, pr.a, hx * 0.4, hx, -hy * 0.92, hy * 0.92, 5, 24, tone(col, 1.08), col, (c2, f, i) => {
      if (i === 1) { patch(c2, f, 0.1, 0.9, 0.55, 0.9, GLASS); patch(c2, f, 0.05, 0.95, 0.08, 0.3, 'rgba(0,0,0,.35)'); }
      else if (i === 0 || i === 2) patch(c2, f, 0.3, 0.88, 0.55, 0.9, GLASS);
    });
    box(ctx, pr.x, pr.y, pr.a, -hx, hx * 0.36, -hy, hy, 6, 31, tone('#5c6146', 1.05), '#545a40', (c2, f, i) => {
      for (let u = 0.12; u < 1; u += 0.22) patch(c2, f, u - 0.012, u + 0.012, 0.25, 1, 'rgba(0,0,0,.25)');   // 방수포 활대
      patch(c2, f, 0, 1, 0, 0.22, '#3a3f2c');                                                                   // 적재함 판
      if (i === 3) patch(c2, f, 0.1, 0.9, 0.3, 0.95, 'rgba(0,0,0,.4)');                                         // 뒤쪽 트인 자리
    });
  }

  /** 실내 가구(rc.50) — 책상 묶음 · 회의 탁자 · 조리대 · 카페 탁자 · 시장 좌판 · 발전소 기계. rc.51 — 분수 · 터빈 · 탱크 · 파이프 랙 · 통제 콘솔 · 선반 */
  function furniture(ctx, pr) {
    const hx = pr.w / 2, hy = pr.h / 2, k = pr.kind;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; shadowRect(ctx, pr, hx + 1, hy + 1);
    if (k === 'desks') {
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const x0 = sx < 0 ? -hx : 1, x1 = sx < 0 ? -1 : hx, y0 = sy < 0 ? -hy : 1, y1 = sy < 0 ? -1 : hy;
        box(ctx, pr.x, pr.y, 0, x0, x1, y0, y1, 0, 17, '#b8ad98', '#7a7262');
        box(ctx, pr.x, pr.y, 0, (x0 + x1) / 2 - 5, (x0 + x1) / 2 + 5, sy < 0 ? -2 : 1, sy < 0 ? -1 : 2, 17, 25, '#16181a', '#0e0f10');
      }
      box(ctx, pr.x, pr.y, 0, -hx, hx, -0.7, 0.7, 0, 28, '#6a737c', '#4e565e');
    } else if (k === 'table') box(ctx, pr.x, pr.y, 0, -hx, hx, -hy * 0.7, hy * 0.7, 0, 18, '#6a4a32', '#4a3424');
    else if (k === 'counter') box(ctx, pr.x, pr.y, 0, -hx, hx, -hy, hy, 0, 18, '#8a8a84', '#5a564e');
    else if (k === 'cafe') box(ctx, pr.x, pr.y, 0, -hx * 0.7, hx * 0.7, -hy * 0.7, hy * 0.7, 0, 16, '#c8c0b0', '#8a8478');
    else if (k === 'stall') { box(ctx, pr.x, pr.y, 0, -hx, hx, -hy * 0.8, hy * 0.8, 0, 18, '#7a6044', '#5a4632'); box(ctx, pr.x, pr.y, 0, -hx * 1.05, hx * 1.05, -hy * 1.1, hy * 1.1, 34, 36, pr.col, tone(pr.col, 0.7)); }
    else if (k === 'fountain') { box(ctx, pr.x, pr.y, 0, -hx, hx, -hy, hy, 0, 10, '#9a9488', '#6a665c'); box(ctx, pr.x, pr.y, 0, -hx * 0.7, hx * 0.7, -hy * 0.7, hy * 0.7, 9, 10, '#2a3a40', '#2a3a40'); box(ctx, pr.x, pr.y, 0, -4, 4, -4, 4, 0, 26, '#a8a294', '#7a756a'); }
    else if (k === 'turbine') { box(ctx, pr.x, pr.y, 0, -hx, hx, -hy * 0.9, hy * 0.9, 0, 14, '#3a3e42', '#2a2d30'); box(ctx, pr.x, pr.y, 0, -hx * 0.95, hx * 0.3, -hy * 0.9, hy * 0.9, 14, 58, tone(pr.col, 1.15), pr.col); box(ctx, pr.x, pr.y, 0, hx * 0.35, hx * 0.95, -hy * 0.75, hy * 0.75, 14, 50, '#8a5a3a', '#6a4430'); }
    else if (k === 'tank') { box(ctx, pr.x, pr.y, 0, -hx, hx, -hy, hy, 0, 62, tone(pr.col, 1.1), pr.col); box(ctx, pr.x, pr.y, 0, -hx * 0.6, hx * 0.6, -hy * 0.6, hy * 0.6, 62, 66, '#6a6a66', '#5a5a56'); }
    else if (k === 'pipes') { box(ctx, pr.x, pr.y, 0, -hx, hx, -hy * 0.9, hy * 0.9, 0, 30, '#4a4e54', '#33363a'); for (const f of [-0.5, 0, 0.5]) box(ctx, pr.x, pr.y, 0, -hx, hx, f * hy - 3, f * hy + 3, 24, 32, '#9aa0a6', '#6a7076'); }
    else if (k === 'console') { box(ctx, pr.x, pr.y, 0, -hx, hx, -hy * 0.6, hy * 0.6, 0, 18, '#3a4048', '#2a3036'); box(ctx, pr.x, pr.y, 0, -hx * 0.9, hx * 0.9, -hy * 0.6, -hy * 0.3, 18, 30, '#1a2a30', '#10181c'); }
    else if (k === 'shelf') { box(ctx, pr.x, pr.y, 0, -hx, hx, -hy, hy, 0, 46, '#6a5a44', pr.col); }
    else box(ctx, pr.x, pr.y, 0, -hx, hx, -hy * 0.8, hy * 0.8, 0, 38, tone(pr.col, 1.15), pr.col);   // machine
  }
  const FURN = new Set(['desks', 'table', 'counter', 'cafe', 'stall', 'machine', 'fountain', 'turbine', 'tank', 'pipes', 'console', 'shelf']);

  function prop(ctx, pr) {
    if (FURN.has(pr.kind)) furniture(ctx, pr);
    else if (pr.kind === 'car') car(ctx, pr);
    else if (pr.kind === 'mtruck') mtruck(ctx, pr);
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
    if (t.crawl) return 7 * HK;
    if (t.weeper && !z.rage) return 13 * HK;
    const S = t.boss ? 2.35 : t.bloat ? 1.25 : t.size >= 18 ? 1.75 : t.speed > 100 ? 1.06 : 1.15;
    return 24 * S * HK;
  }

  /* 화면에서 높이 h(세계 px)는 세계 y 로 h·UP/TL 만큼 위 */
  const ZK = UP / TL;
  const api = { zombie, player, ally, corpse, prop, decor, STANDING, headZ, lookOf, box, tone, ZK, TL, UP, CS, HK, lod: 0, military: false, region: null, outline: true,
                light: { x: -0.55, y: -0.8, k: 0 } };   // 그릴 인형의 빛 방향(화면 단위) · 손전등을 받는 정도
  return api;
})();
window.MODELS = MODELS;
