/**
 * Seed kamera dev dari video di backend/temp/ (street, stairs, stairs_people, dst).
 *
 * Default rtspUrl = rtsp://<RTSP_FAKE_HOST>:8554/<path> → cocok dengan $Streams di
 * scripts/dev/start-fake-rtsp.ps1 (native Windows: `npm run dev:full` agar stream
 * hidup) atau docker-compose profile "fake-rtsp" (`docker compose --profile
 * fake-rtsp up -d`). RTSP_FAKE_HOST default "localhost" (native); set ke
 * "mediamtx" saat menjalankan seed ini DI DALAM container backend-web, karena
 * dari situ "localhost" merujuk ke container itu sendiri, bukan host MediaMTX:
 *
 *   docker compose exec -e RTSP_FAKE_HOST=mediamtx backend-web node dist/scripts/seedDevCameras.js
 *
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
const RTSP_FAKE_HOST = process.env.RTSP_FAKE_HOST || "localhost";

const CAMERAS = [
  { code: "street-01", name: "Street (dev)", file: "street.mp4", stream: "street-cam" },
  { code: "stairs-01", name: "Stairs (dev)", file: "stairs.mp4", stream: "stairs-cam" },
  { code: "stairs-people-01", name: "Stairs People (dev)", file: "stairs_people.mp4", stream: "stairs-people-cam" },
  { code: "office-01", name: "Office (dev)", file: "office.mp4", stream: "office-cam" },
  { code: "plant-01", name: "Plant (dev)", file: "plant.mp4", stream: "plant-cam" },
  { code: "road-01", name: "Road (dev)", file: "road.mp4", stream: "road-cam" },
  { code: "use-phone-4-01", name: "Use Phone 4 (dev)", file: "use_phone_4.MOV", stream: "use-phone-4-cam" },
  { code: "construction-workers-01", name: "Construction Workers (dev)", file: "construction_workers.mp4", stream: "construction-workers-cam" },
  { code: "construction-site-01", name: "Construction Site (dev)", file: "construction_site.mp4", stream: "construction-site-cam" },
  { code: "construction-ppe-01", name: "Construction PPE (dev)", file: "construction_ppe.mp4", stream: "construction-ppe-cam" },
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
    const rtspUrl = USE_FILE ? filePath : `rtsp://${RTSP_FAKE_HOST}:8554/${c.stream}`;
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
      : `\nMode RTSP (host=${RTSP_FAKE_HOST}): jalankan MediaMTX+ffmpeg dulu agar stream hidup — ` +
        "native: `npm run dev:full` | docker: `docker compose --profile fake-rtsp up -d --build`.",
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
