import { useEffect, useState } from "react";

/**
 * Returns a cache-busted snapshot URL that refreshes every `intervalSeconds`.
 * Only ticks when the camera is online — no point refreshing an offline feed.
 */
export function useRefreshingSnapshot(
  baseUrl: string | null | undefined,
  intervalSeconds: number,
  isOnline: boolean
): string | null {
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    if (!baseUrl || !isOnline) return;
    const ms = Math.max(intervalSeconds, 5) * 1_000;
    const id = setInterval(() => setTick(Date.now()), ms);
    return () => clearInterval(id);
  }, [baseUrl, intervalSeconds, isOnline]);

  if (!baseUrl) return null;
  return `${baseUrl}?t=${tick}`;
}
