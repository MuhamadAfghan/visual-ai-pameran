import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { HttpError } from "../errors/httpError";
import { createAndQueueDetectionJob, findDetectionJobById, getQueueStats, listDetectionJobs } from "../services/job.service";
import { sendSuccess } from "../utils/apiResponse";
import { pageSchema } from "../utils/validation";

const listQuerySchema = z.object({
  page: pageSchema,
  limit: z.coerce.number().int().positive().max(200).default(50)
});

const createJobSchema = z.object({
  cameraId: z.string().min(1, "cameraId wajib diisi"),
  selectedChecks: z.array(z.string().min(1)).min(1, "selectedChecks minimal 1 item")
});

export async function getDetectionJobController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await findDetectionJobById(req.params.id);
    if (!data) {
      throw new HttpError(404, "Job not found");
    }

    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function listDetectionJobsController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = listQuerySchema.parse(req.query);
    const data = await listDetectionJobs({ page, limit });
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function getQueueStatsController(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await getQueueStats();
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function createDetectionJobController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { cameraId, selectedChecks } = createJobSchema.parse(req.body);
    const data = await createAndQueueDetectionJob({ cameraId, selectedChecks });
    sendSuccess(res, data, 202);
  } catch (error) {
    next(error);
  }
}
