import mongoose from "mongoose";
import { CameraModel } from "../models/camera.model";
import { DetectionEventModel } from "../models/detectionEvent.model";

export async function getDashboardStats() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - 6);

  const [
    totalCameras,
    activeCameras,
    onlineCameras,
    offlineCameras,
    eventsToday,
    eventsThisWeek,
    unacknowledged,
    violationsThisWeek,
    topViolations
  ] = await Promise.all([
    CameraModel.countDocuments(),
    CameraModel.countDocuments({ isActive: true }),
    CameraModel.countDocuments({ status: "online" }),
    CameraModel.countDocuments({ status: "offline" }),
    DetectionEventModel.countDocuments({ detectedAt: { $gte: startOfToday } }),
    DetectionEventModel.countDocuments({ detectedAt: { $gte: startOfWeek } }),
    DetectionEventModel.countDocuments({ status: "unacknowledged" }),
    DetectionEventModel.countDocuments({ isViolation: true, detectedAt: { $gte: startOfWeek } }),
    // Filter violation checks first ($filter avoids N-document explosion from $unwind)
    DetectionEventModel.aggregate([
      { $match: { isViolation: true, detectedAt: { $gte: startOfWeek } } },
      { $project: { violations: { $filter: { input: "$checkResults", as: "cr", cond: "$$cr.isViolation" } } } },
      { $unwind: "$violations" },
      { $group: { _id: "$violations.check", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      { $project: { _id: 0, checkName: "$_id", count: 1 } }
    ])
  ]);

  return {
    cameras: {
      total: totalCameras,
      active: activeCameras,
      online: onlineCameras,
      offline: offlineCameras
    },
    events: {
      today: eventsToday,
      thisWeek: eventsThisWeek,
      unacknowledged,
      violations: violationsThisWeek
    },
    topViolations
  };
}

// Local YYYY-MM-DD key (NOT toISOString — that converts to UTC and shifts the
// date back by the tz offset, so in WIB/UTC+7 "today" would key as yesterday).
function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Server tz offset as a Mongo `timezone` string (e.g. "+07:00"), so $dateToString
// buckets by the SAME local day as the labels above. Without this it buckets in
// UTC and the keys never match the labels → a flat zero trend line.
function serverTzOffset(): string {
  const off = -new Date().getTimezoneOffset(); // minutes; +420 for WIB
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

export async function getViolationsTrend(days = 7) {
  const labels: string[] = [];
  const dates: Date[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    labels.push(localDateKey(d));
    dates.push(d);
  }

  const from = dates[0];
  const to = new Date(dates[dates.length - 1]);
  to.setDate(to.getDate() + 1);

  // Count events (not individual checks) per day that had at least one violation
  const results = await DetectionEventModel.aggregate([
    { $match: { isViolation: true, detectedAt: { $gte: from, $lt: to } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$detectedAt", timezone: serverTzOffset() } },
        count: { $sum: 1 }
      }
    }
  ]);

  const countMap = new Map(results.map((r: { _id: string; count: number }) => [r._id, r.count]));
  const data = labels.map((label) => countMap.get(label) ?? 0);

  return { labels, data };
}

function sinceDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getViolationsByType(days?: number) {
  const match: Record<string, unknown> = { isViolation: true };
  if (days) match.detectedAt = { $gte: sinceDate(days) };

  return DetectionEventModel.aggregate([
    { $match: match },
    { $project: { violations: { $filter: { input: "$checkResults", as: "cr", cond: "$$cr.isViolation" } } } },
    { $unwind: "$violations" },
    { $group: { _id: "$violations.check", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
    { $project: { _id: 0, checkName: "$_id", count: 1 } }
  ]);
}

const URGENT_THRESHOLD_MIN = 30;

export async function getDashboardStatsForPic(picId: string) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const urgentCutoff = new Date(now.getTime() - URGENT_THRESHOLD_MIN * 60_000);

  const picObjectId = new mongoose.Types.ObjectId(picId);
  const cameraFilter = { defaultPicIds: picObjectId };

  const cameras = await CameraModel.find(cameraFilter, { _id: 1, isActive: 1, status: 1 }).lean();
  const cameraIds = cameras.map((c) => c._id);

  const [
    eventsToday,
    unacknowledged,
    urgent,
    acknowledgedToday,
  ] = await Promise.all([
    DetectionEventModel.countDocuments({ cameraId: { $in: cameraIds }, detectedAt: { $gte: startOfToday } }),
    DetectionEventModel.countDocuments({ cameraId: { $in: cameraIds }, status: "unacknowledged" }),
    DetectionEventModel.countDocuments({
      cameraId: { $in: cameraIds },
      status: "unacknowledged",
      detectedAt: { $lte: urgentCutoff },
    }),
    DetectionEventModel.countDocuments({
      cameraId: { $in: cameraIds },
      status: { $in: ["acknowledged", "false_positive"] },
      acknowledgedAt: { $gte: startOfToday },
    }),
  ]);

  const totalCameras = cameras.length;
  const activeCameras = cameras.filter((c) => c.isActive).length;
  const onlineCameras = cameras.filter((c) => (c as { status?: string }).status === "online").length;
  const offlineCameras = cameras.filter((c) => (c as { status?: string }).status === "offline").length;

  const ackRateToday = eventsToday > 0 ? Math.round((acknowledgedToday / eventsToday) * 100) : null;

  return {
    cameras: { total: totalCameras, active: activeCameras, online: onlineCameras, offline: offlineCameras },
    events: {
      today: eventsToday,
      thisWeek: 0,
      unacknowledged,
      violations: 0,
      urgent,
      acknowledgedToday,
      ackRateToday,
      urgentThresholdMinutes: URGENT_THRESHOLD_MIN,
    },
    topViolations: [] as Array<{ checkName: string; count: number }>,
  };
}

export async function getPicPerformance(picId: string, days = 7) {
  const picObjectId = new mongoose.Types.ObjectId(picId);
  const cameras = await CameraModel.find({ defaultPicIds: picObjectId }, { _id: 1 }).lean();
  const cameraIds = cameras.map((c) => c._id);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from = new Date(startOfToday);
  from.setDate(startOfToday.getDate() - (days - 1));

  // Compare current window vs previous equal-length window
  const prevFrom = new Date(from);
  prevFrom.setDate(prevFrom.getDate() - days);

  type Bucket = {
    _id: string;
    total: number;
    acknowledged: number;
    avgResponseMs: number | null;
  };

  const baseStages = (start: Date, end: Date) => [
    { $match: { cameraId: { $in: cameraIds }, detectedAt: { $gte: start, $lt: end } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$detectedAt" } },
        total: { $sum: 1 },
        acknowledged: {
          $sum: { $cond: [{ $in: ["$status", ["acknowledged", "false_positive"]] }, 1, 0] },
        },
        avgResponseMs: {
          $avg: {
            $cond: [
              { $and: [{ $ne: ["$acknowledgedAt", null] }, { $ne: ["$detectedAt", null] }] },
              { $subtract: ["$acknowledgedAt", "$detectedAt"] },
              null,
            ],
          },
        },
      },
    },
  ];

  const windowEnd = new Date(startOfToday);
  windowEnd.setDate(windowEnd.getDate() + 1);

  const [current, previous] = await Promise.all([
    DetectionEventModel.aggregate<Bucket>(baseStages(from, windowEnd)),
    DetectionEventModel.aggregate<Bucket>(baseStages(prevFrom, from)),
  ]);

  // Build daily labels & series for current window
  const labels: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(startOfToday);
    d.setDate(d.getDate() - i);
    labels.push(d.toISOString().slice(0, 10));
  }
  const currentMap = new Map(current.map((b) => [b._id, b]));
  const series = labels.map((l) => currentMap.get(l)?.total ?? 0);

  const sum = (arr: Bucket[], key: "total" | "acknowledged") =>
    arr.reduce((s, b) => s + (b[key] ?? 0), 0);

  const weightedAvg = (arr: Bucket[]) => {
    let totalMs = 0;
    let totalCount = 0;
    for (const b of arr) {
      if (b.avgResponseMs != null && b.acknowledged > 0) {
        totalMs += b.avgResponseMs * b.acknowledged;
        totalCount += b.acknowledged;
      }
    }
    return totalCount > 0 ? Math.round(totalMs / totalCount) : null;
  };

  const curTotal = sum(current, "total");
  const curAck = sum(current, "acknowledged");
  const prevTotal = sum(previous, "total");
  const prevAck = sum(previous, "acknowledged");

  const curAckRate = curTotal > 0 ? curAck / curTotal : null;
  const prevAckRate = prevTotal > 0 ? prevAck / prevTotal : null;
  const curAvgMs = weightedAvg(current);
  const prevAvgMs = weightedAvg(previous);

  const pctDelta = (cur: number | null, prev: number | null): number | null => {
    if (cur == null || prev == null || prev === 0) return null;
    return Math.round(((cur - prev) / prev) * 100);
  };

  return {
    days,
    range: { from: from.toISOString(), to: windowEnd.toISOString() },
    totals: { events: curTotal, acknowledged: curAck },
    ackRate: curAckRate,
    avgResponseMs: curAvgMs,
    trend: { labels, data: series },
    delta: {
      ackRatePct: pctDelta(curAckRate, prevAckRate),
      avgResponseMsPct: pctDelta(curAvgMs, prevAvgMs),
      eventsPct: pctDelta(curTotal, prevTotal),
    },
  };
}

export async function getViolationsByCamera(days?: number) {
  const match: Record<string, unknown> = { isViolation: true };
  if (days) match.detectedAt = { $gte: sinceDate(days) };

  return DetectionEventModel.aggregate([
    { $match: match },
    { $group: { _id: "$cameraId", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: "cameras",
        localField: "_id",
        foreignField: "_id",
        as: "camera"
      }
    },
    { $unwind: { path: "$camera", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        cameraId: "$_id",
        cameraName: { $ifNull: ["$camera.name", "Unknown"] },
        cameraCode: { $ifNull: ["$camera.code", ""] },
        count: 1
      }
    }
  ]);
}
