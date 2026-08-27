import { Schema, model, type InferSchemaType } from "mongoose";

const checkResultSchema = new Schema(
  {
    check: { type: String, required: true, trim: true },
    value: { type: Number, default: 0 },
    confidence: { type: Number, required: true },
    isViolation: { type: Boolean, required: true },
    violation: {
      type: new Schema(
        {
          type: { type: String },
          severity: { type: String },
          score: { type: Number },
          detailsJson: { type: String }
        },
        { _id: false }
      ),
      default: null
    }
  },
  { _id: false }
);

const detectionEventSchema = new Schema(
  {
    cameraId: { type: Schema.Types.ObjectId, ref: "Camera", required: true },
    modelId: { type: Schema.Types.ObjectId, ref: "AiModel", required: true },
    mappingId: { type: Schema.Types.ObjectId, ref: "CameraModelMapping", required: true },

    detectedAt: { type: Date, required: true },

    // One entry per check from the inference run
    checkResults: { type: [checkResultSchema], required: true },

    // true if at least one checkResult has isViolation: true — kept at top level for fast querying
    isViolation: { type: Boolean, required: true },

    // AI-assigned track_id of every individual violator captured in this event
    // (deduped). Used to key the capture cooldown per-person instead of per
    // camera+mapping — see isViolationDebounced's replacement in
    // framePipeline.service.ts. Empty when the AI service couldn't identify
    // individual violators for any check in this event.
    violatingTrackIds: { type: [Number], default: [] },
    // true if this event includes at least one violation the AI service
    // couldn't attribute to a single tracked person (e.g. crowd_exceeded, a
    // whole-zone metric) — those fall back to the old camera+mapping-wide
    // cooldown window.
    hasUntrackedViolation: { type: Boolean, default: false },

    // All detected objects from the inference (shared across checks)
    detections: [
      {
        label: { type: String },
        confidence: { type: Number },
        bbox: [{ type: Number }],
        attributes: { type: Map, of: String, default: {} },
        _id: false
      }
    ],

    snapshotPath: { type: String, default: null },       // annotated (with bbox/zones)
    snapshotUrl: { type: String, default: null },        // annotated public URL
    originalSnapshotPath: { type: String, default: null }, // raw original
    originalSnapshotUrl: { type: String, default: null },  // raw original public URL

    status: {
      type: String,
      enum: ["unacknowledged", "acknowledged", "false_positive"],
      default: "unacknowledged"
    },
    acknowledgedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    acknowledgedAt: { type: Date, default: null },

    notificationSentAt: { type: Date, default: null },
    notificationStatus: {
      type: String,
      enum: ["sent", "failed", "throttled", null],
      default: null
    },

    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

detectionEventSchema.index({ cameraId: 1, detectedAt: -1 });
detectionEventSchema.index({ status: 1 });
detectionEventSchema.index({ isViolation: 1, detectedAt: -1 });
detectionEventSchema.index({ "checkResults.check": 1 });
detectionEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Supports the per-violator cooldown lookup in framePipeline.service.ts
// (getUndebouncedViolationInstances): recent events for this camera+mapping,
// filtered by which track_ids they already cover.
detectionEventSchema.index({ cameraId: 1, mappingId: 1, isViolation: 1, violatingTrackIds: 1, detectedAt: -1 });

export type DetectionEventDocument = InferSchemaType<typeof detectionEventSchema>;
export const DetectionEventModel = model("DetectionEvent", detectionEventSchema);
