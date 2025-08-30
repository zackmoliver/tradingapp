/**
 * App Error Boundary
 * 
 * Professional error boundary component for catching and handling
 * uncaught React errors throughout the application.
 * 
 * Features:
 * - Compact error panel with professional styling
 * - Copy error details to clipboard
 * - Reload application action
 * - Error logging and reporting
 * - Graceful fallback UI
 * - Accessibility compliance
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import {
  AlertTriangle,
  Copy,
  RotateCcw,
  Bug,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  CheckCircle
} from 'lucide-react';
import { showErrorToast, showSuccessToast } from '../lib/toast';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  isExpanded: boolean;
  copySuccess: boolean;
}

/**
 * Error boundary component
 */
export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      isExpanded: false,
      copySuccess: false
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details
    console.error('AppErrorBoundary caught an error:', error, errorInfo);
    
    // Update state with error info
    this.setState({
      error,
      errorInfo
    });

    // Report error to external service (if configured)
    this.reportError(error, errorInfo);
    
    // Show toast notification
    showErrorToast(
      'Application Error',
      'An unexpected error occurred. Please try reloading the application.'
    );
  }

  /**
   * Report error to external service
   */
  private reportError = (error: Error, errorInfo: ErrorInfo) => {
    try {
      // In a real application, you would send this to your error reporting service
      const errorReport = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
      };

      console.log('Error Report:', errorReport);
      
      // Example: Send to error reporting service
      // await fetch('/api/errors', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(errorReport)
      // });
      
    } catch (reportingError) {
      console.error('Failed to report error:', reportingError);
    }
  };

  /**
   * Copy error details to clipboard
   */
  private handleCopyDetails = async () => {
    try {
      const { error, errorInfo } = this.state;
      
      const errorDetails = `
Application Error Report
========================
Time: ${new Date().toLocaleString()}
URL: ${window.location.href}
User Agent: ${navigator.userAgent}

Error Message:
${error?.message || 'Unknown error'}

Error Stack:
${error?.stack || 'No stack trace available'}

Component Stack:
${errorInfo?.componentStack || 'No component stack available'}

Additional Info:
- React Version: ${React.version}
- Timestamp: ${new Date().toISOString()}
      `.trim();

      await navigator.clipboard.writeText(errorDetails);
      
      this.setState({ copySuccess: true });
      showSuccessToast('Error details copied to clipboard');
      
      // Reset copy success state
      setTimeout(() => {
        this.setState({ copySuccess: false });
      }, 2000);
      
    } catch (clipboardError) {
      console.error('Failed to copy to clipboard:', clipboardError);
      showErrorToast('Failed to copy error details');
    }
  };

  /**
   * Reload the application
   */
  private handleReload = () => {
    window.location.reload();
  };

  /**
   * Toggle error details expansion
   */
  private toggleExpanded = () => {
    this.setState(prev => ({ isExpanded: !prev.isExpanded }));
  };

  /**
   * Reset error boundary state
   */
  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      isExpanded: false,
      copySuccess: false
    });
  };

  render() {
    if (this.state.hasError) {
      const { error, errorInfo, isExpanded, copySuccess } = this.state;

      // Custom fallback UI if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error boundary UI
      return (
        <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full">
            {/* Compact Error Panel */}
            <div className="bg-white rounded-lg shadow-lg border border-danger-200 overflow-hidden">
              {/* Header */}
              <div className="bg-danger-50 border-b border-danger-200 p-6">
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    <AlertTriangle className="w-8 h-8 text-danger-600" />
                  </div>
                  <div className="flex-1">
                    <h1 className="text-lg font-semibold text-danger-900">
                      Application Error
                    </h1>
                    <p className="text-sm text-danger-700 mt-1">
                      Something went wrong. The application encountered an unexpected error.
                    </p>
                  </div>
                </div>
              </div>

              {/* Error Summary */}
              <div className="p-6">
                <div className="bg-neutral-50 rounded-lg p-4 mb-4">
                  <div className="flex items-start space-x-2">
                    <Bug className="w-4 h-4 text-neutral-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900">
                        {error?.name || 'Error'}
                      </p>
                      <p className="text-sm text-neutral-600 mt-1 break-words">
                        {error?.message || 'An unknown error occurred'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <button
                    onClick={this.handleReload}
                    className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Reload Application
                  </button>
                  
                  <button
                    onClick={this.handleCopyDetails}
                    disabled={copySuccess}
                    className={`flex-1 inline-flex items-center justify-center px-4 py-2 border text-sm font-medium rounded-md transition-colors ${
                      copySuccess
                        ? 'border-success-300 text-success-700 bg-success-50'
                        : 'border-neutral-300 text-neutral-700 bg-white hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500'
                    }`}
                  >
                    {copySuccess ? (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy Details
                      </>
                    )}
                  </button>
                </div>

                {/* Expandable Error Details */}
                <div className="border border-neutral-200 rounded-lg">
                  <button
                    onClick={this.toggleExpanded}
                    className="w-full flex items-center justify-between p-3 text-left hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 transition-colors"
                  >
                    <span className="text-sm font-medium text-neutral-700">
                      Technical Details
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-neutral-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-neutral-500" />
                    )}
                  </button>
                  
                  {isExpanded && (
                    <div className="border-t border-neutral-200 p-3 bg-neutral-50">
                      <div className="space-y-3">
                        {/* Error Stack */}
                        {error?.stack && (
                          <div>
                            <h4 className="text-xs font-medium text-neutral-700 mb-2">
                              Error Stack:
                            </h4>
                            <pre className="text-xs text-neutral-600 bg-white p-2 rounded border overflow-x-auto whitespace-pre-wrap">
                              {error.stack}
                            </pre>
                          </div>
                        )}
                        
                        {/* Component Stack */}
                        {errorInfo?.componentStack && (
                          <div>
                            <h4 className="text-xs font-medium text-neutral-700 mb-2">
                              Component Stack:
                            </h4>
                            <pre className="text-xs text-neutral-600 bg-white p-2 rounded border overflow-x-auto whitespace-pre-wrap">
                              {errorInfo.componentStack}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Help Text */}
                <div className="mt-4 text-xs text-neutral-500">
                  <p>
                    If this error persists, please copy the technical details and report the issue.
                    Reloading the application will reset the current session.
                  </p>
                </div>
              </div>
            </div>

            {/* Additional Actions */}
            <div className="mt-4 text-center">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center text-sm text-neutral-600 hover:text-neutral-900 transition-colors"
              >
                <ExternalLink className="w-4 h-4 mr-1" />
                Try to continue without reloading
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;
