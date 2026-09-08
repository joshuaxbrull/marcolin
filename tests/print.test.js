import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import { PDFDocument } from "pdf-lib";

test("both back PNGs decode to the short canonical shop URL", async () => {
  for (const theme of ["light", "dark"]) {
    const png = PNG.sync.read(await readFile(`cards/proofs/back-${theme}-trim.png`));
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    assert.equal(decoded?.data, "https://joshuaxbrull.github.io/marcolin/hd/");
  }
});
test("raster proofs have exact trim/bleed dimensions and 600 dpi metadata", async () => {
  for (const face of ["front", "back-light", "back-dark"]) for (const extent of ["trim", "bleed"]) {
    const png = await readFile(`cards/proofs/${face}-${extent}.png`);
    assert.equal(png.readUInt32BE(16), extent === "trim" ? 2400 : 2550);
    assert.equal(png.readUInt32BE(20), extent === "trim" ? 1800 : 1950);
    const at = png.indexOf(Buffer.from("pHYs")); assert.ok(at > 0);
    assert.equal(png.readUInt32BE(at + 4), 23622); assert.equal(png.readUInt32BE(at + 8), 23622); assert.equal(png[at + 12], 1);
  }
});
test("two-sided PDFs have 4 by 3 inch trim and one eighth inch bleed", async () => {
  for (const theme of ["light", "dark"]) {
    const pdf = await PDFDocument.load(await readFile(`cards/proofs/card-${theme}-back.pdf`));
    assert.equal(pdf.getPageCount(), 2);
    for (const page of pdf.getPages()) {
      assert.deepEqual(page.getTrimBox(), { x:9, y:9, width:288, height:216 });
      assert.deepEqual(page.getBleedBox(), { x:0, y:0, width:306, height:234 });
      assert.deepEqual(page.getMediaBox(), { x:0, y:0, width:306, height:234 });
    }
  }
});
