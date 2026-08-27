import { apiClient, unwrap } from "./api-client";
import type { Camera } from "../types/camera.types";
import type { Detection } from "../types/event.types";

type CameraFilters = {
  sectionId?: string;
  status?: string;
  isActive?: boolean;
};

export async function getCameras(filters?: CameraFilters): Promise<Camera[]> {
  const q = new URLSearchParams();
  if (filters?.sectionId) q.set("sectionId", filters.sectionId);
  if (filters?.status) q.set("status", filters.status);
  if (filters?.isActive !== undefined) q.set("isActive", String(filters.isActive));
  const res = await apiClient.get<{ success: boolean; data: Camera[] }>(`/cameras?${q}`);
  return unwrap(res);
}

export async function getCameraById(id: string): Promise<Camera> {
  const res = await apiClient.get<{ success: boolean; data: Camera }>(`/cameras/${id}`);
  return unwrap(res);
}

export type CameraPayload = {
  code?: string;
  name?: string;
  sectionId?: string;
  sourceType?: "rtsp" | "device";
  rtspUrl?: string;
  brand?: string;
  minCaptureGapSeconds?: number;
  cooldownPeriod?: number;
  crowdThreshold?: number | null;
  defaultPicIds?: string[];
  notes?: string;
  isActive?: boolean;
};

export async function createCamera(payload: CameraPayload): Promise<Camera> {
  const res = await apiClient.post<{ success: boolean; data: Camera }>("/cameras", payload);
  return unwrap(res);
}

export async function updateCamera(id: string, payload: CameraPayload): Promise<Camera> {
  const res = await apiClient.put<{ success: boolean; data: Camera }>(`/cameras/${id}`, payload);
  return unwrap(res);
}

export async function deleteCamera(id: string): Promise<void> {
  await apiClient.delete(`/cameras/${id}`);
}

export async function testCameraConnection(
  id: string
): Promise<{ online: boolean; snapshotBase64?: string; message: string }> {
  const res = await apiClient.post<{
    success: boolean;
    data: { online: boolean; snapshotBase64?: string; message: string };
  }>(`/cameras/${id}/test-connection`);
  return unwrap(res);
}

export async function pushFrame(
  cameraId: string,
  imageBase64: string
): Promise<{ eventIds: string[]; hasAnyViolation: boolean }> {
  const res = await apiClient.post<{
    success: boolean;
    data: { eventIds: string[]; hasAnyViolation: boolean };
  }>(`/cameras/${cameraId}/push-frame`, { imageBase64 });
  return unwrap(res);
}

export async function suggestCameraCode(sectionId: string): Promise<string> {
  const res = await apiClient.get<{ success: boolean; data: { code: string } }>(
    `/cameras/suggest-code?sectionId=${encodeURIComponent(sectionId)}`
  );
  return unwrap(res).code;
}

export async function testCameraUrl(
  rtspUrl: string,
  signal?: AbortSignal
): Promise<{ online: boolean; snapshotBase64?: string; message: string }> {
  const res = await apiClient.post<{
    success: boolean;
    data: { online: boolean; snapshotBase64?: string; message: string };
  }>("/cameras/test-url", { rtspUrl }, { signal });
  return unwrap(res);
}

// Per-check aggregate for the live overlay (raw AI shape: no isViolation flag —
// the `violations` array below is the authoritative list of what was violated).
export type LiveCheckResult = {
  check: string;
  value: number;
  confidence: number;
};

// One violation flagged by the AI for the analyzed frame.
export type LiveViolation = {
  type: string;
  severity: string;
  score: number;
  details_json?: string;
};

// Live-detect poll (fallback transport, used when the SSE /live-stream channel
// can't connect). The server returns the exact frame it analyzed (base64 JPEG)
// together with its detections, so the client renders frame + boxes as one
// unit and boxes can't lag the displayed frame. width/height are that frame's
// pixel dims (bboxes are in that space). `seq` increments per new result; pass
// the last-seen seq as `since` to skip re-fetching an unchanged frame.
// `monitored:false` means the camera has no active monitoring hub (paused/
// inactive) rather than a stale/empty result.
export type LiveDetectFrame = {
  seq: number;
  unchanged: false;
  monitored: true;
  frame: string | null;
  width: number | null;
  height: number | null;
  detections: Detection[];
  checkResults: LiveCheckResult[];
  violations: LiveViolation[];
};

export type LivePollResponse =
  | { seq: number; unchanged: true; monitored: true }
  | LiveDetectFrame
  | { seq: number; unchanged: false; monitored: false };

export async function pollLiveDetections(
  id: string,
  since: number,
  signal?: AbortSignal
): Promise<LivePollResponse> {
  const res = await apiClient.get<{ success: boolean; data: LivePollResponse }>(
    `/cameras/${id}/live-detect`,
    { params: { since }, signal }
  );
  return unwrap(res);
}

// Primary transport for the unified live view: an SSE stream of capture-cycle
// results, including the exact analyzed frame (base64 JPEG) so the client
// renders frame + boxes as one atomic update — mirrors LiveDetectFrame's
// shape above. Mirrors openSystemStream's transport pattern. Works for both
// RTSP-sourced cameras (attachLiveResultStream) and device-sourced cameras
// (attachDeviceLiveResultStream, broadcast once per POST /push-frame) — the
// backend picks the handler by camera.sourceType, same endpoint either way.
export type LiveStreamResult = {
  seq: number;
  frame: string | null;
  width: number | null;
  height: number | null;
  detections: Detection[];
  checkResults: LiveCheckResult[];
  violations: LiveViolation[];
};

export type LiveStreamHandlers = {
  onConnected?: () => void;
  onResult: (payload: LiveStreamResult) => void;
  onNotMonitored?: () => void;
  onError?: (err: Event) => void;
};

export function openLiveCameraStream(
  cameraId: string,
  token: string | null,
  handlers: LiveStreamHandlers
): EventSource {
  const base = import.meta.env.VITE_API_URL ?? "";
  const url = `${base}/api/v1/cameras/${cameraId}/live-stream${
    token ? `?token=${encodeURIComponent(token)}` : ""
  }`;
  const es = new EventSource(url);

  es.addEventListener("connected", () => handlers.onConnected?.());

  es.addEventListener("result", (e) => {
    try {
      const payload = JSON.parse((e as MessageEvent).data) as LiveStreamResult;
      handlers.onResult(payload);
    } catch {
      // ignore malformed
    }
  });

  es.addEventListener("not_monitored", () => handlers.onNotMonitored?.());

  if (handlers.onError) {
    es.onerror = handlers.onError;
  }

  return es;
}
