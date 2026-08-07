import { apiClient, unwrap } from "./api-client";
import type { AiModel, SelectedCheck } from "../types/ai-model.types";

export type AiModelPayload = {
  code?: string;
  name?: string;
  description?: string;
  defaultChecks?: SelectedCheck[];
  defaultConfThreshold?: number;
  version?: string;
  isActive?: boolean;
};

export async function getAiModels(): Promise<AiModel[]> {
  const res = await apiClient.get<{ success: boolean; data: AiModel[] }>("/ai-models");
  return unwrap(res);
}

export async function getAiModelById(id: string): Promise<AiModel> {
  const res = await apiClient.get<{ success: boolean; data: AiModel }>(`/ai-models/${id}`);
  return unwrap(res);
}

export async function createAiModel(payload: AiModelPayload): Promise<AiModel> {
  const res = await apiClient.post<{ success: boolean; data: AiModel }>("/ai-models", payload);
  return unwrap(res);
}

export async function updateAiModel(id: string, payload: AiModelPayload): Promise<AiModel> {
  const res = await apiClient.put<{ success: boolean; data: AiModel }>(`/ai-models/${id}`, payload);
  return unwrap(res);
}

export async function deleteAiModel(id: string): Promise<void> {
  await apiClient.delete(`/ai-models/${id}`);
}
