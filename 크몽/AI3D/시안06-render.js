// 06번 카드 바리에이션 4안 → out/시안06/A~D.png (2배) + 비교.png
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
if (!fs.existsSync(path.join(__dirname, "../fonts", "Pretendard-Black.woff2"))) { console.error("Pretendard 폰트가 없습니다. 먼저 bash 크몽/fonts/fetch.sh 를 실행하세요."); process.exit(1); }
(async () => {
  const b = await chromium.launch();
  const out = path.join(__dirname, "out/시안06"); fs.mkdirSync(out, { recursive: true });
  const p = await b.newPage({ viewport: { width: 760, height: 900 }, deviceScaleFactor: 2 });
  await p.goto("file://" + path.join(__dirname, "시안06.html"), { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  const fams = await p.evaluate(() => [...new Set([...document.querySelectorAll("*")].map(e => getComputedStyle(e).fontFamily))]);
  if (fams.some(f => !/Pretendard/.test(f))) { console.error("Pretendard 외 글꼴 발견:", fams); process.exit(1); }
  const over = await p.evaluate(() => [...document.querySelectorAll(".card")].map((c, i) => {
    const r = c.getBoundingClientRect(); const bad = [...c.querySelectorAll("*")].filter(e => { const q = e.getBoundingClientRect(); return q.width && (q.bottom > r.bottom + 0.5 || q.right > r.right + 0.5); });
    return bad.length ? "ABCD"[i] + ": " + bad.slice(0, 3).map(e => e.className || e.tagName).join(",") : null; }).filter(Boolean));
  if (over.length) console.warn("카드 밖으로 넘친 요소:", over);
  await p.waitForTimeout(400);
  const cards = await p.$$(".card");
  for (let i = 0; i < cards.length; i++) await cards[i].screenshot({ path: path.join(out, "ABCD"[i] + ".png") });
  const imgs = "ABCD".split("").map(k => "data:image/png;base64," + fs.readFileSync(path.join(out, k + ".png")).toString("base64"));
  const s = await b.newPage({ viewport: { width: 1400, height: 900 } });
  await s.setContent(`<body style="margin:0;padding:24px;background:#e9ecf1;font-family:sans-serif"><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:20px">${imgs.map((u, i) => `<div><div style="font:700 18px sans-serif;margin-bottom:8px">${"ABCD"[i]}안</div><img src="${u}" style="width:100%;border-radius:6px;box-shadow:0 3px 14px rgba(0,0,0,.18)"></div>`).join("")}</div></body>`);
  await s.waitForTimeout(400);
  await s.screenshot({ path: path.join(out, "비교.png"), fullPage: true });
  console.log("시안06: A~D + 비교 → out/시안06");
  await b.close();
})();
