export type ScheduleType = "always" | "time_range";

export type CameraMapping = {
  _id: string;
  cameraId: string;
  aiModelId: string;
  aiModelName?: string;
  isActive: boolean;
  confidenceThreshold?: number;
  scheduleType: ScheduleType;
  scheduleStart?: string;
  scheduleEnd?: string;
  scheduleDays?: number[];
  roiCoordinates?: number[][];
  captureIntervalOverride?: number;
  picOverride?: string[];
};
