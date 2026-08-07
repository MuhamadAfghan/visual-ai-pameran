import cors from "cors";
import express from "express";
import path from "node:path";
import pino from "pino";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import { ZodError } from "zod";
import { env } from "./config/env";
import { HttpError } from "./errors/httpError";
import { openApiSpec } from "./openapi/spec";
import { createPinoHttpStream } from "./plugins/logStream";
import { apiRouter } from "./routes";
import { sendError } from "./utils/apiResponse";

function isDuplicateKeyError(err: unknown): err is { code: number; keyValue: Record<string, unknown> } {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

export function buildApp() {
  const app = express();

  const allowedOrigins =
    env.CORS_ORIGIN === "*"
      ? true
      : env.CORS_ORIGIN.split(",").map((o) => o.trim());

  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"]
    })
  );
  app.use(express.json({ limit: "5mb" }));

  const captureStream = createPinoHttpStream();
  const httpLogStream = pino.multistream([{ stream: process.stdout }, { stream: captureStream }]);
  app.use(pinoHttp({ stream: httpLogStream }));

  // Serve snapshot files as static assets
  app.use("/storage", express.static(path.resolve(env.STORAGE_BASE_PATH)));

  // API documentation (available in all environments)
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

  app.use(apiRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof ZodError) {
      sendError(res, "Validation error", 400, err.flatten());
      return;
    }

    if (err instanceof HttpError) {
      sendError(res, err.message, err.statusCode, err.details);
      return;
    }

    if (isDuplicateKeyError(err)) {
      const field = Object.keys(err.keyValue)[0] ?? "field";
      sendError(res, `Duplicate value: '${field}' already exists`, 409, err.keyValue);
      return;
    }

    const message = err instanceof Error ? err.message : "Internal server error";
    sendError(res, message, 500);
  });

  return app;
}
