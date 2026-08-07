import { AiModelModel, SELECTED_CHECKS, type SelectedCheck } from "../models/aiModel.model";

export type AiModelInput = {
  code: string;
  name: string;
  description?: string;
  defaultChecks?: SelectedCheck[];
  defaultConfThreshold?: number;
  version?: string;
  isActive?: boolean;
};

export type AiModelUpdateInput = Partial<AiModelInput>;

export async function listAiModels() {
  return AiModelModel.find().sort({ createdAt: -1 });
}

export async function getAiModelById(id: string) {
  return AiModelModel.findById(id);
}

export async function createAiModel(input: AiModelInput) {
  return AiModelModel.create(input);
}

export async function updateAiModel(id: string, input: AiModelUpdateInput) {
  return AiModelModel.findByIdAndUpdate(id, input, { new: true });
}

export async function deleteAiModel(id: string) {
  return AiModelModel.findByIdAndDelete(id);
}

export { SELECTED_CHECKS };
