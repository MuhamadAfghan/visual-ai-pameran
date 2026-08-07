import { apiClient, unwrap } from "./api-client";
import type { AuthUser, UserRole } from "../types/auth.types";

type LoginApiResponse = {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
  };
};

type UserApiResponse = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

export async function loginApi(
  email: string,
  password: string,
  rememberMe = false
): Promise<{ token: string; user: AuthUser }> {
  const res = await apiClient.post<{ success: boolean; data: LoginApiResponse }>("/auth/login", {
    email,
    password,
    rememberMe,
  });
  const result = unwrap(res);
  return {
    token: result.token,
    user: {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      role: result.user.role
    }
  };
}

export async function loginAsGuestApi(): Promise<{ token: string; user: AuthUser }> {
  const res = await apiClient.post<{ success: boolean; data: LoginApiResponse }>("/auth/guest");
  const result = unwrap(res);
  return {
    token: result.token,
    user: { id: result.user.id, name: result.user.name, email: result.user.email, role: result.user.role }
  };
}

export async function forgotPasswordApi(email: string): Promise<{ message: string }> {
  const res = await apiClient.post<{ success: boolean; data: { message: string } }>(
    "/auth/forgot-password",
    { email }
  );
  return unwrap(res);
}

export async function resetPasswordApi(
  token: string,
  newPassword: string
): Promise<{ message: string }> {
  const res = await apiClient.post<{ success: boolean; data: { message: string } }>(
    "/auth/reset-password",
    { token, newPassword }
  );
  return unwrap(res);
}

export async function changePasswordApi(
  currentPassword: string,
  newPassword: string
): Promise<{ message: string }> {
  const res = await apiClient.post<{ success: boolean; data: { message: string } }>(
    "/auth/change-password",
    { currentPassword, newPassword }
  );
  return unwrap(res);
}

export async function updateProfileApi(name: string): Promise<AuthUser> {
  const res = await apiClient.patch<{ success: boolean; data: UserApiResponse }>(
    "/auth/me",
    { name }
  );
  const data = unwrap(res);
  return { id: data.id, name: data.name, email: data.email, role: data.role };
}
