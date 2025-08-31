// src/components/CalibrationChart.tsx
// Bin predictions vs realized win-rate

import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { CalibrationData } from '@/features/explain/importance';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Target, TrendingUp, AlertTriangle } from 'lucide-react';

interface CalibrationChartProps {
  calibrationData: CalibrationData;
  className?: string;
}

const formatPercentage = (value: number): string => {
  return `${(value * 100).toFixed(1)}%`;
};

const formatTooltipValue = (value: number, name: string): [string, string] => {
  return [formatPercentage(value), name];
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
        <p className="font-medium text-gray-900 mb-2">
          Predicted: {formatPercentage(label)}
        </p>
        <div className="space-y-1">
          <p className="text-sm text-blue-600">
            <span className="inline-block w-3 h-3 bg-blue-500 rounded-full mr-2"></span>
            Actual: {formatPercentage(data.actualWinRate)}
          </p>
          <p className="text-sm text-gray-600">
            Trades: {data.tradeCount}
          </p>
          <p className="text-sm text-gray-600">
            Confidence: {formatPercentage(data.confidence)}
          </p>
        </div>
      </div>
    );
  }
  return null;
};

const getCalibrationQuality = (reliability: number): { 
  label: string; 
  color: string; 
  icon: React.ReactNode;
  description: string;
} => {
  if (reliability < 0.05) {
    return {
      label: 'Excellent',
      color: 'text-green-600 bg-green-50',
      icon: <Target className="w-4 h-4" />,
      description: 'Model predictions are highly reliable'
    };
  } else if (reliability < 0.1) {
    return {
      label: 'Good',
      color: 'text-blue-600 bg-blue-50',
      icon: <TrendingUp className="w-4 h-4" />,
      description: 'Model predictions are generally reliable'
    };
  } else if (reliability < 0.2) {
    return {
      label: 'Fair',
      color: 'text-yellow-600 bg-yellow-50',
      icon: <AlertTriangle className="w-4 h-4" />,
      description: 'Model predictions have moderate reliability'
    };
  } else {
    return {
      label: 'Poor',
      color: 'text-red-600 bg-red-50',
      icon: <AlertTriangle className="w-4 h-4" />,
      description: 'Model predictions may be unreliable'
    };
  }
};

export const CalibrationChart: React.FC<CalibrationChartProps> = ({
  calibrationData,
  className = '',
}) => {
  if (!calibrationData || calibrationData.bins.length === 0) {
    return (
      <Card className={className}>
        <CardHeader 
          title="Model Calibration" 
          subtitle="Predicted vs. actual win rates"
        />
        <CardBody>
          <div className="text-center py-8">
            <Target className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No calibration data available</p>
            <p className="text-sm text-gray-500 mt-1">Run a backtest to see model reliability</p>
          </div>
        </CardBody>
      </Card>
    );
  }

  const { bins, overallAccuracy, brier, reliability, resolution } = calibrationData;
  const quality = getCalibrationQuality(reliability);

  // Prepare chart data
  const chartData = bins.map(bin => ({
    predictedWinRate: bin.predictedWinRate,
    actualWinRate: bin.actualWinRate,
    tradeCount: bin.tradeCount,
    confidence: bin.confidence,
    binLabel: `${formatPercentage(bin.binStart)}-${formatPercentage(bin.binEnd)}`
  }));

  return (
    <Card className={className}>
      <CardHeader 
        title="Model Calibration" 
        subtitle="Reliability curve showing predicted vs. actual win rates"
      />
      <CardBody>
        {/* Calibration metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">
              {formatPercentage(overallAccuracy)}
            </div>
            <div className="text-sm text-gray-600">Accuracy</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">
              {brier.toFixed(3)}
            </div>
            <div className="text-sm text-gray-600">Brier Score</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">
              {reliability.toFixed(3)}
            </div>
            <div className="text-sm text-gray-600">Reliability</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">
              {resolution.toFixed(3)}
            </div>
            <div className="text-sm text-gray-600">Resolution</div>
          </div>
        </div>

        {/* Quality indicator */}
        <div className={`p-3 rounded-lg mb-6 ${quality.color}`}>
          <div className="flex items-center gap-2 mb-1">
            {quality.icon}
            <span className="font-medium">Calibration Quality: {quality.label}</span>
          </div>
          <p className="text-sm">{quality.description}</p>
        </div>

        {/* Calibration chart */}
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="predictedWinRate"
                type="number"
                scale="linear"
                domain={[0, 1]}
                tickFormatter={formatPercentage}
                tick={{ fontSize: 12 }}
                axisLine={{ stroke: '#e0e0e0' }}
                tickLine={{ stroke: '#e0e0e0' }}
              />
              <YAxis
                type="number"
                scale="linear"
                domain={[0, 1]}
                tickFormatter={formatPercentage}
                tick={{ fontSize: 12 }}
                axisLine={{ stroke: '#e0e0e0' }}
                tickLine={{ stroke: '#e0e0e0' }}
              />
              
              {/* Perfect calibration line (diagonal) */}
              <ReferenceLine
                segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]}
                stroke="#94a3b8"
                strokeDasharray="5 5"
                strokeWidth={2}
              />
              
              {/* Actual calibration curve */}
              <Line
                type="monotone"
                dataKey="actualWinRate"
                stroke="#3b82f6"
                strokeWidth={3}
                dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: '#3b82f6', strokeWidth: 2 }}
              />
              
              <Tooltip content={<CustomTooltip />} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Chart explanation */}
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <h4 className="text-sm font-medium text-gray-700 mb-2">How to Read This Chart</h4>
          <div className="text-xs text-gray-600 space-y-1">
            <p>• <strong>Diagonal line:</strong> Perfect calibration (predicted = actual)</p>
            <p>• <strong>Blue line:</strong> Model's actual calibration curve</p>
            <p>• <strong>Closer to diagonal:</strong> Better calibrated predictions</p>
            <p>• <strong>Above diagonal:</strong> Model is underconfident</p>
            <p>• <strong>Below diagonal:</strong> Model is overconfident</p>
          </div>
        </div>

        {/* Bin details */}
        <div className="mt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Calibration Bins</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            {bins.map((bin, index) => (
              <div key={index} className="flex justify-between p-2 bg-gray-50 rounded">
                <span>{formatPercentage(bin.binStart)}-{formatPercentage(bin.binEnd)}</span>
                <span>
                  {formatPercentage(bin.actualWinRate)} ({bin.tradeCount} trades)
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardBody>
    </Card>
  );
};
