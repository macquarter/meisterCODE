// 폐루프 플라이휠: 수집 → 생성 → 배포 → 학습 → (다시 수집)
// <svg class="fly" data-center="09:00" data-sub="5채널 동시 발행" data-big="1"></svg>
(function () {
  const NODES = [
    { t: "수집" }, { t: "생성" }, { t: "배포" }, { t: "학습" },
  ];
  function draw(svg, id) {
    const big = !!svg.dataset.big;
    const W = 300, c = 150, R = big ? 100 : 98, nr = big ? 27 : 25;
    const ang = [-90, 0, 90, 180].map((a) => (a * Math.PI) / 180);
    const pt = (a, r = R) => [c + r * Math.cos(a), c + r * Math.sin(a)];
    let g = `<defs>
      <marker id="ah${id}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M0 0L10 5L0 10z" fill="#2E7BF6"/></marker>
      <radialGradient id="core${id}"><stop offset="0" stop-color="#2E7BF6" stop-opacity=".35"/><stop offset="1" stop-color="#2E7BF6" stop-opacity="0"/></radialGradient>
    </defs>`;
    g += `<circle cx="${c}" cy="${c}" r="${R + 30}" fill="url(#core${id})"/>`;
    g += `<circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="rgba(90,160,255,.16)" stroke-width="16"/>`;
    // 노드 사이 화살표 호
    for (let i = 0; i < 4; i++) {
      const gap = 0.36;
      const a0 = ang[i] + gap, a1 = ang[(i + 1) % 4] - gap + (i === 3 ? 2 * Math.PI : 0);
      const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
      const dash = i === 3 ? 'stroke-dasharray="5 5"' : "";
      g += `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)} A${R} ${R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" fill="none" stroke="#2E7BF6" stroke-width="3" stroke-linecap="round" ${dash} marker-end="url(#ah${id})"/>`;
    }
    // 노드
    NODES.forEach((n, i) => {
      const [x, y] = pt(ang[i]);
      const on = i === 2;
      g += `<circle cx="${x}" cy="${y}" r="${nr}" fill="${on ? "#2E7BF6" : "#0B1017"}" stroke="#2E7BF6" stroke-width="2"/>`;
      g += `<text x="${x}" y="${y + 1}" text-anchor="middle" dominant-baseline="middle" font-family="Pretendard" font-size="${big ? 13.5 : 13}" font-weight="900" fill="#fff">${n.t}</text>`;
    });
    // 중앙
    g += `<text x="${c}" y="${c - 4}" text-anchor="middle" font-family="Pretendard" font-size="${big ? 34 : 32}" font-weight="900" fill="#fff" letter-spacing="-1">${svg.dataset.center || ""}</text>`;
    g += `<text x="${c}" y="${c + 20}" text-anchor="middle" font-family="Pretendard" font-size="11.5" font-weight="800" fill="#5AA0FF">${svg.dataset.sub || ""}</text>`;
    svg.setAttribute("viewBox", `0 0 ${W} ${W}`);
    svg.innerHTML = g;
  }
  document.querySelectorAll("svg.fly").forEach((el, i) => draw(el, i));
})();
