import { useEffect, useMemo, useState } from "react";
import { Badge, Button, EmptyState, PageHeader, SearchInput, Select } from "../ui";
import { ToastStack, useToasts } from "../components/Toast";
import { getBranchSheets, getRecontactosConfig, renderWhatsappTemplate, whatsappUrl } from "../services/recontactos/recontactosService";
import { useRecontactosSync } from "../services/recontactos/useRecontactosSync";
import type { BranchSheet, Recontacto, RecontactoChanges, RecontactosConfig, RecontactoEstado } from "../services/recontactos/types";
import "./recontactos.css";

type Filter = "all" | "today" | "unanswered" | "interested";
const today = () => new Date().toISOString().slice(0, 10);
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat("es-AR", { dateStyle: "short" }).format(new Date(`${value.slice(0, 10)}T12:00:00`)) : "—";
const formatDateTime = (value: string | null) => value ? new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";

const toneFor = (status: RecontactoEstado): "neutral" | "success" | "danger" | "warning" | "info" | "accent" => {
  if (status === "Reservó") return "success";
  if (["No interesado", "Número inválido", "Cerrado sin respuesta"].includes(status)) return "danger";
  if (["Interesado", "Respondió"].includes(status)) return "accent";
  if (["Seguimiento", "Recontactar"].includes(status)) return "info";
  if (["Sin respuesta", "Sin disponibilidad", "Otra propuesta"].includes(status)) return "warning";
  return "neutral";
};

function RoomsPopover({ rooms }: { rooms: string[] }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close);
  }, [open]);
  if (!rooms.length) return <>—</>;
  return <span className="rc-rooms" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <span>{rooms[0]}</span>{rooms.length > 1 && <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>+{rooms.length - 1}</button>}
    {open && <span className="rc-popover" role="dialog"><strong>Salas de interés</strong>{rooms.map((room) => <span key={room}>• {room}</span>)}</span>}
  </span>;
}

function ManagementDrawer({ item, saving, onClose, onSave }: { item: Recontacto; saving: boolean; onClose: () => void; onSave: (changes: RecontactoChanges) => Promise<void> }) {
  const [result, setResult] = useState("Sin respuesta");
  const [response, setResponse] = useState("Lo está evaluando");
  const [nextDate, setNextDate] = useState(item.proximoRecontacto?.slice(0, 10) || "");
  const [note, setNote] = useState("");
  useEffect(() => { const escape = (e: KeyboardEvent) => e.key === "Escape" && onClose(); document.addEventListener("keydown", escape); return () => document.removeEventListener("keydown", escape); }, [onClose]);

  const submit = async () => {
    const now = new Date().toISOString();
    let status: RecontactoEstado = result as RecontactoEstado;
    if (result === "Respondió") {
      const statusMap: Record<string, RecontactoEstado> = { "Quiere avanzar": "Interesado", "Lo está evaluando": "Seguimiento", "Pidió que lo contacten otro día": "Recontactar", "Se le fue de presupuesto": "No interesado", "No le interesa": "No interesado", "Eligió otra propuesta": "Otra propuesta", "Cambió fecha": "Seguimiento", "No hay disponibilidad": "Sin disponibilidad" };
      status = statusMap[response];
    }
    const changes: RecontactoChanges = { estado: status, ultimaGestion: now, resultadoUltimaGestion: result === "Respondió" ? response : result, notas: note.trim() ? [item.notas, note.trim()].filter(Boolean).join("\n") : item.notas, proximoRecontacto: nextDate || null };
    if (result === "Sin respuesta") { const attempts = [...item.intentos]; const slot = attempts.findIndex((v) => !v); if (slot >= 0) attempts[slot] = now; changes.intentos = attempts; if (slot === 2) changes.estado = "Cerrado sin respuesta"; }
    if (result === "Reservó") { changes.fechaReserva = today(); changes.proximoRecontacto = null; }
    if (result === "No interesado") changes.proximoRecontacto = null;
    await onSave(changes);
  };

  return <div className="rc-drawer-layer" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <aside className="rc-drawer" role="dialog" aria-modal="true" aria-labelledby="rc-drawer-title">
      <header><div><span className="rc-eyebrow">Gestión de recontacto</span><h2 id="rc-drawer-title">{item.nombre}</h2><a href={`tel:${item.whatsapp}`}>{item.whatsapp}</a></div><button type="button" className="rc-close" onClick={onClose} aria-label="Cerrar">×</button></header>
      <section><h3>Información del cumpleaños</h3><dl className="rc-details"><div><dt>Contacto original</dt><dd>{formatDate(item.fechaContacto)}</dd></div><div><dt>Festejo</dt><dd>{formatDate(item.fechaFestejo)}</dd></div><div><dt>Edad</dt><dd>{item.edad ?? "—"}</dd></div><div><dt>Invitados</dt><dd>{item.invitados ?? "—"}</dd></div><div><dt>Presupuesto</dt><dd>{item.presupuesto || "—"}</dd></div><div><dt>Estado</dt><dd><Badge tone={toneFor(item.estado)} small>{item.estado}</Badge></dd></div></dl><p><b>Salas:</b> {item.salas.join(", ") || "—"}</p></section>
      <section><h3>Historial</h3>{item.intentos.some(Boolean) ? <ol className="rc-history">{item.intentos.map((attempt, i) => attempt && <li key={i}><b>Intento {i + 1}</b><span>{formatDateTime(attempt)}</span></li>)}</ol> : <p className="rc-muted">Todavía no hay intentos registrados.</p>}{item.notas && <p className="rc-note">{item.notas}</p>}</section>
      <section><h3>Registrar resultado</h3><label>Resultado<select value={result} onChange={(e) => setResult(e.target.value)}><option>Sin respuesta</option><option>Respondió</option><option>Reservó</option><option>No interesado</option></select></label>
        {result === "Respondió" && <label>Respuesta<select value={response} onChange={(e) => setResponse(e.target.value)}>{["Quiere avanzar", "Lo está evaluando", "Pidió que lo contacten otro día", "Se le fue de presupuesto", "No le interesa", "Eligió otra propuesta", "Cambió fecha", "No hay disponibilidad"].map((v) => <option key={v}>{v}</option>)}</select></label>}
        {(result === "Sin respuesta" || result === "Respondió") && <div><label>Próximo contacto<input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} /></label><div className="rc-shortcuts">{[[1,"Mañana"],[2,"En 2 días"],[5,"En 5 días"]].map(([days,label]) => <button key={String(label)} type="button" onClick={() => { const d = new Date(); d.setDate(d.getDate() + Number(days)); setNextDate(d.toISOString().slice(0,10)); }}>{label}</button>)}</div></div>}
        <label>Nota del asesor (opcional)<textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </section>
      <footer><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={saving} onClick={() => void submit()}>Guardar gestión</Button></footer>
    </aside>
  </div>;
}

export default function RecontactosPage() {
  const [branches, setBranches] = useState<BranchSheet[]>([]); const [branchId, setBranchId] = useState<string | null>(null);
  const [config, setConfig] = useState<RecontactosConfig | null>(null); const [bootError, setBootError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all"); const [query, setQuery] = useState(""); const [selected, setSelected] = useState<Recontacto | null>(null); const [started, setStarted] = useState<Set<string>>(new Set()); const [now, setNow] = useState(() => Date.now());
  const { toasts, toast, dismiss } = useToasts();
  const branch = branches.find((b) => b.branchId === branchId); const sync = useRecontactosSync(branchId, Boolean(branch?.sheetId && branch.active));

  useEffect(() => { let active = true; Promise.all([getBranchSheets(), getRecontactosConfig()]).then(([allBranches, cfg]) => { if (!active) return; const isSuper = localStorage.getItem("eg_admin_is_super") === "true"; const own = localStorage.getItem("eg_admin_branch_id"); const allowed = isSuper ? allBranches : allBranches.filter((b) => b.branchId === own); setBranches(allowed); setBranchId(allowed[0]?.branchId ?? null); setConfig(cfg); }).catch((e) => active && setBootError(e instanceof Error ? e.message : "No se pudo cargar Recontactos")); return () => { active = false; }; }, []);
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);

  const shown = useMemo(() => sync.items.filter((item) => { const q = query.trim().toLocaleLowerCase(); const search = !q || item.nombre.toLocaleLowerCase().includes(q) || item.whatsapp.includes(q); const date = item.proximoRecontacto?.slice(0,10); const match = filter === "all" || (filter === "today" && date === today()) || (filter === "unanswered" && item.estado === "Sin respuesta") || (filter === "interested" && item.estado === "Interesado"); return search && match; }), [sync.items, query, filter]);
  const metrics = useMemo(() => ({ today: sync.items.filter((i) => i.proximoRecontacto?.slice(0,10) === today()).length, waiting: sync.items.filter((i) => ["Sin respuesta","Seguimiento","Recontactar"].includes(i.estado)).length, interested: sync.items.filter((i) => i.estado === "Interesado").length, recovered: sync.items.filter((i) => i.estado === "Reservó" && i.fechaReserva?.slice(0,7) === today().slice(0,7)).length }), [sync.items]);

  if (config && !config.enabled) return <section className="rc-page"><EmptyState icon="settings" title="Recontactos está deshabilitado" description="El Admin General puede habilitar este módulo desde Ajustes." /></section>;
  return <section className="rc-page">
    <PageHeader title="Recontactos de Cumpleaños" subtitle="Seguimiento diario de consultas pendientes, respuestas y reservas." action={<Button icon="refresh" loading={sync.syncing} onClick={() => void sync.refresh(false)}>Actualizar</Button>} />
    <div className="rc-toolbar"><div>{branches.length > 1 && <Select value={branchId || ""} onChange={(e) => setBranchId(e.target.value)} aria-label="Sucursal">{branches.map((b) => <option key={b.branchId} value={b.branchId}>{b.branchName}</option>)}</Select>}</div><div className={`rc-sync ${sync.error ? "is-error" : ""}`}><span />{sync.error ? <>No se pudo sincronizar <button onClick={() => void sync.refresh(false)}>Reintentar</button></> : sync.syncing ? "Actualizando..." : sync.lastSyncedAt ? `Sincronizado hace ${Math.max(0, Math.floor((now-sync.lastSyncedAt.getTime())/1000))} s` : "Esperando sincronización"}</div></div>
    {bootError ? <EmptyState icon="refresh" title="Error de sincronización" description={bootError} /> : !branchId ? <EmptyState icon="settings" title="No hay sucursales disponibles" description="Tu usuario no tiene una sucursal habilitada." /> : !branch?.active ? <EmptyState icon="settings" title="La sucursal está deshabilitada para Recontactos" description="El Admin General puede habilitarla desde Ajustes sin perder la planilla vinculada." /> : !branch?.sheetId ? <EmptyState icon="settings" title="Esta sucursal todavía no tiene una planilla configurada" description="Configurá el Sheet de la sucursal desde Ajustes." /> : <>
      <div className="rc-metrics">{[["Para contactar hoy",metrics.today],["Esperando respuesta",metrics.waiting],["Interesados",metrics.interested],["Recuperados este mes",metrics.recovered]].map(([label,value]) => <div key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <div className="rc-filters"><div className="rc-tabs">{([["all","Todos"],["today","Para hoy"],["unanswered","Sin respuesta"],["interested","Interesados"]] as [Filter,string][]).map(([key,label]) => <button key={key} className={filter === key ? "is-active" : ""} onClick={() => setFilter(key)}>{label}</button>)}</div><SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar cliente o teléfono..." /></div>
      <div className="rc-table-wrap"><table className="rc-table"><thead><tr>{["Cliente","Festejo","Invitados","Salas","Presupuesto","Última gestión","Próximo contacto","Estado","Acciones"].map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{sync.loading ? Array.from({length:5}).map((_,i) => <tr key={i} className="rc-skeleton">{Array.from({length:9}).map((__,j) => <td key={j}><span /></td>)}</tr>) : shown.map((item) => <tr key={item.id}><td><button className="rc-client" onClick={() => setSelected(item)}><b>{item.nombre}</b><span>{item.whatsapp}</span></button></td><td>{formatDate(item.fechaFestejo)}<small>{item.edad ? `${item.edad} años` : ""}</small></td><td>{item.invitados ?? "—"}</td><td><RoomsPopover rooms={item.salas} /></td><td>{item.presupuesto || "—"}</td><td>{formatDateTime(item.ultimaGestion)}<small>{item.resultadoUltimaGestion || ""}</small></td><td>{formatDate(item.proximoRecontacto)}</td><td><Badge tone={toneFor(item.estado)} small>{item.estado}</Badge></td><td><div className="rc-actions"><button className="rc-whatsapp" title="Contactar por WhatsApp" aria-label="Contactar por WhatsApp" onClick={() => { if (!config || !branch) return; window.open(whatsappUrl(item.whatsapp, renderWhatsappTemplate(config.whatsappTemplate,item,branch.branchName)), "_blank", "noopener,noreferrer"); setStarted((s) => new Set(s).add(item.id)); }}>💬</button><button onClick={() => setSelected(item)} title="La escritura queda preparada para la próxima etapa">{started.has(item.id) ? "Gestión iniciada" : "Ver detalle"}</button></div></td></tr>)}</tbody></table>{!sync.loading && shown.length === 0 && <EmptyState icon="search" title={sync.items.length ? "No hay resultados para estos filtros" : "No hay registros"} description={sync.items.length ? "Probá cambiando la búsqueda o los filtros." : "Los nuevos registros aparecerán cuando lleguen a la planilla."} />}</div>
    </>}
    {selected && <ManagementDrawer item={sync.items.find((i) => i.id === selected.id) || selected} saving={sync.savingId === selected.id} onClose={() => setSelected(null)} onSave={async (changes) => { try { await sync.save(selected.id, changes); toast("success","Gestión registrada y sincronizada"); setSelected(null); } catch(e) { toast("error", e instanceof Error ? e.message : "Error al guardar"); } }} />}
    <ToastStack toasts={toasts} onDismiss={dismiss} />
  </section>;
}
