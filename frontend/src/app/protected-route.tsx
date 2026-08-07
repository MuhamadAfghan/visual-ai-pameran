import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../app/auth-provider";
import type { UserRole } from "../types/auth.types";

type Props = {
  allowedRoles: UserRole[];
};

export function ProtectedRoute({ allowedRoles }: Props) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
