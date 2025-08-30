import React, { useState } from 'react';
import { getHistory, getOptionChain, HistoryPoint, OptionChain, isApiKeyError, getCurrentDate, getDateDaysAgo } from '../lib/data';

export const DataTest: React.FC = () => {
  const [symbol, setSymbol] = useState('AAPL');
  const [historyData, setHistoryData] = useState<HistoryPoint[]>([]);
  const [optionChain, setOptionChain] = useState<OptionChain | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFetchHistory = async () => {
    setIsLoadingHistory(true);
    setError(null);

    try {
      const endDate = getCurrentDate();
      const startDate = getDateDaysAgo(30); // Last 30 days
      
      const data = await getHistory(symbol, startDate, endDate, '1day');
      setHistoryData(data);
    } catch (err) {
      if (isApiKeyError(err)) {
        setError('No API key configured. Please go to Settings to configure your Polygon API key.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to fetch history data');
      }
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleFetchOptionChain = async () => {
    setIsLoadingOptions(true);
    setError(null);

    try {
      const asOf = getCurrentDate();
      const data = await getOptionChain(symbol, asOf);
      setOptionChain(data);
    } catch (err) {
      if (isApiKeyError(err)) {
        setError('No API key configured. Please go to Settings to configure your Polygon API key.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to fetch option chain');
      }
    } finally {
      setIsLoadingOptions(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Data Provider Test</h1>
          <p className="mt-2 text-gray-600">
            Test the Polygon.io data provider integration.
          </p>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow mb-8 p-6">
          <div className="flex items-center space-x-4">
            <div>
              <label htmlFor="symbol" className="block text-sm font-medium text-gray-700 mb-1">
                Symbol
              </label>
              <input
                type="text"
                id="symbol"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="e.g., AAPL"
              />
            </div>
            <div className="flex space-x-2">
              <button
                onClick={handleFetchHistory}
                disabled={isLoadingHistory || !symbol}
                className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  isLoadingHistory || !symbol
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
                }`}
              >
                {isLoadingHistory ? 'Loading...' : 'Fetch History'}
              </button>
              <button
                onClick={handleFetchOptionChain}
                disabled={isLoadingOptions || !symbol}
                className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  isLoadingOptions || !symbol
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500'
                }`}
              >
                {isLoadingOptions ? 'Loading...' : 'Fetch Options'}
              </button>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <p className="mt-1 text-sm text-red-700">{error}</p>
                {isApiKeyError(error) && (
                  <p className="mt-2 text-sm text-red-700">
                    <a href="/settings" className="underline hover:text-red-900">
                      Go to Settings to configure your API key →
                    </a>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* History Data */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                Price History ({historyData.length} days)
              </h2>
            </div>
            <div className="p-6">
              {historyData.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Open</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">High</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Low</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Close</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Volume</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {historyData.slice(0, 10).map((point, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-sm text-gray-900">{point.date}</td>
                          <td className="px-3 py-2 text-sm text-gray-900 text-right">{formatCurrency(point.open)}</td>
                          <td className="px-3 py-2 text-sm text-gray-900 text-right">{formatCurrency(point.high)}</td>
                          <td className="px-3 py-2 text-sm text-gray-900 text-right">{formatCurrency(point.low)}</td>
                          <td className="px-3 py-2 text-sm text-gray-900 text-right">{formatCurrency(point.close)}</td>
                          <td className="px-3 py-2 text-sm text-gray-900 text-right">{point.volume.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {historyData.length > 10 && (
                    <p className="text-sm text-gray-500 mt-2 text-center">
                      Showing first 10 of {historyData.length} records
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">No history data loaded</p>
                  <p className="text-sm text-gray-400 mt-1">Click "Fetch History" to load data</p>
                </div>
              )}
            </div>
          </div>

          {/* Option Chain */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                Option Chain
                {optionChain && (
                  <span className="text-sm font-normal text-gray-600 ml-2">
                    ({Object.keys(optionChain.contracts).length} contracts)
                  </span>
                )}
              </h2>
            </div>
            <div className="p-6">
              {optionChain ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-700">Symbol:</span>
                      <span className="ml-2">{optionChain.underlying_symbol}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">As of:</span>
                      <span className="ml-2">{optionChain.as_of_date}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Expiry Dates:</span>
                      <span className="ml-2">{optionChain.expiry_dates.length}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Strike Prices:</span>
                      <span className="ml-2">{optionChain.strikes.length}</span>
                    </div>
                  </div>

                  {optionChain.expiry_dates.length > 0 && (
                    <div>
                      <h4 className="font-medium text-gray-700 mb-2">Next Expiry Dates:</h4>
                      <div className="flex flex-wrap gap-2">
                        {optionChain.expiry_dates.slice(0, 5).map((date) => (
                          <span key={date} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {date}
                          </span>
                        ))}
                        {optionChain.expiry_dates.length > 5 && (
                          <span className="text-xs text-gray-500">
                            +{optionChain.expiry_dates.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {optionChain.strikes.length > 0 && (
                    <div>
                      <h4 className="font-medium text-gray-700 mb-2">Strike Range:</h4>
                      <p className="text-sm text-gray-600">
                        {formatCurrency(Math.min(...optionChain.strikes))} - {formatCurrency(Math.max(...optionChain.strikes))}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">No option chain loaded</p>
                  <p className="text-sm text-gray-400 mt-1">Click "Fetch Options" to load data</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
