import type { PopulateOptions, Types } from "mongoose";
import { DetectionEventModel } from "../models/detectionEvent.model";

export type EventFilters = {
  cameraId?: string;
  cameraIds?: string[];
  status?: "unacknowledged" | "acknowledged" | "false_positive";
  checkName?: string;
  isViolation?: boolean;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
};

// Shared populate spec: camera -> section -> area. Used by list + getById so the
// enriched fields (cameraName, sectionCode, areaName, redZones...) come from one place.
const CAMERA_POPULATE: PopulateOptions = {
  path: "cameraId",
  select: "name code sectionId redZones",
  populate: {
    path: "sectionId",
    select: "name code areaId",
    populate: { path: "areaId", select: "name code" }
  }
};

// Build the Mongo query from event filters. Shared by listEvents + listEventsForExport.
function buildEventQuery(
  filters: Pick<EventFilters, "cameraId" | "cameraIds" | "status" | "checkName" | "isViolation" | "from" | "to">
): Record<string, unknown> {
  const { cameraId, cameraIds, status, checkName, isViolation, from, to } = filters;
  const query: Record<string, unknown> = {};
  if (cameraId) query.cameraId = cameraId;
  else if (cameraIds?.length) query.cameraId = { $in: cameraIds };
  if (status) query.status = status;
  if (checkName) query.checkResults = { $elemMatch: { check: checkName } };
  if (isViolation !== undefined) query.isViolation = isViolation;
  if (from || to) {
    query.detectedAt = {};
    if (from) (query.detectedAt as Record<string, unknown>).$gte = from;
    if (to) (query.detectedAt as Record<string, unknown>).$lte = to;
  }
  return query;
}

type PopulatedCamera = {
  _id: unknown; name?: string; code?: string;
  redZones?: Array<{ name: string; points: Array<{ x: number; y: number }> }>;
  sectionId?: { _id: unknown; name?: string; code?: string; areaId?: { _id: unknown; name?: string; code?: string } };
} | null;
type PopulatedModel = { _id: unknown; name?: string; code?: string } | null;

// Flatten a populated event's camera/section/area + model refs into the scalar
// fields the API returns. Shared by listEvents + getEventById.
function enrichEvent<T extends { cameraId: unknown; modelId: unknown }>(ev: T) {
  const cam = ev.cameraId as PopulatedCamera;
  const mdl = ev.modelId as PopulatedModel;
  const section = cam?.sectionId;
  const area = section?.areaId;
  return {
    ...ev,
    cameraId: cam?._id?.toString() ?? String(ev.cameraId),
    cameraName: cam?.name,
    cameraCode: cam?.code,
    sectionName: section?.name,
    sectionCode: section?.code,
    areaName: area?.name,
    areaCode: area?.code,
    modelId: mdl?._id?.toString() ?? String(ev.modelId),
    modelName: mdl?.name,
    redZones: cam?.redZones ?? []
  };
}

export async function listEvents(filters: EventFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  const skip = (page - 1) * limit;

  const query = buildEventQuery(filters);

  const [rawItems, total] = await Promise.all([
    DetectionEventModel.find(query)
      .populate(CAMERA_POPULATE)
      .populate("modelId", "name code")
      .sort({ detectedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    DetectionEventModel.countDocuments(query)
  ]);

  const items = rawItems.map(enrichEvent);

  return {
    items,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
}

export async function getEventById(id: string) {
  const raw = await DetectionEventModel.findById(id)
    .populate(CAMERA_POPULATE)
    .populate("modelId", "name code modelType")
    .populate("mappingId", "confidenceThreshold")
    .populate("acknowledgedBy", "name email")
    .lean();

  if (!raw) return null;

  return enrichEvent(raw);
}

export async function acknowledgeEvent(id: string, userId: Types.ObjectId | string) {
  return DetectionEventModel.findOneAndUpdate(
    { _id: id },
    { status: "acknowledged", acknowledgedBy: userId, acknowledgedAt: new Date() },
    { new: true }
  );
}

export async function acknowledgeAllEvents(
  userId: Types.ObjectId | string,
  cameraIds?: string[]
): Promise<number> {
  const filter: Record<string, unknown> = { status: "unacknowledged" };
  if (cameraIds?.length) filter.cameraId = { $in: cameraIds };
  const result = await DetectionEventModel.updateMany(
    filter,
    { status: "acknowledged", acknowledgedBy: userId, acknowledgedAt: new Date() }
  );
  return result.modifiedCount;
}

export async function markFalsePositive(id: string, userId: Types.ObjectId | string) {
  return DetectionEventModel.findOneAndUpdate(
    { _id: id },
    { status: "false_positive", acknowledgedBy: userId, acknowledgedAt: new Date() },
    { new: true }
  );
}

export async function deleteEvent(id: string) {
  return DetectionEventModel.findByIdAndDelete(id);
}

export async function listEventsForExport(filters: Omit<EventFilters, "page" | "limit">) {
  const query = buildEventQuery(filters);

  return DetectionEventModel.find(query)
    .populate<{ cameraId: { name: string; code: string } | null }>("cameraId", "name code")
    .populate<{ modelId: { name: string } | null }>("modelId", "name")
    .populate<{ acknowledgedBy: { name: string } | null }>("acknowledgedBy", "name")
    .sort({ detectedAt: -1 })
    .limit(5000)
    .lean();
}
