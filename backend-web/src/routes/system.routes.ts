import { Router } from "express";
import { getSystemHealthController, systemStreamController } from "../controllers/system.controller";

export const systemRouter = Router();

systemRouter.get("/health", getSystemHealthController);
systemRouter.get("/stream", systemStreamController);
