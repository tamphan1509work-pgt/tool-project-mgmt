import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles.css';

// Bản demo chạy trong khung nhúng nên giữ điều hướng trong bộ nhớ
const Router = import.meta.env.MODE === 'demo' ? MemoryRouter : BrowserRouter;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
);
