/**
 * Seed 3 kamera dev dari video di backend/temp/ (street, stairs, stairs_people).
 *
 * Default rtspUrl = rtsp://localhost:8554/<path> → cocok dengan $Streams di
 * scripts/dev/start-fake-rtsp.ts (jalankan `npm run dev:full` agar stream hidup).
 * Set env CAM_USE_FILE=1 untuk pakai path file langsung (tanpa MediaMTX; ffmpeg
 * loop file di jalur live, tapi snapshot/scheduler hanya dapat frame pertama).
 *
 * Idempotent (upsert by code). Reuse Section & PIC yang ada; kalau belum ada,
 * dibuatkan minimal (Area→Section, dan 1 PIC).
 *
 *   npm run seed:dev-cameras
 *   CAM_USE_FILE=1 npm run seed:dev-cameras   # mode path file langsung
 */
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { connectMongo } from "../config/mongo";
import { AreaModel } from "../models/area.model";
import { SectionModel } from "../models/section.model";
import { PicModel } from "../models/pic.model";
import { CameraModel } from "../models/camera.model";

const USE_FILE = process.env.CAM_USE_FILE === "1";

const CAMERAS = [
  { code: "street-01", name: "Street (dev)", file: "street.mp4", stream: "street-cam" },
  { code: "stairs-01", name: "Stairs (dev)", file: "stairs.mp4", stream: "stairs-cam" },
  { code: "stairs-people-01", name: "Stairs People (dev)", file: "stairs_people.mp4", stream: "stairs-people-cam" },
  { code: "office-01", name: "Office (dev)", file: "office.mp4", stream: "office-cam" },
  { code: "plant-01", name: "Plant (dev)", file: "plant.mp4", stream: "plant-cam" },
  { code: "road-01", name: "Road (dev)", file: "road.mp4", stream: "road-cam" },
  { code: "use-phone-4-01", name: "Use Phone 4 (dev)", file: "use_phone_4.MOV", stream: "use-phone-4-cam" },
];

async function resolveSectionId(): Promise<mongoose.Types.ObjectId> {
  const existing = await SectionModel.findOne().lean();
  if (existing) return existing._id;
  let area = await AreaModel.findOne().lean();
  if (!area) {
    area = (await AreaModel.create({ code: "dev-area", name: "Dev Area" })).toObject();
    console.log("  + created Area 'Dev Area'");
  }
  const section = await SectionModel.create({ code: "dev-section", name: "Dev Section", areaId: area._id });
  console.log("  + created Section 'Dev Section'");
  return section._id;
}

async function resolvePicId(): Promise<mongoose.Types.ObjectId> {
  const existing = await PicModel.findOne().lean();
  if (existing) return existing._id;
  const pic = await PicModel.create({ name: "Dev PIC", email: "dev-pic@cctv.local" });
  console.log("  + created PIC 'Dev PIC'");
  return pic._id;
}

async function seed(): Promise<void> {
  await connectMongo();
  const sectionId = await resolveSectionId();
  const picId = await resolvePicId();
  const tempDir = path.resolve(process.cwd(), "temp");

  for (const c of CAMERAS) {
    const filePath = path.join(tempDir, c.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`  ⚠ skip ${c.code}: ${filePath} tidak ada`);
      continue;
    }
    const rtspUrl = USE_FILE ? filePath : `rtsp://localhost:8554/${c.stream}`;
    const existing = await CameraModel.findOne({ code: c.code });
    if (existing) {
      existing.set({ name: c.name, rtspUrl, sectionId, defaultPicIds: [picId], isActive: true });
      await existing.save();
    } else {
      await CameraModel.create({
        code: c.code,
        name: c.name,
        rtspUrl,
        sectionId,
        defaultPicIds: [picId],
        isActive: true,
      });
    }
    console.log(`  ✓ ${c.code} → ${rtspUrl}`);
  }

  console.log(
    USE_FILE
      ? "\nMode FILE: kamera baca file langsung — backend cukup `npm run dev`."
      : "\nMode RTSP: jalankan `npm run dev:full` (MediaMTX+ffmpeg) agar stream hidup.",
  );
}

seed()
  .catch((error) => {
    console.error("Seed dev cameras failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
