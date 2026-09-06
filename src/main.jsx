import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
// Page-level rules (full-height body, no page scroll) belong to the standalone
// build only. The Power Apps code component entry point deliberately does not
// import this file — it must not restyle the app hosting it.
import './standalone.css';
import './styles.css';
import { applyInitialTextSize } from './components/TextSizeMenu.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';

// Prime the saved text-size preference before the first render so the app
// mounts at the user's chosen size rather than flashing at the default.
applyInitialTextSize();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
