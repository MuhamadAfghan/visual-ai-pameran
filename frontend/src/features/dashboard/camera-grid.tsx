import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, Grid3X3, Video } from "lucide-react";
import { useLocalStorage } from "../../hooks/use-local-storage";
import { CameraTile } from "./camera-tile";
import { Skeleton } from "../../components/skeleton";
import { EmptyState } from "../../components/empty-state";
import { cn } from "../../utils/cn";
import { getAreas } from "../../services/area.service";
import type { Camera } from "../../types/camera.types";

type Props = {
  cameras: Camera[];
  loading: boolean;
};

export function CameraGrid({ cameras, loading }: Props) {
  const [cols, setCols] = useLocalStorage<2 | 3>("pref:camera-grid-cols", 2);
  const [areaFilter, setAreaFilter] = useState<string>("all");

  const { data: areas = [] } = useQuery({
    queryKey: ["areas"],
    queryFn: () => getAreas({ isActive: true }),
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    if (areaFilter === "all") return cameras;
    return cameras.filter((cam) => {
      const sec = typeof cam.sectionId === "object" ? cam.sectionId : null;
      return sec?.areaId?._id === areaFilter;
    });
  }, [cameras, areaFilter]);


  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Video className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold text-content">Live Cameras</h2>
          {cameras.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-surface-elevated text-content-secondary">
              {cameras.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Area filter */}
          <select
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value)}
            className="text-xs border border-surface-border bg-surface-elevated text-content rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
          >
            <option value="all">Semua Area</option>
            {areas.map((a) => (
              <option key={a._id} value={a._id}>{a.name}</option>
            ))}
          </select>

          {/* Grid cols toggle */}
          <div className="flex items-center gap-1 bg-surface-elevated rounded-lg p-1">
            <button
              onClick={() => setCols(2)}
              title="2 kolom"
              className={cn(
                "flex items-center justify-center w-7 h-7 rounded-md transition-colors",
                cols === 2 ? "bg-surface-panel text-primary shadow-sm" : "text-content-muted hover:text-content"
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setCols(3)}
              title="3 kolom"
              className={cn(
                "flex items-center justify-center w-7 h-7 rounded-md transition-colors",
                cols === 3 ? "bg-surface-panel text-primary shadow-sm" : "text-content-muted hover:text-content"
              )}
            >
              <Grid3X3 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className={cn("grid gap-3", cols === 2 ? "grid-cols-2" : "grid-cols-3")}>
          {Array.from({ length: cols * cols }).map((_, i) => (
            <Skeleton key={i} className="aspect-video rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Video}
          title={areaFilter === "all" ? "Belum ada kamera" : "Tidak ada kamera di area ini"}
          description={areaFilter === "all" ? "Tambahkan kamera di halaman Cameras" : "Pilih area lain atau lihat semua kamera"}
        />
      ) : (
        <div className={cn("grid gap-3", cols === 2 ? "grid-cols-2" : "grid-cols-3")}>
          {filtered.map((cam) => (
            <CameraTile key={cam._id} camera={cam} />
          ))}
        </div>
      )}
    </div>
  );
}
