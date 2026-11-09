import { useEffect, useState } from "react";

/**
 * Tema del panel: oscuro, claro o el del sistema. Se guarda por equipo
 * (localStorage) y se aplica como `data-theme` en <html>; los colores salen de
 * src/styles/tokens.css. index.html aplica el guardado antes de que cargue
 * React para que no parpadee al abrir.
 */

export type ThemePref = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

const KEY = "eg_theme";
const media = () => window.matchMedia("(prefers-color-scheme: light)");

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "dark";
  } catch {
    return "dark";
  }
}

export function resolveTheme(pref: ThemePref): ResolvedTheme {
  if (pref === "system") return media().matches ? "light" : "dark";
  return pref;
}

export function applyTheme(pref: ThemePref) {
  const resolved = resolveTheme(pref);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  // Color de la barra del navegador / de la app instalada.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "light" ? "#f4f6fa" : "#0b111b");
}

/** Preferencia de tema + setter. Si es "system", sigue los cambios del sistema en vivo. */
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(readThemePref);

  useEffect(() => {
    applyTheme(pref);
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      /* storage bloqueado: el tema vale solo para esta sesión */
    }
    if (pref !== "system") return;
    const mq = media();
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  return [pref, setPref] as const;
}
