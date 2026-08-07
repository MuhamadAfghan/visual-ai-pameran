import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../errors/httpError";
import type { UserRole } from "../types/auth";

export function requireRole(roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const userRole = req.user?.role;
    if (!userRole || !roles.includes(userRole)) {
      next(new HttpError(403, "Forbidden"));
      return;
    }

    next();
  };
}
