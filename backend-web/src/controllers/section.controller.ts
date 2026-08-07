import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../errors/httpError";
import { AreaModel } from "../models/area.model";
import {
  createSection,
  deleteSection,
  getSectionById,
  listSections,
  updateSection
} from "../services/section.service";
import { sendSuccess } from "../utils/apiResponse";
import { idParamSchema } from "../utils/validation";

const sectionPayloadSchema = z.object({
  areaId: z.string().min(1, "areaId wajib diisi"),
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().optional().default(""),
  isActive: z.boolean().optional().default(true),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180)
  }).nullable().optional()
});

const sectionUpdateSchema = sectionPayloadSchema.partial();

const sectionListQuerySchema = z.object({
  areaId: z.string().optional(),
  isActive: z.string().optional().transform((v) => (v === undefined ? undefined : v === "true"))
});

async function assertAreaExists(areaId: string): Promise<void> {
  const exists = await AreaModel.exists({ _id: areaId });
  if (!exists) throw new HttpError(400, "Area not found");
}

export async function listSectionsController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filters = sectionListQuerySchema.parse(req.query);
    sendSuccess(res, await listSections(filters));
  } catch (error) {
    next(error);
  }
}

export async function getSectionByIdController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = await getSectionById(id);
    if (!data) throw new HttpError(404, "Section not found");
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function createSectionController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = sectionPayloadSchema.parse(req.body);
    await assertAreaExists(payload.areaId);
    sendSuccess(res, await createSection(payload), 201);
  } catch (error) {
    next(error);
  }
}

export async function updateSectionController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const payload = sectionUpdateSchema.parse(req.body);
    if (payload.areaId) await assertAreaExists(payload.areaId);
    const data = await updateSection(id, payload);
    if (!data) throw new HttpError(404, "Section not found");
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function deleteSectionController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = await deleteSection(id);
    if (!data) throw new HttpError(404, "Section not found");
    sendSuccess(res, { message: "Section deleted (including all cameras under it)" });
  } catch (error) {
    next(error);
  }
}
