import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ScanLine, ToggleLeft, ToggleRight, ExternalLink } from "lucide-react";
import { PageHeader } from "../../components/page-header";
import { FilterBar, filterInputCls } from "../../components/filter-bar";
import { EmptyState } from "../../components/empty-state";
import { Skeleton } from "../../components/skeleton";
import { getAllMappings } from "../../services/mapping.service";
import { CHECK_LABELS } from "../../types/ai-model.types";
import type { GlobalCameraMapping } from "../../services/mapping.service";

function getCameraName(m: GlobalCameraMapping): string {
  if (!m.cameraId) return "(kamera dihapus)";
  return typeof m.cameraId === "object" ? m.cameraId.name : m.cameraId;
}

function getCameraCode(m: GlobalCameraMapping): string {
  if (!m.cameraId) return "—";
  return typeof m.cameraId === "object" ? m.cameraId.code : "";
}

function getCameraId(m: GlobalCameraMapping): string | null {
  if (!m.cameraId) return null;
  return typeof m.cameraId === "object" ? m.cameraId._id : m.cameraId;
}

function getModelName(m: GlobalCameraMapping): string {
  if (!m.modelId) return "(model dihapus)";
  return typeof m.modelId === "object" ? m.modelId.name : m.modelId;
}

function getModelCode(m: GlobalCameraMapping): string {
  if (!m.modelId) return "—";
  return typeof m.modelId === "object" ? m.modelId.code : "";
}

function formatSchedule(m: GlobalCameraMapping): string {
  const s = m.schedule;
  if (s.type === "always") return "Selalu aktif";
  const days = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const dayStr = s.daysOfWeek?.map((d) => days[d]).join(", ") ?? "—";
  const range = s.timeRanges?.[0];
  return range ? `${dayStr} · ${range.start}–${range.end}` : dayStr;
}

export function MappingsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");

  const { data: mappings = [], isLoading } = useQuery({
    queryKey: ["all-mappings"],
    queryFn: getAllMappings,
    staleTime: 30_000,
    refetchInterval: 30_000
  });

  const filtered = useMemo(() => {
    let list = mappings;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          getCameraName(m).toLowerCase().includes(q) ||
          getCameraCode(m).toLowerCase().includes(q) ||
          getModelName(m).toLowerCase().includes(q) ||
          getModelCode(m).toLowerCase().includes(q)
      );
    }
    if (filterStatus === "active") list = list.filter((m) => m.isActive);
    if (filterStatus === "inactive") list = list.filter((m) => !m.isActive);
    return list;
  }, [mappings, search, filterStatus]);

  const activeCount = mappings.filter((m) => m.isActive).length;

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Camera Schedules"
        description={`${mappings.length} mapping terdaftar · ${activeCount} aktif`}
      />

      <FilterBar
        search={{ value: search, onChange: setSearch, placeholder: "Cari kamera atau model..." }}
      >
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
          className={filterInputCls}
        >
          <option value="all">Semua Status</option>
          <option value="active">Aktif</option>
          <option value="inactive">Nonaktif</option>
        </select>
      </FilterBar>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height="4.5rem" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ScanLine}
          title="Belum ada mapping"
          description={
            search || filterStatus !== "all"
              ? "Tidak ada mapping yang sesuai filter."
              : "Tambah mapping pertama dari halaman detail kamera."
          }
        />
      ) : (
        <div className="bg-surface-panel border border-surface-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border bg-surface-elevated">
                  <th className={th}>Status</th>
                  <th className={th}>Kamera</th>
                  <th className={th}>Model</th>
                  <th className={th}>Zona</th>
                  <th className={th}>Checks</th>
                  <th className={th}>Confidence</th>
                  <th className={th}>Jadwal</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((mapping) => (
                  <MappingRow
                    key={mapping._id}
                    mapping={mapping}
                    onGoToCamera={() => {
                      const cid = getCameraId(mapping);
                      if (cid) navigate(`/cameras/${cid}/mappings`);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function MappingRow({
  mapping,
  onGoToCamera
}: {
  mapping: GlobalCameraMapping;
  onGoToCamera: () => void;
}) {
  return (
    <tr className="border-b border-surface-border last:border-0 hover:bg-surface-elevated/50 transition-colors">
      {/* Status */}
      <td className={td}>
        {mapping.isActive ? (
          <span className="flex items-center gap-1.5 text-green-500 text-xs font-medium">
            <ToggleRight className="w-4 h-4" /> Aktif
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-content-muted text-xs">
            <ToggleLeft className="w-4 h-4" /> Nonaktif
          </span>
        )}
      </td>

      {/* Kamera */}
      <td className={td}>
        <p className="text-xs font-semibold text-content">{getCameraName(mapping)}</p>
        <p className="text-[10px] font-mono text-content-muted">{getCameraCode(mapping)}</p>
      </td>

      {/* Model */}
      <td className={td}>
        <p className="text-xs text-content">{getModelName(mapping)}</p>
        <p className="text-[10px] font-mono text-content-muted">{getModelCode(mapping)}</p>
      </td>

      <td className={td}>
        <span className="text-[10px] text-content-muted">—</span>
      </td>

      {/* Checks */}
      <td className={td}>
        <div className="flex flex-wrap gap-1">
          {mapping.selectedChecks?.length > 0 ? (
            mapping.selectedChecks.map((c) => (
              <span
                key={c}
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
              >
                {CHECK_LABELS[c]}
              </span>
            ))
          ) : (
            <span className="text-[10px] text-content-muted">—</span>
          )}
        </div>
      </td>

      {/* Confidence */}
      <td className={td}>
        <span className="text-xs font-mono text-content-secondary">
          {(mapping.confidenceThreshold * 100).toFixed(0)}%
        </span>
      </td>

      {/* Jadwal */}
      <td className={td}>
        <span className="text-xs text-content-secondary whitespace-nowrap">
          {formatSchedule(mapping)}
        </span>
      </td>

      {/* Action */}
      <td className={td}>
        <button
          onClick={onGoToCamera}
          className="flex items-center gap-1 text-[11px] text-primary hover:underline underline-offset-2 whitespace-nowrap"
        >
          Kelola <ExternalLink className="w-3 h-3" />
        </button>
      </td>
    </tr>
  );
}

const th = "px-4 py-3 text-left text-xs font-semibold text-content-secondary whitespace-nowrap";
const td = "px-4 py-3 align-top";
