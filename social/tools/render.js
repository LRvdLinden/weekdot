// Renders the Weekdot social banners (NL) with Playwright/Chromium.
// node social/tools/render.js <outdir>
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'social', 'out', 'nl'));
fs.mkdirSync(OUT, { recursive: true });

const data = f => 'data:' + (f.endsWith('.png') ? 'image/png' : 'image/jpeg') + ';base64,' + fs.readFileSync(path.join(ROOT, f)).toString('base64');
const ICON = data('website/assets/icon.png');
const SHOT = n => data(`website/assets/shots/nl/gallery/${n}.jpg`);
const HOMEY = data('website/assets/homey/works-with-homey-light.png');
const APPLE = '<path d="M16.37 12.75c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.74-.78-2.87-.76-1.47.02-2.83.86-3.59 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.24 2.73 2.2 1.1-.04 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.07 2.65-2.13.84-1.22 1.18-2.41 1.2-2.47-.03-.01-2.3-.88-2.32-3.5zM14.21 6.3c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.54 1.31-.56.64-1.05 1.67-.92 2.66.97.07 1.96-.49 2.56-1.21z"/>';

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,-apple-system,sans-serif;color:#131318;-webkit-font-smoothing:antialiased;overflow:hidden}
.canvas{position:relative;overflow:hidden;background:#fbfaf8}
.canvas::before{content:"";position:absolute;inset:0;background-image:radial-gradient(circle,rgba(19,19,24,.09) 2px,transparent 2.4px);background-size:34px 34px}
.glow{position:absolute;border-radius:50%;background:radial-gradient(circle,rgba(232,53,47,.28),rgba(232,53,47,0) 65%);filter:blur(10px)}
.brand{display:flex;align-items:center;gap:.5em;font-weight:800;letter-spacing:-.02em}
.brand img{border-radius:22%;box-shadow:0 8px 24px -10px rgba(0,0,0,.35)}
h1{font-weight:800;letter-spacing:-.035em;line-height:1.02}
h1 em{font-style:normal;color:#e8352f}
.sub{color:#4c4c57;line-height:1.35;font-weight:500}
.kicker{display:inline-flex;align-items:center;gap:.5em;font-weight:700;color:#e8352f;text-transform:uppercase;letter-spacing:.08em}
.kicker::before{content:"";width:.55em;height:.55em;border-radius:50%;background:#e8352f}
.badge{display:inline-flex;align-items:center;gap:.45em;background:#000;color:#fff;border-radius:.42em;padding:.32em .8em .36em .6em;line-height:1}
.badge svg{width:1.45em;height:1.45em;fill:#fff}
.badge small{display:block;font-size:.42em;font-weight:500;letter-spacing:.01em;margin-bottom:.12em}
.badge b{display:block;font-size:.84em;font-weight:600;letter-spacing:-.01em}
.url{font-weight:700;color:#131318}
.phone{position:absolute;aspect-ratio:1000/2173;padding:1.1%;border-radius:15%/7%;background:#111;box-shadow:0 40px 80px -30px rgba(0,0,0,.5),inset 0 0 0 2px #2b2b30}
.phone .glass{width:100%;height:100%;border-radius:13.5%/6.3%;overflow:hidden;background:#fff}
.phone img{width:100%;height:100%;object-fit:cover;display:block}
.chips{display:flex;gap:.45em;flex-wrap:wrap}
.chips span{background:#fff;border:1px solid #e7e4df;border-radius:99px;padding:.32em .8em;font-weight:600;color:#3a3a44}
`;

const badge = (size) => `<span class="badge" style="font-size:${size}px"><svg viewBox="0 0 24 24">${APPLE}</svg><span><small>Download in de</small><b>App Store</b></span></span>`;
const phone = (shot, style) => `<div class="phone" style="${style}"><div class="glass"><img src="${SHOT(shot)}"></div></div>`;

const B = [
  // Instagram / Facebook post 1080×1080
  ['instagram-facebook-post-1080x1080', 1080, 1080, `
    <div class="glow" style="width:900px;height:900px;right:-300px;top:120px"></div>
    <div style="position:absolute;left:84px;top:84px;width:520px">
      <div class="brand" style="font-size:40px"><img src="${ICON}" width="72"> Weekdot</div>
      <h1 style="font-size:92px;margin-top:64px">Je week in <em>één</em> oogopslag</h1>
      <p class="sub" style="font-size:34px;margin-top:28px">De gratis agenda-app voor iPhone, iPad, Mac en Apple Watch.</p>
      <div style="margin-top:56px">${badge(44)}</div>
      <p class="url" style="font-size:30px;margin-top:26px">weekdot.com</p>
    </div>
    ${phone('week', 'width:380px;right:70px;top:150px;transform:rotate(4deg)')}`],

  // Instagram / Facebook post 1080×1350
  ['instagram-facebook-post-1080x1350', 1080, 1350, `
    <div class="glow" style="width:1100px;height:1100px;left:-10px;top:520px"></div>
    <div style="position:absolute;left:84px;right:84px;top:84px">
      <div class="brand" style="font-size:40px"><img src="${ICON}" width="72"> Weekdot</div>
      <h1 style="font-size:84px;margin-top:52px">Sport, feestdagen en afval <em>in je agenda</em></h1>
      <div class="chips" style="font-size:26px;margin-top:30px"><span>⚽ Voetbal</span><span>🏎️ Formule 1</span><span>🎉 Feestdagen</span><span>♻️ Afvalkalender</span></div>
    </div>
    ${phone('week', 'width:280px;left:210px;top:520px;transform:rotate(-5deg)')}
    ${phone('discover', 'width:280px;right:210px;top:545px;transform:rotate(5deg)')}
    <div style="position:absolute;left:84px;right:84px;bottom:70px;display:flex;align-items:center;justify-content:space-between">
      ${badge(40)}<span class="url" style="font-size:32px">weekdot.com</span>
    </div>`],

  // Story / Reels 1080×1920 (250 px top and bottom kept free)
  ['story-reels-1080x1920', 1080, 1920, `
    <div class="glow" style="width:1300px;height:1300px;left:-110px;top:700px"></div>
    <div style="position:absolute;left:90px;right:90px;top:290px;text-align:center">
      <div class="brand" style="font-size:44px;justify-content:center"><img src="${ICON}" width="84"> Weekdot</div>
      <h1 style="font-size:104px;margin-top:56px">Je week in <em>één</em> oogopslag</h1>
      <p class="sub" style="font-size:36px;margin-top:26px">Gratis voor iPhone, iPad, Mac en Apple Watch</p>
      <div style="margin-top:44px">${badge(50)}</div>
      <p class="url" style="font-size:34px;margin-top:20px">weekdot.com</p>
    </div>
    ${phone('list', 'width:340px;left:150px;top:1190px;transform:rotate(-6deg)')}
    ${phone('week', 'width:360px;right:150px;top:1150px;transform:rotate(5deg)')}`],

  // Facebook cover 1640×624 (key content in the centre)
  ['facebook-cover-1640x624', 1640, 624, `
    <div class="glow" style="width:900px;height:900px;left:820px;top:-160px"></div>
    <div style="position:absolute;left:230px;top:118px;width:720px">
      <div class="brand" style="font-size:34px"><img src="${ICON}" width="60"> Weekdot</div>
      <h1 style="font-size:70px;margin-top:30px">Je week in <em>één</em> oogopslag</h1>
      <p class="sub" style="font-size:26px;margin-top:18px">Gratis voor iPhone, iPad, Mac en Apple Watch</p>
      <div style="margin-top:28px;display:flex;align-items:center;gap:26px">${badge(34)}<span class="url" style="font-size:26px">weekdot.com</span></div>
    </div>
    ${phone('week', 'width:250px;left:960px;top:70px;transform:rotate(-4deg)')}
    ${phone('list', 'width:250px;left:1170px;top:110px;transform:rotate(5deg)')}`],

  // LinkedIn cover 1584×396 (profile photo sits bottom-left, so content on the right)
  ['linkedin-cover-1584x396', 1584, 396, `
    <div class="glow" style="width:800px;height:800px;left:900px;top:-260px"></div>
    <div style="position:absolute;left:520px;top:86px;width:560px">
      <div class="brand" style="font-size:28px"><img src="${ICON}" width="50"> Weekdot</div>
      <h1 style="font-size:52px;margin-top:20px">Je week in <em>één</em> oogopslag</h1>
      <div style="margin-top:22px;display:flex;align-items:center;gap:22px">${badge(28)}<span class="url" style="font-size:22px">weekdot.com</span></div>
    </div>
    ${phone('week', 'width:170px;left:1150px;top:40px;transform:rotate(-4deg)')}
    ${phone('list', 'width:170px;left:1320px;top:70px;transform:rotate(5deg)')}`],

  // Homey Community / forum banner 1200×400
  ['homey-forum-banner-1200x400', 1200, 400, `
    <div class="glow" style="width:700px;height:700px;left:620px;top:-200px"></div>
    <div style="position:absolute;left:72px;top:64px;width:720px">
      <div class="brand" style="font-size:30px"><img src="${ICON}" width="54"> Weekdot</div>
      <h1 style="font-size:50px;margin-top:22px;white-space:nowrap">Je agenda stuurt <em>je huis</em> aan</h1>
      <div style="margin-top:24px;display:flex;align-items:center;gap:20px"><img src="${HOMEY}" height="52">${badge(28)}</div>
    </div>
    ${phone('week', 'width:175px;left:800px;top:52px;transform:rotate(-4deg)')}
    ${phone('event', 'width:175px;left:975px;top:82px;transform:rotate(5deg)')}`],
];

(async () => {
  const browser = await chromium.launch();
  for (const [name, w, h, body] of B) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="canvas" style="width:${w}px;height:${h}px">${body}</div></body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    await page.close();
    console.log(name);
  }
  await browser.close();
})();
