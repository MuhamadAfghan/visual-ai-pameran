import { useState, useCallback, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Download, CheckCheck, AlertTriangle, RefreshCw } from "lucide-react";
import { PageHeader } from "../../components/page-header";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { EventFilterBar } from "./event-filter-bar";
import { EventTable } from "./event-table";
import { EventDrawer } from "./event-drawer";
import { Pagination } from "../../components/pagination";
import {
  useEvents,
  useAcknowledgeEvent,
  useFalsePositiveEvent,
  useDeleteEvent,
} from "./use-events";
import { acknowledgeEvent, exportEvents, getEventById, type EventFilters } from "../../services/event.service";
import { useAuth } from "../../app/auth-provider";
import { usePermission } from "../../hooks/use-permission";
import { useUiStore } from "../../store/ui.store";
import type { DetectionEvent, EventStatus } from "../../types/event.types";

const LIMIT = 25;

export function EventsPage() {
  const { token } = useAuth();
  const { can, canDelete } = usePermission();
  const addToast = useUiStore((s) => s.addToast);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCameraId = searchParams.get("cameraId") ?? undefined;
  const eventIdParam = searchParams.get("eventId");

  const canExport      = can("events", "export");
  const canAcknowledge = can("events", "acknowledge");
  const canFP          = can("events", "false_positive");
  const canDeleteEvent = canDelete("events");

  const [appliedFilters, setAppliedFilters] = useState<EventFilters>({
    page: 1,
    limit: LIMIT,
    ...(initialCameraId ? { cameraId: initialCameraId } : {}),
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drawerEvent, setDrawerEvent] = useState<DetectionEvent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [statusChangeTarget, setStatusChangeTarget] = useState<{ id: string; newStatus: EventStatus } | null>(null);

  // Auto-open drawer when navigated from notification bell (?eventId=...)
  useEffect(() => {
    if (!eventIdParam) return;
    getEventById(eventIdParam)
      .then((ev) => setDrawerEvent(ev))
      .catch(() => {});
    // Remove eventId from URL without adding a history entry
    navigate("/events", { replace: true });
  }, [eventIdParam, navigate]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isError, refetch } = useEvents(appliedFilters);
  const ackMutation = useAcknowledgeEvent();
  const fpMutation = useFalsePositiveEvent();
  const deleteMutation = useDeleteEvent();

  const events = data?.items ?? [];
  const pagination = data?.pagination;

  function handleApply(filters: EventFilters) {
    setAppliedFilters({ ...filters, page: 1, limit: LIMIT });
    setSelectedIds(new Set());
  }

  function handleSelectToggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkAck() {
    const ids = Array.from(selectedIds);
    setBulkLoading(true);
    addToast({ type: "info", message: `Memproses ${ids.length} event...` });
    try {
      const results = await Promise.allSettled(ids.map((id) => acknowledgeEvent(id)));
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;
      qc.invalidateQueries({ queryKey: ["events"] });
      setSelectedIds(new Set());
      if (failed === 0) {
        addToast({ type: "success", message: `${succeeded} event berhasil diakui` });
      } else {
        addToast({ type: "error", message: `${succeeded} berhasil diakui, ${failed} gagal` });
      }
    } catch {
      addToast({ type: "error", message: "Gagal memproses bulk acknowledge" });
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const { from, to, cameraId, status, isViolation } = appliedFilters;
      await exportEvents({ from, to, cameraId, status, isViolation });
    } catch {
      addToast({ type: "error", message: "Gagal mengekspor data" });
    } finally {
      setExporting(false);
    }
  }

  const handleDrawerClose = useCallback(() => setDrawerEvent(null), []);

  return (
    <div className="p-6 space-y-4">
      <PageHeader title="Live Events" description="Riwayat lengkap deteksi dan pelanggaran">
        {canExport && (
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 text-sm transition-colors border rounded-lg border-surface-border text-content-secondary hover:bg-surface-elevated disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {exporting ? "Exporting..." : "Export Excel"}
          </button>
        )}
      </PageHeader>

      <EventFilterBar onApply={handleApply} initialCameraId={initialCameraId} />

      {isError && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/5 text-sm">
          <div className="flex items-center gap-2 text-red-500">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Gagal memuat data events. Periksa koneksi atau coba lagi.</span>
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

      {canAcknowledge && selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-primary-dim border border-primary/20 rounded-xl">
          <span className="text-sm font-medium text-primary">{selectedIds.size} event dipilih</span>
          <button
            onClick={handleBulkAck}
            disabled={bulkLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-fg rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            {bulkLoading ? "Memproses..." : `Acknowledge (${selectedIds.size})`}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-xs text-content-secondary hover:text-content"
          >
            Batal pilih
          </button>
        </div>
      )}

      <EventTable
        events={events}
        loading={isLoading}
        selectedIds={selectedIds}
        onSelectToggle={handleSelectToggle}
        onSelectAll={() => setSelectedIds(new Set(events.map((e) => e._id)))}
        onDeselectAll={() => setSelectedIds(new Set())}
        onView={setDrawerEvent}
        onDelete={canDeleteEvent ? setDeleteTarget : undefined}
        onStatusChange={
          canAcknowledge || canFP
            ? (id, newStatus) => setStatusChangeTarget({ id, newStatus })
            : undefined
        }
        page={appliedFilters.page ?? 1}
        limit={LIMIT}
      />

      {pagination && (
        <Pagination
          page={pagination.page}
          limit={LIMIT}
          total={pagination.total}
          totalPages={pagination.totalPages}
          onChange={(p) => setAppliedFilters((f) => ({ ...f, page: p }))}
        />
      )}

      <EventDrawer event={drawerEvent} token={token} onClose={handleDrawerClose} />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMutation.mutate(deleteTarget, {
            onSuccess: () => {
              addToast({ type: "success", message: "Event dihapus" });
              setDeleteTarget(null);
            },
            onError: () => addToast({ type: "error", message: "Gagal menghapus event" }),
          });
        }}
        message="Hapus event ini secara permanen? Tindakan ini tidak dapat dibatalkan."
        loading={deleteMutation.isPending}
      />

      <ConfirmDialog
        open={!!statusChangeTarget}
        onClose={() => setStatusChangeTarget(null)}
        onConfirm={() => {
          if (!statusChangeTarget) return;
          const { id, newStatus } = statusChangeTarget;
          const mutation = newStatus === "acknowledged" ? ackMutation : fpMutation;
          mutation.mutate(id, {
            onSuccess: () => {
              const label = newStatus === "acknowledged" ? "diakui" : "ditandai false positive";
              addToast({ type: "success", message: `Event berhasil ${label}` });
              setStatusChangeTarget(null);
            },
            onError: () => addToast({ type: "error", message: "Gagal mengubah status event" }),
          });
        }}
        title="Ubah Status Event"
        message={
          statusChangeTarget?.newStatus === "acknowledged"
            ? "Tandai event ini sebagai Diakui?"
            : "Tandai event ini sebagai False Positive?"
        }
        confirmLabel="Ya, Ubah"
        variant="primary"
        loading={ackMutation.isPending || fpMutation.isPending}
      />
    </div>
  );
}
