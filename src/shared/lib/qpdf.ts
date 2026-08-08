/**
 * The one place qpdf-wasm is invoked.
 *
 * `spec/maintainability.md` pain point #7: the old app triplicated this invocation pattern across
 * `pdfUnlock.ts`, `protectPdf.ts` and `optimizeStructure.ts`, so any correction to how qpdf
 * success/failure is detected had to be applied in three places with nothing enforcing they
 * matched. Call sites here are reduced to "what args do I pass".
 *
 * Compress's structural pass uses it today; Protect and Unlock will use it unchanged.
 */

// Emitted as a same-origin asset, not fetched from a CDN (`spec/constraints.md`).
import defaultWasmUrl from '@jspawn/qpdf-wasm/qpdf.wasm?url';
import { logDiagnostic } from './logError.ts';

const INPUT = 'input.pdf';
const OUTPUT = 'output.pdf';

export interface RunQpdfOptions {
  /** Overridable so the module can run outside a browser (tests, a future prerender step). */
  readonly wasmUrl?: string;
}

/**
 * Runs qpdf over `input` and returns the output bytes, or `null` if qpdf produced nothing usable.
 *
 * **A fresh module instance is created for every single call, and never cached or shared**
 * (`spec/edge-cases.md`, "Security / passwords"): qpdf's `callMain()` internally calls Emscripten's
 * `exit()`, which permanently kills that instance for any further use. Only the *factory* (the
 * dynamic import) is cached, by the module system. Do not "optimise" this into one shared instance.
 *
 * Success is decided by whether the output file reads back non-empty — not by `callMain`'s return
 * value and not by the absence of a throw, because `callMain` may throw on a perfectly successful
 * run (it exits the runtime by design).
 */
export async function runQpdf(
  input: Uint8Array,
  args: readonly string[],
  options?: RunQpdfOptions,
): Promise<Uint8Array | null> {
  // Import the CommonJS build directly, NOT the package's `qpdf.mjs` ESM wrapper.
  //
  // That wrapper does `import "./browser.js"` (which sets `globalThis.exports = {}`), then
  // `import "./qpdf.js"`, then reads the factory back off `globalThis.exports.Module`. That only
  // works when `qpdf.js` runs as a loose script writing to a global `exports`. Any bundler with
  // CommonJS interop — Vite/Rollup included — rewrites `qpdf.js`'s `exports` to a module-local
  // object, so `globalThis.exports.Module` stays undefined and the wrapper falls through to a bare
  // `createModule` identifier that it never declares:
  //
  //     (globalThis.exports.Module || createModule).apply(undefined, args)
  //                                   ^^^^^^^^^^^^ ReferenceError at call time
  //
  // Importing `qpdf.js` gives us the same factory via normal interop, with no globals involved.
  const { default: createQpdfModule } = await import('@jspawn/qpdf-wasm/qpdf.js');

  const wasmUrl = options?.wasmUrl ?? defaultWasmUrl;

  // Capture whatever qpdf reports, rather than discarding it as this module used to.
  //
  // Note: this Emscripten build routes the program's own stderr (e.g. "invalid password") straight
  // to the console and never calls these hooks, so `captured` is usually empty and qpdf's message
  // appears on its own line just above ours. The hooks are still wired because they are the
  // documented API and cost nothing if a future build starts honouring them.
  const captured: string[] = [];

  const instance = await createQpdfModule({
    noInitialRun: true,
    locateFile: () => wasmUrl,
    print: (line: string) => captured.push(line),
    printErr: (line: string) => captured.push(line),
  });

  instance.FS.writeFile(INPUT, input);

  try {
    instance.callMain([...args, INPUT, OUTPUT]);
  } catch {
    // Expected: callMain exits the Emscripten runtime. The output file decides success.
  }

  let output: Uint8Array | undefined;
  try {
    output = instance.FS.readFile(OUTPUT);
  } catch {
    // No output file at all — qpdf refused the input (a wrong password, most often).
  }

  if (!output || output.length === 0) {
    // A null return is a legitimate outcome (wrong password), so this is not an error — but
    // without qpdf's own words a genuine failure here is undiagnosable.
    logDiagnostic(
      `qpdf produced no output for [${args.join(' ')}]`,
      captured.length > 0
        ? captured.join('\n')
        : "qpdf's own message, if any, is logged directly above this line by its runtime",
    );
    return null;
  }

  return output;
}
