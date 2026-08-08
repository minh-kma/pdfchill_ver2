declare module '@jspawn/qpdf-wasm/qpdf.mjs' {
  interface QpdfFS {
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
  }

  export interface QpdfModule {
    FS: QpdfFS;
    callMain(args: string[]): number;
  }

  export interface QpdfModuleOptions {
    noInitialRun?: boolean;
    locateFile?: (path: string) => string;
    print?: (line: string) => void;
    printErr?: (line: string) => void;
  }

  const createQpdfModule: (options?: QpdfModuleOptions) => Promise<QpdfModule>;
  export default createQpdfModule;
}
