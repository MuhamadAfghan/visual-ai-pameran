import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { UserRole } from "../types/auth";

export type AuthTokenPayload = {
  sub: string;
  email: string;
  role: UserRole;
  picId?: string;
};

export function signAccessToken(payload: AuthTokenPayload, expiresIn?: string): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: (expiresIn ?? env.JWT_EXPIRES_IN) as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AuthTokenPayload & { exp?: number } {
  return jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload & { exp?: number };
}
