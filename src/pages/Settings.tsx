import React from "react";
import {
  Card, DemoBadge, PageHeader, PrimaryButton, SecondaryButton, Toasts, pushToast, type Toast,
} from "../components/ui";

const setupStatus = [
  { label: "Supabase (database + auth)", state: "Not configured", phase: "Phase 2" },
  { label: "Meta API (Facebook app)", state: "Not configured", phase: "Phase 3" },
  { label: "Storage (media)", state: "Not configured", phase: "Phase 2" },
  { label: "Scheduler (server-side jobs)", state: "Not configured", phase: "Phase 5" },
];

export default function Settings() {
  const [displayName, setDisplayName] = React.useState("Demo User");
  const [timezone, setTimezone] = React.useState("Asia/Karachi");
  const [emailNotif, setEmailNotif] = React.useState(true);
  const [failNotif, setFailNotif] = React.useState(true);
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const saveProfile = () => {
    pushToast(setToasts, "info", "Demo mode — profile is kept in this browser session only (Phase 1).");
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        badge
        description="Profile, integrations, notifications and setup status. Changes here are demo-only in Phase 1."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Profile */}
        <Card>
          <h2 className="text-lg font-bold text-navy">Profile <DemoBadge /></h2>
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="display-name" className="mb-1 block text-sm font-semibold text-navy">
                Display name
              </label>
              <input
                id="display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="timezone" className="mb-1 block text-sm font-semibold text-navy">
                Timezone
              </label>
              <select
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
              >
                <option value="Asia/Karachi">Asia/Karachi (PKT, UTC+5)</option>
                <option value="UTC">UTC</option>
                <option value="America/New_York">America/New_York (ET)</option>
                <option value="Europe/London">Europe/London (GMT/BST)</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">Scheduled posts are stored in UTC and shown in this timezone.</p>
            </div>
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-semibold text-navy">
                Email address
              </label>
              <input
                id="email"
                type="email"
                defaultValue="demo@example.com"
                disabled
                title="Account system arrives in Phase 2"
                className="w-full cursor-not-allowed rounded-lg border border-border bg-bg px-3 py-2 text-sm text-gray-500"
              />
              <p className="mt-1 text-xs text-gray-500">Account email is managed by login — arrives in Phase 2.</p>
            </div>
            <PrimaryButton onClick={saveProfile}>Save Changes</PrimaryButton>
          </div>
        </Card>

        {/* Facebook integration */}
        <Card>
          <h2 className="text-lg font-bold text-navy">Facebook Integration</h2>
          <div className="mt-4 rounded-lg border border-dashed border-border bg-bg p-4 text-center">
            <p className="text-sm font-semibold text-gray-700">Not configured</p>
            <p className="mt-1 text-sm text-gray-600">
              OAuth connection to Facebook arrives in Phase 3. No Facebook account is linked.
            </p>
            <div className="mt-3"><DemoBadge /></div>
          </div>
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-navy">Environment / Setup Status</h3>
            <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
              {setupStatus.map((s) => (
                <li key={s.label} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{s.label}</p>
                    <p className="text-xs text-gray-500">{s.phase}</p>
                  </div>
                  <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-error">
                    {s.state}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        {/* Notifications */}
        <Card>
          <h2 className="text-lg font-bold text-navy">Notifications <DemoBadge /></h2>
          <div className="mt-4 space-y-4">
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <span className="text-sm text-gray-800">Email me when a scheduled post publishes</span>
              <input
                type="checkbox"
                checked={emailNotif}
                onChange={(e) => setEmailNotif(e.target.checked)}
                className="h-5 w-5 accent-[#2364AA]"
                aria-label="Email me when a scheduled post publishes"
              />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <span className="text-sm text-gray-800">Notify me on publish failures</span>
              <input
                type="checkbox"
                checked={failNotif}
                onChange={(e) => setFailNotif(e.target.checked)}
                className="h-5 w-5 accent-[#2364AA]"
                aria-label="Notify me on publish failures"
              />
            </label>
            <p className="text-xs text-gray-500">Demo toggles only — real notifications arrive with the backend (Phase 5+).</p>
          </div>
        </Card>

        {/* Security */}
        <Card>
          <h2 className="text-lg font-bold text-navy">Security</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-700">
            <li>PagePilot never asks for or stores your Facebook password — connection is OAuth only (Phase 3).</li>
            <li>Page access tokens are stored encrypted server-side and never sent to the browser (Phase 3).</li>
            <li>All data is isolated per user with database Row Level Security (Phase 2).</li>
          </ul>
          <div className="mt-3"><DemoBadge /></div>
        </Card>

        {/* Data */}
        <Card className="lg:col-span-2">
          <h2 className="text-lg font-bold text-navy">Your Data</h2>
          <p className="mt-1 text-sm text-gray-600">
            Export or delete your PagePilot data. These controls become real in Phase 7.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <SecondaryButton
              disabled
              title="Data export arrives in Phase 7"
              onClick={() => {}}
            >
              Export my data
            </SecondaryButton>
            <SecondaryButton
              disabled
              title="Account deletion arrives in Phase 7"
              onClick={() => {}}
            >
              Delete my data
            </SecondaryButton>
          </div>
        </Card>
      </div>

      <Toasts toasts={toasts} />
    </div>
  );
}
