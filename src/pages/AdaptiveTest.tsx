import React from 'react';
import AdaptivePanel from '../features/intelligence/AdaptivePanel';

const AdaptiveTest: React.FC = () => {
  // Sample backtest parameters for testing
  const sampleParams = {
    ticker: 'AAPL',
    start_date: '01/01/2023',
    end_date: '12/31/2023',
    strategy: 'PMCC' as const,
    initial_capital: 100000,
    seed: 42
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Adaptive Intelligence Test</h1>
        <p className="text-gray-600 mt-2">
          Test the adaptive intelligence features with comprehensive diagnostics
        </p>
      </div>

      {/* Standalone Panel */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Standalone Test</h2>
        <AdaptivePanel />
      </div>

      {/* Panel with Sample Parameters */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Test with Sample Parameters</h2>
        <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <h3 className="font-medium text-gray-900 mb-2">Sample Parameters:</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="font-medium text-gray-700">Ticker:</span> {sampleParams.ticker}
            </div>
            <div>
              <span className="font-medium text-gray-700">Strategy:</span> {sampleParams.strategy}
            </div>
            <div>
              <span className="font-medium text-gray-700">Capital:</span> ${sampleParams.initial_capital.toLocaleString()}
            </div>
            <div>
              <span className="font-medium text-gray-700">Start:</span> {sampleParams.start_date}
            </div>
            <div>
              <span className="font-medium text-gray-700">End:</span> {sampleParams.end_date}
            </div>
            <div>
              <span className="font-medium text-gray-700">Seed:</span> {sampleParams.seed}
            </div>
          </div>
        </div>
        <AdaptivePanel current={sampleParams} />
      </div>

      {/* Usage Instructions */}
      <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="text-lg font-medium text-blue-900 mb-3">Usage Instructions</h3>
        <div className="text-sm text-blue-800 space-y-2">
          <div>
            <strong>1. Environment Check:</strong> The panel automatically detects if you're running in a Tauri environment
          </div>
          <div>
            <strong>2. Ping Test:</strong> Click "Ping" to test basic Tauri connectivity with invoke('ping')
          </div>
          <div>
            <strong>3. Adaptive Test:</strong> Use the mode buttons (Test/Suggest/Analyze) then click "Run" to call invoke('adaptive_run', {`{ mode: 'test' }`})
          </div>
          <div>
            <strong>4. Error Diagnosis:</strong> Any errors will show exact messages and diagnostic information
          </div>
          <div>
            <strong>5. Response Display:</strong> Successful responses show both raw JSON and friendly formatted data
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdaptiveTest;
