// ============================================================
// API: /api/attendance/[id]/feedback — update ground truth
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { AttendanceLog } from '@/lib/models/attendance-log';

// PATCH /api/attendance/[id]/feedback — update ground truth
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connectDB();
  const { id } = await params;
  const body = await req.json();

  if (typeof body.groundTruth !== 'boolean') {
    return NextResponse.json({ error: 'groundTruth must be a boolean' }, { status: 400 });
  }

  const log = await AttendanceLog.findByIdAndUpdate(
    id,
    { groundTruth: body.groundTruth },
    { new: true }
  ).lean();

  if (!log) {
    return NextResponse.json({ error: 'Log not found' }, { status: 404 });
  }

  return NextResponse.json(log);
}
