import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TravelProvider } from './context/TravelContext';
import Onboarding from './pages/Onboarding';
import Flights from './pages/Flights';
import Plan from './pages/Plan';
import Share from './pages/Share';

const App = () => {
  return (
    <TravelProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Onboarding />} />
          <Route path="/flights" element={<Flights />} />
          <Route path="/plan" element={<Plan />} />
          <Route path="/share" element={<Share />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </TravelProvider>
  );
};

export default App;
