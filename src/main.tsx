import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { applyCosmetics } from './ui/profileStore';
import './ui/styles.css';

// Saved table theme and card back apply everywhere, title screen included.
applyCosmetics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
