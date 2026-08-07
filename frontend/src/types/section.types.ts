export type SectionAreaRef = { _id: string; code: string; name: string };

export type Section = {
  _id: string;
  areaId: SectionAreaRef | string;
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
  cameraCount?: number;
  location?: { lat: number; lng: number } | null;
};
