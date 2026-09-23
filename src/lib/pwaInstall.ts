import React from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type PwaManifest = {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: 'standalone';
  background_color: string;
  theme_color: string;
  icons: { src: string; sizes: string; type: string; purpose: string }[];
};

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

function updateManifest(startUrl: string) {
  const link = document.getElementById('app-manifest') as HTMLLinkElement | null;
  if (!link) return () => {};

  const manifest: PwaManifest = {
    name: 'RMD PontoFace',
    short_name: 'PontoFace',
    start_url: startUrl,
    scope: startUrl.startsWith('/funcionario/') ? startUrl.split('?')[0] : '/',
    display: 'standalone',
    background_color: '#f3f6f4',
    theme_color: '#102f24',
    icons: [
      { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'maskable' },
      { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' }
    ]
  };
  const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
  link.href = blobUrl;
  return () => URL.revokeObjectURL(blobUrl);
}

export function usePwaInstall(startUrl: string) {
  const [installPrompt, setInstallPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = React.useState(false);
  const [installed, setInstalled] = React.useState(isStandalone());

  React.useEffect(() => updateManifest(startUrl), [startUrl]);

  React.useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    if (installPrompt) {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
      return;
    }
    if (isIOS()) setShowIosHint(true);
  }

  return {
    canInstall: Boolean(installPrompt) || isIOS(),
    installed,
    showIosHint,
    setShowIosHint,
    install
  };
}
