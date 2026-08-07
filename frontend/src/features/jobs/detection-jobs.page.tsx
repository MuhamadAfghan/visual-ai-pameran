import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle2, XCircle, Clock, Loader2, RefreshCw } from "lucide-react";
import { PageHeader } from "../../components/page-header";
import { DataTable, tHead, tH, tRow, tDTop } from "../../components/data-table";
import { Pagination } from "../../components/pagination";
import { Skeleton } from "../../components/skeleton";
import { getDetectionJobs, getQueueStats, type QueueCounts } from "../../services/job.service";
import { formatRelative } from "../../utils/formatDate";

const POLL = 10_000;
const PAGE_SIZE = 50;

const STATUS_CONFIG = {
  queued:     { label: "Queued",     icon: Clock,        cls: "text-content-muted bg-surface-elevated" },
  processing: { label: "Processing", icon: Loader2,      cls: "text-blue-500 bg-blue-500/10" },
  done:       { label: "Done",       icon: CheckCircle2, cls: "text-green-500 bg-green-500/10" },
  failed:     { label: "Failed",     icon: XCircle,      cls: "text-red-500 bg-red-500/10" }
} as const;

function QueueCard({ name, counts }: { name: string; counts: QueueCounts }) {
  const total = counts.waiting + counts.active + counts.completed + counts.failed + counts.delayed;
  return (
    <div className="bg-surface-panel border border-surface-border rounded-xl p-4">
      <p className="text-xs font-semibold text-content-secondary uppercase tracking-wider mb-3">
        {name}
      </p>
      <div className="grid grid-cols-5 gap-2 text-center">
        {[
          { label: "Waiting",  val: counts.waiting,   cls: "text-content-muted" },
          { label: "Active",   val: counts.active,    cls: "text-blue-500" },
          { label: "Done",     val: counts.completed, cls: "text-green-500" },
          { label: "Failed",   val: counts.failed,    cls: "text-red-500" },
          { label: "Delayed",  val: counts.delayed,   cls: "text-yellow-500" }
        ].map(({ label, val, cls }) => (
          <div key={label}>
            <p className={`text-lg font-bold ${cls}`}>{val}</p>
            <p className="text-[10px] text-content-muted">{label}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-content-muted mt-2 text-right">total: {total}</p>
    </div>
  );
}

export function DetectionJobsPage() {
  const [page, setPage] = useState(1);

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ["queue-stats"],
    queryFn: getQueueStats,
    refetchInterval: POLL
  });

  const { data: jobsData, isLoading: jobsLoading, refetch: refetchJobs } = useQuery({
    queryKey: ["detection-jobs", page],
    queryFn: () => getDetectionJobs(page, PAGE_SIZE),
    refetchInterval: POLL,
    placeholderData: (prev) => prev
  });

  const jobs = jobsData?.items ?? [];
  const totalPages = jobsData?.pages ?? 1;
  const total = jobsData?.total ?? 0;

  function refresh() {
    refetchStats();
    refetchJobs();
  }

  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Detection Jobs" description="Monitor BullMQ queues dan riwayat job inference">
        <button
          onClick={refresh}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-border text-content-secondary rounded-lg hover:bg-surface-elevated transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </PageHeader>

      {/* Queue stats */}
      <div>
        <h2 className="text-xs font-semibold text-content-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
          <Activity className="w-3.5 h-3.5" /> Queue Status
        </h2>
        {statsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height="100px" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <QueueCard name="Inference" counts={stats!.infer} />
            <QueueCard name="Notification" counts={stats!.notification} />
          </div>
        )}
      </div>

      {/* Jobs table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-content-secondary uppercase tracking-wider">
            Detection Jobs
            {total > 0 && (
              <span className="ml-2 normal-case font-normal text-content-muted">
                ({total} total)
              </span>
            )}
          </h2>
        </div>

        <DataTable
          footer={
            <Pagination
              page={page}
              limit={PAGE_SIZE}
              total={total}
              totalPages={totalPages}
              onChange={setPage}
            />
          }
        >
          {jobsLoading && !jobsData ? (
            <tbody>
              <tr>
                <td colSpan={6} className="p-4">
                  <div className="space-y-3">
                    {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height="2.5rem" />)}
                  </div>
                </td>
              </tr>
            </tbody>
          ) : jobs.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={6}>
                  <div className="flex flex-col items-center gap-2 py-12 text-content-muted">
                    <Activity className="w-8 h-8" />
                    <p className="text-sm">Belum ada detection job</p>
                  </div>
                </td>
              </tr>
            </tbody>
          ) : (
            <>
              <thead>
                <tr className={tHead}>
                  <th className={tH}>Status</th>
                  <th className={tH}>Camera ID</th>
                  <th className={tH}>Checks</th>
                  <th className={tH}>Dibuat</th>
                  <th className={tH}>Diupdate</th>
                  <th className={tH}>Error</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const cfg = STATUS_CONFIG[job.status];
                  const Icon = cfg.icon;
                  return (
                    <tr key={job._id} className={tRow}>
                      <td className={tDTop}>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium ${cfg.cls}`}>
                          <Icon className={`w-3 h-3 ${job.status === "processing" ? "animate-spin" : ""}`} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className={tDTop}>
                        <span className="text-xs font-mono text-content-secondary">{job.cameraId}</span>
                      </td>
                      <td className={tDTop}>
                        <div className="flex flex-wrap gap-1">
                          {job.selectedChecks.map((c) => (
                            <span key={c} className="text-[10px] px-1.5 py-0.5 bg-surface-elevated border border-surface-border rounded text-content-muted">
                              {c.replace("_count", "")}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className={tDTop}>
                        <span className="text-xs text-content-secondary whitespace-nowrap">{formatRelative(job.createdAt)}</span>
                      </td>
                      <td className={tDTop}>
                        <span className="text-xs text-content-secondary whitespace-nowrap">{formatRelative(job.updatedAt)}</span>
                      </td>
                      <td className={tDTop}>
                        {job.error ? (
                          <span className="text-xs text-red-500 max-w-xs truncate block" title={job.error}>{job.error}</span>
                        ) : (
                          <span className="text-content-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </>
          )}
        </DataTable>
      </div>
    </div>
  );
}

