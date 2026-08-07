import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../errors/httpError";
import { SELECTED_CHECKS } from "../models/aiModel.model";
import {
  createMapping,
  deleteMapping,
  getMappingById,
  listAllMappings,
  listMappingsByCamera,
  toggleMapping,
  updateMapping
} from "../services/cameraMapping.service";
import { sendSuccess } from "../utils/apiResponse";
import { logAuditEvent } from "../services/audit.service";

const cameraIdParamSchema = z.object({ cameraId: z.string().min(1) });
const mappingIdParamSchema = z.object({ cameraId: z.string().min(1), mappingId: z.string().min(1) });

const timeRangeSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/, "Format harus HH:MM"),
  end: z.string().regex(/^\d{2}:\d{2}$/, "Format harus HH:MM")
});

const scheduleSchema = z.object({
  type: z.enum(["always", "time_range"]),
  timeRanges: z.array(timeRangeSchema).optional().default([]),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional().default([])
});

const roiPointSchema = z.object({
  x: z.number(),
  y: z.number()
});

// One handrail line (matches AI proto `Polyline`).
const polylineSchema = z.object({
  points: z.array(roiPointSchema).default([])
});

const mappingPayloadSchema = z.object({
  modelId: z.string().min(1),
  isActive: z.boolean().optional().default(true),
  selectedChecks: z.array(z.enum(SELECTED_CHECKS)).min(1, "Pilih minimal 1 check untuk mapping ini"),
  roiPolygon: z.array(roiPointSchema).optional().default([]),
  stairsZone: z.array(roiPointSchema).optional().default([]),
  handrailLines: z.array(polylineSchema).optional().default([]),
  confidenceThreshold: z.number().min(0).max(1).optional().default(0.5),
  schedule: scheduleSchema.optional().default({ type: "always", timeRanges: [], daysOfWeek: [] }),
  picIds: z.array(z.string()).optional().default([]),
  zoneName: z.string().trim().nullable().optional().default(null)
});

const mappingUpdateSchema = mappingPayloadSchema.partial();

const toggleSchema = z.object({ isActive: z.boolean() });

export async function listAllMappingsController(
  _req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    sendSuccess(res, await listAllMappings());
  } catch (error) {
    next(error);
  }
}

export async function listMappingsController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { cameraId } = cameraIdParamSchema.parse(req.params);
    sendSuccess(res, await listMappingsByCamera(cameraId));
  } catch (error) {
    next(error);
  }
}

export async function getMappingByIdController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { mappingId } = mappingIdParamSchema.parse(req.params);
    const data = await getMappingById(mappingId);
    if (!data) throw new HttpError(404, "Mapping not found");
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function createMappingController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { cameraId } = cameraIdParamSchema.parse(req.params);
    const payload = mappingPayloadSchema.parse(req.body);
    sendSuccess(res, await createMapping(cameraId, payload), 201);
  } catch (error) {
    next(error);
  }
}

export async function updateMappingController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { mappingId } = mappingIdParamSchema.parse(req.params);
    const payload = mappingUpdateSchema.parse(req.body);
    const data = await updateMapping(mappingId, payload);
    if (!data) throw new HttpError(404, "Mapping not found");
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function deleteMappingController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { cameraId, mappingId } = mappingIdParamSchema.parse(req.params);
    const data = await deleteMapping(mappingId);
    if (!data) throw new HttpError(404, "Mapping not found");
    logAuditEvent({
      actorUserId: req.user!.id,
      actorEmail: req.user!.email,
      action: "mapping.delete",
      targetType: "CameraMapping",
      targetId: mappingId,
      ipAddress: req.ip,
      metadata: { cameraId }
    }).catch(() => {});
    sendSuccess(res, { message: "Mapping deleted" });
  } catch (error) {
    next(error);
  }
}

export async function toggleMappingController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { mappingId } = mappingIdParamSchema.parse(req.params);
    const { isActive } = toggleSchema.parse(req.body);
    const data = await toggleMapping(mappingId, isActive);
    if (!data) throw new HttpError(404, "Mapping not found");
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}
