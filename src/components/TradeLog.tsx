// src/components/TradeLog.tsx
// Enhanced trade log with tags, CSV export, P&L histogram

import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Download, Filter, TrendingUp, TrendingDown, Tag, DollarSign, BarChart3 } from 'lucide-react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { toMoney, toPct } from '@/lib/date';
import { Trade } from '@/types/backtest';
import { SyntheticTrade, exportTradesToCsv } from '@/lib/trades';

// Enhanced trade interface for Trade Log 2.0
interface EnhancedTrade extends Trade {
  entry_rule?: string;
  exit_rule?: string;
  regime?: 'bull' | 'bear' | 'sideways';
  duration_days?: number;
  max_profit?: number;
  max_loss?: number;
  tags?: string[];
}

interface TradeLogProps {
  trades: Trade[] | SyntheticTrade[];
  className?: string;
  title?: string;
  subtitle?: string;
  showHistogram?: boolean;
  onExportCsv?: () => void;
}

type FilterType = 'all' | 'buy' | 'sell' | 'profitable' | 'losing';

// P&L Histogram Component
const PnLHistogram: React.FC<{ trades: (Trade | SyntheticTrade)[] }> = ({ trades }) => {
  const histogramData = useMemo(() => {
    if (trades.length === 0) return [];

    // Calculate P&L distribution
    const pnlValues = trades.map(t => t.pnl).filter(pnl => pnl !== 0);
    if (pnlValues.length === 0) return [];

    const minPnL = Math.min(...pnlValues);
    const maxPnL = Math.max(...pnlValues);
    const range = maxPnL - minPnL;
    const binCount = Math.min(20, Math.max(5, Math.floor(pnlValues.length / 5)));
    const binSize = range / binCount;

    // Create bins
    const bins: { range: string; count: number; pnl: number; percentage: number }[] = [];
    for (let i = 0; i < binCount; i++) {
      const binStart = minPnL + (i * binSize);
      const binEnd = minPnL + ((i + 1) * binSize);
      const binTrades = pnlValues.filter(pnl => pnl >= binStart && (i === binCount - 1 ? pnl <= binEnd : pnl < binEnd));

      bins.push({
        range: `${toMoney(binStart)} to ${toMoney(binEnd)}`,
        count: binTrades.length,
        pnl: (binStart + binEnd) / 2,
        percentage: (binTrades.length / pnlValues.length) * 100
      });
    }

    return bins;
  }, [trades]);

  if (histogramData.length === 0) {
    return (
      <div className="text-center py-8">
        <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">No P&L data for histogram</p>
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={histogramData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="range"
            tick={{ fontSize: 10 }}
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            axisLine={{ stroke: '#e0e0e0' }}
            tickLine={{ stroke: '#e0e0e0' }}
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              name === 'count' ? `${value} trades` : `${value.toFixed(1)}%`,
              name === 'count' ? 'Trade Count' : 'Percentage'
            ]}
            labelFormatter={(label: string) => `P&L Range: ${label}`}
          />
          <Bar
            dataKey="count"
            fill="#3b82f6"
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// Enhanced tag display component
const TradeTagsDisplay: React.FC<{ trade: EnhancedTrade }> = ({ trade }) => {
  const tags = [];

  if (trade.entry_rule) tags.push({ label: `Entry: ${trade.entry_rule}`, color: 'bg-blue-100 text-blue-800' });
  if (trade.exit_rule) tags.push({ label: `Exit: ${trade.exit_rule}`, color: 'bg-green-100 text-green-800' });
  if (trade.regime) tags.push({ label: `Regime: ${trade.regime}`, color: 'bg-purple-100 text-purple-800' });
  if (trade.tags) {
    trade.tags.forEach(tag => tags.push({ label: tag, color: 'bg-gray-100 text-gray-800' }));
  }

  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {tags.map((tag, index) => (
        <span key={index} className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${tag.color}`}>
          <Tag className="w-3 h-3" />
          {tag.label}
        </span>
      ))}
    </div>
  );
};

export default function TradeLog({
  trades,
  className = '',
  title = 'Trade Log',
  subtitle,
  showHistogram = true,
  onExportCsv
}: TradeLogProps) {
  const [sortField, setSortField] = useState<keyof Trade>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'histogram'>('table');

  const handleSort = (field: keyof Trade) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Filter and sort trades
  const filteredAndSortedTrades = useMemo(() => {
    let filtered = [...trades];

    // Apply filter
    switch (filter) {
      case 'buy':
        filtered = filtered.filter(t => t.side === 'BUY');
        break;
      case 'sell':
        filtered = filtered.filter(t => t.side === 'SELL' || t.side === 'COVER');
        break;
      case 'profitable':
        filtered = filtered.filter(t => t.pnl > 0);
        break;
      case 'losing':
        filtered = filtered.filter(t => t.pnl < 0);
        break;
      default:
        // 'all' - no filtering
        break;
    }

    // Apply search
    if (searchTerm) {
      filtered = filtered.filter(t =>
        t.date.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.side.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.note && t.note.toLowerCase().includes(searchTerm.toLowerCase())) ||
        ('reason' in t && t.reason && t.reason.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Sort
    filtered.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];

      let comparison = 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.localeCompare(bVal);
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [trades, filter, searchTerm, sortField, sortDirection]);

  const exportToCsv = () => {
    // Check if we have SyntheticTrade objects
    const isSyntheticTrades = filteredAndSortedTrades.length > 0 && 'reason' in filteredAndSortedTrades[0];

    if (isSyntheticTrades) {
      exportTradesToCsv(filteredAndSortedTrades as SyntheticTrade[], `trade_log_${new Date().toISOString().split('T')[0]}.csv`);
    } else {
      // Fallback for regular trades
      const headers = ['Date', 'Side', 'Qty', 'Price', 'P&L', 'Cumulative P&L', 'Note'];
      const csvContent = [
        headers.join(','),
        ...filteredAndSortedTrades.map(trade => [
          trade.date,
          trade.side,
          trade.qty.toString(),
          trade.price.toFixed(2),
          trade.pnl.toFixed(2),
          trade.cum_pnl.toFixed(2),
          `"${trade.note || ''}"`
        ].join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `trade_log_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  const getSideColor = (side: string) => {
    switch (side) {
      case 'BUY': return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20';
      case 'SELL': return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20';
      case 'COVER': return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20';
      case 'ASSIGN': return 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20';
      default: return 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800';
    }
  };

  const getPnlColor = (pnl: number) => {
    if (pnl > 0) return 'text-green-600 dark:text-green-400';
    if (pnl < 0) return 'text-red-600 dark:text-red-400';
    return 'text-slate-600 dark:text-slate-400';
  };

  const SortIcon = ({ field }: { field: keyof Trade }) => {
    if (sortField !== field) {
      return <span className="text-slate-400">↕</span>;
    }
    return <span className="text-blue-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

  if (trades.length === 0) {
    return (
      <div className={className}>
        <Card>
        <CardHeader title={title} subtitle="No trades executed" />
        <CardBody>
          <div className="text-center py-8 text-slate-500 dark:text-slate-400">
            No trades to display. Run a backtest to see trade history.
          </div>
        </CardBody>
        </Card>
      </div>
    );
  }

  // Calculate summary stats from filtered trades
  const exitTrades = filteredAndSortedTrades.filter(t => t.side === 'SELL' || t.side === 'COVER');
  const totalTrades = exitTrades.length;
  const winningTrades = exitTrades.filter(t => t.pnl > 0).length;
  const totalPnL = filteredAndSortedTrades.reduce((sum, t) => sum + t.pnl, 0);
  const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;
  const avgHoldDays = exitTrades.length > 0
    ? exitTrades.reduce((sum, t) => sum + (('hold_days' in t && t.hold_days) || 0), 0) / exitTrades.length
    : 0;

  const dynamicSubtitle = subtitle ||
    `${filteredAndSortedTrades.length}/${trades.length} trades • ${totalTrades} completed • ${toPct(winRate)} win rate`;

  return (
    <div className={className}>
      <Card>
      <CardHeader
        title={title}
        subtitle={dynamicSubtitle}
      />
      <CardBody>
        {/* Enhanced Filter Controls */}
        <div className="flex flex-wrap gap-4 mb-6 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div className="flex-1 min-w-48">
            <input
              type="text"
              placeholder="Search trades..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm"
            />
          </div>
          <div className="flex gap-2">
            {(['all', 'buy', 'sell', 'profitable', 'losing'] as FilterType[]).map((filterType) => (
              <button
                key={filterType}
                onClick={() => setFilter(filterType)}
                className={`px-3 py-2 text-sm rounded-lg font-medium ${
                  filter === filterType
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600'
                }`}
              >
                {filterType.charAt(0).toUpperCase() + filterType.slice(1)}
              </button>
            ))}
          </div>

          {/* View Toggle and Export */}
          <div className="flex gap-2">
            <div className="flex bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg">
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-2 text-sm font-medium rounded-l-lg ${
                  viewMode === 'table'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'
                }`}
              >
                Table
              </button>
              {showHistogram && (
                <button
                  onClick={() => setViewMode('histogram')}
                  className={`px-3 py-2 text-sm font-medium rounded-r-lg ${
                    viewMode === 'histogram'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'
                  }`}
                >
                  <BarChart3 className="w-4 h-4" />
                </button>
              )}
            </div>

            <button
              onClick={onExportCsv || exportToCsv}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-5 gap-4 mb-6 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div className="text-center">
            <div className="text-sm text-slate-500 dark:text-slate-400">Total Trades</div>
            <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{totalTrades}</div>
          </div>
          <div className="text-center">
            <div className="text-sm text-slate-500 dark:text-slate-400">Win Rate</div>
            <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{toPct(winRate)}</div>
          </div>
          <div className="text-center">
            <div className="text-sm text-slate-500 dark:text-slate-400">Total P&L</div>
            <div className={`text-lg font-semibold ${getPnlColor(totalPnL)}`}>{toMoney(totalPnL)}</div>
          </div>
          <div className="text-center">
            <div className="text-sm text-slate-500 dark:text-slate-400">Avg Hold</div>
            <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{avgHoldDays.toFixed(1)}d</div>
          </div>
          <div className="text-center">
            <div className="text-sm text-slate-500 dark:text-slate-400">View</div>
            <div className="text-lg font-semibold text-slate-900 dark:text-slate-100 capitalize">{viewMode}</div>
          </div>
        </div>

        {/* View Mode Content */}
        {viewMode === 'histogram' ? (
          <div className="mb-6">
            <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-4">P&L Distribution</h3>
            <PnLHistogram trades={filteredAndSortedTrades} />
          </div>
        ) : (
          /* Trade Table */
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th 
                  className="text-left py-3 px-2 font-medium text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                  onClick={() => handleSort('date')}
                >
                  Date <SortIcon field="date" />
                </th>
                <th 
                  className="text-left py-3 px-2 font-medium text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                  onClick={() => handleSort('side')}
                >
                  Side <SortIcon field="side" />
                </th>
                <th 
                  className="text-right py-3 px-2 font-medium text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                  onClick={() => handleSort('qty')}
                >
                  Qty <SortIcon field="qty" />
                </th>
                <th 
                  className="text-right py-3 px-2 font-medium text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                  onClick={() => handleSort('price')}
                >
                  Price <SortIcon field="price" />
                </th>
                <th 
                  className="text-right py-3 px-2 font-medium text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                  onClick={() => handleSort('pnl')}
                >
                  P&L <SortIcon field="pnl" />
                </th>
                <th 
                  className="text-right py-3 px-2 font-medium text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                  onClick={() => handleSort('cum_pnl')}
                >
                  Cum P&L <SortIcon field="cum_pnl" />
                </th>
                <th className="text-left py-3 px-2 font-medium text-slate-700 dark:text-slate-300">
                  Note/Reason
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedTrades.map((trade, index) => (
                <tr 
                  key={index}
                  className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <td className="py-2 px-2 text-slate-900 dark:text-slate-100">
                    {trade.date}
                  </td>
                  <td className="py-2 px-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getSideColor(trade.side)}`}>
                      {trade.side}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right text-slate-900 dark:text-slate-100">
                    {trade.qty.toLocaleString()}
                  </td>
                  <td className="py-2 px-2 text-right text-slate-900 dark:text-slate-100">
                    {toMoney(trade.price)}
                  </td>
                  <td className={`py-2 px-2 text-right font-medium ${getPnlColor(trade.pnl)}`}>
                    {toMoney(trade.pnl)}
                  </td>
                  <td className={`py-2 px-2 text-right font-medium ${getPnlColor(trade.cum_pnl)}`}>
                    {toMoney(trade.cum_pnl)}
                  </td>
                  <td className="py-2 px-2 text-slate-600 dark:text-slate-400 text-xs">
                    {('reason' in trade && trade.reason) || trade.note || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </CardBody>
      </Card>
    </div>
  );
}
