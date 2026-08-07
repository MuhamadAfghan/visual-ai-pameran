import { describe, it, expect } from "vitest";

// Format schedule logic yang dipakai di mappings.page.tsx dan camera-mappings.page.tsx
const DAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function formatSchedule(schedule: {
  type: "always" | "time_range";
  daysOfWeek?: number[];
  timeRanges?: Array<{ start: string; end: string }>;
}): string {
  if (schedule.type === "always") return "Selalu aktif";
  const dayStr = schedule.daysOfWeek?.map((d) => DAYS[d]).join(", ") ?? "—";
  const range = schedule.timeRanges?.[0];
  return range ? `${dayStr} · ${range.start}–${range.end}` : dayStr;
}

describe("formatSchedule", () => {
  it("always schedule", () => {
    expect(formatSchedule({ type: "always" })).toBe("Selalu aktif");
  });

  it("time_range dengan hari kerja dan jam", () => {
    expect(
      formatSchedule({
        type: "time_range",
        daysOfWeek: [1, 2, 3, 4, 5],
        timeRanges: [{ start: "08:00", end: "17:00" }]
      })
    ).toBe("Sen, Sel, Rab, Kam, Jum · 08:00–17:00");
  });

  it("time_range tanpa timeRanges hanya tampil hari", () => {
    expect(
      formatSchedule({
        type: "time_range",
        daysOfWeek: [0, 6],
        timeRanges: []
      })
    ).toBe("Min, Sab");
  });

  it("time_range tanpa daysOfWeek", () => {
    expect(
      formatSchedule({
        type: "time_range",
        daysOfWeek: [],
        timeRanges: [{ start: "09:00", end: "18:00" }]
      })
    ).toBe(" · 09:00–18:00");
  });
});
