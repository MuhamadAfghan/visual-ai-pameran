import { Schema, model, type InferSchemaType } from "mongoose";
import { SELECTED_CHECKS } from "./aiModel.model";

const timeRangeSchema = new Schema(
  {
    start: { type: String, required: true }, // "HH:MM"
    end: { type: String, required: true }    // "HH:MM"
  },
  { _id: false }
);

const roiPointSchema = new Schema(
  { x: { type: Number, required: true }, y: { type: Number, required: true } },
  { _id: false }
);

// One handrail line (matches AI proto `Polyline`). Stairs can have rails on
// multiple sides, so handrailLines is an array of these.
const polylineSchema = new Schema(
  { points: { type: [roiPointSchema], default: [] } },
  { _id: false }
);

const cameraMappingSchema = new Schema(
  {
    cameraId: { type: Schema.Types.ObjectId, ref: "Camera", required: true },
    modelId: { type: Schema.Types.ObjectId, ref: "AiModel", required: true },
    isActive: { type: Boolean, default: true },

    selectedChecks: [{ type: String, enum: SELECTED_CHECKS }],
    roiPolygon: { type: [roiPointSchema], default: [] },
    // Handrail (handrail_count) geometry: stairs-area polygon + one/more rail lines.
    stairsZone: { type: [roiPointSchema], default: [] },
    handrailLines: { type: [polylineSchema], default: [] },
    confidenceThreshold: { type: Number, default: 0.5, min: 0, max: 1 },

    schedule: {
      type: {
        type: String,
        enum: ["always", "time_range"],
        default: "always"
      },
      timeRanges: { type: [timeRangeSchema], default: [] },
      daysOfWeek: { type: [Number], default: [] }
    },

    picIds: [{ type: Schema.Types.ObjectId, ref: "Pic" }],
    captureInterval: { type: Number, default: null }
  },
  { timestamps: true }
);

// A camera can only be mapped to the same model once
cameraMappingSchema.index({ cameraId: 1, modelId: 1 }, { unique: true });

export type CameraMappingDocument = InferSchemaType<typeof cameraMappingSchema>;
export const CameraMappingModel = model("CameraModelMapping", cameraMappingSchema);
