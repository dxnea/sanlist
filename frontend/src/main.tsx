import React from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './style.css';
import { registerServiceWorker } from './utils/registerSW';

// Initialize PWA
void registerServiceWorker();

createRoot(document.getElementById('app') as HTMLElement).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="top-right"
      toastOptions={{
        style: {
          background: '#1f2937',
          color: '#ffffff',
          borderRadius: '12px',
        },
      }}
    />
  </React.StrictMode>
);

