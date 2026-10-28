import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import { ToastProvider } from './components/ui.jsx';
import './styles/base.css';
import './styles/components.css';

document.title = import.meta.env.VITE_PLATFORM_NAME || 'Sanyog';
createRoot(document.getElementById('root')).render(
  <React.StrictMode><BrowserRouter><AuthProvider><ToastProvider><App /></ToastProvider></AuthProvider></BrowserRouter></React.StrictMode>
);
