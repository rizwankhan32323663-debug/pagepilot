import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, PageHeader, PrimaryButton, Toasts, pushToast, type Toast } from "../components/ui";
import { useAuth } from "../lib/auth";

/**
 * Sign in / Sign up — Phase 2.
 * Fully functional when Supabase is configured; otherwise shows an honest
 * "not configured" notice instead of a fake login form that goes nowhere.
 */
export default function Login() {
  const { configured, user, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = React.useState<"signin" | "signup">("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  React.useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [loading, user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || password.length < 6) {
      pushToast(setToasts, "error", "Enter a valid email and a password of at least 6 characters.");
      return;
    }
    setBusy(true);
    const { error } = mode === "signin" ? await signIn(email.trim(), password) : await signUp(email.trim(), password);
    setBusy(false);
    if (error) {
      pushToast(setToasts, "error", error);
    } else if (mode === "signup") {
      pushToast(setToasts, "success", "Account created. Check your email to confirm, then sign in.");
      setMode("signin");
    } else {
      navigate("/", { replace: true });
    }
  };

  if (!configured) {
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader title="Sign in" description="PagePilot account access." />
        <Card>
          <h2 className="text-lg font-bold text-navy">Authentication not configured</h2>
          <p className="mt-2 text-sm text-gray-600">
            Supabase Auth is not connected yet (Phase 2). To enable sign-in: create a free Supabase project,
            apply the migrations in <code className="rounded bg-bg px-1">supabase/migrations/</code>, and set
            <code className="rounded bg-bg px-1">VITE_SUPABASE_URL</code> and
            <code className="rounded bg-bg px-1">VITE_SUPABASE_ANON_KEY</code>. See{" "}
            <code className="rounded bg-bg px-1">SUPABASE_SETUP.md</code>.
          </p>
          <div className="mt-4">
            <Link to="/" className="text-sm font-semibold text-primary hover:underline">
              ← Back to dashboard (demo mode)
            </Link>
          </div>
        </Card>
        <Toasts toasts={toasts} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        title={mode === "signin" ? "Sign in to PagePilot" : "Create your PagePilot account"}
        description="Your Pages, posts, and tokens are private to your account."
      />
      <Card>
        <form onSubmit={submit} className="space-y-4" autoComplete="on">
          <div>
            <label htmlFor="login-email" className="mb-1 block text-sm font-semibold text-navy">Email</label>
            <input
              id="login-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-navy focus:border-primary focus:outline-none"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="mb-1 block text-sm font-semibold text-navy">Password</label>
            <input
              id="login-password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-navy focus:border-primary focus:outline-none"
              placeholder="Minimum 6 characters"
            />
          </div>
          <PrimaryButton type="submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </PrimaryButton>
        </form>
        <p className="mt-4 text-sm text-gray-600">
          {mode === "signin" ? (
            <>
              No account yet?{" "}
              <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setMode("signup")}>
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setMode("signin")}>
                Sign in
              </button>
            </>
          )}
        </p>
      </Card>
      <Toasts toasts={toasts} />
    </div>
  );
}
