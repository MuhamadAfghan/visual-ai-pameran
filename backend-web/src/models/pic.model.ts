import { Schema, model, Types, type InferSchemaType } from "mongoose";

const picSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    modelTypes: [{ type: String }],
    // Empty array = receives all violations. Non-empty = only the listed check names.
    subscribedChecks: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    userId: { type: Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

picSchema.index({ email: 1 });

export type PicDocument = InferSchemaType<typeof picSchema>;
export const PicModel = model("Pic", picSchema);
