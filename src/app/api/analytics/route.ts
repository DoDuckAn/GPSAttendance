// ============================================================
// API: /api/analytics — compute algorithm comparison metrics
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { AttendanceLog, IAttendanceLog } from '@/lib/models/attendance-log';

type AlgoKey = 'gps' | 'centroid' | 'kalman' | 'irls_huber' | 'hybrid';
const ALGO_KEYS: AlgoKey[] = ['gps', 'centroid', 'kalman', 'irls_huber', 'hybrid'];

interface ConfusionMatrix {
  tp: number; // predicted inside, actually inside
  fp: number; // predicted inside, actually outside
  fn: number; // predicted outside, actually inside
  tn: number; // predicted outside, actually outside
}

interface AlgoMetrics {
  name: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  totalPredictions: number;
  confusionMatrix: ConfusionMatrix;
  avgConfidence: number;
  avgErrorDistance: number;
}

export async function GET(req: NextRequest) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get('roomId');

  const filter: Record<string, unknown> = {
    groundTruth: { $ne: null }, // Only logs with feedback
  };
  if (roomId) filter.roomId = roomId;

  const logs = (await AttendanceLog.find(filter).lean()) as unknown as IAttendanceLog[];

  if (logs.length === 0) {
    return NextResponse.json({
      totalLogs: 0,
      logsWithFeedback: 0,
      algorithms: [],
      perRoom: [],
    });
  }

  // Compute metrics for each algorithm
  const algoMetrics: AlgoMetrics[] = ALGO_KEYS.map((key) => {
    const cm: ConfusionMatrix = { tp: 0, fp: 0, fn: 0, tn: 0 };
    let totalConfidence = 0;
    let totalErrorDist = 0;
    let count = 0;

    for (const log of logs) {
      const result = log.results[key];
      if (!result) continue;

      const predicted = result.inside;
      const actual = log.groundTruth as boolean;

      if (predicted && actual) cm.tp++;
      else if (predicted && !actual) cm.fp++;
      else if (!predicted && actual) cm.fn++;
      else cm.tn++;

      totalConfidence += result.confidence;

      // Error distance: distance between predicted position and room center
      // (as a proxy for error — real error would need marked ground truth position)
      if (result.metadata && typeof result.metadata === 'object' && 'distToCenter' in result.metadata) {
        totalErrorDist += result.metadata.distToCenter as number;
      }

      count++;
    }

    const total = cm.tp + cm.fp + cm.fn + cm.tn;
    const accuracy = total > 0 ? (cm.tp + cm.tn) / total : 0;
    const precision = (cm.tp + cm.fp) > 0 ? cm.tp / (cm.tp + cm.fp) : 0;
    const recall = (cm.tp + cm.fn) > 0 ? cm.tp / (cm.tp + cm.fn) : 0;
    const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    return {
      name: key,
      accuracy: Math.round(accuracy * 10000) / 100, // percentage with 2 decimals
      precision: Math.round(precision * 10000) / 100,
      recall: Math.round(recall * 10000) / 100,
      f1: Math.round(f1 * 10000) / 100,
      totalPredictions: total,
      confusionMatrix: cm,
      avgConfidence: count > 0 ? Math.round((totalConfidence / count) * 1000) / 1000 : 0,
      avgErrorDistance: count > 0 ? Math.round((totalErrorDist / count) * 100) / 100 : 0,
    };
  });

  // Per-room breakdown
  const roomIds = [...new Set(logs.map((l) => l.roomId.toString()))];
  const perRoom = roomIds.map((rId) => {
    const roomLogs = logs.filter((l) => l.roomId.toString() === rId);
    const roomName = roomLogs[0]?.roomName || 'Unknown';

    const roomAlgoMetrics = ALGO_KEYS.map((key) => {
      let correct = 0;
      for (const log of roomLogs) {
        const result = log.results[key];
        if (!result) continue;
        if (result.inside === log.groundTruth) correct++;
      }
      return {
        name: key,
        accuracy: roomLogs.length > 0
          ? Math.round((correct / roomLogs.length) * 10000) / 100
          : 0,
        total: roomLogs.length,
      };
    });

    return {
      roomId: rId,
      roomName,
      totalLogs: roomLogs.length,
      algorithms: roomAlgoMetrics,
    };
  });

  // Total counts
  const totalLogs = await AttendanceLog.countDocuments(roomId ? { roomId } : {});

  return NextResponse.json({
    totalLogs,
    logsWithFeedback: logs.length,
    algorithms: algoMetrics,
    perRoom,
  });
}
