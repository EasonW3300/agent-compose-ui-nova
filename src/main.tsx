import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FluentProvider, webDarkTheme, webLightTheme } from '@fluentui/react-components';
import './index.css';
import App from './App.tsx';

// FluentProvider supplies the official Fluent design tokens consumed by the CSS visual layer.
// The media-query listener keeps the application aligned with the user's system theme preference.
export function ThemedRoot() {
  const query = '(prefers-color-scheme: dark)';
  const [dark, setDark] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const handleChange = (event: MediaQueryListEvent) => setDark(event.matches);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  return (
    <FluentProvider theme={dark ? webDarkTheme : webLightTheme}>
      <App />
    </FluentProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemedRoot />
  </StrictMode>,
);
