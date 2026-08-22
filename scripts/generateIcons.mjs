/**
 * Derives every icon and the social share card from `images/logo.png` into `public/`.
 *
 * NOT part of the build. Run it by hand — `npm run icons` — when the logo changes, and commit the
 * results: they are small (~130KB all together), they change about as often as the brand does, and
 * making every build regenerate them would churn seven binary files on every CI run for nothing.
 *
 * WHY IT IS WRITTEN OUT LONGHAND
 * The obvious tools are not available: there is no ImageMagick on the dev machine, and sharp would
 * pull a ~10MB platform-specific native binary into devDependencies to resize seven images that
 * change once a year. Node's own zlib is enough — PNG is deflate plus a per-row filter byte — so
 * this decodes, box-filters and re-encodes with no dependency at all.
 *
 * WHAT IT EMITS
 *   favicon.ico              16/32/48 in one container, for /favicon.ico and bookmark bars
 *   favicon-16/32.png        the modern <link rel="icon"> pair
 *   apple-touch-icon.png     180x180, iOS home screen
 *   icon-192/512.png         Android home screen, referenced from the generated site.webmanifest
 *   og-image.png             1200x630 share card
 *
 * The tags that point at these live in index.html (the icons, which never vary) and in
 * shared/seo/pageMeta.ts (og:image, which needs the absolute origin).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync, deflateSync } from 'node:zlib';

/* ---------- decode ---------- */
function decodePng(buf) {
  let pos = 8;
  let ihdr = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!ihdr) throw new Error('no IHDR');
  if (ihdr.bitDepth !== 8) throw new Error('only 8-bit supported, got ' + ihdr.bitDepth);
  if (ihdr.interlace !== 0) throw new Error('interlaced PNG not supported');

  const channelsFor = { 0: 1, 2: 3, 4: 2, 6: 4 };
  const channels = channelsFor[ihdr.colorType];
  if (!channels) throw new Error('palette PNG not supported');

  const raw = inflateSync(Buffer.concat(idat));
  const { width, height } = ihdr;
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);

  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    const line = raw.subarray(rp, rp + stride);
    rp += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      const v = line[x];
      let r;
      switch (filter) {
        case 0: r = v; break;
        case 1: r = v + a; break;
        case 2: r = v + b; break;
        case 3: r = v + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error('bad filter ' + filter);
      }
      cur[x] = r & 0xff;
    }
  }

  // normalise to RGBA
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels, d = i * 4;
    if (channels === 3) { rgba[d] = out[s]; rgba[d+1] = out[s+1]; rgba[d+2] = out[s+2]; rgba[d+3] = 255; }
    else if (channels === 4) { rgba[d] = out[s]; rgba[d+1] = out[s+1]; rgba[d+2] = out[s+2]; rgba[d+3] = out[s+3]; }
    else if (channels === 1) { rgba[d] = rgba[d+1] = rgba[d+2] = out[s]; rgba[d+3] = 255; }
    else { rgba[d] = rgba[d+1] = rgba[d+2] = out[s]; rgba[d+3] = out[s+1]; }
  }
  return { width, height, data: rgba };
}

/* ---------- encode ---------- */
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng({ width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter none — these are tiny, deflate handles it
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- box-filter resize (high quality for large downscales) ---------- */
function resize(src, w, h) {
  const out = Buffer.alloc(w * h * 4);
  const xr = src.width / w, yr = src.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * yr), y1 = Math.max(y0 + 1, Math.floor((y + 1) * yr));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * xr), x1 = Math.max(x0 + 1, Math.floor((x + 1) * xr));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * src.width + sx) * 4;
          const al = src.data[i + 3] / 255;
          r += src.data[i] * al; g += src.data[i + 1] * al; b += src.data[i + 2] * al;
          a += src.data[i + 3]; n++;
        }
      }
      const d = (y * w + x) * 4;
      const aa = a / n;
      const un = aa > 0 ? 255 / aa : 0;
      out[d] = Math.min(255, Math.round((r / n) * un));
      out[d + 1] = Math.min(255, Math.round((g / n) * un));
      out[d + 2] = Math.min(255, Math.round((b / n) * un));
      out[d + 3] = Math.round(aa);
    }
  }
  return { width: w, height: h, data: out };
}

/* ---------- compose logo onto a canvas (for the OG card) ---------- */
function canvas(w, h, [br, bg, bb]) {
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = br; data[i * 4 + 1] = bg; data[i * 4 + 2] = bb; data[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data };
}
function drawOnto(dst, src, ox, oy) {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const dy = oy + y, dx = ox + x;
      if (dy < 0 || dy >= dst.height || dx < 0 || dx >= dst.width) continue;
      const s = (y * src.width + x) * 4, d = (dy * dst.width + dx) * 4;
      const a = src.data[s + 3] / 255;
      dst.data[d] = Math.round(src.data[s] * a + dst.data[d] * (1 - a));
      dst.data[d + 1] = Math.round(src.data[s + 1] * a + dst.data[d + 1] * (1 - a));
      dst.data[d + 2] = Math.round(src.data[s + 2] * a + dst.data[d + 2] * (1 - a));
      dst.data[d + 3] = 255;
    }
  }
}

/* ---------- ICO container (PNG payloads, Vista+) ---------- */
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + pngs.length * 16;
  for (const { size, buf } of pngs) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e[2] = 0; e[3] = 0;
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buf.length, 8); e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += buf.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.buf)]);
}

/* ---------- run ---------- */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = decodePng(readFileSync(join(root, 'images', 'logo.png')));
console.log(`source ${src.width}x${src.height}`);
mkdirSync(join(root, 'public'), { recursive: true });

// Sample the source corner for the OG background so the logo sits on its own ground colour.
const corner = [src.data[0], src.data[1], src.data[2]];
console.log('corner colour', corner);

const write = (name, img) => {
  const buf = encodePng(img);
  writeFileSync(join(root, 'public', name), buf);
  console.log(`  ${name.padEnd(24)} ${img.width}x${img.height}  ${(buf.length / 1024).toFixed(1)} KB`);
  return buf;
};

write('favicon-16.png', resize(src, 16, 16));
write('favicon-32.png', resize(src, 32, 32));
write('apple-touch-icon.png', resize(src, 180, 180));
write('icon-192.png', resize(src, 192, 192));
write('icon-512.png', resize(src, 512, 512));

// favicon.ico — 16/32/48 in one container, for /favicon.ico requests and bookmark bars.
const ico = buildIco([16, 32, 48].map((size) => ({ size, buf: encodePng(resize(src, size, size)) })));
writeFileSync(join(root, 'public', 'favicon.ico'), ico);
console.log(`  favicon.ico              16/32/48  ${(ico.length / 1024).toFixed(1)} KB`);

// OG card: 1200x630. The logo is a full-bleed square illustration whose artwork runs to its own
// edges, so it is scaled to the full card height and centred — insetting it would leave a visible
// hard rectangle where the artwork stops. The side bars take the logo's own background orange.
const og = canvas(1200, 630, corner);
const mark = resize(src, 630, 630);
drawOnto(og, mark, Math.round((1200 - 630) / 2), 0);
write('og-image.png', og);
