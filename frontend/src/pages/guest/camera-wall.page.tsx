import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { LayoutGrid, Search, RefreshCw, MapPin, Layers } from "lucide-react";
import { getCameras } from "../../services/camera.service";
import { getEvents } from "../../services/event.service";
import { getAreas } from "../../services/area.service";
import { CameraTile } from "../../features/guest/camera-tile";
import { cn } from "../../utils/cn";
import type { Camera } from "../../types/camera.types";
import type { Area } from "../../types/area.types";
import type { DetectionEvent } from "../../types/event.types";

type GridSize = 2 | 3 | 4;

type SectionOption = {
  _id: string;
  name: string;
  code: string;
  areaId: string;
};

export function CameraWallPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [violationMap, setViolationMap] = useState<Record<string, number>>({});
  const [latestEventMap, setLatestEventMap] = useState<Record<string, DetectionEvent>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState<string>(searchParams.get("area") ?? "all");
  const [sectionFilter, setSectionFilter] = useState<string>(
    searchParams.get("section") ?? "all"
  );
  const [gridSize, setGridSize] = useState<GridSize>(3);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [cams, fetchedAreas] = await Promise.all([
        getCameras({ isActive: true }),
        getAreas({ isActive: true }),
      ]);
      setCameras(cams);
      setAreas(fetchedAreas);
      setLastRefresh(new Date());

      try {
        const { items: recent } = await getEvents({ limit: 200 });
        const countMap: Record<string, number> = {};
        const latestMap: Record<string, DetectionEvent> = {};
        recent.forEach((ev) => {
          if (ev.isViolation && ev.status === "unacknowledged") {
            countMap[ev.cameraId] = (countMap[ev.cameraId] ?? 0) + 1;
          }
          if (!latestMap[ev.cameraId]) latestMap[ev.cameraId] = ev;
        });
        setViolationMap(countMap);
        setLatestEventMap(latestMap);
      } catch {
        // events are optional
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 30_000);
    return () => clearInterval(id);
  }, [fetchData]);

  // sync filters with URL params
  useEffect(() => {
    const a = searchParams.get("area");
    const s = searchParams.get("section");
    if (a) setAreaFilter(a);
    if (s) setSectionFilter(s);
  }, [searchParams]);

  // Derive unique sections from loaded cameras
  const allSections = useMemo<SectionOption[]>(() => {
    const map = new Map<string, SectionOption>();
    cameras.forEach((cam) => {
      if (typeof cam.sectionId === "object") {
        const s = cam.sectionId;
        if (!map.has(s._id)) {
          map.set(s._id, {
            _id: s._id,
            name: s.name,
            code: s.code,
            areaId: s.areaId?._id ?? "",
          });
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [cameras]);

  // Sections filtered by selected area
  const availableSections = useMemo(() => {
    if (areaFilter === "all") return allSections;
    return allSections.filter((s) => s.areaId === areaFilter);
  }, [allSections, areaFilter]);

  function handleAreaChange(value: string) {
    setAreaFilter(value);
    setSectionFilter("all"); // reset section when area changes
    const next = new URLSearchParams(searchParams);
    if (value === "all") next.delete("area");
    else next.set("area", value);
    next.delete("section");
    setSearchParams(next);
  }

  function handleSectionChange(value: string) {
    setSectionFilter(value);
    const next = new URLSearchParams(searchParams);
    if (value === "all") next.delete("section");
    else next.set("section", value);
    setSearchParams(next);
  }

  function handleManualRefresh() {
    setRefreshing(true);
    fetchData();
  }

  const filtered = cameras.filter((cam) => {
    const matchSearch =
      !search ||
      cam.name.toLowerCase().includes(search.toLowerCase()) ||
      cam.code.toLowerCase().includes(search.toLowerCase());
    const matchArea =
      areaFilter === "all" ||
      (typeof cam.sectionId === "object" && cam.sectionId.areaId?._id === areaFilter);
    const matchSection =
      sectionFilter === "all" ||
      (typeof cam.sectionId === "object" && cam.sectionId._id === sectionFilter);
    return matchSearch && matchArea && matchSection;
  });

  const totalOnline = cameras.filter((c) => c.status === "online").length;
  const totalViolations = Object.values(violationMap).reduce((a, b) => a + b, 0);

  const gridColsClass: Record<GridSize, string> = {
    2: "grid-cols-2",
    3: "grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
  };

  return (
    <div className="flex flex-col h-full">
      {/* Summary bar */}
      <div className="flex items-center gap-4 px-5 py-2 border-b border-surface-border bg-surface-panel text-xs flex-shrink-0">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span className="text-content-muted font-mono uppercase tracking-wider text-[10px]">
            Online
          </span>
          <span className="font-mono font-bold text-green-400">{totalOnline}</span>
          <span className="text-content-muted font-mono">/ {cameras.length}</span>
        </span>

        <div className="w-px h-3 bg-surface-border" />

        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              totalViolations > 0 ? "bg-red-400 animate-pulse" : "bg-content-muted/40"
            )}
          />
          <span className="text-content-muted font-mono uppercase tracking-wider text-[10px]">
            Violation
          </span>
          <span
            className={cn(
              "font-mono font-bold",
              totalViolations > 0 ? "text-red-400" : "text-content-muted"
            )}
          >
            {totalViolations}
          </span>
        </span>

        <div className="w-px h-3 bg-surface-border" />

        <span className="flex items-center gap-1.5">
          <span className="text-content-muted font-mono uppercase tracking-wider text-[10px]">
            Showing
          </span>
          <span className="font-mono font-bold text-content">{filtered.length}</span>
        </span>

        <span className="ml-auto text-content-muted font-mono text-[10px]">
          Last sync:{" "}
          {lastRefresh.toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-surface-border flex-shrink-0 flex-wrap">
        {/* Search */}
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kamera..."
            className="w-full h-8 pl-8 pr-3 text-xs rounded-lg border border-surface-border bg-surface-elevated text-content placeholder:text-content-muted focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        {/* Hierarchical filter: Area → Section */}
        <div className="flex items-stretch h-8 rounded-lg border border-surface-border bg-surface-elevated overflow-hidden">
          {/* Area */}
          <label className="flex items-center gap-1.5 px-2.5 text-[10px] font-mono text-content-muted uppercase tracking-wider border-r border-surface-border bg-surface-panel/50">
            <MapPin className="w-3 h-3" />
            Area
          </label>
          <select
            value={areaFilter}
            onChange={(e) => handleAreaChange(e.target.value)}
            className="text-xs bg-transparent text-content pl-2 pr-6 focus:outline-none cursor-pointer min-w-[110px] h-full"
          >
            <option value="all">Semua Area</option>
            {areas.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name}
              </option>
            ))}
          </select>

          {/* Divider */}
          <div className="w-px bg-surface-border" />

          {/* Section */}
          <label className="flex items-center gap-1.5 px-2.5 text-[10px] font-mono text-content-muted uppercase tracking-wider border-r border-surface-border bg-surface-panel/50">
            <Layers className="w-3 h-3" />
            Section
          </label>
          <select
            value={sectionFilter}
            onChange={(e) => handleSectionChange(e.target.value)}
            disabled={availableSections.length === 0}
            className="text-xs bg-transparent text-content pl-2 pr-6 focus:outline-none cursor-pointer min-w-[110px] h-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="all">
              {areaFilter === "all" ? "Semua Section" : "Semua Section di area ini"}
            </option>
            {areaFilter === "all"
              ? (() => {
                  // Group sections by their parent area
                  const areaMap = new Map(areas.map((a) => [a._id, a]));
                  const groups = new Map<string, { name: string; items: typeof availableSections }>();
                  for (const s of availableSections) {
                    const a = areaMap.get(s.areaId);
                    if (!a) continue;
                    const g = groups.get(a._id);
                    if (g) g.items.push(s);
                    else groups.set(a._id, { name: a.name, items: [s] });
                  }
                  return Array.from(groups.entries()).map(([aid, group]) => (
                    <optgroup key={aid} label={group.name}>
                      {group.items.map((s) => (
                        <option key={s._id} value={s._id}>
                          {s.code ? `[${s.code}] ${s.name}` : s.name}
                        </option>
                      ))}
                    </optgroup>
                  ));
                })()
              : availableSections.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.code ? `[${s.code}] ${s.name}` : s.name}
                  </option>
                ))}
          </select>
        </div>

        {/* Right side: grid + refresh */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Grid size segmented control */}
          <div className="flex items-stretch h-8 rounded-lg border border-surface-border bg-surface-elevated overflow-hidden">
            <span className="flex items-center gap-1 px-2.5 text-[10px] font-mono text-content-muted uppercase tracking-wider border-r border-surface-border bg-surface-panel/50">
              <LayoutGrid className="w-3 h-3" />
              Layout
            </span>
            {([2, 3, 4] as GridSize[]).map((size) => (
              <button
                key={size}
                onClick={() => setGridSize(size)}
                title={`Grid ${size}×${size}`}
                aria-label={`Grid ${size} kolom`}
                className={cn(
                  "flex items-center justify-center w-8 transition-colors border-r border-surface-border last:border-r-0",
                  gridSize === size
                    ? "bg-primary/15 text-primary"
                    : "text-content-muted hover:bg-surface-base hover:text-content"
                )}
              >
                <GridIcon size={size} />
              </button>
            ))}
          </div>

          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            title="Refresh data"
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-surface-border bg-surface-elevated text-content-muted hover:text-content hover:bg-surface-base transition-colors disabled:opacity-40"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Camera grid */}
      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="flex items-center justify-center h-full text-content-muted text-sm">
            Memuat kamera...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-content-muted">
            <LayoutGrid className="w-8 h-8 opacity-20" />
            <p className="text-sm">Tidak ada kamera ditemukan</p>
            {(search || areaFilter !== "all" || sectionFilter !== "all") && (
              <button
                onClick={() => {
                  setSearch("");
                  handleAreaChange("all");
                }}
                className="text-xs text-primary hover:underline mt-1"
              >
                Hapus filter
              </button>
            )}
          </div>
        ) : (
          <div className={cn("grid gap-3", gridColsClass[gridSize])}>
            {filtered.map((cam) => (
              <CameraTile
                key={cam._id}
                camera={cam}
                violationCount={violationMap[cam._id] ?? 0}
                latestEvent={latestEventMap[cam._id]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Visual icon that represents the grid layout (2x2, 3x3, 4x4). */
function GridIcon({ size }: { size: GridSize }) {
  const cells = Array.from({ length: size * size });
  const gap = 1.5;
  const padding = 3;
  const inner = 24 - padding * 2 - gap * (size - 1);
  const cell = inner / size;

  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="w-3.5 h-3.5"
      aria-hidden="true"
    >
      {cells.map((_, i) => {
        const row = Math.floor(i / size);
        const col = i % size;
        const x = padding + col * (cell + gap);
        const y = padding + row * (cell + gap);
        return <rect key={i} x={x} y={y} width={cell} height={cell} rx="0.5" />;
      })}
    </svg>
  );
}
