/** Quarter-turn angles are the only rotations the app ever stores. */
export type Rotation = 0 | 90 | 180 | 270;

export const ROTATION_STEP = 90;

/**
 * Folds any angle into 0..359. Kept dependency-free (no pdf-lib) so the store can use it without
 * pulling the PDF layer into the main bundle.
 */
export function normalizeRotation(angle: number): Rotation {
  const normalized = ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
  return normalized as Rotation;
}
