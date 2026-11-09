// Renders the Open Graph images for weekdot.com (1200×630, NL + EN) into website/og/.
// node tools/og.js   (then: python3 tools/bust_cache.py)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'website', 'og');
fs.mkdirSync(OUT, { recursive: true });
const img = f => 'data:' + (f.endsWith('.png') ? 'image/png' : 'image/jpeg') + ';base64,' + fs.readFileSync(path.join(ROOT, f)).toString('base64');
const ICON = img('website/assets/icon.png');
const shot = (lang, n) => img(`website/assets/shots/${lang}/gallery/${n}.jpg`);
const APPLE = '<path d="M16.37 12.75c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.74-.78-2.87-.76-1.47.02-2.83.86-3.59 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.24 2.73 2.2 1.1-.04 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.07 2.65-2.13.84-1.22 1.18-2.41 1.2-2.47-.03-.01-2.3-.88-2.32-3.5zM14.21 6.3c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.54 1.31-.56.64-1.05 1.67-.92 2.66.97.07 1.96-.49 2.56-1.21z"/>';

const TEXT = {
  nl: { home: ['Je week in <em>één</em> oogopslag', 'Gratis agenda voor iPhone, iPad, Mac en Apple Watch'],
        support: ['Hulp bij <em>Weekdot</em>', 'Antwoorden over agenda’s, meldingen, widgets, sync en Homey'],
        badge: 'Download in de' },
  en: { home: ['Your week at <em>a glance</em>', 'Free calendar for iPhone, iPad, Mac and Apple Watch'],
        support: ['Weekdot <em>help</em>', 'Answers about calendars, alerts, widgets, sync and Homey'],
        badge: 'Download on the' },
};
const SHOTS = { home: ['week', 'list'], support: ['event', 'list'] };

const CSS = `*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,-apple-system,sans-serif;color:#131318;-webkit-font-smoothing:antialiased}
.c{position:relative;width:1200px;height:630px;overflow:hidden;background:#fbfaf8}
.c::before{content:"";position:absolute;inset:0;background-image:radial-gradient(circle,rgba(19,19,24,.09) 2px,transparent 2.4px);background-size:32px 32px}
.glow{position:absolute;width:820px;height:820px;left:620px;top:-120px;border-radius:50%;background:radial-gradient(circle,rgba(232,53,47,.28),rgba(232,53,47,0) 65%)}
.txt{position:absolute;left:84px;top:96px;width:600px}
.brand{display:flex;align-items:center;gap:16px;font-size:34px;font-weight:800;letter-spacing:-.02em}
.brand img{width:64px;border-radius:22%;box-shadow:0 8px 24px -10px rgba(0,0,0,.35)}
h1{font-size:76px;font-weight:800;letter-spacing:-.035em;line-height:1.02;margin-top:34px}
h1 em{font-style:normal;color:#e8352f}
p{font-size:28px;line-height:1.3;color:#4c4c57;font-weight:500;margin-top:20px}
.row{display:flex;align-items:center;gap:24px;margin-top:34px}
.badge{display:inline-flex;align-items:center;gap:12px;background:#000;color:#fff;border-radius:14px;padding:10px 22px 11px 16px}
.badge svg{width:40px;height:40px;fill:#fff}
.badge small{display:block;font-size:14px;font-weight:500}.badge b{display:block;font-size:27px;font-weight:600;letter-spacing:-.01em;line-height:1.05}
.url{font-size:26px;font-weight:700}
.phone{position:absolute;width:250px;aspect-ratio:1000/2173;padding:3px;border-radius:15%/7%;background:#111;box-shadow:0 40px 80px -30px rgba(0,0,0,.5),inset 0 0 0 2px #2b2b30}
.phone .g{width:100%;height:100%;border-radius:13.5%/6.3%;overflow:hidden}.phone img{width:100%;height:100%;object-fit:cover;display:block}`;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  for (const lang of ['nl', 'en']) {
    for (const page of ['home', 'support']) {
      const [h, sub] = TEXT[lang][page];
      const [a, c] = SHOTS[page];
      await p.setContent(`<!doctype html><meta charset="utf-8"><style>${CSS}</style><div class="c"><div class="glow"></div>
        <div class="txt"><div class="brand"><img src="${ICON}">Weekdot</div><h1>${h}</h1><p>${sub}</p>
        <div class="row"><span class="badge"><svg viewBox="0 0 24 24">${APPLE}</svg><span><small>${TEXT[lang].badge}</small><b>App Store</b></span></span><span class="url">weekdot.com</span></div></div>
        <div class="phone" style="left:735px;top:70px;transform:rotate(-4deg)"><div class="g"><img src="${shot(lang, a)}"></div></div>
        <div class="phone" style="left:935px;top:105px;transform:rotate(5deg)"><div class="g"><img src="${shot(lang, c)}"></div></div></div>`);
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(150);
      await p.screenshot({ path: path.join(OUT, `${page}-${lang}.jpg`), type: 'jpeg', quality: 86 });
      console.log(`${page}-${lang}.jpg`);
    }
  }
  await b.close();
})();
