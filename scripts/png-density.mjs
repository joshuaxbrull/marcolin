// Add print-resolution metadata without changing the PNG image pixels.
export function withDpi(png, dpi = 600) {
  const chunks = [png.subarray(0, 8)];
  const data = Buffer.alloc(9);
  data.writeUInt32BE(Math.round(dpi / .0254), 0);
  data.writeUInt32BE(Math.round(dpi / .0254), 4);
  data[8] = 1;
  const typeAndData = Buffer.concat([Buffer.from("pHYs"), data]);
  let crc = 0xffffffff;
  for (const byte of typeAndData) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const density = Buffer.alloc(21);
  density.writeUInt32BE(9, 0); typeAndData.copy(density, 4);
  density.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 17);
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at) + 12;
    const type = png.toString("ascii", at + 4, at + 8);
    if (type !== "pHYs") chunks.push(png.subarray(at, at + length));
    if (type === "IHDR") chunks.push(density);
    at += length;
  }
  return Buffer.concat(chunks);
}
