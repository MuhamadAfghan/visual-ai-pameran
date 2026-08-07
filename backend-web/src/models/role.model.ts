import { Schema, model, type InferSchemaType } from "mongoose";
import { PERMISSION_MODULES } from "../types/auth";

const permissionEntrySchema = new Schema(
  {
    module: { type: String, enum: PERMISSION_MODULES, required: true },
    actions: [{ type: String, enum: [
      "view", "create", "update", "delete",
      "export", "stream", "snapshot", "scheduler",
      "acknowledge", "false_positive", "toggle",
    ] }],
  },
  { _id: false }
);

const roleSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: "" },
    isSystem: { type: Boolean, default: false },
    permissions: [permissionEntrySchema],
  },
  { timestamps: true }
);

export type RoleDocument = InferSchemaType<typeof roleSchema>;
export const RoleModel = model("Role", roleSchema);
