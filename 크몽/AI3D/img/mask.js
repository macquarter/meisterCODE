// 대시보드 스크린샷 → 크몽 게시용: 필요한 영역만 자르고, 외부 연락 경로(핸들·채널명)를 블러 처리
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const JOBS = [
  { src: "dash-kpi.png", out: "dash-kpi-crop.png", crop: [340, 96, 1540, 810], blur: [] },
  { src: "dash-kpi.png", out: "dash-chart.png", crop: [360, 640, 1508, 262], blur: [] },
  { src: "dash-sns.png", out: "dash-sns-row1.png", crop: [348, 168, 1528, 256],
    blur: [[380, 230, 120, 24], [686, 230, 120, 24], [1036, 210, 116, 26], [1378, 210, 66, 26]] },
];
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  for (const j of JOBS) {
    const b64 = fs.readFileSync(path.join(__dirname, j.src)).toString("base64");
    const data = await p.evaluate(async ({ b64, crop, blur }) => {
      const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const x = c.getContext("2d"); x.drawImage(img, 0, 0);
      for (const [bx, by, bw, bh] of blur) {
        x.save(); x.beginPath(); x.rect(bx, by, bw, bh); x.clip(); x.filter = "blur(7px)";
        x.drawImage(img, 0, 0); x.drawImage(img, 0, 0); x.restore();
      }
      const [cx, cy, cw, ch] = crop; const o = document.createElement("canvas"); o.width = cw; o.height = ch;
      o.getContext("2d").drawImage(c, cx, cy, cw, ch, 0, 0, cw, ch);
      return o.toDataURL("image/png").split(",")[1];
    }, { b64, crop: j.crop, blur: j.blur });
    fs.writeFileSync(path.join(__dirname, j.out), Buffer.from(data, "base64"));
    console.log("✓", j.out);
  }
  await b.close();
})();
