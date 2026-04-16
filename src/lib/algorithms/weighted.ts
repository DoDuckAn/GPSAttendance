// ============================================================
// Position algorithm: Weighted Average
// ============================================================
// Weight each sample by the inverse of its accuracy variance:
//   w_i = 1 / accuracy_i²
//
// More accurate readings (small accuracy radius) contribute more.
//
// Pros:  Better noise suppression than simple average,
//        matches Maximum Likelihood Estimation for Gaussian noise
// Cons:  Still sensitive to systematic biases (multipath)
// ============================================================

import { GpsSample, LatLng } from './types';

/**
 * Compute a precision-weighted average position.
 *
 * Weight formula:  w_i = 1 / max(accuracy_i², 1)
 * The max(·, 1) guard prevents division-by-zero for perfect readings.
 */
export function weightedAverage(samples: GpsSample[]): LatLng {
  if (samples.length === 0) throw new Error('weightedAverage: no samples provided');

  let totalWeight = 0;
  let sumLat = 0;
  let sumLng = 0;

  for (const s of samples) {
    // Clamp minimum accuracy to 1 m to avoid near-infinite weights
    const w = 1 / Math.max(s.accuracy ** 2, 1);
    totalWeight += w;
    sumLat += s.lat * w;
    sumLng += s.lng * w;
  }

  return {
    lat: sumLat / totalWeight,
    lng: sumLng / totalWeight,
  };
}
