// ============================================================
// Algorithm 4: IRLS with Huber Loss (Advanced Pipeline)
// ============================================================
// This is the most robust algorithm in the system.
//
// Pipeline:
//   1. Z-score filtering — remove statistical outliers
//   2. IRLS (Iteratively Reweighted Least Squares) with Huber loss
//      - Downweight samples with high GPS accuracy (low precision)
//      - Huber loss provides robustness to remaining outliers
//
// === Z-Score Filtering ===
// For each sample, compute z-score of its distance from the
// preliminary centroid. Remove samples with |z| > threshold.
//
// === IRLS with Huber Loss ===
// We want to find the position (lat*, lng*) that minimizes:
//
//   Σᵢ wᵢ · ρ_H(||pᵢ - p*||)
//
// Where:
//   wᵢ = 1 / accuracyᵢ²   (base weight: more accurate = more weight)
//   ρ_H(r) = Huber loss with delta δ:
//     ρ_H(r) = r²/2           if |r| ≤ δ
//     ρ_H(r) = δ(|r| - δ/2)  if |r| > δ
//
// The IRLS approach converts this to a series of weighted least squares:
//   At each iteration, recompute weights based on current residuals.
//   For Huber loss, the IRLS weight function is:
//     w_huber(r) = 1           if |r| ≤ δ
//     w_huber(r) = δ / |r|     if |r| > δ
//
// Convergence: iterate until position change < ε or max iterations
//
// Pros:  Very robust to outliers and multipath errors,
//        principled statistical framework
// Cons:  More complex, requires sufficient samples
// ============================================================

import { GpsSample, AlgorithmResult, RoomGeofence } from './types';
import {
  computeCentroid,
  haversineDistance,
  pointInPolygonWithBuffer,
  METERS_PER_DEG_LAT,
  metersPerDegLng,
} from './geo-utils';

/** Z-score threshold for outlier removal */
const Z_SCORE_THRESHOLD = 2.0;

/** Huber loss delta in meters */
const HUBER_DELTA_M = 3.0;

/** Maximum IRLS iterations */
const MAX_ITERATIONS = 20;

/** Convergence threshold in meters */
const CONVERGENCE_M = 0.1;

/**
 * Step 1: Z-score filtering
 *
 * Compute preliminary centroid, then for each sample compute
 * its distance from centroid. Remove samples whose distance
 * z-score exceeds the threshold.
 */
function zScoreFilter(samples: GpsSample[]): GpsSample[] {
  if (samples.length < 3) return samples;

  // Preliminary centroid
  const centroid = computeCentroid(samples.map((s) => ({ lat: s.lat, lng: s.lng })));

  // Compute distances from centroid (in meters)
  const distances = samples.map((s) =>
    haversineDistance({ lat: s.lat, lng: s.lng }, centroid)
  );

  // Mean and standard deviation
  const mean = distances.reduce((a, b) => a + b, 0) / distances.length;
  const variance =
    distances.reduce((a, d) => a + (d - mean) ** 2, 0) / distances.length;
  const std = Math.sqrt(variance);

  if (std < 0.01) return samples; // All points are essentially the same

  // Filter by z-score
  return samples.filter((_, i) => {
    const zScore = Math.abs((distances[i] - mean) / std);
    return zScore <= Z_SCORE_THRESHOLD;
  });
}

/**
 * Huber weight function for IRLS.
 *
 * For residual r (in meters):
 *   w(r) = 1         if |r| ≤ δ   (quadratic region)
 *   w(r) = δ / |r|   if |r| > δ   (linear region, downweighted)
 */
function huberWeight(residualMeters: number, delta: number): number {
  const absR = Math.abs(residualMeters);
  if (absR <= delta) return 1.0;
  return delta / absR;
}

/**
 * Step 2: IRLS with Huber Loss
 *
 * Iteratively compute a robust weighted average position.
 * At each iteration:
 *   1. Compute residuals (distances from current estimate)
 *   2. Compute IRLS weights: w_total = w_base × w_huber(residual)
 *   3. Recompute position as weighted centroid
 *   4. Check convergence
 */
function irlsHuberEstimate(
  samples: GpsSample[],
  huberDelta: number = HUBER_DELTA_M
): { lat: number; lng: number; finalWeights: number[] } {
  // Initial estimate: accuracy-weighted centroid
  const baseWeights = samples.map((s) => 1 / Math.max(s.accuracy, 1) ** 2);
  const totalBaseWeight = baseWeights.reduce((a, b) => a + b, 0);

  let estLat = samples.reduce((s, p, i) => s + p.lat * baseWeights[i], 0) / totalBaseWeight;
  let estLng = samples.reduce((s, p, i) => s + p.lng * baseWeights[i], 0) / totalBaseWeight;

  let finalWeights = baseWeights;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    // Compute residuals (distance from current estimate to each sample)
    const residuals = samples.map((s) =>
      haversineDistance({ lat: s.lat, lng: s.lng }, { lat: estLat, lng: estLng })
    );

    // Compute IRLS weights: base weight × Huber weight
    const irlsWeights = samples.map((_, i) => {
      const hw = huberWeight(residuals[i], huberDelta);
      return baseWeights[i] * hw;
    });
    finalWeights = irlsWeights;

    // Compute weighted centroid with IRLS weights
    const totalWeight = irlsWeights.reduce((a, b) => a + b, 0);
    if (totalWeight < 1e-12) break;

    const newLat = samples.reduce((s, p, i) => s + p.lat * irlsWeights[i], 0) / totalWeight;
    const newLng = samples.reduce((s, p, i) => s + p.lng * irlsWeights[i], 0) / totalWeight;

    // Check convergence
    const shift = haversineDistance(
      { lat: estLat, lng: estLng },
      { lat: newLat, lng: newLng }
    );

    estLat = newLat;
    estLng = newLng;

    if (shift < CONVERGENCE_M) break;
  }

  return { lat: estLat, lng: estLng, finalWeights };
}

export function irlsHuber(
  samples: GpsSample[],
  room: RoomGeofence
): AlgorithmResult {
  if (samples.length === 0) {
    return {
      name: 'IRLS + Huber',
      position: room.center,
      inside: false,
      confidence: 0,
    };
  }

  // Step 1: Z-score filtering
  const filtered = zScoreFilter(samples);

  // Step 2: IRLS estimation with Huber loss
  const { lat, lng, finalWeights } = irlsHuberEstimate(
    filtered.length >= 3 ? filtered : samples
  );

  const position = { lat, lng };

  // Step 3: Polygon check with buffer
  const inside = pointInPolygonWithBuffer(
    position,
    room.corners,
    room.center,
    room.bufferRadius
  );

  // Step 4: Confidence scoring
  // Based on: effective sample size, average residual, distance to center
  const totalWeight = finalWeights.reduce((a, b) => a + b, 0);
  const sumWeightSq = finalWeights.reduce((a, w) => a + w ** 2, 0);
  const effectiveSampleSize = totalWeight > 0 ? totalWeight ** 2 / sumWeightSq : 0;
  const distToCenter = haversineDistance(position, room.center);

  const essFactor = Math.min(1, effectiveSampleSize / 5);
  const filterFactor = filtered.length / Math.max(samples.length, 1);
  const distanceFactor = Math.max(0, 1 - distToCenter / (room.bufferRadius * 3));

  const confidence = Math.min(
    1,
    Math.max(0, essFactor * 0.35 + filterFactor * 0.3 + distanceFactor * 0.35)
  );

  return {
    name: 'IRLS + Huber',
    position,
    inside,
    confidence,
    metadata: {
      originalSamples: samples.length,
      afterZScore: filtered.length,
      effectiveSampleSize: Math.round(effectiveSampleSize * 100) / 100,
      distToCenter,
      huberDelta: HUBER_DELTA_M,
    },
  };
}
