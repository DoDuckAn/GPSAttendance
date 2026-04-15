// ============================================================
// Algorithm 1: Baseline GPS
// ============================================================
// The simplest approach — take the most recent GPS reading
// and do a polygon containment check.
//
// Pros: Zero latency, no samples needed
// Cons: Highly unreliable indoors, no noise filtering
// ============================================================

import { GpsSample, AlgorithmResult, RoomGeofence } from './types';
import { pointInPolygonWithBuffer, haversineDistance } from './geo-utils';

export function baselineGps(
  samples: GpsSample[],
  room: RoomGeofence
): AlgorithmResult {
  // Use the last (most recent) sample
  const sample = samples[samples.length - 1];
  const position = { lat: sample.lat, lng: sample.lng };

  const inside = pointInPolygonWithBuffer(
    position,
    room.corners,
    room.center,
    room.bufferRadius
  );

  // Confidence is inversely proportional to GPS accuracy radius.
  // accuracy < 10m → high confidence, accuracy > 50m → low confidence
  const distToCenter = haversineDistance(position, room.center);
  const accuracyFactor = Math.max(0, 1 - sample.accuracy / 100);
  const distanceFactor = Math.max(0, 1 - distToCenter / (room.bufferRadius * 3));
  const confidence = Math.min(1, Math.max(0, (accuracyFactor * 0.6 + distanceFactor * 0.4)));

  return {
    name: 'Baseline GPS',
    position,
    inside,
    confidence,
    metadata: {
      accuracy: sample.accuracy,
      distToCenter,
    },
  };
}
