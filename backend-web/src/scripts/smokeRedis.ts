import { redis } from "../config/redis";
import { inferQueue } from "../queues/infer.queue";
import { notificationQueue } from "../queues/notification.queue";

async function main(): Promise<void> {
  const pong = await redis.ping();
  console.log(`redis PING            → ${pong}`);
  console.log(`redis server version  → ${(await redis.info("server")).match(/redis_version:(\S+)/)?.[1] ?? "?"}`);

  const [infer, notif] = await Promise.all([
    inferQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed"),
    notificationQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed"),
  ]);

  console.log("\nBullMQ queue states:");
  console.log("  infer         :", JSON.stringify(infer));
  console.log("  notification  :", JSON.stringify(notif));

  await redis.quit();
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
