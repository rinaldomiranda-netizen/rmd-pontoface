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

export function usePwaInstall(_startUrl: string) {
  const [installPrompt, setInstallPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = React.useState(false);
  const [showBrowserHint, setShowBrowserHint] = React.useState(false);
  const [installed, setInstalled] = React.useState(isStandalone());

  React.useEffect(() => {
    // The correct static manifest is selected in index.html before React boots.
    // Do not replace it with a Blob manifest here: Android may then stop
    // exposing beforeinstallprompt, especially on employee deep links.
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

  async function install() {
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
  }

  return {
    canInstall: Boolean(installPrompt) || isIOS(),
    installed,
    showIosHint,
    setShowIosHint,
    showBrowserHint,
    setShowBrowserHint,
    install
  };
}
