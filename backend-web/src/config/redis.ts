import Redis from "ioredis";
import { env } from "./env";

// BullMQ requires `maxRetriesPerRequest: null` and `enableReadyCheck: false`
// on the connection it uses for blocking commands (worker / queue events).
// We expose a single shared instance — BullMQ duplicates it internally when
// needed for blocking calls.
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redis.on("error", (err) => {
  // Don't crash the process on transient errors — ioredis auto-reconnects.
  console.error("[redis] connection error:", err.message);
});
