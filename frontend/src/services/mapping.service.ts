import { apiClient, unwrap } from "./api-client";
import type { SelectedCheck } from "../types/ai-model.types";

export type RoiPoint = { x: number; y: number };

// One handrail line (matches backend/AI proto `Polyline`). Stairs can have rails
// on multiple sides, so handrailLines is an array of these.
export type HandrailLine = { points: RoiPoint[] };

export type TimeRange = { start: string; end: string };

export type MappingSchedule = {
  type: "always" | "time_range";
  timeRanges: TimeRange[];
  daysOfWeek: number[];
};

export type GlobalCameraMapping = Omit<CameraMapping, "cameraId"> & {
  cameraId: { _id: string; code: string; name: string } | string;
};

export type CameraMapping = {
  _id: string;
  cameraId: string;
  modelId: { _id: string; code: string; name: string; defaultChecks: SelectedCheck[]; defaultConfThreshold: number } | string;
  isActive: boolean;
  selectedChecks: SelectedCheck[];
  roiPolygon: RoiPoint[];
  stairsZone: RoiPoint[];
  handrailLines: HandrailLine[];
  confidenceThreshold: number;
  schedule: MappingSchedule;
  picIds: Array<{ _id: string; name: string; email: string }>;
  captureInterval: number | null;
  createdAt: string;
  updatedAt: string;
};

export type MappingPayload = {
  modelId?: string;
  isActive?: boolean;
  selectedChecks?: SelectedCheck[];
  roiPolygon?: RoiPoint[];
  stairsZone?: RoiPoint[];
  handrailLines?: HandrailLine[];
  confidenceThreshold?: number;
  schedule?: MappingSchedule;
  picIds?: string[];
  captureInterval?: number | null;
};

export async function getAllMappings(): Promise<GlobalCameraMapping[]> {
  const res = await apiClient.get<{ success: boolean; data: GlobalCameraMapping[] }>("/camera-mappings");
  return unwrap(res);
}

export async function getMappings(cameraId: string): Promise<CameraMapping[]> {
  const res = await apiClient.get<{ success: boolean; data: CameraMapping[] }>(
    `/cameras/${cameraId}/mappings`
  );
  return unwrap(res);
}

export async function getMappingById(cameraId: string, mappingId: string): Promise<CameraMapping> {
  const res = await apiClient.get<{ success: boolean; data: CameraMapping }>(
    `/cameras/${cameraId}/mappings/${mappingId}`
  );
  return unwrap(res);
}

export async function createMapping(cameraId: string, payload: MappingPayload): Promise<CameraMapping> {
  const res = await apiClient.post<{ success: boolean; data: CameraMapping }>(
    `/cameras/${cameraId}/mappings`,
    payload
  );
  return unwrap(res);
}

export async function updateMapping(
  cameraId: string,
  mappingId: string,
  payload: MappingPayload
): Promise<CameraMapping> {
  const res = await apiClient.put<{ success: boolean; data: CameraMapping }>(
    `/cameras/${cameraId}/mappings/${mappingId}`,
    payload
  );
  return unwrap(res);
}

export async function deleteMapping(cameraId: string, mappingId: string): Promise<void> {
  await apiClient.delete(`/cameras/${cameraId}/mappings/${mappingId}`);
}

export async function toggleMapping(
  cameraId: string,
  mappingId: string,
  isActive: boolean
): Promise<CameraMapping> {
  const res = await apiClient.patch<{ success: boolean; data: CameraMapping }>(
    `/cameras/${cameraId}/mappings/${mappingId}/toggle`,
    { isActive }
  );
  return unwrap(res);
}
