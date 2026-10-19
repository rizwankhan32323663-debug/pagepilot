import React from "react";
import { useNavigate } from "react-router-dom";
import { Card, DemoBadge, Modal, PageHeader, SecondaryButton, DangerButton, Toasts, pushToast, type Toast } from "../components/ui";
import { useAuth } from "../lib/auth";
import { exportUserData, requestAccountDeletion } from "../lib/db";

/**
 * Account and Security — Phase 7 wired.
 * - Profile/password/sessions unlock with Supabase Auth (live) or stay
 *   clearly disabled (demo).
 * - Data export downloads a real JSON dump (live) — token material
 *   (vault ids, ciphertext) is scrubbed from the export.
 * - Account deletion calls the account-delete Edge Function and requires
 *   typing DELETE. Irreversible.
 */
export default function Account() {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const { user, configured, signOut } = useAuth();
  const navigate = useNavigate();
  const live = configured && !!user;

  const doExport = async () => {
    if (!live) {
      pushToast(setToasts, "info", "Data export needs a signed-in account (Supabase). Nothing to export in demo mode.");
      return;
    }
    setBusy(true);
    try {
      await exportUserData();
      pushToast(setToasts, "success", "Your data was downloaded as JSON (secret references scrubbed).");
    } catch (e) {
      pushToast(setToasts, "error", e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (typed !== "DELETE") return;
    setBusy(true);
    try {
      await requestAccountDeletion();
      pushToast(setToasts, "success", "Your account and all data were deleted.");
      navigate("/login", { replace: true });
    } catch (e) {
      pushToast(setToasts, "error", e instanceof Error ? e.message : "Deletion failed.");
    } finally {
      setBusy(false);
      setConfirmDelete(false);
      setTyped("");
    }
  };

  const doSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div>
      <PageHeader
        title="Account and Security"
        description={live ? `Signed in as ${user?.email ?? "unknown"}.` : "Manage your PagePilot account, sign-in security, and your data."}
        badge={!live}
        actions={live ? <SecondaryButton onClick={() => void doSignOut()}>Sign out</SecondaryButton> : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Profile */}
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-navy">Profile</h2>
            {!live && <DemoBadge />}
          </div>
          <div className="mt-4 space-y-3">
            <div>
              <label htmlFor="acc-name" className="mb-1 block text-sm font-semibold text-navy">Display name</label>
              <input
                id="acc-name"
                type="text"
                defaultValue={live ? (user?.user_metadata?.display_name ?? "") : "Demo User"}
                disabled={!live}
                title={live ? "Profile editing arrives with the Phase 7 polish pass" : "Available after Phase 2 (Supabase Auth)"}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-navy disabled:bg-bg disabled:text-gray-500"
              />
            </div>
            <div>
              <label htmlFor="acc-email" className="mb-1 block text-sm font-semibold text-navy">Email</label>
              <input
                id="acc-email"
                type="email"
                defaultValue={live ? (user?.email ?? "") : "demo@example.com"}
                disabled
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-gray-500"
              />
            </div>
            <div>
              <label htmlFor="acc-tz" className="mb-1 block text-sm font-semibold text-navy">Timezone</label>
              <select
                id="acc-tz"
                disabled={!live}
                defaultValue="Asia/Karachi"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-navy disabled:bg-bg disabled:text-gray-500"
              >
                <option>Asia/Karachi</option>
                <option>UTC</option>
                <option>America/New_York</option>
                <option>Europe/London</option>
              </select>
            </div>
            <SecondaryButton disabled title={live ? "Profile editing arrives with the Phase 7 polish pass" : "Available after Phase 2 (Supabase Auth)"}>
              Save changes
            </SecondaryButton>
            {!live && <p className="text-xs text-gray-500">Profile editing unlocks with real authentication in Phase 2.</p>}
          </div>
        </Card>

        {/* Password + sessions */}
        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-bold text-navy">Password</h2>
            <p className="mt-2 text-sm text-gray-600">
              {live
                ? "Use the password-reset email to change your password securely."
                : "Password changes are handled by Supabase Auth — not implemented until Phase 2."}
            </p>
            <div className="mt-4">
              <SecondaryButton disabled title={live ? "Password reset via email — UI arrives with the Phase 7 polish pass" : "Available after Phase 2 (Supabase Auth)"}>
                Change password
              </SecondaryButton>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-navy">Active sessions</h2>
              {!live && <DemoBadge />}
            </div>
            <ul className="mt-3 space-y-2 text-sm text-gray-600">
              <li className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <span>{live ? "This browser session" : "Demo browser session — this device"}</span>
                <span className="text-xs font-semibold text-success">Current</span>
              </li>
            </ul>
            {!live && (
              <p className="mt-2 text-xs text-gray-500">
                Real session listing and “sign out everywhere” arrive with Supabase Auth (Phase 2).
              </p>
            )}
          </Card>
        </div>
      </div>

      {/* Data export / deletion */}
      <Card className="mt-6">
        <h2 className="text-lg font-bold text-navy">Your data</h2>
        <p className="mt-2 text-sm text-gray-600">
          Export everything PagePilot stores about you as JSON (token material is scrubbed),
          or permanently delete your account and all associated data — Pages, posts, jobs, logs, media.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <SecondaryButton onClick={() => void doExport()} disabled={busy}>
            {busy ? "Working…" : "Export my data"}
          </SecondaryButton>
          <DangerButton onClick={() => setConfirmDelete(true)} disabled={busy} title={live ? "Permanently delete your account and all data" : "Needs a signed-in account"}>
            Delete my account
          </DangerButton>
        </div>
        {!live && (
          <p className="mt-2 text-xs text-gray-500">
            Export and deletion need a signed-in account (Supabase). In demo mode the buttons explain instead of acting.
          </p>
        )}
      </Card>

      {confirmDelete && (
        <Modal title="Delete your account?" onClose={() => { setConfirmDelete(false); setTyped(""); }}>
          <p className="text-sm text-gray-600">
            This <strong className="text-error">permanently</strong> deletes your PagePilot account: all connected
            Pages and their tokens, posts, scheduled jobs, logs, media files, and your login. This cannot be undone.
          </p>
          <label htmlFor="delete-confirm" className="mt-4 block text-sm font-semibold text-navy">
            Type <code className="rounded bg-bg px-1">DELETE</code> to confirm
          </label>
          <input
            id="delete-confirm"
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="DELETE"
            autoComplete="off"
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm text-navy focus:border-error focus:outline-none"
          />
          <div className="mt-5 flex justify-end gap-2">
            <SecondaryButton onClick={() => { setConfirmDelete(false); setTyped(""); }}>Cancel</SecondaryButton>
            <DangerButton onClick={() => void doDelete()} disabled={typed !== "DELETE" || busy || !live} title={!live ? "Sign in first" : "Irreversible"}>
              {busy ? "Deleting…" : "Delete everything"}
            </DangerButton>
          </div>
        </Modal>
      )}

      <Toasts toasts={toasts} />
    </div>
  );
}
