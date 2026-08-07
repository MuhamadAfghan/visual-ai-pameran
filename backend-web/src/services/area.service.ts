import { AreaModel } from "../models/area.model";
import { SectionModel } from "../models/section.model";
import { CameraModel } from "../models/camera.model";

export type AreaInput = {
  code: string;
  name: string;
  description?: string;
  location?: { lat: number; lng: number } | null;
  isActive?: boolean;
};

export async function listAreas(filters: { isActive?: boolean } = {}) {
  const query: Record<string, unknown> = {};
  if (filters.isActive !== undefined) query.isActive = filters.isActive;
  const areas = await AreaModel.find(query).sort({ createdAt: 1 }).lean();

  if (areas.length === 0) return areas;

  // Hitung section per area + kamera per area (lewat section)
  const areaIds = areas.map((a) => a._id);
  const sections = await SectionModel.find({ areaId: { $in: areaIds } }).select("_id areaId").lean();

  const sectionCountByArea = new Map<string, number>();
  const sectionIdsByArea = new Map<string, string[]>();
  for (const s of sections) {
    const aid = String(s.areaId);
    sectionCountByArea.set(aid, (sectionCountByArea.get(aid) ?? 0) + 1);
    const list = sectionIdsByArea.get(aid) ?? [];
    list.push(String(s._id));
    sectionIdsByArea.set(aid, list);
  }

  const cameraCounts = await CameraModel.aggregate([
    { $match: { sectionId: { $in: sections.map((s) => s._id) } } },
    { $group: { _id: "$sectionId", count: { $sum: 1 } } }
  ]);
  const cameraCountBySection = new Map(
    cameraCounts.map((r: { _id: unknown; count: number }) => [String(r._id), r.count])
  );

  return areas.map((a) => {
    const sectionIds = sectionIdsByArea.get(String(a._id)) ?? [];
    const cameraCount = sectionIds.reduce(
      (sum, sid) => sum + (cameraCountBySection.get(sid) ?? 0),
      0
    );
    return {
      ...a,
      sectionCount: sectionCountByArea.get(String(a._id)) ?? 0,
      cameraCount
    };
  });
}

export async function getAreaById(id: string) {
  return AreaModel.findById(id);
}

export async function createArea(input: AreaInput) {
  return AreaModel.create(input);
}

export async function updateArea(id: string, input: Partial<AreaInput>) {
  return AreaModel.findByIdAndUpdate(id, input, { new: true });
}

export async function deleteArea(id: string) {
  // Cascade: hapus semua section di area ini (lalu kamera-nya cascade lewat section)
  const area = await AreaModel.findByIdAndDelete(id);
  if (!area) return null;

  const sections = await SectionModel.find({ areaId: id }).select("_id").lean();
  const sectionIds = sections.map((s) => String(s._id));

  // Delete sections, lalu deleteCamerasBySection akan handle cascade kamera-mappings
  if (sectionIds.length > 0) {
    const { deleteSection } = await import("./section.service");
    for (const sid of sectionIds) {
      await deleteSection(sid);
    }
  }

  return area;
}
