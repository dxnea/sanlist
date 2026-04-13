import React from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './style.css';

createRoot(document.getElementById('app') as HTMLElement).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 1000,
        style: {
          background: '#1f2937',
          color: '#ffffff',
          borderRadius: '12px',
        },
      }}
    />
  </React.StrictMode>
);

