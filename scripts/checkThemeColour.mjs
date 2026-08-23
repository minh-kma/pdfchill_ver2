/**
 * Fails the build if the page background is stated inconsistently in the three places that must
 * agree on it.
 *
 * `--color-canvas` in src/index.css is the source of truth, but two consumers cannot read a CSS
 * variable and so have to repeat it as a literal hex:
 *   - index.html            <meta name="theme-color">     (mobile browser chrome)
 *   - scripts/prerender.mjs background_color / theme_color (the generated webmanifest)
 *
 * A comment asking the next person to keep them in sync does not survive contact with the next
 * person, so this checks it instead. It runs from `prebuild`, which means `npm run build` — the
 * project's only gate — catches the drift.
 *
 * The expected hex is DERIVED from the oklch() token rather than compared against a hard-coded
 * value, so editing the token to a new colour and forgetting the other two files is exactly the
 * case this catches. The `/* #rrggbb *\/` comment beside the token is checked too, since a stale
 * comment there is what would mislead someone doing this by hand.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

/* --- oklch -> sRGB hex. Same maths as the ramp generator; no dependency. ------------------- */

const linToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

function oklchToHex(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return (
    '#' +
    rgb
      .map((v) => Math.round(Math.min(1, Math.max(0, linToSrgb(v))) * 255))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

/* --- Extract the four statements of the same colour ---------------------------------------- */

const css = read('src/index.css');
const token = css.match(
  /--color-canvas:\s*oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)\s*;(?:\s*\/\*\s*(#[0-9a-fA-F]{6})\s*\*\/)?/,
);
if (!token) {
  throw new Error(
    'checkThemeColour: could not find `--color-canvas: oklch(L% C H);` in src/index.css. ' +
      'If the token was renamed or reformatted, update this script to match.',
  );
}

const expected = oklchToHex(Number(token[1]) / 100, Number(token[2]), Number(token[3]));

const html = read('index.html').match(
  /<meta\s+name="theme-color"\s+content="(#[0-9a-fA-F]{6})"\s*\/?>/,
);
const prerenderSrc = read('scripts/prerender.mjs');
const bg = prerenderSrc.match(/background_color:\s*'(#[0-9a-fA-F]{6})'/);
const themeColor = prerenderSrc.match(/theme_color:\s*'(#[0-9a-fA-F]{6})'/);

const found = [
  ['src/index.css  (comment beside the token)', token[4] ?? '(no comment)'],
  ['index.html     theme-color', html?.[1] ?? '(not found)'],
  ['prerender.mjs  background_color', bg?.[1] ?? '(not found)'],
  ['prerender.mjs  theme_color', themeColor?.[1] ?? '(not found)'],
];

const wrong = found.filter(([, value]) => value.toLowerCase() !== expected);

if (wrong.length > 0) {
  const lines = found.map(
    ([where, value]) =>
      `  ${value.toLowerCase() === expected ? 'ok  ' : 'BAD '} ${where.padEnd(42)} ${value}`,
  );
  throw new Error(
    `checkThemeColour: the page background disagrees across files.\n\n` +
      `  --color-canvas is oklch(${token[1]}% ${token[2]} ${token[3]}) = ${expected}\n\n` +
      lines.join('\n') +
      `\n\nUpdate the ${wrong.length} mismatched value(s) to ${expected}.\n`,
  );
}

console.log(`checkThemeColour: page background ${expected} consistent across 4 declarations`);
