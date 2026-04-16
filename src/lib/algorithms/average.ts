// ============================================================
// Position algorithm: Simple Average
// ============================================================
// Arithmetic mean of all lat and lng values.
//
// Pros:  Trivial to implement, zero bias on unbiased noise
// Cons:  Highly sensitive to outliers (one bad reading skews result)
// ============================================================

import { GpsSample, LatLng } from './types';

/**
 * Compute the simple arithmetic mean position of all samples.
 * All samples are treated with equal weight regardless of accuracy.
 */
export function simpleAverage(samples: GpsSample[]): LatLng {
  if (samples.length === 0) throw new Error('simpleAverage: no samples provided');

  const sum = samples.reduce(
    (acc, s) => ({ lat: acc.lat + s.lat, lng: acc.lng + s.lng }),
    { lat: 0, lng: 0 },
  );

  return {
    lat: sum.lat / samples.length,
    lng: sum.lng / samples.length,
  };
}
