import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../errors/httpError";
import {
  createPicWithAccount,
  deletePicWithAccount,
  getPicById,
  listPics,
  resetPicPassword,
  updatePicWithAccount,
} from "../services/pic.service";
import { sendSuccess } from "../utils/apiResponse";
import { idParamSchema } from "../utils/validation";

const picPayloadSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
  modelTypes: z.array(z.string()).optional().default([]),
  subscribedChecks: z.array(z.string()).optional().default([]),
  isActive: z.boolean().optional().default(true),
});

const picUpdateSchema = picPayloadSchema.partial();

export async function listPicsController(
  _req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    sendSuccess(res, await listPics());
  } catch (error) {
    next(error);
  }
}

export async function getPicByIdController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = await getPicById(id);
    if (!data) throw new HttpError(404, "PIC not found");
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function createPicController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const payload = picPayloadSchema.parse(req.body);
    const { pic, plainPassword } = await createPicWithAccount(payload);
    sendSuccess(res, { ...pic, plainPassword }, 201);
  } catch (error) {
    next(error);
  }
}

export async function updatePicController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const payload = picUpdateSchema.parse(req.body);
    const { pic, plainPassword } = await updatePicWithAccount(id, payload);
    if (!pic) throw new HttpError(404, "PIC not found");
    const body = plainPassword ? { ...pic, plainPassword } : { ...pic };
    sendSuccess(res, body);
  } catch (error) {
    next(error);
  }
}

export async function deletePicController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = await deletePicWithAccount(id);
    if (!data) throw new HttpError(404, "PIC not found");
    sendSuccess(res, { message: "PIC deleted" });
  } catch (error) {
    next(error);
  }
}

export async function resetPicPasswordController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const result = await resetPicPassword(id);
    if (!result) throw new HttpError(404, "PIC not found or has no account");
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}
