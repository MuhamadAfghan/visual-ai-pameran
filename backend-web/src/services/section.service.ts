import { SectionModel } from "../models/section.model";
import { CameraModel } from "../models/camera.model";
import { deleteCamera } from "./camera.service";

export type SectionInput = {
  areaId: string;
  code: string;
  name: string;
  description?: string;
  isActive?: boolean;
};

export async function listSections(filters: { areaId?: string; isActive?: boolean } = {}) {
  const query: Record<string, unknown> = {};
  if (filters.areaId) query.areaId = filters.areaId;
  if (filters.isActive !== undefined) query.isActive = filters.isActive;

  const sections = await SectionModel.find(query)
    .populate("areaId", "code name")
    .sort({ createdAt: 1 })
    .lean();

  if (sections.length === 0) return sections;

  const counts = await CameraModel.aggregate([
    { $match: { sectionId: { $in: sections.map((s) => s._id) } } },
    { $group: { _id: "$sectionId", count: { $sum: 1 } } }
  ]);
  const countMap = new Map(counts.map((r: { _id: unknown; count: number }) => [String(r._id), r.count]));

  return sections.map((s) => ({ ...s, cameraCount: countMap.get(String(s._id)) ?? 0 }));
}

export async function getSectionById(id: string) {
  return SectionModel.findById(id).populate("areaId", "code name");
}

export async function createSection(input: SectionInput) {
  return SectionModel.create(input);
}

export async function updateSection(id: string, input: Partial<SectionInput>) {
  return SectionModel.findByIdAndUpdate(id, input, { new: true }).populate("areaId", "code name");
}

export async function deleteSection(id: string) {
  // Cascade: hapus semua kamera di section ini (deleteCamera handle cascade ke mapping/event/job)
  const cameras = await CameraModel.find({ sectionId: id }).select("_id").lean();
  for (const cam of cameras) {
    await deleteCamera(String(cam._id));
  }

  return SectionModel.findByIdAndDelete(id);
}
