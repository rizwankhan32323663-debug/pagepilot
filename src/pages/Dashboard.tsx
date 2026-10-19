import { Link } from "react-router-dom";
import { Card, DemoBadge, EmptyState, PageHeader, PrimaryButton, SecondaryButton, StatCard, StatusChip } from "../components/ui";
import { demoRecentActivity, demoUpcomingPosts, setupChecklist } from "../data/demo";

export default function Dashboard() {
  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Overview of your pages, posts and publishing health. All figures below are demo data."
        actions={
          <Link to="/pages">
            <PrimaryButton>Connect Facebook</PrimaryButton>
          </Link>
        }
      />

      {/* Metric cards — zero state, demo labelled */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Connected Pages" value={0} sub="No pages connected yet" />
        <StatCard label="Drafts" value={0} sub="No drafts saved" />
        <StatCard label="Scheduled" value={0} sub="Nothing scheduled" />
        <StatCard label="Published" value={0} sub="Nothing published" />
        <StatCard label="Failed" value={0} sub="No failures" tone="success" />
      </div>

      {/* Connection warning — honest: nothing is connected */}
      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4" role="alert">
        <p className="text-sm font-semibold text-warning">No Facebook account connected</p>
        <p className="mt-1 text-sm text-gray-700">
          PagePilot is not connected to Facebook yet. Connect your account to manage real pages.
          <span className="ml-2"><DemoBadge /></span>
        </p>
        <div className="mt-3">
          <Link to="/pages">
            <SecondaryButton>Go to Connected Pages</SecondaryButton>
          </Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Upcoming posts (demo preview) */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-navy">Upcoming posts</h2>
            <DemoBadge />
          </div>
          <ul className="divide-y divide-border">
            {demoUpcomingPosts.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{p.caption}</p>
                  <p className="text-xs text-gray-500">{p.pages.join(", ")} · {p.scheduledFor}</p>
                </div>
                <StatusChip status={p.status} />
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <Link to="/calendar" className="text-sm font-semibold text-primary hover:underline">
              View calendar →
            </Link>
          </div>
        </Card>

        {/* Recent activity (demo) */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-navy">Recent activity</h2>
            <DemoBadge />
          </div>
          <ul className="divide-y divide-border">
            {demoRecentActivity.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <p className="text-sm text-gray-800">{a.text}</p>
                <p className="shrink-0 text-xs text-gray-500">{a.time}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Setup checklist */}
      <Card className="mt-6">
        <h2 className="text-lg font-bold text-navy">Setup checklist</h2>
        <p className="mt-1 text-sm text-gray-600">Complete these steps to start publishing for real.</p>
        <ul className="mt-4 space-y-3">
          {setupChecklist.map((s) => (
            <li key={s.id} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold ${
                  s.done ? "border-green-300 bg-green-50 text-success" : "border-border bg-bg text-gray-400"
                }`}
              >
                {s.done ? "✓" : "○"}
              </span>
              <span className="flex-1 text-sm text-gray-800">{s.label}</span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{s.phase}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Empty-state example for "no real data" */}
      <div className="mt-6">
        <EmptyState
          icon="📊"
          title="No real data yet"
          body="Once you connect Facebook and publish, your stats, upcoming posts and activity will appear here."
          action={
            <Link to="/create">
              <PrimaryButton>Create your first post</PrimaryButton>
            </Link>
          }
        />
      </div>
    </div>
  );
}
