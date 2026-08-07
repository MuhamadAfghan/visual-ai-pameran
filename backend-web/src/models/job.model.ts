import { Schema, model, type InferSchemaType } from "mongoose";

const detectionJobSchema = new Schema(
  {
    cameraId: { type: String, required: true },
    selectedChecks: { type: [String], required: true },
    status: {
      type: String,
      enum: ["queued", "processing", "done", "failed"],
      default: "queued",
    },
    result: { type: Schema.Types.Mixed, default: null },
    error: { type: String, default: null },
  },
  { timestamps: true },
);

export type DetectionJobDocument = InferSchemaType<typeof detectionJobSchema>;
export const DetectionJobModel = model("DetectionJob", detectionJobSchema);
