// 크몽 이미지 9장 렌더 (652×488) + 한눈에 보는 시트
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
if (!fs.existsSync(path.join(__dirname, "../fonts", "Pretendard-Black.woff2"))) { console.error("Pretendard 폰트가 없습니다. 먼저 bash fonts/fetch.sh 를 실행하세요."); process.exit(1); }
(async () => {
  const out = path.join(__dirname, "out"); fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 760, height: 900 }, deviceScaleFactor: 2 });
  await p.goto("file://" + path.join(__dirname, "cards.html"), { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  // Pretendard 외 폰트가 실제로 쓰이지 않는지 확인
  const fams = await p.evaluate(() => [...new Set([...document.querySelectorAll("*")].map(e => getComputedStyle(e).fontFamily))]);
  console.log("font-family:", fams.join(" | "));
  await p.waitForTimeout(400);
  const cards = await p.$$(".card");
  for (let i = 0; i < cards.length; i++)
    await cards[i].screenshot({ path: path.join(out, String(i + 1).padStart(2, "0") + ".png") });
  console.log("cards:", cards.length);
  const imgs = fs.readdirSync(out).filter(f => /^\d\d\.png$/.test(f)).sort()
    .map(f => "data:image/png;base64," + fs.readFileSync(path.join(out, f)).toString("base64"));
  const s = await b.newPage({ viewport: { width: 1400, height: 900 } });
  await s.setContent(`<body style="margin:0;padding:24px;background:#e9ecf1"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px">
    ${imgs.map(u => `<img src="${u}" style="width:100%;border-radius:6px;box-shadow:0 3px 14px rgba(0,0,0,.18)">`).join("")}</div></body>`);
  await s.waitForTimeout(400);
  await s.screenshot({ path: path.join(out, "전체보기.png"), fullPage: true });
  await b.close();
})();
