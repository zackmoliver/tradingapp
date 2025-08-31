// src/hooks/useQAMode.ts
// Hook to detect QA mode activation via URL or keyboard

import { useState, useEffect, useCallback } from 'react';
import { runAll, getReport, downloadReport } from '@/lib/qa';

export interface QAModeState {
  isEnabled: boolean;
  isVisible: boolean;
  toggle: () => void;
  show: () => void;
  hide: () => void;
  enable: () => void;
  disable: () => void;
}

export const useQAMode = (): QAModeState => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Check URL parameter on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const qaParam = urlParams.get('qa');
    
    if (qaParam === '1' || qaParam === 'true') {
      setIsEnabled(true);
      setIsVisible(true);
    }
  }, []);

  // Keyboard shortcut handler
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Ctrl+Alt+Q (Windows/Linux) or Cmd+Alt+Q (Mac)
    if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === 'q') {
      event.preventDefault();
      event.stopPropagation();
      
      if (isEnabled) {
        setIsVisible(prev => !prev);
      } else {
        setIsEnabled(true);
        setIsVisible(true);
      }
    }
    
    // ESC to close overlay
    if (event.key === 'Escape' && isVisible) {
      setIsVisible(false);
    }
  }, [isEnabled, isVisible]);

  // Register keyboard event listeners
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [handleKeyDown]);

  const toggle = useCallback(() => {
    if (isEnabled) {
      setIsVisible(prev => !prev);
    } else {
      setIsEnabled(true);
      setIsVisible(true);
    }
  }, [isEnabled]);

  const show = useCallback(() => {
    if (!isEnabled) {
      setIsEnabled(true);
    }
    setIsVisible(true);
  }, [isEnabled]);

  const hide = useCallback(() => {
    setIsVisible(false);
  }, []);

  const enable = useCallback(() => {
    setIsEnabled(true);
  }, []);

  const disable = useCallback(() => {
    setIsEnabled(false);
    setIsVisible(false);
  }, []);

  return {
    isEnabled,
    isVisible,
    toggle,
    show,
    hide,
    enable,
    disable,
  };
};
