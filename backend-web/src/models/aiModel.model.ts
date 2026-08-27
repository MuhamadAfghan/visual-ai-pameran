import { Schema, model, type InferSchemaType } from "mongoose";

// Fixed enum — dikontrol oleh AI service, tidak bisa dikonfigurasi admin
export const SELECTED_CHECKS = [
  "person_count",
  "mask_count",
  "helmet_count",
  "vest_count",
  "goggles_count",
  "gloves_count",
  "ladder_count",
  "safety_cone_count",
  "fall_detected_count",
  "red_zone_count",
  "hand_in_pocket_count",
  "holding_phone_count",
  "handrail_count",
] as const;
export type SelectedCheck = (typeof SELECTED_CHECKS)[number];

const aiModelSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, unique: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    defaultChecks: [{ type: String, enum: SELECTED_CHECKS }],
    defaultConfThreshold: { type: Number, default: 0.25, min: 0, max: 1 },
    version: { type: String, trim: true, default: "1.0.0" },
    isActive: { type: Boolean, default: true },
    // Marks the single "free pick" catalog entry the mapping form unlocks
    // selectedChecks for. System-managed (seedAiModels.ts) — not exposed on
    // the admin AiModel form, same as SELECTED_CHECKS above.
    isCustom: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export type AiModelDocument = InferSchemaType<typeof aiModelSchema>;
export const AiModelModel = model("AiModel", aiModelSchema);
