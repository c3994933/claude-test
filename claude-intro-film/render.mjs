// render.mjs — serve this folder over http, drive index.html frame-by-frame in headless Chromium,
// and pipe JPEG frames to ffmpeg.
//   node render.mjs stills 10,40,80 out/stills
//   node render.mjs timeline out/timeline.json
//   node render.mjs video out/build [workers] [from] [to]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [mode, a1, a2, a3, a4] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
  const f = path.join(here, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(here) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/index.html?render=1`;

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => { console.error('pageerror', e); process.exit(1); });
  await page.goto(url);
  await page.waitForFunction(() => window.READY === true, null, { timeout: 600000 });
  return page;
}
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const grab = (page, t) => page.evaluate(t => { FILM.renderAt(t); return document.getElementById('c').toDataURL('image/jpeg', .93).split(',')[1]; }, t);

if (mode === 'timeline') {
  const page = await openPage(browser);
  const tl = await page.evaluate(() => ({ total: FILM.TOTAL(), fps: FILM.FPS, scenes: FILM.timeline() }));
  fs.writeFileSync(a1, JSON.stringify(tl, null, 1)); console.log('total', tl.total.toFixed(2), 's');
} else if (mode === 'stills') {
  const page = await openPage(browser); fs.mkdirSync(a2, { recursive: true });
  for (const t of a1.split(',').map(Number)) {
    const t0 = Date.now(); const b64 = await grab(page, t);
    fs.writeFileSync(path.join(a2, `still_${t.toFixed(1).padStart(6, '0')}.jpg`), Buffer.from(b64, 'base64'));
    console.log('t', t, (Date.now() - t0) + 'ms');
  }
} else if (mode === 'video') {
  const out = a1, workers = +(a2 || 4); fs.mkdirSync(out, { recursive: true });
  const probe = await openPage(browser);
  const total = await probe.evaluate(() => FILM.TOTAL()); await probe.close();
  const fps = 30, N = Math.ceil(total * fps), F0 = +(a3 || 0), F1 = Math.min(N, +(a4 || N)), per = Math.ceil((F1 - F0) / workers), t0 = Date.now();
  let done = 0;
  await Promise.all([...Array(workers)].map(async (_, w) => {
    const from = F0 + w * per, to = Math.min(F1, from + per); if (from >= to) return;
    const page = await openPage(browser);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', path.join(out, `seg_${String(from).padStart(5, '0')}.mp4`)], { stdio: ['pipe', 'inherit', 'inherit'] });
    for (let f = from; f < to; f++) {
      const b64 = await grab(page, f / fps);
      if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
      if (++done % 300 === 0) console.log(`${done}/${F1 - F0} frames · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    ff.stdin.end(); await new Promise(r => ff.on('close', r));
  }));
  const segs = fs.readdirSync(out).filter(f => /^seg_\d+\.mp4$/.test(f)).sort();
  fs.writeFileSync(path.join(out, 'segs.txt'), segs.map(s => `file '${s}'`).join('\n'));
  console.log('frames done', F1 - F0);
}
await browser.close(); server.close();
