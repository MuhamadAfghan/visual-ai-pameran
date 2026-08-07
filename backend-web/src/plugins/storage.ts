import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { env } from "../config/env";

const MAX_BYTES = 512_000; // 500 KB

async function ensureUnder500KB(buf: Buffer): Promise<Buffer> {
  if (buf.length <= MAX_BYTES) return buf;
  for (const q of [80, 65, 50, 35]) {
    const out = await sharp(buf).jpeg({ quality: q }).toBuffer();
    if (out.length <= MAX_BYTES) return out;
  }
  return sharp(buf).jpeg({ quality: 20 }).toBuffer();
}

export type SavedSnapshot = {
  filePath: string;
  publicUrl: string;
};

/**
 * Overwrites the "latest" snapshot for a camera.
 * Path: {STORAGE_BASE_PATH}/latest/{cameraId}.jpg
 * Used for dashboard/card display — one file per camera, always current.
 */
export async function saveLatestSnapshot(
  cameraId: string,
  buffer: Buffer
): Promise<SavedSnapshot> {
  const relPath = path.join("latest", `${cameraId}.jpg`);
  const absPath = path.resolve(env.STORAGE_BASE_PATH, relPath);

  const compressed = await ensureUnder500KB(buffer);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, compressed);

  const publicUrl = `${env.STORAGE_BASE_URL}/latest/${cameraId}.jpg`;
  return { filePath: absPath, publicUrl };
}

/**
 * Saves a timestamped evidence snapshot for a violation event.
 * Path: {STORAGE_BASE_PATH}/evidence/{cameraId}/{timestamp}[_suffix].jpg
 * Only called when violations are detected — these are permanent records.
 * Pass `ts` to share the same timestamp between annotated/original pair.
 */
export async function saveEvidenceSnapshot(
  cameraId: string,
  buffer: Buffer,
  opts: { suffix?: string; ts?: number } = {}
): Promise<SavedSnapshot> {
  const ts = opts.ts ?? Date.now();
  const filename = opts.suffix ? `${ts}_${opts.suffix}.jpg` : `${ts}.jpg`;
  const relPath = path.join("evidence", cameraId, filename);
  const absPath = path.resolve(env.STORAGE_BASE_PATH, relPath);

  const compressed = await ensureUnder500KB(buffer);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, compressed);

  const publicUrl = `${env.STORAGE_BASE_URL}/${relPath.replace(/\\/g, "/")}`;
  return { filePath: absPath, publicUrl };
}

/**
 * Recursively sums file sizes under a directory.
 */
export async function calcStorageBytes(dir: string): Promise<number> {
  let total = 0;
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  await Promise.all(
    entries.map(async (e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        total += await calcStorageBytes(full);
      } else {
        const stat = await fs.stat(full).catch(() => null);
        if (stat) total += stat.size;
      }
    })
  );
  return total;
}

/**
 * Deletes a snapshot file. Silently ignores missing files.
 */
export async function deleteSnapshot(filePath: string): Promise<void> {
  await fs.unlink(filePath).catch(() => {});
}

/**
 * Removes all snapshots associated with a camera:
 * - latest/{cameraId}.jpg
 * - evidence/{cameraId}/ (recursive)
 * Best-effort: missing files/dirs are silently ignored.
 */
export async function deleteAllCameraSnapshots(cameraId: string): Promise<void> {
  const latestPath = path.resolve(env.STORAGE_BASE_PATH, "latest", `${cameraId}.jpg`);
  const evidenceDir = path.resolve(env.STORAGE_BASE_PATH, "evidence", cameraId);
  await Promise.all([
    fs.unlink(latestPath).catch(() => {}),
    fs.rm(evidenceDir, { recursive: true, force: true }).catch(() => {})
  ]);
}
