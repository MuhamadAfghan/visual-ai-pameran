import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ShieldAlert, RotateCcw } from "lucide-react";
import { PageHeader } from "../../components/page-header";
import { FilterBar, filterInputCls } from "../../components/filter-bar";
import { Skeleton } from "../../components/skeleton";
import { EmptyState } from "../../components/empty-state";
import { getAuditLogs, type AuditFilters } from "../../services/audit.service";

const ACTIONS = [
  { value: "auth.reset_password",  label: "auth · reset password" },
  { value: "auth.change_password", label: "auth · change password" },
  { value: "user.create",          label: "user · create" },
  { value: "user.update",          label: "user · update" },
  { value: "user.delete",          label: "user · delete" },
  { value: "user.set_activation",  label: "user · set activation" },
  { value: "camera.delete",        label: "camera · delete" },
  { value: "mapping.delete",       label: "mapping · delete" },
  { value: "ai_model.delete",      label: "ai model · delete" },
  { value: "role.create",          label: "role · create" },
  { value: "role.update",          label: "role · update" },
  { value: "role.delete",          label: "role · delete" },
  { value: "event.delete",         label: "event · delete" },
] as const;

const ACTION_COLORS: Record<string, string> = {
  create: "text-green-500 bg-green-500/10",
  update: "text-blue-500 bg-blue-500/10",
  delete: "text-red-500 bg-red-500/10",
  login:  "text-purple-500 bg-purple-500/10",
  logout: "text-content-muted bg-surface-elevated"
};

function actionColor(action: string): string {
  const verb = action.split(".").pop() ?? action;
  return ACTION_COLORS[verb] ?? "text-content-secondary bg-surface-elevated";
}

function MetadataCell({ data }: { data: Record<string, unknown> | null | undefined }) {
  const [expanded, setExpanded] = useState(false);
  if (!data || Object.keys(data).length === 0) return <span className="text-content-muted">—</span>;

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs text-primary hover:underline"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        detail
      </button>
      {expanded && (
        <pre className="mt-1 text-[10px] text-content-secondary bg-surface-elevated rounded p-2 max-w-xs overflow-x-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function AuditLogsPage() {
  const [filters, setFilters] = useState<AuditFilters>({});

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["audit-logs", filters],
    queryFn: () => getAuditLogs(filters),
    staleTime: 30_000
  });

  function set<K extends keyof AuditFilters>(key: K, value: AuditFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));
  }

  function resetFilters() {
    setFilters({});
  }

  const hasActive = !!(filters.startDate || filters.endDate || filters.action || filters.actorEmail);

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Audit Log"
        description="Riwayat semua aksi yang dilakukan pengguna di sistem"
      />

      <FilterBar
        search={{
          value: filters.actorEmail ?? "",
          onChange: (v) => set("actorEmail", v),
          placeholder: "Cari email pengguna..."
        }}
      >
        {/* Date range */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-content-muted shrink-0">Dari</span>
          <input
            type="date"
            className={filterInputCls}
            value={filters.startDate ?? ""}
            onChange={(e) => set("startDate", e.target.value)}
          />
          <span className="text-xs text-content-muted shrink-0">s/d</span>
          <input
            type="date"
            className={filterInputCls}
            value={filters.endDate ?? ""}
            onChange={(e) => set("endDate", e.target.value)}
          />
        </div>

        {/* Action dropdown */}
        <select
          value={filters.action ?? ""}
          onChange={(e) => set("action", e.target.value)}
          className={filterInputCls}
        >
          <option value="">Semua Aksi</option>
          {ACTIONS.map((a) => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>

        {/* Reset — only when active */}
        {hasActive && (
          <button
            onClick={resetFilters}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-content-secondary border border-surface-border rounded-lg hover:bg-surface-elevated transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        )}
      </FilterBar>

      {/* Table */}
      <div className="bg-surface-panel border border-surface-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} height="2.5rem" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            icon={ShieldAlert}
            title="Tidak ada log"
            description="Belum ada aktivitas yang tercatat atau tidak ada yang sesuai filter"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border bg-surface-elevated">
                  <th className={th}>Waktu</th>
                  <th className={th}>Pengguna</th>
                  <th className={th}>Aksi</th>
                  <th className={th}>Target</th>
                  <th className={th}>IP Address</th>
                  <th className={th}>Metadata</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log._id}
                    className="border-b border-surface-border last:border-0 hover:bg-surface-elevated/50 transition-colors"
                  >
                    <td className={td}>
                      <span className="text-xs text-content-secondary whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit"
                        })}
                      </span>
                    </td>
                    <td className={td}>
                      <p className="text-xs font-medium text-content">{log.actorEmail ?? "—"}</p>
                    </td>
                    <td className={td}>
                      <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${actionColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className={td}>
                      <p className="text-xs text-content">{log.targetType}</p>
                      {log.targetId && (
                        <p className="text-[10px] text-content-muted font-mono">{log.targetId}</p>
                      )}
                    </td>
                    <td className={td}>
                      <span className="text-xs text-content-secondary font-mono">
                        {log.ipAddress ?? "—"}
                      </span>
                    </td>
                    <td className={td}>
                      <MetadataCell data={log.metadata} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Count */}
        {!isLoading && logs.length > 0 && (
          <div className="px-4 py-2.5 border-t border-surface-border bg-surface-elevated/50">
            <p className="text-xs text-content-muted">
              Menampilkan {logs.length} log
              {logs.length === 500 && " (maks 500 — gunakan filter untuk mempersempit)"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const th = "px-4 py-3 text-left text-xs font-semibold text-content-secondary";
const td = "px-4 py-3 align-top";
