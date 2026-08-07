import { Queue } from "bullmq";
import { redis } from "../config/redis";

export type NotificationJobPayload = {
  eventId: string;
  cameraId: string;
};

export const notificationQueue = new Queue<NotificationJobPayload>("notification-jobs", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 1000 },
  },
});
