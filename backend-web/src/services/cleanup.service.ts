import { DetectionEventModel } from "../models/detectionEvent.model";
import { NotificationLogModel } from "../models/notificationLog.model";
import { deleteSnapshot } from "../plugins/storage";
import { getSettings } from "./systemSettings.service";

export type CleanupResult = {
  eventsDeleted: number;
  snapshotFilesDeleted: number;
  logsDeleted: number;
};

export async function runCleanup(): Promise<CleanupResult> {
  const settings = await getSettings();
  const now = new Date();

  // 1. Find expired events that have snapshot files to delete from disk
  const expiredWithFiles = await DetectionEventModel.find(
    { expiresAt: { $lte: now }, snapshotPath: { $ne: null } },
    { snapshotPath: 1 }
  ).lean();

  let snapshotFilesDeleted = 0;
  for (const event of expiredWithFiles) {
    if (event.snapshotPath) {
      await deleteSnapshot(event.snapshotPath as string);
      snapshotFilesDeleted++;
    }
  }

  // 2. Hard-delete expired DetectionEvents (MongoDB TTL does this too, belt-and-suspenders)
  const eventsResult = await DetectionEventModel.deleteMany({ expiresAt: { $lte: now } });

  // 3. Purge old NotificationLogs beyond retention window
  const retentionDays = settings.retention?.dataDays ?? 30;
  const logCutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const logsResult = await NotificationLogModel.deleteMany({
    createdAt: { $lt: logCutoff }
  });

  return {
    eventsDeleted: eventsResult.deletedCount,
    snapshotFilesDeleted,
    logsDeleted: logsResult.deletedCount
  };
}
