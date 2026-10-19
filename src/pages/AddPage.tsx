import React from "react";
import { Card, DemoBadge, EmptyState, PageHeader, PrimaryButton, SecondaryButton, Toasts, pushToast, type Toast } from "../components/ui";
import { isSupabaseConfigured } from "../lib/supabase";
import { importPageToken, startOAuth } from "../lib/meta";
import { useAuth } from "../lib/auth";

/**
 * Add Facebook Page — Phase 3 wired.
 * - OAuth button: starts the real server-side flow when Supabase+Meta are
 *   configured; otherwise explains exactly what is missing (no fake login).
 * - Token import: POSTs once to the token-import Edge Function, which
 *   validates via debug_token and stores ONLY in Vault. The field is cleared
 *   immediately after submit and the token is never logged client-side.
 * This page never collects Facebook passwords.
 */
export default function AddPage() {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const [token, setToken] = React.useState("");
  const [tokenError, setTokenError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const { user } = useAuth();
  const configured = isSupabaseConfigured();

  const handleOAuthClick = async () => {
    if (!configured) {
      pushToast(setToasts, "info", "Facebook OAuth is not configured yet — needs Supabase (Phase 2 setup) and a Meta app (Phase 3). See Diagnostics.");
      return;
    }
    if (!user) {
      pushToast(setToasts, "error", "Sign in to PagePilot first, then connect Facebook.");
      return;
    }
    setBusy(true);
    try {
      await startOAuth(); // redirects the browser to facebook.com
    } catch (e) {
      setBusy(false);
      pushToast(setToasts, "error", e instanceof Error ? e.message : "Could not start Facebook OAuth.");
    }
  };

  const handleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTokenError("");
    const value = token.trim();
    if (!value) {
      setTokenError("Paste a Page access token to continue.");
      return;
    }
    if (!configured) {
      setToken(""); // clear the secret immediately
      pushToast(setToasts, "error", "Token import backend is not configured yet (Phase 3). The token was cleared and was never sent, stored, or logged anywhere.");
      return;
    }
    if (!user) {
      setToken("");
      pushToast(setToasts, "error", "Sign in to PagePilot first. The token was cleared and not sent anywhere.");
      return;
    }
    setBusy(true);
    try {
      const result = await importPageToken(value);
      pushToast(setToasts, "success", `Page "${result.page_name}" validated and connected. Token stored server-side only.`);
    } catch (e) {
      pushToast(setToasts, "error", e instanceof Error ? e.message : "Token import failed.");
    } finally {
      setToken(""); // the secret never stays in the page
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Add Facebook Page"
        description="Connect another Page you are authorized to manage — via official Meta OAuth or a manually imported Page access token."
        badge
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Option 1: OAuth */}
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-navy">Connect with Facebook</h2>
            <DemoBadge />
          </div>
          <p className="mt-2 text-sm text-gray-600">
            Recommended. Uses Meta&apos;s official OAuth flow — you log in on facebook.com, pick the Pages you manage,
            and PagePilot stores a Page access token server-side. PagePilot never sees your Facebook password.
          </p>
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-gray-600">
            <li>Click “Continue with Facebook”.</li>
            <li>Approve the requested permissions on facebook.com.</li>
            <li>Choose which of your Pages to connect.</li>
            <li>Each Page is validated and health-checked independently.</li>
          </ol>
          <div className="mt-5">
            <PrimaryButton
              onClick={handleOAuthClick}
              disabled={busy}
              title={configured ? "Start Facebook OAuth (server-side flow)" : "Needs Supabase + Meta app — see Diagnostics"}
            >
              {busy ? "Please wait…" : "Continue with Facebook"}
            </PrimaryButton>
            <p className="mt-2 text-xs font-semibold text-warning">
              {configured
                ? "Redirects to facebook.com. PagePilot never sees your Facebook password."
                : "Not configured — needs Supabase (Phase 2) and a Meta app (Phase 3). Clicking explains what is missing."}
            </p>
          </div>
        </Card>

        {/* Option 2: manual token import */}
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-navy">Import Page access token</h2>
            <DemoBadge />
          </div>
          <p className="mt-2 text-sm text-gray-600">
            Optional. Paste a Page access token you obtained legitimately through Meta (e.g. Graph API Explorer or your
            Meta app). The backend will validate it server-side before registering the Page.
          </p>
          <form onSubmit={handleTokenSubmit} className="mt-4 space-y-3" autoComplete="off">
            <div>
              <label htmlFor="pp-token" className="mb-1 block text-sm font-semibold text-navy">
                Page access token
              </label>
              <input
                id="pp-token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste token here — masked, never displayed again"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 font-mono text-sm text-navy placeholder:text-gray-400 focus:border-primary focus:outline-none"
                aria-describedby={tokenError ? "pp-token-error" : "pp-token-help"}
              />
              <p id="pp-token-help" className="mt-1 text-xs text-gray-500">
                Masked input. Tokens are never placed in URLs, logs, or browser storage.
              </p>
              {tokenError ? (
                <p id="pp-token-error" role="alert" className="mt-1 text-xs font-semibold text-error">
                  {tokenError}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <PrimaryButton type="submit" disabled={busy}>{busy ? "Validating…" : "Validate & Add Page"}</PrimaryButton>
              <SecondaryButton onClick={() => { setToken(""); setTokenError(""); }}>
                Clear
              </SecondaryButton>
            </div>
            <p className="text-xs font-semibold text-warning">
              {configured
                ? "Validated server-side via Meta debug_token; stored in Supabase Vault only. Never shown again."
                : "Backend pending — Phase 3. Submitting clears the field; nothing is sent or stored yet."}
            </p>
          </form>
        </Card>
      </div>

      {/* Security notes */}
      <Card className="mt-6">
        <h2 className="text-lg font-bold text-navy">Security rules for Page connections</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-gray-600">
          <li>PagePilot will <strong>never</strong> ask for your Facebook password.</li>
          <li>Tokens are validated and stored <strong>server-side only</strong> (never in the browser or in URLs).</li>
          <li>Each Page connection is validated independently — a revoked token on one Page never affects others.</li>
          <li>Disconnecting a Page removes only that Page&apos;s connection, never other Pages or posts.</li>
          <li>Tokens expire — PagePilot will monitor token health and remind you to reconnect (Phase 3+).</li>
        </ul>
      </Card>

      <div className="mt-6">
        <EmptyState
          icon="🔗"
          title="No Pages connected yet"
          body="Once OAuth or token import is implemented (Phase 3), your connected Pages will appear on the Connected Pages screen with per-Page health status."
          action={
            <SecondaryButton onClick={() => window.history.back()}>Back to Connected Pages</SecondaryButton>
          }
        />
      </div>

      <Toasts toasts={toasts} />
    </div>
  );
}
