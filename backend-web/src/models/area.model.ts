import { Schema, model, type InferSchemaType } from "mongoose";

const areaSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, unique: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    // Koordinat default area. Saat kamera dibuat/diedit di section milik area ini,
    // form mengisi koordinat kamera dari sini — tetap bisa di-override per kamera.
    location: {
      type: {
        lat: { type: Number, required: true, min: -90, max: 90 },
        lng: { type: Number, required: true, min: -180, max: 180 },
      },
      default: null,
    },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export type AreaDocument = InferSchemaType<typeof areaSchema>;
export const AreaModel = model("Area", areaSchema);
