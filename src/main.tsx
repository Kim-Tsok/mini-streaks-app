import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/quicksand';
import '@fontsource-variable/nunito';
import App from './App';
import './index.css';

// Set the theme before first paint to avoid a flash.
document.documentElement.dataset.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
