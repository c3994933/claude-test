// plates.mjs — render the heavy one-time plates into plates/*.png
//   node plates.mjs [name ...]   (no names = all)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
export const GL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'];
const browser = await chromium.launch({ args: GL_ARGS });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', e => console.error('pageerror', e));
page.on('console', m => console.log('[page]', m.text()));
await page.goto(pathToFileURL(path.join(here, 'plates.html')).href);
await page.waitForFunction(() => window.READY);
const names = process.argv.slice(2);
const list = await page.evaluate(() => Object.keys(PLATES));
for (const n of list.filter(n => !names.length || names.includes(n))) {
  const t0 = Date.now();
  const b64 = await page.evaluate(async n => { const c = await PLATES[n](); return c.toDataURL('image/png').split(',')[1]; }, n);
  fs.writeFileSync(path.join(here, 'plates', n + '.png'), Buffer.from(b64, 'base64'));
  console.log(n, ((Date.now() - t0) / 1000).toFixed(1) + 's');
}
await browser.close();
