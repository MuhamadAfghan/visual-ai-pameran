import { Schema, model, type InferSchemaType } from "mongoose";

const auditLogSchema = new Schema(
  {
    actorUserId: { type: String, required: false },
    actorEmail: { type: String, required: false },
    action: { type: String, required: true },
    targetType: { type: String, required: true },
    targetId: { type: String, required: false },
    ipAddress: { type: String, required: false },
    userAgent: { type: String, required: false },
    metadata: { type: Schema.Types.Mixed, default: null }
  },
  { timestamps: true }
);

export type AuditLogDocument = InferSchemaType<typeof auditLogSchema>;
export const AuditLogModel = model("AuditLog", auditLogSchema);

