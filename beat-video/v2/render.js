// usage: node render.js preview <times,comma> out.png  |  node render.js full out_video.mp4
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const g = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'grid.json')));
const CFG = { P: 60 / g.bpm, B0: g.first, T0: 2.0 };
const url = 'file://' + path.join(__dirname, 'scale.html');
async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('pageerror', e => { console.error('PAGEERROR', e.message); process.exit(1); });
  page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE', m.text()); });
  await page.addInitScript(cfg => { window.CFG = cfg; }, CFG);
  await page.goto(url); await page.evaluate(() => window.ready);
  return page;
}
const grab = (page, i, q) => page.evaluate(([i, q]) => { drawFrame(i); return document.getElementById('c').toDataURL(q ? 'image/jpeg' : 'image/png', q || undefined); }, [i, q]);
(async () => {
  const mode = process.argv[2];
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--disable-web-security'] });
  if (mode === 'preview') {
    const page = await openPage(browser);
    const times = process.argv[3].split(',').map(Number);
    const out = process.argv[4] || 'preview';
    for (let j = 0; j < times.length; j++) {
      const i = Math.round((times[j] - CFG.T0) * 30);
      const d = await grab(page, i, 0.9);
      fs.writeFileSync(`${out}_${String(j).padStart(2, '0')}.jpg`, Buffer.from(d.split(',')[1], 'base64'));
    }
    await browser.close(); return;
  }
  const out = process.argv[3];
  const first = await openPage(browser);
  const NF = await first.evaluate(() => window.NFRAMES);
  const pages = [first]; for (let k = 1; k < 4; k++) pages.push(await openPage(browser));
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', '30', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Map(); let next = 0, issued = 0;
  async function worker(page) {
    while (true) { const i = issued++; if (i >= NF) return; const d = await grab(page, i, 0.96); done.set(i, Buffer.from(d.split(',')[1], 'base64'));
      while (done.has(next)) { const b = done.get(next); done.delete(next); if (!ff.stdin.write(b)) await new Promise(r => ff.stdin.once('drain', r)); if (next % 90 === 0) console.log('frame', next, '/', NF); next++; } }
  }
  await Promise.all(pages.map(worker));
  ff.stdin.end(); await new Promise(r => ff.on('close', r)); await browser.close(); console.log('done', NF);
})();
