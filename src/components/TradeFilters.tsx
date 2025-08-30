// src/components/TradeFilters.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { STRATEGY_OPTIONS, type StrategyType } from '@/types/backtest';

export type TradeFiltersProps = {
  initialStrategy?: StrategyType;
  onChange?: (filters: { strategy?: StrategyType }) => void;
};

export function TradeFiltersComponent({ initialStrategy, onChange }: TradeFiltersProps) {
  const [strategy, setStrategy] = useState<StrategyType | undefined>(initialStrategy);
  const options = useMemo(() => STRATEGY_OPTIONS, []);

  useEffect(() => {
    onChange?.({ strategy });
  }, [strategy, onChange]);

  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-4">
      <div className="mb-3">
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Strategy
        </label>
        <select
          className="block w-full border border-neutral-300 rounded-md p-2 text-sm"
          value={strategy ?? ''}
          onChange={(e) => setStrategy((e.target.value || undefined) as StrategyType | undefined)}
        >
          <option value="">Any</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// keep default export too, in case the page imports default
export default TradeFiltersComponent;
