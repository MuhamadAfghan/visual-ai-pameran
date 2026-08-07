import { Schema, model, type InferSchemaType } from "mongoose";

const roiPointSchema = new Schema(
  { x: { type: Number, required: true }, y: { type: Number, required: true } },
  { _id: false }
);

const redZoneSchema = new Schema(
  {
    name: { type: String, default: "" },
    points: { type: [roiPointSchema], default: [] }
  },
  { _id: false }
);

const cameraSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, unique: true },
    name: { type: String, required: true, trim: true },
    sourceType: { type: String, enum: ["rtsp", "device"], default: "rtsp" },
    rtspUrl: { type: String, trim: true, default: null },
    sectionId: { type: Schema.Types.ObjectId, ref: "Section", required: true },
    brand: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["online", "offline", "maintenance"],
      default: "offline"
    },
    // Optional soft floor (seconds) between capture+inference cycles. 0 = no
    // artificial limit — the always-on monitoring loop runs as fast as the AI
    // service and camera framerate allow. Only RTSP-sourced cameras use this;
    // device-sourced cameras' own push cadence is unrelated (see device-camera-provider.tsx).
    minCaptureGapSeconds: { type: Number, default: 0 },
    cooldownPeriod: { type: Number, default: 300 },
    crowdThreshold: { type: Number, default: null, min: 0 },
    defaultPicIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Pic" }],
      validate: {
        validator: (v: unknown[]) => Array.isArray(v) && v.length >= 1,
        message: "Kamera wajib punya minimal 1 PIC"
      }
    },
    notes: { type: String, trim: true, default: "" },
    location: {
      type: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
      },
      default: null,
    },
    redZones: { type: [redZoneSchema], default: [] },
    isActive: { type: Boolean, default: true },
    lastCaptureAt: { type: Date, default: null },
    latestSnapshotUrl: { type: String, default: null }
  },
  { timestamps: true }
);

export type CameraDocument = InferSchemaType<typeof cameraSchema>;
export const CameraModel = model("Camera", cameraSchema);
