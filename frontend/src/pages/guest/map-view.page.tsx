import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useNavigate } from "react-router-dom";
import { MapPin, AlertTriangle, Video, AlertCircle } from "lucide-react";
import { getCameras } from "../../services/camera.service";
import { getSections } from "../../services/section.service";
import { getEvents } from "../../services/event.service";
import { useGuestTheme } from "../../layouts/guest-theme";
import { cn } from "../../utils/cn";
import {
  CctvHudSectionPopup,
  HUD_KEYFRAMES_CSS,
  hudPopupCss,
  HUD_STATUS_COLORS
} from "../../features/cameras/cctv-hud-popup";
import type { Camera } from "../../types/camera.types";
import type { Section } from "../../types/section.types";

// Fix Leaflet default marker icons broken by bundlers
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const STATUS_COLORS = HUD_STATUS_COLORS;

function getSectionStatus(
  cameras: Camera[],
  hasViolation: boolean
): keyof typeof STATUS_COLORS {
  if (hasViolation) return "violation";
  if (cameras.some((c) => c.status === "online")) return "online";
  if (cameras.some((c) => c.status === "maintenance")) return "maintenance";
  return "offline";
}

/** SVG marker pin colored by status, with optional pulse for violations. */
function createMarkerIcon(
  status: keyof typeof STATUS_COLORS,
  cameraCount: number,
  pulse: boolean
) {
  const color = STATUS_COLORS[status];
  const label = cameraCount > 99 ? "99+" : cameraCount.toString();
  const pulseRing = pulse
    ? `<circle cx="18" cy="16" r="14" fill="${color}" opacity="0.35">
         <animate attributeName="r" from="14" to="22" dur="1.4s" repeatCount="indefinite" />
         <animate attributeName="opacity" from="0.4" to="0" dur="1.4s" repeatCount="indefinite" />
       </circle>`
    : "";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
      <filter id="drop" x="-40%" y="-20%" width="180%" height="160%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.4)" />
      </filter>
      ${pulseRing}
      <path d="M18 1C9.71 1 3 7.71 3 16c0 11 15 27 15 27s15-16 15-27c0-8.29-6.71-15-15-15z"
        fill="${color}" stroke="white" stroke-width="2.5" filter="url(#drop)" />
      <circle cx="18" cy="16" r="9" fill="white" opacity="0.97" />
      <text x="18" y="20" text-anchor="middle" font-family="ui-monospace, monospace"
        font-size="11" font-weight="700" fill="${color}">${label}</text>
    </svg>
  `;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [36, 44],
    iconAnchor: [18, 44],
    popupAnchor: [0, -46],
  });
}

type SectionRow = Section & {
  cameras: Camera[];
  violations: number;
  status: keyof typeof STATUS_COLORS;
};

export function MapViewPage() {
  const { isDark } = useGuestTheme();
  const navigate = useNavigate();
  const [sections, setSections] = useState<Section[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [violationByCamera, setViolationByCamera] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [secs, cams] = await Promise.all([getSections(), getCameras()]);
      setSections(secs);
      setCameras(cams);

      try {
        const { items } = await getEvents({
          isViolation: true,
          status: "unacknowledged",
          limit: 200,
        });
        const map: Record<string, number> = {};
        items.forEach((ev) => {
          map[ev.cameraId] = (map[ev.cameraId] ?? 0) + 1;
        });
        setViolationByCamera(map);
      } catch {
        /* optional */
      }

      setLoading(false);
    }
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  // Group cameras + violations by section
  const sectionRows = useMemo<SectionRow[]>(() => {
    return sections.map((s) => {
      const camsInSection = cameras.filter((c) => {
        const sid = typeof c.sectionId === "object" ? c.sectionId._id : c.sectionId;
        return sid === s._id;
      });
      const violations = camsInSection.reduce(
        (sum, c) => sum + (violationByCamera[c._id] ?? 0),
        0
      );
      return {
        ...s,
        cameras: camsInSection,
        violations,
        status: getSectionStatus(camsInSection, violations > 0),
      };
    });
  }, [sections, cameras, violationByCamera]);

  const mappedRows = sectionRows.filter((s) => s.location != null);
  const unmappedCount = sectionRows.length - mappedRows.length;
  const totalOnline = cameras.filter((c) => c.status === "online").length;
  const totalViolations = Object.values(violationByCamera).reduce((a, b) => a + b, 0);

  // Light tile: standard OSM. Dark tile: CartoDB Dark Matter (free for non-commercial)
  const tileUrl = isDark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
  const tileAttr = `&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>`;

  return (
    <div className="flex flex-col h-full">
      <style>{`
        .leaflet-container { background: ${isDark ? "#0a0a0f" : "#e7e7e9"}; }
        ${hudPopupCss("guest-popup")}
        ${HUD_KEYFRAMES_CSS}
        .leaflet-control-zoom a {
          background: ${isDark ? "#13131a" : "#fff"} !important;
          color: ${isDark ? "#e2e2e8" : "#0F172A"} !important;
          border-color: ${isDark ? "#1e1e2e" : "#E2E8F0"} !important;
        }
        .leaflet-control-attribution {
          background: ${isDark ? "rgba(19,19,26,0.85)" : "rgba(255,255,255,0.85)"} !important;
          color: ${isDark ? "#8b8ba0" : "#475569"} !important;
          font-size: 9px !important;
        }
        .leaflet-control-attribution a {
          color: ${isDark ? "#a0a0c0" : "#0F172A"} !important;
        }
      `}</style>

      {/* STATS STRIP */}
      <div className="flex items-center gap-4 px-5 py-2 border-b border-surface-border bg-surface-panel text-xs flex-shrink-0">
        <StatChip
          icon={<MapPin className="w-3 h-3" />}
          label="Sections"
          value={`${mappedRows.length}/${sectionRows.length}`}
        />
        <div className="w-px h-3 bg-surface-border" />
        <StatChip
          icon={<Video className="w-3 h-3" />}
          label="Online"
          value={`${totalOnline}/${cameras.length}`}
          accent="text-green-400"
          dot
        />
        <div className="w-px h-3 bg-surface-border" />
        <StatChip
          icon={<AlertTriangle className="w-3 h-3" />}
          label="Violation"
          value={totalViolations.toString()}
          accent={totalViolations > 0 ? "text-red-400" : undefined}
          pulse={totalViolations > 0}
        />

        {unmappedCount > 0 && (
          <>
            <div className="w-px h-3 bg-surface-border" />
            <span className="flex items-center gap-1 text-amber-400 font-mono text-[10px]">
              <AlertCircle className="w-3 h-3" />
              {unmappedCount} section tanpa koordinat
            </span>
          </>
        )}

        {/* Legend */}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[10px] font-mono text-content-muted uppercase tracking-wider">
            Legend:
          </span>
          <LegendDot color={STATUS_COLORS.violation} label="Violation" pulse />
          <LegendDot color={STATUS_COLORS.online} label="Online" />
          <LegendDot color={STATUS_COLORS.maintenance} label="Maintenance" />
          <LegendDot color={STATUS_COLORS.offline} label="Offline" />
        </div>
      </div>

      {/* MAP */}
      <div className="relative flex-1">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-content-muted text-sm">
            Memuat peta...
          </div>
        ) : mappedRows.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-content-muted">
            <MapPin className="w-10 h-10 opacity-30" />
            <p className="text-sm">Belum ada section dengan koordinat</p>
            <p className="text-xs opacity-70">Hubungi admin untuk men-set lokasi section</p>
          </div>
        ) : (
          <MapContainer
            center={[mappedRows[0].location!.lat, mappedRows[0].location!.lng]}
            zoom={13}
            style={{ height: "100%", width: "100%" }}
            zoomControl
          >
            <TileLayer attribution={tileAttr} url={tileUrl} />
            <FitBounds rows={mappedRows} />
            {mappedRows.map((row) => (
              <Marker
                key={row._id}
                position={[row.location!.lat, row.location!.lng]}
                icon={createMarkerIcon(
                  row.status,
                  row.cameras.length,
                  row.violations > 0
                )}
              >
                <Popup maxWidth={320} className="guest-popup" autoPan>
                  <CctvHudSectionPopup
                    section={row}
                    cameras={row.cameras}
                    violations={row.violations}
                    onCameraClick={(id) => navigate(`/guest/cameras/${id}`)}
                    onOpenSection={({ sectionId }) =>
                      navigate(`/guest/cameras?section=${sectionId}`)
                    }
                    ctaLabel="Open in Camera Wall"
                  />
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────── */

function FitBounds({ rows }: { rows: SectionRow[] }) {
  const map = useMap();
  useEffect(() => {
    if (rows.length === 0) return;
    const bounds = L.latLngBounds(
      rows.map((r) => [r.location!.lat, r.location!.lng] as [number, number])
    );
    if (rows.length === 1) {
      map.setView(bounds.getCenter(), 15);
    } else {
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);
  return null;
}

function StatChip({
  icon,
  label,
  value,
  accent,
  dot,
  pulse,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: string;
  dot?: boolean;
  pulse?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      {dot ? (
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            accent?.replace("text-", "bg-") ?? "bg-content-muted",
            pulse && "animate-pulse"
          )}
        />
      ) : (
        <span className={cn("text-content-muted", accent)}>{icon}</span>
      )}
      <span className="text-content-muted font-mono uppercase tracking-wider text-[10px]">
        {label}
      </span>
      <span className={cn("font-mono font-bold", accent ?? "text-content")}>{value}</span>
    </span>
  );
}

function LegendDot({
  color,
  label,
  pulse,
}: {
  color: string;
  label: string;
  pulse?: boolean;
}) {
  return (
    <span className="flex items-center gap-1 text-[10px] text-content-secondary font-mono">
      <span
        className={cn("w-2 h-2 rounded-full flex-shrink-0", pulse && "animate-pulse")}
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
