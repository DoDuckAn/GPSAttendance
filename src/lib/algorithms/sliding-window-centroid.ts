// ============================================================
// Algorithm 2: Sliding Window + Centroid
// ============================================================
// Collect N GPS samples, filter by accuracy threshold,
// compute the centroid of the remaining points,
// then check polygon containment with buffer.
//
// Idea: Averaging multiple readings reduces random noise.
//       Filtering by accuracy removes clearly bad samples.
//
// Pros:  Much more stable than single reading
// Cons:  Requires collecting multiple samples (latency),
//        still biased if all readings are biased in one direction
// ============================================================

import { GpsSample, AlgorithmResult, RoomGeofence } from './types';
import { computeCentroid, pointInPolygonWithBuffer, haversineDistance } from './geo-utils';

/** Maximum accuracy (meters) to accept a sample */
const ACCURACY_THRESHOLD = 50;

/** Minimum number of samples to compute centroid */
const MIN_SAMPLES = 3;

export function slidingWindowCentroid(
  samples: GpsSample[],
  room: RoomGeofence,
  options?: { accuracyThreshold?: number; minSamples?: number }
): AlgorithmResult {
  const accThreshold = options?.accuracyThreshold ?? ACCURACY_THRESHOLD;
  const minSamples = options?.minSamples ?? MIN_SAMPLES;

  // Step 1: Filter samples by accuracy
  const filtered = samples.filter((s) => s.accuracy <= accThreshold);

  // Fallback: if too few good samples, use all samples
  const usable = filtered.length >= minSamples ? filtered : samples;

  // Step 2: Compute centroid of the usable samples
  const points = usable.map((s) => ({ lat: s.lat, lng: s.lng }));
  const position = computeCentroid(points);

  // Step 3: Polygon check with buffer
  const inside = pointInPolygonWithBuffer(
    position,
    room.corners,
    room.center,
    room.bufferRadius
  );

  // Step 4: Confidence scoring
  // - More filtered samples → higher confidence
  // - Lower average accuracy → higher confidence
  // - Closer to center → higher confidence
  const avgAccuracy = usable.reduce((s, p) => s + p.accuracy, 0) / usable.length;
  const sampleRatio = Math.min(1, filtered.length / Math.max(minSamples, 1));
  const accuracyFactor = Math.max(0, 1 - avgAccuracy / 100);
  const distToCenter = haversineDistance(position, room.center);
  const distanceFactor = Math.max(0, 1 - distToCenter / (room.bufferRadius * 3));

  const confidence = Math.min(
    1,
    Math.max(0, sampleRatio * 0.3 + accuracyFactor * 0.4 + distanceFactor * 0.3)
  );

  return {
    name: 'Sliding Window Centroid',
    position,
    inside,
    confidence,
    metadata: {
      totalSamples: samples.length,
      filteredSamples: filtered.length,
      avgAccuracy,
      distToCenter,
    },
  };
}
