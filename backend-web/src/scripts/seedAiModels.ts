/**
 * seedAiModels.ts
 *
 * Starter catalog untuk AiModel — satu entry per tema deteksi yang modelnya
 * sudah ditraining (lihat ai/research/runs/detect/) dan terdaftar di
 * ai/src/cctv_insight_ai/models/registry.py (MODEL_REGISTRY + CHECK_DEFINITIONS).
 * `defaultChecks` tiap entry mengikuti routing CHECK_TO_MODEL di registry.py
 * tersebut, supaya konsisten dengan model yang benar-benar dijalankan AI
 * service saat check itu dipilih.
 *
 * Run lain di research/runs/detect/ (holding_phone_yolo26m, phone_usage_yolo26m,
 * multitask_*, security_officer_*) belum didaftarkan di registry.py — sengaja
 * TIDAK dibuatkan entry di sini karena belum ada check_name yang mengarah ke
 * model tsb (lihat SELECTED_CHECKS). smartphone_yolo26m SUDAH terdaftar di
 * registry.py (key "smartphone"), tapi bukan model_key check manapun — dipakai
 * sebagai komponen internal holding_phone_count (di-invoke langsung dari
 * _apply_holding_phone di infer.py), jadi sudah tercakup lewat GREEN_LANE_ZONE
 * tanpa perlu entry AiModel sendiri.
 *
 * Plus satu entry `CUSTOM` (isCustom: true) — bukan model beneran, dipakai
 * mapping form frontend sebagai pilihan "checklist bebas" (lihat model-form
 * di frontend/src/features/mappings). Selain CUSTOM, checklist mapping wajib
 * mengikuti defaultChecks model yang dipilih (tidak bisa dicustom).
 *
 * Idempotent (upsert by code). Aman dijalankan berkali-kali.
 *
 *   npm run seed:ai-models
 */

import mongoose from "mongoose";
import { connectMongo } from "../config/mongo";
import { AiModelModel, type SelectedCheck } from "../models/aiModel.model";

type SeedAiModel = {
  code: string;
  name: string;
  description: string;
  defaultChecks: SelectedCheck[];
  defaultConfThreshold: number;
  version: string;
  isActive: boolean;
  isCustom?: boolean;
};

const AI_MODELS: SeedAiModel[] = [
  {
    code: "CUSTOM",
    name: "Custom",
    description:
      "Tidak terikat model tertentu — checklist deteksi dipilih bebas saat membuat mapping kamera.",
    defaultChecks: [],
    defaultConfThreshold: 0.25,
    version: "1.0.0",
    isActive: true,
    isCustom: true,
  },
  {
    code: "PEOPLE_COUNTING",
    name: "Penghitungan Orang",
    description:
      "Menghitung jumlah orang pada frame kamera — dipakai untuk memantau kepadatan area (crowd).",
    defaultChecks: ["person_count"],
    defaultConfThreshold: 0.25,
    version: "1.0.0",
    isActive: true,
  },
  {
    code: "FACE_MASK",
    name: "Deteksi Masker Wajah",
    description:
      "Kepatuhan pemakaian masker: pakai masker, tidak pakai masker, atau pakai tidak benar (improper mask).",
    defaultChecks: ["mask_count"],
    defaultConfThreshold: 0.25,
    version: "1.0.0",
    isActive: true,
  },
  {
    code: "HELMET_VEST",
    name: "APD Dasar — Helm & Rompi",
    description:
      "Kepatuhan pemakaian helm keselamatan (safety helmet) dan rompi safety (vest) di area kerja.",
    defaultChecks: ["helmet_count", "vest_count"],
    defaultConfThreshold: 0.25,
    version: "1.0.0",
    isActive: true,
  },
  {
    code: "PPE_COMPLIANCE",
    name: "PPE Compliance Lanjutan",
    description:
      "Paket APD lanjutan: kacamata safety (goggles), sarung tangan, tangga, safety cone, dan deteksi orang jatuh (fall detection).",
    defaultChecks: [
      "goggles_count",
      "gloves_count",
      "ladder_count",
      "safety_cone_count",
      "fall_detected_count",
    ],
    defaultConfThreshold: 0.25,
    version: "1.0.0",
    isActive: true,
  },
  {
    code: "HAND_IN_POCKET",
    name: "Perilaku — Tangan di Saku",
    description:
      "Mendeteksi perilaku tangan dimasukkan ke saku (hand in pocket) sebagai indikasi unsafe behavior.",
    defaultChecks: ["hand_in_pocket_count"],
    defaultConfThreshold: 0.25,
    version: "1.0.0",
    isActive: true,
  },
  {
    code: "GREEN_LANE_ZONE",
    name: "Green Lane — Zona Terlarang & Tangga",
    description:
      "Deteksi berbasis pose: orang yang masuk zona terlarang (red zone), memegang HP sambil berjalan, dan naik tangga tanpa berpegangan handrail.",
    defaultChecks: ["red_zone_count", "holding_phone_count", "handrail_count"],
    defaultConfThreshold: 0.25,
    version: "1.0.0",
    isActive: true,
  },
];

async function seed(): Promise<void> {
  console.log("[seedAiModels] Connecting to MongoDB...");
  await connectMongo();
  console.log("[seedAiModels] Connected.");

  for (const m of AI_MODELS) {
    await AiModelModel.updateOne({ code: m.code }, { $set: m }, { upsert: true });
    console.log(`  ✓ ${m.code} → [${m.defaultChecks.join(", ")}]`);
  }

  console.log(`[seedAiModels] Done. Seeded ${AI_MODELS.length} AI model(s).`);
}

seed()
  .catch((error) => {
    console.error("[seedAiModels] Fatal error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
