import React, { useState } from 'react';
import { getHistory, testApiConnection, isApiKeyError } from '../lib/data';

export const DataProviderTest: React.FC = () => {
  const [result, setResult] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const handleTestConnection = async () => {
    setIsLoading(true);
    setResult('');

    try {
      const connectionResult = await testApiConnection();
      setResult(`✅ Connection successful: ${connectionResult}`);
    } catch (error) {
      if (isApiKeyError(error)) {
        setResult('❌ No API key configured. Please go to Settings to configure your Polygon API key.');
      } else {
        setResult(`❌ Connection failed: ${error}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestHistory = async () => {
    setIsLoading(true);
    setResult('');

    try {
      const history = await getHistory('AAPL', '01/01/2024', '01/05/2024', '1day');
      setResult(`✅ History data received: ${history.length} data points`);
    } catch (error) {
      if (isApiKeyError(error)) {
        setResult('❌ No API key configured. Please go to Settings to configure your Polygon API key.');
      } else {
        setResult(`❌ History fetch failed: ${error}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <h2 className="text-lg font-semibold mb-4">Data Provider Test</h2>
      
      <div className="space-y-4">
        <div className="flex space-x-4">
          <button
            onClick={handleTestConnection}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? 'Testing...' : 'Test Connection'}
          </button>
          
          <button
            onClick={handleTestHistory}
            disabled={isLoading}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            {isLoading ? 'Testing...' : 'Test AAPL History'}
          </button>
        </div>

        {result && (
          <div className="p-4 bg-gray-100 rounded">
            <pre className="text-sm">{result}</pre>
          </div>
        )}
      </div>
    </div>
  );
};
