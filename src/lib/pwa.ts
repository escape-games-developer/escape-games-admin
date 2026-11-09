import { useEffect, useState } from "react";

/**
 * Panel instalable (PWA). El manifiesto está en public/manifest.webmanifest y
 * el service worker en public/sw.js. Para que el navegador ofrezca instalarlo
 * el sitio tiene que servirse por HTTPS.
 *
 * Chrome / Edge / Android avisan con `beforeinstallprompt`: se guarda el evento
 * y el botón "Instalar" lo dispara. Safari (iPhone/iPad/Mac) no tiene ese
 * evento: ahí el botón muestra cómo agregarlo a la pantalla de inicio.
 */

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

/** ¿Se está usando como app instalada (ventana propia, sin barra del navegador)? */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Safari en iPhone/iPad: se instala a mano desde "Compartir". */
export function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return ios && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
}

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* sin service worker el panel funciona igual; solo no se ofrece instalar */
    });
  });
}

/**
 * Estado de instalación para el botón:
 *   · "installed": ya corre como app → no se muestra el botón.
 *   · "prompt":    el navegador permite instalar con un clic.
 *   · "ios":       Safari de iPhone/iPad → mostrar instrucciones.
 *   · "none":      el navegador todavía no lo ofrece (o no se puede).
 */
export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  const status: "installed" | "prompt" | "ios" | "none" = isStandalone()
    ? "installed"
    : deferred
      ? "prompt"
      : isIosSafari()
        ? "ios"
        : "none";

  const install = async () => {
    if (!deferred) return false;
    const ev = deferred;
    deferred = null;
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    notify();
    return outcome === "accepted";
  };

  return { status, install };
}
