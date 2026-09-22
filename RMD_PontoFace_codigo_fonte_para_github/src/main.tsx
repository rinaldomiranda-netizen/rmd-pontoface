import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import App from './App';

// Gera um manifest dinâmico cujo "start_url" é a página atual (com o token
// do funcionário, se houver). Assim, quando a pessoa usa "Adicionar à tela
// inicial", o ícone criado abre direto na página dela, sem precisar
// procurar o link de novo depois.
function installDynamicManifest() {
  try {
    const current = location.pathname + location.search;
    const manifest = {
      name: 'RMD PontoFace',
      short_name: 'PontoFace',
      start_url: current,
      scope: '/',
      display: 'standalone',
      background_color: '#f3f6f4',
      theme_color: '#102f24',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    };
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.getElementById('app-manifest') as HTMLLinkElement | null;
    if (link) link.href = url;
  } catch {
    // se algo falhar aqui, o manifest estático em /manifest.webmanifest continua valendo
  }
}
installDynamicManifest();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
);
