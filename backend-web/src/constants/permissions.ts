export const PERMISSIONS = {
  // ── Dashboard ────────────────────────────────────────────────────────────
  DASHBOARD_VIEW:         "dashboard:view",

  // ── Cameras ──────────────────────────────────────────────────────────────
  CAMERAS_VIEW:           "cameras:view",
  CAMERAS_CREATE:         "cameras:create",
  CAMERAS_UPDATE:         "cameras:update",
  CAMERAS_DELETE:         "cameras:delete",
  CAMERAS_STREAM:         "cameras:stream",
  CAMERAS_SNAPSHOT:       "cameras:snapshot",
  CAMERAS_SCHEDULER:      "cameras:scheduler",

  // ── Events ───────────────────────────────────────────────────────────────
  EVENTS_VIEW:            "events:view",
  EVENTS_EXPORT:          "events:export",
  EVENTS_ACKNOWLEDGE:     "events:acknowledge",
  EVENTS_FALSE_POSITIVE:  "events:false_positive",
  EVENTS_DELETE:          "events:delete",

  // ── Areas ────────────────────────────────────────────────────────────────
  AREAS_VIEW:             "areas:view",
  AREAS_CREATE:           "areas:create",
  AREAS_UPDATE:           "areas:update",
  AREAS_DELETE:           "areas:delete",

  // ── Sections ─────────────────────────────────────────────────────────────
  SECTIONS_VIEW:          "sections:view",
  SECTIONS_CREATE:        "sections:create",
  SECTIONS_UPDATE:        "sections:update",
  SECTIONS_DELETE:        "sections:delete",

  // ── Camera Mappings ───────────────────────────────────────────────────────
  CAMERA_MAPPINGS_VIEW:   "camera_mappings:view",
  CAMERA_MAPPINGS_CREATE: "camera_mappings:create",
  CAMERA_MAPPINGS_UPDATE: "camera_mappings:update",
  CAMERA_MAPPINGS_DELETE: "camera_mappings:delete",
  CAMERA_MAPPINGS_TOGGLE: "camera_mappings:toggle",

  // ── AI Models ─────────────────────────────────────────────────────────────
  AI_MODELS_VIEW:         "ai_models:view",
  AI_MODELS_CREATE:       "ai_models:create",
  AI_MODELS_UPDATE:       "ai_models:update",
  AI_MODELS_DELETE:       "ai_models:delete",

  // ── PICs ──────────────────────────────────────────────────────────────────
  PICS_VIEW:              "pics:view",
  PICS_CREATE:            "pics:create",
  PICS_UPDATE:            "pics:update",
  PICS_DELETE:            "pics:delete",

  // ── Detection Jobs ────────────────────────────────────────────────────────
  DETECTION_JOBS_VIEW:    "detection_jobs:view",
  DETECTION_JOBS_CREATE:  "detection_jobs:create",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
