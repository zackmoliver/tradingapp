import React from 'react';
import { IndicatorConfig } from '../types';

interface IndicatorToggleProps {
  indicator: IndicatorConfig;
  enabled: boolean;
  onToggle: (indicatorId: string, enabled: boolean) => void;
}

export const IndicatorToggle: React.FC<IndicatorToggleProps> = ({
  indicator,
  enabled,
  onToggle
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onToggle(indicator.id, e.target.checked);
  };

  return (
    <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
      <div className="flex items-center space-x-3">
        <input
          type="checkbox"
          id={`indicator-${indicator.id}`}
          checked={enabled}
          onChange={handleChange}
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
        />
        <div>
          <label
            htmlFor={`indicator-${indicator.id}`}
            className="text-sm font-medium text-gray-900 cursor-pointer"
          >
            {indicator.name}
          </label>
          <p className="text-xs text-gray-500">{indicator.description}</p>
        </div>
      </div>
      <div className="flex items-center">
        {enabled && (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Active
          </span>
        )}
      </div>
    </div>
  );
};
