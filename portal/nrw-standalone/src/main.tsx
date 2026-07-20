import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import NrwMapContainer from '#components/Nrw';
import NrwPage from './components/NrwPage';
import '@ifrc-go/ui/index.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <NrwPage>
        <Routes>
          <Route path="/" element={<NrwMapContainer />} />
          <Route path="/nrw" element={<NrwMapContainer />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </NrwPage>
    </BrowserRouter>
  </StrictMode>,
)
