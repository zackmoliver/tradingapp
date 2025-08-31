import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { parseMMDDYYYY, toMMDDYYYY, chartTickFormatter, toPct, toMoney, sanitizeEquityCurveData } from '../lib/date';

// Sample data with MM/DD/YYYY dates
const sampleData = [
  { date: '01/01/2023', value: 100000 },
  { date: '01/15/2023', value: 102500 },
  { date: '02/01/2023', value: 98750 },
  { date: '02/15/2023', value: 105000 },
  { date: '03/01/2023', value: 107500 },
  { date: '03/15/2023', value: 103250 },
  { date: '04/01/2023', value: 110000 },
  { date: '04/15/2023', value: 108750 },
  { date: '05/01/2023', value: 112500 },
  { date: '05/15/2023', value: 115000 },
];

export const DateTest: React.FC = () => {
  const [inputDate, setInputDate] = useState('01/01/2023');
  const [parsedDate, setParsedDate] = useState<Date | null>(null);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputDate(value);
    const parsed = parseMMDDYYYY(value);
    setParsedDate(parsed);
  };

  // Sanitize the sample data for the chart
  const chartData = sanitizeEquityCurveData(sampleData);

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold">Date Handling Test</h2>
      
      {/* Date Input Test */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Date Parsing Test</h3>
        <div className="space-y-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Enter date (MM/DD/YYYY):
            </label>
            <input
              type="text"
              value={inputDate}
              onChange={handleDateChange}
              placeholder="MM/DD/YYYY"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="text-sm">
            <strong>Parsed Date:</strong> {parsedDate ? toMMDDYYYY(parsedDate) : 'Invalid'}
          </div>
          <div className="text-sm">
            <strong>Is Valid:</strong> {parsedDate ? 'Yes' : 'No'}
          </div>
        </div>
      </div>

      {/* Formatting Test */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Formatting Test</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <strong>Percentage:</strong> {toPct(0.1234)}
          </div>
          <div>
            <strong>Currency:</strong> {toMoney(123456.789)}
          </div>
          <div>
            <strong>Date:</strong> {toMMDDYYYY(new Date())}
          </div>
          <div>
            <strong>Chart Tick:</strong> {chartTickFormatter(new Date().getTime())}
          </div>
        </div>
      </div>

      {/* Chart Test */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Chart with MM/DD/YYYY Dates</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date"
                tickFormatter={chartTickFormatter}
                type="category"
              />
              <YAxis 
                tickFormatter={(value) => toMoney(value)}
              />
              <Tooltip 
                labelFormatter={(label) => `Date: ${chartTickFormatter(label)}`}
                formatter={(value: number) => [toMoney(value), 'Portfolio Value']}
              />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="#2563eb" 
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Raw Data Display */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Sample Data (MM/DD/YYYY)</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Value
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Parsed Date
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sampleData.map((point, index) => {
                const parsed = parseMMDDYYYY(point.date);
                return (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {point.date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {toMoney(point.value)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {parsed ? toMMDDYYYY(parsed) : 'Invalid'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
