// ============================================================
// API: /api/rooms/[id] — update/delete a room
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { Room } from '@/lib/models/room';

// GET /api/rooms/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connectDB();
  const { id } = await params;
  const room = await Room.findById(id).lean();
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  return NextResponse.json(room);
}

// PUT /api/rooms/[id] — update room
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connectDB();
  const { id } = await params;
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.name) updates.name = body.name;
  if (body.corners) {
    updates.corners = body.corners;
    // Recompute center
    if (body.corners.length > 0) {
      const sumLat = body.corners.reduce((s: number, c: { lat: number }) => s + c.lat, 0);
      const sumLng = body.corners.reduce((s: number, c: { lng: number }) => s + c.lng, 0);
      updates.center = {
        lat: sumLat / body.corners.length,
        lng: sumLng / body.corners.length,
      };
    }
  }
  if (body.bufferRadius !== undefined) updates.bufferRadius = body.bufferRadius;

  const room = await Room.findByIdAndUpdate(id, updates, { new: true }).lean();
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  return NextResponse.json(room);
}

// DELETE /api/rooms/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connectDB();
  const { id } = await params;
  const result = await Room.findByIdAndDelete(id);
  if (!result) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
