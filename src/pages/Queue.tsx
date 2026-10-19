import React from "react";
import { Card, DemoBadge, EmptyState, PageHeader, SecondaryButton, StatusChip, Toasts, pushToast, type Toast, type StatusKind } from "../components/ui";
import { cancelJob, fetchQueue, useLive, type LiveQueueRow } from "../lib/db";
import { demoQueueJobs } from "../data/demo";

type Filter = "all" | "scheduled" | "processing" | "published" | "failed";

const filters: Filter[] = ["all", "scheduled", "processing", "published", "failed"];

interface Row {
  key: string;
  content: string;
  pages: string;
  scheduledFor: string;
  status: StatusKind;
  attempts: number;
  jobId?: string;
  cancellable: boolean;
}

const demoRows: Row[] = demoQueueJobs.map((j) => ({
  key: j.id,
  content: j.content,
  pages: j.pages.join(", "),
  scheduledFor: j.scheduledFor,
  status: j.status,
  attempts: j.attempts,
  cancellable: false,
}));

function liveToRows(live: LiveQueueRow[]): Row[] {
  const map = (s: string): StatusKind =>
    s === "published" ? "published" : s === "failed" ? "failed" : s === "processing" ? "processing" : s === "cancelled" ? "cancelled" : "scheduled";
  return live.map((j) => ({
    key: j.jobId,
    content: j.caption.length > 60 ? j.caption.slice(0, 60) + "…" : j.caption,
    pages: j.pageName,
    scheduledFor: new Date(j.runAtUtc).toLocaleString(),
    status: map(j.status),
    attempts: j.attempts,
    jobId: j.jobId,
    cancellable: j.status === "scheduled" || j.status === "queued",
  }));
}

export default function Queue() {
  const [filter, setFilter] = React.useState<Filter>("all");
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const { live, loading, data: liveRows, refresh } = useLive(fetchQueue, [] as LiveQueueRow[]);
  const rows = live ? liveToRows(liveRows) : demoRows;
  const jobs = rows.filter((j) => filter === "all" || j.status === filter);

  const doCancel = async (row: Row) => {
    if (!row.jobId) return;
    try {
      await cancelJob(row.jobId);
      pushToast(setToasts, "success", "Job cancelled.");
      refresh();
    } catch (e) {
      pushToast(setToasts, "error", e instanceof Error ? e.message : "Cancel failed.");
    }
  };

  return (
    <div>
      <PageHeader
        title="Publishing Queue"
        badge={!live}
        description={live ? "Live publishing jobs. Cancel any job that hasn't run yet." : "Track scheduled and processing posts. All jobs below are demo data — nothing is really queued."}
      />

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filter jobs by status">
          <span className="text-sm font-medium text-gray-600">Filter:</span>
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`rounded-full border px-3 py-1 text-sm font-medium ${
                filter === f
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-white text-navy hover:bg-bg"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <span className="ml-auto">{live ? <span className="text-xs font-semibold text-success">● Live</span> : <DemoBadge />}</span>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-gray-600">Loading queue…</p>
        ) : jobs.length === 0 ? (
          <EmptyState
            icon="📭"
            title={`No ${filter} jobs`}
            body={live ? "No jobs with this status." : "There are no demo jobs with this status. Try another filter."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Content</th>
                  <th className="px-4 py-3">Pages</th>
                  <th className="px-4 py-3">Scheduled For</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Attempts</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.key} className="border-b border-border last:border-0 hover:bg-bg">
                    <td className="px-4 py-3 font-medium text-gray-900">{j.content}</td>
                    <td className="px-4 py-3 text-gray-600">{j.pages}</td>
                    <td className="px-4 py-3 text-gray-600">{j.scheduledFor}</td>
                    <td className="px-4 py-3"><StatusChip status={j.status} /></td>
                    <td className="px-4 py-3 text-gray-600">{j.attempts}</td>
                    <td className="px-4 py-3">
                      {live && j.cancellable ? (
                        <SecondaryButton onClick={() => doCancel(j)} title="Cancel this job before it runs">
                          Cancel
                        </SecondaryButton>
                      ) : (
                        <SecondaryButton
                          disabled
                          title={live ? "Only scheduled jobs can be cancelled" : "Demo only — no real queue in demo mode"}
                          onClick={() => {}}
                        >
                          Cancel
                        </SecondaryButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-gray-500">
          {live
            ? "Cancelling stops the job before its next run. Already-published posts are never affected."
            : <>Retry/cancel controls are visual only in demo mode — they work against the real queue once Supabase is connected. <DemoBadge /></>}
        </p>
      </Card>
      <Toasts toasts={toasts} />
    </div>
  );
}
