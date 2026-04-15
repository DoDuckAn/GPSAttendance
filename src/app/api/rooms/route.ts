// ============================================================
// API: /api/rooms — CRUD for rooms
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { Room } from '@/lib/models/room';

// GET /api/rooms — list all rooms
export async function GET() {
  await connectDB();
  const rooms = await Room.find().sort({ createdAt: -1 }).lean();
  return NextResponse.json(rooms);
}

// POST /api/rooms — create or update a room
export async function POST(req: NextRequest) {
  await connectDB();

  const body = await req.json();
  const { name, corners, bufferRadius } = body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Room name is required' }, { status: 400 });
  }

  const room = new Room({
    name: name.trim(),
    corners: corners || [],
    bufferRadius: bufferRadius ?? 30,
  });

  await room.save();
  return NextResponse.json(room, { status: 201 });
}
