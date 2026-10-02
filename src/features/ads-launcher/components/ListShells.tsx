import { Link } from "react-router-dom";

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-y divide-slate-100" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="py-3.5 animate-pulse flex items-center justify-between gap-3">
          <div className="flex-1 space-y-2 min-w-0">
            <div className="h-3.5 bg-slate-200 rounded w-1/3" />
            <div className="h-2.5 bg-slate-100 rounded w-1/2" />
          </div>
          <div className="h-5 w-16 bg-slate-100 rounded-full shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  cta,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  cta?: { label: string; to?: string; onClick?: () => void };
}) {
  return (
    <div className="text-center py-10 px-4">
      {icon && (
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand-50 text-brand-500 mb-3">
          {icon}
        </div>
      )}
      <div className="text-base font-semibold text-slate-900">{title}</div>
      {description && (
        <div className="text-sm text-slate-500 mt-1 max-w-md mx-auto">{description}</div>
      )}
      {cta && (
        <div className="mt-4">
          {cta.to ? (
            <Link to={cta.to} className="btn-primary text-sm">
              {cta.label}
            </Link>
          ) : (
            <button className="btn-primary text-sm" onClick={cta.onClick}>
              {cta.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function Plus() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
