import { Schema, model, type InferSchemaType } from "mongoose";

// Singleton document — always query via getSettings() which auto-creates if absent
const systemSettingsSchema = new Schema(
  {
    smtp: {
      host: { type: String, default: "" },
      port: { type: Number, default: 587 },
      user: { type: String, default: "" },
      pass: { type: String, default: "" },
      from: { type: String, default: "" },
      tls: { type: Boolean, default: false }
    },
    retention: {
      dataDays: { type: Number, default: 30 },
      snapshotDays: { type: Number, default: 30 }
    },
    capture: {
      defaultMinGapSeconds: { type: Number, default: 0 },
      defaultCooldown: { type: Number, default: 300 }
    },
    notification: {
      maxEmailsPerHour: { type: Number, default: 10 },
      cooldownMinutes: { type: Number, default: 5 }
    },
    timezone: { type: String, default: "Asia/Jakarta" },
    storage: {
      maxSizeGB: { type: Number, default: 10 }
    }
  },
  { timestamps: true }
);

export type SystemSettingsDocument = InferSchemaType<typeof systemSettingsSchema>;
export const SystemSettingsModel = model("SystemSettings", systemSettingsSchema);
