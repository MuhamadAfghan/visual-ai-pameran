import type { UserRole } from "../types/auth";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: UserRole;
        roleId?: string;
        picId?: string;
      };
    }
  }
}

export {};
