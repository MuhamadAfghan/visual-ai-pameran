import { EventEmitter } from "node:events";

export const violationEmitter = new EventEmitter();
violationEmitter.setMaxListeners(200);

// Kept for backwards compat with existing call sites.
// The previous implementation bootstrapped a Redis pub/sub subscriber;
// in single-process mode the EventEmitter above is the bus, so this is a no-op.
export function initViolationSubscriber(): void {
  // intentionally empty
}

export async function publishViolation(data: object): Promise<void> {
  violationEmitter.emit("violation", JSON.stringify(data));
}
