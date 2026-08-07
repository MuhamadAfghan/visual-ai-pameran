import { Schema, model, type InferSchemaType } from "mongoose";

const notificationLogSchema = new Schema(
  {
    eventId: { type: Schema.Types.ObjectId, ref: "DetectionEvent", required: true },
    picId: { type: Schema.Types.ObjectId, ref: "Pic", required: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    status: {
      type: String,
      enum: ["sent", "failed", "throttled"],
      required: true
    },
    attemptCount: { type: Number, default: 1 },
    lastAttemptAt: { type: Date, required: true },
    error: { type: String, default: null }
  },
  { timestamps: true }
);

notificationLogSchema.index({ eventId: 1 });
notificationLogSchema.index({ picId: 1, lastAttemptAt: -1 });

export type NotificationLogDocument = InferSchemaType<typeof notificationLogSchema>;
export const NotificationLogModel = model("NotificationLog", notificationLogSchema);
