/**
 * Copies tesseract.js's runtime assets out of node_modules into `public/tesseract/`, so they are
 * served same-origin instead of from a CDN. Runs as `predev` and `prebuild`.
 *
 * WHY THIS EXISTS
 * tesseract.js is the one dependency that does not ship its heavy parts inside the bundle. Left
 * alone, `createWorker()` resolves three separate URLs against cdn.jsdelivr.net at runtime — the
 * worker script, the wasm core, and the ~3MB language model — which breaks CLAUDE.md §5 ("no CDN
 * fetch for a worker; the app works offline after first load"), leaks the visitor's IP and the
 * fact that they used OCR to a third party, and would be blocked by any CSP worth setting.
 * pdf.js and qpdf-wasm are already same-origin via `?url` imports; this closes the last gap.
 *
 * WHY A COPY STEP AND NOT `?url` IMPORTS
 * The worker builds these paths itself, by name, at runtime:
 *   - the core:      `${corePath}/tesseract-core-{variant}.wasm.js`  (getCore.js)
 *   - the language:  `${langPath}/{lang}.traineddata.gz`             (worker-script/index.js)
 * Both are string concatenations onto a *directory*, so the filenames cannot be hashed and the
 * directory has to exist as-is. A `?url` import — which renames each file — cannot express that.
 * `worker.min.js` is the one single-file path, and `ocrDocument.ts` does import that with `?url`.
 *
 * The output is gitignored: npm already holds these files, so committing ~16MB of duplicates
 * would only add a second copy to keep in sync. Any build that runs `npm ci && npm run build`
 * (CI, `wrangler deploy`, Cloudflare's Git integration) regenerates them.
 */

import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = join(projectRoot, 'public', 'tesseract');

/**
 * Only the `-lstm` variants, because `ocrDocument.ts` pins `OEM.LSTM_ONLY`. tesseract.js derives
 * `lstmOnly` from that OEM and picks the matching core filename, so shipping the legacy-capable
 * cores as well would double this copy with files nothing can ever request. If the OEM at the call
 * site changes, the non-lstm names have to be added here — that coupling is why the call site
 * passes the OEM explicitly rather than relying on the default.
 *
 * All three are listed because the worker feature-detects at runtime and requests exactly one:
 * relaxed SIMD where available, plain SIMD next, and the scalar build for anything older.
 */
const CORE_FILES = [
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
];

/**
 * `4.0.0_best_int` is the LSTM-only model — the same directory tesseract.js's own CDN default
 * points at for an LSTM-only core, and roughly a third the size of the legacy-inclusive `4.0.0`.
 * Keep this in step with CORE_FILES: a legacy core needs the `4.0.0` data to match.
 */
const LANGUAGES = ['eng', 'vie'];

async function copyInto(sourcePath, targetDir, name) {
  await mkdir(targetDir, { recursive: true });
  const targetPath = join(targetDir, name);
  await copyFile(sourcePath, targetPath);
  const { size } = await stat(targetPath);
  return { targetPath, size };
}

function formatMb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function main() {
  // Rebuilt from scratch so a renamed or dropped upstream file cannot linger in public/ and get
  // deployed forever after.
  await rm(outputDir, { recursive: true, force: true });

  let total = 0;
  const copied = [];

  for (const name of CORE_FILES) {
    const source = join(projectRoot, 'node_modules', 'tesseract.js-core', name);
    const { targetPath, size } = await copyInto(source, join(outputDir, 'core'), name);
    total += size;
    copied.push({ path: targetPath, size });
  }

  for (const language of LANGUAGES) {
    const name = `${language}.traineddata.gz`;
    const source = join(
      projectRoot,
      'node_modules',
      '@tesseract.js-data',
      language,
      '4.0.0_best_int',
      name,
    );
    const { targetPath, size } = await copyInto(source, join(outputDir, 'tessdata'), name);
    total += size;
    copied.push({ path: targetPath, size });
  }

  for (const { path, size } of copied) {
    console.log(`  ${path.slice(projectRoot.length + 1).replace(/\\/g, '/').padEnd(58)} ${formatMb(size)}`);
  }
  console.log(
    `\ntesseract assets: ${copied.length} files, ${formatMb(total)} into public/tesseract/ ` +
      '(a visitor downloads one core + the languages they pick, on first OCR only)',
  );
}

await main();
