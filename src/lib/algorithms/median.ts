// ============================================================
// Algorithm: Coordinate Median
// ============================================================
// Sort latitudes and longitudes independently, take the middle value.
//
// Pros:  Highly resistant to outliers (breakdown point = 50%)
// Cons:  Ignores the joint distribution — the median point
//        may not correspond to any real observation
// ============================================================

import { GpsSample, LatLng } from './types';

/** Return the median of a sorted numeric array (already sorted ascending). */
function medianSorted(sorted: number[]): number {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Compute the coordinate-wise median of GPS samples.
 * Lat and Lng are sorted and medianed independently.
 */
export function medianPosition(samples: GpsSample[]): LatLng {
  if (samples.length === 0) throw new Error('medianPosition: no samples provided');

  const lats = samples.map((s) => s.lat).sort((a, b) => a - b);
  const lngs = samples.map((s) => s.lng).sort((a, b) => a - b);

  return {
    lat: medianSorted(lats),
    lng: medianSorted(lngs),
  };
}
