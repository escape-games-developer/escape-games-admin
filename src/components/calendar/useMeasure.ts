import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Alto y ancho de un elemento, actualizados cuando cambia de tamaño. */
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

/**
 * Hace que el elemento ocupe el alto que queda de la ventana desde donde
 * empieza, así el calendario entra entero sin scroll. Se recalcula al cambiar
 * el tamaño de la ventana o lo que hay arriba.
 */
export function useFillViewport<T extends HTMLElement>(bottomGap = 16, minHeight = 360) {
  const ref = useRef<T | null>(null);
  const fitRef = useRef<() => void>(() => {});

  // En cada render: lo de arriba puede cambiar de alto (p. ej. el encabezado
  // con o sin botón según la vista) sin que cambie el tamaño de la ventana.
  useLayoutEffect(() => {
    fitRef.current();
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      let height = Math.max(minHeight, window.innerHeight - top - bottomGap);
      el.style.height = `${height}px`;
      // Lo que queda debajo (márgenes del diseño general, bordes) puede sumar
      // más que bottomGap: si la página igual scrollea, se descuenta lo que sobra.
      const overshoot = document.documentElement.scrollHeight - window.innerHeight;
      if (overshoot > 0 && height > minHeight) {
        height = Math.max(minHeight, height - overshoot);
        el.style.height = `${height}px`;
      }
    };
    fitRef.current = fit;
    fit();
    window.addEventListener("resize", fit);
    const observer = new ResizeObserver(fit);
    if (el.parentElement) observer.observe(el.parentElement);
    return () => {
      window.removeEventListener("resize", fit);
      observer.disconnect();
    };
  }, [bottomGap, minHeight]);
  return ref;
}
