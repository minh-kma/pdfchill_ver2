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
  const { default: createQpdfModule } = await import('@jspawn/qpdf-wasm/qpdf.mjs');

  const wasmUrl = options?.wasmUrl ?? defaultWasmUrl;
  const instance = await createQpdfModule({
    noInitialRun: true,
    locateFile: () => wasmUrl,
    // qpdf chatters on stdout/stderr; swallow it rather than polluting the console.
    print: () => undefined,
    printErr: () => undefined,
  });

  instance.FS.writeFile(INPUT, input);

  try {
    instance.callMain([...args, INPUT, OUTPUT]);
  } catch {
    // Expected: callMain exits the Emscripten runtime. The output file decides success.
  }

  try {
    const output = instance.FS.readFile(OUTPUT);
    return output.length > 0 ? output : null;
  } catch {
    return null;
  }
}
