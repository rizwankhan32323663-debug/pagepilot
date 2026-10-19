import React from "react";
import { Card, DemoBadge, EmptyState, PageHeader, StatusChip, type StatusKind } from "../components/ui";
import { fetchLogs, useLive, type LiveLogRow } from "../lib/db";
import { demoLogRows } from "../data/demo";

type Filter = "all" | "success" | "failed" | "cancelled";
const filters: Filter[] = ["all", "success", "failed", "cancelled"];

interface Row {
  key: string;
  dateTime: string;
  pages: string;
  status: StatusKind;
  message: string;
}

const demoRows: Row[] = demoLogRows.map((r) => ({
  key: r.id, dateTime: r.dateTime, pages: r.pages, status: r.status, message: r.message,
}));

function liveToRows(live: LiveLogRow[]): Row[] {
  const mapStatus = (o: string): StatusKind => (o === "success" || o === "skipped_duplicate" ? "success" : "failed");
  return live.map((r) => {
    const msg = r.error ?? (r.remoteId ? `Published (remote id ${r.remoteId})` : r.outcome);
    return {
      key: r.id,
      dateTime: new Date(r.startedAt).toLocaleString(),
      pages: r.pageName,
      status: mapStatus(r.outcome),
      message: `${r.caption.length > 50 ? r.caption.slice(0, 50) + "…" : r.caption} — ${msg}`,
    };
  });
}

export default function Logs() {
  const [filter, setFilter] = React.useState<Filter>("all");
  const { live, loading, data: liveRows } = useLive(fetchLogs, [] as LiveLogRow[]);
  const rows = live ? liveToRows(liveRows) : demoRows;
  const filtered = rows.filter(
    (r) => filter === "all" || (filter === "success" ? r.status === "success" : filter === "failed" ? r.status === "failed" : r.status === "cancelled"),
  );

  return (
    <div>
      <PageHeader
        title="Publishing Logs"
        badge={!live}
        description={live ? "Every publish attempt, per Page. Errors are sanitized — tokens never appear here." : "Detailed per-target results and error messages. Every row below is demo data — no real publishing has happened."}
      />

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filter logs by status">
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
          <p className="py-8 text-center text-sm text-gray-600">Loading logs…</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="📋"
            title={`No ${filter} logs`}
            body={live ? "No attempts recorded yet." : "No demo log rows with this status. Try another filter."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Date &amp; Time</th>
                  <th className="px-4 py-3">Pages</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Message</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.key} className="border-b border-border last:border-0 hover:bg-bg">
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">{r.dateTime}</td>
                    <td className="px-4 py-3 text-gray-600">{r.pages}</td>
                    <td className="px-4 py-3"><StatusChip status={r.status} /></td>
                    <td className="px-4 py-3 text-gray-800">{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-gray-500">
          In production, errors are sanitized before display and tokens are never logged. {!live && <DemoBadge />}
        </p>
      </Card>
    </div>
  );
}
