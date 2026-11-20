// Usage: node duo.js <shotsDir> <metadataDir> <outDir>
// iPhone Duo App Store screenshots (inner display, 2007x2853 portrait), same style as compose.js.
// The inner display uses the regular/regular size class, so Weekdot shows its iPad layout there;
// until the screenshots workflow has an iPhone Duo simulator (Xcode 27.1), the iPad captures are used.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [,, SHOTS, LOCS, OUT] = process.argv;
const LANG_FOR = { 'en-US': 'en', 'nl-NL': 'nl' };
const ORDER = ['week', 'month', 'list', 'day', 'event', 'discover', 'sports', 'week-dark'];
const W = 2007, H = 2853;
// first screenshot gets an iPhone Duo caption; the rest reuse the captions in metadata/<locale>.json
const DUO_CAPS = { 'nl-NL': { week: 'Klap open voor je hele week' }, 'en-US': { week: 'Unfold your whole week' } };

function dataURL(p) { return 'data:image/png;base64,' + fs.readFileSync(p).toString('base64'); }
function html(img, imgW, imgH, caption, dark, n) {
  const top = 420, bezel = 24, radius = 58;
  let ih = H - top - 40, iw = ih * imgW / imgH;
  const maxW = W * 0.84;
  if (iw > maxW) { iw = maxW; ih = iw * imgH / imgW; }
  const left = (W - iw) / 2 - bezel;
  const bg = dark ? 'radial-gradient(1200px 900px at 80% 10%, #3a1212 0%, #121214 60%)'
                  : 'radial-gradient(1400px 1000px at 85% 0%, #ffe3df 0%, #fff7f5 45%, #f4f1ee 100%)';
  const ink = dark ? '#fff' : '#141418';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:${bg};font-family:-apple-system,"SF Pro Display","Inter","Helvetica Neue",Arial,sans-serif}
  .cap{position:absolute;left:0;right:0;top:120px;text-align:center;color:${ink};font-weight:800;font-size:118px;letter-spacing:-.02em;line-height:1.05;padding:0 110px}
  .dots{position:absolute;left:50%;transform:translateX(-50%);top:60px;display:flex;gap:14px}
  .dots i{width:16px;height:16px;border-radius:50%;background:#e8352f;opacity:.35;display:block}.dots i.on{opacity:1}
  .body{position:absolute;left:${left}px;top:${top}px;width:${iw + 2 * bezel}px;height:${ih + 2 * bezel}px;border-radius:${radius + bezel}px;
    background:#111;box-shadow:0 80px 160px -50px rgba(0,0,0,.55), inset 0 0 0 3px #2c2c30}
  .screen{position:absolute;left:${bezel}px;top:${bezel}px;width:${iw}px;height:${ih}px;border-radius:${radius}px;overflow:hidden}
  .screen img{width:100%;height:100%;display:block}
  /* the fold: a faint crease down the middle of the inner display */
  .crease{position:absolute;left:50%;top:0;bottom:0;width:60px;transform:translateX(-50%);
    background:linear-gradient(90deg,transparent,rgba(0,0,0,${dark ? .10 : .045}) 45%,rgba(255,255,255,${dark ? .04 : .10}) 52%,transparent)}
  .cam{position:absolute;right:${bezel + 44}px;top:${bezel + 30}px;width:30px;height:30px;border-radius:50%;background:#050505;box-shadow:0 0 0 3px rgba(255,255,255,.06)}
  .hinge{position:absolute;left:${left + (iw + 2 * bezel) / 2 - 7}px;top:${top - 10}px;width:14px;height:22px;border-radius:7px;background:#2a2a2e}
  .hinge.b{top:${top + ih + 2 * bezel - 12}px}
  .btn{position:absolute;left:${left + iw + 2 * bezel - 3}px;top:${top + 260}px;width:12px;height:150px;border-radius:6px;background:#2a2a2e}
  </style></head><body><div class="dots">${ORDER.map((_, i) => `<i class="${i === n ? 'on' : ''}"></i>`).join('')}</div>
  <div class="cap">${caption}</div>
  <div class="hinge"></div><div class="hinge b"></div><div class="btn"></div>
  <div class="body"><div class="screen"><img src="${img}"><div class="crease"></div></div></div>
  </body></html>`;
}
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage();
  await page.setViewportSize({ width: W, height: H });
  for (const loc of Object.keys(LANG_FOR)) {
    const meta = JSON.parse(fs.readFileSync(path.join(LOCS, loc + '.json')));
    const caps = meta.screenshot_captions || {};
    const dir = path.join(SHOTS, LANG_FOR[loc], 'ipad');
    const outDir = path.join(OUT, loc); fs.mkdirSync(outDir, { recursive: true });
    let n = 0;
    for (const sc of ORDER) {
      const f = path.join(dir, sc + '.png'); if (!fs.existsSync(f)) continue;
      const buf = fs.readFileSync(f);
      const cap = (DUO_CAPS[loc] || {})[sc] || caps[sc] || sc;
      await page.setContent(html(dataURL(f), buf.readUInt32BE(16), buf.readUInt32BE(20), cap, sc === 'week-dark', n));
      await page.waitForTimeout(80);
      n++;
      await page.screenshot({ path: path.join(outDir, String(n).padStart(2, '0') + '-' + sc + '.png') });
    }
    console.log('done', loc, n);
  }
  await b.close();
})();
