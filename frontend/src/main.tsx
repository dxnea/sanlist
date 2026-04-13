import React from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './style.css';
import { registerServiceWorker } from './utils/registerSW';
import { seedDatabase } from './db/seed';

// Initialize PWA
void registerServiceWorker();
void seedDatabase();

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

