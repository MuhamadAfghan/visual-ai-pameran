import type { Response } from "express";

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json({
    success: true,
    message: "OK",
    data
  });
}

export function sendError(res: Response, message: string, statusCode = 500, details?: unknown): void {
  res.status(statusCode).json({
    success: false,
    message,
    error: details ?? null
  });
}
