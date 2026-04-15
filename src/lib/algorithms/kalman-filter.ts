// ============================================================
// Algorithm 3: 2D Kalman Filter
// ============================================================
// Standard Kalman filter applied to lat/lng coordinates.
//
// State vector: [lat, lng, vLat, vLng]
//   where vLat, vLng are velocity estimates
//
// The Kalman filter operates in two phases per sample:
//   PREDICT: x̂ = F·x + B·u,  P̂ = F·P·Fᵀ + Q
//   UPDATE:  K = P̂·Hᵀ·(H·P̂·Hᵀ + R)⁻¹
//            x = x̂ + K·(z - H·x̂)
//            P = (I - K·H)·P̂
//
// Where:
//   F = state transition matrix (constant velocity model)
//   H = observation matrix (we observe lat, lng only)
//   Q = process noise covariance
//   R = measurement noise covariance (from GPS accuracy)
//
// Pros:  Excellent for smoothing noisy sequential data,
//        models velocity for better prediction
// Cons:  Assumes Gaussian noise (GPS can have multipath bias),
//        requires tuning of Q matrix
// ============================================================

import { GpsSample, AlgorithmResult, RoomGeofence } from './types';
import { pointInPolygonWithBuffer, haversineDistance, METERS_PER_DEG_LAT, metersPerDegLng } from './geo-utils';

/** Process noise standard deviation in meters */
const PROCESS_NOISE_M = 2.0;

/**
 * Simple 4x4 matrix operations for Kalman filter.
 * Using flat arrays for simplicity (row-major order).
 */
type Mat4 = number[];
type Vec4 = number[];

function mat4Identity(): Mat4 {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

function mat4Multiply(A: Mat4, B: Mat4): Mat4 {
  const C = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      for (let k = 0; k < 4; k++) {
        C[i * 4 + j] += A[i * 4 + k] * B[k * 4 + j];
      }
    }
  }
  return C;
}

function mat4TransposeInPlace(A: Mat4): Mat4 {
  const T = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      T[i * 4 + j] = A[j * 4 + i];
    }
  }
  return T;
}

function mat4Add(A: Mat4, B: Mat4): Mat4 {
  return A.map((v, i) => v + B[i]);
}

function mat4Vec(A: Mat4, v: Vec4): Vec4 {
  const r = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      r[i] += A[i * 4 + j] * v[j];
    }
  }
  return r;
}

/**
 * Invert a 2x2 matrix stored as [a, b, c, d] (row-major).
 * Returns [a, b, c, d] of the inverse.
 */
function invert2x2(m: number[]): number[] {
  const [a, b, c, d] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) {
    // Near-singular: return identity
    return [1, 0, 0, 1];
  }
  return [d / det, -b / det, -c / det, a / det];
}

export function kalmanFilter(
  samples: GpsSample[],
  room: RoomGeofence
): AlgorithmResult {
  if (samples.length === 0) {
    return {
      name: 'Kalman Filter',
      position: room.center,
      inside: false,
      confidence: 0,
    };
  }

  // Initialize state from first sample
  // State: [lat, lng, vLat, vLng]
  let x: Vec4 = [samples[0].lat, samples[0].lng, 0, 0];

  // Initial covariance — high uncertainty
  const initVar = (samples[0].accuracy / METERS_PER_DEG_LAT) ** 2;
  let P: Mat4 = [
    initVar, 0, 0, 0,
    0, initVar, 0, 0,
    0, 0, initVar * 10, 0,
    0, 0, 0, initVar * 10,
  ];

  // Observation matrix: we only observe lat and lng (first 2 state components)
  // H is 2x4 but we handle it manually in update step

  for (let i = 1; i < samples.length; i++) {
    const dt = Math.max(0.1, (samples[i].timestamp - samples[i - 1].timestamp) / 1000);

    // === PREDICT STEP ===
    // State transition: constant velocity model
    // F = [[1, 0, dt, 0],
    //      [0, 1, 0, dt],
    //      [0, 0, 1,  0],
    //      [0, 0, 0,  1]]
    const F: Mat4 = [
      1, 0, dt, 0,
      0, 1, 0, dt,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];

    // Process noise: convert meters to degrees
    const qLat = (PROCESS_NOISE_M / METERS_PER_DEG_LAT) ** 2;
    const mPerDegLng = metersPerDegLng(x[0]);
    const qLng = (PROCESS_NOISE_M / mPerDegLng) ** 2;

    // Q matrix (simplified diagonal)
    const Q: Mat4 = [
      qLat * dt, 0, 0, 0,
      0, qLng * dt, 0, 0,
      0, 0, qLat * dt * 4, 0,
      0, 0, 0, qLng * dt * 4,
    ];

    // Predicted state: x̂ = F·x
    x = mat4Vec(F, x);

    // Predicted covariance: P̂ = F·P·Fᵀ + Q
    const Ft = mat4TransposeInPlace(F);
    P = mat4Add(mat4Multiply(mat4Multiply(F, P), Ft), Q);

    // === UPDATE STEP ===
    // Measurement: z = [lat, lng]
    const z = [samples[i].lat, samples[i].lng];

    // Measurement noise: R = diag(accuracy²) in degree units
    const accDegLat = samples[i].accuracy / METERS_PER_DEG_LAT;
    const accDegLng = samples[i].accuracy / mPerDegLng;
    const R = [accDegLat ** 2, 0, 0, accDegLng ** 2]; // 2x2

    // Innovation: y = z - H·x̂  (H extracts first 2 components)
    const y = [z[0] - x[0], z[1] - x[1]];

    // S = H·P·Hᵀ + R  →  extract top-left 2x2 of P + R
    const S = [
      P[0] + R[0], P[1] + R[1],
      P[4] + R[2], P[5] + R[3],
    ];

    // S⁻¹
    const Sinv = invert2x2(S);

    // Kalman Gain: K = P·Hᵀ·S⁻¹  (4x2 matrix)
    // P·Hᵀ = first 2 columns of P (since H = [I₂ 0₂])
    // K[i][j] = sum_k P_col_k[i] * Sinv[k][j]
    const PHt = [
      P[0], P[1],
      P[4], P[5],
      P[8], P[9],
      P[12], P[13],
    ]; // 4x2

    const K = new Array(8).fill(0); // 4x2
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 2; col++) {
        for (let k = 0; k < 2; k++) {
          K[row * 2 + col] += PHt[row * 2 + k] * Sinv[k * 2 + col];
        }
      }
    }

    // Update state: x = x̂ + K·y
    for (let row = 0; row < 4; row++) {
      x[row] += K[row * 2] * y[0] + K[row * 2 + 1] * y[1];
    }

    // Update covariance: P = (I - K·H)·P
    // KH is 4x4: KH[i][j] = K[i][0]*H[0][j] + K[i][1]*H[1][j]
    // Since H = [I₂ 0₂], KH[i][j] = K[i][j] for j<2, 0 otherwise
    const I_KH = mat4Identity();
    for (let row = 0; row < 4; row++) {
      I_KH[row * 4 + 0] -= K[row * 2 + 0];
      I_KH[row * 4 + 1] -= K[row * 2 + 1];
    }
    P = mat4Multiply(I_KH, P);
  }

  const position = { lat: x[0], lng: x[1] };

  const inside = pointInPolygonWithBuffer(
    position,
    room.corners,
    room.center,
    room.bufferRadius
  );

  // Confidence from final covariance and distance
  const posUncertaintyLat = Math.sqrt(Math.max(0, P[0])) * METERS_PER_DEG_LAT;
  const posUncertaintyLng = Math.sqrt(Math.max(0, P[5])) * metersPerDegLng(position.lat);
  const posUncertainty = Math.sqrt(posUncertaintyLat ** 2 + posUncertaintyLng ** 2);
  const distToCenter = haversineDistance(position, room.center);

  const uncertaintyFactor = Math.max(0, 1 - posUncertainty / 50);
  const distanceFactor = Math.max(0, 1 - distToCenter / (room.bufferRadius * 3));
  const sampleFactor = Math.min(1, samples.length / 10);

  const confidence = Math.min(
    1,
    Math.max(0, uncertaintyFactor * 0.4 + distanceFactor * 0.3 + sampleFactor * 0.3)
  );

  return {
    name: 'Kalman Filter',
    position,
    inside,
    confidence,
    metadata: {
      posUncertaintyMeters: posUncertainty,
      finalVelocity: { vLat: x[2], vLng: x[3] },
      distToCenter,
      samplesProcessed: samples.length,
    },
  };
}
