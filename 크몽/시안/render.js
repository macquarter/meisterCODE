// 썸네일 시안 4종 렌더 + 비교 시트
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const IDS = ["A1", "A2", "B1", "B2"];
const LABEL = {
  A1: "A안-1 · 해외바이어 AI응대 (기존 구성)",
  A2: "A안-2 · 해외바이어 AI응대 (03:12 시계 훅)",
  B1: "B안-1 · 시안 3개 (겹친 시안 카드)",
  B2: "B안-2 · 시안 3개 (초대형 숫자 3)",
};
(async () => {
  const b = await chromium.launch();
  fs.mkdirSync(path.join(__dirname, "out"), { recursive: true });
  for (const id of IDS) {
    const p = await b.newPage({ viewport: { width: 652, height: 488 } });
    await p.goto("file://" + path.join(__dirname, id + ".html"), { waitUntil: "networkidle" });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(300);
    await (await p.$(".canvas")).screenshot({ path: path.join(__dirname, "out", id + ".png") });
    await p.close();
  }
  const img = (id) => "data:image/png;base64," + fs.readFileSync(path.join(__dirname, "out", id + ".png")).toString("base64");
  const p = await b.newPage({ viewport: { width: 1380, height: 1200 } });
  await p.setContent(`<body style="margin:0;padding:28px;background:#e9ecf1;font-family:sans-serif">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:26px 26px">
    ${IDS.map(id => `<div><div style="font:700 15px sans-serif;color:#1b2230;margin-bottom:8px">${LABEL[id]}</div>
      <img src="${img(id)}" style="width:652px;display:block;border-radius:8px;box-shadow:0 4px 18px rgba(0,0,0,.18)">
      <div style="display:flex;gap:10px;align-items:flex-end;margin-top:10px">
        <span style="font:600 11px sans-serif;color:#667">검색결과 축소 240px →</span>
        <img src="${img(id)}" style="width:240px;border-radius:5px"></div></div>`).join("")}
    </div></body>`);
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(__dirname, "out", "비교시트.png"), fullPage: true });
  await b.close();
  console.log("done");
})();
