import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, X } from "lucide-react";

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

export type Coordinate = { lat: number; lng: number };

type Props = {
  value: Coordinate | null;
  onChange: (loc: Coordinate | null) => void;
  height?: number;
  /** Hint text below the inputs. */
  hint?: string;
};

function MapClickHandler({ onChange }: { onChange: (loc: Coordinate) => void }) {
  useMapEvents({
    click(e) {
      onChange({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

// Recenter the map when the coordinate changes from outside (e.g. a saved
// location was picked), so the marker stays in view without manual panning.
function RecenterOnChange({ value }: { value: Coordinate | null }) {
  const map = useMap();
  useEffect(() => {
    if (value) map.setView([value.lat, value.lng], Math.max(map.getZoom(), 13));
  }, [map, value]);
  return null;
}

export function CoordinatePicker({ value, onChange, height = 280, hint }: Props) {
  function handleLatInput(raw: string) {
    const lat = parseFloat(raw);
    if (isNaN(lat)) return;
    onChange({ lat, lng: value?.lng ?? 118.0 });
  }

  function handleLngInput(raw: string) {
    const lng = parseFloat(raw);
    if (isNaN(lng)) return;
    onChange({ lat: value?.lat ?? -2.5, lng });
  }

  return (
    <div className="space-y-2">
      <div className="overflow-hidden border rounded-lg border-surface-border" style={{ height }}>
        <MapContainer
          center={value ? [value.lat, value.lng] : [-2.5, 118.0]}
          zoom={value ? 13 : 5}
          style={{ height: "100%", width: "100%" }}
          className="z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <RecenterOnChange value={value} />
          <MapClickHandler onChange={onChange} />
          {value && (
            <Marker
              position={[value.lat, value.lng]}
              draggable
              eventHandlers={{
                dragend(e) {
                  const { lat, lng } = (e.target as L.Marker).getLatLng();
                  onChange({ lat, lng });
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      {/* Manual input + clear */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 flex-1">
          <MapPin className="w-3.5 h-3.5 text-content-muted shrink-0" />
          <input
            type="number"
            step="any"
            placeholder="Latitude"
            value={value?.lat ?? ""}
            onChange={(e) => handleLatInput(e.target.value)}
            className="w-full px-2 py-1.5 text-xs border border-surface-border bg-surface-elevated text-content rounded-md focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-content-muted"
          />
          <input
            type="number"
            step="any"
            placeholder="Longitude"
            value={value?.lng ?? ""}
            onChange={(e) => handleLngInput(e.target.value)}
            className="w-full px-2 py-1.5 text-xs border border-surface-border bg-surface-elevated text-content rounded-md focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-content-muted"
          />
        </div>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="flex items-center gap-1 px-2 py-1.5 text-xs text-red-500 border border-red-500/30 rounded-md hover:bg-red-500/5 transition-colors shrink-0"
          >
            <X className="w-3 h-3" />
            Hapus
          </button>
        )}
      </div>
      {hint && <p className="text-[11px] text-content-muted">{hint}</p>}
    </div>
  );
}
