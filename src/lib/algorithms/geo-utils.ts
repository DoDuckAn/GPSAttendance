// ============================================================
// Geographic utility functions
// ============================================================

import { LatLng } from './types';

const EARTH_RADIUS_M = 6371000;

/** Convert degrees to radians */
export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Convert radians to degrees */
export function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Haversine distance between two lat/lng points in meters.
 *
 * Formula:
 *   a = sin²(Δlat/2) + cos(lat1) · cos(lat2) · sin²(Δlng/2)
 *   c = 2 · atan2(√a, √(1−a))
 *   d = R · c
 */
export function haversineDistance(p1: LatLng, p2: LatLng): number {
  const dLat = toRad(p2.lat - p1.lat);
  const dLng = toRad(p2.lng - p1.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

/**
 * Ray-casting algorithm for point-in-polygon test.
 *
 * Shoots a ray from the test point to the right (+lng direction)
 * and counts how many polygon edges it crosses.
 * Odd crossings = inside, even = outside.
 */
export function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;

    const intersect =
      yi > point.lng !== yj > point.lng &&
      point.lat < ((xj - xi) * (point.lng - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Check if a point is inside a polygon WITH a buffer zone.
 *
 * First checks polygon containment (ray-casting).
 * If outside, checks if the point is within bufferRadius meters
 * of the polygon center (fallback for GPS inaccuracy).
 */
export function pointInPolygonWithBuffer(
  point: LatLng,
  polygon: LatLng[],
  center: LatLng,
  bufferRadius: number
): boolean {
  // Direct polygon check
  if (pointInPolygon(point, polygon)) return true;

  // Buffer zone: within bufferRadius of center
  const dist = haversineDistance(point, center);
  return dist <= bufferRadius;
}

/**
 * Compute the centroid (geometric center) of a set of lat/lng points.
 *
 * For small areas, arithmetic mean is a good approximation.
 * For large areas, a spherical centroid would be needed.
 */
export function computeCentroid(points: LatLng[]): LatLng {
  if (points.length === 0) throw new Error('Cannot compute centroid of empty array');
  const sum = points.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
    { lat: 0, lng: 0 }
  );
  return {
    lat: sum.lat / points.length,
    lng: sum.lng / points.length,
  };
}

/**
 * Compute the center and approximate bounding of a polygon.
 */
export function polygonCenter(corners: LatLng[]): LatLng {
  return computeCentroid(corners);
}

/**
 * Meters per degree of latitude (approximately constant).
 */
export const METERS_PER_DEG_LAT = 111320;

/**
 * Meters per degree of longitude at a given latitude.
 */
export function metersPerDegLng(lat: number): number {
  return 111320 * Math.cos(toRad(lat));
}
