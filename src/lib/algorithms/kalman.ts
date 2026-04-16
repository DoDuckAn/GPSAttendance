// ============================================================
// Algorithm: 1D Kalman Filter (per-axis, standalone)
// ============================================================
// A scalar Kalman filter is applied independently to lat and lng.
//
// State:       x̂  (current position estimate)
// Covariance:  P  (uncertainty in state estimate)
//
// Each GPS sample provides a noisy measurement z with
// measurement noise variance R = (accuracy / METERS_PER_DEG)²
//
// Predict step:
//   x̂⁻  = x̂
//   P⁻  = P + Q       (Q = process noise, small constant)
//
// Update step:
//   K   = P⁻ / (P⁻ + R)   (Kalman gain)
//   x̂  = x̂⁻ + K · (z - x̂⁻)
//   P   = (1 - K) · P⁻
//
// Pros:  Optimal estimator for linear-Gaussian sequences,
//        naturally handles accuracy-weighted updates
// Cons:  Assumes i.i.d. Gaussian noise; stationary model
//        (no velocity term) suits slow-moving GPS scan
// ============================================================

import { GpsSample, LatLng } from './types';

/** Process noise: equivalent to ~0.5 m positional uncertainty per step */
const PROCESS_NOISE_M = 0.5;
const METERS_PER_DEG_LAT = 111320;

/**
 * Run a scalar Kalman filter on a 1-D time series.
 *
 * @param measurements  Array of [value, varianceInSameUnits] tuples
 * @param processNoiseVar  Process noise variance in the same units
 */
function scalarKalman(
  measurements: Array<[value: number, variance: number]>,
  processNoiseVar: number,
): number {
  if (measurements.length === 0) throw new Error('No measurements');

  // Initialise with the first measurement
  let x = measurements[0][0];
  let P = measurements[0][1];

  for (let i = 1; i < measurements.length; i++) {
    const [z, R] = measurements[i];

    // Predict
    const P_pred = P + processNoiseVar;

    // Update
    const K = P_pred / (P_pred + R);
    x = x + K * (z - x);
    P = (1 - K) * P_pred;
  }

  return x;
}

/**
 * Estimate position by running independent scalar Kalman filters
 * on lat and lng sequences.
 *
 * Measurement noise for each sample is derived from GPS accuracy:
 *   R_lat = (accuracy / METERS_PER_DEG_LAT)²
 *   R_lng = (accuracy / (METERS_PER_DEG_LAT · cos(lat)))²
 */
export function kalmanPosition(samples: GpsSample[]): LatLng {
  if (samples.length === 0) throw new Error('kalmanPosition: no samples provided');

  const refLat = samples[0].lat;
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos((refLat * Math.PI) / 180);

  const qLat = (PROCESS_NOISE_M / METERS_PER_DEG_LAT) ** 2;
  const qLng = (PROCESS_NOISE_M / metersPerDegLng) ** 2;

  const latMeas: Array<[number, number]> = samples.map((s) => {
    const rLat = (s.accuracy / METERS_PER_DEG_LAT) ** 2;
    return [s.lat, rLat];
  });

  const lngMeas: Array<[number, number]> = samples.map((s) => {
    const rLng = (s.accuracy / metersPerDegLng) ** 2;
    return [s.lng, rLng];
  });

  return {
    lat: scalarKalman(latMeas, qLat),
    lng: scalarKalman(lngMeas, qLng),
  };
}
