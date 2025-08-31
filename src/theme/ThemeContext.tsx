import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
type ThemeCtx = { theme: Theme; toggle: () => void; set: (t: Theme) => void };

const ThemeContext = createContext<ThemeCtx>({ theme: 'light', toggle: () => {}, set: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'light');

  useEffect(() => {
    localStorage.setItem('theme', theme);
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  const toggle = () => setTheme(theme === 'light' ? 'dark' : 'light');
  return <ThemeContext.Provider value={{ theme, toggle, set: setTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
