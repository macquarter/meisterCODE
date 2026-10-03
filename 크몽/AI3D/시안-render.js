// 카드 바리에이션 렌더: node 시안-render.js 04 → out/시안04/A.png… + 비교.png (2배)
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const N = process.argv[2]; if (!N) { console.error("사용법: node 시안-render.js 04"); process.exit(1); }
if (!fs.existsSync(path.join(__dirname, "../fonts", "Pretendard-Black.woff2"))) { console.error("Pretendard 폰트가 없습니다. 먼저 bash 크몽/fonts/fetch.sh 를 실행하세요."); process.exit(1); }
(async () => {
  const b = await chromium.launch();
  const out = path.join(__dirname, "out/시안" + N); fs.mkdirSync(out, { recursive: true });
  const p = await b.newPage({ viewport: { width: 760, height: 900 }, deviceScaleFactor: 2 });
  await p.goto("file://" + path.join(__dirname, `시안${N}.html`), { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  const fams = await p.evaluate(() => [...new Set([...document.querySelectorAll("*")].map(e => getComputedStyle(e).fontFamily))]);
  if (fams.some(f => !/Pretendard/.test(f))) { console.error("Pretendard 외 글꼴 발견:", fams); process.exit(1); }
  await p.waitForTimeout(400);
  const cards = await p.$$(".card"), K = "ABCDEFG";
  for (let i = 0; i < cards.length; i++) await cards[i].screenshot({ path: path.join(out, K[i] + ".png") });
  const imgs = [...Array(cards.length)].map((_, i) => "data:image/png;base64," + fs.readFileSync(path.join(out, K[i] + ".png")).toString("base64"));
  const s = await b.newPage({ viewport: { width: 1400, height: 900 } });
  await s.setContent(`<body style="margin:0;padding:24px;background:#e9ecf1"><div style="display:grid;grid-template-columns:repeat(${cards.length > 2 ? 3 : 2},1fr);gap:20px">${imgs.map((u, i) => `<div><div style="font:700 18px sans-serif;margin-bottom:8px">${K[i]}안</div><img src="${u}" style="width:100%;border-radius:6px;box-shadow:0 3px 14px rgba(0,0,0,.18)"></div>`).join("")}</div></body>`);
  await s.waitForTimeout(400);
  await s.screenshot({ path: path.join(out, "비교.png"), fullPage: true });
  console.log(`시안${N}: ${cards.length}안 + 비교 → out/시안${N}`);
  await b.close();
})();
