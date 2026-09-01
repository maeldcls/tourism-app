import { useEffect, useState, useCallback } from 'react';

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true // Safari iOS
  );
}

function isIOSSafari() {
  const ua = window.navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
  return isIOS && isSafari;
}

/**
 * Expose l'installation PWA à l'UI.
 *
 * Chrome/Edge (Android + desktop) déclenchent `beforeinstallprompt` : on
 * intercepte l'event, on le garde en mémoire, et promptInstall() le rejoue à
 * la demande (le navigateur n'autorise qu'un seul rejeu par event capturé).
 * Safari (iOS/macOS) ne déclenche jamais cet event — il n'y a pas d'API pour
 * proposer une installation par code, seulement le geste manuel "Partager >
 * Sur l'écran d'accueil". `isIOS` permet d'afficher cette instruction à la
 * place d'un bouton, plutôt que de n'offrir aucun chemin d'installation.
 */
export function useInstallPrompt() {
  const [deferredEvent, setDeferredEvent] = useState(null);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    function onBeforeInstallPrompt(e) {
      e.preventDefault();
      setDeferredEvent(e);
    }
    function onAppInstalled() {
      setDeferredEvent(null);
      setInstalled(true);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredEvent) return null;
    deferredEvent.prompt();
    const { outcome } = await deferredEvent.userChoice;
    // L'event ne peut servir qu'une fois, qu'il soit accepté ou refusé.
    setDeferredEvent(null);
    return outcome;
  }, [deferredEvent]);

  return {
    canInstall: !installed && deferredEvent !== null,
    isIOSInstructions: !installed && deferredEvent === null && isIOSSafari(),
    isInstalled: installed,
    promptInstall,
  };
}
