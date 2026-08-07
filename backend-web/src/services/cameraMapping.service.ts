import { CameraMappingModel } from "../models/cameraMapping.model";

export type ScheduleInput = {
  type: "always" | "time_range";
  timeRanges?: Array<{ start: string; end: string }>;
  daysOfWeek?: number[];
};

type RoiPoint = { x: number; y: number };

export type CameraMappingInput = {
  modelId: string;
  isActive?: boolean;
  selectedChecks?: string[];
  roiPolygon?: RoiPoint[];
  stairsZone?: RoiPoint[];
  handrailLines?: Array<{ points: RoiPoint[] }>;
  confidenceThreshold?: number;
  schedule?: ScheduleInput;
  picIds?: string[];
  captureInterval?: number | null;
  zoneName?: string | null;
};

export type CameraMappingUpdateInput = Partial<CameraMappingInput>;

export async function listMappingsByCamera(cameraId: string) {
  return CameraMappingModel.find({ cameraId })
    .populate("modelId", "code name defaultChecks defaultConfThreshold")
    .populate("picIds", "name email")
    .sort({ createdAt: -1 });
}

export async function getMappingById(id: string) {
  return CameraMappingModel.findById(id)
    .populate("modelId", "code name defaultChecks defaultConfThreshold")
    .populate("picIds", "name email");
}

export async function createMapping(cameraId: string, input: CameraMappingInput) {
  return CameraMappingModel.create({ cameraId, ...input });
}

export async function updateMapping(id: string, input: CameraMappingUpdateInput) {
  return CameraMappingModel.findByIdAndUpdate(id, input, { new: true })
    .populate("modelId", "code name defaultChecks defaultConfThreshold")
    .populate("picIds", "name email");
}

export async function deleteMapping(id: string) {
  return CameraMappingModel.findByIdAndDelete(id);
}

export async function toggleMapping(id: string, isActive: boolean) {
  return CameraMappingModel.findByIdAndUpdate(id, { isActive }, { new: true })
    .populate("modelId", "code name defaultChecks defaultConfThreshold");
}

export async function listAllMappings() {
  return CameraMappingModel.find({})
    .populate("cameraId", "code name")
    .populate("modelId", "code name")
    .sort({ createdAt: -1 });
}

export async function getActiveMappingsForCamera(cameraId: string) {
  return CameraMappingModel.find({ cameraId, isActive: true })
    .populate("modelId")
    .populate("picIds", "name email");
}
