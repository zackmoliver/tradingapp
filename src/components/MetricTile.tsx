import React from "react";
import Tooltip from "@/components/ui/Tooltip";

export function MetricTile({ label, value, tooltip }:{
  label: string; value: string | number; tooltip?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/50">
      <div className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 mb-1">
        <span>{label}</span>
        {tooltip && <Tooltip label={label}>{tooltip}</Tooltip>}
      </div>
      <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{value}</div>
    </div>
  );
}
