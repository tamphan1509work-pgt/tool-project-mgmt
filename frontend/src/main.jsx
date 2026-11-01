import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import App from './App.jsx';
import { hashToPath } from './links.js';
import './styles.css';

// Bản demo chạy trong khung nhúng nên giữ điều hướng trong bộ nhớ
const IS_DEMO = import.meta.env.MODE === 'demo';
const Router = IS_DEMO ? MemoryRouter : BrowserRouter;
// Bản demo: mở link "...#tasks-12" thì vào thẳng mục đó
const routerProps = IS_DEMO ? { initialEntries: [hashToPath(window.location.hash) ?? '/'] } : {};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router {...routerProps}>
      <App />
    </Router>
  </StrictMode>,
);
