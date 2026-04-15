// ============================================================
// API: /api/export — export attendance data as CSV/JSON
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { AttendanceLog } from '@/lib/models/attendance-log';

export async function GET(req: NextRequest) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') || 'json';
  const roomId = searchParams.get('roomId');

  const filter: Record<string, unknown> = {};
  if (roomId) filter.roomId = roomId;

  const logs = await AttendanceLog.find(filter).sort({ timestamp: -1 }).lean();

  if (format === 'csv') {
    // Generate CSV
    const algoKeys = ['gps', 'centroid', 'kalman', 'irls_huber', 'hybrid'] as const;

    const headers = [
      'id',
      'roomName',
      'timestamp',
      'numSamples',
      'avgAccuracy',
      ...algoKeys.flatMap((k) => [
        `${k}_lat`,
        `${k}_lng`,
        `${k}_inside`,
        `${k}_confidence`,
      ]),
      'groundTruth',
    ];

    const rows = logs.map((log) => {
      const avgAcc =
        log.rawSamples.length > 0
          ? log.rawSamples.reduce((s: number, p: { accuracy: number }) => s + p.accuracy, 0) /
            log.rawSamples.length
          : 0;

      const algoValues = algoKeys.flatMap((k) => {
        const r = (log.results as Record<string, { position: { lat: number; lng: number }; inside: boolean; confidence: number }>)[k];
        if (!r) return ['', '', '', ''];
        return [
          r.position.lat.toFixed(8),
          r.position.lng.toFixed(8),
          r.inside ? '1' : '0',
          r.confidence.toFixed(4),
        ];
      });

      return [
        log._id,
        log.roomName,
        new Date(log.timestamp).toISOString(),
        log.rawSamples.length,
        avgAcc.toFixed(2),
        ...algoValues,
        log.groundTruth === null ? '' : log.groundTruth ? '1' : '0',
      ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="attendance_data_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  // JSON format (default)
  return NextResponse.json(logs);
}
