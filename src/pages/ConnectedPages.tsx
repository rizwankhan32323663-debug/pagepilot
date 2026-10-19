import React from "react";
import { Link } from "react-router-dom";
import {
  Card, DangerButton, DemoBadge, EmptyState, Modal, PageHeader, PrimaryButton, SecondaryButton,
  Toasts, pushToast, type Toast,
} from "../components/ui";
import { fetchPages, useLive, type LivePage } from "../lib/db";
import { disconnectPage, startOAuth, validatePage } from "../lib/meta";
import { isSupabaseConfigured } from "../lib/supabase";
import { useAuth } from "../lib/auth";

function statusColor(s: string): string {
  switch (s) {
    case "healthy": return "text-success";
    case "needs_reauthorization": return "text-error";
    case "needs_attention": return "text-warning";
    case "disconnected": return "text-gray-500";
    default: return "text-primary";
  }
}

export default function ConnectedPages() {
  const { user } = useAuth();
  const { live, loading, data: pages, refresh } = useLive(fetchPages, [] as LivePage[]);
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const [query, setQuery] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState<LivePage | null>(null);

  const params = new URLSearchParams(window.location.search);
  React.useEffect(() => {
    if (params.get("oauth") === "success") {
      pushToast(setToasts, "success", `Facebook connected — ${params.get("connected") ?? 0} Page(s) added.`);
      window.history.replaceState({}, "", "/pages");
      refresh();
    } else if (params.get("oauth") === "error") {
      pushToast(setToasts, "error", `Facebook connection failed: ${params.get("reason") ?? "unknown error"}`);
      window.history.replaceState({}, "", "/pages");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = pages.filter(
    (p) =>
      p.page_name.toLowerCase().includes(query.toLowerCase()) ||
      p.meta_page_id.includes(query),
  );

  const doValidate = async (page: LivePage) => {
    setBusyId(page.id);
    try {
      const r = await validatePage(page.id);
      pushToast(setToasts, r.valid ? "success" : "error",
        r.valid ? `"${r.page_name}" is healthy.` : `"${r.page_name}" needs reauthorization — reconnect it.`);
      refresh();
    } catch (e) {
      pushToast(setToasts, "error", e instanceof Error ? e.message : "Validation failed.");
    } finally {
      setBusyId(null);
    }
  };

  const doDisconnect = async () => {
    if (!confirming) return;
    setBusyId(confirming.id);
    try {
      const r = await disconnectPage(confirming.id);
      pushToast(setToasts, "success", `"${r.page_name}" disconnected. Its token was deleted; other Pages are untouched.`);
      refresh();
    } catch (e) {
      pushToast(setToasts, "error", e instanceof Error ? e.message : "Disconnect failed.");
    } finally {
      setBusyId(null);
      setConfirming(null);
    }
  };

  const connect = async () => {
    if (!isSupabaseConfigured() || !user) {
      pushToast(setToasts, "info", "Sign in and configure Supabase + a Meta app first (see Diagnostics).");
      return;
    }
    try {
      await startOAuth();
    } catch (e) {
      pushToast(setToasts, "error", e instanceof Error ? e.message : "Could not start OAuth.");
    }
  };

  return (
    <div>
      <PageHeader
        title="Connected Pages"
        description={live ? "Pages you authorized PagePilot to manage. Each is validated independently." : "Facebook Pages you have authorized PagePilot to manage. None connected yet."}
        actions={
          <>
            <Link to="/pages/add">
              <SecondaryButton>Add Page</SecondaryButton>
            </Link>
            <PrimaryButton onClick={connect} title={live ? "Start Facebook OAuth" : "Needs sign-in + Supabase + Meta app"}>
              Connect Facebook
            </PrimaryButton>
          </>
        }
      />

      {!live && (
        <Card className="mb-6 border-dashed">
          <div className="flex flex-col items-center py-6 text-center">
            <div className="text-4xl" aria-hidden="true">🔗</div>
            <h2 className="mt-3 text-lg font-bold text-navy">Connect your Facebook Pages</h2>
            <p className="mt-1 max-w-md text-sm text-gray-600">
              Sign in (Phase 2 setup) and configure a Meta app (Phase 3), then connect with Facebook.
              Only Pages you are authorized to manage will ever be listed here.
            </p>
            <div className="mt-4"><DemoBadge /></div>
          </div>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="page-search">Search pages</label>
        <input
          id="page-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or Page ID…"
          className="w-full max-w-sm rounded-lg border border-border px-3 py-2 text-sm text-navy focus:border-primary focus:outline-none"
        />
        {live && !loading && (
          <span className="text-xs text-gray-500">{visible.length} of {pages.length} Pages</span>
        )}
      </div>

      {loading ? (
        <Card><p className="py-8 text-center text-sm text-gray-600">Loading Pages…</p></Card>
      ) : visible.length === 0 ? (
        <EmptyState
          icon="📄"
          title={live ? "No Pages match your search" : "No pages connected"}
          body={live ? "Try a different search, or connect a Page." : "Connect your Facebook account to get started. Only Pages you are authorized to manage will ever be listed here."}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-bg text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Page Name</th>
                <th className="px-4 py-3">Page ID</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Health</th>
                <th className="px-4 py-3">Last checked</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-bg">
                  <td className="px-4 py-3 font-semibold text-navy">{p.page_name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{p.meta_page_id}</td>
                  <td className="px-4 py-3 text-gray-600">{p.connection_method === "oauth" ? "OAuth" : "Manual token"}</td>
                  <td className={`px-4 py-3 font-semibold ${statusColor(p.connection_status)}`}>
                    {p.connection_status.replace(/_/g, " ")}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {p.last_checked_at ? new Date(p.last_checked_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <SecondaryButton disabled={busyId === p.id} onClick={() => doValidate(p)} title="Re-validate this Page's token with Meta">
                        {busyId === p.id ? "…" : "Validate"}
                      </SecondaryButton>
                      <DangerButton disabled={busyId === p.id} onClick={() => setConfirming(p)} title="Disconnect only this Page">
                        Disconnect
                      </DangerButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!live && (
        <p className="mt-3 text-xs text-gray-500">Demo mode — no real Pages. <DemoBadge /></p>
      )}

      {confirming && (
        <Modal title="Disconnect Page" onClose={() => setConfirming(null)}>
          <p className="text-sm text-gray-600">
            Disconnect <strong className="text-navy">“{confirming.page_name}”</strong>? Its stored token will be
            permanently deleted. Other Pages, posts, and logs are <strong>not</strong> affected.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <SecondaryButton onClick={() => setConfirming(null)}>Keep it</SecondaryButton>
            <DangerButton onClick={doDisconnect} disabled={busyId === confirming.id}>
              {busyId === confirming.id ? "Disconnecting…" : "Disconnect this Page"}
            </DangerButton>
          </div>
        </Modal>
      )}

      <Toasts toasts={toasts} />
    </div>
  );
}
