// Render the film frame-by-frame in headless Chromium.
//   node render.js preview 3 12.5 31 38     -> PNG stills in ./preview
//   node render.js frames [workers]         -> PNG sequence in ./frames, plus meta.json
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2' };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT) || !fs.existsSync(p)) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(rsp);
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}

async function openPage(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(url);
  await page.evaluate(() => window.ready);
  return page;
}
const grab = (page, arg, byTime) => page.evaluate(([a, bt]) => {
  bt ? window.renderTime(a) : window.renderFrame(a);
  return document.getElementById('c').toDataURL('image/png').slice(22);
}, [arg, byTime]);

(async () => {
  const [mode = 'preview', ...rest] = process.argv.slice(2);
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch({ args: ['--disable-gpu-vsync'] });

  if (mode === 'preview') {
    fs.mkdirSync(path.join(ROOT, 'preview'), { recursive: true });
    const page = await openPage(browser, url);
    console.log(JSON.stringify(await page.evaluate(() => ({ segs: META.segCount, swarm: META.swarm, zf: META.zf }))));
    for (const t of rest.map(Number)) {
      const t0 = Date.now();
      const b64 = await grab(page, t, true);
      fs.writeFileSync(path.join(ROOT, 'preview', `t${t.toFixed(2)}.png`), Buffer.from(b64, 'base64'));
      console.log(`t=${t}  ${Date.now() - t0}ms`);
    }
  } else if (mode === 'frames') {
    const workers = Number(rest[0] || 4);
    const outDir = path.join(ROOT, 'frames');
    fs.mkdirSync(outDir, { recursive: true });
    const pages = await Promise.all(Array.from({ length: workers }, () => openPage(browser, url)));
    const meta = await pages[0].evaluate(() => window.META);
    fs.writeFileSync(path.join(ROOT, 'meta.json'), JSON.stringify(meta, null, 1));
    const total = meta.FPS * meta.DURATION;
    let next = Number(rest[1] || 0), done = 0; const t0 = Date.now();
    const last = Number(rest[2] || total);
    await Promise.all(pages.map(async page => {
      while (true) {
        const f = next++; if (f >= Math.min(total, last)) break;
        const file = path.join(outDir, `f${String(f).padStart(5, '0')}.png`);
        const b64 = await grab(page, f, false);
        fs.writeFileSync(file, Buffer.from(b64, 'base64'));
        if (++done % 60 === 0) console.log(`${done}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      }
    }));
    console.log('frames done');
  }
  await browser.close();
  srv.close();
})();
