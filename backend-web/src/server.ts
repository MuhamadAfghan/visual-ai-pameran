import mongoose from "mongoose";
import { buildApp } from "./app";
import { env } from "./config/env";
import { connectMongo } from "./config/mongo";
import { initCaptureHubs, shutdownAllHubs } from "./plugins/cameraStreamHub";
import { registerInferenceWorker } from "./workers/inferenceWorker";
import { registerNotificationWorker } from "./workers/notificationWorker";
import { registerCleanupSchedule } from "./workers/cleanupWorker";

async function bootstrap(): Promise<void> {
  await connectMongo();

  registerInferenceWorker();
  registerNotificationWorker();
  registerCleanupSchedule();

  await initCaptureHubs();

  const app = buildApp();

  app.listen(env.PORT, () => {
    console.log(`backend-web listening on :${env.PORT}`);
  });
}

// Kill any live stream-hub ffmpeg processes so they don't orphan on exit.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    shutdownAllHubs();
    void mongoose.disconnect().finally(() => process.exit(0));
  });
}

bootstrap().catch(async (error) => {
  console.error("Server bootstrap failed", error);
  await mongoose.disconnect();
  process.exit(1);
});
