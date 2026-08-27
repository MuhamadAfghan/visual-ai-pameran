export const SELECTED_CHECKS = [
  "person_count",
  "mask_count",
  "helmet_count",
  "vest_count",
  "goggles_count",
  "gloves_count",
  "ladder_count",
  "safety_cone_count",
  "fall_detected_count",
  "red_zone_count",
  "hand_in_pocket_count",
  "holding_phone_count",
  "handrail_count",
] as const;

export type SelectedCheck = (typeof SELECTED_CHECKS)[number];

export const CHECK_LABELS: Record<SelectedCheck, string> = {
  person_count: "Person Count",
  mask_count: "Mask",
  helmet_count: "Helmet",
  vest_count: "Safety Vest",
  goggles_count: "Goggles",
  gloves_count: "Gloves",
  ladder_count: "Ladder",
  safety_cone_count: "Safety Cone",
  fall_detected_count: "Fall Detection",
  red_zone_count: "Green Lane / Red Zone",
  hand_in_pocket_count: "Hand in Pocket",
  holding_phone_count: "Holding Phone While Walking",
  handrail_count: "Handrail (Tangga)",
};

export type AiModel = {
  _id: string;
  code: string;
  name: string;
  description?: string;
  defaultChecks: SelectedCheck[];
  defaultConfThreshold: number;
  version: string;
  isActive: boolean;
  isCustom: boolean;
  createdAt: string;
  updatedAt: string;
};
