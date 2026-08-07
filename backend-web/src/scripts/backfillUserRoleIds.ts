/**
 * Backfill `roleId` untuk user lama yang hanya punya field legacy `role` string
 * (dibuat sebelum sistem role-DB). Mencocokkan `user.role` (admin/viewer/
 * super_admin) ke system role bernama sama, lalu mengisi `roleId`.
 *
 * Idempotent: hanya menyentuh user dengan roleId null/absent. Aman dijalankan
 * ulang. User yang sudah punya roleId (mis. role custom seperti AI Developer)
 * tidak diutak-atik.
 *
 *   npm run backfill:user-roles
 */
import mongoose from "mongoose";
import { connectMongo } from "../config/mongo";
import { UserModel } from "../models/user.model";
import { RoleModel } from "../models/role.model";

async function run(): Promise<void> {
  await connectMongo();

  // System roles keyed by name (admin / viewer / super_admin).
  const systemRoles = await RoleModel.find({ isSystem: true }).lean();
  const idByName = new Map(systemRoles.map((r) => [r.name, r._id]));
  if (idByName.size === 0) {
    console.warn("⚠ Tidak ada system role. Jalankan `npm run seed:roles` dulu.");
    return;
  }

  // Users tanpa link role-DB.
  const users = await UserModel.find({
    $or: [{ roleId: null }, { roleId: { $exists: false } }],
  });

  let fixed = 0;
  let skipped = 0;
  for (const u of users) {
    const roleId = idByName.get(u.role);
    if (!roleId) {
      console.warn(`  ⚠ skip ${u.email}: tidak ada system role bernama "${u.role}"`);
      skipped++;
      continue;
    }
    // u.set() instead of `u.roleId = roleId`: the schema infers roleId as the
    // ObjectId constructor type, which a direct assignment can't satisfy. Same
    // runtime effect (marks the path dirty so save() persists it).
    u.set("roleId", roleId);
    await u.save();
    console.log(`  ✓ ${u.email} (${u.role}) → roleId ${roleId.toString()}`);
    fixed++;
  }

  console.log(
    `\nSelesai. ${fixed} user di-backfill, ${skipped} dilewati, dari ${users.length} user tanpa roleId.`,
  );
}

run()
  .catch((error) => {
    console.error("Backfill user roleIds failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
