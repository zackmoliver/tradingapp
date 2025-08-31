import React from "react";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>}
    </div>
  );
}

export function CardBody({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-6 py-6 ${className}`}>{children}</div>;
}
