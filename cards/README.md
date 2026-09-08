# Mike Brull event card proofs

Open [the three-up preview](proofs/preview.png) or [the HTML gallery](index.html). The two duplex PDFs use the same front: [light back](proofs/card-light-back.pdf), [dark back](proofs/card-dark-back.pdf).

- Finished size: **4 inches wide × 3 inches high**, landscape.
- Front: left one third contact details; right two thirds real rider photograph facing left.
- Back: MD/DE/VA/WV directory map with equal-size eyewear/dealership symbols, grouped nearby pins, Ocean City marker, QR and eyewear facts.
- QR target: `https://joshuaxbrull.github.io/marcolin/hd/`, error correction Q, four quiet modules, one inch square. Both exported back PNGs decode to this URL in the automated check.
- PDF MediaBox/BleedBox: 306 × 234 points. TrimBox: 288 × 216 points inset 9 points (⅛ inch). Text safe margin: at least ⅛ inch inside trim.
- PNGs: 2400 × 1800 at trim; 2550 × 1950 with bleed, with 600 dpi metadata.

**These are design proofs.** The selected 943 × 1200 photo supplies approximately 215 effective ppi in this tight crop. Obtain the same image at higher resolution for 300+ effective ppi (at least about 1320 pixels wide at this crop), and approve a physical print/QR scan before the press run. Raster export at 600 dpi does not create additional photographic detail. PDFs use RGB artwork; have the printer apply their specified stock/profile and duplex orientation.

The original photo is preserved byte for byte. Mirroring and cropping happen in the layout. [Campaign image source](https://www.liensonoptic.vn/blogs/news/kinh-mat-harley-davidson-chinh-hang-voi-phong-cach-duong-pho-ca-tinh) / [original file](https://file.hstatic.net/1000357311/file/harley02_933672d7ddc24ba8adda234eb3a34298.jpg). Use the brand-supplied production file for the final print asset.

Facts were adapted from the user's `Style B Back Facts.docx`: iconic Harley-Davidson styling and ANSI impact standards for select Performance Series models. The copy intentionally does not claim that all frames meet a particular impact rating.

Map boundaries: [U.S. Census cartographic boundary KML, states 2018, 1:20m](https://www2.census.gov/geo/tiger/GENZ2018/kml/cb_2018_us_state_20m.zip). Fonts: Bebas Neue and Barlow Condensed, with their OFL licenses in `assets/`. Map source locations come from the canonical directory; see [the dated location audit](../docs/directory-audit.md).

Rebuild with Node 22+, `npm ci`, `npx playwright install chromium`, then `npm run cards:build`. Set `CHROMIUM_PATH` if using a custom browser. The builder rejects text outside the safe area and map/legend collisions with the facts block. Run `npm test` to check exported QR codes, pixel metadata and PDF boxes.
