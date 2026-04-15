// ============================================================
// Room model — MongoDB / Mongoose
// ============================================================

import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IRoom extends Document {
  name: string;
  corners: { lat: number; lng: number }[];
  center: { lat: number; lng: number };
  bufferRadius: number; // meters
  createdAt: Date;
}

const LatLngSchema = new Schema(
  { lat: { type: Number, required: true }, lng: { type: Number, required: true } },
  { _id: false }
);

const RoomSchema = new Schema<IRoom>({
  name: { type: String, required: true },
  corners: { type: [LatLngSchema], default: [] },
  center: { type: LatLngSchema },
  bufferRadius: { type: Number, default: 30 }, // 30m default buffer
  createdAt: { type: Date, default: Date.now },
});

// Auto-compute center from corners before saving
RoomSchema.pre('save', function (next) {
  if (this.corners && this.corners.length > 0) {
    const sumLat = this.corners.reduce((s, c) => s + c.lat, 0);
    const sumLng = this.corners.reduce((s, c) => s + c.lng, 0);
    this.center = {
      lat: sumLat / this.corners.length,
      lng: sumLng / this.corners.length,
    };
  }
  next();
});

export const Room: Model<IRoom> =
  mongoose.models.Room || mongoose.model<IRoom>('Room', RoomSchema);
