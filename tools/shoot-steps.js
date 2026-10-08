// Takes the step-by-step pictures for the "How it works" card.
//
// Plays one real race on every map, headless, and saves three stills from it
// into assets/steps/: on the line, somebody going out, the winner. Once each
// for the dark and light themes. Run it again after changing a map or adding
// one:
//
//   node tools/shoot-steps.js
//
// Needs Playwright (npm i playwright, or NODE_PATH pointing at a copy) and a
// Chromium it can launch; set CHROME to an executable to use a specific one.

const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'steps');
// Twice the size the card shows them at, for high-density screens.
const W = 560;
const H = 340;
// A fixed seed per map so the pictures only change when the map does. Each
// was checked to give a race that actually finishes.
const SEEDS = { garden: 11, orbit: 7, belt: 3, binary: 5, bumpers: 2, nova: 9, warp: 4 };

const TYPES = { '.html': 'text/html', '.js': 'text/javascript' };

function matterSource() {
  // The copy inlined in index.html, so the pictures use the same physics.
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = html.match(/<script>\s*(\/\*!\s*\n \* matter-js[\s\S]*?)<\/script>/);
  if (!m) throw new Error('could not find the inlined matter-js in index.html');
  return m[1];
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/__matter.js') {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    return res.end(matterSource());
  }
  const file = url === '/' ? '/tools/steps-harness.html' : url;
  fs.readFile(path.join(ROOT, file), (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => window.ready === true);
  // The card text is in the page; give the hand-drawn font time to arrive.
  await page.evaluate(() => document.fonts.load('700 22px "Shantell Sans"'));

  fs.mkdirSync(OUT, { recursive: true });
  let failed = 0;
  for (const [id, seed] of Object.entries(SEEDS)) {
    for (const mode of ['dark', 'light']) {
      const r = await page.evaluate(([a, b, c, w, h]) => window.shoot(a, b, c, w, h), [id, mode, seed, W, H]);
      if (!r.won) { failed++; console.warn(`${id} (${mode}): no winner within the limit — try another seed`); }
      r.shots.forEach((url, i) => {
        const file = path.join(OUT, `${id}-${i + 1}-${mode}.webp`);
        fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
      });
      console.log(`${id} ${mode}: race took ${r.seconds}s`);
    }
  }
  await browser.close();
  server.close();
  process.exitCode = failed ? 1 : 0;
});
