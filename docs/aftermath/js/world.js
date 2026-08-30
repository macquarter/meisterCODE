/* ═══════════════════════════════════════════
   AFTERMATH — 잔존 : 도시 생성 · 충돌 · 시야
   ═══════════════════════════════════════════ */
const TILE = 48;

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

const T_ROAD = 0, T_WALL = 1;
const D_ASPHALT = 0, D_SIDEWALK = 1, D_BUILDING = 2, D_RUBBLE = 3, D_PROP = 4;

/* 도로 격자: 블록 주기 11 중 0,1 열/행이 차도 */
const isRoadLane = v => (v % 11) === 0 || (v % 11) === 1;

class World {
  constructor(seed, blocks) {
    const rng = makeRng(seed);
    this.rng = rng;
    const P = 11, PAD = 2;                    // 블록 주기 11타일(건물 9 + 도로 2)
    this.w = blocks * P + PAD * 2;
    this.h = blocks * P + PAD * 2;
    this.grid = new Uint8Array(this.w * this.h);
    this.deco = new Uint8Array(this.w * this.h);

    // 외곽 봉쇄벽
    for (let x = 0; x < this.w; x++) { this.set(x, 0, T_WALL); this.set(x, this.h - 1, T_WALL); }
    for (let y = 0; y < this.h; y++) { this.set(0, y, T_WALL); this.set(this.w - 1, y, T_WALL); }

    // 도시 블록
    for (let by = 0; by < blocks; by++) {
      for (let bx = 0; bx < blocks; bx++) {
        this.carveBlock(PAD + bx * P, PAD + by * P, 9, rng);
      }
    }

    // 도로 위 구조물: 전복 차량과 적재 컨테이너
    this.props = [];
    this.placeProps(rng, blocks);

    this.markSidewalks();
    this.markCrossings();
    this.pickEndpoints();

    // 구조물이 도로망을 지나치게 끊었으면 전부 치우고 다시 계산한다
    if (this.maxDist < blocks * 8) {
      for (const pr of this.props)
        for (const [tx, ty] of pr.tiles) this.set(tx, ty, T_ROAD);
      this.props = [];
      this.markSidewalks();
      this.pickEndpoints();
    }
  }

  /* ── 격자 접근 ─────────────────────────── */
  at(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return T_WALL;
    return this.grid[y * this.w + x];
  }
  set(x, y, v) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.grid[y * this.w + x] = v;
    this.deco[y * this.w + x] = v ? D_BUILDING : D_ASPHALT;
  }
  fill(x0, y0, w, h, v) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, v);
  }
  roadNeighbours(x, y) {
    let n = 0;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++)
      if ((i || j) && this.at(x + i, y + j) === T_ROAD) n++;
    return n;
  }

  /** 한 블록을 건물/공터/안뜰/붕괴지로 조각낸다 */
  carveBlock(x0, y0, s, rng) {
    const kind = rng();
    this.fill(x0, y0, s, s, T_WALL);

    if (kind < 0.16) {
      // 공터·주차장: 기둥 몇 개만 남긴다
      this.fill(x0, y0, s, s, T_ROAD);
      const pillars = 2 + Math.floor(rng() * 4);
      for (let i = 0; i < pillars; i++) {
        const px = x0 + 1 + Math.floor(rng() * (s - 2));
        const py = y0 + 1 + Math.floor(rng() * (s - 2));
        this.set(px, py, T_WALL);
      }
      return;
    }
    if (kind < 0.42) {
      // 안뜰이 뚫린 블록
      const cs = 3 + Math.floor(rng() * 2);
      const cx = x0 + Math.floor((s - cs) / 2), cy = y0 + Math.floor((s - cs) / 2);
      this.fill(cx, cy, cs, cs, T_ROAD);
      // 안뜰로 들어가는 통로
      if (rng() < 0.5) this.fill(cx + Math.floor(cs / 2), y0, 1, cy - y0, T_ROAD);
      else this.fill(x0, cy + Math.floor(cs / 2), cx - x0, 1, T_ROAD);
      return;
    }
    if (kind < 0.66) {
      // 블록을 관통하는 뒷골목
      if (rng() < 0.5) this.fill(x0, y0 + 2 + Math.floor(rng() * (s - 4)), s, 1, T_ROAD);
      else this.fill(x0 + 2 + Math.floor(rng() * (s - 4)), y0, 1, s, T_ROAD);
      return;
    }
    if (kind < 0.82) {
      // 무너진 모서리
      const cw = 3 + Math.floor(rng() * 3);
      const rx = rng() < 0.5 ? x0 : x0 + s - cw;
      const ry = rng() < 0.5 ? y0 : y0 + s - cw;
      this.fill(rx, ry, cw, cw, T_ROAD);
      for (let i = 0; i < 3; i++) {
        const px = rx + Math.floor(rng() * cw), py = ry + Math.floor(rng() * cw);
        this.set(px, py, T_WALL); this.deco[py * this.w + px] = D_RUBBLE;
      }
      return;
    }
    // 그 외: 통짜 건물 (기본값 유지)
  }

  /** 트레일러의 거리 풍경: 버려진 차량과 색색의 화물 컨테이너 */
  placeProps(rng, blocks) {
    const CAR_COLS = ['#2f4a63', '#5c2c28', '#3d4a3a', '#4a4640', '#26363f'];
    const BOX_COLS = ['#7a3129', '#2b5a72', '#6b5a24', '#3f6b45'];

    const freeRoad = (x, y) =>
      this.at(x, y) === T_ROAD && this.roadNeighbours(x, y) >= 5;

    // 전복 차량 — 2차선 중 한 칸만 막는다
    const cars = Math.floor(blocks * blocks * 1.5);
    for (let i = 0; i < cars; i++) {
      const x = 1 + Math.floor(rng() * (this.w - 2));
      const y = 1 + Math.floor(rng() * (this.h - 2));
      if (!freeRoad(x, y)) continue;
      this.set(x, y, T_WALL);
      this.deco[y * this.w + x] = D_PROP;
      this.props.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2,
        kind: 'car', col: CAR_COLS[(rng() * CAR_COLS.length) | 0],
        a: (rng() - 0.5) * 0.5 + (isRoadLane(x) ? Math.PI / 2 : 0),
        w: 40, h: 21, tiles: [[x, y]] });
    }

    // 화물 컨테이너 — 도로 방향으로만 눕혀 통행을 남긴다
    const boxes = Math.floor(blocks * blocks * 0.8);
    for (let i = 0; i < boxes; i++) {
      const x = 1 + Math.floor(rng() * (this.w - 2));
      const y = 1 + Math.floor(rng() * (this.h - 2));
      const vertical = isRoadLane(x);
      const x2 = x + (vertical ? 0 : 1), y2 = y + (vertical ? 1 : 0);
      if (!freeRoad(x, y) || !freeRoad(x2, y2)) continue;
      this.set(x, y, T_WALL); this.set(x2, y2, T_WALL);
      this.deco[y * this.w + x] = D_PROP;
      this.deco[y2 * this.w + x2] = D_PROP;
      const col = BOX_COLS[(rng() * BOX_COLS.length) | 0];
      this.props.push({ x: (x + x2) / 2 * TILE + TILE / 2, y: (y + y2) / 2 * TILE + TILE / 2,
        kind: 'box', col, a: vertical ? Math.PI / 2 : 0, w: 90, h: 40,
        tiles: [[x, y], [x2, y2]] });
    }
  }

  /** 교차로 앞 횡단보도 표시 (렌더 전용) */
  markCrossings() {
    this.cross = new Uint8Array(this.w * this.h);
    for (let y = 1; y < this.h - 1; y++) {
      for (let x = 1; x < this.w - 1; x++) {
        if (this.at(x, y) !== T_ROAD) continue;
        const rx = isRoadLane(x), ry = isRoadLane(y);
        if (rx && !ry && (y % 11 === 2 || y % 11 === 10)) this.cross[y * this.w + x] = 1;
        else if (ry && !rx && (x % 11 === 2 || x % 11 === 10)) this.cross[y * this.w + x] = 2;
      }
    }
  }

  /** 건물에 접한 도로를 인도로 표시 (렌더 전용) */
  markSidewalks() {
    for (let y = 1; y < this.h - 1; y++) {
      for (let x = 1; x < this.w - 1; x++) {
        if (this.at(x, y) !== T_ROAD) continue;
        if (this.at(x + 1, y) === T_WALL || this.at(x - 1, y) === T_WALL ||
            this.at(x, y + 1) === T_WALL || this.at(x, y - 1) === T_WALL) {
          this.deco[y * this.w + x] = D_SIDEWALK;
        }
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
        if (dist[ni] !== -1 || this.grid[ni] === T_WALL) continue;
        dist[ni] = dist[cur] + 1; q[tail++] = ni;
      }
    }
    return { dist, far };
  }

  pickEndpoints() {
    let seed = -1;
    for (let y = 1; y < this.h - 1 && seed < 0; y++)
      for (let x = 1; x < this.w - 1; x++)
        if (this.at(x, y) === T_ROAD) { seed = y * this.w + x; break; }

    const a = this.bfs(seed);
    const b = this.bfs(a.far);

    this.dist = b.dist;
    this.reach = [];
    for (let i = 0; i < b.dist.length; i++) if (b.dist[i] >= 0) this.reach.push(i);

    this.exit = this.tileCenter(b.far);
    this.maxDist = b.dist[b.far];
    this.spawn = this.tileCenter(this.startTile(b.dist, b.dist[b.far]));
  }

  /**
   * dist 는 반대편 끝점에서 잰 거리다. 그 끝점 근처(= 탈출점에서 가장 먼 구역) 중
   * 지도 가장자리에서 가장 떨어진 개활지를 시작점으로 삼아 코너 끼임을 막는다.
   */
  startTile(dist, maxD) {
    let best = -1, bestScore = -1;
    for (const i of this.reach) {
      if (dist[i] > maxD * 0.16) continue;
      const x = i % this.w, y = (i / this.w) | 0;
      const border = Math.min(x, y, this.w - 1 - x, this.h - 1 - y);
      const score = Math.min(border, 8) * 6 + this.roadNeighbours(x, y) * 2 - dist[i] * 0.12;
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
        if (this.at(x, y) !== T_WALL) continue;
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
