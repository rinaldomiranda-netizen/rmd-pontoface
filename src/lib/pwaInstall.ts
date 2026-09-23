import React from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type PwaManifest = {
  id: string;
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

function getIdentity(startUrl: string) {
  if (startUrl.startsWith('/rmd')) {
    return {
      name: 'RMD PontoFace — RMD',
      shortName: 'RMD PontoFace',
      icon: '/icons/rmd.svg',
      theme: '#2563eb',
      background: '#f3f6ff'
    };
  }
  if (startUrl.startsWith('/admin')) {
    return {
      name: 'RMD PontoFace — Empresa',
      shortName: 'PontoFace Empresa',
      icon: '/icons/empresa.svg',
      theme: '#7c3aed',
      background: '#f7f3ff'
    };
  }
  if (startUrl.startsWith('/funcionario/')) {
    return {
      name: 'RMD PontoFace — Funcionário',
      shortName: 'PontoFace Funcionário',
      icon: '/icons/funcionario.svg',
      theme: '#0d9488',
      background: '#effcfb'
    };
  }
  return {
    name: 'RMD PontoFace',
    shortName: 'PontoFace',
    icon: '/icon-192.svg',
    theme: '#2563eb',
    background: '#f3f6f4'
  };
}

function updateManifest(startUrl: string) {
  const link = document.getElementById('app-manifest') as HTMLLinkElement | null;
  if (!link) return () => {};

  const identity = getIdentity(startUrl);
  const scope = startUrl.startsWith('/funcionario/') ? startUrl.split('?')[0] : startUrl.startsWith('/admin') ? '/admin' : startUrl.startsWith('/rmd') ? '/rmd' : '/';

  const manifest: PwaManifest = {
    id: startUrl,
    name: identity.name,
    short_name: identity.shortName,
    start_url: startUrl,
    scope,
    display: 'standalone',
    background_color: identity.background,
    theme_color: identity.theme,
    icons: [
      { src: identity.icon, sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
      { src: identity.icon, sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }
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
