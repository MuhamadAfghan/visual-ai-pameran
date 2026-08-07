import { Router } from "express";
import {
  changePasswordController,
  forgotPasswordController,
  getMeController,
  loginAsGuestController,
  loginController,
  resetPasswordController,
  updateMeController
} from "../controllers/auth.controller";
import { authRateLimit } from "../middleware/authRateLimit";
import { requireAuth } from "../middleware/requireAuth";

export const authRouter = Router();

authRouter.post("/login", authRateLimit, loginController);
authRouter.post("/guest", authRateLimit, loginAsGuestController);
authRouter.post("/forgot-password", authRateLimit, forgotPasswordController);
authRouter.post("/reset-password", authRateLimit, resetPasswordController);
authRouter.post("/change-password", requireAuth, authRateLimit, changePasswordController);
authRouter.get("/me", requireAuth, getMeController);
authRouter.patch("/me", requireAuth, updateMeController);
