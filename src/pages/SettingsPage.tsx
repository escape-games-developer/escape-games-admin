import { useEffect, useState } from "react";
import { Button, Card, PageHeader, Toggle } from "../ui";
import { ToastStack, useToasts } from "../components/Toast";
import {
  SECTION_DEFS,
  fetchSectionPermissions,
  saveSectionPermission,
  type SectionKey,
  type SectionPermissions,
} from "../lib/sectionPermissions";
import { DEFAULT_WHATSAPP_TEMPLATE, getBranchSheets, getRecontactosConfig, saveBranchSheet, updateRecontactosConfig } from "../services/recontactos/recontactosService";
import type { BranchSheet, RecontactosConfig } from "../services/recontactos/types";
import { assignSpreadsheet, disconnectGoogle, getGoogleStatus, pickSpreadsheet, startGoogleOAuth, validateSpreadsheet, type GoogleStatus } from "../services/recontactos/googleIntegrationService";

/**
 * Rol que se configura desde esta pantalla. La tabla es por (rol, sección),
 * así que sumar otro rol más adelante es agregarlo acá, no migrar nada.
 */
const ROL_CONFIGURADO = "GM" as const;

/**
 * Ajustes › Habilitación de secciones.
 *
 * Define qué puede abrir un Game Master. Ojo: lee y escribe las filas del rol
 * GM, no las del usuario en sesión — los administradores no se ven afectados
 * por estos switches y siempre ven todo.
 *
 * Guarda al toque, con actualización optimista: si Supabase rechaza (por
 * ejemplo la RLS frenando a un GM), el switch vuelve solo a su valor anterior
 * y se avisa por toast.
 */
export default function SettingsPage() {
  const { toasts, toast, dismiss } = useToasts();
  const [permissions, setPermissions] = useState<SectionPermissions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<SectionKey | null>(null);
  const [recontactos, setRecontactos] = useState<RecontactosConfig | null>(null);
  const [branchSheets, setBranchSheets] = useState<BranchSheet[]>([]);
  const [savingRecontactos, setSavingRecontactos] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus | null>(null);
  const [branchWorking, setBranchWorking] = useState<string | null>(null);
  const [googleWorking, setGoogleWorking] = useState(false);
  const isSuper = localStorage.getItem("eg_admin_is_super") === "true";

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

    if (isSuper) {
      Promise.all([getRecontactosConfig(), getBranchSheets(), getGoogleStatus()])
        .then(([config, sheets, google]) => { if (mounted) { setRecontactos(config); setBranchSheets(sheets); setGoogleStatus(google); } })
        .catch((error: unknown) => { if (mounted) toast("error", error instanceof Error ? error.message : "No se pudo cargar Recontactos"); });
    }

    return () => {
      mounted = false;
    };
  }, [isSuper, toast]);

  const guardarRecontactos = async () => {
    if (!recontactos) return;
    setSavingRecontactos(true);
    try {
      await updateRecontactosConfig(recontactos);
      await saveSectionPermission("GM", "recontactos", recontactos.enabled);
      for (const mapping of branchSheets.filter((item) => item.sheetId?.trim())) await saveBranchSheet(mapping);
      window.dispatchEvent(new CustomEvent("eg:recontactos-config", { detail: { enabled: recontactos.enabled } }));
      toast("success", "Configuración de Recontactos guardada.");
    } catch (error) { toast("error", error instanceof Error ? error.message : "No se pudo guardar Recontactos"); }
    finally { setSavingRecontactos(false); }
  };

  const vincularSheet = async (mapping: BranchSheet) => {
    if (!googleStatus?.connected) { toast("warning", "Primero vinculá una cuenta de Google."); return; }
    setBranchWorking(mapping.branchId);
    try {
      const selection = await pickSpreadsheet();
      await assignSpreadsheet(mapping.branchId, selection, mapping.sheetTab, mapping.active);
      setBranchSheets((items) => items.map((item) => item.branchId === mapping.branchId ? { ...item, sheetId: selection.spreadsheetId, sheetName: selection.spreadsheetName } : item));
      toast("success", `${selection.spreadsheetName} quedó vinculada.`);
    } catch (error) { toast("error", error instanceof Error ? error.message : "No se pudo vincular la planilla"); }
    finally { setBranchWorking(null); }
  };

  const probarSheet = async (mapping: BranchSheet) => {
    setBranchWorking(mapping.branchId);
    try { const result = await validateSpreadsheet(mapping.branchId); toast("success", `Google Sheet accesible · Pestaña encontrada · ${result.recordCount} registros · Estructura reconocida`); }
    catch (error) { toast("error", error instanceof Error ? error.message : "No se pudo acceder al Sheet"); }
    finally { setBranchWorking(null); }
  };

  const vincularGoogle = async () => {
    setGoogleWorking(true);
    try { await startGoogleOAuth(); }
    catch (error) {
      toast("error", error instanceof Error ? error.message : "No se pudo iniciar la conexión con Google");
      setGoogleWorking(false);
    }
  };

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
            Definí qué herramientas pueden utilizar los Game Masters. Los administradores
            siempre ven todo el panel.
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
            {SECTION_DEFS.filter((def) => def.key !== "recontactos").map((def) => {
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

      {isSuper && <Card padding="lg" className="eg-settings__card">
        <div className="eg-settings__heading"><h2>Recontactos</h2><p>Habilitación global, mensaje de WhatsApp y fuente de datos por sucursal.</p></div>
        {recontactos ? <div className="eg-settings__list">
          <div className="eg-settings__row"><Toggle label="Recontactos habilitado" description="Muestra el módulo a los usuarios habilitados. No elimina información ni conexiones." checked={recontactos.enabled} onChange={(e) => setRecontactos({ ...recontactos, enabled: e.target.checked })} /></div>
          <div className="eg-settings__row"><div className="rc-setting-field"><b>Integración con Google</b>{googleStatus?.connected ? <><span className="rc-google-status"><i />Google conectado · {googleStatus.email}</span><div className="rc-setting-actions"><Button loading={googleWorking} onClick={() => void vincularGoogle()}>Cambiar cuenta</Button><Button variant="danger" onClick={() => { if (!window.confirm("¿Desvincular la cuenta de Google? Las planillas asociadas se conservarán.")) return; void disconnectGoogle().then(() => { setGoogleStatus({ connected: false }); toast("success", "Cuenta de Google desvinculada."); }).catch((e: unknown) => toast("error", e instanceof Error ? e.message : "No se pudo desvincular")); }}>Desvincular</Button></div></> : <><small>Todavía no hay una cuenta de Google vinculada.</small><Button variant="primary" loading={googleWorking} onClick={() => void vincularGoogle()}>Vincular cuenta de Google</Button></>}</div></div>
          <div className="eg-settings__row"><label className="rc-setting-field"><b>Mensaje de WhatsApp</b><textarea rows={7} value={recontactos.whatsappTemplate} onChange={(e) => setRecontactos({ ...recontactos, whatsappTemplate: e.target.value })} /><small>Variables: [NOMBRE] [FECHA_CONTACTO] [FECHA_CUMPLE] [INVITADOS] [SUCURSAL]</small><button type="button" onClick={() => setRecontactos({ ...recontactos, whatsappTemplate: DEFAULT_WHATSAPP_TEMPLATE })}>Restaurar texto sugerido</button></label></div>
          <div className="eg-settings__row"><div className="rc-setting-field"><b>Planillas por sucursal</b><small>La selección se realiza desde Google Drive y se guarda por spreadsheetId.</small>{branchSheets.map((mapping, index) => <div className="rc-sheet-setting" key={mapping.branchId}><div><strong>{mapping.branchName}</strong><Toggle label="Recontactos" checked={mapping.active} onChange={(e) => setBranchSheets((items) => items.map((item, i) => i === index ? { ...item, active: e.target.checked } : item))} /></div><div><span>{mapping.sheetId ? mapping.sheetName : "Sin planilla seleccionada"}</span>{mapping.sheetId && <small className="rc-linked">● Vinculado</small>}<label>Pestaña<input value={mapping.sheetTab} onChange={(e) => setBranchSheets((items) => items.map((item, i) => i === index ? { ...item, sheetTab: e.target.value } : item))} /></label></div><div className="rc-setting-actions"><Button loading={branchWorking === mapping.branchId} disabled={!googleStatus?.connected} onClick={() => void vincularSheet(mapping)}>{mapping.sheetId ? "Cambiar planilla" : "Vincular Google Sheet"}</Button>{mapping.sheetId && <Button disabled={!mapping.active || branchWorking === mapping.branchId} onClick={() => void probarSheet(mapping)}>Probar conexión</Button>}</div></div>)}</div></div>
          <div className="eg-settings__row"><Button variant="primary" loading={savingRecontactos} onClick={() => void guardarRecontactos()}>Guardar Recontactos</Button></div>
        </div> : <p className="eg-settings__loading">Cargando Recontactos…</p>}
      </Card>}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </section>
  );
}
