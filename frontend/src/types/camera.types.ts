export type CameraStatus = "online" | "offline" | "maintenance";

export type CameraPic = { _id: string; name: string; email: string };

export type CameraSection = {
  _id: string;
  code: string;
  name: string;
  areaId?: { _id: string; code: string; name: string };
  location?: { lat: number; lng: number } | null;
};

export type CameraSourceType = "rtsp" | "device";

export type Camera = {
  _id: string;
  code: string;
  name: string;
  sectionId: CameraSection | string;
  sourceType?: CameraSourceType;
  rtspUrl?: string;
  brand?: string;
  /** Optional soft floor (seconds) between capture+inference cycles for RTSP
   *  cameras — 0 (default) = no artificial limit, the monitoring hub runs as
   *  fast as the AI service and camera framerate allow. For device-sourced
   *  cameras this is the literal browser push cadence instead (unrelated,
   *  unchanged mechanism — see device-camera-provider.tsx). */
  minCaptureGapSeconds?: number;
  cooldownPeriod?: number;
  crowdThreshold?: number | null;
  defaultPicIds?: Array<CameraPic | string>;
  notes?: string;
  isActive: boolean;
  status: CameraStatus;
  lastCaptureAt?: string;
  snapshotPath?: string;
  latestSnapshotUrl?: string;
  activeMappingCount?: number;
  // Legacy camera-level zones — read-only display data (guest zone overlays,
  // historical events). No UI writes this anymore; geometry is now configured
  // per-mapping (see mapping.service.ts's roiPolygon/stairsZone/handrailLines).
  redZones?: Array<{ name: string; points: Array<{ x: number; y: number }> }>;
};

/** Helper: extract section id from populated or raw string. */
export function getSectionId(camera: Camera): string {
  return typeof camera.sectionId === "object" ? camera.sectionId._id : camera.sectionId;
}

/** Helper: section name (display fallback). */
export function getSectionName(camera: Camera): string {
  return typeof camera.sectionId === "object" ? camera.sectionId.name : "—";
}

/** Helper: parent area name (display fallback). */
export function getAreaName(camera: Camera): string {
  return typeof camera.sectionId === "object" ? camera.sectionId.areaId?.name ?? "—" : "—";
}
