import fs from "node:fs";
import path from "node:path";
import type { Request, Response, NextFunction } from "express";
import ExcelJS from "exceljs";
import { z } from "zod";
import { HttpError } from "../errors/httpError";
import { initViolationSubscriber, violationEmitter } from "../plugins/eventBus";
import { deleteSnapshot } from "../plugins/storage";
import {
  acknowledgeAllEvents,
  acknowledgeEvent,
  deleteEvent,
  getEventById,
  listEvents,
  listEventsForExport,
  markFalsePositive
} from "../services/event.service";
import { sendSuccess } from "../utils/apiResponse";
import { idParamSchema, pageSchema } from "../utils/validation";
import { logAuditEvent } from "../services/audit.service";
import { env } from "../config/env";
import { getCameraIdsByPicId } from "../services/camera.service";

const eventQuerySchema = z.object({
  cameraId: z.string().optional(),
  status: z.enum(["unacknowledged", "acknowledged", "false_positive"]).optional(),
  checkName: z.string().optional(),
  isViolation: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  from: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  to: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  page: pageSchema,
  limit: z.coerce.number().int().positive().max(100).default(20)
});

export async function listEventsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const filters = eventQuerySchema.parse(req.query);
    if (req.user?.role === "pic") {
      if (!req.user.picId) { sendSuccess(res, { items: [], total: 0, page: 1, totalPages: 0 }); return; }
      (filters as Record<string, unknown>).cameraIds = await getCameraIdsByPicId(req.user.picId);
    }
    const data = await listEvents(filters);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function getEventByIdController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = await getEventById(id);
    if (!data) throw new HttpError(404, "Event not found");
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function acknowledgeEventController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const userId = req.user!.id;
    const data = await acknowledgeEvent(id, userId);
    if (!data) throw new HttpError(404, "Event not found");
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function acknowledgeAllEventsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;
    let cameraIds: string[] | undefined;

    if (req.user?.role === "pic") {
      if (!req.user.picId) {
        sendSuccess(res, { acknowledged: 0 });
        return;
      }
      cameraIds = await getCameraIdsByPicId(req.user.picId);
    }

    const acknowledged = await acknowledgeAllEvents(userId, cameraIds);
    sendSuccess(res, { acknowledged });
  } catch (error) {
    next(error);
  }
}

export async function markFalsePositiveController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const userId = req.user!.id;
    const data = await markFalsePositive(id, userId);
    if (!data) throw new HttpError(404, "Event not found");
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function getEventSnapshotController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = await getEventById(id);
    if (!data) throw new HttpError(404, "Event not found");

    // `original` = raw capture (frontend draws its own bbox overlay on top);
    // default (annotated, bbox baked into the JPEG) is for email/export only.
    const wantsOriginal = req.query.variant === "original";
    const snapshotUrl = (wantsOriginal ? data.originalSnapshotUrl : data.snapshotUrl) as string | null;
    if (!snapshotUrl) throw new HttpError(404, "No snapshot available");

    const storageBase = env.STORAGE_BASE_URL;
    if (snapshotUrl.startsWith(storageBase)) {
      const relPath = snapshotUrl.slice(storageBase.length).replace(/^\//, "");
      const absPath = path.resolve(env.STORAGE_BASE_PATH, relPath);
      if (!fs.existsSync(absPath)) throw new HttpError(404, "Snapshot file not found");
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=300");
      // Buffered readFile (not createReadStream.pipe): opens/closes the fd quickly
      // and surfaces errors as a catchable rejection. An unhandled stream 'error'
      // (e.g. EMFILE — too many open files) would otherwise crash the whole process.
      res.end(await fs.promises.readFile(absPath));
      return;
    }

    res.redirect(302, snapshotUrl);
  } catch (error) {
    next(error);
  }
}

export async function deleteEventController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = await deleteEvent(id);
    if (!data) throw new HttpError(404, "Event not found");
    if (data.snapshotPath) {
      await deleteSnapshot(data.snapshotPath as string);
    }
    logAuditEvent({
      actorUserId: req.user!.id,
      actorEmail: req.user!.email,
      action: "event.delete",
      targetType: "DetectionEvent",
      targetId: id,
      ipAddress: req.ip,
      metadata: { cameraId: data.cameraId?.toString(), detectedAt: data.detectedAt }
    }).catch(() => {});
    sendSuccess(res, { message: "Event deleted" });
  } catch (error) {
    next(error);
  }
}

export function sseStreamController(req: Request, res: Response): void {
  initViolationSubscriber();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  // Initial connected event
  res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);

  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 25_000);

  const handler = (message: string) => {
    res.write(`event: violation\ndata: ${message}\n\n`);
  };

  violationEmitter.on("violation", handler);

  req.on("close", () => {
    clearInterval(heartbeat);
    violationEmitter.off("violation", handler);
  });
}

export async function exportEventsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const filters = eventQuerySchema.omit({ page: true, limit: true }).parse(req.query);
    const events = await listEventsForExport(filters);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Lumicore CCTV System";
    wb.created = new Date();

    const ws = wb.addWorksheet("Detection Events");

    ws.columns = [
      { header: "No", key: "no", width: 6 },
      { header: "Waktu Deteksi", key: "detectedAt", width: 22 },
      { header: "Kamera", key: "camera", width: 22 },
      { header: "Kode Kamera", key: "cameraCode", width: 16 },
      { header: "Pelanggaran", key: "violations", width: 40 },
      { header: "Checks (semua)", key: "allChecks", width: 40 },
      { header: "Ada Pelanggaran", key: "isViolation", width: 14 },
      { header: "Status", key: "status", width: 16 },
      { header: "Diakui Oleh", key: "acknowledgedBy", width: 20 },
      { header: "Diakui Pada", key: "acknowledgedAt", width: 22 },
      { header: "Snapshot URL", key: "snapshotUrl", width: 50 }
    ];

    // Header row styling
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 20;

    events.forEach((ev, idx) => {
      const camera = ev.cameraId as { name?: string; code?: string } | null;
      const acknowledgedBy = ev.acknowledgedBy as { name?: string } | null;
      const checkResults = (ev.checkResults ?? []) as Array<{
        check: string;
        confidence: number;
        isViolation: boolean;
      }>;

      const violationChecks = checkResults
        .filter((cr) => cr.isViolation)
        .map((cr) => `${cr.check.replace(/_/g, " ")} (${(cr.confidence * 100).toFixed(1)}%)`)
        .join(", ");

      const allChecks = checkResults
        .map((cr) => cr.check.replace(/_/g, " "))
        .join(", ");

      ws.addRow({
        no: idx + 1,
        detectedAt: ev.detectedAt
          ? new Date(ev.detectedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
          : "",
        camera: camera?.name ?? "",
        cameraCode: camera?.code ?? "",
        violations: violationChecks || "-",
        allChecks,
        isViolation: ev.isViolation ? "Ya" : "Tidak",
        status: ev.status ?? "",
        acknowledgedBy: acknowledgedBy?.name ?? "",
        acknowledgedAt: ev.acknowledgedAt
          ? new Date(ev.acknowledgedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
          : "",
        snapshotUrl: ev.snapshotUrl ?? ""
      });
    });

    // Alternating row colors
    ws.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && rowNumber % 2 === 0) {
        row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F4F8" } };
      }
    });

    const filename = `events-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    await wb.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
}
