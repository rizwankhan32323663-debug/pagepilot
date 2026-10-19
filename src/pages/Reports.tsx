import React from "react";
import { Card, DemoBadge, PageHeader, SecondaryButton, StatCard, Toasts, pushToast, type Toast } from "../components/ui";
import { fetchPageStats, useLive, type PageStats } from "../lib/db";

/**
 * Reports — per-Page publishing statistics.
 * LIVE mode: real counts from the database. DEMO mode: clearly labelled
 * fictional data. No engagement metrics are ever shown: Meta engagement
 * insights are not integrated, and inventing them would violate the spec.
 */

const demoStats: PageStats[] = [
  { page: "Demo Page A", published: 12, scheduled: 3, failed: 1, drafts: 2 },
  { page: "Demo Page B", published: 8, scheduled: 1, failed: 0, drafts: 1 },
];

// Fictional 7-day publishing activity for the demo chart.
const demoWeek: { day: string; published: number; failed: number }[] = [
  { day: "Mon", published: 2, failed: 0 },
  { day: "Tue", published: 3, failed: 0 },
  { day: "Wed", published: 1, failed: 1 },
  { day: "Thu", published: 4, failed: 0 },
  { day: "Fri", published: 2, failed: 0 },
  { day: "Sat", published: 5, failed: 0 },
  { day: "Sun", published: 3, failed: 0 },
];

function DemoBarChart() {
  const max = Math.max(...demoWeek.map((d) => d.published + d.failed), 1);
  return (
    <div className="mt-4" role="img" aria-label="Demo chart: published and failed posts per day over the last 7 days">
      <div className="flex h-40 items-end gap-3">
        {demoWeek.map((d) => (
          <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex w-full max-w-10 flex-col justify-end gap-0.5" style={{ height: "100%" }}>
              <div
                className="w-full rounded-t bg-success"
                style={{ height: `${(d.published / max) * 100}%` }}
                title={`${d.published} published`}
              />
              <div
                className="w-full rounded-b bg-error"
                style={{ height: `${(d.failed / max) * 100}%` }}
                title={`${d.failed} failed`}
              />
            </div>
            <span className="text-xs font-medium text-gray-500">{d.day}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-gray-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded bg-success" aria-hidden="true" /> Published
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded bg-error" aria-hidden="true" /> Failed
        </span>
      </div>
    </div>
  );
}

export default function Reports() {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const [range, setRange] = React.useState("7 days");
  const { live, loading, data: liveStats } = useLive(fetchPageStats, [] as PageStats[]);
  const stats = live ? liveStats : demoStats;

  const totals = stats.reduce(
    (acc, s) => ({
      published: acc.published + s.published,
      scheduled: acc.scheduled + s.scheduled,
      failed: acc.failed + s.failed,
      drafts: acc.drafts + s.drafts,
    }),
    { published: 0, scheduled: 0, failed: 0, drafts: 0 },
  );

  const exportCsv = () => {
    const header = "page,published,scheduled,failed,drafts\n";
    const rows = stats.map((s) => `${s.page},${s.published},${s.scheduled},${s.failed},${s.drafts}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = live ? "pagepilot-report.csv" : "pagepilot-demo-report.csv";
    a.click();
    URL.revokeObjectURL(url);
    pushToast(setToasts, "success", live ? "Report downloaded as CSV." : "Demo report downloaded as CSV (demo data only).");
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Publishing statistics per connected Page. Only counts PagePilot actually records — no invented engagement metrics."
        badge={!live}
        actions={
          <>
            <label className="sr-only" htmlFor="report-range">Date range</label>
            <select
              id="report-range"
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-navy"
            >
              <option>7 days</option>
              <option>30 days</option>
              <option>90 days</option>
            </select>
            <SecondaryButton onClick={exportCsv}>Export CSV</SecondaryButton>
          </>
        }
      />

      {loading ? (
        <p className="py-8 text-center text-sm text-gray-600">Loading report…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Published posts" value={totals.published} sub={`Last ${range}`} tone="success" demo={!live} />
            <StatCard label="Scheduled posts" value={totals.scheduled} sub="Upcoming" demo={!live} />
            <StatCard label="Failed posts" value={totals.failed} sub={`Last ${range}`} tone={totals.failed > 0 ? "error" : "neutral"} demo={!live} />
            <StatCard label="Drafts" value={totals.drafts} sub="Unpublished" demo={!live} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {!live && (
              <Card>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-navy">Publishing activity</h2>
                  <DemoBadge />
                </div>
                <p className="mt-1 text-xs text-gray-500">Posts published vs failed per day (demo data, last 7 days).</p>
                <DemoBarChart />
              </Card>
            )}

            <Card className={live ? "lg:col-span-2" : ""}>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-navy">Per-Page breakdown</h2>
                {live ? <span className="text-xs font-semibold text-success">● Live</span> : <DemoBadge />}
              </div>
              {stats.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-600">
                  {live ? "No Pages connected yet — connect a Page to see statistics." : "No demo data."}
                </p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase text-gray-500">
                        <th className="py-2 pr-4 font-semibold">Page</th>
                        <th className="py-2 pr-4 font-semibold">Published</th>
                        <th className="py-2 pr-4 font-semibold">Scheduled</th>
                        <th className="py-2 pr-4 font-semibold">Failed</th>
                        <th className="py-2 font-semibold">Drafts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.map((s) => (
                        <tr key={s.page} className="border-b border-border last:border-0">
                          <td className="py-2.5 pr-4 font-semibold text-navy">{s.page}</td>
                          <td className="py-2.5 pr-4 text-success">{s.published}</td>
                          <td className="py-2.5 pr-4 text-primary">{s.scheduled}</td>
                          <td className="py-2.5 pr-4 text-error">{s.failed}</td>
                          <td className="py-2.5 text-gray-600">{s.drafts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!live && (
                <p className="mt-3 text-xs text-gray-500">
                  Real per-Page statistics appear here after backend integration (Phase 2+) and real publishing (Phase 4+).
                </p>
              )}
            </Card>
          </div>
        </>
      )}

      <Card className="mt-6 border-amber-200 bg-amber-50">
        <h2 className="text-sm font-bold text-navy">About engagement metrics</h2>
        <p className="mt-1 text-sm text-gray-600">
          Likes, reach, and impressions are <strong>not</strong> shown because Meta engagement insights are not
          integrated yet — and PagePilot never invents statistics. Only publishing outcomes that PagePilot itself
          records (published / scheduled / failed / drafts) are reported.
        </p>
      </Card>

      <Toasts toasts={toasts} />
    </div>
  );
}
