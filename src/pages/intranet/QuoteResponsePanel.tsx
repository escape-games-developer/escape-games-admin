import { useEffect, useRef, useState } from "react";
import { Button, Card } from "../../ui";
import Modal from "../../ui/Modal";
import {
  DEFAULT_QUOTE_RESPONSE_TEMPLATES, QUOTE_RESPONSE_TEMPLATE_DEFS, renderQuoteResponse,
  resolveQuoteResponseTemplate, validateQuoteResponseTemplate,
  type QuoteResponseTemplateKey, type QuoteResponseTemplates, type QuoteResponseToken,
  type QuoteResponseValues,
} from "../../lib/quoteResponseTemplates";

const LABELS: Record<QuoteResponseToken, string> = { PRESUPUESTO_TOTAL: "Presupuesto total", VALOR_INVITADO: "Valor invitado", VALOR_ADULTO: "Valor adulto", ANTICIPO: "Anticipo", SALDO: "Saldo", CANTIDAD_INVITADOS: "Cantidad invitados", CANTIDAD: "Cantidad de personas", TOTAL: "Total con descuento" };
const VACIO = "Completá los datos del cotizador para generar automáticamente la respuesta.";

/** `emptyReason` explica por qué no hay respuesta cuando el motivo no es obvio. */
type Props = { templateKey: QuoteResponseTemplateKey | null; templates: QuoteResponseTemplates; values: QuoteResponseValues | null; emptyReason?: string | null; canEdit: boolean; saving: boolean; onSave: (key: QuoteResponseTemplateKey, template: string) => Promise<void> };

export default function QuoteResponsePanel({ templateKey, templates, values, emptyReason, canEdit, saving, onSave }: Props) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<number | null>(null);
  useEffect(() => () => { if (timerRef.current !== null) window.clearTimeout(timerRef.current); }, []);

  // Toda la parte variable del panel (rótulo, ficha y variables insertables)
  // sale de la definición: sumar una promo no toca este componente.
  const def = templateKey ? QUOTE_RESPONSE_TEMPLATE_DEFS[templateKey] : null;
  const template = templateKey ? resolveQuoteResponseTemplate(templates, templateKey) : null;
  const response = template && values ? renderQuoteResponse(template, values) : null;
  const openEditor = () => { if (template) { setDraft(template); setError(null); setEditing(true); } };
  const insertToken = (token: QuoteResponseToken) => {
    const start = textareaRef.current?.selectionStart ?? draft.length;
    const end = textareaRef.current?.selectionEnd ?? draft.length;
    setDraft(`${draft.slice(0, start)}[${token}]${draft.slice(end)}`);
    requestAnimationFrame(() => { textareaRef.current?.focus(); textareaRef.current?.setSelectionRange(start + token.length + 2, start + token.length + 2); });
  };
  const save = async () => {
    if (!templateKey) return;
    const validation = validateQuoteResponseTemplate(draft, templateKey);
    if (validation) { setError(validation); return; }
    try { await onSave(templateKey, draft.trim()); setEditing(false); } catch { /* toast lives in parent */ }
  };
  const copy = async () => {
    if (!response) return;
    await navigator.clipboard.writeText(response);
    setCopied(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 1800);
  };

  return <>
    <Card padding="lg" className="eg-cotizador-respuesta">
      <div className="eg-cotizador-respuesta__header"><div><h2>Respuesta para enviar</h2><p>{def ? `${def.name} · se actualiza automáticamente con la cotización.` : "Se actualiza automáticamente con la cotización."}</p></div>{canEdit && templateKey && <Button size="sm" variant="ghost" icon="edit" onClick={openEditor}>Editar plantilla</Button>}</div>
      <div className={`eg-cotizador-respuesta__preview${response ? "" : " is-empty"}`} aria-live="polite">{response ? <p>{response}</p> : <p>{emptyReason ?? VACIO}</p>}</div>
      <Button variant="primary" fullWidth disabled={!response} onClick={() => void copy()}>{copied ? "✓ Respuesta copiada" : "📋 Copiar respuesta"}</Button>
    </Card>
    {canEdit && templateKey && def && editing && <Modal open title="Editar plantilla" description="El texto se comparte con todos los GM. Los importes siempre se completan desde el cotizador." size="md" panelClassName="eg-cotizador-template-modal" onClose={() => setEditing(false)} footer={<><Button onClick={() => setEditing(false)} disabled={saving}>Cancelar</Button><Button onClick={() => { setDraft(DEFAULT_QUOTE_RESPONSE_TEMPLATES[templateKey]); setError(null); }} disabled={saving}>Restaurar plantilla original</Button><Button variant="primary" loading={saving} onClick={() => void save()}>Guardar plantilla</Button></>}>
      <dl className="eg-cotizador-template__meta">{def.meta.map((fila) => <div key={fila.label}><dt>{fila.label}</dt><dd>{fila.value}</dd></div>)}</dl>
      <label className="eg-field__label" htmlFor="quote-template">Mensaje</label>
      <textarea ref={textareaRef} id="quote-template" className="eg-cotizador-template__textarea" value={draft} onChange={(event) => { setDraft(event.target.value); setError(null); }} />
      <div className="eg-cotizador-template__tokens" aria-label="Insertar variable">{def.allowedTokens.map((token) => <button type="button" key={token} onClick={() => insertToken(token)}>+ {LABELS[token]}</button>)}</div>
      {error && <p className="eg-cotizador-template__error" role="alert">{error}</p>}
    </Modal>}
  </>;
}
