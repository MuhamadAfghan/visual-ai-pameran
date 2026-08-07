import mongoose from "mongoose";
import { CameraModel } from "../models/camera.model";
import { CameraMappingModel } from "../models/cameraMapping.model";
import { DetectionEventModel } from "../models/detectionEvent.model";
import { DetectionJobModel } from "../models/job.model";
import { SectionModel } from "../models/section.model";
import { HttpError } from "../errors/httpError";
import { deleteAllCameraSnapshots } from "../plugins/storage";
import { stopMonitoringHub } from "../plugins/cameraStreamHub";

type RedZoneInput = { name: string; points: Array<{ x: number; y: number }> };

export type CameraInput = {
  code: string;
  name: string;
  sourceType?: "rtsp" | "device";
  rtspUrl?: string;
  sectionId: string;
  brand?: string;
  minCaptureGapSeconds?: number;
  cooldownPeriod?: number;
  defaultPicIds?: string[];
  notes?: string;
  location?: { lat: number; lng: number } | null;
  isActive?: boolean;
  redZones?: RedZoneInput[];
};

export type CameraUpdateInput = Partial<CameraInput>;

export type CameraFilters = {
  sectionId?: string;
  status?: "online" | "offline" | "maintenance";
  isActive?: boolean;
  picId?: string;
};

const SECTION_POPULATE = {
  path: "sectionId",
  select: "code name areaId location",
  populate: { path: "areaId", select: "code name" }
};

export async function assertSectionExists(sectionId: string): Promise<void> {
  const exists = await SectionModel.exists({ _id: sectionId });
  if (!exists) throw new HttpError(400, "Section not found");
}

// Derive a human-readable camera code from its section + area, e.g. CAM-ASY-PLT-001.
export async function generateCameraCode(sectionId: string): Promise<string> {
  const section = await SectionModel.findById(sectionId).populate("areaId");
  if (!section) throw new HttpError(400, "Section not found");

  const secPart = section.code.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 3);
  const areaId = section.areaId as unknown as { code?: string } | null;
  const areaPart = areaId && typeof areaId === "object" && areaId.code
    ? areaId.code.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 3)
    : "XXX";

  const prefix = `CAM-${secPart}-${areaPart}-`;
  const count = await CameraModel.countDocuments({ code: { $regex: `^${prefix}` } });
  return `${prefix}${String(count + 1).padStart(3, "0")}`;
}

export async function listCameras(filters: CameraFilters = {}) {
  const match: Record<string, unknown> = {};
  if (filters.sectionId) match.sectionId = new mongoose.Types.ObjectId(filters.sectionId);
  if (filters.status) match.status = filters.status;
  if (filters.isActive !== undefined) match.isActive = filters.isActive;
  if (filters.picId) match.defaultPicIds = new mongoose.Types.ObjectId(filters.picId);

  const cameras = await CameraModel.find(match)
    .populate(SECTION_POPULATE)
    .populate("defaultPicIds", "name email")
    .sort({ createdAt: -1 })
    .lean();

  if (cameras.length === 0) return cameras;

  const cameraIds = cameras.map((c) => c._id);
  const counts = await CameraMappingModel.aggregate([
    { $match: { cameraId: { $in: cameraIds }, isActive: true } },
    { $group: { _id: "$cameraId", count: { $sum: 1 } } }
  ]);
  const countMap = new Map(counts.map((r: { _id: unknown; count: number }) => [String(r._id), r.count]));

  return cameras.map((c) => ({
    ...c,
    activeMappingCount: countMap.get(String(c._id)) ?? 0
  }));
}

export async function getCameraIdsByPicId(picId: string): Promise<string[]> {
  const cameras = await CameraModel.find(
    { defaultPicIds: picId },
    { _id: 1 }
  ).lean();
  return cameras.map((c) => String(c._id));
}

export async function getCameraById(id: string) {
  return CameraModel.findById(id)
    .populate(SECTION_POPULATE)
    .populate("defaultPicIds", "name email");
}

export async function createCamera(input: CameraInput) {
  return CameraModel.create(input);
}

export async function updateCamera(id: string, input: CameraUpdateInput) {
  return CameraModel.findByIdAndUpdate(id, input, { new: true })
    .populate(SECTION_POPULATE);
}

export async function deleteCamera(id: string) {
  const camera = await CameraModel.findByIdAndDelete(id);
  if (!camera) return null;

  stopMonitoringHub(id);
  const [mappingResult, eventResult, jobResult] = await Promise.all([
    CameraMappingModel.deleteMany({ cameraId: id }),
    DetectionEventModel.deleteMany({ cameraId: id }),
    DetectionJobModel.deleteMany({ cameraId: id })
  ]);

  await deleteAllCameraSnapshots(id).catch((err) => {
    console.warn(`[deleteCamera] Snapshot cleanup failed for ${id}:`, err);
  });

  console.info(
    `[deleteCamera] ${id} cascade: ${mappingResult.deletedCount} mappings, ${eventResult.deletedCount} events, ${jobResult.deletedCount} jobs`
  );

  return camera;
}

export async function updateCameraStatus(
  id: string,
  status: "online" | "offline" | "maintenance"
) {
  return CameraModel.findByIdAndUpdate(
    id,
    { status, lastCaptureAt: status === "online" ? new Date() : undefined },
    { new: true }
  );
}
