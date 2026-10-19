import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

/**
 * Protects app routes. Honest dual behavior:
 * - Supabase NOT configured (Phase 1/early dev): render the page in demo mode.
 * - Supabase configured: require a signed-in user, else redirect to /login.
 */
export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { configured, user, loading } = useAuth();

  if (!configured) return <>{children}</>;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" role="status" aria-label="Loading">
        <p className="text-sm text-gray-600">Checking sign-in…</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
