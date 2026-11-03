// Usage:
//   node render.js <outDir>                 render every frame (30fps) as JPEG
//   node render.js <outDir> --at 1.5,6,12   render preview stills at given seconds
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const FPS = 30;
const WORKERS = 4;

(async () => {
  const outDir = path.resolve(process.argv[2] || 'frames');
  const atIdx = process.argv.indexOf('--at');
  const stills = atIdx > 0 ? process.argv[atIdx + 1].split(',').map(Number) : null;
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  const url = 'file://' + path.join(__dirname, 'index.html');
  const newPage = async () => {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    return page;
  };

  if (stills) {
    const page = await newPage();
    for (const t of stills) {
      await page.evaluate(t => render(t), t);
      await page.screenshot({ path: path.join(outDir, `still_${t.toFixed(2)}.png`) });
    }
  } else {
    const tEnd = await (await newPage()).evaluate(() => window.T_END);
    const total = Math.round(tEnd * FPS);
    let next = 0, done = 0;
    const pages = await Promise.all([...Array(WORKERS)].map(newPage));
    await Promise.all(pages.map(async page => {
      while (next < total) {
        const f = next++;
        await page.evaluate(t => render(t), f / FPS);
        await page.screenshot({ path: path.join(outDir, `f_${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 93 });
        if (++done % 150 === 0) console.log(`${done}/${total}`);
      }
    }));
    console.log(`rendered ${total} frames`);
  }
  await browser.close();
})();
