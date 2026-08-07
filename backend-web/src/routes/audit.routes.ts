import { Router } from "express";
import { listAuditLogsController } from "../controllers/audit.controller";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

export const auditRouter = Router();

auditRouter.use(requireAuth);
auditRouter.get("/", requireRole(["super_admin"]), listAuditLogsController);

