import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { HttpError } from "../errors/httpError";

type Bucket = { count: number; expiresAt: number };
const buckets = new Map<string, Bucket>();

const gc = setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) {
    if (b.expiresAt <= now) buckets.delete(key);
  }
}, 60_000);
gc.unref();

export async function authRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.expiresAt <= now) {
    bucket = { count: 0, expiresAt: now + env.AUTH_RATE_LIMIT_WINDOW_MS };
    buckets.set(key, bucket);
  }
  bucket.count += 1;

  if (bucket.count > env.AUTH_RATE_LIMIT_MAX_ATTEMPTS) {
    const retryAfterMs = Math.max(0, bucket.expiresAt - now);
    const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
    const retryAfterMinutes = Math.ceil(retryAfterSeconds / 60);

    res.setHeader("Retry-After", retryAfterSeconds.toString());
    next(
      new HttpError(
        429,
        `Too many requests. Please try again in about ${retryAfterMinutes} minute(s).`,
        {
          retryAfterMinutes,
          retryAfterSeconds,
          retryAfterMs,
        },
      ),
    );
    return;
  }

  next();
}
