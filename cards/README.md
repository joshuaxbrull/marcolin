# Mike Brull event card proofs

Open [the HTML gallery](index.html) to compare all fronts and download either back color. [The full preview](proofs/preview.png) shows the supplied Harley.jpg, updated backs, supplied helmeted couple, and three generated concepts. The standard duplex PDFs still use Harley.jpg: [light back](proofs/card-light-back.pdf), [dark back](proofs/card-dark-back.pdf).

- Finished size: **4 inches wide × 3 inches high**, landscape.
- Front: left one third holds the official Harley-Davidson shield and contact details. Mike Brull is a secondary, single-line 16 pt contact label, reduced from the original 32 pt name. The right two thirds holds the photo and a larger 26 pt Harley-Davidson name across the dark bar, with faces and eyewear above it.
- Back: MD/DE/VA/WV directory map with equal-size eyewear/dealership symbols, grouped nearby pins, Ocean City marker, QR and eyewear facts. The Ocean City label sits in open ocean to the right of its marker; the map has extra horizontal space without reducing pin size.
- Facts: “Select Performance Series models meet ANSI impact standards. **RX available.**”
- QR target: `https://joshuaxbrull.github.io/marcolin/hd/`, error correction Q, four quiet modules, one inch square. Both exported back PNGs decode to this URL in the automated check.
- PDF MediaBox/BleedBox: 306 × 234 points. TrimBox: 288 × 216 points inset 9 points (⅛ inch). Text safe margin: at least ⅛ inch inside trim.
- PNGs: 2400 × 1800 at trim; 2550 × 1950 with bleed, with 600 dpi metadata.

| Front | Image | Light-back PDF | Dark-back PDF |
| --- | --- | --- | --- |
| Supplied Harley.jpg | [Original](assets/Harley.jpg) | [PDF](proofs/card-light-back.pdf) | [PDF](proofs/card-dark-back.pdf) |
| Supplied helmeted couple | [Original](assets/rally-couple-supplied.png) | [PDF](proofs/card-supplied-couple-light-back.pdf) | [PDF](proofs/card-supplied-couple-dark-back.pdf) |
| Seasoned rider · AI concept, HZ0051 guide | [Image](assets/front-seasoned-rider-hz0051.png) | [PDF](proofs/card-seasoned-rider-light-back.pdf) | [PDF](proofs/card-seasoned-rider-dark-back.pdf) |
| Coastal rider · AI concept, HZ0044 guide | [Image](assets/front-coastal-rider-hz0044.png) | [PDF](proofs/card-coastal-rider-light-back.pdf) | [PDF](proofs/card-coastal-rider-dark-back.pdf) |
| Rally together · AI concept, HZ0048 guide | [Image](assets/front-rally-couple-hz0048.png) | [PDF](proofs/card-rally-couple-light-back.pdf) | [PDF](proofs/card-rally-couple-dark-back.pdf) |

**These are design proofs.** Approve a physical print/QR scan before the press run. The supplied 1080 × 1350 Harley.jpg provides approximately 387 effective ppi. The supplied 975 × 968 couple image provides approximately 298 effective ppi, just below the 300 ppi target; inspect its physical proof. Generated concepts exceed 300 effective ppi. Exact source dimensions and effective resolution are in [specification.json](proofs/specification.json). Raster export at 600 dpi does not create additional photographic detail. PDFs use RGB artwork; have the printer apply their specified stock/profile and duplex orientation.

All supplied images are preserved byte for byte. The four newly supplied files had .jpg names but contain PNG data; copies use the correct .png extension. AI concepts were generated and refined using the **built-in image_gen tool**, with the supplied HZ0051, HZ0044 and HZ0048 screenshots as visual references. They are illustrative, not manufacturer product photographs or proof of a particular frame's certification. Compare the depicted eyewear with the actual product before printing.

See [creative choices and sources](creative-notes.md) and [the exact generation/refinement prompts](photo-concepts.json). Initial generated images are also retained in assets; the gallery and PDFs use the refined versions.

Facts were adapted from the user's `Style B Back Facts.docx`, with RX availability added at the user's request. The ANSI wording applies to select Performance Series models; it does not claim all frames meet an impact rating.

Map boundaries: [U.S. Census cartographic boundary KML, states 2018, 1:20m](https://www2.census.gov/geo/tiger/GENZ2018/kml/cb_2018_us_state_20m.zip). Fonts: Bebas Neue and Barlow Condensed, with their OFL licenses in assets. Map source locations come from the canonical directory; see [the dated location audit](../docs/directory-audit.md).

Rebuild with Node 22+, `npm ci`, `npx playwright install chromium`, then `npm run cards:build`. Set `CHROMIUM_PATH` if using a custom browser. The builder checks the print safe area, map/legend spacing, Ocean City label clearance from every pin, and generated-photo resolution. Run `npm test` to check both QR codes, all 14 raster exports, and all 10 duplex PDFs.

Sidebar logo: the [official Harley-Davidson Bar and Shield SVG](https://www.harley-davidson.com/ctfasset/5vy1mse9fkav/78rzR89t28gPHAepqNx7kS/19da21b034998035d965b9fbf3009739/shield-icon-black-nav.svg) from the [Harley-Davidson US homepage](https://www.harley-davidson.com/us/en/index.html), retrieved 8 September 2026 and preserved byte for byte in assets/harley-davidson-shield-source.svg. The displayed harley-davidson-shield.svg removes only the exported artboard rectangle; all logo paths and colors are unchanged.
