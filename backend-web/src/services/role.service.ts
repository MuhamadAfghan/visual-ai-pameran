import { RoleModel } from "../models/role.model";
import { UserModel } from "../models/user.model";
import { HttpError } from "../errors/httpError";
import { invalidateRolePermCache } from "./roleCache.service";
import type { ModulePermission } from "../types/auth";

type CreateRoleInput = {
  name: string;
  description?: string;
  permissions: ModulePermission[];
};

type UpdateRoleInput = {
  name?: string;
  description?: string;
  permissions?: ModulePermission[];
};

export async function listRoles() {
  return RoleModel.find({}).sort({ isSystem: -1, name: 1 }).lean();
}

export async function getRoleById(id: string) {
  return RoleModel.findById(id).lean();
}

export async function createRole(input: CreateRoleInput) {
  return RoleModel.create({ ...input, isSystem: false });
}

export async function updateRole(id: string, input: UpdateRoleInput) {
  const role = await RoleModel.findById(id);
  if (!role) throw new HttpError(404, "Role not found");
  if (role.isSystem && input.name && input.name !== role.name) {
    throw new HttpError(400, "Cannot rename a system role");
  }

  const updated = await RoleModel.findByIdAndUpdate(id, input, { new: true });
  await invalidateRolePermCache(id);
  return updated;
}

export async function deleteRole(id: string) {
  const role = await RoleModel.findById(id);
  if (!role) throw new HttpError(404, "Role not found");
  if (role.isSystem) throw new HttpError(400, "Cannot delete a system role");

  const usersAssigned = await UserModel.countDocuments({ roleId: id });
  if (usersAssigned > 0) {
    throw new HttpError(409, `Cannot delete: ${usersAssigned} user(s) are assigned this role`);
  }

  await RoleModel.findByIdAndDelete(id);
  await invalidateRolePermCache(id);
}
