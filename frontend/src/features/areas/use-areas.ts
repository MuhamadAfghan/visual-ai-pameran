import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAreas,
  createArea,
  updateArea,
  deleteArea,
  type AreaPayload
} from "../../services/area.service";

export function useAreas() {
  return useQuery({
    queryKey: ["areas"],
    queryFn: () => getAreas(),
    staleTime: 60_000
  });
}

export function useCreateArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createArea,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["areas"] })
  });
}

export function useUpdateArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AreaPayload }) =>
      updateArea(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["areas"] })
  });
}

export function useDeleteArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteArea,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["areas"] })
  });
}
