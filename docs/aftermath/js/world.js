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
    this.placeProps(rng, blocks);
    this.markSidewalks();
    this.pickEndpoints(opts.goal);
    this.indexProps();

    // 구조물이 도로망을 지나치게 끊었으면 전부 치우고 다시 계산한다
    if (this.maxDist < blocks * 8) {
      for (const pr of this.props)
        for (const [tx, ty] of pr.tiles) { this.set(tx, ty, T_ROAD); this.deco[ty * this.w + tx] = D_ASPHALT; }
      this.props = [];
      this.markSidewalks();
      this.pickEndpoints(opts.goal);
      this.indexProps();
    }
  }

  /** 칸 → 구조물 번호 (총알·폭발이 무엇을 맞혔는지 알기 위해) */
  indexProps() {
    this.propAt = new Int16Array(this.w * this.h).fill(-1);
    this.props.forEach((pr, i) => { for (const [tx, ty] of pr.tiles) this.propAt[ty * this.w + tx] = i; });
  }
  propNear(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return null;
    const i = this.propAt[ty * this.w + tx];
    return i >= 0 ? this.props[i] : null;
  }

  /* ── 격자 접근 ─────────────────────────── */
  at(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return T_WALL;
    return this.grid[y * this.w + x];
  }
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
    const B = 1, out = [];
    const blvd = [Math.round(len * (0.3 + rng() * 0.08)), Math.round(len * (0.62 + rng() * 0.08))];
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
    const W = this.w, H = this.h, B = 1;
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
        const bv = vs.filter(v => v.blvd), bh = hs.filter(h => h.blvd);
        if (!bv.length || !bh.length) continue;
        const v = bv[ids.indexOf(id) % bv.length], h = bh[(ids.indexOf(id) + 1) % bh.length];
        const lm = L.stamp(this, v, h, rng);
        if (lm) {
          this.landmarks.push(Object.assign(lm, { id, name: L.name }));
          for (const b of blocksList) if (lm.x - 1 < b.x + b.w && b.x < lm.x + lm.w + 1 && lm.y - 1 < b.y + b.h && b.y < lm.y + lm.h + 1) b.used = 'edge';
        }
        continue;
      }
      // 발자국이 들어가는 블록 중 지도 중심에 가까운 것
      const fit = blocksList.filter(b => !b.used && b.w >= L.w && b.h >= L.h)
        .sort((a, b) => Math.hypot(a.x + a.w / 2 - cx, a.y + a.h / 2 - cy) - Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy));
      let blk = fit[Math.min(fit.length - 1, Math.floor(rng() * Math.min(3, fit.length)))];
      // 맞는 블록이 없으면 도시 한가운데를 밀어 자리를 낸다 — 궁궐이 길을 끊듯 길이 그 앞에서 끝난다
      if (!blk) blk = this.clearSite(L.w, L.h);
      if (!blk) continue;
      blk.used = true;
      this.fill(blk.x, blk.y, blk.w, blk.h, T_ROAD, L.ground);
      const ox = blk.x + Math.floor((blk.w - L.w) / 2), oy = blk.y + Math.floor((blk.h - L.h) / 2);
      const lm = L.stamp(this, ox, oy, rng, blk);
      if (lm) this.landmarks.push(Object.assign(lm, { id, name: L.name, block: blk }));
    }

    // 나머지 블록: 공원 · 광장 · 주차장 · 건물 (필지로 나누고 골목을 낸다)
    let lotId = 1;
    for (const b of blocksList) {
      if (b.used === true) continue;               // 'edge' (교차로 랜드마크 옆) 은 건물로 채운다
      const r = rng();
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
  clearSite(fw, fh) {
    const W = this.w, H = this.h, cx = Math.floor(W / 2 - fw / 2), cy = Math.floor(H / 2 - fh / 2);
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
    const freeRoad = (x, y) =>
      this.at(x, y) === T_ROAD && this.roadNeighbours(x, y) >= 5 && this.dirm[y * this.w + x] && this.dirm[y * this.w + x] < 3 &&
      this.deco[y * this.w + x] !== D_LANDMARK && !this.cross[y * this.w + x];
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
    for (let y = 1; y < this.h - 1; y++) {
      for (let x = 1; x < this.w - 1; x++) {
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
      const nb = [cur + 1, cur - 1, cur + this.w, cur - this.w];
      const ok = [cx + 1 < this.w, cx - 1 >= 0, cy + 1 < this.h, cy - 1 >= 0];
      for (let k = 0; k < 4; k++) {
        if (!ok[k]) continue;
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
    for (let tries = 0; tries < 220; tries++) {
      const idx = this.reach[Math.floor(r() * this.reach.length)];
      const p = this.tileCenter(idx);
      const d = Math.hypot(p.x - fromX, p.y - fromY);
      if (d >= minD && d <= maxD) return p;
    }
    return this.tileCenter(this.reach[Math.floor(r() * this.reach.length)]);
  }

  /* ── 충돌 ──────────────────────────────── */
  solid(px, py) { return this.at(Math.floor(px / TILE), Math.floor(py / TILE)) === T_WALL; }

  /** 원(px,py,r)이 벽과 겹치는가 */
  hits(px, py, r) {
    const x0 = Math.floor((px - r) / TILE), x1 = Math.floor((px + r) / TILE);
    const y0 = Math.floor((py - r) / TILE), y1 = Math.floor((py + r) / TILE);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (this.at(x, y) === T_ROAD) continue;         // 벽과 물 모두 막는다
        const cx = Math.max(x * TILE, Math.min(px, x * TILE + TILE));
        const cy = Math.max(y * TILE, Math.min(py, y * TILE + TILE));
        const dx = px - cx, dy = py - cy;
        if (dx * dx + dy * dy < r * r) return true;
      }
    }
    return false;
  }

  /** 축 분리 이동 — 벽을 따라 미끄러진다 */
  slide(e, dx, dy) {
    let moved = false;
    if (dx && !this.hits(e.x + dx, e.y, e.r)) { e.x += dx; moved = true; }
    if (dy && !this.hits(e.x, e.y + dy, e.r)) { e.y += dy; moved = true; }
    return moved;
  }

  /* ── 시야 (DDA 레이캐스트) ──────────────── */
  ray(ox, oy, ang, maxD) {
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
      if (mx < 0 || my < 0 || mx >= this.w || my >= this.h) return maxD;
      if (this.grid[my * this.w + mx] === T_WALL) return Math.min(t * TILE, maxD);
    }
    return maxD;
  }

  /** 두 점 사이가 트여 있는가 */
  los(x1, y1, x2, y2) {
    const d = Math.hypot(x2 - x1, y2 - y1);
    if (d < 1) return true;
    return this.ray(x1, y1, Math.atan2(y2 - y1, x2 - x1), d + 1) >= d - 1;
  }

  /* ── 추격 경로 (흐름장) ─────────────────────
     플레이어 칸에서 도로망을 따라 BFS 거리를 깐다. 시야가 막힌 감염체는 거리가 줄어드는
     이웃 칸으로 걸어, 건물 뒤에 끼지 않고 골목을 돌아 들어온다. */
  updateFlow(px, py) {
    const W = this.w, H = this.h, N = W * H;
    if (!this.flow) { this.flow = new Int16Array(N); this.flowQ = new Int32Array(N); }
    const D = this.flow, q = this.flowQ;
    D.fill(-1);
    const sx = Math.floor(px / TILE), sy = Math.floor(py / TILE);
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) return;
    let head = 0, tail = 0;
    D[sy * W + sx] = 0; q[tail++] = sy * W + sx;
    while (head < tail) {
      const c = q[head++], x = c % W, y = (c - x) / W, nd = D[c] + 1;
      if (nd > 60) continue;                              // 60칸(약 2.9km) 너머는 필요 없다
      if (x > 0     && D[c - 1] < 0 && this.grid[c - 1] === T_ROAD) { D[c - 1] = nd; q[tail++] = c - 1; }
      if (x < W - 1 && D[c + 1] < 0 && this.grid[c + 1] === T_ROAD) { D[c + 1] = nd; q[tail++] = c + 1; }
      if (y > 0     && D[c - W] < 0 && this.grid[c - W] === T_ROAD) { D[c - W] = nd; q[tail++] = c - W; }
      if (y < H - 1 && D[c + W] < 0 && this.grid[c + W] === T_ROAD) { D[c + W] = nd; q[tail++] = c + W; }
    }
  }
  /** (x, y) 에서 플레이어 쪽으로 가는 다음 칸의 중심 방향. 모르면 null */
  flowDir(x, y) {
    const D = this.flow;
    if (!D) return null;
    const W = this.w, tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    const here = D[ty * W + tx];
    let best = here < 0 ? 1e9 : here, bx = -1, by = -1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = tx + dx, ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= this.h) continue;
      const v = D[ny * W + nx];
      if (v >= 0 && v < best) { best = v; bx = nx; by = ny; }
    }
    if (bx < 0) return null;
    return Math.atan2((by + 0.5) * TILE - y, (bx + 0.5) * TILE - x);
  }

  /** 손전등 원뿔의 가시 폴리곤 (벽에 가려진다) */
  conePoly(px, py, ang, half, range, rays) {
    const pts = [px, py];
    for (let i = 0; i <= rays; i++) {
      const a = ang - half + (2 * half) * (i / rays);
      const d = this.ray(px, py, a, range);
      pts.push(px + Math.cos(a) * d, py + Math.sin(a) * d);
    }
    return pts;
  }
}
