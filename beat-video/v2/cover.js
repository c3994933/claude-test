const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  for (const [H, name] of [[1920, 'cover_9x16.png'], [1440, 'cover_3x4.png']]) {
    const p = await b.newPage({ viewport: { width: 1080, height: H } });
    p.on('pageerror', e => { console.error('PAGEERROR', e.message); process.exit(1); });
    await p.addInitScript(h => { window.CFG = { H: h }; }, H);
    await p.goto('file://' + path.join(__dirname, 'cover.html')); await p.evaluate(() => window.ready);
    const d = await p.evaluate(() => { drawCover(); return document.getElementById('c').toDataURL('image/png'); });
    fs.writeFileSync(name, Buffer.from(d.split(',')[1], 'base64')); console.log('wrote', name);
  }
  await b.close();
})();
