import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../plugins/authToken";
import { HttpError } from "../errors/httpError";
import type { UserRole } from "../types/auth";
import { getUserRoleId } from "../services/roleCache.service";

/**
 * Auth middleware for streaming endpoints (MJPEG).
 * Accepts token from Authorization header OR ?token= query param,
 * because <img src> cannot send custom headers.
 */
export async function requireAuthStream(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const headerToken = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice("Bearer ".length)
    : null;
  const queryToken = typeof req.query.token === "string" ? req.query.token : null;
  const token = headerToken ?? queryToken;

  if (!token) {
    next(new HttpError(401, "Unauthorized"));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    let roleId: string | undefined;
    if (payload.role !== "super_admin" && payload.sub !== "guest") {
      const id = await getUserRoleId(payload.sub);
      if (id) roleId = id;
    }
    req.user = { id: payload.sub, email: payload.email, role: payload.role as UserRole, roleId };
    next();
  } catch {
    next(new HttpError(401, "Invalid token"));
  }
}
