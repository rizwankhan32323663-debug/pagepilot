import React from "react";
import { Card, DemoBadge, PageHeader, SecondaryButton, Toasts, pushToast, type Toast } from "../components/ui";
import { isSupabaseConfigured } from "../lib/supabase";

/**
 * Setup and Connection Diagnostics — Phase 1 UI only.
 * Honest environment checklist. Each row reports the TRUE current state:
 * only the static frontend exists. Nothing is probed over the network in
 * Phase 1; states are declared, not detected, and labelled accordingly.
 */

interface CheckRow {
  name: string;
  status: "ok" | "not-configured";
  detail: string;
  needed: string;
}

const checks: CheckRow[] = [
  {
    name: "Frontend application",
    status: "ok",
    detail: "This dashboard (React + Vite + TypeScript + Tailwind) builds and renders locally.",
    needed: "None — Phase 1 complete.",
  },
  {
    name: "Supabase — Auth, Database, Storage",
    status: "not-configured",
    detail: "No Supabase project is connected. No user accounts, no database, no file storage exist yet.",
    needed: "Phase 2: create a free Supabase project, apply the migrations in supabase/migrations/, set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. See SUPABASE_SETUP.md.",
  },
  {
    name: "Meta Developer app (OAuth + publishing)",
    status: "not-configured",
    detail: "No Meta app is registered, so Facebook OAuth, Page discovery, and publishing are unavailable.",
    needed: "Phase 3: create a Meta app, request pages_manage_posts, pages_read_engagement, pages_show_list, and configure the OAuth redirect URI. See META_APP_SETUP.md.",
  },
  {
    name: "Persistent scheduler",
    status: "not-configured",
    detail: "No server-side scheduler exists. Scheduled posts cannot run while the browser is closed.",
    needed: "Phase 5: Supabase Cron/pg_cron or a Cloudflare scheduled worker — free-tier limits must be verified first.",
  },
  {
    name: "Environment variables",
    status: "not-configured",
    detail: ".env.example lists the required variable names. No real values are set anywhere in this repo.",
    needed: "Copy .env.example to .env and fill values as each phase is configured. Never commit .env.",
  },
];

function StatusPill({ status }: { status: CheckRow["status"] }) {
  return status === "ok" ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-success">
      <span aria-hidden="true">●</span> OK
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-warning">
      <span aria-hidden="true">●</span> Not configured
    </span>
  );
}

export default function Diagnostics() {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const [lastRun, setLastRun] = React.useState<string | null>(null);

  // Real check: are the Supabase env vars present in this build?
  // (This detects configuration, not a live connection — labelled honestly.)
  const supabaseEnv = isSupabaseConfigured();
  const liveChecks: CheckRow[] = checks.map((c) =>
    c.name.startsWith("Supabase")
      ? {
          ...c,
          status: supabaseEnv ? ("ok" as const) : ("not-configured" as const),
          detail: supabaseEnv
            ? "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in this build. Live Auth/DB/Storage still require the migrations to be applied (see SUPABASE_SETUP.md)."
            : c.detail,
          needed: supabaseEnv
            ? "Apply supabase/migrations/ in order, then verify with the SQL checks in SUPABASE_SETUP.md."
            : c.needed,
        }
      : c,
  );

  const rerun = () => {
    const now = new Date().toLocaleString();
    setLastRun(now);
    pushToast(setToasts, "info", `Diagnostics re-run at ${now}. States are declared from the build configuration (no network probes in Phase 1).`);
  };

  return (
    <div>
      <PageHeader
        title="Setup and Connection Diagnostics"
        description="Honest status of every PagePilot subsystem. Nothing here is probed over the network in Phase 1 — states are declared from the build configuration."
        badge
        actions={<SecondaryButton onClick={rerun}>Re-run checks</SecondaryButton>}
      />

      {lastRun ? (
        <p className="mb-4 text-xs text-gray-500">Last check run: {lastRun} <DemoBadge /></p>
      ) : null}

      <div className="space-y-4">
        {liveChecks.map((c) => (
          <Card key={c.name}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-navy">{c.name}</h2>
              <StatusPill status={c.status} />
            </div>
            <p className="mt-2 text-sm text-gray-600">{c.detail}</p>
            <p className="mt-2 rounded-lg bg-bg px-3 py-2 text-xs text-gray-600">
              <span className="font-semibold text-navy">What&apos;s needed: </span>
              {c.needed}
            </p>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <h2 className="text-lg font-bold text-navy">Troubleshooting quick reference</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-gray-600">
          <li>“Connect Facebook” does nothing → expected until Phase 3 (Meta app + Edge Functions).</li>
          <li>Token import clears the field → expected until Phase 3 (no validation backend yet).</li>
          <li>Scheduled posts won’t run with the browser closed → expected until Phase 5 (persistent scheduler).</li>
          <li>All data on screen is labelled <DemoBadge /> and disappears when real data arrives.</li>
        </ul>
      </Card>

      <Toasts toasts={toasts} />
    </div>
  );
}
