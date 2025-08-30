/**
 * Minimal Toast System
 * 
 * Professional toast notifications using React portals.
 * No external dependencies - pure React implementation.
 * 
 * Features:
 * - Portal-based rendering for proper z-index handling
 * - Multiple toast types (success, error, warning, info)
 * - Auto-dismiss with configurable timeout
 * - Manual dismiss with close button
 * - Smooth animations with CSS transitions
 * - Queue management for multiple toasts
 * - Accessible with proper ARIA attributes
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

/**
 * Toast types and configuration
 */
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  dismissible?: boolean;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  clearAllToasts: () => void;
}

/**
 * Toast context
 */
const ToastContext = createContext<ToastContextType | null>(null);

/**
 * Toast hook for easy access
 */
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

/**
 * Toast helper functions
 */
export const toast = {
  success: (title: string, message?: string, duration?: number) => {
    const context = document.querySelector('[data-toast-context]') as any;
    if (context?._addToast) {
      context._addToast({ type: 'success', title, message, duration });
    }
  },
  
  error: (title: string, message?: string, duration?: number) => {
    const context = document.querySelector('[data-toast-context]') as any;
    if (context?._addToast) {
      context._addToast({ type: 'error', title, message, duration });
    }
  },
  
  warning: (title: string, message?: string, duration?: number) => {
    const context = document.querySelector('[data-toast-context]') as any;
    if (context?._addToast) {
      context._addToast({ type: 'warning', title, message, duration });
    }
  },
  
  info: (title: string, message?: string, duration?: number) => {
    const context = document.querySelector('[data-toast-context]') as any;
    if (context?._addToast) {
      context._addToast({ type: 'info', title, message, duration });
    }
  }
};

/**
 * Individual toast component
 */
const ToastItem: React.FC<{
  toast: Toast;
  onRemove: (id: string) => void;
}> = ({ toast, onRemove }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  // Auto-dismiss timer
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (toast.duration !== 0) {
      const timer = setTimeout(() => {
        handleRemove();
      }, toast.duration || 5000);
      return () => clearTimeout(timer);
    }
  }, [toast.duration]);

  const handleRemove = useCallback(() => {
    setIsLeaving(true);
    setTimeout(() => onRemove(toast.id), 300);
  }, [toast.id, onRemove]);

  const getToastStyles = (type: ToastType) => {
    const baseStyles = 'flex items-start p-4 rounded-lg shadow-lg border max-w-sm w-full transition-all duration-300 transform';
    
    switch (type) {
      case 'success':
        return `${baseStyles} bg-success-50 border-success-200 text-success-800`;
      case 'error':
        return `${baseStyles} bg-danger-50 border-danger-200 text-danger-800`;
      case 'warning':
        return `${baseStyles} bg-warning-50 border-warning-200 text-warning-800`;
      case 'info':
        return `${baseStyles} bg-primary-50 border-primary-200 text-primary-800`;
      default:
        return `${baseStyles} bg-neutral-50 border-neutral-200 text-neutral-800`;
    }
  };

  const getIcon = (type: ToastType) => {
    const iconClass = 'w-5 h-5 flex-shrink-0 mt-0.5';
    
    switch (type) {
      case 'success':
        return <CheckCircle className={`${iconClass} text-success-600`} />;
      case 'error':
        return <AlertCircle className={`${iconClass} text-danger-600`} />;
      case 'warning':
        return <AlertTriangle className={`${iconClass} text-warning-600`} />;
      case 'info':
        return <Info className={`${iconClass} text-primary-600`} />;
      default:
        return <Info className={`${iconClass} text-neutral-600`} />;
    }
  };

  const transformClass = isLeaving 
    ? 'translate-x-full opacity-0' 
    : isVisible 
    ? 'translate-x-0 opacity-100' 
    : 'translate-x-full opacity-0';

  return (
    <div
      className={`${getToastStyles(toast.type)} ${transformClass}`}
      role="alert"
      aria-live="polite"
    >
      {getIcon(toast.type)}
      
      <div className="ml-3 flex-1">
        <p className="text-sm font-medium">
          {toast.title}
        </p>
        {toast.message && (
          <p className="text-sm mt-1 opacity-90">
            {toast.message}
          </p>
        )}
      </div>
      
      {toast.dismissible !== false && (
        <button
          onClick={handleRemove}
          className="ml-4 flex-shrink-0 rounded-md p-1.5 hover:bg-black hover:bg-opacity-10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent focus:ring-current transition-colors"
          aria-label="Dismiss notification"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

/**
 * Toast container component
 */
const ToastContainer: React.FC<{ toasts: Toast[]; onRemove: (id: string) => void }> = ({
  toasts,
  onRemove
}) => {
  if (toasts.length === 0) return null;

  return createPortal(
    <div
      className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} onRemove={onRemove} />
        </div>
      ))}
    </div>,
    document.body
  );
};

/**
 * Toast provider component
 */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toastData: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newToast: Toast = {
      id,
      dismissible: true,
      duration: 5000,
      ...toastData
    };

    setToasts(prev => [...prev, newToast]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const clearAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  // Expose addToast globally for toast helper functions
  useEffect(() => {
    const contextElement = document.querySelector('[data-toast-context]') as any;
    if (contextElement) {
      contextElement._addToast = addToast;
    }
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, clearAllToasts }}>
      <div data-toast-context="true">
        {children}
      </div>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
};

/**
 * Toast utilities for common use cases
 */
export const showSuccessToast = (title: string, message?: string) => {
  toast.success(title, message);
};

export const showErrorToast = (title: string, message?: string) => {
  toast.error(title, message, 8000); // Longer duration for errors
};

export const showWarningToast = (title: string, message?: string) => {
  toast.warning(title, message);
};

export const showInfoToast = (title: string, message?: string) => {
  toast.info(title, message);
};

/**
 * Toast for async operations
 */
export const showAsyncToast = async <T,>(
  promise: Promise<T>,
  messages: {
    loading: string;
    success: string;
    error: string;
  }
): Promise<T> => {
  toast.info(messages.loading, undefined, 0); // No auto-dismiss
  
  try {
    const result = await promise;
    toast.success(messages.success);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    toast.error(messages.error, errorMessage);
    throw error;
  }
};
