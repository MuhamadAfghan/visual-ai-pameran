import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getMappings,
  createMapping,
  updateMapping,
  deleteMapping,
  toggleMapping,
  type MappingPayload
} from "../../services/mapping.service";

export function useMappings(cameraId: string) {
  return useQuery({
    queryKey: ["mappings", cameraId],
    queryFn: () => getMappings(cameraId),
    enabled: !!cameraId,
    staleTime: 15_000
  });
}

export function useCreateMapping(cameraId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: MappingPayload) => createMapping(cameraId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mappings", cameraId] })
  });
}

export function useUpdateMapping(cameraId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ mappingId, payload }: { mappingId: string; payload: MappingPayload }) =>
      updateMapping(cameraId, mappingId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mappings", cameraId] })
  });
}

export function useDeleteMapping(cameraId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mappingId: string) => deleteMapping(cameraId, mappingId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mappings", cameraId] })
  });
}

export function useToggleMapping(cameraId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ mappingId, isActive }: { mappingId: string; isActive: boolean }) =>
      toggleMapping(cameraId, mappingId, isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mappings", cameraId] })
  });
}
