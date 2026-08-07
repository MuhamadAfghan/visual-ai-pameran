export function suggestCode(name: string, maxLen = 6): string {
  return name
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, maxLen);
}
