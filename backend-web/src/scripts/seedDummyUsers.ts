import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectMongo } from "../config/mongo";
import { UserModel } from "../models/user.model";
import { RoleModel } from "../models/role.model";

async function seedDummyUsers(): Promise<void> {
  await connectMongo();

  // Resolve roleIds from the roles collection (seeded by seedSystemRoles.ts)
  const roles = await RoleModel.find({ isSystem: true }, { _id: 1, name: 1 }).lean();
  const roleIdMap = Object.fromEntries(roles.map((r) => [r.name, r._id]));

  if (roles.length === 0) {
    console.warn("⚠  No system roles found — run seedSystemRoles.ts first, then re-run this script.");
    console.warn("   Users will be seeded without roleId (fallback to default permissions).");
  }

  const users = [
    {
      name: "Super Admin",
      email: "superadmin@cctv.local",
      password: "SuperAdmin12345!",
      role: "super_admin" as const,
    },
    {
      name: "Admin",
      email: "admin@cctv.local",
      password: "Admin12345!",
      role: "admin" as const,
    },
    {
      name: "Guest Viewer",
      email: "guest@cctv.local",
      password: "Guest12345!",
      role: "viewer" as const,
    },
    {
      name: "Budi PIC",
      email: "pic@cctv.local",
      // password = name[0..2] + emailLocal[0..2] = "Bud" + "pic" = "Budpic"
      password: "Budpic",
      role: "pic" as const,
    },
  ];

  for (const item of users) {
    const passwordHash = await bcrypt.hash(item.password, 10);
    await UserModel.updateOne(
      { email: item.email },
      {
        $set: {
          name: item.name,
          role: item.role,
          roleId: roleIdMap[item.role] ?? null,
          passwordHash,
        },
      },
      { upsert: true },
    );
    const linked = roleIdMap[item.role] ? `roleId → ${item.role}` : "no roleId";
    console.log(`  ✓ ${item.email} (${linked})`);
  }

  console.log("\nCredentials:");
  console.log("  superadmin@cctv.local / SuperAdmin12345!");
  console.log("  admin@cctv.local      / Admin12345!");
  console.log("  guest@cctv.local      / Guest12345!");
  console.log("  pic@cctv.local        / Budpic");
}

seedDummyUsers()
  .catch((error) => {
    console.error("Seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
