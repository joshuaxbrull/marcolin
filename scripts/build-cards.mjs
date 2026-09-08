import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { resolve, extname } from "node:path";
import { chromium } from "@playwright/test";
import QRCode from "qrcode";
import { PDFDocument } from "pdf-lib";
import { GLASSES, MOTORCYCLE, pinSvg } from "../shared/pins.js";
import { withDpi } from "./png-density.mjs";

const root = resolve(".");
const rows = JSON.parse(await readFile("harleydavidson/data/locations.json", "utf8"));
const geography = JSON.parse(await readFile("cards/assets/states.json", "utf8"));
const esc = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const photoData = JSON.parse(await readFile("cards/photo-concepts.json", "utf8"));
const concepts = photoData.variants;
const photoOptions = [
  { id: "supplied", kind: "supplied", title: "Supplied Harley.jpg", source: "Harley.jpg", alt: "Portrait with Harley-Davidson goggles and a black leather jacket", frontName: "front" },
  ...photoData.suppliedPhotos.map(photo => ({ ...photo, kind: "supplied", frontName: `front-${photo.id}` })),
  ...concepts.map(photo => ({ ...photo, kind: "generated", frontName: `front-${photo.id}` }))
];
const selected = new Set(["MD", "DE", "VA", "WV"]);
const mercator = ([lng, lat]) => [lng * Math.PI / 180, -Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))];
const boundaryPoints = geography.features.filter(f => selected.has(f.properties.STUSPS)).flatMap(f => f.geometry.coordinates.flat(2)).map(mercator);
const minX = Math.min(...boundaryPoints.map(p => p[0])), maxX = Math.max(...boundaryPoints.map(p => p[0]));
const minY = Math.min(...boundaryPoints.map(p => p[1])), maxY = Math.max(...boundaryPoints.map(p => p[1]));
const scale = Math.min(765 / (maxX - minX), 555 / (maxY - minY));
const offset = [46 + (765 - (maxX - minX) * scale) / 2, 118 + (555 - (maxY - minY) * scale) / 2];
const project = coordinates => { const p = mercator(coordinates); return [(p[0] - minX) * scale + offset[0], (p[1] - minY) * scale + offset[1]]; };
function shape(feature) {
  return feature.geometry.coordinates.map(polygon => polygon.map(ring => ring.map((p, i) => `${i ? "L" : "M"}${project(p).map(v => v.toFixed(2)).join(",")}`).join(" ") + "Z").join(" ")).join(" ");
}
const groups = [];
for (const kind of ["eyewear", "dealership"]) {
  for (const loc of rows.filter(row => row.kind === kind)) {
    const point = project([loc.lng, loc.lat]);
    let group = groups.find(g => g.kind === kind && Math.hypot(g.x - point[0], g.y - point[1]) < 45);
    if (!group) { group = { kind, x: point[0], y: point[1], ids: [] }; groups.push(group); }
    const n = group.ids.length; group.x = (group.x * n + point[0]) / (n + 1); group.y = (group.y * n + point[1]) / (n + 1); group.ids.push(loc.id);
  }
}
// Separate nearby category symbols so shops and dealerships stay equally legible.
for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
  const a = groups[i], b = groups[j];
  if (a.kind !== b.kind && Math.hypot(a.x - b.x, a.y - b.y) < 40) { a.dx = -18; b.dx = 18; }
}
function regionalMap(dark) {
  const land = dark ? "#343632" : "#dddcd4", focus = dark ? "#575c51" : "#e8e2d3", line = dark ? "#828576" : "#a49e8f", ink = dark ? "#f6f2e8" : "#282a25";
  let map = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 100 1035 600" role="img" aria-label="Regional map of eyewear shops and motorcycle dealerships in Maryland, Delaware, Virginia, and West Virginia"><defs><clipPath id="mapclip"><rect width="1035" height="710" rx="14"/></clipPath></defs><g clip-path="url(#mapclip)"><rect width="1035" height="750" fill="${dark ? "#202d31" : "#e7edf0"}"/>`;
  for (const feature of geography.features) map += `<path d="${shape(feature)}" fill="${selected.has(feature.properties.STUSPS) ? focus : land}" stroke="${line}" stroke-width="2" fill-rule="evenodd"/>`;
  for (const group of groups) {
    const x = group.x + (group.dx || 0), y = group.y;
    map += `<g class="map-pin" transform="translate(${x - 17},${y - 44})"><title>${group.ids.length} ${group.kind === "eyewear" ? "eyewear shops" : "motorcycle dealerships"}</title>${pinSvg(group.kind).replace('viewBox="0 0 32 42"', 'viewBox="0 0 32 42" width="34" height="45"')}`;
    if (group.ids.length > 1) map += `<circle cx="34" cy="3" r="14" fill="${dark ? "#fff7e8" : "#fff"}" stroke="#333" stroke-width="1.3"/><text x="34" y="11" text-anchor="middle" font-family="Barlow Condensed" font-size="24" font-weight="600" fill="#111">${group.ids.length}</text>`;
    map += "</g>";
  }
  const labels = [["WV", -80.9, 38.5], ["VA", -78.5, 37.4], ["MD", -76.5, 38.45], ["DE", -75.35, 39.2]];
  for (const [name, lng, lat] of labels) {
    const [x, y] = project([lng, lat]); map += `<text x="${x}" y="${y}" fill="${ink}" font-family="Bebas Neue" font-size="43" letter-spacing="3" stroke="${dark ? "#343632" : "#e8e2d3"}" stroke-width="5" paint-order="stroke">${name}</text>`;
  }
  const [ocx, ocy] = project([-75.0874, 38.3315]);
  map += `<path d="M${ocx},${ocy-11}l3.3,7.3 8,.8-6,5.4 1.7,8-7,-4.2-7,4.2 1.7,-8-6,-5.4 8,-.8Z" fill="#f15a22" stroke="#111" stroke-width="1.5"/><path d="M${ocx+8},${ocy+7}l16,19h9" stroke="${ink}" stroke-width="2" fill="none"/><text class="ocean-city-label" x="${ocx+39}" y="${ocy+35}" text-anchor="start" fill="${ink}" font-family="Barlow Condensed" font-weight="600" font-size="29">OCEAN CITY, MD</text></g>`;
  map += "</svg>";
  return map;
}
const qrUrl = "https://joshuaxbrull.github.io/marcolin/hd/";
const qr = await QRCode.toString(qrUrl, { type: "svg", errorCorrectionLevel: "Q", margin: 4, color: { dark: "#000000", light: "#ffffff" } });
await mkdir("cards/proofs", { recursive: true });
await writeFile("cards/assets/qr.svg", qr);
await writeFile("cards/assets/map-light.svg", regionalMap(false));
await writeFile("cards/assets/map-dark.svg", regionalMap(true));
const icon = path => `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
const front = photo => `<div class="sheet front"><div class="trim"><div class="photo"><img src="assets/${esc(photo.source)}" alt="${esc(photo.alt)}"><div class="photo-brand"><p class="photo-brand-name">HARLEY-DAVIDSON</p><span>EYEWEAR</span></div></div><div class="contact"><div class="sidebar-brand"><img class="brand-logo" src="assets/harley-davidson-shield.svg" alt="Harley-Davidson Motor Cycles Bar and Shield logo"></div><div class="person"><h1>MIKE BRULL</h1><p class="title">Brand Specialist</p><p class="phone">301-639-8001</p><p class="email">mbrull@marcolin.com</p></div><div><p class="slogan">Find a shop.<br>Ride there.</p><p class="marcolin">MARCOLIN</p></div></div></div></div>`;
function back(dark) { return `<div class="sheet back ${dark ? "dark" : "light"}"><div class="trim"><div class="back-head"><p>HARLEY-DAVIDSON EYEWEAR</p><h2>FIND YOUR NEXT STOP.</h2></div><div class="map-art">${regionalMap(dark)}</div><div class="qr-column"><div class="qr">${qr}</div><p class="qr-caption">Scan QR to browse<br>available shops.</p><div class="legend"><p>${icon(GLASSES)}<span>Eyewear shops</span></p><p>${icon(MOTORCYCLE)}<span>Motorcycle dealers</span></p></div></div><p class="map-note">Area pins group nearby locations · Boundaries: U.S. Census Bureau</p><div class="facts"><p class="facts-kicker">THE EYEWEAR FACTS</p><p class="facts-head">Iconic Harley-Davidson style.</p><p class="facts-copy">Select Performance Series models meet ANSI impact standards. <strong>RX available.</strong></p></div></div></div>`; }
const css = `@font-face{font-family:"Bebas Neue";src:url("assets/BebasNeue-Regular.ttf")}@font-face{font-family:"Barlow Condensed";src:url("assets/BarlowCondensed-Regular.ttf")}@font-face{font-family:"Barlow Condensed";font-weight:600;src:url("assets/BarlowCondensed-SemiBold.ttf")}*{box-sizing:border-box}body{margin:0;background:#d9d5cc;font-family:"Barlow Condensed",sans-serif}.intro{max-width:1100px;margin:35px auto 25px;padding:0 20px;font-family:system-ui,sans-serif;color:#282a25}.intro h1{font-size:28px;letter-spacing:-1px;margin:0 0 10px}.intro p{font-size:14px;max-width:800px;line-height:1.6}.proofs{display:flex;justify-content:center;gap:28px;flex-wrap:wrap;padding:20px 20px 70px}.proof-label{font-family:system-ui,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px}.sheet{width:4.25in;height:3.25in;position:relative;overflow:hidden;break-after:page;box-shadow:0 8px 25px #0003}.trim{width:4in;height:3in;position:relative;left:.125in;top:.125in}.front{background:#191b18;color:#fbf6eb}.photo{position:absolute;left:33.333333%;right:-.125in;top:-.125in;bottom:-.125in;overflow:hidden;background:#818476}.photo img{position:absolute;width:100%;height:100%;left:0;top:0;object-fit:cover;object-position:50% 40%}.photo-brand{position:absolute;left:0;right:0;bottom:.18in;height:.72in;padding:.07in .255in .07in .13in;background:#191b18eF;color:#fff;font-family:"Bebas Neue";font-size:26pt;line-height:1;letter-spacing:.6pt}.photo-brand-name{margin:0}.photo-brand span{display:block;color:#ed8a4e;font-family:"Barlow Condensed";font-size:10pt;letter-spacing:2pt;margin-top:.04in}.contact{position:absolute;left:0;top:0;bottom:0;width:33.333333%;display:flex;flex-direction:column;justify-content:space-between;padding:.13in .10in .12in .045in;background:#191b18;border-right:2px solid #ef5b22}.sidebar-brand{display:flex;justify-content:center}.brand-logo{display:block;width:.88in;height:auto}.person h1{font-family:"Bebas Neue";font-size:16pt;line-height:1;font-weight:400;margin:0 0 .085in;letter-spacing:.2pt}.title{font-size:9pt;margin:0 0 .18in;color:#e7ddcc}.phone{font-size:10pt;font-weight:600;margin:0 0 .025in;white-space:nowrap}.email{font-size:8.15pt;margin:0;white-space:nowrap}.slogan{font-size:13pt;line-height:1.04;margin:0 0 .15in;font-weight:600}.marcolin{font-family:"Barlow Condensed";font-size:9.5pt;font-weight:600;letter-spacing:1.8pt;margin:0}.back.light{background:#f7f4ec;color:#252820}.back.dark{background:#171b19;color:#f7f4ec}.back-head{position:absolute;left:.035in;top:.06in}.back-head>p{font-size:6.8pt;letter-spacing:1.15pt;font-weight:600;color:#bd4316;margin:0 0 .025in}.back.dark .back-head>p{color:#ff9866}.back-head h2{font-family:"Bebas Neue";font-weight:400;font-size:22pt;letter-spacing:.3pt;line-height:1;margin:0}.map-art{position:absolute;left:-.02in;top:.48in;width:2.78in;height:1.72in}.map-art>svg{width:100%;height:100%;overflow:hidden}.qr-column{position:absolute;right:.035in;top:.49in;width:1.02in}.qr{background:#fff;padding:0;width:1.02in;height:1.02in;border-radius:0}.qr svg{display:block;width:100%;height:100%}.qr-caption{font-size:8.5pt;line-height:1.1;text-align:center;font-weight:600;margin:.04in -.04in .03in}.legend p{display:flex;align-items:center;gap:.065in;font-size:7.5pt;line-height:1;white-space:nowrap;margin:.02in 0}.legend svg{width:.20in;height:.20in;flex-shrink:0}.legend p:first-child svg{color:#d84b19}.map-note{position:absolute;left:.055in;top:2.22in;font-size:5.5pt;margin:0;white-space:nowrap}.facts{position:absolute;left:.035in;right:.035in;bottom:.08in;border-top:1.4px solid #dc5725;padding-top:.07in}.facts p{margin:0}.facts-kicker{font-size:6.4pt;letter-spacing:1.25pt;font-weight:600;color:#be4518}.dark .facts-kicker{color:#ff9866}.facts-head{font-size:12.5pt;font-weight:600;line-height:1.15;margin-top:.025in!important}.facts-copy{font-size:8.5pt;line-height:1.2;margin-top:.025in!important}@page{size:4.25in 3.25in;margin:0}@media print{body{background:none}.intro,.proof-label{display:none}.proofs{display:block;margin:0;padding:0}.proof{display:contents}.sheet{box-shadow:none}.sheet:last-child{break-after:auto}}`;
const printSafety = `.contact{padding-left:.13in;padding-bottom:.13in}.back-head{left:.125in;top:.125in}.map-art{top:.55in;height:1.55in}.qr-column{right:.125in;top:.51in}.qr{width:1in;height:1in;margin:0 auto}.qr-caption{margin-top:.03in;margin-left:0;margin-right:0}.legend p{margin:0}.legend p+p{margin-top:.01in}.map-note{left:.125in;top:2.14in}.facts{left:.125in;right:.125in;bottom:.125in}`;
const galleryStyles = `.intro h2{font-size:24px;margin:0 0 10px}.concept-note,.concept-links{max-width:408px;font:14px/1.6 system-ui,sans-serif}.concept-links a{white-space:nowrap}.facts-copy strong{font-weight:600}@media print{.concept-note,.concept-links{display:none}}`;
const documentHtml = body => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mike Brull · Event card proofs</title><style>${css}${printSafety}${galleryStyles}</style></head><body>${body}</body></html>`;
const caption = photo => `<div class="intro"><h1>Mike Brull · 4″ × 3″ event card</h1><p>Harley-Davidson leads the photo bar, with its shield in the left third and a smaller Mike Brull name. The supplied Harley.jpg front and both updated backs are below, followed by another supplied image and three new photo concepts. Ocean City is labeled to the right of the pins; the facts now include RX availability. Shown with ⅛″ bleed.</p><p>The supplied photograph provides approximately ${photo.effectivePpi} effective ppi. Approve a physical print and QR scan before the press run.</p><p><a href="proofs/card-light-back.pdf">Supplied photo · Light-back PDF</a> · <a href="proofs/card-dark-back.pdf">Supplied photo · Dark-back PDF</a> · <a href="#photo-options">Compare new photo options</a></p></div>`;
const gallery = metrics => documentHtml(caption(metrics.front) + `<div class="proofs"><div class="proof"><div class="proof-label">Supplied photo · One third / two thirds</div>${front(photoOptions[0])}</div><div class="proof"><div class="proof-label">Updated back · Light</div>${back(false)}</div><div class="proof"><div class="proof-label">Updated back · Dark</div>${back(true)}</div></div><div class="intro" id="photo-options"><h2>Front photo options</h2><p>For a busy rally, start with a clear face wearing the glasses and a recognizable motorcycle. My first choice is the seasoned rider. The three marked AI concepts use the supplied frame references. Check the illustrated eyewear against the actual product before printing.</p></div><div class="proofs">${photoOptions.slice(1).map((photo, index) => `<div class="proof"><div class="proof-label">${index + 1}. ${esc(photo.title)} · ${photo.kind === "generated" ? "AI concept" : "Supplied image"}</div>${front(photo)}<p class="concept-note">${esc(photo.description)} Approximately ${metrics[photo.frontName].effectivePpi} effective ppi.</p><p class="concept-links"><a href="proofs/card-${photo.id}-light-back.pdf">Light-back PDF</a> · <a href="proofs/card-${photo.id}-dark-back.pdf">Dark-back PDF</a><br><a href="proofs/${photo.frontName}-trim.png">Front proof</a> · <a href="assets/${esc(photo.source)}" download>Original photo</a></p></div>`).join("")}</div>`);
const faces = [...photoOptions.map(photo => [photo.frontName, front(photo)]), ["back-light", back(false)], ["back-dark", back(true)]];
for (const [name, html] of faces) await writeFile(`cards/${name}.html`, documentHtml(html));
const mime = { ".html": "text/html", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".ttf": "font/ttf", ".png": "image/png" };
const server = createServer(async (req, res) => {
  try { const path = resolve(root, "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname)); if (!path.startsWith(root + "/")) throw new Error(); const body = await readFile(path); res.writeHead(200, { "Content-Type": mime[extname(path)] || "application/octet-stream" }); res.end(body); } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const address = `http://127.0.0.1:${server.address().port}`;
let browser;
const photoMetrics = {};
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || process.argv.find(arg=>arg.startsWith("--chromium="))?.slice(11), args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1200 }, deviceScaleFactor: 6.25 });
  const page = await context.newPage();
  const pdfs = {};
  for (const [name] of faces) {
    await page.goto(`${address}/cards/${name}.html`); await page.evaluate(() => document.fonts.ready);
    if (name.startsWith("front")) {
      photoMetrics[name] = await page.locator(".photo img").evaluate(img => {
        const { width, height } = img.getBoundingClientRect();
        const factor = Math.max(width / img.naturalWidth, height / img.naturalHeight);
        if (!img.complete || !Number.isFinite(factor) || factor <= 0) throw new Error("The card photograph did not load.");
        return { sourcePixels: [img.naturalWidth, img.naturalHeight], effectivePpi: Math.round(96 / factor) };
      });
      if (photoOptions.find(photo => photo.frontName === name).kind === "generated" && photoMetrics[name].effectivePpi < 300) throw new Error(`Photo resolution below 300 effective ppi (${name}).`);
    }
    const unsafeText = await page.evaluate(() => {
      const trim = document.querySelector(".trim").getBoundingClientRect();
      return [...document.querySelectorAll(".contact p,.contact h1,.brand-logo,.photo-brand-name,.photo-brand span,.back-head p,.back-head h2,.qr-caption,.legend p,.facts p,.map-note")].filter(el => {
        const r = el.getBoundingClientRect();
        return r.left < trim.left + 11.5 || r.right > trim.right - 11.5 || r.top < trim.top + 11.5 || r.bottom > trim.bottom - 11.5 || el.scrollWidth > el.clientWidth + 1;
      }).map(el => el.textContent);
    });
    if (unsafeText.length) throw new Error(`Text outside print safe area (${name}): ${unsafeText.join(", ")}`);
    if (name.startsWith("back-")) {
      const overlap = await page.evaluate(() => {
        const facts = document.querySelector(".facts").getBoundingClientRect();
        return [".map-note", ".qr-column"].map(selector => ({selector, bottom:document.querySelector(selector).getBoundingClientRect().bottom, factsTop:facts.top})).filter(r => r.bottom > facts.top - 3);
      });
      if (overlap.length) throw new Error(`Back content needs more spacing (${name}): ${JSON.stringify(overlap)}`);
      const mapLabelProblem = await page.evaluate(() => {
        const label = document.querySelector(".ocean-city-label").getBoundingClientRect();
        const map = document.querySelector(".map-art > svg").getBoundingClientRect();
        if (label.left < map.left || label.right > map.right || label.top < map.top || label.bottom > map.bottom) return "Ocean City label is clipped.";
        const covered = [...document.querySelectorAll(".map-pin")].some(pin => {
          const r = pin.getBoundingClientRect();
          return label.left < r.right + 2 && label.right > r.left - 2 && label.top < r.bottom + 2 && label.bottom > r.top - 2;
        });
        return covered ? "Ocean City label overlaps a pin." : null;
      });
      if (mapLabelProblem) throw new Error(`${name}: ${mapLabelProblem}`);
    }
    await page.locator(".sheet").screenshot({ path: `cards/proofs/${name}-bleed.png` });
    // Capture trim by coordinates without changing the artwork or its photo.
    await page.screenshot({ path: `cards/proofs/${name}-trim.png`, clip: { x: 12, y: 12, width: 384, height: 288 } });
    for (const extent of ["bleed", "trim"]) {
      const path = `cards/proofs/${name}-${extent}.png`;
      await writeFile(path, withDpi(await readFile(path)));
    }
    const pdf = await PDFDocument.load(await page.pdf({ width: "4.25in", height: "3.25in", printBackground: true, preferCSSPageSize: true }));
    for (const p of pdf.getPages()) { p.setTrimBox(9, 9, 288, 216); p.setBleedBox(0, 0, 306, 234); p.setCropBox(0, 0, 306, 234); }
    pdf.setTitle(`Mike Brull 4 x 3 event card — ${name} design proof`);
    pdf.setSubject("Design proof. Approve the physical print and QR scan before press approval.");
    pdfs[name] = pdf;
  }
  for (const photo of photoOptions) for (const theme of ["light", "dark"]) {
    const combined = await PDFDocument.create();
    for (const name of [photo.frontName, `back-${theme}`]) { const [p] = await combined.copyPages(pdfs[name], [0]); combined.addPage(p); }
    combined.setTitle(`Mike Brull — ${photo.title} — ${theme} back — design proof`);
    combined.setSubject(photo.kind === "supplied" ? "Supplied photograph. Physical print and QR approval required." : "AI-generated photo concept; depicted frames are illustrative. Physical print and QR approval required.");
    const suffix = photo.id === "supplied" ? "" : `${photo.id}-`;
    await writeFile(`cards/proofs/card-${suffix}${theme}-back.pdf`, await combined.save());
  }
  let galleryHtml = gallery(photoMetrics);
  // Give changed downloads new URLs so a cached PDF cannot hide a card revision.
  const downloads = new Set([...galleryHtml.matchAll(/href="(proofs\/[^"?]+\.(?:pdf|png))"/g)].map(match => match[1]));
  for (const path of downloads) {
    const version = createHash("sha256").update(await readFile(`cards/${path}`)).digest("hex").slice(0, 12);
    galleryHtml = galleryHtml.replaceAll(`href="${path}"`, `href="${path}?v=${version}"`);
  }
  await writeFile("cards/index.html", galleryHtml);
  const preview = await browser.newPage({ viewport: { width: 1400, height: 680 }, deviceScaleFactor: 2 });
  await preview.goto(`${address}/cards/index.html`); await preview.evaluate(() => document.fonts.ready);
  await preview.screenshot({ path: "cards/proofs/preview.png", fullPage: true });
  await writeFile("cards/proofs/specification.json", JSON.stringify({ trimInches: [4,3], bleedInches: .125, rasterDpi: 600, frontSplit: { contact: 1/3, photo: 2/3 }, frontBranding:{sidebarLogo:"cards/assets/harley-davidson-shield.svg",photoBrandFontPt:26,contactNameFontPt:16}, directoryCount: rows.length, directoryIds: rows.map(r=>r.id), qrUrl, qrQuietModules:4, qrErrorCorrection:"Q", photoSource:"cards/assets/Harley.jpg", photoSourcePixels:photoMetrics.front.sourcePixels, photoEffectivePpi:photoMetrics.front.effectivePpi, photoVariants:photoOptions.slice(1).map(photo=>({id:photo.id,title:photo.title,source:`cards/assets/${photo.source}`,generationMode:photo.kind === "generated" ? "built-in image_gen" : "supplied image",...photoMetrics[photo.frontName]})), status:"design-proof-requires-physical-print-and-qr-scan" }, null, 2)+"\n");
  console.log(`Exported ${photoOptions.length} photo fronts and light/dark backs for ${rows.length} directory locations.`);
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
