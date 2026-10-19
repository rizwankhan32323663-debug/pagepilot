import React from "react";

/** Visible "Demo" label — required on every piece of demo data. */
export function DemoBadge() {
  return <span className="demo-badge">Demo</span>;
}

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border border-border bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export type StatusKind = "scheduled" | "pending" | "processing" | "published" | "success" | "failed" | "cancelled" | "draft";

const statusStyles: Record<StatusKind, string> = {
  scheduled: "bg-blue-50 text-primary border-blue-200",
  pending: "bg-amber-50 text-warning border-amber-200",
  processing: "bg-blue-50 text-primary border-blue-200",
  published: "bg-green-50 text-success border-green-200",
  success: "bg-green-50 text-success border-green-200",
  failed: "bg-red-50 text-error border-red-200",
  cancelled: "bg-gray-100 text-gray-600 border-gray-300",
  draft: "bg-gray-100 text-gray-600 border-gray-300",
};

export function StatusChip({ status }: { status: StatusKind }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusStyles[status]}`}>
      {label}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  badge,
  actions,
}: {
  title: string;
  description?: string;
  badge?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-navy flex items-center gap-2">
          {title}
          {badge ? <DemoBadge /> : null}
        </h1>
        {description ? <p className="mt-1 text-sm text-gray-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: string;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-white px-6 py-12 text-center">
      <div className="text-4xl" aria-hidden="true">{icon}</div>
      <h3 className="mt-3 text-lg font-semibold text-navy">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-gray-600">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
  demo = true,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "neutral" | "success" | "error";
  demo?: boolean;
}) {
  const toneText = tone === "success" ? "text-success" : tone === "error" ? "text-error" : "text-navy";
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-600">{label}</p>
        {demo ? <DemoBadge /> : <span className="text-xs font-semibold text-success">● Live</span>}
      </div>
      <p className={`mt-2 text-3xl font-bold ${toneText}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-gray-500">{sub}</p> : null}
    </Card>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  title,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="btn inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  disabled,
  title,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="btn inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-semibold text-navy hover:bg-bg disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function DangerButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="btn inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-error hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/** Simple accessible modal with focus on open + Escape to close. */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-navy">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg border border-border px-3 py-1 text-sm font-semibold text-navy hover:bg-bg"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Lightweight toast notifications. */
export type ToastKind = "info" | "success" | "error";
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`max-w-sm rounded-lg border px-4 py-3 text-sm font-medium shadow-lg ${
            t.kind === "success"
              ? "border-green-200 bg-green-50 text-success"
              : t.kind === "error"
                ? "border-red-200 bg-red-50 text-error"
                : "border-blue-200 bg-blue-50 text-primary"
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

let toastId = 0;
export function pushToast(setter: React.Dispatch<React.SetStateAction<Toast[]>>, kind: ToastKind, message: string) {
  const id = ++toastId;
  setter((prev) => [...prev, { id, kind, message }]);
  window.setTimeout(() => {
    setter((prev) => prev.filter((t) => t.id !== id));
  }, 4000);
}
