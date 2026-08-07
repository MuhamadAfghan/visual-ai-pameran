import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../plugins/authToken";
import { HttpError } from "../errors/httpError";
import type { UserRole } from "../types/auth";
import { getUserRoleId } from "../services/roleCache.service";

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  // Support Bearer header (normal) or ?token= query param (SSE/EventSource)
  const authHeader = req.headers.authorization;
  const rawToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : (req.query.token as string | undefined);

  if (!rawToken) {
    next(new HttpError(401, "Unauthorized"));
    return;
  }

  try {
    const payload = verifyAccessToken(rawToken);
    let roleId: string | undefined;
    if (payload.role !== "super_admin" && payload.sub !== "guest") {
      const id = await getUserRoleId(payload.sub);
      if (id) roleId = id;
    }
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role as UserRole,
      roleId,
      picId: payload.picId,
    };
    next();
  } catch {
    next(new HttpError(401, "Invalid token"));
  }
}
