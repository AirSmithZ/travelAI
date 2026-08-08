import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { OpsUsageApp } from './OpsUsageApp';
import './OpsUsageApp.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OpsUsageApp />
  </StrictMode>,
);
