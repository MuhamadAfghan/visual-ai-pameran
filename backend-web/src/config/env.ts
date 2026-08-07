import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  MONGODB_URI: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  AI_GRPC_TARGET: z.string().min(1),
  INFER_QUEUE_NAME: z.string().default("infer-jobs"),
  // Global cap on concurrent gRPC Infer calls in flight, shared by every caller
  // (monitoring hubs, device push, legacy ad-hoc jobs). Should track the AI
  // service's AI_GRPC_MAX_WORKERS so the two are tuned together.
  AI_INFER_MAX_CONCURRENCY: z.coerce.number().int().positive().default(8),
  // How long a caller waits for a free concurrency slot before giving up with a
  // distinguishable back-pressure error, instead of queuing indefinitely.
  AI_INFER_SLOT_WAIT_TIMEOUT_MS: z.coerce.number().int().positive().default(8_000),
  JWT_SECRET: z.string().min(8),
  JWT_EXPIRES_IN: z.string().default("8h"),
  JWT_REMEMBER_ME_EXPIRES_IN: z.string().default("30d"),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  AUTH_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  RESET_PASSWORD_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  APP_BASE_URL: z.string().url().default("http://localhost:8080"),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM: z.string().default(""),
  STORAGE_BASE_PATH: z.string().default("./storage"),
  STORAGE_BASE_URL: z.string().default("http://localhost:8080/storage"),
  NOTIFICATION_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(300),
  // 64-char hex (32 bytes) — generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  // Empty string is treated as "not set" so an unfilled .env entry doesn't fail validation.
  SETTINGS_ENCRYPTION_KEY: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().length(64).optional()
  ),
  // Comma-separated allowed origins, or * for dev. E.g. "http://localhost:5173,https://app.example.com"
  CORS_ORIGIN: z.string().default("*")
});

export const env = schema.parse(process.env);
