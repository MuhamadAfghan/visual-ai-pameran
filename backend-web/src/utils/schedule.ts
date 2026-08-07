// Schedule-activeness check for camera mappings. Pure + timezone-aware; `now` is
// injectable (defaults to the current time) so the logic can be unit-tested
// deterministically. Extracted from framePipeline.service so it carries no DB/queue
// imports and can be exercised in isolation.

export type MappingScheduleLike = {
  type: string;
  timeRanges?: Array<{ start: string; end: string }>;
  daysOfWeek?: number[];
};

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

export function isScheduleActive(
  schedule: MappingScheduleLike,
  timezone: string,
  now: Date = new Date()
): boolean {
  if (schedule.type === "always") return true;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now);

  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const weekdayLabel = parts.find((p) => p.type === "weekday")?.value ?? "";
  const dayOfWeek = WEEKDAY_MAP[weekdayLabel] ?? now.getDay();
  const currentTime = `${hour === "24" ? "00" : hour}:${minute}`;

  if (schedule.daysOfWeek?.length && !schedule.daysOfWeek.includes(dayOfWeek)) {
    return false;
  }

  if (schedule.timeRanges?.length) {
    return schedule.timeRanges.some((r) => currentTime >= r.start && currentTime <= r.end);
  }

  return true;
}
