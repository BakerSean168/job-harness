'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  const stored = localStorage.getItem('job-harness-theme');
  if (stored === 'dark' || stored === 'light') return stored;
  const explicit = document.documentElement.dataset.theme;
  if (explicit === 'dark' || explicit === 'light') return explicit;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeToggle({ label }: { label: string }) {
  const [theme, setTheme] = useState<Theme>('light');
  useEffect(() => {
    const resolved = currentTheme();
    document.documentElement.dataset.theme = resolved;
    setTheme(resolved);
  }, []);

  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="topbar-icon-button"
      aria-label={label}
      title={label}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        localStorage.setItem('job-harness-theme', next);
        setTheme(next);
      }}
    >
      {theme === 'dark'
        ? <Sun aria-hidden="true" size={17} />
        : <Moon aria-hidden="true" size={17} />}
    </button>
  );
}
