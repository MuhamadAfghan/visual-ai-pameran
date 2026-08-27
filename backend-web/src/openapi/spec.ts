// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySchema = any;

const bearer = { type: "http", scheme: "bearer", bearerFormat: "JWT" };
const auth = [{ bearerAuth: [] }];

// ── Reusable response shapes ──────────────────────────────────────────────────
const successWrap = (schema: AnySchema) => ({
  description: "Success",
  content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: schema } } } }
});

const r400 = { description: "Validation error" };
const r401 = { description: "Unauthorized" };
const r403 = { description: "Forbidden" };
const r404 = { description: "Not found" };
const r409 = { description: "Conflict — duplicate value" };

const idParam = { name: "id", in: "path", required: true, schema: { type: "string" } };

// ── Common schema objects ─────────────────────────────────────────────────────
const schemas: Record<string, AnySchema> = {
  UserRole: { type: "string", enum: ["super_admin", "admin", "viewer"] },

  User: {
    type: "object",
    properties: {
      _id: { type: "string" }, name: { type: "string" }, email: { type: "string" },
      role: { $ref: "#/components/schemas/UserRole" },
      isActive: { type: "boolean" }, createdAt: { type: "string", format: "date-time" }
    }
  },

  Area: {
    type: "object",
    properties: {
      _id: { type: "string" }, code: { type: "string" }, name: { type: "string" },
      description: { type: "string" }, isActive: { type: "boolean" },
      location: {
        type: "object", nullable: true,
        properties: { lat: { type: "number" }, lng: { type: "number" } }
      },
      sectionCount: { type: "integer" }, cameraCount: { type: "integer" }
    }
  },

  Section: {
    type: "object",
    properties: {
      _id: { type: "string" }, areaId: { type: "object" }, code: { type: "string" }, name: { type: "string" },
      description: { type: "string" }, isActive: { type: "boolean" }, cameraCount: { type: "integer" }
    }
  },

  Camera: {
    type: "object",
    properties: {
      _id: { type: "string" }, code: { type: "string" }, name: { type: "string" },
      rtspUrl: { type: "string" }, sectionId: { type: "object" },
      brand: { type: "string" }, status: { type: "string", enum: ["online", "offline", "maintenance"] },
      minCaptureGapSeconds: { type: "number" }, cooldownPeriod: { type: "integer" },
      isActive: { type: "boolean" }, lastCaptureAt: { type: "string", format: "date-time", nullable: true }
    }
  },

  AiModel: {
    type: "object",
    properties: {
      _id: { type: "string" }, code: { type: "string" }, name: { type: "string" },
      modelType: { type: "string", enum: ["people_counting", "pedestrian", "ppe", "vehicle", "custom"] },
      endpointUrl: { type: "string" }, grpcServiceName: { type: "string" },
      version: { type: "string" }, isActive: { type: "boolean" }
    }
  },

  CameraMapping: {
    type: "object",
    properties: {
      _id: { type: "string" }, cameraId: { type: "string" }, modelId: { type: "string" },
      isActive: { type: "boolean" }, confidenceThreshold: { type: "number" },
      roiPolygon: { type: "array", items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } } },
      stairsZone: { type: "array", items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } } },
      handrailLines: { type: "array", items: { type: "object", properties: { points: { type: "array", items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } } } } } },
      schedule: { type: "object", properties: { type: { type: "string", enum: ["always", "time_range"] } } }
    }
  },

  Pic: {
    type: "object",
    properties: {
      _id: { type: "string" }, name: { type: "string" }, email: { type: "string" },
      modelTypes: { type: "array", items: { type: "string" } },
      isActive: { type: "boolean" }
    }
  },

  DetectionEvent: {
    type: "object",
    properties: {
      _id: { type: "string" }, cameraId: { type: "string" }, modelId: { type: "string" },
      detectedAt: { type: "string", format: "date-time" }, confidence: { type: "number" },
      isViolation: { type: "boolean" }, checkName: { type: "string" },
      snapshotUrl: { type: "string", nullable: true },
      status: { type: "string", enum: ["unacknowledged", "acknowledged", "false_positive"] }
    }
  },

  SystemSettings: {
    type: "object",
    properties: {
      smtp: {
        type: "object",
        properties: {
          host: { type: "string" }, port: { type: "integer" }, user: { type: "string" },
          pass: { type: "string", description: "Always masked as ••••••••" },
          from: { type: "string" }, tls: { type: "boolean" }
        }
      },
      retention: { type: "object", properties: { dataDays: { type: "integer" }, snapshotDays: { type: "integer" } } },
      capture: { type: "object", properties: { defaultInterval: { type: "integer" }, defaultCooldown: { type: "integer" } } },
      notification: { type: "object", properties: { maxEmailsPerHour: { type: "integer" }, cooldownMinutes: { type: "integer" } } }
    }
  }
};

// ── Full spec ─────────────────────────────────────────────────────────────────
export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "CCTV AI Detector API",
    version: "1.0.0",
    description: "REST API for AI-powered CCTV monitoring.\n\n**Auth:** Login via `POST /api/v1/auth/login`, then pass `Bearer <token>` in the `Authorization` header.\n\n**Roles:** `super_admin` > `admin` > `viewer`"
  },
  servers: [{ url: "http://localhost:8080", description: "Local dev" }],
  components: {
    securitySchemes: { bearerAuth: bearer },
    schemas
  },
  paths: {
    "/health": {
      get: {
        tags: ["Health"], summary: "Health check",
        responses: { "200": successWrap({ type: "object", properties: { service: { type: "string" }, uptime: { type: "number" } } }) }
      }
    },

    // ── Auth ──────────────────────────────────────────────────
    "/api/v1/auth/login": {
      post: {
        tags: ["Auth"], summary: "Login",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email", "password"], properties: { email: { type: "string", format: "email" }, password: { type: "string" } } } } } },
        responses: { "200": successWrap({ type: "object", properties: { token: { type: "string" }, user: { $ref: "#/components/schemas/User" } } }), "401": r401 }
      }
    },
    "/api/v1/auth/me": {
      get: { tags: ["Auth"], summary: "Get current user profile", security: auth, responses: { "200": successWrap({ $ref: "#/components/schemas/User" }), "401": r401 } },
      patch: {
        tags: ["Auth"], summary: "Update own profile", security: auth,
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" } } } } } },
        responses: { "200": successWrap({ $ref: "#/components/schemas/User" }), "401": r401 }
      }
    },
    "/api/v1/auth/forgot-password": {
      post: {
        tags: ["Auth"], summary: "Request password reset email",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" } } } } } },
        responses: { "200": successWrap({ type: "object", properties: { message: { type: "string" } } }) }
      }
    },
    "/api/v1/auth/reset-password": {
      post: {
        tags: ["Auth"], summary: "Reset password using token",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["token", "newPassword"], properties: { token: { type: "string" }, newPassword: { type: "string", minLength: 8 } } } } } },
        responses: { "200": successWrap({ type: "object", properties: { message: { type: "string" } } }), "400": r400 }
      }
    },
    "/api/v1/auth/change-password": {
      post: {
        tags: ["Auth"], summary: "Change own password", security: auth,
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["currentPassword", "newPassword"], properties: { currentPassword: { type: "string" }, newPassword: { type: "string", minLength: 8 } } } } } },
        responses: { "200": successWrap({ type: "object", properties: { message: { type: "string" } } }), "400": r400, "401": r401 }
      }
    },

    // ── Users ─────────────────────────────────────────────────
    "/api/v1/users": {
      get: { tags: ["Users"], summary: "List users [admin+]", security: auth, responses: { "200": successWrap({ type: "array", items: { $ref: "#/components/schemas/User" } }), "401": r401, "403": r403 } },
      post: {
        tags: ["Users"], summary: "Create user [super_admin]", security: auth,
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name", "email", "password", "role"], properties: { name: { type: "string" }, email: { type: "string", format: "email" }, password: { type: "string", minLength: 8 }, role: { $ref: "#/components/schemas/UserRole" }, isActive: { type: "boolean" } } } } } },
        responses: { "201": successWrap({ $ref: "#/components/schemas/User" }), "401": r401, "403": r403, "409": r409 }
      }
    },
    "/api/v1/users/{id}": {
      parameters: [idParam],
      patch: {
        tags: ["Users"], summary: "Update user [super_admin]", security: auth,
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" }, role: { $ref: "#/components/schemas/UserRole" }, isActive: { type: "boolean" } } } } } },
        responses: { "200": successWrap({ $ref: "#/components/schemas/User" }), "401": r401, "403": r403, "404": r404 }
      },
      delete: { tags: ["Users"], summary: "Delete user [super_admin]", security: auth, responses: { "200": successWrap({ type: "object" }), "401": r401, "403": r403, "404": r404 } }
    },
    "/api/v1/users/{id}/activation": {
      parameters: [idParam],
      patch: {
        tags: ["Users"], summary: "Toggle user active status [admin+]", security: auth,
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["isActive"], properties: { isActive: { type: "boolean" } } } } } },
        responses: { "200": successWrap({ $ref: "#/components/schemas/User" }), "401": r401, "403": r403, "404": r404 }
      }
    },

    // ── Areas ─────────────────────────────────────────────────
    "/api/v1/areas": {
      get: { tags: ["Areas"], summary: "List areas [viewer+]", security: auth, responses: { "200": successWrap({ type: "array", items: { $ref: "#/components/schemas/Area" } }), "401": r401 } },
      post: {
        tags: ["Areas"], summary: "Create area [admin+]", security: auth,
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["code", "name"], properties: { code: { type: "string" }, name: { type: "string" }, description: { type: "string" }, isActive: { type: "boolean" } } } } } },
        responses: { "201": successWrap({ $ref: "#/components/schemas/Area" }), "401": r401, "403": r403, "409": r409 }
      }
    },
    "/api/v1/areas/{id}": {
      parameters: [idParam],
      get: { tags: ["Areas"], summary: "Get area by ID [viewer+]", security: auth, responses: { "200": successWrap({ $ref: "#/components/schemas/Area" }), "404": r404 } },
      put: {
        tags: ["Areas"], summary: "Update area [admin+]", security: auth,
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["code", "name"], properties: { code: { type: "string" }, name: { type: "string" }, description: { type: "string" }, isActive: { type: "boolean" } } } } } },
        responses: { "200": successWrap({ $ref: "#/components/schemas/Area" }), "404": r404, "409": r409 }
      },
      delete: { tags: ["Areas"], summary: "Delete area [admin+]", security: auth, responses: { "200": successWrap({ type: "object" }), "404": r404 } }
    },

    // ── Cameras ───────────────────────────────────────────────
    "/api/v1/cameras": {
      get: { tags: ["Cameras"], summary: "List cameras [viewer+]", security: auth, responses: { "200": successWrap({ type: "array", items: { $ref: "#/components/schemas/Camera" } }) } },
      post: {
        tags: ["Cameras"], summary: "Create camera [admin+]", security: auth,
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["code", "name", "rtspUrl", "sectionId", "defaultPicIds"], properties: { code: { type: "string" }, name: { type: "string" }, rtspUrl: { type: "string" }, sectionId: { type: "string" }, brand: { type: "string" }, minCaptureGapSeconds: { type: "number", default: 0 }, cooldownPeriod: { type: "integer", default: 300 }, defaultPicIds: { type: "array", items: { type: "string" }, minItems: 1 }, notes: { type: "string" }, isActive: { type: "boolean", default: true } } } } } },
        responses: { "201": successWrap({ $ref: "#/components/schemas/Camera" }), "409": r409 }
      }
    },
    "/api/v1/cameras/{id}": {
      parameters: [idParam],
      get: { tags: ["Cameras"], summary: "Get camera by ID [viewer+]", security: auth, responses: { "200": successWrap({ $ref: "#/components/schemas/Camera" }), "404": r404 } },
      put: {
        tags: ["Cameras"], summary: "Update camera [admin+]", security: auth,
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" }, rtspUrl: { type: "string" }, minCaptureGapSeconds: { type: "number" }, isActive: { type: "boolean" } } } } } },
        responses: { "200": successWrap({ $ref: "#/components/schemas/Camera" }), "404": r404 }
      },
      delete: { tags: ["Cameras"], summary: "Delete camera [super_admin]", security: auth, responses: { "200": successWrap({ type: "object" }), "404": r404 } }
    },
    "/api/v1/cameras/{id}/test-connection": {
      parameters: [idParam],
      post: {
        tags: ["Cameras"], summary: "Test RTSP connection [admin+]", security: auth,
        responses: { "200": successWrap({ type: "object", properties: { online: { type: "boolean" }, message: { type: "string" } } }), "404": r404 }
      }
    },
    "/api/v1/cameras/{id}/mappings": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Camera ID" }],
      get: { tags: ["Camera Mappings"], summary: "List mappings for a camera [admin+]", security: auth, responses: { "200": successWrap({ type: "array", items: { $ref: "#/components/schemas/CameraMapping" } }) } },
      post: {
        tags: ["Camera Mappings"], summary: "Create camera-model mapping [admin+]", security: auth,
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["modelId"], properties: { modelId: { type: "string" }, isActive: { type: "boolean" }, confidenceThreshold: { type: "number", minimum: 0, maximum: 1 }, roiPolygon: { type: "array", items: { type: "object" } }, schedule: { type: "object", properties: { type: { type: "string", enum: ["always", "time_range"] }, timeRanges: { type: "array", items: { type: "object" } } } } } } } } },
        responses: { "201": successWrap({ $ref: "#/components/schemas/CameraMapping" }) }
      }
    },
    "/api/v1/cameras/{id}/mappings/{mappingId}": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
        { name: "mappingId", in: "path", required: true, schema: { type: "string" } }
      ],
      put: { tags: ["Camera Mappings"], summary: "Update mapping [admin+]", security: auth, requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CameraMapping" } } } }, responses: { "200": successWrap({ $ref: "#/components/schemas/CameraMapping" }), "404": r404 } },
      delete: { tags: ["Camera Mappings"], summary: "Delete mapping [admin+]", security: auth, responses: { "200": successWrap({ type: "object" }), "404": r404 } }
    },

    // ── AI Models ─────────────────────────────────────────────
    "/api/v1/ai-models": {
      get: { tags: ["AI Models"], summary: "List AI models [admin+]", security: auth, responses: { "200": successWrap({ type: "array", items: { $ref: "#/components/schemas/AiModel" } }) } },
      post: {
        tags: ["AI Models"], summary: "Create AI model [admin+]", security: auth,
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["code", "name", "modelType"], properties: { code: { type: "string" }, name: { type: "string" }, modelType: { type: "string" }, endpointUrl: { type: "string" }, grpcServiceName: { type: "string" }, version: { type: "string" }, description: { type: "string" }, isActive: { type: "boolean" } } } } } },
        responses: { "201": successWrap({ $ref: "#/components/schemas/AiModel" }), "409": r409 }
      }
    },
    "/api/v1/ai-models/{id}": {
      parameters: [idParam],
      get: { tags: ["AI Models"], summary: "Get AI model by ID [admin+]", security: auth, responses: { "200": successWrap({ $ref: "#/components/schemas/AiModel" }), "404": r404 } },
      put: { tags: ["AI Models"], summary: "Update AI model [admin+]", security: auth, requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } }, responses: { "200": successWrap({ $ref: "#/components/schemas/AiModel" }), "404": r404 } },
      delete: { tags: ["AI Models"], summary: "Delete AI model [admin+]", security: auth, responses: { "200": successWrap({ type: "object" }), "404": r404 } }
    },

    // ── PICs ──────────────────────────────────────────────────
    "/api/v1/pics": {
      get: { tags: ["PICs"], summary: "List PICs [admin+]", security: auth, responses: { "200": successWrap({ type: "array", items: { $ref: "#/components/schemas/Pic" } }) } },
      post: {
        tags: ["PICs"], summary: "Create PIC [admin+]", security: auth,
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name", "email"], properties: { name: { type: "string" }, email: { type: "string", format: "email" }, modelTypes: { type: "array", items: { type: "string" } }, isActive: { type: "boolean" } } } } } },
        responses: { "201": successWrap({ $ref: "#/components/schemas/Pic" }), "409": r409 }
      }
    },
    "/api/v1/pics/{id}": {
      parameters: [idParam],
      put: { tags: ["PICs"], summary: "Update PIC [admin+]", security: auth, requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } }, responses: { "200": successWrap({ $ref: "#/components/schemas/Pic" }), "404": r404 } },
      delete: { tags: ["PICs"], summary: "Delete PIC [admin+]", security: auth, responses: { "200": successWrap({ type: "object" }), "404": r404 } }
    },

    // ── Events ────────────────────────────────────────────────
    "/api/v1/events": {
      get: {
        tags: ["Events"], summary: "List detection events [viewer+]", security: auth,
        parameters: [
          { name: "cameraId", in: "query", schema: { type: "string" } },
          { name: "modelId", in: "query", schema: { type: "string" } },
          { name: "isViolation", in: "query", schema: { type: "boolean" } },
          { name: "status", in: "query", schema: { type: "string", enum: ["unacknowledged", "acknowledged", "false_positive"] } },
          { name: "startDate", in: "query", schema: { type: "string", format: "date" } },
          { name: "endDate", in: "query", schema: { type: "string", format: "date" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 25 } }
        ],
        responses: { "200": successWrap({ type: "array", items: { $ref: "#/components/schemas/DetectionEvent" } }) }
      }
    },
    "/api/v1/events/{id}": {
      parameters: [idParam],
      get: { tags: ["Events"], summary: "Get event by ID [viewer+]", security: auth, responses: { "200": successWrap({ $ref: "#/components/schemas/DetectionEvent" }), "404": r404 } }
    },
    "/api/v1/events/{id}/acknowledge": {
      parameters: [idParam],
      patch: { tags: ["Events"], summary: "Acknowledge event [admin+]", security: auth, responses: { "200": successWrap({ $ref: "#/components/schemas/DetectionEvent" }), "404": r404 } }
    },
    "/api/v1/events/{id}/false-positive": {
      parameters: [idParam],
      patch: { tags: ["Events"], summary: "Mark as false positive [admin+]", security: auth, responses: { "200": successWrap({ $ref: "#/components/schemas/DetectionEvent" }), "404": r404 } }
    },
    "/api/v1/events/bulk-acknowledge": {
      post: {
        tags: ["Events"], summary: "Bulk acknowledge events [admin+]", security: auth,
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["ids"], properties: { ids: { type: "array", items: { type: "string" } } } } } } },
        responses: { "200": successWrap({ type: "object", properties: { modifiedCount: { type: "integer" } } }) }
      }
    },

    // ── Dashboard ─────────────────────────────────────────────
    "/api/v1/dashboard/stats": {
      get: {
        tags: ["Dashboard"], summary: "Summary stats [viewer+]", security: auth,
        responses: { "200": successWrap({ type: "object", properties: { totalCameras: { type: "integer" }, onlineCameras: { type: "integer" }, violationsToday: { type: "integer" }, detectionsToday: { type: "integer" } } }) }
      }
    },
    "/api/v1/dashboard/recent-events": {
      get: { tags: ["Dashboard"], summary: "Recent detection events [viewer+]", security: auth, responses: { "200": successWrap({ type: "array", items: { $ref: "#/components/schemas/DetectionEvent" } }) } }
    },
    "/api/v1/dashboard/chart/trend": {
      get: {
        tags: ["Dashboard"], summary: "Detection trend chart data [viewer+]", security: auth,
        parameters: [{ name: "period", in: "query", schema: { type: "string", enum: ["24h", "7d", "30d"], default: "24h" } }],
        responses: { "200": successWrap({ type: "array", items: { type: "object" } }) }
      }
    },

    // ── Reports ───────────────────────────────────────────────
    "/api/v1/reports/summary": {
      get: { tags: ["Reports"], summary: "Aggregate report summary [viewer+]", security: auth, parameters: [{ name: "startDate", in: "query", schema: { type: "string", format: "date" } }, { name: "endDate", in: "query", schema: { type: "string", format: "date" } }], responses: { "200": successWrap({ type: "object" }) } }
    },
    "/api/v1/reports/export": {
      get: {
        tags: ["Reports"], summary: "Export detections as Excel [admin+]", security: auth,
        parameters: [{ name: "startDate", in: "query", schema: { type: "string", format: "date" } }, { name: "endDate", in: "query", schema: { type: "string", format: "date" } }],
        responses: { "200": { description: "Excel file (.xlsx)", content: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {} } } }
      }
    },

    // ── Settings ──────────────────────────────────────────────
    "/api/v1/settings": {
      get: { tags: ["Settings"], summary: "Get system settings [super_admin]", security: auth, responses: { "200": successWrap({ $ref: "#/components/schemas/SystemSettings" }) } },
      put: {
        tags: ["Settings"], summary: "Update system settings [super_admin]", security: auth,
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/SystemSettings" } } } },
        responses: { "200": successWrap({ $ref: "#/components/schemas/SystemSettings" }) }
      }
    },
    "/api/v1/settings/smtp/test": {
      post: {
        tags: ["Settings"], summary: "Send SMTP test email [super_admin]", security: auth,
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["to"], properties: { to: { type: "string", format: "email" } } } } } },
        responses: { "200": successWrap({ type: "object", properties: { message: { type: "string" } } }), "400": r400 }
      }
    },
    "/api/v1/settings/cleanup/run": {
      post: {
        tags: ["Settings"], summary: "Trigger manual cleanup [super_admin]", security: auth,
        responses: { "200": successWrap({ type: "object", properties: { eventsDeleted: { type: "integer" }, snapshotFilesDeleted: { type: "integer" }, logsDeleted: { type: "integer" } } }) }
      }
    },

    // ── Audit Logs ────────────────────────────────────────────
    "/api/v1/audit-logs": {
      get: {
        tags: ["Audit"], summary: "List audit logs [super_admin]", security: auth,
        parameters: [
          { name: "action", in: "query", schema: { type: "string" } },
          { name: "actorEmail", in: "query", schema: { type: "string" } },
          { name: "startDate", in: "query", schema: { type: "string", format: "date" } },
          { name: "endDate", in: "query", schema: { type: "string", format: "date" } }
        ],
        responses: { "200": successWrap({ type: "array", items: { type: "object" } }) }
      }
    }
  }
};
