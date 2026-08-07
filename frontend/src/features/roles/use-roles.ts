import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getRolesApi,
  createRoleApi,
  updateRoleApi,
  deleteRoleApi,
  type CreateRolePayload,
  type UpdateRolePayload,
} from "../../services/role.service";

export function useRoles() {
  return useQuery({
    queryKey: ["roles"],
    queryFn: getRolesApi,
    staleTime: 60_000,
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateRolePayload) => createRoleApi(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles"] }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateRolePayload }) =>
      updateRoleApi(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles"] }),
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteRoleApi,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles"] }),
  });
}
