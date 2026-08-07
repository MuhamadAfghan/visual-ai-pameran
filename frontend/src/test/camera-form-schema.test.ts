import { describe, it, expect } from "vitest";
import { z } from "zod";

// Schema yang sama dengan camera-form.tsx — ditest langsung tanpa render
const schema = z.object({
  code: z.string().min(1, "Kode kamera wajib diisi"),
  name: z.string().min(1, "Nama kamera wajib diisi"),
  sectionId: z.string().min(1, "Section wajib dipilih"),
  rtspUrl: z.string().min(1, "RTSP URL wajib diisi"),
  brand: z.string().optional(),
  minCaptureGapSeconds: z.string().optional(),
  cooldownPeriod: z.string().optional(),
  defaultPicIds: z.array(z.string()).min(1, "Pilih minimal 1 PIC"),
  notes: z.string().optional(),
  isActive: z.boolean()
});

const validPayload = {
  code: "CAM-LOBBY-01",
  name: "Kamera Lobby Utama",
  sectionId: "section123",
  rtspUrl: "rtsp://192.168.1.100:554/stream",
  defaultPicIds: ["pic1"],
  isActive: true
};

describe("CameraForm schema validation", () => {
  it("menerima payload valid", () => {
    expect(() => schema.parse(validPayload)).not.toThrow();
  });

  it("menolak saat code kosong", () => {
    const result = schema.safeParse({ ...validPayload, code: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.code).toContain("Kode kamera wajib diisi");
    }
  });

  it("menolak saat name kosong", () => {
    const result = schema.safeParse({ ...validPayload, name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.name).toContain("Nama kamera wajib diisi");
    }
  });

  it("menolak saat sectionId kosong", () => {
    const result = schema.safeParse({ ...validPayload, sectionId: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.sectionId).toContain("Section wajib dipilih");
    }
  });

  it("menolak saat rtspUrl kosong", () => {
    const result = schema.safeParse({ ...validPayload, rtspUrl: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.rtspUrl).toContain("RTSP URL wajib diisi");
    }
  });

  it("menolak saat defaultPicIds kosong", () => {
    const result = schema.safeParse({ ...validPayload, defaultPicIds: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.defaultPicIds).toContain("Pilih minimal 1 PIC");
    }
  });

  it("field opsional boleh tidak ada", () => {
    const result = schema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.brand).toBeUndefined();
      expect(result.data.notes).toBeUndefined();
    }
  });

  it("field opsional diterima saat diisi", () => {
    const result = schema.safeParse({
      ...validPayload,
      brand: "Hikvision",
      minCaptureGapSeconds: "30",
      cooldownPeriod: "300",
      notes: "Kamera pintu masuk",
      defaultPicIds: ["pic1", "pic2"]
    });
    expect(result.success).toBe(true);
  });
});
