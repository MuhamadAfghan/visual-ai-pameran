/**
 * seedSystemRoles.ts
 *
 * Idempotent: Creates or updates the system Role records.
 * Safe to run multiple times — uses upsert.
 *
 * Usage:
 *   npx tsx src/scripts/seedSystemRoles.ts
 */

import mongoose from "mongoose";
import { connectMongo } from "../config/mongo";
import { RoleModel } from "../models/role.model";
import { DEFAULT_PERMISSIONS } from "../config/defaultPermissions";
import { PERMISSION_MODULES } from "../types/auth";
import type { PermissionAction } from "../types/auth";

const ALL_ACTIONS: PermissionAction[] = [
  "view", "create", "update", "delete",
  "export", "stream", "snapshot", "scheduler",
  "acknowledge", "false_positive", "toggle",
];

async function seed() {
  console.log("[seedSystemRoles] Connecting to MongoDB...");
  await connectMongo();
  console.log("[seedSystemRoles] Connected.");

  const roles = [
    {
      name: "super_admin",
      description: "Full access to all modules — bypasses all permission checks",
      isSystem: true,
      // super_admin always passes in middleware, but we store full permissions for display
      permissions: PERMISSION_MODULES.map((module) => ({ module, actions: ALL_ACTIONS })),
    },
    {
      name: "admin",
      description: "Manage cameras, events, areas, and configurations",
      isSystem: true,
      permissions: DEFAULT_PERMISSIONS.admin,
    },
    {
      name: "viewer",
      description: "Read-only access to monitoring features",
      isSystem: true,
      permissions: DEFAULT_PERMISSIONS.viewer,
    },
    {
      name: "pic",
      description: "Person In Charge — scoped to assigned cameras only",
      isSystem: true,
      permissions: DEFAULT_PERMISSIONS.pic,
    },
  ];

  for (const role of roles) {
    await RoleModel.updateOne(
      { name: role.name },   // cari by name saja — tanpa filter isSystem agar update dokumen lama juga
      { $set: role },
      { upsert: true },
    );
    console.log(`  ✓ Seeded system role: ${role.name}`);
  }

  console.log("[seedSystemRoles] Done.");
}

seed()
  .catch((err) => {
    console.error("[seedSystemRoles] Fatal error:", err);
    process.exit(1);
  })
  .finally(() => mongoose.disconnect());
