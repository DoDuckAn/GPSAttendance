// ============================================================
// API: /api/attendance — check-in & list attendance logs
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { Room } from '@/lib/models/room';
import { AttendanceLog } from '@/lib/models/attendance-log';
import { runAllAlgorithms, GpsSample, RoomGeofence } from '@/lib/algorithms';

// GET /api/attendance — list logs with optional filters
export async function GET(req: NextRequest) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get('roomId');
  const limit = parseInt(searchParams.get('limit') || '100', 10);
  const skip = parseInt(searchParams.get('skip') || '0', 10);

  const filter: Record<string, unknown> = {};
  if (roomId) filter.roomId = roomId;

  const [logs, total] = await Promise.all([
    AttendanceLog.find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AttendanceLog.countDocuments(filter),
  ]);

  return NextResponse.json({ logs, total, limit, skip });
}

// POST /api/attendance — perform check-in
// Body: { roomId, samples: GpsSample[], groundTruth?: boolean }
export async function POST(req: NextRequest) {
  await connectDB();

  const body = await req.json();
  const { roomId, samples, groundTruth } = body;

  if (!roomId) {
    return NextResponse.json({ error: 'roomId is required' }, { status: 400 });
  }
  if (!samples || !Array.isArray(samples) || samples.length === 0) {
    return NextResponse.json({ error: 'At least one GPS sample is required' }, { status: 400 });
  }

  // Validate samples
  for (const s of samples) {
    if (typeof s.lat !== 'number' || typeof s.lng !== 'number' || typeof s.accuracy !== 'number') {
      return NextResponse.json(
        { error: 'Each sample must have lat, lng, and accuracy' },
        { status: 400 }
      );
    }
  }

  // Fetch room
  const room = await Room.findById(roomId).lean();
  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  // Build geofence from room data
  const geofence: RoomGeofence = {
    corners: room.corners || [],
    center: room.center || { lat: 0, lng: 0 },
    bufferRadius: room.bufferRadius || 30,
  };

  // If room has no corners, use center-only mode
  // (all algorithms will use buffer radius from center)
  if (geofence.corners.length === 0 && geofence.center) {
    // Create a small square polygon around the center as a fallback
    const offset = 0.0001; // ~11m
    geofence.corners = [
      { lat: geofence.center.lat + offset, lng: geofence.center.lng - offset },
      { lat: geofence.center.lat + offset, lng: geofence.center.lng + offset },
      { lat: geofence.center.lat - offset, lng: geofence.center.lng + offset },
      { lat: geofence.center.lat - offset, lng: geofence.center.lng - offset },
    ];
  }

  // Run all positioning algorithms
  const typedSamples: GpsSample[] = samples.map((s: Record<string, unknown>) => ({
    lat: s.lat as number,
    lng: s.lng as number,
    accuracy: s.accuracy as number,
    timestamp: (s.timestamp as number) || Date.now(),
    altitude: (s.altitude as number) ?? null,
    altitudeAccuracy: (s.altitudeAccuracy as number) ?? null,
    heading: (s.heading as number) ?? null,
    speed: (s.speed as number) ?? null,
  }));

  const results = runAllAlgorithms(typedSamples, geofence);

  // Save to database
  const log = new AttendanceLog({
    roomId: room._id,
    roomName: room.name,
    timestamp: new Date(),
    rawSamples: typedSamples,
    results,
    groundTruth: groundTruth ?? null,
  });

  await log.save();

  return NextResponse.json({
    logId: log._id,
    results,
    groundTruth: log.groundTruth,
  }, { status: 201 });
}
