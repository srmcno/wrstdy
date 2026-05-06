import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { applyInitialTextSize } from './components/TextSizeMenu.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';

// Apply saved text-size zoom before React mounts to avoid a flash at the old size.
applyInitialTextSize();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
