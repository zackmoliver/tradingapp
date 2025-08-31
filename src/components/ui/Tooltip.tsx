import React, { useState, ReactNode } from "react";

interface TooltipProps {
  content?: ReactNode;
  label?: string;
  className?: string;
  children?: ReactNode;
}

export default function Tooltip({ content, label, className = '', children }: TooltipProps) {
  const [open, setOpen] = useState(false);

  // Support both content and label props for backward compatibility
  const tooltipContent = content || children;
  const displayText = label || (typeof content === 'string' ? content : 'Info');

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="ml-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        aria-label={`Info: ${displayText}`}
        title={displayText}
      >
        ⓘ
      </button>
      {open && (
        <span className="absolute z-20 top-full mt-2 w-60 text-sm p-2 rounded-md bg-white dark:bg-slate-800
                         border border-slate-200 dark:border-slate-700 shadow">
          {tooltipContent}
        </span>
      )}
    </span>
  );
}
