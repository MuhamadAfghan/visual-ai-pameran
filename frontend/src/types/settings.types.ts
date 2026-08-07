export type SystemSettings = {
  smtp: {
    host: string;
    port: number;
    user: string;
    from: string;
    fromName?: string;
    secure: boolean;
  };
  notification: {
    cooldownMinutes: number;
    maxEmailsPerHour: number;
  };
  retention: {
    dataDays: number;
    snapshotDays: number;
  };
  capture: {
    defaultInterval: number;
    defaultCooldown: number;
  };
};
