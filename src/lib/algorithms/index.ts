// ============================================================
// Algorithm orchestrator — runs all algorithms on the same data
// ============================================================

import { GpsSample, AlgorithmResult, RoomGeofence } from './types';
import { baselineGps } from './baseline-gps';
import { slidingWindowCentroid } from './sliding-window-centroid';
import { kalmanFilter } from './kalman-filter';
import { irlsHuber } from './irls-huber';
import { hybrid } from './hybrid';

export interface AllAlgorithmResults {
  gps: AlgorithmResult;
  centroid: AlgorithmResult;
  kalman: AlgorithmResult;
  irls_huber: AlgorithmResult;
  hybrid: AlgorithmResult;
}

/**
 * Run ALL positioning algorithms on the same set of GPS samples.
 * Returns results from each algorithm for comparison.
 */
export function runAllAlgorithms(
  samples: GpsSample[],
  room: RoomGeofence
): AllAlgorithmResults {
  return {
    gps: baselineGps(samples, room),
    centroid: slidingWindowCentroid(samples, room),
    kalman: kalmanFilter(samples, room),
    irls_huber: irlsHuber(samples, room),
    hybrid: hybrid(samples, room),
  };
}

// Re-export types and utilities
export type { GpsSample, AlgorithmResult, RoomGeofence, LatLng } from './types';
export type { AttendanceResult } from './types';
export { haversineDistance, pointInPolygon, computeCentroid } from './geo-utils';
