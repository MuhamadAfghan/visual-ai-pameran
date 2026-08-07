import type { NextFunction, Request, Response } from "express";
import { redis } from "../config/redis";
import { HttpError } from "../errors/httpError";

const WINDOW_MS = 60 * 60 * 1_000; // 1 hour
const MAX_PER_WINDOW = 10;

export async function exportRateLimit(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Scope per user ID when authenticated, fallback to IP
    const scopeKey = req.user?.id ?? req.ip;
    const key = `export:ratelimit:${scopeKey}`;

    const count = await redis.incr(key);
    if (count === 1) {
      await redis.pexpire(key, WINDOW_MS);
    }

    if (count > MAX_PER_WINDOW) {
      const ttlMs = await redis.pttl(key);
      const retryAfterSeconds = Math.ceil(Math.max(ttlMs, 0) / 1_000);
      throw new HttpError(
        429,
        `Batas export tercapai (${MAX_PER_WINDOW}x per jam). Coba lagi dalam ${Math.ceil(retryAfterSeconds / 60)} menit.`,
        { retryAfterSeconds }
      );
    }

    next();
  } catch (err) {
    next(err);
  }
}
