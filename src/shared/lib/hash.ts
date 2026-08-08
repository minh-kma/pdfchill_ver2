/**
 * FNV-1a over raw bytes, dependency-free.
 *
 * Used as an asset's identity: re-uploading byte-identical image data reuses the existing `Asset`
 * rather than storing a duplicate, and the id is stable across separate uploads of the same bytes
 * (`spec/edge-cases.md`, "Asset storage & undo"). Not a security hash — collision resistance is
 * not required here, only cheap content identity.
 */
export function hashBytes(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    // 32-bit FNV prime multiply, kept in range without BigInt.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
