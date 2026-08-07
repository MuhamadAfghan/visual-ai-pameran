import { AppLayout } from "./app-layout";
import { PicAppLayout } from "./pic-app-layout";
import { useAuth } from "../app/auth-provider";

export function RoleAppLayout() {
  const { user } = useAuth();
  if (user?.role === "pic") return <PicAppLayout />;
  return <AppLayout />;
}
