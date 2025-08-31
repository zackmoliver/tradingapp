import React from 'react';
import { TradeResult } from '../types/backtest';

interface TradeTableProps {
  trades: TradeResult[];
  isLoading: boolean;
}

export const TradeTable: React.FC<TradeTableProps> = ({ trades, isLoading }) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    try {
      // Handle MM/DD/YYYY format
      const [month, day, year] = dateString.split('/');
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow">
        <div className="card-padding border-b border-gray-200 card-header-height flex items-center">
          <h2 className="subsection-title">Trade Results</h2>
        </div>
        <div className="card-padding text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 caption-text">Loading trades...</p>
        </div>
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow">
        <div className="card-padding border-b border-gray-200 card-header-height flex items-center">
          <h2 className="subsection-title">Trade Results</h2>
        </div>
        <div className="card-padding text-center">
          <div className="mx-auto h-12 w-12 text-gray-400">
            <svg
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <h3 className="mt-4 text-sm font-medium text-gray-900">No trades found</h3>
          <p className="mt-2 caption-text">
            Try adjusting your filters to find matching trades.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="card-padding border-b border-gray-200 card-header-height flex items-center">
        <h2 className="subsection-title">
          Trade Results ({trades.length} trades)
        </h2>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Date
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Symbol
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Strategy
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Entry Price
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Exit Price
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Profit/Loss
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Win/Loss
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {trades.map((trade, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatDate(trade.date)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {trade.symbol}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {trade.strategy}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                  {formatCurrency(trade.entry)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                  {formatCurrency(trade.exit)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                  <span
                    className={`font-medium ${
                      trade.pl >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {trade.pl >= 0 ? '+' : ''}{formatCurrency(trade.pl)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      trade.win
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {trade.win ? 'Win' : 'Loss'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary Statistics */}
      {trades.length > 0 && (
        <div className="card-padding bg-gray-50 border-t border-gray-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
            <div>
              <span className="caption-text">Total Trades:</span>
              <span className="ml-2 font-medium text-gray-900">{trades.length}</span>
            </div>
            <div>
              <span className="caption-text">Win Rate:</span>
              <span className="ml-2 font-medium text-gray-900">
                {((trades.filter(t => t.win).length / trades.length) * 100).toFixed(1)}%
              </span>
            </div>
            <div>
              <span className="caption-text">Total P&L:</span>
              <span
                className={`ml-2 font-medium ${
                  trades.reduce((sum, t) => sum + t.pl, 0) >= 0
                    ? 'text-green-600'
                    : 'text-red-600'
                }`}
              >
                {formatCurrency(trades.reduce((sum, t) => sum + t.pl, 0))}
              </span>
            </div>
            <div>
              <span className="caption-text">Avg P&L:</span>
              <span
                className={`ml-2 font-medium ${
                  trades.reduce((sum, t) => sum + t.pl, 0) / trades.length >= 0
                    ? 'text-green-600'
                    : 'text-red-600'
                }`}
              >
                {formatCurrency(trades.reduce((sum, t) => sum + t.pl, 0) / trades.length)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
