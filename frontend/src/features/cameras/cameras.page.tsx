import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Video, AlertTriangle, RefreshCw, ArrowUpDown } from "lucide-react";
import { PageHeader } from "../../components/page-header";
import { FilterBar, filterInputCls } from "../../components/filter-bar";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { EmptyState } from "../../components/empty-state";
import { Skeleton } from "../../components/skeleton";
import { CameraCard } from "./camera-card";
import { CameraTestModal } from "./camera-test-modal";
import { useDeleteCamera } from "./use-cameras";
import { getCameras } from "../../services/camera.service";
import { getAreas } from "../../services/area.service";
import { usePermission } from "../../hooks/use-permission";
import { useLocalStorage } from "../../hooks/use-local-storage";
import { useUiStore } from "../../store/ui.store";
import { getSectionId } from "../../types/camera.types";
import { cn } from "../../utils/cn";
import type { Camera } from "../../types/camera.types";

export function CamerasPage() {
  const { canCreate, canDelete } = usePermission();
  const navigate = useNavigate();
  const addToast = useUiStore((s) => s.addToast);

  const canAddCamera    = canCreate("cameras");
  const canDeleteCamera = canDelete("cameras");

  const [deleteTarget, setDeleteTarget] = useState<Camera | null>(null);
  const [testTarget, setTestTarget] = useState<Camera | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Area & Section filters live in the URL so other pages (Area card) can deep-link
  // into a pre-filtered camera list.
  const [searchParams, setSearchParams] = useSearchParams();
  const filterArea = searchParams.get("areaId") ?? "";
  const filterSection = searchParams.get("sectionId") ?? "";

  function setFilterArea(value: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set("areaId", value);
        else next.delete("areaId");
        next.delete("sectionId"); // ganti area me-reset filter section anak-nya
        return next;
      },
      { replace: true }
    );
  }

  function setFilterSection(value: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set("sectionId", value);
        else next.delete("sectionId");
        return next;
      },
      { replace: true }
    );
  }

  const { data: cameras = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["cameras"],
    queryFn: () => getCameras({ isActive: undefined }),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  const { data: areas = [] } = useQuery({
    queryKey: ["areas"],
    queryFn: () => getAreas({ isActive: true }),
    staleTime: 60_000,
  });

  const deleteMutation = useDeleteCamera();

  // Derive sections list with parent area info from cameras
  const sectionsByArea = useMemo(() => {
    const map = new Map<string, { _id: string; code: string; name: string; areaId: string }>();
    for (const c of cameras) {
      if (typeof c.sectionId === "object" && c.sectionId.areaId) {
        map.set(c.sectionId._id, {
          _id: c.sectionId._id,
          code: c.sectionId.code,
          name: c.sectionId.name,
          areaId: c.sectionId.areaId._id,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [cameras]);

  const availableSections = useMemo(
    () => (filterArea ? sectionsByArea.filter((s) => s.areaId === filterArea) : sectionsByArea),
    [sectionsByArea, filterArea]
  );

  // Custom grid order, persisted per-browser (stores camera IDs). New/unknown
  // cameras fall to the end. Reordering only works in "arrange" mode AND with no
  // filter/search active — reordering a filtered subset would be ambiguous.
  const [order, setOrder] = useLocalStorage<string[]>("pref:camera-order", []);
  const [arrangeMode, setArrangeMode] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const filtersActive = !!(search || filterArea || filterSection || filterStatus);
  const arranging = arrangeMode && !filtersActive;

  const filtered = useMemo(() => {
    let list = cameras;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
      );
    }
    if (filterArea) {
      list = list.filter((c) => {
        if (typeof c.sectionId === "object") return c.sectionId.areaId?._id === filterArea;
        return false;
      });
    }
    if (filterSection) list = list.filter((c) => getSectionId(c) === filterSection);
    if (filterStatus) list = list.filter((c) => c.status === filterStatus);
    return list;
  }, [cameras, search, filterArea, filterSection, filterStatus]);

  // Apply the saved custom order. Stable sort keeps unknown IDs (Infinity) in their
  // existing relative order at the end.
  const ordered = useMemo(() => {
    if (order.length === 0) return filtered;
    const pos = new Map(order.map((id, i) => [id, i] as const));
    return [...filtered].sort(
      (a, b) => (pos.get(a._id) ?? Infinity) - (pos.get(b._id) ?? Infinity)
    );
  }, [filtered, order]);

  function handleDrop(targetIndex: number) {
    const from = dragIndex.current;
    dragIndex.current = null;
    setOverIndex(null);
    if (from == null || from === targetIndex) return;
    const next = [...ordered];
    const [moved] = next.splice(from, 1);
    next.splice(targetIndex, 0, moved);
    setOrder(next.map((c) => c._id));
  }

  function handleTest(id: string) {
    const camera = cameras.find((c) => c._id === id) ?? null;
    setTestTarget(camera);
  }

  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Cameras" description="Kelola dan monitor seluruh kamera CCTV">
        {canAddCamera && (
          <button
            onClick={() => navigate("/cameras/new")}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-fg rounded-lg hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" /> Tambah Kamera
          </button>
        )}
      </PageHeader>

      {isError && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/5 text-sm">
          <div className="flex items-center gap-2 text-red-500">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Gagal memuat data kamera. Periksa koneksi atau coba lagi.</span>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Coba Lagi
          </button>
        </div>
      )}

      <FilterBar
        search={{ value: search, onChange: setSearch, placeholder: "Cari nama atau kode..." }}
        onRefresh={refetch}
      >
        <button
          type="button"
          onClick={() => setArrangeMode((v) => !v)}
          disabled={filtersActive}
          title={filtersActive ? "Matikan filter & pencarian dulu untuk mengatur urutan" : undefined}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors shrink-0",
            arranging
              ? "border-primary bg-primary text-primary-fg"
              : "border-surface-border text-content-secondary hover:bg-surface-elevated",
            filtersActive && "opacity-50 cursor-not-allowed"
          )}
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          {arranging ? "Selesai" : "Atur Urutan"}
        </button>
        <select value={filterArea} onChange={(e) => setFilterArea(e.target.value)} className={filterInputCls}>
          <option value="">Semua Area</option>
          {areas.map((a) => (
            <option key={a._id} value={a._id}>{a.name}</option>
          ))}
        </select>
        <select
          value={filterSection}
          onChange={(e) => setFilterSection(e.target.value)}
          disabled={availableSections.length === 0}
          className={filterInputCls}
        >
          <option value="">
            {filterArea ? "Semua Section di area ini" : "Semua Section"}
          </option>
          {filterArea
            ? availableSections.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.code ? `[${s.code}] ${s.name}` : s.name}
                </option>
              ))
            : (() => {
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
              })()}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={filterInputCls}>
          <option value="">Semua Status</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="maintenance">Maintenance</option>
        </select>
      </FilterBar>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-surface-border overflow-hidden">
              <Skeleton className="aspect-video" />
              <div className="p-4 space-y-2">
                <Skeleton height="1rem" width="60%" />
                <Skeleton height="0.75rem" width="40%" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Video}
          title={search || filterArea || filterSection || filterStatus ? "Tidak ada hasil" : "Belum ada kamera"}
          description={
            search || filterArea || filterSection || filterStatus
              ? "Coba ubah filter pencarian"
              : "Klik Tambah Kamera untuk mulai"
          }
          action={
            !search && !filterArea && !filterSection && !filterStatus && canAddCamera ? (
              <button
                onClick={() => navigate("/cameras/new")}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-fg rounded-lg hover:opacity-90"
              >
                <Plus className="w-4 h-4" /> Tambah Kamera
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          {arranging && (
            <div className="flex items-center gap-2 px-4 py-2.5 mb-4 rounded-xl border border-primary/30 bg-primary/5 text-xs text-content-secondary">
              <ArrowUpDown className="w-3.5 h-3.5 text-primary shrink-0" />
              Seret kartu untuk menyusun ulang. Urutan tersimpan otomatis di browser ini.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {ordered.map((camera, i) => (
              <div
                key={camera._id}
                draggable={arranging}
                onDragStart={() => {
                  dragIndex.current = i;
                }}
                onDragEnter={() => arranging && setOverIndex(i)}
                onDragOver={(e) => {
                  if (arranging) e.preventDefault();
                }}
                onDrop={() => handleDrop(i)}
                onDragEnd={() => {
                  dragIndex.current = null;
                  setOverIndex(null);
                }}
                className={cn(
                  arranging && overIndex === i && dragIndex.current !== i && "ring-2 ring-primary rounded-xl"
                )}
              >
                <CameraCard
                  camera={camera}
                  arrangeMode={arranging}
                  onEdit={(c) => navigate(`/cameras/${c._id}/edit`)}
                  onTest={handleTest}
                  onDelete={canDeleteCamera ? setDeleteTarget : undefined}
                  testing={false}
                />
              </div>
            ))}
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMutation.mutate(deleteTarget._id, {
            onSuccess: () => {
              addToast({ type: "success", message: `Kamera "${deleteTarget.name}" dihapus` });
              setDeleteTarget(null);
            },
            onError: () => addToast({ type: "error", message: "Gagal menghapus kamera" }),
          });
        }}
        title="Hapus Kamera"
        message={`Hapus kamera "${deleteTarget?.name}"? Semua mapping dan event terkait akan tetap tersimpan.`}
        loading={deleteMutation.isPending}
      />

      <CameraTestModal camera={testTarget} onClose={() => setTestTarget(null)} />
    </div>
  );
}
