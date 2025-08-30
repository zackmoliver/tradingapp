import React, { useState } from 'react';
import { storeApiKey, testApiConnection, isApiKeyError } from '../lib/data';

export const Settings: React.FC = () => {
  const [polygonApiKey, setPolygonApiKey] = useState('');
  const [isStoring, setIsStoring] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [storeMessage, setStoreMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testMessage, setTestMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleStoreApiKey = async () => {
    if (!polygonApiKey.trim()) {
      setStoreMessage({ type: 'error', text: 'Please enter an API key' });
      return;
    }

    setIsStoring(true);
    setStoreMessage(null);

    try {
      await storeApiKey('polygon', polygonApiKey.trim());
      setStoreMessage({ type: 'success', text: 'API key stored successfully' });
      setPolygonApiKey(''); // Clear the input for security
    } catch (error) {
      setStoreMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Failed to store API key' 
      });
    } finally {
      setIsStoring(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestMessage(null);

    try {
      const result = await testApiConnection();
      setTestMessage({ type: 'success', text: result });
    } catch (error) {
      let errorMessage = 'Connection test failed';
      
      if (isApiKeyError(error)) {
        errorMessage = 'No API key configured. Please store your Polygon API key first.';
      } else if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      setTestMessage({ type: 'error', text: errorMessage });
    } finally {
      setIsTesting(false);
    }
  };

  const clearMessages = () => {
    setStoreMessage(null);
    setTestMessage(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="mt-2 text-gray-600">
            Configure your data providers and API connections.
          </p>
        </div>

        {/* Data Providers Section */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Data Providers</h2>
            <p className="text-sm text-gray-600 mt-1">
              Configure API keys for market data providers.
            </p>
          </div>

          <div className="p-6">
            {/* Polygon.io Section */}
            <div className="mb-8">
              <div className="flex items-center mb-4">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-purple-600" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                    </svg>
                  </div>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-medium text-gray-900">Polygon.io</h3>
                  <p className="text-sm text-gray-600">
                    Real-time and historical market data, options chains, and quotes.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label htmlFor="polygonApiKey" className="block text-sm font-medium text-gray-700 mb-2">
                    API Key
                  </label>
                  <div className="flex space-x-3">
                    <input
                      type="password"
                      id="polygonApiKey"
                      value={polygonApiKey}
                      onChange={(e) => {
                        setPolygonApiKey(e.target.value);
                        clearMessages();
                      }}
                      placeholder="Enter your Polygon.io API key"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                    <button
                      onClick={handleStoreApiKey}
                      disabled={isStoring || !polygonApiKey.trim()}
                      className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                        isStoring || !polygonApiKey.trim()
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
                      }`}
                    >
                      {isStoring ? 'Storing...' : 'Store Key'}
                    </button>
                  </div>
                  
                  {storeMessage && (
                    <div className={`mt-2 p-3 rounded-md text-sm ${
                      storeMessage.type === 'success' 
                        ? 'bg-green-50 text-green-700 border border-green-200' 
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}>
                      {storeMessage.text}
                    </div>
                  )}
                </div>

                <div>
                  <button
                    onClick={handleTestConnection}
                    disabled={isTesting}
                    className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                      isTesting
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500'
                    }`}
                  >
                    {isTesting ? 'Testing...' : 'Test Connection'}
                  </button>

                  {testMessage && (
                    <div className={`mt-2 p-3 rounded-md text-sm ${
                      testMessage.type === 'success' 
                        ? 'bg-green-50 text-green-700 border border-green-200' 
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}>
                      {testMessage.text}
                    </div>
                  )}
                </div>
              </div>

              {/* API Key Instructions */}
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
                <h4 className="text-sm font-medium text-blue-900 mb-2">How to get your Polygon.io API key:</h4>
                <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                  <li>Visit <a href="https://polygon.io" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-900">polygon.io</a> and create an account</li>
                  <li>Navigate to your dashboard and find the API Keys section</li>
                  <li>Copy your API key and paste it above</li>
                  <li>Click "Store Key" to securely save it in your system keychain</li>
                  <li>Use "Test Connection" to verify your key works</li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        {/* Cache Settings Section */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Cache Settings</h2>
            <p className="text-sm text-gray-600 mt-1">
              Manage local data caching to improve performance.
            </p>
          </div>

          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-900">Enable Data Caching</h3>
                <p className="text-sm text-gray-600">
                  Cache market data locally to reduce API calls and improve performance.
                </p>
              </div>
              <div className="ml-4">
                <input
                  type="checkbox"
                  defaultChecked
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <button className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500">
                Clear Cache
              </button>
              <p className="text-xs text-gray-500 mt-2">
                This will remove all cached market data and force fresh API calls.
              </p>
            </div>
          </div>
        </div>

        {/* Rate Limiting Section */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Rate Limiting</h2>
            <p className="text-sm text-gray-600 mt-1">
              Configure API request throttling to avoid rate limits.
            </p>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Requests per minute
                </label>
                <input
                  type="number"
                  defaultValue={5}
                  min={1}
                  max={100}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Retry delay (seconds)
                </label>
                <input
                  type="number"
                  defaultValue={60}
                  min={1}
                  max={300}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
            </div>
            
            <div className="mt-4">
              <p className="text-xs text-gray-500">
                These settings help prevent API rate limit errors. Lower values are more conservative.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
