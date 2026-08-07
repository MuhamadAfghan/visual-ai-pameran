import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAiModels,
  createAiModel,
  updateAiModel,
  deleteAiModel,
  type AiModelPayload
} from "../../services/ai-model.service";

export function useAiModels() {
  return useQuery({ queryKey: ["ai-models"], queryFn: getAiModels, staleTime: 30_000 });
}

export function useCreateAiModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createAiModel,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-models"] })
  });
}

export function useUpdateAiModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AiModelPayload }) =>
      updateAiModel(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-models"] })
  });
}

export function useDeleteAiModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteAiModel,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-models"] })
  });
}
