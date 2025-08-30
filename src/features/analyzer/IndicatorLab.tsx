import React, { useState, useEffect } from 'react';
import { IndicatorToggle } from './controls/IndicatorToggle';
import { ParamSlider } from './controls/ParamSlider';
import { AVAILABLE_INDICATORS, IndicatorParams, AnalyzerState } from './types';
import { ANALYZER_PROFILES, getProfileByName, getDefaultAnalyzerState } from './presets';

interface IndicatorLabProps {
  analyzerState: AnalyzerState;
  onStateChange: (state: AnalyzerState) => void;
  onApplyToStrategy: () => void;
  isApplying?: boolean;
}

export const IndicatorLab: React.FC<IndicatorLabProps> = ({
  analyzerState,
  onStateChange,
  onApplyToStrategy,
  isApplying = false
}) => {
  const [localState, setLocalState] = useState<AnalyzerState>(analyzerState);

  useEffect(() => {
    setLocalState(analyzerState);
  }, [analyzerState]);

  const handleIndicatorToggle = (indicatorId: string, enabled: boolean) => {
    const newEnabledIndicators = enabled
      ? [...localState.enabledIndicators, indicatorId]
      : localState.enabledIndicators.filter(id => id !== indicatorId);

    const newState = {
      ...localState,
      enabledIndicators: newEnabledIndicators,
      profile: null // Clear profile when manually changing indicators
    };

    setLocalState(newState);
    onStateChange(newState);
  };

  const handleParamChange = (key: keyof IndicatorParams, value: number | string) => {
    const newState = {
      ...localState,
      params: {
        ...localState.params,
        [key]: value
      },
      profile: null // Clear profile when manually changing params
    };

    setLocalState(newState);
    onStateChange(newState);
  };

  const handleProfileChange = (profileName: string) => {
    if (profileName === '') {
      // Custom profile
      const newState = {
        ...localState,
        profile: null
      };
      setLocalState(newState);
      onStateChange(newState);
      return;
    }

    const profile = getProfileByName(profileName);
    if (profile) {
      const newState = {
        enabledIndicators: [...profile.enabledIndicators],
        params: { ...profile.params },
        profile: profileName
      };
      setLocalState(newState);
      onStateChange(newState);
    }
  };

  const handleReset = () => {
    const defaultState = getDefaultAnalyzerState();
    setLocalState(defaultState);
    onStateChange(defaultState);
  };

  const getEnabledIndicators = () => {
    return AVAILABLE_INDICATORS.filter(indicator =>
      localState.enabledIndicators.includes(indicator.id)
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Indicator Lab</h2>
        <button
          onClick={handleReset}
          className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded hover:bg-gray-50"
        >
          Reset
        </button>
      </div>

      {/* Profile Selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Profile
        </label>
        <select
          value={localState.profile || ''}
          onChange={(e) => handleProfileChange(e.target.value)}
          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        >
          <option value="">Custom</option>
          {ANALYZER_PROFILES.map((profile) => (
            <option key={profile.name} value={profile.name}>
              {profile.name}
            </option>
          ))}
        </select>
        {localState.profile && (
          <p className="text-xs text-gray-500">
            {getProfileByName(localState.profile)?.description}
          </p>
        )}
      </div>

      {/* Indicator Toggles */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-900">Indicators</h3>
        <div className="space-y-2">
          {AVAILABLE_INDICATORS.map((indicator) => (
            <IndicatorToggle
              key={indicator.id}
              indicator={indicator}
              enabled={localState.enabledIndicators.includes(indicator.id)}
              onToggle={handleIndicatorToggle}
            />
          ))}
        </div>
      </div>

      {/* Parameter Controls */}
      {getEnabledIndicators().length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-900">Parameters</h3>
          {getEnabledIndicators().map((indicator) => (
            <div key={indicator.id} className="p-4 border border-gray-200 rounded-lg">
              <h4 className="text-sm font-medium text-gray-800 mb-3">
                {indicator.name}
              </h4>
              <div className="space-y-3">
                {indicator.params.map((param) => (
                  <ParamSlider
                    key={param.key}
                    paramKey={param.key}
                    label={param.label}
                    type={param.type}
                    value={localState.params[param.key] ?? param.default}
                    min={param.min}
                    max={param.max}
                    step={param.step}
                    options={param.options}
                    onChange={handleParamChange}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Apply Button */}
      <div className="pt-4 border-t border-gray-200">
        <button
          onClick={onApplyToStrategy}
          disabled={isApplying}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isApplying ? 'Applying...' : 'Apply to Strategy'}
        </button>
      </div>

      {/* Summary */}
      <div className="p-3 bg-gray-50 rounded-lg">
        <h4 className="text-sm font-medium text-gray-800 mb-2">Summary</h4>
        <div className="text-xs text-gray-600 space-y-1">
          <div>
            <span className="font-medium">Active Indicators:</span>{' '}
            {localState.enabledIndicators.length > 0
              ? localState.enabledIndicators.join(', ')
              : 'None'}
          </div>
          <div>
            <span className="font-medium">Profile:</span>{' '}
            {localState.profile || 'Custom'}
          </div>
        </div>
      </div>
    </div>
  );
};
