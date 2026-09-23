import React from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

export function usePwaInstall(startUrl: string) {
  const [installPrompt, setInstallPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = React.useState(false);
  const [showBrowserHint, setShowBrowserHint] = React.useState(false);
  const [installed, setInstalled] = React.useState(isStandalone());

  React.useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setShowBrowserHint(false);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // Employee links are deep links. Always provide a visible installer entry
  // on that page, even when Android has not yet emitted beforeinstallprompt.
  // This avoids the previous situation where the employee saw no installer.
  React.useEffect(() => {
    const isEmployee = startUrl.startsWith('/funcionario/');
    if (!isEmployee || isStandalone()) return;

    const id = 'rmd-employee-install';
    let button = document.getElementById(id) as HTMLButtonElement | null;
    if (!button) {
      button = document.createElement('button');
      button.id = id;
      button.type = 'button';
      button.textContent = '📱 Instalar PontoFace';
      button.setAttribute('aria-label', 'Instalar PontoFace no celular');
      Object.assign(button.style, {
        position: 'fixed',
        right: '14px',
        bottom: '14px',
        zIndex: '99999',
        border: '0',
        borderRadius: '14px',
        padding: '13px 17px',
        background: '#0d9488',
        color: '#fff',
        fontSize: '15px',
        fontWeight: '800',
        boxShadow: '0 5px 20px rgba(0,0,0,.25)',
        cursor: 'pointer'
      });
      document.body.appendChild(button);
    }

    const handleClick = async () => {
      if (installPrompt) {
        await installPrompt.prompt();
        await installPrompt.userChoice;
        setInstallPrompt(null);
        return;
      }
      if (isIOS()) {
        setShowIosHint(true);
      } else {
        setShowBrowserHint(true);
      }
    };
    button.addEventListener('click', handleClick);

    return () => {
      button?.removeEventListener('click', handleClick);
      button?.remove();
    };
  }, [startUrl, installPrompt]);

  async function install() {
    if (installPrompt) {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
      return;
    }
    if (isIOS()) setShowIosHint(true);
    else setShowBrowserHint(true);
  }

  return {
    canInstall: Boolean(installPrompt) || isIOS() || startUrl.startsWith('/funcionario/'),
    installed,
    showIosHint,
    setShowIosHint,
    showBrowserHint,
    setShowBrowserHint,
    install
  };
}
