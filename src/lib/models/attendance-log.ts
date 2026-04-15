// ============================================================
// Attendance Log model — MongoDB / Mongoose
// ============================================================

import mongoose, { Schema, Document, Model } from 'mongoose';

const LatLngSchema = new Schema(
  { lat: { type: Number, required: true }, lng: { type: Number, required: true } },
  { _id: false }
);

const GpsSampleSchema = new Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    accuracy: { type: Number, required: true },
    timestamp: { type: Number, required: true },
    altitude: Number,
    altitudeAccuracy: Number,
    heading: Number,
    speed: Number,
  },
  { _id: false }
);

const AlgorithmResultSchema = new Schema(
  {
    name: { type: String, required: true },
    position: { type: LatLngSchema, required: true },
    inside: { type: Boolean, required: true },
    confidence: { type: Number, required: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

export interface IAttendanceLog extends Document {
  roomId: mongoose.Types.ObjectId;
  roomName: string;
  timestamp: Date;
  rawSamples: {
    lat: number;
    lng: number;
    accuracy: number;
    timestamp: number;
    altitude?: number;
    altitudeAccuracy?: number;
    heading?: number;
    speed?: number;
  }[];
  results: {
    gps: {
      name: string;
      position: { lat: number; lng: number };
      inside: boolean;
      confidence: number;
      metadata?: Record<string, unknown>;
    };
    centroid: {
      name: string;
      position: { lat: number; lng: number };
      inside: boolean;
      confidence: number;
      metadata?: Record<string, unknown>;
    };
    kalman: {
      name: string;
      position: { lat: number; lng: number };
      inside: boolean;
      confidence: number;
      metadata?: Record<string, unknown>;
    };
    irls_huber: {
      name: string;
      position: { lat: number; lng: number };
      inside: boolean;
      confidence: number;
      metadata?: Record<string, unknown>;
    };
    hybrid: {
      name: string;
      position: { lat: number; lng: number };
      inside: boolean;
      confidence: number;
      metadata?: Record<string, unknown>;
    };
  };
  groundTruth: boolean | null;
}

const AttendanceLogSchema = new Schema<IAttendanceLog>({
  roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  roomName: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  rawSamples: { type: [GpsSampleSchema], required: true },
  results: {
    gps: { type: AlgorithmResultSchema, required: true },
    centroid: { type: AlgorithmResultSchema, required: true },
    kalman: { type: AlgorithmResultSchema, required: true },
    irls_huber: { type: AlgorithmResultSchema, required: true },
    hybrid: { type: AlgorithmResultSchema, required: true },
  },
  groundTruth: { type: Boolean, default: null },
});

// Index for efficient queries
AttendanceLogSchema.index({ roomId: 1, timestamp: -1 });
AttendanceLogSchema.index({ timestamp: -1 });

export const AttendanceLog: Model<IAttendanceLog> =
  mongoose.models.AttendanceLog ||
  mongoose.model<IAttendanceLog>('AttendanceLog', AttendanceLogSchema);
