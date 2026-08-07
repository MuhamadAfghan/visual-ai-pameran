import { useMemo } from "react";
import type { Camera } from "../../types/camera.types";
import type { Section } from "../../types/section.types";

/**
 * CCTV HUD-style section popup used on map pin clicks.
 * Looks like an on-screen overlay from a real surveillance system.
 * Always dark regardless of app theme — OSD overlays are always dark in real CCTV.
 *
 * Shared between guest map-view and admin section-map pages.
 */

export const HUD_STATUS_COLORS = {
  online: "#22c55e",
  offline: "#6b7280",
  maintenance: "#f59e0b",
  violation: "#ef4444"
} as const;

export type HudSectionStatus = keyof typeof HUD_STATUS_COLORS;

// eslint-disable-next-line react-refresh/only-export-components
export function getHudSectionStatus(
  cameras: Camera[],
  violations: number
): HudSectionStatus {
  if (violations > 0) return "violation";
  if (cameras.some((c) => c.status === "online")) return "online";
  if (cameras.some((c) => c.status === "maintenance")) return "maintenance";
  return "offline";
}

/** Inline `<style>` content with the HUD animations. Embed once at page level. */
export const HUD_KEYFRAMES_CSS = `
  @keyframes hud-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.9); }
  }
  @keyframes hud-blink {
    0%, 60%, 100% { opacity: 1; }
    70%, 90% { opacity: 0.3; }
  }
`;

/** Leaflet `.leaflet-popup-*` overrides — wrap with your own className selector. */
// eslint-disable-next-line react-refresh/only-export-components
export function hudPopupCss(className: string): string {
  return `
    .${className} .leaflet-popup-content-wrapper {
      padding: 0;
      overflow: hidden;
      border-radius: 8px;
      background: #0a0a0f;
      color: #e2e2e8;
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 12px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04);
    }
    .${className} .leaflet-popup-content {
      margin: 0;
      width: 320px !important;
      line-height: 1.4;
    }
    .${className} .leaflet-popup-tip {
      background: #0a0a0f;
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: none;
    }
    .${className} .leaflet-popup-close-button {
      top: 6px !important;
      right: 6px !important;
      color: rgba(255,255,255,0.5) !important;
      font-size: 16px !important;
      width: 20px !important;
      height: 20px !important;
      line-height: 18px !important;
      background: rgba(255,255,255,0.06) !important;
      border-radius: 4px !important;
      font-weight: 400 !important;
    }
    .${className} .leaflet-popup-close-button:hover {
      color: #fff !important;
      background: rgba(255,255,255,0.14) !important;
    }
  `;
}

type Props = {
  section: Section;
  cameras: Camera[];
  violations?: number;
  /** Called when a camera thumbnail is clicked. */
  onCameraClick: (cameraId: string) => void;
  /** Called when "Open in Camera Wall" CTA is clicked. Receives areaId and sectionId. */
  onOpenSection: (info: { areaId: string; sectionId: string }) => void;
  /** Label of the bottom CTA button. */
  ctaLabel?: string;
};

export function CctvHudSectionPopup({
  section,
  cameras,
  violations = 0,
  onCameraClick,
  onOpenSection,
  ctaLabel = "Open in Camera Wall"
}: Props) {
  const cacheBust = useMemo(() => Date.now(), []);

  const areaName = typeof section.areaId === "object" ? section.areaId.name : "—";
  const areaCode = typeof section.areaId === "object" ? section.areaId.code : "—";
  const areaId =
    typeof section.areaId === "object" ? section.areaId._id : section.areaId ?? "";

  const onlineCount = cameras.filter((c) => c.status === "online").length;
  const offlineCount = cameras.filter((c) => c.status === "offline").length;
  const maintCount = cameras.filter((c) => c.status === "maintenance").length;
  const hasViolation = violations > 0;
  const hasLive = onlineCount > 0;

  // Sort by status priority (online first) then by recent capture
  const sortedCams = [...cameras].sort((a, b) => {
    const sa = a.status === "online" ? 0 : a.status === "maintenance" ? 1 : 2;
    const sb = b.status === "online" ? 0 : b.status === "maintenance" ? 1 : 2;
    if (sa !== sb) return sa - sb;
    const ta = a.lastCaptureAt ? new Date(a.lastCaptureAt).getTime() : 0;
    const tb = b.lastCaptureAt ? new Date(b.lastCaptureAt).getTime() : 0;
    return tb - ta;
  });
  const visibleCams = sortedCams.slice(0, 6);
  const extraCount = cameras.length - visibleCams.length;

  const accentColor = hasViolation ? "#ef4444" : hasLive ? "#22c55e" : "#6b7280";

  return (
    <div
      style={{
        position: "relative",
        width: 320,
        background: "#0a0a0f",
        color: "#e2e2e8",
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace, "Inter", sans-serif',
        backgroundImage: `repeating-linear-gradient(
          0deg,
          rgba(255,255,255,0.018),
          rgba(255,255,255,0.018) 1px,
          transparent 1px,
          transparent 3px
        )`
      }}
    >
      <Bracket position="tl" color={accentColor} />
      <Bracket position="tr" color={accentColor} />
      <Bracket position="bl" color={accentColor} />
      <Bracket position="br" color={accentColor} />

      <div style={{ padding: "14px 14px 12px" }}>
        {/* HEADER PATH */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 8,
            fontSize: 9.5,
            color: "rgba(226,226,232,0.55)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontWeight: 600
          }}
        >
          <span style={{ color: "rgba(226,226,232,0.4)" }}>SEC</span>
          <span style={{ color: "rgba(226,226,232,0.25)" }}>›</span>
          <span style={{ color: "#e2e2e8" }}>{areaCode}</span>
          <span style={{ color: "rgba(226,226,232,0.25)" }}>/</span>
          <span style={{ color: "#e2e2e8" }}>{section.code}</span>

          {hasLive && (
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#ef4444",
                  animation: "hud-blink 1.4s ease-in-out infinite",
                  boxShadow: "0 0 6px rgba(239,68,68,0.7)"
                }}
              />
              <span
                style={{
                  fontSize: 9,
                  color: "#ef4444",
                  fontWeight: 700,
                  letterSpacing: "0.16em"
                }}
              >
                REC
              </span>
            </span>
          )}
        </div>

        {/* SECTION NAME */}
        <h3
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: "#ffffff",
            margin: 0,
            marginBottom: 3,
            lineHeight: 1.2,
            fontFamily: "'Inter', sans-serif",
            letterSpacing: "-0.01em"
          }}
        >
          {section.name}
        </h3>
        <p
          style={{
            fontSize: 10.5,
            color: "rgba(226,226,232,0.5)",
            margin: 0,
            marginBottom: 12,
            letterSpacing: "0.04em"
          }}
        >
          {areaName.toUpperCase()} ·{" "}
          <span style={{ color: "#e2e2e8", fontWeight: 600 }}>{cameras.length} CAM</span>
        </p>

        {/* VIOLATION BANNER */}
        {hasViolation && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 10px",
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.4)",
              borderRadius: 4,
              marginBottom: 12
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#ef4444",
                animation: "hud-pulse 1.2s ease-in-out infinite",
                flexShrink: 0,
                boxShadow: "0 0 8px rgba(239,68,68,0.8)"
              }}
            />
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: "#fca5a5",
                letterSpacing: "0.08em",
                textTransform: "uppercase"
              }}
            >
              {violations} Active Violation{violations > 1 ? "s" : ""}
            </span>
          </div>
        )}

        {/* STATUS ROW */}
        {cameras.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <SectionLabel>Status</SectionLabel>
            <div style={{ display: "flex", gap: 14, fontSize: 10.5, marginTop: 4 }}>
              <StatusInline color={HUD_STATUS_COLORS.online} count={onlineCount} label="online" />
              {maintCount > 0 && (
                <StatusInline
                  color={HUD_STATUS_COLORS.maintenance}
                  count={maintCount}
                  label="maint"
                />
              )}
              {offlineCount > 0 && (
                <StatusInline
                  color={HUD_STATUS_COLORS.offline}
                  count={offlineCount}
                  label="offline"
                />
              )}
            </div>
          </div>
        )}

        {/* LIVE FEEDS GRID */}
        {visibleCams.length > 0 ? (
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 5
              }}
            >
              <SectionLabel>Live Feeds</SectionLabel>
              {extraCount > 0 && (
                <span
                  style={{
                    fontSize: 9.5,
                    color: "rgba(226,226,232,0.55)",
                    letterSpacing: "0.1em",
                    fontWeight: 600
                  }}
                >
                  +{extraCount} MORE
                </span>
              )}
            </div>
            <div
              style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}
            >
              {visibleCams.map((cam) => (
                <CameraThumbnail
                  key={cam._id}
                  camera={cam}
                  cacheBust={cacheBust}
                  onClick={() => onCameraClick(cam._id)}
                />
              ))}
            </div>
          </div>
        ) : (
          <p
            style={{
              fontSize: 11,
              color: "rgba(226,226,232,0.45)",
              textAlign: "center",
              padding: "12px 0",
              margin: 0,
              border: "1px dashed rgba(255,255,255,0.1)",
              borderRadius: 4,
              marginBottom: 12
            }}
          >
            NO CAMERAS IN SECTION
          </p>
        )}

        {/* CTA */}
        <button
          onClick={() => onOpenSection({ areaId, sectionId: section._id })}
          disabled={cameras.length === 0}
          style={{
            width: "100%",
            padding: "9px 0",
            fontSize: 10.5,
            fontWeight: 700,
            border: "none",
            borderRadius: 4,
            cursor: cameras.length === 0 ? "not-allowed" : "pointer",
            background: hasViolation ? "#ef4444" : "#F03252",
            color: "#fff",
            fontFamily: "ui-monospace, monospace",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            opacity: cameras.length === 0 ? 0.4 : 1
          }}
        >
          <span style={{ fontSize: 9 }}>▶</span>
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}

/* ── HUD helpers ─────────────────────────────────────────────── */

function Bracket({
  position,
  color
}: {
  position: "tl" | "tr" | "bl" | "br";
  color: string;
}) {
  const size = 12;
  const inset = 5;
  const thickness = 1.5;
  const base: React.CSSProperties = {
    position: "absolute",
    width: size,
    height: size,
    pointerEvents: "none",
    zIndex: 2
  };
  const corners: Record<typeof position, React.CSSProperties> = {
    tl: {
      top: inset,
      left: inset,
      borderTop: `${thickness}px solid ${color}`,
      borderLeft: `${thickness}px solid ${color}`
    },
    tr: {
      top: inset,
      right: inset,
      borderTop: `${thickness}px solid ${color}`,
      borderRight: `${thickness}px solid ${color}`
    },
    bl: {
      bottom: inset,
      left: inset,
      borderBottom: `${thickness}px solid ${color}`,
      borderLeft: `${thickness}px solid ${color}`
    },
    br: {
      bottom: inset,
      right: inset,
      borderBottom: `${thickness}px solid ${color}`,
      borderRight: `${thickness}px solid ${color}`
    }
  };
  return <div style={{ ...base, ...corners[position] }} />;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 8.5,
        color: "rgba(226,226,232,0.45)",
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        fontWeight: 700
      }}
    >
      {children}
    </div>
  );
}

function StatusInline({ color, count, label }: { color: string; count: number; label: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color,
          boxShadow: count > 0 ? `0 0 5px ${color}80` : "none",
          flexShrink: 0
        }}
      />
      <span
        style={{
          color: count > 0 ? "#e2e2e8" : "rgba(226,226,232,0.4)",
          fontWeight: 700,
          fontFamily: "ui-monospace, monospace"
        }}
      >
        {count}
      </span>
      <span
        style={{
          color: "rgba(226,226,232,0.45)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontSize: 9.5,
          fontWeight: 600
        }}
      >
        {label}
      </span>
    </span>
  );
}

function CameraThumbnail({
  camera,
  cacheBust,
  onClick
}: {
  camera: Camera;
  cacheBust: number;
  onClick: () => void;
}) {
  const url = camera.latestSnapshotUrl ? `${camera.latestSnapshotUrl}?t=${cacheBust}` : null;
  const isOnline = camera.status === "online";
  const statusColor =
    HUD_STATUS_COLORS[camera.status as keyof typeof HUD_STATUS_COLORS] ?? HUD_STATUS_COLORS.offline;
  return (
    <button
      onClick={onClick}
      type="button"
      style={{
        position: "relative",
        aspectRatio: "16 / 9",
        background: "#000",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 3,
        cursor: "pointer",
        padding: 0,
        overflow: "hidden",
        transition: "border-color 0.15s"
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = "#F03252";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.08)";
      }}
    >
      {url ? (
        <img
          src={url}
          alt={camera.code}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : null}

      {!isOnline && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 7.5,
            color: "rgba(255,255,255,0.55)",
            fontFamily: "ui-monospace, monospace",
            letterSpacing: "0.14em",
            fontWeight: 700
          }}
        >
          {camera.status === "maintenance" ? "MAINT" : "OFFLN"}
        </div>
      )}

      <span
        style={{
          position: "absolute",
          top: 3,
          left: 3,
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: statusColor,
          boxShadow: isOnline
            ? `0 0 0 1.5px rgba(0,0,0,0.6), 0 0 4px ${statusColor}`
            : "0 0 0 1.5px rgba(0,0,0,0.6)",
          animation: isOnline ? "hud-blink 1.6s ease-in-out infinite" : "none"
        }}
      />

      {isOnline && (
        <span
          style={{
            position: "absolute",
            top: 3,
            right: 3,
            fontSize: 7,
            fontFamily: "ui-monospace, monospace",
            color: "#ef4444",
            fontWeight: 700,
            background: "rgba(0,0,0,0.55)",
            padding: "1px 3px",
            borderRadius: 2,
            letterSpacing: "0.1em"
          }}
        >
          ●REC
        </span>
      )}

      <span
        style={{
          position: "absolute",
          left: 3,
          right: 3,
          bottom: 3,
          fontSize: 8,
          fontFamily: "ui-monospace, monospace",
          color: "#fff",
          background: "rgba(0,0,0,0.7)",
          padding: "1.5px 4px",
          borderRadius: 2,
          textAlign: "center",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          letterSpacing: "0.04em",
          fontWeight: 600
        }}
      >
        {camera.code}
      </span>
    </button>
  );
}
