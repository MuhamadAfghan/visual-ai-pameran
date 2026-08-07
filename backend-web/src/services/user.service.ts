import bcrypt from "bcryptjs";
import { UserModel } from "../models/user.model";
import type { UserRole } from "../types/auth";
import { setUserRoleCache } from "./roleCache.service";

type CreateUserInput = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  isActive?: boolean;
  roleId?: string;
};

type UpdateUserInput = {
  name?: string;
  email?: string;
  role?: UserRole;
  isActive?: boolean;
  password?: string;
  roleId?: string | null;
};

const SAFE_PROJECTION = { passwordHash: 0, passwordResetTokenHash: 0, passwordResetExpiresAt: 0 };

export async function listUsers() {
  return UserModel.find({}, SAFE_PROJECTION)
    .populate("roleId", "name")
    .sort({ createdAt: -1 });
}

export async function getUserById(userId: string) {
  return UserModel.findById(userId, SAFE_PROJECTION).populate("roleId", "name");
}

export async function createUser(input: CreateUserInput) {
  const passwordHash = await bcrypt.hash(input.password, 10);
  const created = await UserModel.create({
    name: input.name,
    email: input.email,
    passwordHash,
    role: input.role,
    roleId: input.roleId ?? null,
    isActive: input.isActive ?? true,
  });
  return UserModel.findById(created._id, SAFE_PROJECTION).populate("roleId", "name");
}

export async function updateUser(userId: string, input: UpdateUserInput) {
  const updateData: Record<string, unknown> = { ...input };
  if (input.password) {
    updateData.passwordHash = await bcrypt.hash(input.password, 10);
    delete updateData.password;
  }
  await UserModel.findByIdAndUpdate(userId, updateData);
  if ("roleId" in input) {
    await setUserRoleCache(userId, input.roleId?.toString() ?? null);
  }
  return UserModel.findById(userId, SAFE_PROJECTION).populate("roleId", "name");
}

export async function deleteUser(userId: string) {
  return UserModel.findByIdAndDelete(userId);
}

export async function setUserActivation(userId: string, isActive: boolean) {
  return UserModel.findByIdAndUpdate(userId, { isActive }, { new: true, projection: { passwordHash: 0, passwordResetTokenHash: 0 } });
}

