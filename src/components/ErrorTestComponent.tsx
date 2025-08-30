/**
 * Error Test Component
 * 
 * Simple component for testing the error boundary functionality.
 * This component can be temporarily added to trigger errors for testing.
 * 
 * Usage:
 * - Import and add to any component to test error boundary
 * - Click the "Trigger Error" button to test error handling
 * - Remove after testing is complete
 */

import React, { useState } from 'react';
import { Bug, AlertTriangle } from 'lucide-react';
import { showErrorToast, showSuccessToast, showWarningToast, showInfoToast } from '../lib/toast';

const ErrorTestComponent: React.FC = () => {
  const [shouldError, setShouldError] = useState(false);

  // This will trigger an error that the error boundary will catch
  if (shouldError) {
    throw new Error('Test error triggered by ErrorTestComponent');
  }

  const triggerError = () => {
    setShouldError(true);
  };

  const testToasts = () => {
    showSuccessToast('Success!', 'This is a success message');
    setTimeout(() => showErrorToast('Error!', 'This is an error message'), 1000);
    setTimeout(() => showWarningToast('Warning!', 'This is a warning message'), 2000);
    setTimeout(() => showInfoToast('Info!', 'This is an info message'), 3000);
  };

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
      <div className="flex items-center space-x-2 mb-3">
        <Bug className="w-5 h-5 text-yellow-600" />
        <h3 className="text-sm font-medium text-yellow-800">
          Error Boundary Test Component
        </h3>
      </div>
      
      <p className="text-sm text-yellow-700 mb-4">
        This component is for testing error boundary and toast functionality. 
        Remove this component after testing is complete.
      </p>
      
      <div className="flex space-x-3">
        <button
          onClick={triggerError}
          className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
        >
          <AlertTriangle className="w-4 h-4 mr-2" />
          Trigger Error
        </button>
        
        <button
          onClick={testToasts}
          className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
        >
          Test Toasts
        </button>
      </div>
    </div>
  );
};

export default ErrorTestComponent;
