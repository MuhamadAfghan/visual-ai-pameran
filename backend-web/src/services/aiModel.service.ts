import { AiModelModel, SELECTED_CHECKS, type SelectedCheck } from "../models/aiModel.model";
import { CameraMappingModel } from "../models/cameraMapping.model";

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
  const aiModel = await AiModelModel.findByIdAndDelete(id);
  if (!aiModel) return null;

  await CameraMappingModel.deleteMany({ modelId: id });

  return aiModel;
}

export { SELECTED_CHECKS };
