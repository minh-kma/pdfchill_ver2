/**
 * The one hex-colour parser.
 *
 * `spec/maintainability.md` pain point #5: the old app hand-rolled an identical parser in
 * `annotationBake.ts` and again in the dead `editText.ts`, with nothing to catch them drifting.
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Parses `#rgb` / `#rrggbb` into 0..1 components. Falls back to mid-grey on anything unparseable. */
export function parseHexColor(hex: string): Rgb {
  const value = hex.trim().replace(/^#/, '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) return { r: 0.5, g: 0.5, b: 0.5 };

  return {
    r: Number.parseInt(full.slice(0, 2), 16) / 255,
    g: Number.parseInt(full.slice(2, 4), 16) / 255,
    b: Number.parseInt(full.slice(4, 6), 16) / 255,
  };
}
