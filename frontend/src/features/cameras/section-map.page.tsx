import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useNavigate } from "react-router-dom";
import { MapPin, AlertCircle } from "lucide-react";
import { getCameras } from "../../services/camera.service";
import { getSections } from "../../services/section.service";
import {
  CctvHudSectionPopup,
  HUD_KEYFRAMES_CSS,
  hudPopupCss
} from "./cctv-hud-popup";
import { useUiStore } from "../../store/ui.store";
import type { Camera as CameraType } from "../../types/camera.types";

// Fix Leaflet default marker icons broken by bundlers
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
});

// ── Custom marker icon per status ─────────────────────────────────────────────

const MARKER_COLORS: Record<string, string> = {
  online: "#22c55e",
  offline: "#6b7280",
  maintenance: "#f59e0b"
};

function createMarkerIcon(status: string) {
  const color = MARKER_COLORS[status] ?? "#6b7280";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
      <filter id="shadow" x="-40%" y="-20%" width="180%" height="160%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.28)" />
      </filter>
      <path d="M14 1C7.37 1 2 6.37 2 13c0 9 12 22 12 22s12-13 12-22c0-6.63-5.37-12-12-12z"
        fill="${color}" stroke="white" stroke-width="2" filter="url(#shadow)" />
      <circle cx="14" cy="13" r="5" fill="white" opacity="0.95" />
    </svg>
  `;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -38]
  });
}

// ── Section status derived from its cameras ───────────────────────────────────

function getSectionStatus(cameras: CameraType[]): "online" | "maintenance" | "offline" {
  if (cameras.some((c) => c.status === "online")) return "online";
  if (cameras.some((c) => c.status === "maintenance")) return "maintenance";
  return "offline";
}

// (Popup content moved to ./cctv-hud-popup.tsx — shared with guest map)

// ── Page ──────────────────────────────────────────────────────────────────────

export function SectionMapPage() {
  const { data: sections = [], isLoading: sectionsLoading } = useQuery({
    queryKey: ["sections"],
    queryFn: () => getSections(),
    staleTime: 30_000
  });

  const { data: cameras = [], isLoading: camerasLoading } = useQuery({
    queryKey: ["cameras"],
    queryFn: () => getCameras(),
    staleTime: 30_000
  });

  const camerasBySection = useMemo(() => {
    const map = new Map<string, CameraType[]>();
    for (const cam of cameras) {
      const sid = typeof cam.sectionId === "object" ? cam.sectionId._id : cam.sectionId;
      if (!map.has(sid)) map.set(sid, []);
      map.get(sid)!.push(cam);
    }
    return map;
  }, [cameras]);

  const mappedSections = sections.filter((s) => s.location != null);
  const unmapped = sections.length - mappedSections.length;

  const navigate = useNavigate();
  const theme = useUiStore((s) => s.theme);
  const isDark = theme === "dark";

  // Carto Voyager (light) / Dark Matter (dark) — same as guest map
  const tileUrl = isDark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
  const tileAttr = `&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>`;

  if (sectionsLoading || camerasLoading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-content-muted">
        Memuat peta...
      </div>
    );
  }

  return (
    <>
      {/* CCTV HUD popup styles — shared with guest map */}
      <style>{`
        .leaflet-container { background: ${isDark ? "#0a0a0f" : "#e7e7e9"}; }
        ${hudPopupCss("cam-popup")}
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

      <div className="flex flex-col h-full">
        {/* Info banner */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-surface-border bg-surface-panel shrink-0">
          <MapPin className="w-4 h-4 text-primary shrink-0" />
          <p className="text-sm text-content">
            <span className="font-semibold text-primary">{mappedSections.length}</span> dari{" "}
            <span className="font-semibold">{sections.length}</span> section memiliki koordinat
          </p>

          {/* Legend */}
          <div className="flex items-center gap-3 ml-auto">
            {unmapped > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertCircle className="w-3.5 h-3.5" />
                {unmapped} belum ada koordinat
              </span>
            )}
            {(["online", "offline", "maintenance"] as const).map((key) => {
              const label =
                key === "online" ? "Online" : key === "offline" ? "Offline" : "Maintenance";
              const color = MARKER_COLORS[key];
              const count = mappedSections.filter(
                (s) => getSectionStatus(camerasBySection.get(s._id) ?? []) === key
              ).length;
              if (count === 0) return null;
              return (
                <span key={key} className="flex items-center gap-1 text-xs text-content-secondary">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                  {label} ({count})
                </span>
              );
            })}
          </div>
        </div>

        {/* Map */}
        <div className="relative flex-1">
          {mappedSections.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-content-muted">
              <MapPin className="w-10 h-10 opacity-30" />
              <p className="text-sm">Belum ada section dengan koordinat.</p>
              <p className="text-xs">Set lokasi section melalui halaman Area & Section.</p>
            </div>
          ) : (
            <MapContainer
              center={[mappedSections[0].location!.lat, mappedSections[0].location!.lng]}
              zoom={12}
              style={{ height: "100%", width: "100%" }}
            >
              <TileLayer attribution={tileAttr} url={tileUrl} />
              {mappedSections.map((section) => {
                const cams = camerasBySection.get(section._id) ?? [];
                return (
                  <Marker
                    key={section._id}
                    position={[section.location!.lat, section.location!.lng]}
                    icon={createMarkerIcon(getSectionStatus(cams))}
                  >
                    <Popup maxWidth={320} className="cam-popup" autoPan>
                      <CctvHudSectionPopup
                        section={section}
                        cameras={cams}
                        onCameraClick={(id) => navigate(`/cameras/${id}/detail`)}
                        onOpenSection={({ areaId }) =>
                          navigate(`/cameras?areaId=${areaId}`)
                        }
                        ctaLabel="Lihat Kamera"
                      />
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          )}
        </div>
      </div>
    </>
  );
}
