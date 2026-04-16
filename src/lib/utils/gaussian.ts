// ============================================================
// Gaussian (normal distribution) utilities
// Box-Muller transform — no external math libraries needed
// ============================================================

import { GpsSample } from '@/lib/algorithms/types';

const METERS_PER_DEG_LAT = 111320;

/**
 * Box-Muller transform: generates a single standard normal variate (μ=0, σ=1).
 *
 * Given two independent uniform random variables U1, U2 ∈ (0,1):
 *   Z = √(-2 ln U1) · cos(2π U2)
 *
 * Z ~ N(0, 1)
 */
export function boxMullerRandom(): number {
  let u1 = 0;
  let u2 = 0;
  // Avoid log(0) — retry if u1 is 0
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

/**
 * Sample from N(mean, stdDev²).
 */
export function gaussianRandom(mean: number, stdDev: number): number {
  return mean + stdDev * boxMullerRandom();
}

/**
 * Generate fake (simulated) GPS samples based on real samples.
 *
 * For each real sample:
 * - Add Gaussian noise with σ = accuracy / 2  (converted to degrees)
 * - 10–20% samples are outliers with additional 20–50 m noise
 *
 * @param realSamples  Array of real GPS samples
 * @param outlierRate  Fraction of samples that become outliers (default 0.15)
 */
export function generateFakeSamples(
  realSamples: GpsSample[],
  outlierRate = 0.15,
): GpsSample[] {
  return realSamples.map((s) => {
    // σ in meters → σ in degrees (lat and lng have different scales)
    const sigmaMeters = s.accuracy / 2;
    const sigmaLat = sigmaMeters / METERS_PER_DEG_LAT;
    const sigmaLng = sigmaMeters / (METERS_PER_DEG_LAT * Math.cos((s.lat * Math.PI) / 180));

    const isOutlier = Math.random() < outlierRate;

    let noiseLat: number;
    let noiseLng: number;
    let noisyAccuracy: number;

    if (isOutlier) {
      // Outlier: 20–50 m in a random direction
      const outlierMeters = 20 + Math.random() * 30;
      const outlierLat = outlierMeters / METERS_PER_DEG_LAT;
      const outlierLng = outlierMeters / (METERS_PER_DEG_LAT * Math.cos((s.lat * Math.PI) / 180));
      noiseLat = gaussianRandom(0, outlierLat);
      noiseLng = gaussianRandom(0, outlierLng);
      noisyAccuracy = s.accuracy * (2 + Math.random());
    } else {
      noiseLat = gaussianRandom(0, sigmaLat);
      noiseLng = gaussianRandom(0, sigmaLng);
      noisyAccuracy = Math.max(1, gaussianRandom(s.accuracy, s.accuracy * 0.2));
    }

    return {
      lat: s.lat + noiseLat,
      lng: s.lng + noiseLng,
      accuracy: noisyAccuracy,
      timestamp: s.timestamp,
      altitude: s.altitude,
      altitudeAccuracy: s.altitudeAccuracy,
      heading: s.heading,
      speed: s.speed,
    };
  });
}

/**
 * Count how many samples are statistical outliers (|z-score| > threshold).
 * Uses distance from weighted mean as the metric.
 *
 * @param samples     All samples
 * @param zThreshold  Z-score cutoff (default 2.0)
 */
export function countOutliers(samples: GpsSample[], zThreshold = 2.0): number {
  if (samples.length < 3) return 0;

  const meanLat = samples.reduce((s, p) => s + p.lat, 0) / samples.length;
  const meanLng = samples.reduce((s, p) => s + p.lng, 0) / samples.length;

  const METERS_PER_DEG_LNG_AT_MEAN =
    METERS_PER_DEG_LAT * Math.cos((meanLat * Math.PI) / 180);

  // Distances in meters from centroid
  const dists = samples.map((p) => {
    const dLat = (p.lat - meanLat) * METERS_PER_DEG_LAT;
    const dLng = (p.lng - meanLng) * METERS_PER_DEG_LNG_AT_MEAN;
    return Math.sqrt(dLat ** 2 + dLng ** 2);
  });

  const mean = dists.reduce((a, b) => a + b, 0) / dists.length;
  const variance = dists.reduce((a, d) => a + (d - mean) ** 2, 0) / dists.length;
  const std = Math.sqrt(variance);

  if (std < 0.001) return 0;

  return dists.filter((d) => Math.abs(d - mean) / std > zThreshold).length;
}
