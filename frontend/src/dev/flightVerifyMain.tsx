import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FlightVerifyApp } from './FlightVerifyApp';
import './FlightVerifyApp.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FlightVerifyApp />
  </StrictMode>,
);
