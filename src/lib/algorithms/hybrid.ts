// ============================================================
// Algorithm 5: Hybrid Approach
// ============================================================
// Combines multiple signals to produce a final robust decision.
//
// Inputs used:
//   - IRLS-Huber estimated position (most robust single position)
//   - Kalman filtered position (smoothed trajectory)
//   - Sample variance (movement stability indicator)
//   - GPS accuracy distribution
//   - WiFi RSSI data (if available — simulated for now)
//
// === Heuristic Hybrid Decision ===
//
// 1. Compute position as weighted combination of IRLS and Kalman.
//    - IRLS gets higher weight if samples are stationary
//    - Kalman gets higher weight if there's consistent movement
//
// 2. Compute stability score from sample variance:
//    - Low variance = high stability = more trustworthy
//
// 3. Compute accuracy score from GPS accuracy values:
//    - More samples with accuracy < threshold = more reliable
//
// 4. WiFi approximation (simulated):
//    - In real implementation, would use RSSI fingerprinting
//    - For now, uses a heuristic based on sample density
//
// 5. Final confidence combines all factors:
//    confidence = w1*position_score + w2*stability + w3*accuracy + w4*wifi
//
// Decision rule:
//   IF low_variance AND accuracy < threshold AND stable_over_time
//   → High confidence in the result
// ============================================================

import { GpsSample, AlgorithmResult, RoomGeofence } from './types';
import { irlsHuber } from './irls-huber';
import { kalmanFilter } from './kalman-filter';
import {
  haversineDistance,
  pointInPolygonWithBuffer,
  computeCentroid,
} from './geo-utils';

/** Accuracy threshold for "good" GPS samples */
const GOOD_ACCURACY_M = 20;

/** Variance threshold for "stable" readings (in meters²) */
const STABLE_VARIANCE_M2 = 100; // 10m std dev

/** Maximum time span for stability check (seconds) */
const STABILITY_WINDOW_S = 30;

/**
 * Compute spatial variance of samples in meters².
 * Measures how spread out the GPS readings are.
 */
function computeSpatialVariance(samples: GpsSample[]): number {
  if (samples.length < 2) return 0;

  const centroid = computeCentroid(samples.map((s) => ({ lat: s.lat, lng: s.lng })));
  const distances = samples.map((s) =>
    haversineDistance({ lat: s.lat, lng: s.lng }, centroid)
  );
  const meanDist = distances.reduce((a, b) => a + b, 0) / distances.length;
  return distances.reduce((a, d) => a + (d - meanDist) ** 2, 0) / distances.length;
}

/**
 * Check temporal stability: are readings consistent over time?
 * Returns a score 0–1 where 1 = very stable.
 */
function temporalStability(samples: GpsSample[]): number {
  if (samples.length < 3) return 0.5;

  const timeSpan = (samples[samples.length - 1].timestamp - samples[0].timestamp) / 1000;
  if (timeSpan < 1) return 0.5;

  // Compute position change over time windows
  const midIdx = Math.floor(samples.length / 2);
  const firstHalf = samples.slice(0, midIdx);
  const secondHalf = samples.slice(midIdx);

  const centroid1 = computeCentroid(firstHalf.map((s) => ({ lat: s.lat, lng: s.lng })));
  const centroid2 = computeCentroid(secondHalf.map((s) => ({ lat: s.lat, lng: s.lng })));

  const drift = haversineDistance(centroid1, centroid2);

  // Low drift = high stability
  // drift < 5m → stability ≈ 1
  // drift > 30m → stability ≈ 0
  return Math.max(0, Math.min(1, 1 - drift / 30));
}

/**
 * Simulate WiFi-based approximation.
 *
 * In a real implementation, this would:
 *   1. Scan nearby WiFi APs and collect RSSI values
 *   2. Compare against a fingerprint database
 *   3. Estimate position using kNN or probabilistic method
 *
 * For this research prototype, we simulate a WiFi confidence
 * based on GPS accuracy (as a proxy for indoor/outdoor detection)
 * and the number of samples collected.
 */
function simulateWifiConfidence(samples: GpsSample[], room: RoomGeofence): number {
  // Heuristic: if GPS accuracy is poor (high values), we're likely indoors
  // Indoor → WiFi would be more useful
  const avgAccuracy = samples.reduce((s, p) => s + p.accuracy, 0) / samples.length;

  // Simulate: in a building with known WiFi APs, closer to room center
  // would give stronger signals
  const centroid = computeCentroid(samples.map((s) => ({ lat: s.lat, lng: s.lng })));
  const distToCenter = haversineDistance(centroid, room.center);

  // If we're close to the room center and accuracy is reasonable
  const proximityFactor = Math.max(0, 1 - distToCenter / (room.bufferRadius * 2));
  const indoorFactor = avgAccuracy > 15 ? 0.7 : 0.3; // Poor GPS suggests indoor

  return Math.min(1, proximityFactor * 0.6 + indoorFactor * 0.4);
}

export function hybrid(
  samples: GpsSample[],
  room: RoomGeofence
): AlgorithmResult {
  if (samples.length === 0) {
    return {
      name: 'Hybrid',
      position: room.center,
      inside: false,
      confidence: 0,
    };
  }

  // Run sub-algorithms
  const irlsResult = irlsHuber(samples, room);
  const kalmanResult = kalmanFilter(samples, room);

  // Compute stability metrics
  const spatialVariance = computeSpatialVariance(samples);
  const stability = temporalStability(samples);
  const wifiConfidence = simulateWifiConfidence(samples, room);

  // Determine weights for combining IRLS and Kalman positions
  // Low variance (stationary) → trust IRLS more
  // High variance (moving) → trust Kalman more (it tracks velocity)
  const isStationary = spatialVariance < STABLE_VARIANCE_M2;
  const irlsWeight = isStationary ? 0.7 : 0.4;
  const kalmanWeight = 1 - irlsWeight;

  // Weighted combination of positions
  const position = {
    lat: irlsResult.position.lat * irlsWeight + kalmanResult.position.lat * kalmanWeight,
    lng: irlsResult.position.lng * irlsWeight + kalmanResult.position.lng * kalmanWeight,
  };

  // Polygon check
  const inside = pointInPolygonWithBuffer(
    position,
    room.corners,
    room.center,
    room.bufferRadius
  );

  // === Heuristic confidence scoring ===
  // Good GPS accuracy samples ratio
  const goodAccuracySamples = samples.filter((s) => s.accuracy < GOOD_ACCURACY_M).length;
  const accuracyRatio = goodAccuracySamples / samples.length;

  // Check for the high-confidence condition:
  // IF low_variance AND accuracy < threshold AND stable_over_time
  const highConfidenceCondition =
    isStationary && accuracyRatio > 0.5 && stability > 0.6;

  // Component scores
  const positionScore = (irlsResult.confidence * irlsWeight + kalmanResult.confidence * kalmanWeight);
  const stabilityScore = stability;
  const accuracyScore = accuracyRatio;

  let confidence: number;
  if (highConfidenceCondition) {
    // High confidence mode: boost score
    confidence = Math.min(1, positionScore * 0.3 + stabilityScore * 0.25 +
      accuracyScore * 0.25 + wifiConfidence * 0.2);
    confidence = Math.min(1, confidence * 1.2); // 20% boost
  } else {
    // Normal mode
    confidence = Math.min(1, positionScore * 0.35 + stabilityScore * 0.2 +
      accuracyScore * 0.25 + wifiConfidence * 0.2);
  }

  const distToCenter = haversineDistance(position, room.center);

  return {
    name: 'Hybrid',
    position,
    inside,
    confidence: Math.max(0, Math.min(1, confidence)),
    metadata: {
      irlsInside: irlsResult.inside,
      kalmanInside: kalmanResult.inside,
      irlsConfidence: irlsResult.confidence,
      kalmanConfidence: kalmanResult.confidence,
      spatialVariance: Math.round(spatialVariance * 100) / 100,
      temporalStability: Math.round(stability * 100) / 100,
      wifiConfidence: Math.round(wifiConfidence * 100) / 100,
      highConfidenceMode: highConfidenceCondition,
      positionWeights: { irls: irlsWeight, kalman: kalmanWeight },
      distToCenter,
    },
  };
}
