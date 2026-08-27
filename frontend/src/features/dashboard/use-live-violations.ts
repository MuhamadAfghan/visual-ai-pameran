import { useViolationStream } from "../../app/violation-alert-provider";
export type { LiveViolation, SseStatus } from "../../app/violation-alert-provider";

/** Thin consumer over the app-wide violation stream owned by ViolationAlertProvider. */
export function useLiveViolations() {
  const { events, status } = useViolationStream();
  return { events, status };
}
