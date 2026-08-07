import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  getDashboardStats,
  getDashboardStatsForPic,
  getPicPerformance,
  getViolationsByCamera,
  getViolationsByType,
  getViolationsTrend
} from "../services/dashboard.service";
import { HttpError } from "../errors/httpError";
import { sendSuccess } from "../utils/apiResponse";

const daysQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).optional()
});

const trendQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7)
});

export async function getDashboardStatsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = req.user?.role === "pic" && req.user.picId
      ? await getDashboardStatsForPic(req.user.picId)
      : await getDashboardStats();
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function getViolationsTrendController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { days } = trendQuerySchema.parse(req.query);
    const data = await getViolationsTrend(days);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function getViolationsByTypeController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { days } = daysQuerySchema.parse(req.query);
    const data = await getViolationsByType(days);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function getPicPerformanceController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (req.user?.role !== "pic" || !req.user.picId) {
      throw new HttpError(403, "Endpoint only available for PIC accounts");
    }
    const { days } = trendQuerySchema.parse(req.query);
    const data = await getPicPerformance(req.user.picId, days);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function getViolationsByCameraController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { days } = daysQuerySchema.parse(req.query);
    const data = await getViolationsByCamera(days);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}
