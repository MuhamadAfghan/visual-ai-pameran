import { Schema, model, Types, type InferSchemaType } from "mongoose";

const userSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["super_admin", "admin", "viewer", "pic"], default: "viewer" },
    roleId: { type: Types.ObjectId, ref: "Role", default: null },
    picId: { type: Types.ObjectId, ref: "Pic", default: null },
    isActive: { type: Boolean, default: true },
    passwordResetTokenHash: { type: String, required: false },
    passwordResetExpiresAt: { type: Date, required: false }
  },
  { timestamps: true }
);

export type UserDocument = InferSchemaType<typeof userSchema>;
export const UserModel = model("User", userSchema);
