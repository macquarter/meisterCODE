// AI 3D 설명 쇼츠: 크몽 이미지 9장(2배 + 652×488) + 경쟁분석 리포트 PDF
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
if (!fs.existsSync(path.join(__dirname, "../fonts", "Pretendard-Black.woff2"))) { console.error("Pretendard 폰트가 없습니다. 먼저 bash 크몽/fonts/fetch.sh 를 실행하세요."); process.exit(1); }
(async () => {
  const b = await chromium.launch();
  for (const [scale, dir] of [[2, "out"], [1, "out/652x488"]]) {
    const out = path.join(__dirname, dir); fs.mkdirSync(out, { recursive: true });
    const p = await b.newPage({ viewport: { width: 760, height: 900 }, deviceScaleFactor: scale });
    await p.goto("file://" + path.join(__dirname, "cards.html"), { waitUntil: "networkidle" });
    await p.evaluate(() => document.fonts.ready);
    const fams = await p.evaluate(() => [...new Set([...document.querySelectorAll("*")].map(e => getComputedStyle(e).fontFamily))]);
    if (fams.some(f => !/Pretendard/.test(f))) { console.error("Pretendard 외 글꼴 발견:", fams); process.exit(1); }
    await p.waitForTimeout(400);
    const cards = await p.$$(".card");
    for (let i = 0; i < cards.length; i++) await cards[i].screenshot({ path: path.join(out, String(i + 1).padStart(2, "0") + ".png") });
    console.log(`cards @${scale}x: ${cards.length} → ${dir}`);
    await p.close();
  }
  // 전체보기
  const out = path.join(__dirname, "out");
  const imgs = fs.readdirSync(out).filter(f => /^\d\d\.png$/.test(f)).sort().map(f => "data:image/png;base64," + fs.readFileSync(path.join(out, f)).toString("base64"));
  const s = await b.newPage({ viewport: { width: 1400, height: 900 } });
  await s.setContent(`<body style="margin:0;padding:24px;background:#e9ecf1"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px">${imgs.map(u => `<img src="${u}" style="width:100%;border-radius:6px;box-shadow:0 3px 14px rgba(0,0,0,.18)">`).join("")}</div></body>`);
  await s.waitForTimeout(400);
  await s.screenshot({ path: path.join(out, "전체보기.png"), fullPage: true });
  // 리포트 PDF
  const r = await b.newPage();
  await r.goto("file://" + path.join(__dirname, "경쟁분석-리포트.html"), { waitUntil: "networkidle" });
  await r.evaluate(() => document.fonts.ready);
  await r.pdf({ path: path.join(__dirname, "경쟁분석-리포트.pdf"), format: "A4", printBackground: true,
    margin: { top: "16mm", bottom: "16mm", left: "15mm", right: "15mm" } });
  console.log("report pdf done");
  await b.close();
})();
