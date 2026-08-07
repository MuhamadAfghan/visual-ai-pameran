import assert from "node:assert/strict";
import { test } from "node:test";
import { isScheduleActive } from "./schedule";

// All cases use timezone "UTC" + a fixed `now` so they're fully deterministic.
// 2024-01-01T10:30:00Z is a Monday (dayOfWeek 1) at 10:30.
const MONDAY_1030 = new Date("2024-01-01T10:30:00Z");

test('type "always" is active regardless of time/day', () => {
  assert.equal(isScheduleActive({ type: "always" }, "UTC", MONDAY_1030), true);
  assert.equal(isScheduleActive({ type: "always", daysOfWeek: [3] }, "UTC", MONDAY_1030), true);
});

test("time_range active when current time falls inside a range on an allowed day", () => {
  const schedule = {
    type: "time_range",
    daysOfWeek: [1], // Monday
    timeRanges: [{ start: "08:00", end: "17:00" }]
  };
  assert.equal(isScheduleActive(schedule, "UTC", MONDAY_1030), true);
});

test("time_range inactive when current time is before the range starts", () => {
  const schedule = {
    type: "time_range",
    daysOfWeek: [1],
    timeRanges: [{ start: "12:00", end: "17:00" }]
  };
  assert.equal(isScheduleActive(schedule, "UTC", MONDAY_1030), false);
});

test("time_range inactive when today's weekday is not allowed", () => {
  const schedule = {
    type: "time_range",
    daysOfWeek: [2, 3], // Tue/Wed — excludes Monday
    timeRanges: [{ start: "08:00", end: "17:00" }]
  };
  assert.equal(isScheduleActive(schedule, "UTC", MONDAY_1030), false);
});

test("time_range with an allowed day but no time ranges is active all day", () => {
  const schedule = { type: "time_range", daysOfWeek: [1], timeRanges: [] };
  assert.equal(isScheduleActive(schedule, "UTC", MONDAY_1030), true);
});

test("timezone shifts the effective local time", () => {
  // 10:30 UTC is 17:30 in Asia/Jakarta (UTC+7) — past a 08:00–17:00 window.
  const schedule = {
    type: "time_range",
    daysOfWeek: [1],
    timeRanges: [{ start: "08:00", end: "17:00" }]
  };
  assert.equal(isScheduleActive(schedule, "Asia/Jakarta", MONDAY_1030), false);
});
