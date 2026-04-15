'use client';

// ============================================================
// RoomMap — interactive Leaflet map for room polygon editing.
// Dynamically imported (ssr: false) from rooms/page.tsx.
// ============================================================

import L from 'leaflet';
import { useEffect, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Polygon,
  Polyline,
  Circle,
  Popup,
  useMapEvents,
  useMap,
} from 'react-leaflet';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RoomMapProps {
  corners: LatLng[];
  bufferRadius: number;
  currentLocation?: LatLng | null;
  /** Called when user clicks on the map (undefined = read-only) */
  onMapClick?: (lat: number, lng: number) => void;
  readOnly?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────

function centroid(pts: LatLng[]): LatLng | null {
  if (!pts.length) return null;
  return {
    lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
    lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length,
  };
}

// ── Inner components (must be inside MapContainer) ───────────

/** Fires onMapClick when the user taps/clicks the map */
function ClickHandler({ fn }: { fn?: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => fn?.(e.latlng.lat, e.latlng.lng) });
  return null;
}

/**
 * Auto-fits the map view to the given points.
 * Only re-fits when the number of points changes (avoids interrupting
 * manual panning once the user has set their zoom level).
 */
function AutoFit({ pts }: { pts: [number, number][] }) {
  const map = useMap();
  const prevLen = useRef(-1);

  useEffect(() => {
    if (pts.length === 0) return;
    if (pts.length === prevLen.current) return;
    prevLen.current = pts.length;

    try {
      if (pts.length === 1) {
        map.setView(pts[0], Math.max(map.getZoom(), 19));
      } else {
        map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 21 });
      }
    } catch {
      // bounds can throw when pts are degenerate
    }
  }, [pts.length, map]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

// ── Custom icons (all inline SVG/HTML, no broken image paths) ─

const makeCornerIcon = (n: number) =>
  L.divIcon({
    className: '',
    html: `<div style="
      background:#2563eb;color:#fff;
      width:26px;height:26px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-weight:700;font-size:12px;
      border:2.5px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,.45);
      font-family:system-ui,sans-serif;
    ">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });

const gpsIcon = L.divIcon({
  className: '',
  html: `<div style="
    background:#10b981;width:16px;height:16px;
    border-radius:50%;border:3px solid white;
    box-shadow:0 0 0 2px #10b981,0 2px 8px rgba(0,0,0,.4);
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const centerIcon = L.divIcon({
  className: '',
  html: `<div style="
    background:#f59e0b;width:12px;height:12px;
    border-radius:50%;border:2.5px solid white;
    box-shadow:0 1px 5px rgba(0,0,0,.45);
  "></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

// ── Main component ────────────────────────────────────────────

export default function RoomMap({
  corners,
  bufferRadius,
  currentLocation,
  onMapClick,
  readOnly = false,
}: RoomMapProps) {
  const ctr = centroid(corners);

  // Default viewport: HCMC if no points available yet
  const defaultCenter: [number, number] =
    ctr
      ? [ctr.lat, ctr.lng]
      : currentLocation
      ? [currentLocation.lat, currentLocation.lng]
      : [10.7721, 106.6577];

  // All points used to auto-fit bounds
  const allPts: [number, number][] = [
    ...corners.map((c): [number, number] => [c.lat, c.lng]),
    ...(currentLocation
      ? [[currentLocation.lat, currentLocation.lng] as [number, number]]
      : []),
  ];

  const polyPts: [number, number][] = corners.map((c) => [c.lat, c.lng]);

  return (
    <MapContainer
      center={defaultCenter}
      zoom={18}
      style={{
        height: '100%',
        width: '100%',
        cursor: !readOnly && onMapClick ? 'crosshair' : undefined,
      }}
      zoomControl
    >
      {/* Base map — OpenStreetMap (free, no API key) */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxNativeZoom={19}
        maxZoom={22}
      />

      <AutoFit pts={allPts} />
      {!readOnly && <ClickHandler fn={onMapClick} />}

      {/* Green dot — current GPS position */}
      {currentLocation && (
        <Marker position={[currentLocation.lat, currentLocation.lng]} icon={gpsIcon}>
          <Popup>📍 Vị trí GPS hiện tại</Popup>
        </Marker>
      )}

      {/* Numbered corner markers */}
      {corners.map((c, i) => (
        <Marker key={i} position={[c.lat, c.lng]} icon={makeCornerIcon(i + 1)}>
          <Popup>
            <strong>Góc {i + 1}</strong>
            <br />
            <code style={{ fontSize: 11 }}>
              {c.lat.toFixed(7)}, {c.lng.toFixed(7)}
            </code>
          </Popup>
        </Marker>
      ))}

      {/* Dashed line when only 2 corners (not yet a polygon) */}
      {corners.length === 2 && (
        <Polyline
          positions={polyPts}
          pathOptions={{ color: '#2563eb', weight: 2, dashArray: '7,5' }}
        />
      )}

      {/* Filled polygon when ≥ 3 corners */}
      {corners.length >= 3 && (
        <Polygon
          positions={polyPts}
          pathOptions={{
            color: '#2563eb',
            fillColor: '#3b82f6',
            fillOpacity: 0.18,
            weight: 2.5,
          }}
        />
      )}

      {/* Buffer zone circle (yellow dashed) */}
      {ctr && bufferRadius > 0 && (
        <Circle
          center={[ctr.lat, ctr.lng]}
          radius={bufferRadius}
          pathOptions={{
            color: '#f59e0b',
            fillColor: '#fbbf24',
            fillOpacity: 0.07,
            weight: 1.5,
            dashArray: '5,4',
          }}
        />
      )}

      {/* Amber dot — auto-computed centroid */}
      {ctr && corners.length >= 2 && (
        <Marker position={[ctr.lat, ctr.lng]} icon={centerIcon}>
          <Popup>
            <strong>🎯 Tâm phòng (tự tính)</strong>
            <br />
            <code style={{ fontSize: 11 }}>
              {ctr.lat.toFixed(7)}, {ctr.lng.toFixed(7)}
            </code>
          </Popup>
        </Marker>
      )}
    </MapContainer>
  );
}
