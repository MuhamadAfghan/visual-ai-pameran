import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getPics,
  createPic,
  updatePic,
  deletePic,
  type PicPayload
} from "../../services/pic.service";

export function usePics() {
  return useQuery({
    queryKey: ["pics"],
    queryFn: getPics,
    staleTime: 60_000
  });
}

export function useCreatePic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PicPayload) => createPic(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pics"] })
  });
}

export function useUpdatePic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: PicPayload }) =>
      updatePic(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pics"] })
  });
}

export function useDeletePic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deletePic,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pics"] })
  });
}
