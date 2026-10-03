// 아이소메트릭 3D 투시 장면: 벽 속 배관 + 누수 지점
// <svg class="iso" data-scan="1"></svg> 를 찾아 그린다. Pretendard 외 글꼴은 쓰지 않는다.
(function () {
  const C30 = Math.cos(Math.PI / 6), S30 = 0.5;
  function scene(svg) {
    const W = 300, H = 300, s = 15.5, ox = 150, oy = 92;
    const P = (x, y, z) => [ox + (x - y) * C30 * s, oy + (x + y) * S30 * s - z * s];
    const pts = (a) => a.map((p) => P(...p).map((v) => v.toFixed(1)).join(",")).join(" ");
    const poly = (a, fill, extra = "") => `<polygon points="${pts(a)}" fill="${fill}" ${extra}/>`;
    const line = (a, b, stroke, w, extra = "") => {
      const [x1, y1] = P(...a), [x2, y2] = P(...b);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" ${extra}/>`;
    };
    // 상자: 보이는 면(+x, +y, +z)만 그린다
    const box = (x0, x1, y0, y1, z0, z1, top, fx, fy) =>
      poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], top) +
      poly([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], fx) +
      poly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], fy);

    let g = "";
    g += `<defs>
      <radialGradient id="leak${svg.dataset.id}"><stop offset="0" stop-color="#FF6B5E" stop-opacity=".95"/><stop offset=".5" stop-color="#FF4D3D" stop-opacity=".35"/><stop offset="1" stop-color="#FF4D3D" stop-opacity="0"/></radialGradient>
      <linearGradient id="scan${svg.dataset.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5AA0FF" stop-opacity=".0"/><stop offset=".5" stop-color="#5AA0FF" stop-opacity=".28"/><stop offset="1" stop-color="#5AA0FF" stop-opacity=".0"/></linearGradient>
    </defs>`;
    // 바닥 슬래브
    g += box(0, 11, 0, 11, -0.7, 0, "#D9DFE8", "#9DA9BA", "#B7C1CF");
    // 바닥 타일 줄
    for (let i = 1; i < 11; i++) {
      g += line([i, 0.8, 0], [i, 11, 0], "#C6CEDA", 0.6);
      g += line([0.8, i, 0], [11, i, 0], "#C6CEDA", 0.6);
    }
    // 오른쪽 벽 (y축 방향 뒤편) — x 0..11, y 0..0.8
    g += box(0, 11, 0, 0.8, 0, 7.2, "#F3F5F8", "#C7CFDB", "#E6EAF0");
    // 왼쪽 벽 — x 0..0.8, y 0..11
    g += box(0, 0.8, 0, 11, 0, 7.2, "#F3F5F8", "#DDE3EB", "#C7CFDB");
    // 왼쪽 벽 절개면 (x=0.8 면의 y 2..8, z 1..5.4)
    const X = 0.8;
    g += poly([[X, 2, 1], [X, 8.4, 1], [X, 8.4, 5.6], [X, 2, 5.6]], "#18202D");
    g += poly([[X, 2, 5.6], [X, 8.4, 5.6], [X - 0.55, 8.4, 5.6], [X - 0.55, 2, 5.6]], "#0E141E");
    g += poly([[X, 2, 1], [X, 2, 5.6], [X - 0.55, 2, 5.6], [X - 0.55, 2, 1]], "#2A3445");
    // 단열재 해칭
    for (let z = 1.4; z < 5.4; z += 0.55) g += line([X, 2.1, z], [X, 8.3, z + 0.12], "#243042", 0.7);
    // 배관
    const px = X - 0.2;
    const pipe = (a, b) => line(a, b, "#1B5FD9", 6.5) + line(a, b, "#2E7BF6", 4.6) + line(a, b, "#8CC0FF", 1.2, 'opacity=".9"');
    g += pipe([px, 2.1, 2.3], [px, 8.3, 2.3]);
    g += pipe([px, 6.2, 1.05], [px, 6.2, 5.5]);
    g += pipe([px, 3.4, 2.3], [px, 3.4, 4.6]);
    // 배관이 바닥으로 내려가는 구간 (점선)
    g += line([px + 0.4, 6.2, 1], [3.2, 6.2, -0.35], "#2E7BF6", 2.2, 'stroke-dasharray="3 3" opacity=".8"');
    // 누수 지점
    const [lx, ly] = P(px, 6.2, 2.3);
    g += `<circle cx="${lx}" cy="${ly}" r="26" fill="url(#leak${svg.dataset.id})"/>`;
    g += `<circle cx="${lx}" cy="${ly}" r="13" fill="none" stroke="#FF6B5E" stroke-width="1.4" opacity=".8"/>`;
    g += `<circle cx="${lx}" cy="${ly}" r="20" fill="none" stroke="#FF6B5E" stroke-width="1" opacity=".45"/>`;
    g += `<circle cx="${lx}" cy="${ly}" r="3.6" fill="#fff"/>`;
    // 물방울 번짐 (바닥)
    g += poly([[1.0, 5.2, 0.01], [2.6, 5.4, 0.01], [2.9, 6.9, 0.01], [1.2, 7.1, 0.01]], "#5AA0FF", 'opacity=".22"');
    // 가구 (욕실 수납장)
    g += box(5.6, 8.8, 1.0, 2.6, 0, 2.6, "#FFFFFF", "#D3DAE4", "#EDF1F5");
    g += box(8.3, 10.2, 7.6, 9.6, 0, 1.1, "#FFFFFF", "#D3DAE4", "#EDF1F5");
    // 스캔 평면
    if (svg.dataset.scan) {
      g += poly([[0.9, 6.2, 7.6], [9.5, 6.2, 7.6], [9.5, 6.2, 0.02], [0.9, 6.2, 0.02]], `url(#scan${svg.dataset.id})`);
      g += line([0.9, 6.2, 7.6], [9.5, 6.2, 7.6], "#5AA0FF", 1.2, 'opacity=".7"');
    }
    // 진단 라벨
    if (svg.dataset.label) {
      g += `<g transform="translate(${lx + 18},${ly - 46})">
        <line x1="-18" y1="46" x2="0" y2="18" stroke="#FF6B5E" stroke-width="1.2"/>
        <rect x="0" y="0" width="96" height="30" rx="6" fill="#0A1220" stroke="#FF6B5E" stroke-width="1"/>
        <text x="9" y="13" font-family="Pretendard" font-size="8.5" font-weight="800" fill="#FF8A80">누수 의심 지점</text>
        <text x="9" y="24" font-family="Pretendard" font-size="8" font-weight="600" fill="#AAB4C3">급수관 분기부 · 벽체 내부</text>
      </g>`;
    }
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.innerHTML = g;
  }
  document.querySelectorAll("svg.iso").forEach((el, i) => { el.dataset.id = i; scene(el); });
})();
