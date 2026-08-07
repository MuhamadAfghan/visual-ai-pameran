import { Schema, model, type InferSchemaType } from "mongoose";

const locationSchema = new Schema(
  { lat: { type: Number, required: true }, lng: { type: Number, required: true } },
  { _id: false }
);

const sectionSchema = new Schema(
  {
    areaId: { type: Schema.Types.ObjectId, ref: "Area", required: true },
    code: { type: String, required: true, trim: true, unique: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true },
    location: { type: locationSchema, default: null }
  },
  { timestamps: true }
);

sectionSchema.index({ areaId: 1 });

export type SectionDocument = InferSchemaType<typeof sectionSchema>;
export const SectionModel = model("Section", sectionSchema);
