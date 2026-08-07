export type Area = {
  _id: string;
  code: string;
  name: string;
  description?: string;
  /** Koordinat default area; jadi nilai awal koordinat kamera baru di area ini. */
  location?: { lat: number; lng: number } | null;
  isActive: boolean;
  sectionCount?: number;
  cameraCount?: number;
};
