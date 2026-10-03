/* ═══════════════════════════════════════════
   AFTERMATH — 잔존 : 도시 생성 · 충돌 · 시야
   ═══════════════════════════════════════════ */
const TILE = 48;
/** 손전등 원뿔의 반각(rad). 원작처럼 넓고 부드러운 빛 — 렌더·감지·소환이 같은 값을 쓴다 */
const CONE_HALF = 0.56;

/** 시드 기반 난수 (같은 시드 = 같은 도시) */
function makeRng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

const T_ROAD = 0, T_WALL = 1, T_WATER = 2;          // 물은 걸을 수 없지만 빛과 총알은 지나간다
const D_ASPHALT = 0, D_SIDEWALK = 1, D_BUILDING = 2, D_RUBBLE = 3, D_PROP = 4,
      D_LANDMARK = 5, D_GRASS = 6, D_PLAZA = 7, D_WATER = 8, D_BRIDGE = 9;

/**
 * 도시 생성기.
 * 이전 판은 같은 크기의 정사각 블록을 깎아 내 미로처럼 보였다. 실제 도시는 길에 위계가 있다 —
 * 넓은 대로가 도시를 가르고, 그 사이를 간선 도로가 불규칙한 간격으로 잇고, 블록 안쪽은
 * 골목이 파고든다. 강이 도시를 가로지르고 다리 몇 개만이 건너편과 잇는다. 공원·광장·주차장이
 * 건물 숲 사이를 숨 쉬게 하고, 나라마다 랜드마크가 그 자리를 차지한다.
 *
 * opts: { theme: 'seoul'|'tokyo'|'bangkok', river: bool, landmarks: [id...], goal: 랜드마크 id }
 */
class World {
  constructor(seed, blocks, opts = {}) {
    const rng = makeRng(seed);
    this.rng = rng;
    this.theme = THEMES[opts.theme] || THEMES.seoul;
    this.w = blocks * 11 + 4;
    this.h = blocks * 11 + 4;
    const N = this.w * this.h;
    this.grid = new Uint8Array(N).fill(T_WALL);
    this.deco = new Uint8Array(N).fill(D_BUILDING);
    this.dirm = new Uint8Array(N);     // 도로 방향 1 = 남북, 2 = 동서, 3 = 교차로
    this.mark = new Uint8Array(N);     // 차선 1 = 세로 중앙선(칸 왼쪽), 2 = 가로 중앙선(칸 위쪽)
    this.cross = new Uint8Array(N);    // 횡단보도 1 = 남북 도로를 가로지름, 2 = 동서 도로를 가로지름
    this.lot = new Uint16Array(N);     // 건물 필지 번호 — 지붕 색을 필지마다 다르게
    this.landmarks = []; this.signs = []; this.props = []; this.decor = [];

    this.layout(rng, blocks, opts);
    this.connectLandmarks();
    this.placeProps(rng, blocks);
    this.markSidewalks();
    this.pickEndpoints(opts.goal);
    this.indexProps();
    this.buildShapes();

    // 구조물이 도로망을 지나치게 끊었으면 전부 치우고 다시 계산한다
    if (this.maxDist < blocks * 8) {
      for (const pr of this.props)
        for (const [tx, ty] of pr.tiles) { this.set(tx, ty, T_ROAD); this.deco[ty * this.w + tx] = D_ASPHALT; }
      this.props = [];
      this.markSidewalks();
      this.pickEndpoints(opts.goal);
      this.indexProps();
      this.buildShapes();
    }
    // 마지막 장처럼 '다리 앞'에서 시작하는 판 — 출구까지 도로로 approach 칸 남짓한 트인 곳
    if (opts.approach) this.spawn = this.tileCenter(this.approachTile(opts.approach));
  }

  /** 출구까지의 도로 거리가 n 칸 안팎이고, 트였으며 지도 가장자리 구조물에 끼지 않는 칸 */
  approachTile(n) {
    let best = -1, bs = -Infinity;
    for (const i of this.reach) {
      const d = this.toExit[i];
      if (d < 0 || Math.abs(d - n) > 8) continue;
      const x = i % this.w, y = (i / this.w) | 0;
      if (this.deco[i] !== D_ASPHALT && this.deco[i] !== D_SIDEWALK) continue;
      const sc = this.roadNeighbours(x, y) * 3 - Math.abs(d - n);
      if (sc > bs) { bs = sc; best = i; }
    }
    return best >= 0 ? best : this.idx(Math.floor(this.spawn.x / TILE), Math.floor(this.spawn.y / TILE));
  }

  /** 칸 → 구조물 번호 (총알·폭발이 무엇을 맞혔는지 알기 위해) */
  indexProps() {
    this.propAt = new Int16Array(this.w * this.h).fill(-1);
    this.props.forEach((pr, i) => { for (const [tx, ty] of pr.tiles) this.propAt[ty * this.w + tx] = i; });
  }
  propNear(x, y) {
    const i = this.propAt[this.idx(Math.floor(x / TILE), Math.floor(y / TILE))];
    return i >= 0 ? this.props[i] : null;
  }

  /* ── 격자 접근 ─────────────────────────── */
  /** 칸 번호 — 지도가 이어 붙으므로 바깥 좌표는 반대편으로 감는다 */
  idx(x, y) {
    const w = this.w, h = this.h;
    x %= w; if (x < 0) x += w;
    y %= h; if (y < 0) y += h;
    return y * w + x;
  }
  at(x, y) { return this.grid[this.idx(x, y)]; }
  /** 원환 위에서 a → b 의 가장 짧은 차이 */
  wrapDelta(ax, ay, bx, by) {
    const WW = this.w * TILE, HH = this.h * TILE;
    let dx = bx - ax, dy = by - ay;
    dx -= Math.round(dx / WW) * WW; dy -= Math.round(dy / HH) * HH;
    return [dx, dy];
  }
  /** 점 (x, y) 의 복사본 중 ref 에 가장 가까운 것 */
  near(x, y, rx, ry) { const [dx, dy] = this.wrapDelta(rx, ry, x, y); return { x: rx + dx, y: ry + dy }; }
  wrapDist(ax, ay, bx, by) { const [dx, dy] = this.wrapDelta(ax, ay, bx, by); return Math.hypot(dx, dy); }
  set(x, y, v) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.grid[y * this.w + x] = v;
    this.deco[y * this.w + x] = v === T_WALL ? D_BUILDING : v === T_WATER ? D_WATER : D_ASPHALT;
  }
  fill(x0, y0, w, h, v, deco) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      this.set(x, y, v);
      if (deco !== undefined && x >= 0 && y >= 0 && x < this.w && y < this.h) this.deco[y * this.w + x] = deco;
    }
  }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  roadNeighbours(x, y) {
    let n = 0;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++)
      if ((i || j) && this.at(x + i, y + j) === T_ROAD) n++;
    return n;
  }

  /* ── 길의 위계 ──────────────────────────── */
  /** 한 축의 도로선 목록: 대로(폭 4) 두 줄 + 그 사이 간선(폭 2)을 불규칙한 간격으로 */
  lines(len, rng, avoid) {
    const B = 0, out = [];
    // 대로는 34칸에 하나꼴로, 고르게 (지도가 클수록 많다)
    const nb = Math.max(2, Math.round(len / 34));
    const blvd = [];
    for (let k = 0; k < nb; k++) blvd.push(Math.round(len * (k + 0.5 + (rng() - 0.5) * 0.3) / nb));
    let x = B + 3 + Math.floor(rng() * 4);
    while (x < len - B - 3) {
      const near = blvd.find(b => Math.abs(b - x) < 6);
      const isB = near !== undefined;
      const pos = isB ? near : x, wd = isB ? 4 : 2;
      if (isB) blvd.splice(blvd.indexOf(near), 1);
      if (!(avoid && avoid(pos, wd)) && pos + wd < len - B) out.push({ p: pos, w: wd, blvd: isB });
      x = pos + wd + 7 + Math.floor(rng() * 6);           // 블록 깊이 7‒12
    }
    return out;
  }

  layout(rng, blocks, opts) {
    // 지도는 끝이 없다 — 가장자리 너머에 같은 도시가 이어 붙는다(원환). 그래서 바깥 봉쇄벽(B)이 없다
    const W = this.w, H = this.h, B = 0;
    // 강 — 도시를 동서로 가르는 4칸 너비의 물길, 양쪽으로 강변로
    let river = null;
    if (opts.river) {
      const ry = Math.round(H * (0.46 + rng() * 0.12));
      river = { y0: ry, y1: ry + 3 };
      this.river = river;
    }
    const inRiver = y => river && y >= river.y0 - 2 && y <= river.y1 + 2;
    const vs = this.lines(W, rng);
    const hs = this.lines(H, rng, river ? (p, wd) => p + wd > river.y0 - 6 && p < river.y1 + 6 : null);
    if (river) {
      hs.push({ p: river.y0 - 2, w: 2, blvd: false, bank: true }, { p: river.y1 + 1, w: 2, blvd: false, bank: true });
      hs.sort((a, b) => a.p - b.p);
      this.fill(B, river.y0, W - 2 * B, river.y1 - river.y0 + 1, T_WATER);
    }
    this.vlines = vs; this.hlines = hs;

    // 다리: 대로는 모두 건너고, 간선 하나가 더 건넌다. 나머지 간선은 강변에서 끝난다
    const bridgeExtra = vs.filter(v => !v.blvd);
    const extra = bridgeExtra.length ? bridgeExtra[Math.floor(rng() * bridgeExtra.length)] : null;
    for (const v of vs) {
      const crosses = v.blvd || v === extra;
      for (let y = B; y < H - B; y++) for (let x = v.p; x < v.p + v.w; x++) {
        const isWater = river && y >= river.y0 && y <= river.y1;
        if (isWater && !crosses) continue;
        this.set(x, y, T_ROAD);
        const i = y * W + x;
        this.deco[i] = isWater ? D_BRIDGE : D_ASPHALT;
        this.dirm[i] = 1;
        if (v.blvd && x === v.p + 2 && !isWater) this.mark[i] = 1;
      }
      v.bridge = crosses;
    }
    for (const h of hs) for (let x = B; x < W - B; x++) for (let y = h.p; y < h.p + h.w; y++) {
      const i = y * W + x;
      this.dirm[i] = this.grid[i] === T_ROAD && this.dirm[i] === 1 ? 3 : 2;
      this.set(x, y, T_ROAD);
      if (h.blvd && y === h.p + 2) this.mark[i] = this.dirm[i] === 3 ? 0 : 2;
    }
    // 교차로 안의 차선은 지운다
    for (let i = 0; i < W * H; i++) if (this.dirm[i] === 3) this.mark[i] = 0;

    // 횡단보도: 교차로로 들어가는 칸마다
    for (const v of vs) for (const h of hs) {
      for (let x = v.p; x < v.p + v.w; x++) for (const y of [h.p - 1, h.p + h.w])
        if (this.at(x, y) === T_ROAD && this.dirm[y * W + x] === 1 && this.deco[y * W + x] !== D_BRIDGE) this.cross[y * W + x] = 1;
      for (let y = h.p; y < h.p + h.w; y++) for (const x of [v.p - 1, v.p + v.w])
        if (this.at(x, y) === T_ROAD && this.dirm[y * W + x] === 2) this.cross[y * W + x] = 2;
    }

    // 블록 목록 (도로선 사이 사각형)
    const xs = [{ p: 0, w: B }, ...vs, { p: W - B, w: B }], ys = [{ p: 0, w: B }, ...hs, { p: H - B, w: B }];
    const blocksList = [];
    for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < ys.length; j++) {
      const x0 = xs[i].p + xs[i].w, x1 = xs[i + 1].p, y0 = ys[j].p + ys[j].w, y1 = ys[j + 1].p;
      if (x1 - x0 < 3 || y1 - y0 < 3) continue;
      if (river && y1 > river.y0 - 2 && y0 < river.y1 + 2) continue;
      blocksList.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, used: false });
    }
    this.blocks = blocksList;

    // 랜드마크 — 테마가 정한 것 중 이 장에서 쓰는 것
    // 교차로에 붙는 것을 먼저 — 교차로를 넓히며 이웃 블록 가장자리를 깎으므로 그 블록은 비워 둔다
    const ids = (opts.landmarks || []).slice().sort((a, b) => (LANDMARKS[b] && LANDMARKS[b].junction ? 1 : 0) - (LANDMARKS[a] && LANDMARKS[a].junction ? 1 : 0));
    const cx = W / 2, cy = H / 2;
    for (const id of ids) {
      const L = LANDMARKS[id];
      if (!L) continue;
      if (L.junction) {                                   // 대로 교차로에 붙는 것 (스크램블 · 로터리)
        // 대로끼리의 교차로가 없으면(강 때문에 대로가 빠진 경우 등) 간선 교차로라도 쓴다
        let bv = vs.filter(v => v.blvd), bh = hs.filter(h => h.blvd);
        if (!bv.length) bv = vs.slice();
        if (!bh.length) bh = hs.filter(h => !h.bank);
        if (!bv.length || !bh.length) continue;
        const v = bv[ids.indexOf(id) % bv.length], h = bh[(ids.indexOf(id) + 1) % bh.length];
        const lm = L.stamp(this, v, h, rng);
        if (lm) {
          this.landmarks.push(Object.assign(lm, { id, name: L.name }));
          for (const b of blocksList) if (lm.x - 1 < b.x + b.w && b.x < lm.x + lm.w + 1 && lm.y - 1 < b.y + b.h && b.y < lm.y + lm.h + 1) b.used = 'edge';
        }
        continue;
      }
      // 발자국이 들어가는 블록 중 — 구경거리는 도심 가까이, 집결지(목적지)는 외곽 쪽에 두어
      // 반대편에서 출발하는 길이 도시를 가로지르게 한다
      const isGoal = id === opts.goal;
      const dc = b => Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy);
      // 지도 테두리에 붙은 블록은 쓰지 않는다 — 문이 바깥 벽을 향하면 들어갈 수 없다
      const fit = blocksList.filter(b => !b.used && b.w >= L.w && b.h >= L.h && b.x > 1 && b.y > 1 && b.x + b.w < W - 1 && b.y + b.h < H - 1)
        .sort((a, b) => isGoal ? dc(b) - dc(a) : dc(a) - dc(b));
      let blk = fit[Math.min(fit.length - 1, Math.floor(rng() * Math.min(3, fit.length)))];
      // 맞는 블록이 없으면 자리를 밀어 낸다 — 궁궐이 길을 끊듯 길이 그 앞에서 끝난다
      if (!blk) blk = isGoal ? this.clearSite(L.w, L.h, W * (rng() < 0.5 ? 0.24 : 0.76), H * (rng() < 0.5 ? 0.24 : 0.76)) : this.clearSite(L.w, L.h);
      if (!blk) continue;
      blk.used = true;
      this.fill(blk.x, blk.y, blk.w, blk.h, T_ROAD, L.ground);
      for (let y = blk.y; y < blk.y + blk.h; y++) for (let x = blk.x; x < blk.x + blk.w; x++) {
        const i = y * W + x; this.dirm[i] = 0; this.mark[i] = 0; this.cross[i] = 0;   // 경내는 차도가 아니다
      }
      const ox = blk.x + Math.floor((blk.w - L.w) / 2), oy = blk.y + Math.floor((blk.h - L.h) / 2);
      const lm = L.stamp(this, ox, oy, rng, blk);
      if (lm) this.landmarks.push(Object.assign(lm, { id, name: L.name, block: blk }));
    }

    // 나머지 블록: 공원 · 광장 · 주차장 · 건물 (필지로 나누고 골목을 낸다)
    let lotId = 1;
    for (const b of blocksList) {
      if (b.used === true) continue;               // 'edge' (교차로 랜드마크 옆) 은 건물로 채운다
      const r = b.used === 'edge' ? 1 : rng();
      if (r < 0.1 && b.w >= 6 && b.h >= 6) { this.park(b, rng); b.kind = 'park'; continue; }
      if (r < 0.16) { this.fill(b.x, b.y, b.w, b.h, T_ROAD, D_PLAZA); b.kind = 'plaza'; continue; }
      if (r < 0.24) { this.fill(b.x, b.y, b.w, b.h, T_ROAD, D_ASPHALT); b.kind = 'lot'; continue; }
      b.kind = 'build';
      lotId = this.subdivide(b.x, b.y, b.w, b.h, rng, lotId, 0);
      // 막다른 골목 — 블록 가장자리에서 반쯤 파고든다
      if (rng() < 0.3 && b.w >= 7 && b.h >= 7) {
        if (rng() < 0.5) { const x = b.x + 2 + Math.floor(rng() * (b.w - 4)); this.fill(x, b.y, 1, Math.floor(b.h / 2), T_ROAD); }
        else { const y = b.y + 2 + Math.floor(rng() * (b.h - 4)); this.fill(b.x, y, Math.floor(b.w / 2), 1, T_ROAD); }
      }
    }

    // 간판 — 길에 면한 건물 칸에 나라별 글자로
    const T = this.theme;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (this.deco[i] !== D_BUILDING || this.grid[i] !== T_WALL) continue;
      const side = this.at(x, y + 1) === T_ROAD ? 's' : this.at(x - 1, y) === T_ROAD ? 'w' : this.at(x + 1, y) === T_ROAD ? 'e' : null;
      if (!side || ((x * 2654435761 ^ y * 40503) >>> 0) % 9 !== 0) continue;
      const h = ((x * 7919 + y * 104729) >>> 0);
      this.signs.push({ x, y, side, text: T.signs[h % T.signs.length], col: T.signCols[(h >> 3) % T.signCols.length], ph: (h % 100) / 16 });
    }
  }

  /** 필지 나누기 — 큰 땅은 둘로 쪼개고, 가끔 사이에 1칸 골목을 낸다 */
  subdivide(x, y, w, h, rng, id, depth) {
    if (depth < 3 && (w > 7 || h > 7) && rng() < 0.85) {
      const vert = w >= h;
      const span = vert ? w : h;
      const cut = 3 + Math.floor(rng() * (span - 6));
      const alley = rng() < 0.45 && span > 7;
      if (vert) {
        id = this.subdivide(x, y, cut, h, rng, id, depth + 1);
        if (alley) this.fill(x + cut, y, 1, h, T_ROAD);
        id = this.subdivide(x + cut + (alley ? 1 : 0), y, w - cut - (alley ? 1 : 0), h, rng, id, depth + 1);
      } else {
        id = this.subdivide(x, y, w, cut, rng, id, depth + 1);
        if (alley) this.fill(x, y + cut, w, 1, T_ROAD);
        id = this.subdivide(x, y + cut + (alley ? 1 : 0), w, h - cut - (alley ? 1 : 0), rng, id, depth + 1);
      }
      return id;
    }
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++)
      if (this.inside(xx, yy) && this.grid[yy * this.w + xx] === T_WALL) this.lot[yy * this.w + xx] = id;
    return id + 1;
  }

  /**
   * 랜드마크 집결 지점이 도로망과 끊겨 있으면(지도 가장자리에 붙어 문이 벽을 향하는 등)
   * 건물을 가로질러 가장 짧은 길을 낸다. 랜드마크 구조물·물·지도 바깥 테두리는 뚫지 않는다.
   */
  connectLandmarks() {
    const W = this.w, H = this.h;
    let main = -1;
    for (const v of this.vlines || []) if (v.blvd) { main = Math.floor(H / 4) * W + v.p; break; }
    if (main < 0 || this.grid[main] !== T_ROAD) return;
    for (const lm of this.landmarks) {
      if (!lm.rally) continue;
      const reach = this.bfs(main).dist;
      const ri = lm.rally.ty * W + lm.rally.tx;
      if (reach[ri] >= 0) continue;
      // 집결 지점에서, 건물을 지날 수 있는 BFS 로 도로망까지 — 가장 먼저 닿는 도로 칸까지의 경로를 판다
      const prev = new Int32Array(W * H).fill(-1), q = [ri];
      prev[ri] = ri;
      let hit = -1;
      for (let h = 0; h < q.length && hit < 0; h++) {
        const c = q[h], x = c % W, y = (c - x) / W;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, n = ny * W + nx;
          if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1 || prev[n] >= 0) continue;
          if (this.grid[n] === T_WATER || this.deco[n] === D_LANDMARK) continue;
          prev[n] = c;
          if (reach[n] >= 0) { hit = n; break; }
          q.push(n);
        }
      }
      for (let c = hit; c >= 0 && c !== ri; c = prev[c]) {
        if (this.grid[c] !== T_ROAD) { this.grid[c] = T_ROAD; this.deco[c] = D_ASPHALT; this.lot[c] = 0; }
      }
      this.decor = this.decor.filter(d => !(d.kind === 'tree' && this.grid[Math.floor(d.y / TILE) * W + Math.floor(d.x / TILE)] === T_ROAD));
    }
  }

  /** 공원 — 잔디와 나무, 가운데로 산책로 */
  park(b, rng) {
    this.fill(b.x, b.y, b.w, b.h, T_ROAD, D_GRASS);
    const mx = b.x + Math.floor(b.w / 2), my = b.y + Math.floor(b.h / 2);
    for (let x = b.x; x < b.x + b.w; x++) this.deco[my * this.w + x] = D_PLAZA;
    for (let y = b.y; y < b.y + b.h; y++) this.deco[y * this.w + mx] = D_PLAZA;
    const n = Math.floor(b.w * b.h / 9);
    for (let i = 0; i < n; i++) {
      const x = b.x + 1 + Math.floor(rng() * (b.w - 2)), y = b.y + 1 + Math.floor(rng() * (b.h - 2));
      if (x === mx || y === my || this.grid[y * this.w + x] !== T_ROAD) continue;
      if (this.roadNeighbours(x, y) < 8) continue;          // 나무끼리 붙여 길을 막지 않게
      this.tree(x, y, rng);
    }
  }
  tree(x, y, rng) {
    this.grid[y * this.w + x] = T_WALL;
    this.decor.push({ kind: 'tree', x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, r: 18 + rng() * 8, tiles: [[x, y]] });
  }

  /** 지도 가운데부터 나선으로 돌며, 강·다른 랜드마크와 겹치지 않는 자리를 비운다 (둘레 1칸은 길) */
  clearSite(fw, fh, px = this.w / 2, py = this.h / 2) {
    const W = this.w, H = this.h, cx = Math.floor(px - fw / 2), cy = Math.floor(py - fh / 2);
    const ok = (x, y) => {
      if (x < 3 || y < 3 || x + fw + 3 > W || y + fh + 3 > H) return false;
      if (this.river && y + fh + 3 > this.river.y0 - 2 && y - 3 < this.river.y1 + 2) return false;
      for (const l of this.landmarks) if (x - 2 < l.x + l.w && l.x < x + fw + 2 && y - 2 < l.y + l.h && l.y < y + fh + 2) return false;
      return true;
    };
    for (let r = 0; r < Math.max(W, H); r++) for (let k = 0; k < 8 * Math.max(1, r); k++) {
      const a = k / (8 * Math.max(1, r)) * 6.283;
      const x = cx + Math.round(Math.cos(a) * r), y = cy + Math.round(Math.sin(a) * r);
      if (!ok(x, y)) continue;
      // 둘레 길 + 안쪽 바닥. 겹친 블록은 쓰인 것으로
      for (let yy = y - 1; yy < y + fh + 1; yy++) for (let xx = x - 1; xx < x + fw + 1; xx++) {
        this.set(xx, yy, T_ROAD);
        const i = yy * W + xx;
        this.dirm[i] = this.dirm[i] || 3; this.mark[i] = 0; this.cross[i] = 0;
      }
      for (const b of this.blocks) if (x - 1 < b.x + b.w && b.x < x + fw + 1 && y - 1 < b.y + b.h && b.y < y + fh + 1) b.used = true;
      return { x, y, w: fw, h: fh, used: true };
    }
    return null;
  }

  /** 버려진 차량 · 나라별 탈것 · 화물 컨테이너 */
  placeProps(rng, blocks) {
    const T = this.theme;
    const BOX_COLS = ['#7a3129', '#2b5a72', '#6b5a24', '#3f6b45'];
    const onStreet = d => d === D_ASPHALT || d === D_SIDEWALK || d === D_BRIDGE;   // 광장 · 공원 · 경내에는 차를 두지 않는다
    const freeRoad = (x, y) =>
      this.at(x, y) === T_ROAD && this.roadNeighbours(x, y) >= 5 && this.dirm[y * this.w + x] && this.dirm[y * this.w + x] < 3 &&
      onStreet(this.deco[y * this.w + x]) && !this.cross[y * this.w + x];
    const put = (x, y, pr) => {
      for (const [tx, ty] of pr.tiles) { this.grid[ty * this.w + tx] = T_WALL; this.deco[ty * this.w + tx] = D_PROP; }
      this.props.push(pr);
    };

    // 승용차 · 택시 — 한 칸
    const cars = Math.floor(blocks * blocks * 1.4);
    for (let i = 0; i < cars; i++) {
      const x = 1 + Math.floor(rng() * (this.w - 2)), y = 1 + Math.floor(rng() * (this.h - 2));
      if (!freeRoad(x, y)) continue;
      const vertical = this.dirm[y * this.w + x] === 1;
      const kind = T.small && rng() < 0.3 ? T.small : 'car';
      put(x, y, { x: x * TILE + TILE / 2, y: y * TILE + TILE / 2,
        // 열에 셋은 경보기가 달려 있다 (생성 순서를 흔들지 않게 난수 대신 좌표 해시)
        alarm: kind === 'car' && (((x * 92837111) ^ (y * 689287499)) >>> 0) % 10 < 3,
        kind, col: T.carCols[(rng() * T.carCols.length) | 0],
        a: (rng() - 0.5) * 0.5 + (vertical ? Math.PI / 2 : 0),
        w: kind === 'car' ? 40 : 30, h: kind === 'car' ? 21 : 19, tiles: [[x, y]] });
    }
    // 버스 · 트럭 · 컨테이너 — 두 칸, 도로 방향으로
    const longs = Math.floor(blocks * blocks * 0.6);
    for (let i = 0; i < longs; i++) {
      const x = 1 + Math.floor(rng() * (this.w - 2)), y = 1 + Math.floor(rng() * (this.h - 2));
      if (!freeRoad(x, y)) continue;
      const vertical = this.dirm[y * this.w + x] === 1;
      const x2 = x + (vertical ? 0 : 1), y2 = y + (vertical ? 1 : 0);
      if (!freeRoad(x2, y2)) continue;
      const bus = rng() < 0.45;
      put(x, y, { x: (x + x2) / 2 * TILE + TILE / 2, y: (y + y2) / 2 * TILE + TILE / 2,
        kind: bus ? 'bus' : 'box', col: bus ? T.busCol : BOX_COLS[(rng() * BOX_COLS.length) | 0],
        a: vertical ? Math.PI / 2 : 0, w: 90, h: bus ? 36 : 40, tiles: [[x, y], [x2, y2]] });
    }
    // 강 위의 배 (장식)
    if (this.river) {
      for (let i = 0; i < 3; i++) {
        const x = 3 + Math.floor(rng() * (this.w - 6));
        if (this.deco[(this.river.y0 + 1) * this.w + x] !== D_WATER) continue;
        this.decor.push({ kind: 'boat', x: x * TILE, y: (this.river.y0 + 1.5 + rng() * 1.5) * TILE, a: (rng() - 0.5) * 0.4 });
      }
    }
    // 나라별 길가 장식 — 자판기(도쿄) · 노점 수레(방콕) · 편의점 파라솔(서울)
    const kinds = T.streetDecor || [];
    if (kinds.length) {
      const n = Math.floor(blocks * blocks * 1.2);
      for (let i = 0; i < n; i++) {
        const x = 1 + Math.floor(rng() * (this.w - 2)), y = 1 + Math.floor(rng() * (this.h - 2));
        const i0 = y * this.w + x;
        if (this.grid[i0] !== T_ROAD || this.deco[i0] !== D_ASPHALT) continue;
        const wall = this.at(x, y - 1) === T_WALL ? 'n' : this.at(x - 1, y) === T_WALL ? 'w' : this.at(x + 1, y) === T_WALL ? 'e' : null;
        if (!wall || this.dirm[i0] === 3 || this.cross[i0]) continue;
        this.decor.push({ kind: kinds[i % kinds.length], x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, wall,
          col: T.signCols[i % T.signCols.length] });
      }
    }
  }

  /** 건물에 접한 도로를 인도로 표시 (렌더 전용) */
  markSidewalks() {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        if (this.grid[i] !== T_ROAD || this.deco[i] !== D_ASPHALT || this.dirm[i] === 3) continue;
        const b = (xx, yy) => this.at(xx, yy) === T_WALL && this.deco[yy * this.w + xx] === D_BUILDING;
        if (b(x + 1, y) || b(x - 1, y) || b(x, y + 1) || b(x, y - 1)) this.deco[i] = D_SIDEWALK;
      }
    }
  }

  /**
   * 이중 BFS 로 도로망의 양 끝(지름)을 찾아 시작점과 탈출점으로 삼는다.
   * 탈출점은 항상 시작점에서 도달 가능하므로 클리어 불가능한 맵이 나오지 않는다.
   */
  bfs(startIdx) {
    const n = this.w * this.h;
    const dist = new Int32Array(n).fill(-1);
    const q = new Int32Array(n);
    let head = 0, tail = 0, far = startIdx;
    dist[startIdx] = 0; q[tail++] = startIdx;
    while (head < tail) {
      const cur = q[head++];
      if (dist[cur] > dist[far]) far = cur;
      const cx = cur % this.w, cy = (cur / this.w) | 0;
      const nb = [this.idx(cx + 1, cy), this.idx(cx - 1, cy), this.idx(cx, cy + 1), this.idx(cx, cy - 1)];
      for (let k = 0; k < 4; k++) {
        const ni = nb[k];
        if (dist[ni] !== -1 || this.grid[ni] !== T_ROAD) continue;
        dist[ni] = dist[cur] + 1; q[tail++] = ni;
      }
    }
    return { dist, far };
  }

  pickEndpoints(goal) {
    let seed = -1;
    for (let y = 1; y < this.h - 1 && seed < 0; y++)
      for (let x = 1; x < this.w - 1; x++)
        if (this.at(x, y) === T_ROAD) { seed = y * this.w + x; break; }

    // 집결지가 랜드마크로 정해져 있으면 그곳에서 재고, 아니면 도로망의 지름 양 끝
    const lm = goal && this.landmarks.find(l => l.id === goal && l.rally);
    let b;
    if (lm) {
      const ri = lm.rally.ty * this.w + lm.rally.tx;
      b = this.bfs(ri);
      b.exitIdx = ri;
    }
    if (lm && b.far !== b.exitIdx) {
      // 랜드마크에서 잰 거리이므로, 가장 먼 쪽(= 거리 큰 곳)에서 시작한다
      this.toExit = b.dist;
      this.reach = [];
      for (let i = 0; i < b.dist.length; i++) if (b.dist[i] >= 0) this.reach.push(i);
      this.exit = this.tileCenter(b.exitIdx);
      this.maxDist = b.dist[b.far];
      this.spawn = this.tileCenter(this.startTile(b.dist, this.maxDist, true));
      return;
    }

    const a = this.bfs(seed);
    b = this.bfs(a.far);
    this.reach = [];
    for (let i = 0; i < b.dist.length; i++) if (b.dist[i] >= 0) this.reach.push(i);
    this.exit = this.tileCenter(b.far);
    this.maxDist = b.dist[b.far];
    this.spawn = this.tileCenter(this.startTile(b.dist, b.dist[b.far]));
    this.toExit = this.bfs(b.far).dist;               // 출구까지의 도로 거리 — "지나온 길" 판정에 쓴다
  }

  /**
   * dist 는 반대편 끝점에서 잰 거리다. 그 끝점 근처(= 탈출점에서 가장 먼 구역) 중
   * 지도 가장자리에서 가장 떨어진 개활지를 시작점으로 삼아 코너 끼임을 막는다.
   */
  startTile(dist, maxD, far) {
    let best = -1, bestScore = -1;
    for (const i of this.reach) {
      if (far ? dist[i] < maxD * 0.84 : dist[i] > maxD * 0.16) continue;
      const x = i % this.w, y = (i / this.w) | 0;
      const border = Math.min(x, y, this.w - 1 - x, this.h - 1 - y);
      const score = Math.min(border, 8) * 6 + this.roadNeighbours(x, y) * 2 - (far ? maxD - dist[i] : dist[i]) * 0.12;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best >= 0 ? best : this.reach[0];
  }

  tileCenter(idx) {
    return { x: (idx % this.w + 0.5) * TILE, y: (((idx / this.w) | 0) + 0.5) * TILE };
  }

  /** 도달 가능한 도로 중 조건에 맞는 지점을 고른다 */
  pickPoint(fromX, fromY, minD, maxD, rng) {
    const r = rng || this.rng;
    // 후보는 원본 지도의 칸 — 기준점에 가장 가까운 복사본으로 옮겨 잰다
    for (let tries = 0; tries < 220; tries++) {
      const idx = this.reach[Math.floor(r() * this.reach.length)];
      const c = this.tileCenter(idx), p = this.near(c.x, c.y, fromX, fromY);
      const d = Math.hypot(p.x - fromX, p.y - fromY);
      if (d >= minD && d <= maxD) return p;
    }
    const c = this.tileCenter(this.reach[Math.floor(r() * this.reach.length)]);
    return this.near(c.x, c.y, fromX, fromY);
  }

  /* ── 충돌 ──────────────────────────────── */
  solid(px, py) { return this.at(Math.floor(px / TILE), Math.floor(py / TILE)) === T_WALL; }

  /**
   * 칸의 충돌 모양. 건물·물·랜드마크는 칸 전체지만, 차·버스는 실제 차체 크기(회전을 감싼 사각형),
   * 나무는 줄기 둘레의 원이다 — 칸을 통째로 막으면 보이지 않는 벽에 걸린다.
   * 반환: null(막지 않음) | {x0,y0,x1,y1} | {cx,cy,r}
   */
  shapeAt(tx, ty) {
    const i = this.idx(tx, ty);
    if (this.grid[i] === T_ROAD) return null;
    const sp = this.shapes && this.shapes.get(i);
    if (!sp) return { x0: tx * TILE, y0: ty * TILE, x1: (tx + 1) * TILE, y1: (ty + 1) * TILE };
    // 저장된 모양은 원본 지도 좌표 — 이어 붙은 복사본이면 그만큼 옮긴다
    const ox = (tx - i % this.w) * TILE, oy = (ty - ((i / this.w) | 0)) * TILE;
    if (!ox && !oy) return sp;
    return sp.r !== undefined ? { cx: sp.cx + ox, cy: sp.cy + oy, r: sp.r }
      : { x0: sp.x0 + ox, y0: sp.y0 + oy, x1: sp.x1 + ox, y1: sp.y1 + oy };
  }
  buildShapes() {
    this.shapes = new Map();
    for (const pr of this.props) {
      const c = Math.abs(Math.cos(pr.a)), s = Math.abs(Math.sin(pr.a));
      const hw = (pr.w * c + pr.h * s) / 2 * 0.92, hh = (pr.w * s + pr.h * c) / 2 * 0.92;
      const box = { x0: pr.x - hw, y0: pr.y - hh, x1: pr.x + hw, y1: pr.y + hh };
      for (const [tx, ty] of pr.tiles) {
        const X0 = tx * TILE, Y0 = ty * TILE;
        this.shapes.set(ty * this.w + tx, { x0: Math.max(X0, box.x0), y0: Math.max(Y0, box.y0), x1: Math.min(X0 + TILE, box.x1), y1: Math.min(Y0 + TILE, box.y1) });
      }
    }
    for (const d of this.decor) if (d.kind === 'tree')
      this.shapes.set(Math.floor(d.y / TILE) * this.w + Math.floor(d.x / TILE), { cx: d.x, cy: d.y, r: 13 });
  }

  /** 원(px,py,r)과 겹치는 모양들을 돌며 fn(밀어낼 방향 x, y, 깊이) — 깊이 > 0 이면 겹침 */
  overlaps(px, py, r, fn) {
    const x0 = Math.floor((px - r) / TILE), x1 = Math.floor((px + r) / TILE);
    const y0 = Math.floor((py - r) / TILE), y1 = Math.floor((py + r) / TILE);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const sh = this.shapeAt(x, y);
      if (!sh) continue;
      let nx, ny, depth;
      if (sh.r !== undefined) {
        const dx = px - sh.cx, dy = py - sh.cy, d = Math.hypot(dx, dy);
        depth = r + sh.r - d;
        if (depth <= 0) continue;
        nx = d > 1e-6 ? dx / d : 1; ny = d > 1e-6 ? dy / d : 0;
      } else {
        const cx = Math.max(sh.x0, Math.min(px, sh.x1)), cy = Math.max(sh.y0, Math.min(py, sh.y1));
        const dx = px - cx, dy = py - cy, d = Math.hypot(dx, dy);
        if (d > 1e-6) { depth = r - d; if (depth <= 0) continue; nx = dx / d; ny = dy / d; }
        else {
          // 중심이 사각형 안 — 가장 얕은 면으로 꺼낸다
          const l = px - sh.x0, rr = sh.x1 - px, t = py - sh.y0, bb = sh.y1 - py, m = Math.min(l, rr, t, bb);
          if (m === l) { nx = -1; ny = 0; } else if (m === rr) { nx = 1; ny = 0; } else if (m === t) { nx = 0; ny = -1; } else { nx = 0; ny = 1; }
          depth = m + r;
        }
      }
      if (fn(nx, ny, depth) === true) return true;
    }
    return false;
  }

  /** 원(px,py,r)이 벽·물·구조물과 겹치는가 */
  hits(px, py, r) {
    return this.overlaps(px, py, r, () => true);
  }

  /**
   * 이동 — 먼저 움직이고, 겹친 만큼 면(또는 모서리)의 법선 방향으로 밀어낸다.
   * 축을 나눠 막던 예전 방식은 볼록한 모서리를 몇 px 만 걸쳐도 그 자리에 멈췄다(측정: 738회 중 738회).
   * 밀어내기는 모서리를 둥글게 돌아 미끄러지고, 이미 겹쳐 있어도 스스로 빠져나온다.
   */
  slide(e, dx, dy) {
    const x0 = e.x, y0 = e.y;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (e.r * 0.5)));
    const sx = dx / n, sy = dy / n, want = Math.hypot(sx, sy);
    for (let k = 0; k < n; k++) {
      const bx = e.x, by = e.y;
      e.x += sx; e.y += sy;
      this.depenetrate(e);
      // 모서리 꼭짓점을 정면으로 밀면 밀어내기와 이동이 맞서 멈춘다 — 그때는 트인 축 하나로 비켜 간다
      if (Math.hypot(e.x - bx, e.y - by) < want * 0.2 && sx && sy) {
        for (const [ax, ay] of Math.abs(sx) >= Math.abs(sy) ? [[sx, 0], [0, sy]] : [[0, sy], [sx, 0]]) {
          e.x = bx + ax; e.y = by + ay;
          this.depenetrate(e);
          if (Math.hypot(e.x - bx, e.y - by) >= want * 0.2) break;
          e.x = bx; e.y = by;
        }
      }
    }
    return Math.abs(e.x - x0) + Math.abs(e.y - y0) > 0.01;
  }
  depenetrate(e) {
    for (let it = 0; it < 4; it++) {
      let any = false;
      this.overlaps(e.x, e.y, e.r, (nx, ny, depth) => { e.x += nx * (depth + 0.01); e.y += ny * (depth + 0.01); any = true; });
      if (!any) return;
    }
  }

  /* ── 시야 (DDA 레이캐스트) ──────────────── */
  /** over = 빛처럼 낮은 탈것 위로는 지나간다 (차 한 대가 칸 모양의 그늘을 만들지 않게) */
  ray(ox, oy, ang, maxD, over = false) {
    if (this.solid(ox, oy)) return 0;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const px = ox / TILE, py = oy / TILE;
    let mx = Math.floor(px), my = Math.floor(py);
    const ddx = dx === 0 ? 1e30 : Math.abs(1 / dx);
    const ddy = dy === 0 ? 1e30 : Math.abs(1 / dy);
    let stepX, stepY, sx, sy;
    if (dx < 0) { stepX = -1; sx = (px - mx) * ddx; } else { stepX = 1; sx = (mx + 1 - px) * ddx; }
    if (dy < 0) { stepY = -1; sy = (py - my) * ddy; } else { stepY = 1; sy = (my + 1 - py) * ddy; }

    const maxT = maxD / TILE;
    let t = 0;
    while (t < maxT) {
      if (sx < sy) { t = sx; sx += ddx; mx += stepX; }
      else { t = sy; sy += ddy; my += stepY; }
      const i = this.idx(mx, my);
      if (this.grid[i] === T_WALL && !(over && this.deco[i] === D_PROP)) return Math.min(t * TILE, maxD);
    }
    return maxD;
  }

  /** 두 점 사이가 트여 있는가 */
  los(x1, y1, x2, y2, over = false) {
    const d = Math.hypot(x2 - x1, y2 - y1);
    if (d < 1) return true;
    return this.ray(x1, y1, Math.atan2(y2 - y1, x2 - x1), d + 1, over) >= d - 1;
  }

  /* ── 추격 경로 (흐름장) ─────────────────────
     플레이어 칸에서 도로망을 따라 BFS 거리를 깐다. 시야가 막힌 감염체는 거리가 줄어드는
     이웃 칸으로 걸어, 건물 뒤에 끼지 않고 골목을 돌아 들어온다. */
  updateFlow(px, py) {
    const W = this.w, H = this.h, N = W * H;
    if (!this.flow) { this.flow = new Int16Array(N); this.flowQ = new Int32Array(N); }
    const D = this.flow, q = this.flowQ;
    D.fill(-1);
    const s0 = this.idx(Math.floor(px / TILE), Math.floor(py / TILE));
    let head = 0, tail = 0;
    D[s0] = 0; q[tail++] = s0;
    while (head < tail) {
      const c = q[head++], x = c % W, y = (c - x) / W, nd = D[c] + 1;
      if (nd > 60) continue;                              // 60칸(약 2.9km) 너머는 필요 없다
      // 이어 붙은 지도 — 가장자리 너머는 반대편 칸
      const l = x > 0 ? c - 1 : c + W - 1, r = x < W - 1 ? c + 1 : c - W + 1;
      const u = y > 0 ? c - W : c + (H - 1) * W, d = y < H - 1 ? c + W : c - (H - 1) * W;
      if (D[l] < 0 && this.grid[l] === T_ROAD) { D[l] = nd; q[tail++] = l; }
      if (D[r] < 0 && this.grid[r] === T_ROAD) { D[r] = nd; q[tail++] = r; }
      if (D[u] < 0 && this.grid[u] === T_ROAD) { D[u] = nd; q[tail++] = u; }
      if (D[d] < 0 && this.grid[d] === T_ROAD) { D[d] = nd; q[tail++] = d; }
    }
  }
  /** (x, y) 에서 플레이어 쪽으로 가는 다음 칸의 중심 방향. 모르면 null */
  flowDir(x, y) {
    const D = this.flow;
    if (!D) return null;
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    const here = D[this.idx(tx, ty)];
    let best = here < 0 ? 1e9 : here, bx = 0, by = 0, found = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const v = D[this.idx(tx + dx, ty + dy)];
      if (v >= 0 && v < best) { best = v; bx = tx + dx; by = ty + dy; found = true; }
    }
    if (!found) return null;
    return Math.atan2((by + 0.5) * TILE - y, (bx + 0.5) * TILE - x);
  }

  /** 손전등 원뿔의 가시 폴리곤 (벽에 가려진다) */
  conePoly(px, py, ang, half, range, rays) {
    const pts = [px, py];
    for (let i = 0; i <= rays; i++) {
      const a = ang - half + (2 * half) * (i / rays);
      const d = this.ray(px, py, a, range, true);
      pts.push(px + Math.cos(a) * d, py + Math.sin(a) * d);
    }
    return pts;
  }
}
