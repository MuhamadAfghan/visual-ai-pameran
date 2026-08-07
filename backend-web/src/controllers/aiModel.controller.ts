import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../errors/httpError";
import {
  createAiModel,
  deleteAiModel,
  getAiModelById,
  listAiModels,
  updateAiModel,
  SELECTED_CHECKS
} from "../services/aiModel.service";
import { sendSuccess } from "../utils/apiResponse";
import { idParamSchema } from "../utils/validation";
import { logAuditEvent } from "../services/audit.service";

const aiModelPayloadSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().optional().default(""),
  defaultChecks: z.array(z.enum(SELECTED_CHECKS)).optional().default([]),
  defaultConfThreshold: z.number().min(0).max(1).optional().default(0.25),
  version: z.string().trim().optional().default("1.0.0"),
  isActive: z.boolean().optional().default(true)
});

const aiModelUpdateSchema = aiModelPayloadSchema.partial();

export async function listAiModelsController(
  _req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    sendSuccess(res, await listAiModels());
  } catch (error) {
    next(error);
  }
}

export async function getAiModelByIdController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = await getAiModelById(id);
    if (!data) throw new HttpError(404, "AI model not found");
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function createAiModelController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const payload = aiModelPayloadSchema.parse(req.body);
    sendSuccess(res, await createAiModel(payload), 201);
  } catch (error) {
    next(error);
  }
}

export async function updateAiModelController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const payload = aiModelUpdateSchema.parse(req.body);
    const data = await updateAiModel(id, payload);
    if (!data) throw new HttpError(404, "AI model not found");
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function deleteAiModelController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = await deleteAiModel(id);
    if (!data) throw new HttpError(404, "AI model not found");
    logAuditEvent({
      actorUserId: req.user!.id,
      actorEmail: req.user!.email,
      action: "ai_model.delete",
      targetType: "AiModel",
      targetId: id,
      ipAddress: req.ip,
      metadata: { name: (data as { name?: string }).name, code: (data as { code?: string }).code }
    }).catch(() => {});
    sendSuccess(res, { message: "AI model deleted" });
  } catch (error) {
    next(error);
  }
}

export async function listSelectedChecksController(
  _req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    sendSuccess(res, SELECTED_CHECKS);
  } catch (error) {
    next(error);
  }
}
