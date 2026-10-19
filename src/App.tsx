import React from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { DemoBadge } from "./components/ui";

const navItems = [
  { to: "/", label: "Dashboard", icon: "📊", end: true },
  { to: "/pages", label: "Connected Pages", icon: "📄" },
  { to: "/pages/add", label: "Add Page", icon: "➕" },
  { to: "/create", label: "Create Post", icon: "✏️" },
  { to: "/calendar", label: "Calendar", icon: "📅" },
  { to: "/queue", label: "Publishing Queue", icon: "📤" },
  { to: "/media", label: "Media Library", icon: "🖼️" },
  { to: "/logs", label: "Logs", icon: "📋" },
  { to: "/reports", label: "Reports", icon: "📈" },
  { to: "/settings", label: "Settings", icon: "⚙️" },
  { to: "/account", label: "Account & Security", icon: "🔐" },
  { to: "/diagnostics", label: "Diagnostics", icon: "🩺" },
];

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main navigation">
      <ul className="space-y-1 p-3">
        {navItems.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-white"
                    : "text-blue-100 hover:bg-navy-dark hover:text-white"
                }`
              }
            >
              <span aria-hidden="true" className="text-lg">{item.icon}</span>
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="mx-3 mb-3 rounded-lg border border-dashed border-blue-300/40 p-3">
        <p className="text-xs font-semibold text-blue-100">Phase 1 — UI only</p>
        <p className="mt-1 text-xs text-blue-200">Demo data everywhere. No real Facebook connection.</p>
        <div className="mt-2"><DemoBadge /></div>
      </div>
    </nav>
  );
}

export default function App() {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const location = useLocation();

  React.useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Lock body scroll when the mobile drawer is open
  React.useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-bg">
      {/* Skip link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:text-navy"
      >
        Skip to main content
      </a>

      {/* Top bar */}
      <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border bg-white px-4">
        <button
          type="button"
          className="rounded-lg p-2 text-navy hover:bg-bg lg:hidden"
          aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          <span aria-hidden="true" className="text-2xl">{mobileOpen ? "✕" : "☰"}</span>
        </button>
        <Link to="/" className="flex items-center gap-2" aria-label="PagePilot home">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-xl text-white" aria-hidden="true">
            ✈
          </span>
          <span className="text-lg font-bold text-navy">
            PagePilot
            <span className="ml-2 hidden text-xs font-normal text-gray-500 sm:inline">Facebook Multi-Page Automation</span>
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden rounded-full bg-bg px-3 py-1 text-xs font-semibold text-gray-600 sm:inline">
            Workspace: Personal
          </span>
          <Link to="/settings" className="btn rounded-lg px-3 py-2 text-sm font-semibold text-navy hover:bg-bg">
            Help
          </Link>
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full bg-navy text-sm font-bold text-white"
            title="Demo User (Phase 1 — no real account)"
            aria-label="Profile: Demo User"
          >
            D
          </span>
        </div>
      </header>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 overflow-y-auto bg-navy lg:block" aria-label="Sidebar">
          <SidebarNav />
        </aside>

        {/* Mobile drawer */}
        {mobileOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
            <div className="absolute inset-0 bg-navy/60" onClick={() => setMobileOpen(false)} aria-hidden="true" />
            <aside className="absolute left-0 top-0 h-full w-72 overflow-y-auto bg-navy shadow-xl">
              <div className="flex items-center justify-between p-3">
                <span className="px-2 text-lg font-bold text-white">PagePilot</span>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close navigation menu"
                  className="rounded-lg p-2 text-white hover:bg-navy-dark"
                >
                  <span aria-hidden="true" className="text-xl">✕</span>
                </button>
              </div>
              <SidebarNav onNavigate={() => setMobileOpen(false)} />
            </aside>
          </div>
        ) : null}

        {/* Main content */}
        <main id="main-content" className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
          <footer className="mx-auto mt-10 max-w-6xl border-t border-border pt-4 text-xs text-gray-500">
            <p>
              PagePilot — Phase 1 UI foundation. Demo data only: no Facebook connection, no publishing, no scheduler.{" "}
              <DemoBadge />
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
