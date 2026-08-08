/**
 * 크몽 업로드용 PNG 렌더러
 *   node render.js            → 전체 렌더
 *   node render.js 01         → 파일명이 01로 시작하는 것만
 *
 * 썸네일은 크몽 규격(652×488)에 맞춰 1배로,
 * 상세페이지 이미지는 고해상도 표시를 위해 2배로 출력한다.
 */
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const HERE = __dirname;
const OUT = path.join(HERE, "out");

const TARGETS = [
  { file: "01-썸네일.html",      out: "01-썸네일-652x488.png",     width: 652,  scale: 1 },
  { file: "02-히어로.html",      out: "02-히어로-860w.png",        width: 900,  scale: 2 },
  { file: "03-가격표.html",      out: "03-가격표-860w.png",        width: 900,  scale: 2 },
];

(async () => {
  const filter = process.argv[2];
  const jobs = TARGETS.filter(
    (t) => (!filter || t.file.startsWith(filter)) && fs.existsSync(path.join(HERE, t.file))
  );
  if (!jobs.length) {
    console.error("렌더할 파일이 없습니다.");
    process.exit(1);
  }

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const t of jobs) {
    const page = await browser.newPage({
      viewport: { width: t.width, height: 900 },
      deviceScaleFactor: t.scale,
    });

    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto("file://" + path.join(HERE, t.file), { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(350); // 웹폰트 적용 후 리플로우 안정화

    const el = await page.$(".canvas");
    if (!el) throw new Error(`.canvas 를 찾을 수 없습니다: ${t.file}`);

    const outPath = path.join(OUT, t.out);
    await el.screenshot({ path: outPath, type: "png" });

    const box = await el.boundingBox();
    const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
    console.log(
      `✓ ${t.out}  ${Math.round(box.width)}×${Math.round(box.height)}` +
        ` @${t.scale}x → ${Math.round(box.width * t.scale)}×${Math.round(box.height * t.scale)}px  ${kb}KB` +
        (errors.length ? `  ⚠ JS오류 ${errors.length}건` : "")
    );
    errors.forEach((e) => console.log("   " + e));
    await page.close();
  }

  await browser.close();
})().catch((e) => {
  console.error("렌더 실패:", e.message);
  process.exit(1);
});
