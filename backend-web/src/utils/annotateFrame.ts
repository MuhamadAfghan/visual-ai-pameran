import sharp from "sharp";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";
import { EMBEDDED_FONT_BASE64 } from "./embeddedFont";

type Detection = {
  label: string;
  confidence: number;
  /** [x1, y1, x2, y2] in pixel coordinates of the original frame. */
  bbox: [number, number, number, number];
  attributes?: Record<string, string>;
};

type RedZone = {
  name: string;
  /** Polygon points in normalized [0, 1] coordinates. */
  points: Array<{ x: number; y: number }>;
};

// Detection labels that represent a rule violation on their own (see naming
// convention in ai/CLAUDE.md — most are `no_<noun>`, but hand_in_pocket,
// fall_detected and improper_mask are violations in their positive form).
const VIOLATION_LABELS = new Set([
  "no_mask",
  "improper_mask",
  "no_helmet",
  "no_vest",
  "no_goggles",
  "no_gloves",
  "fall_detected",
  "hand_in_pocket"
]);

const VIOLATION_COLOR = "#ef4444"; // red-500
const COMPLIANT_COLOR = "#22c55e"; // green-500

/** Red for violations (by label or red-zone attribute), green otherwise. */
function detectionColor(det: Detection): string {
  const inRedZone = det.attributes?.in_red_zone === "true";
  return inRedZone || VIOLATION_LABELS.has(det.label) ? VIOLATION_COLOR : COMPLIANT_COLOR;
}

/**
 * Load the bundled font once at module init and parse it via opentype.js so we
 * can convert label strings into SVG <path> outlines at render time.
 *
 * Why paths instead of <text> + @font-face:
 * librsvg (used by sharp to rasterize SVG) does NOT honor @font-face rules with
 * data: URLs. It looks up fonts by name through Pango+Fontconfig, which on
 * minimal containers (e.g. node:22-alpine) has no Latin fonts → tofu boxes.
 * By converting text to vector paths, librsvg just renders geometry — no font
 * lookup, works on any environment.
 *
 * The font binary is sourced from (in order):
 *   1. on-disk TTF (allows swapping the font without a code rebuild during dev)
 *   2. EMBEDDED_FONT_BASE64 (guaranteed to be present — compiled into the JS bundle)
 */
const FONT: opentype.Font = (() => {
  const candidates = [
    resolve(__dirname, "../../assets/fonts/TitilliumWeb-Bold.ttf"),
    resolve(process.cwd(), "assets/fonts/TitilliumWeb-Bold.ttf"),
    resolve(process.cwd(), "backend-web/assets/fonts/TitilliumWeb-Bold.ttf")
  ];

  for (const fontPath of candidates) {
    try {
      const buf = readFileSync(fontPath);
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      const f = opentype.parse(ab);
      console.log(`[annotateFrame] Loaded label font (path-rendered) from ${fontPath}`);
      return f;
    } catch {
      // try next candidate
    }
  }

  // Embedded fallback — always present, compiled into JS bundle.
  const buf = Buffer.from(EMBEDDED_FONT_BASE64, "base64");
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const f = opentype.parse(ab);
  console.log("[annotateFrame] Using embedded label font (path-rendered)");
  return f;
})();

/**
 * Render `text` at baseline (x, y) at `fontSize` px as an SVG <path>.
 * The path is geometry only — no font lookup needed at rasterization time.
 */
function textPath(text: string, x: number, y: number, fontSize: number, fill: string): string {
  const p = FONT.getPath(text, x, y, fontSize);
  return `<path d="${p.toPathData(2)}" fill="${fill}"/>`;
}

function buildSvg(w: number, h: number, detections: Detection[], redZones: RedZone[]): string {
  const parts: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`];

  // ── Red zones (normalized 0-1 → scale to pixels) ─────────────────────────
  for (const zone of redZones) {
    if (zone.points.length < 3) continue;
    const pts = zone.points
      .map((p) => `${(p.x * w).toFixed(1)},${(p.y * h).toFixed(1)}`)
      .join(" ");
    parts.push(
      `<polygon points="${pts}" fill="rgba(239,68,68,0.10)" stroke="#ef4444" stroke-width="2" stroke-dasharray="6 3"/>`
    );
    if (zone.name) {
      const lx = zone.points[0].x * w + 6;
      const ly = zone.points[0].y * h - 5;
      parts.push(textPath(zone.name, lx, ly, 14, "#ef4444"));
    }
  }

  // ── Bounding boxes (already in pixel coordinates) ────────────────────────
  for (const det of detections) {
    const [x1, y1, x2, y2] = det.bbox;
    const bw = x2 - x1;
    const bh = y2 - y1;
    if (bw <= 0 || bh <= 0) continue;

    const color = detectionColor(det);

    const pct = Math.round(det.confidence * 100);
    const label = `${det.label} ${pct}%`;
    const labelFontSize = 13;
    // opentype.js gives us the exact advance width — no more rough estimation.
    const textW = FONT.getAdvanceWidth(label, labelFontSize);
    const labelW = textW + 10; // 5px padding on each side
    const labelH = 18;
    const labelY = y1 >= labelH ? y1 - labelH : y1 + bh;

    parts.push(
      `<rect x="${x1.toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="none" stroke="${color}" stroke-width="2"/>`,
      `<rect x="${x1.toFixed(1)}" y="${labelY.toFixed(1)}" width="${labelW.toFixed(1)}" height="${labelH}" fill="${color}" fill-opacity="0.9"/>`,
      textPath(label, x1 + 5, labelY + 13, labelFontSize, "white")
    );
  }

  parts.push("</svg>");
  return parts.join("\n");
}

/**
 * Draws bounding boxes and red-zone polygons onto a JPEG frame buffer.
 * - `detections[].bbox` is in PIXEL coords of the original frame (as returned by the AI service).
 * - `redZones[].points` are NORMALIZED [0, 1] (as stored on the Camera model).
 */
export async function annotateFrame(
  frameBuffer: Buffer,
  detections: Detection[],
  redZones: RedZone[]
): Promise<Buffer> {
  if (detections.length === 0 && redZones.length === 0) return frameBuffer;

  const meta = await sharp(frameBuffer).metadata();
  const w = meta.width ?? 1280;
  const h = meta.height ?? 720;

  const svg = buildSvg(w, h, detections, redZones);
  const svgBuf = Buffer.from(svg);

  return sharp(frameBuffer)
    .composite([{ input: svgBuf, top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer();
}
