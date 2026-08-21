import { useEffect, useState } from "react";
import { Card, PageHeader, Toggle } from "../ui";
import { ToastStack, useToasts } from "../components/Toast";
import {
  SECTION_DEFS,
  fetchSectionPermissions,
  saveSectionPermission,
  type SectionKey,
  type SectionPermissions,
} from "../lib/sectionPermissions";

/**
 * Rol que se configura desde esta pantalla. La tabla es por (rol, sección),
 * así que sumar otro rol más adelante es agregarlo acá, no migrar nada.
 */
const ROL_CONFIGURADO = "GM" as const;

/**
 * Ajustes › Habilitación de secciones.
 *
 * Define qué puede abrir un Game Master. Ojo: lee y escribe las filas del rol
 * GM, no las del usuario en sesión — el Admin General no se ve afectado por
 * estos switches, ve todo siempre.
 *
 * Guarda al toque, con actualización optimista: si Supabase rechaza (por
 * ejemplo la RLS frenando a alguien que no es Admin General), el switch vuelve
 * solo a su valor anterior y se avisa por toast.
 */
export default function SettingsPage() {
  const { toasts, toast, dismiss } = useToasts();
  const [permissions, setPermissions] = useState<SectionPermissions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<SectionKey | null>(null);

  useEffect(() => {
    let mounted = true;

    fetchSectionPermissions(ROL_CONFIGURADO)
      .then((next) => {
        if (mounted) setPermissions(next);
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        setPermissions({});
        setLoadError(
          error instanceof Error
            ? error.message
            : "Revisá la conexión, o si la migración de permisos ya fue aplicada."
        );
      });

    return () => {
      mounted = false;
    };
  }, []);

  const cambiar = async (sectionKey: SectionKey, enabled: boolean) => {
    const anterior = permissions?.[sectionKey] === true;
    setPermissions((actual) => ({ ...(actual ?? {}), [sectionKey]: enabled }));
    setGuardando(sectionKey);

    try {
      await saveSectionPermission(ROL_CONFIGURADO, sectionKey, enabled);
      toast("success", "Cambios guardados.");
    } catch (error: unknown) {
      // Se revierte para no dejar la UI mintiendo sobre lo que hay guardado.
      setPermissions((actual) => ({ ...(actual ?? {}), [sectionKey]: anterior }));
      toast("error", error instanceof Error ? error.message : "No se pudo guardar el cambio");
    } finally {
      setGuardando(null);
    }
  };

  return (
    <section className="eg-settings">
      <PageHeader title="Ajustes" subtitle="Configuración general del panel." />

      <Card padding="lg" className="eg-settings__card">
        <div className="eg-settings__heading">
          <h2>Habilitación de secciones</h2>
          <p>
            Definí qué herramientas pueden utilizar los Game Masters. El Admin General siempre
            ve todo el panel.
          </p>
        </div>

        {loadError && (
          <div className="eg-settings__alert" role="alert">
            <strong>No se pudo cargar la configuración</strong>
            <span>{loadError}</span>
          </div>
        )}

        {permissions === null ? (
          <p className="eg-settings__loading" role="status">Cargando configuración…</p>
        ) : (
          <div className="eg-settings__list">
            {SECTION_DEFS.map((def) => {
              const enabled = permissions[def.key] === true;
              // Una hija con el padre apagado no se muestra igual: se aclara
              // en el propio switch en vez de esconderlo.
              const padreApagado = def.parent ? permissions[def.parent] !== true : false;

              return (
                <div
                  key={def.key}
                  className={`eg-settings__row${def.parent ? " is-child" : ""}`}
                >
                  <Toggle
                    label={def.label}
                    description={
                      padreApagado
                        ? "Intranet está apagada: no se muestra aunque esté activada."
                        : undefined
                    }
                    checked={enabled}
                    disabled={guardando === def.key}
                    onChange={(event) => void cambiar(def.key, event.target.checked)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </section>
  );
}
