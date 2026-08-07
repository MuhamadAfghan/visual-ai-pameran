import pino from "pino";
import { runCleanup } from "../services/cleanup.service";

const logger = pino({ name: "cleanup-worker" });

async function tick(): Promise<void> {
  try {
    const r = await runCleanup();
    logger.info(
      { events: r.eventsDeleted, snapshots: r.snapshotFilesDeleted, logs: r.logsDeleted },
      "Cleanup done"
    );
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "Cleanup failed");
  }
}

function msUntilNextRun(hourUtc: number, minuteUtc: number): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(hourUtc, minuteUtc, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.getTime() - now.getTime();
}

// Daily cleanup at 02:00 UTC. Was a BullMQ repeatable job with cron "0 2 * * *".
export function registerCleanupSchedule(): void {
  const delay = msUntilNextRun(2, 0);
  const initial = setTimeout(() => {
    void tick();
    const interval = setInterval(() => void tick(), 24 * 60 * 60 * 1_000);
    interval.unref();
  }, delay);
  initial.unref();

  const hours = Math.round(delay / 3_600_000 * 10) / 10;
  logger.info({ nextRunInHours: hours }, "Cleanup schedule registered (daily 02:00 UTC)");
}
