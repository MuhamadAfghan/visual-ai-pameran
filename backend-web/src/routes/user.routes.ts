import { Router } from "express";
import {
  createUserController,
  deleteUserController,
  getUserByIdController,
  listUsersController,
  setUserActivationController,
  updateUserController,
} from "../controllers/user.controller";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

export const userRouter = Router();

userRouter.use(requireAuth);
userRouter.get("/", requireRole(["super_admin", "admin"]), listUsersController);
userRouter.get("/:id", requireRole(["super_admin"]), getUserByIdController);
userRouter.post("/", requireRole(["super_admin"]), createUserController);
userRouter.patch("/:id", requireRole(["super_admin"]), updateUserController);
userRouter.patch("/:id/activation", requireRole(["super_admin", "admin"]), setUserActivationController);
userRouter.delete("/:id", requireRole(["super_admin"]), deleteUserController);

