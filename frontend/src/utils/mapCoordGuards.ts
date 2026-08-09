/** Reject null-island / swapped / out-of-range coords before map fit or markers. */
export function isValidMapCoord(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  // Null island / unset defaults
  if (Math.abs(lat) < 1e-4 && Math.abs(lng) < 1e-4) return false;
  return true;
}
