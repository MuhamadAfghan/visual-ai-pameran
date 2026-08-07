import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../errors/httpError";
import { createArea, deleteArea, getAreaById, listAreas, updateArea } from "../services/area.service";
import { sendSuccess } from "../utils/apiResponse";
import { idParamSchema } from "../utils/validation";

const areaPayloadSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().optional().default(""),
  location: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .nullable()
    .optional(),
  isActive: z.boolean().optional().default(true)
});

const areaUpdateSchema = areaPayloadSchema.partial();

const areaListQuerySchema = z.object({
  isActive: z.string().optional().transform((v) => (v === undefined ? undefined : v === "true"))
});

export async function listAreasController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filters = areaListQuerySchema.parse(req.query);
    sendSuccess(res, await listAreas(filters));
  } catch (error) {
    next(error);
  }
}

export async function getAreaByIdController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = await getAreaById(id);
    if (!data) throw new HttpError(404, "Area not found");
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function createAreaController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = areaPayloadSchema.parse(req.body);
    sendSuccess(res, await createArea(payload), 201);
  } catch (error) {
    next(error);
  }
}

export async function updateAreaController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const payload = areaUpdateSchema.parse(req.body);
    const data = await updateArea(id, payload);
    if (!data) throw new HttpError(404, "Area not found");
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function deleteAreaController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = await deleteArea(id);
    if (!data) throw new HttpError(404, "Area not found");
    sendSuccess(res, { message: "Area deleted (including all sections and cameras)" });
  } catch (error) {
    next(error);
  }
}
