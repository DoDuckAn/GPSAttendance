// ============================================================
// Type definitions for the indoor positioning system
// ============================================================

/** A single GPS sample from the browser Geolocation API */
export interface GpsSample {
  lat: number;
  lng: number;
  accuracy: number;   // meters
  timestamp: number;  // ms since epoch
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
}

/** A lat/lng coordinate pair */
export interface LatLng {
  lat: number;
  lng: number;
}

/** Result from a single positioning algorithm */
export interface AlgorithmResult {
  name: string;
  position: LatLng;
  inside: boolean;       // whether the computed position is inside the room
  confidence: number;    // 0–1 confidence score
  metadata?: Record<string, unknown>;
}

/** A room polygon with buffer */
export interface RoomGeofence {
  corners: LatLng[];     // polygon vertices in order
  center: LatLng;
  bufferRadius: number;  // meters — expands polygon for buffer check
}

/** Full attendance check-in result saved to DB */
export interface AttendanceResult {
  roomId: string;
  timestamp: number;
  rawSamples: GpsSample[];
  results: {
    gps: AlgorithmResult;
    centroid: AlgorithmResult;
    kalman: AlgorithmResult;
    irls_huber: AlgorithmResult;
    hybrid: AlgorithmResult;
  };
  groundTruth?: boolean; // user feedback: were they actually inside?
}
