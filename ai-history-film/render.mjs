// render.mjs — drive index.html frame-by-frame in headless Chromium and pipe JPEG frames to ffmpeg.
//   node render.mjs stills 10,40,80 out/      → PNG stills for review
//   node render.mjs timeline out/timeline.json
//   node render.mjs video out/ [workers]       → out/video.mp4 (silent)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [mode, a1, a2, a3] = process.argv.slice(2);
const url = pathToFileURL(path.join(here, 'index.html')).href + '?render=1';

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => console.error('pageerror', e));
  await page.goto(url);
  await page.waitForFunction(() => window.READY === true, null, { timeout: 180000 });
  return page;
}
const browser = await chromium.launch({ args: ['--disable-web-security', '--allow-file-access-from-files'] });

if (mode === 'timeline') {
  const page = await openPage(browser);
  const tl = await page.evaluate(() => ({ total: FILM.TOTAL(), fps: FILM.FPS, scenes: FILM.timeline() }));
  fs.writeFileSync(a1, JSON.stringify(tl, null, 1)); console.log('total', tl.total.toFixed(2), 's');
} else if (mode === 'stills') {
  const page = await openPage(browser); fs.mkdirSync(a2, { recursive: true });
  for (const t of a1.split(',').map(Number)) {
    const b64 = await page.evaluate(t => { FILM.renderAt(t); return document.getElementById('c').toDataURL('image/jpeg', .9).split(',')[1]; }, t);
    fs.writeFileSync(path.join(a2, `still_${String(t).padStart(6, '0')}.jpg`), Buffer.from(b64, 'base64'));
  }
} else if (mode === 'video') {
  const out = a1, workers = +(a2 || 4); fs.mkdirSync(out, { recursive: true });
  const probe = await openPage(browser);
  const total = await probe.evaluate(() => FILM.TOTAL()); await probe.close();
  const fps = 30, N = Math.ceil(total * fps), per = Math.ceil(N / workers), t0 = Date.now();
  let done = 0;
  await Promise.all([...Array(workers)].map(async (_, w) => {
    const from = w * per, to = Math.min(N, from + per);
    const page = await openPage(browser);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-tune', 'grain', path.join(out, `seg${w}.mp4`)], { stdio: ['pipe', 'inherit', 'inherit'] });
    for (let f = from; f < to; f++) {
      const b64 = await page.evaluate(t => { FILM.renderAt(t); return document.getElementById('c').toDataURL('image/jpeg', .93).split(',')[1]; }, f / fps);
      if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
      if (++done % 300 === 0) console.log(`${done}/${N} frames · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    ff.stdin.end(); await new Promise(r => ff.on('close', r));
  }));
  fs.writeFileSync(path.join(out, 'segs.txt'), [...Array(workers)].map((_, w) => `file 'seg${w}.mp4'`).join('\n'));
  console.log('frames done', N);
}
await browser.close();
