import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import Verify from './Verify';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {window.location.pathname === '/verify' ? <Verify /> : <App />}
  </React.StrictMode>,
);
