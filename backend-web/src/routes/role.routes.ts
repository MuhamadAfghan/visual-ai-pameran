import { Router } from "express";
import {
  createRoleController,
  deleteRoleController,
  getRoleController,
  listRolesController,
  updateRoleController,
} from "../controllers/role.controller";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

export const roleRouter = Router();

roleRouter.use(requireAuth);
roleRouter.use(requireRole(["super_admin"]));

roleRouter.get("/", listRolesController);
roleRouter.post("/", createRoleController);
roleRouter.get("/:id", getRoleController);
roleRouter.put("/:id", updateRoleController);
roleRouter.delete("/:id", deleteRoleController);
