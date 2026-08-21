import { useEffect, useMemo, useState } from "react";

import { Button, Card, Input, PageHeader, Select, Toggle } from "../../ui";
import Modal from "../../ui/Modal";
import { ToastStack, useToasts } from "../../components/Toast";
import {
  DEFAULT_COTIZADOR_CONFIG,
  PROMO_LABELS,
  cotizarEscaparty,
  cotizarJuegoSocial,
  diagnosticarEscalera,
  formatARS,
  formatPct,
  tamanosSocial,
  type CotizadorConfig,
  type EscapartyConfig,
  type PromoKey,
} from "../../lib/cotizador";
import {
  esEdad,
  esModalidad,
  esPromo,
  esTipo,
  guardarBorrador,
  leerBorrador,
  tieneTexto,
  type Borrador,
  type Modalidad,
  type RangoEdad,
  type TipoEvento,
} from "../../lib/cotizadorBorrador";
import {
  fetchIntranetConfig,
  saveCotizadorConfig,
  saveQuoteResponseTemplates,
  type IntranetConfig,
} from "../../lib/intranetConfig";
import {
  getQuoteResponseTemplateKey,
  type QuoteResponseTemplateKey,
  type QuoteResponseValues,
} from "../../lib/quoteResponseTemplates";
import QuoteResponsePanel from "./QuoteResponsePanel";

/**
 * Cotizador de la Intranet.
 *
 * Dos reglas de interfaz que mandan sobre todo lo demás:
 *
 * 1. Ningún campo aparece ni desaparece. Lo que no aplica se deshabilita en
 *    gris con un texto al lado que dice por qué. El asesor ve siempre el
 *    formulario completo, así no aprende una pantalla que se mueve sola.
 * 2. Los avisos viven en bloques con alto reservado, así el total no salta
 *    cuando cambian.
 *
 * Los valores base salen de `intranet_config` (compartidos por el equipo) y
 * solo los edita `is_super`. El gate de acá es cosmético: la escritura real la
 * frena la RLS + la RPC.
 */

type AvisoTono = "info" | "warning" | "danger";
type Aviso = { tono: AvisoTono; texto: string };

/** Tope de los contadores de acompañantes. Nada que ver con el aforo. */
const MAX_ACOMPANANTES = 60;
/** Tope del campo de mínimo por promoción en el editor. */
const MAX_MINIMO_PROMO = 60;
/**
 * Escaparty NO tiene tope de invitados por reglas de negocio: el aforo avisa
 * pero no frena. Este número es solo un freno de sanidad para que un tipeo no
 * dispare una cotización absurda.
 */
const MAX_INVITADOS = 500;

/* ============================================================
   Helpers de campos numéricos

   Se guardan como string para que el asesor pueda borrar el campo y escribir
   de nuevo sin que se le meta un 0 de prepo. El clamp se aplica al calcular y
   al salir del campo.
   ============================================================ */

function parseCantidad(raw: string, min: number, max: number): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}

/* ============================================================
   Bloques con alto reservado
   ============================================================ */

/** Cartel al lado del tipo de evento. Ocupa siempre el mismo espacio: solo
 *  cambia el texto y el color. */
function CartelSala({ tono, texto }: { tono: "warning" | "muted"; texto: string }) {
  return (
    <div className={`eg-cotizador__sala is-${tono}`} aria-live="polite">
      {texto}
    </div>
  );
}

function Avisos({ avisos }: { avisos: Aviso[] }) {
  return (
    <div className="eg-cotizador__avisos" aria-live="polite">
      {avisos.map((aviso) => (
        <p key={aviso.texto} className={`eg-cotizador__aviso is-${aviso.tono}`}>
          {aviso.texto}
        </p>
      ))}
    </div>
  );
}

/* ============================================================
   Editor del decremento

   Cambiar el decremento no mueve $100: mueve el descuento efectivo del último
   escalón. Quien edita tiene que ver la consecuencia antes de guardar.
   ============================================================ */

function PreviewEscalera({ cfg }: { cfg: EscapartyConfig }) {
  const d = diagnosticarEscalera(cfg);

  return (
    <div className="eg-cotizador-preview">
      <table className="eg-cotizador-preview__tabla">
        <thead>
          <tr>
            <th />
            <th>{cfg.minimoPersonas} pers.</th>
            <th>{d.topeEscalera} pers.</th>
            <th>Total en {d.topeEscalera}</th>
            <th>Dto. efectivo</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Menores</th>
            <td>{formatARS(d.precioMinMenores)}</td>
            <td>{formatARS(d.precioMaxMenores)}</td>
            <td>{formatARS(d.totalMaxMenores)}</td>
            <td>{formatPct(d.descuentoEfectivoMenores)}</td>
          </tr>
          <tr>
            <th scope="row">Adultos</th>
            <td>{formatARS(d.precioMinAdultos)}</td>
            <td>{formatARS(d.precioMaxAdultos)}</td>
            <td>{formatARS(d.totalMaxAdultos)}</td>
            <td>{formatPct(d.descuentoEfectivoAdultos)}</td>
          </tr>
        </tbody>
      </table>

      {d.errores.map((error) => (
        <p key={error} className="eg-cotizador-preview__error">{error}</p>
      ))}

      {d.quiebreMarginal !== null ? (
        <p className="eg-cotizador-preview__error">
          Con este decremento, a partir de <strong>{d.quiebreMarginal} personas</strong> sumar un
          invitado <strong>baja</strong> el total facturado
          {d.quiebreEn === "adultos" ? " (tarifa adulto)" : " (tarifa menores)"}. Bajá el
          decremento o el tope de escalera: una vez congelado el precio, sumar invitados siempre
          aumenta el total.
        </p>
      ) : (
        <p className="eg-cotizador-preview__ok">
          Escalera sana: en todo el rango {cfg.minimoPersonas}–{d.topeEscalera}, sumar un invitado
          siempre aumenta el total. Pasado el tope el precio queda congelado, así que sigue
          aumentando.
        </p>
      )}
    </div>
  );
}

/* ============================================================
   Modal de valores base (solo Admin General)
   ============================================================ */

/**
 * Se monta recién al abrir (ver el `modalOpen &&` de abajo), así el borrador
 * arranca de la config vigente sin necesidad de un efecto que lo resincronice.
 */
function ValoresBaseModal({
  config,
  preciosConfirmados,
  saving,
  onClose,
  onSave,
}: {
  config: CotizadorConfig;
  preciosConfirmados: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (next: CotizadorConfig, confirmados: boolean) => void;
}) {
  const [draft, setDraft] = useState<CotizadorConfig>(config);
  const [confirmados, setConfirmados] = useState(preciosConfirmados);

  const numero = (raw: string): number => {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const patchEsc = (patch: Partial<EscapartyConfig>) =>
    setDraft((prev) => ({ ...prev, escaparty: { ...prev.escaparty, ...patch } }));

  const patchPrecioSocial = (personas: number, precio: number) =>
    setDraft((prev) => ({
      ...prev,
      juegoSocial: {
        ...prev.juegoSocial,
        precios: prev.juegoSocial.precios.map((fila) =>
          fila.personas === personas ? { ...fila, precio } : fila
        ),
      },
    }));

  const patchPromo = (key: PromoKey, patch: Partial<{ descuento: number; minimo: number }>) =>
    setDraft((prev) => ({
      ...prev,
      juegoSocial: {
        ...prev.juegoSocial,
        promos: { ...prev.juegoSocial.promos, [key]: { ...prev.juegoSocial.promos[key], ...patch } },
      },
    }));

  const diagnostico = diagnosticarEscalera(draft.escaparty);
  const bloqueado = diagnostico.quiebreMarginal !== null || diagnostico.errores.length > 0;

  return (
    <Modal
      open
      title="Valores base del cotizador"
      description="Estos valores los ve todo el equipo. Un cambio acá impacta en la próxima recarga del resto."
      size="lg"
      panelClassName="eg-cotizador-modal"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={bloqueado}
            title={bloqueado ? "Corregí la escalera antes de guardar" : undefined}
            onClick={() => onSave(draft, confirmados)}
          >
            Guardar valores
          </Button>
        </>
      }
    >
      <div className="eg-cotizador-form">
        <section className="eg-cotizador-form__section">
          <div className="eg-cotizador-form__heading">
            <strong>Tamaño del grupo</strong>
            <span>El tope de descuento y el aforo son dos cosas distintas.</span>
          </div>
          <div className="eg-cotizador-form__grid">
            <Input
              id="vb-min" label="Mínimo de personas" type="number" min={1}
              value={String(draft.escaparty.minimoPersonas)}
              onChange={(e) => patchEsc({ minimoPersonas: numero(e.target.value) })}
            />
            <Input
              id="vb-congela"
              label="Congela desde (tope de descuento)"
              hint="Pasado este tamaño el precio por persona no baja más, pero se sigue facturando por la cantidad real."
              type="number" min={1}
              value={String(draft.escaparty.congelaDesdePersonas)}
              onChange={(e) => patchEsc({ congelaDesdePersonas: numero(e.target.value) })}
            />
            <Input
              id="vb-max"
              label="Aforo del local"
              hint="0 = sin definir. No frena el cálculo: el cotizador avisa al superarlo y sigue cotizando."
              type="number" min={0}
              value={String(draft.escaparty.maximoPersonas)}
              onChange={(e) => patchEsc({ maximoPersonas: numero(e.target.value) })}
            />
          </div>
        </section>

        <section className="eg-cotizador-form__section">
          <div className="eg-cotizador-form__heading">
            <strong>Escalera de precios</strong>
            <span>Las dos bases se cargan por separado; el decremento es plano y común a ambas.</span>
          </div>
          <div className="eg-cotizador-form__grid">
            <Input
              id="vb-base-menores" label="Base menores" type="number" min={0}
              value={String(draft.escaparty.baseMenores)}
              onChange={(e) => patchEsc({ baseMenores: numero(e.target.value) })}
            />
            <Input
              id="vb-base-adultos"
              label="Base adultos"
              hint="Valor propio, no se deriva de la base de menores."
              type="number" min={0}
              value={String(draft.escaparty.baseAdultos)}
              onChange={(e) => patchEsc({ baseAdultos: numero(e.target.value) })}
            />
            <Input
              id="vb-decremento"
              label="Decremento por persona"
              hint="En pesos, plano, el mismo para menores y adultos."
              type="number" min={0}
              value={String(draft.escaparty.decrementoPorPersona)}
              onChange={(e) => patchEsc({ decrementoPorPersona: numero(e.target.value) })}
            />
            <div className="eg-cotizador-form__spacer" aria-hidden="true" />
            <div className="eg-cotizador-form__wide">
              <PreviewEscalera cfg={draft.escaparty} />
            </div>
          </div>
        </section>

        <section className="eg-cotizador-form__section">
          <div className="eg-cotizador-form__heading">
            <strong>Acompañantes y anticipo</strong>
            <span>Los porcentajes se aplican al precio de invitado de cada cotización.</span>
          </div>
          <div className="eg-cotizador-form__grid">
            <Input
              id="vb-pct-con-gastro"
              label="Acompañante con gastronomía — %"
              type="number" min={0} max={100}
              value={String(draft.escaparty.pctAcompananteConGastronomia)}
              onChange={(e) => patchEsc({ pctAcompananteConGastronomia: numero(e.target.value) })}
            />
            <Input
              id="vb-pct-sin-gastro"
              label="Acompañante sin gastronomía — %"
              hint="En 0 no suman al total."
              type="number" min={0} max={100}
              value={String(draft.escaparty.pctAcompananteSinGastronomia)}
              onChange={(e) => patchEsc({ pctAcompananteSinGastronomia: numero(e.target.value) })}
            />
            <Input
              id="vb-anticipo" label="Anticipo" type="number" min={0}
              value={String(draft.escaparty.anticipo)}
              onChange={(e) => patchEsc({ anticipo: numero(e.target.value) })}
            />
          </div>
        </section>

        <section className="eg-cotizador-form__section">
          <div className="eg-cotizador-form__heading">
            <strong>Juego social</strong>
            <span>Precio por jugador y condiciones de cada promoción.</span>
          </div>
          <div className="eg-cotizador-form__grid">
            <div className="eg-cotizador-form__wide">
              <span className="eg-field__label">Precio por tamaño de grupo</span>
              <p className="eg-cotizador-form__nota">
                Precio total del grupo, no por cabeza. Es sobre este valor que se aplica el
                descuento de la promoción.
              </p>
              <div className="eg-cotizador-precios">
                {draft.juegoSocial.precios.map((fila) => (
                  <Input
                    key={fila.personas}
                    id={`vb-soc-${fila.personas}`}
                    label={`${fila.personas} participantes`}
                    type="number" min={0}
                    value={String(fila.precio)}
                    onChange={(e) => patchPrecioSocial(fila.personas, numero(e.target.value))}
                  />
                ))}
              </div>
            </div>

            <Input
              id="vb-pack-desc" label="Pack familiar — descuento %" type="number" min={0} max={100}
              value={String(draft.juegoSocial.promos.pack_familiar.descuento)}
              onChange={(e) => patchPromo("pack_familiar", { descuento: numero(e.target.value) })}
            />
            <Input
              id="vb-pack-min" label="Pack familiar — mínimo" type="number" min={0} max={MAX_MINIMO_PROMO}
              value={String(draft.juegoSocial.promos.pack_familiar.minimo)}
              onChange={(e) => patchPromo("pack_familiar", { minimo: numero(e.target.value) })}
            />
            <Input
              id="vb-amigos-desc" label="Promo amigos — descuento %" type="number" min={0} max={100}
              value={String(draft.juegoSocial.promos.promo_amigos.descuento)}
              onChange={(e) => patchPromo("promo_amigos", { descuento: numero(e.target.value) })}
            />
            <Input
              id="vb-amigos-min" label="Promo amigos — mínimo" type="number" min={0} max={MAX_MINIMO_PROMO}
              value={String(draft.juegoSocial.promos.promo_amigos.minimo)}
              onChange={(e) => patchPromo("promo_amigos", { minimo: numero(e.target.value) })}
            />
          </div>
        </section>

        <section className="eg-cotizador-form__section eg-cotizador-form__section--flag">
          <div className="eg-cotizador-form__heading">
            <strong>Estado de los precios</strong>
            <span>
              Mientras esté apagado, el cotizador muestra la banda roja “Precios de ejemplo” a
              todo el equipo.
            </span>
          </div>
          <Toggle
            label={confirmados ? "Precios confirmados" : "Precios sin confirmar"}
            description={
              confirmados
                ? "El cotizador se puede usar con clientes."
                : "El cotizador avisa que no se debe cotizar en vivo."
            }
            checked={confirmados}
            onChange={(e) => setConfirmados(e.target.checked)}
          />
        </section>
      </div>
    </Modal>
  );
}

/* ============================================================
   Sección
   ============================================================ */

export default function CotizadorSection() {
  const { toasts, toast, dismiss } = useToasts();

  // Mismo idioma que Users.tsx y News.tsx. Solo decide qué se dibuja: la
  // escritura la valida el servidor.
  const [puedeEditar] = useState(
    () =>
      localStorage.getItem("eg_admin_is_super") === "true" ||
      localStorage.getItem("eg_admin_role") === "ADMIN_GENERAL"
  );

  const [config, setConfig] = useState<IntranetConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Lo que el asesor dejó a medio cargar la última vez. Se lee una sola vez,
  // al montar; después manda el estado de React.
  const [borrador] = useState(leerBorrador);

  const [tipo, setTipo] = useState<TipoEvento>(() =>
    esTipo(borrador.tipo) ? borrador.tipo : "escaparty"
  );
  const [modalidad, setModalidad] = useState<Modalidad>(() =>
    esModalidad(borrador.modalidad) ? borrador.modalidad : "infantil"
  );
  const [edad, setEdad] = useState<RangoEdad>(() =>
    esEdad(borrador.edad) ? borrador.edad : "10-12"
  );
  const [invitados, setInvitados] = useState(() =>
    tieneTexto(borrador.invitados) ? borrador.invitados : ""
  );
  const [sinGastronomia, setSinGastronomia] = useState(() =>
    tieneTexto(borrador.sinGastronomia) ? borrador.sinGastronomia : "0"
  );
  const [conGastronomia, setConGastronomia] = useState(() =>
    tieneTexto(borrador.conGastronomia) ? borrador.conGastronomia : "1"
  );
  const [promo, setPromo] = useState<PromoKey>(() =>
    esPromo(borrador.promo) ? borrador.promo : "pack_familiar"
  );
  const [participantes, setParticipantes] = useState(() =>
    tieneTexto(borrador.participantes) ? borrador.participantes : ""
  );

  useEffect(() => {
    let mounted = true;

    fetchIntranetConfig()
      .then((next) => {
        if (!mounted) return;
        setConfig(next);

        // Los defaults salen de la config, no de números escritos en el
        // código. Solo se aplican si el borrador no traía nada: si el asesor
        // ya había cargado un valor, ese manda.
        if (!tieneTexto(borrador.invitados)) {
          setInvitados(String(next.cotizador.escaparty.minimoPersonas));
        }

        if (!tieneTexto(borrador.participantes)) {
          const tamanosCargados = tamanosSocial(next.cotizador.juegoSocial);
          const minimoPromo = next.cotizador.juegoSocial.promos.pack_familiar.minimo;
          const inicial =
            tamanosCargados.find((n) => n >= minimoPromo) ?? tamanosCargados[0] ?? 0;
          setParticipantes(String(inicial));
        }
      })
      .catch((error: unknown) => {
        if (mounted) {
          setLoadError(error instanceof Error ? error.message : "No se pudo cargar la configuración");
        }
      });

    return () => {
      mounted = false;
    };
    // `borrador` se lee una única vez al montar y nunca cambia de identidad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persiste el borrador con cada cambio. Es lo único que se guarda del lado
  // del navegador; los precios nunca.
  useEffect(() => {
    const actual: Borrador = {
      tipo,
      modalidad,
      edad,
      invitados,
      sinGastronomia,
      conGastronomia,
      promo,
      participantes,
    };

    guardarBorrador(actual);
  }, [tipo, modalidad, edad, invitados, sinGastronomia, conGastronomia, promo, participantes]);

  const precios = config?.cotizador ?? DEFAULT_COTIZADOR_CONFIG;
  const esc = precios.escaparty;

  // Sin tope superior: el aforo avisa, no frena. El clamp solo sostiene el
  // mínimo, que sí es una regla de facturación.
  const nInvitados = parseCantidad(invitados, esc.minimoPersonas, MAX_INVITADOS);
  const nSinGastro = parseCantidad(sinGastronomia, 0, MAX_ACOMPANANTES);
  const nConGastro = parseCantidad(conGastronomia, 0, MAX_ACOMPANANTES);

  const tamanos = useMemo(() => tamanosSocial(precios.juegoSocial), [precios]);
  // El valor del desplegable siempre es uno de los tamaños con precio; si la
  // tabla cambió y el elegido ya no existe, cae al primero disponible.
  const nParticipantes = useMemo(() => {
    const elegido = Number.parseInt(participantes, 10);
    return tamanos.includes(elegido) ? elegido : (tamanos[0] ?? 0);
  }, [participantes, tamanos]);

  const esInfantil = modalidad === "infantil";
  const requiereAdultoEnSala = esInfantil && edad === "10-12";
  /** Adultos que efectivamente entran a la sala acompañando. */
  const acompanantesEnSala = nSinGastro + nConGastro;

  const cotiEscaparty = useMemo(
    () =>
      cotizarEscaparty(
        {
          invitados: nInvitados,
          acompanantesSinGastronomia: nSinGastro,
          acompanantesConGastronomia: nConGastro,
          modalidad: esInfantil ? "menores" : "adultos",
        },
        esc
      ),
    [nInvitados, nSinGastro, nConGastro, esInfantil, esc]
  );

  const cotiSocial = useMemo(
    () => cotizarJuegoSocial(nParticipantes, promo, precios.juegoSocial),
    [nParticipantes, promo, precios]
  );

  /** Texto del cartel al lado del tipo de evento. Siempre ocupa el mismo lugar. */
  const cartel = useMemo<{ tono: "warning" | "muted"; texto: string }>(() => {
    if (tipo !== "escaparty") return { tono: "muted", texto: "Sin requisito de adulto en sala." };
    if (!esInfantil) return { tono: "muted", texto: "Modalidad adulto: no aplica." };
    return requiereAdultoEnSala
      ? { tono: "warning", texto: "Es requisito 1 adulto dentro de la sala" }
      : { tono: "muted", texto: "Adulto dentro de la sala opcional" };
  }, [tipo, esInfantil, requiereAdultoEnSala]);

  const avisos = useMemo<Aviso[]>(() => {
    const out: Aviso[] = [];

    if (tipo === "escaparty") {
      if (requiereAdultoEnSala && acompanantesEnSala === 0) {
        out.push({
          tono: "danger",
          texto: "Falta el adulto responsable: cargá al menos 1 acompañante en la sala.",
        });
      }
      if (cotiEscaparty.superaAforo) {
        out.push({
          tono: "warning",
          texto: `Supera el aforo de ${esc.maximoPersonas} personas. Se cotiza igual: confirmá disponibilidad.`,
        });
      }
      if (cotiEscaparty.facturaPorMinimo) {
        out.push({
          tono: "info",
          texto: `Por debajo del mínimo: se factura por ${esc.minimoPersonas} personas.`,
        });
      }
      if (cotiEscaparty.precioCongelado) {
        out.push({
          tono: "info",
          texto: `Precio congelado en el valor de ${esc.congelaDesdePersonas}: se cobra por ${cotiEscaparty.facturable}.`,
        });
      }
      return out;
    }

    if (!cotiSocial.precioCargado) {
      out.push({
        tono: "warning",
        texto: "Ese tamaño de grupo no tiene precio cargado. El total no es válido.",
      });
    }
    if (cotiSocial.bajoMinimo) {
      out.push({
        tono: "warning",
        texto: `${PROMO_LABELS[promo]} aplica desde ${cotiSocial.minimoRequerido} participantes: con ${nParticipantes} no se aplica el ${precios.juegoSocial.promos[promo].descuento}%.`,
      });
    }
    return out;
  }, [tipo, requiereAdultoEnSala, acompanantesEnSala, cotiEscaparty, esc, cotiSocial, promo, nParticipantes, precios]);

  const guardar = async (next: CotizadorConfig, confirmados: boolean) => {
    setSaving(true);
    try {
      const saved = await saveCotizadorConfig(next, confirmados);
      setConfig((current) => ({
        ...saved,
        responseTemplates: current?.responseTemplates ?? {},
      }));
      setModalOpen(false);
      toast("success", "Valores base actualizados.");
    } catch (error: unknown) {
      toast("error", error instanceof Error ? error.message : "No se pudieron guardar los valores");
    } finally {
      setSaving(false);
    }
  };

  const descuentoTexto =
    promo === "sin_descuento" ? "—" : `${precios.juegoSocial.promos[promo].descuento}%`;

  // La plantilla la elige el mismo formulario que ya está en pantalla: no hay
  // un selector aparte. Escaparty mira modalidad y edad; Juego social, la promo.
  const responseTemplateKey = getQuoteResponseTemplateKey({
    eventType: tipo,
    modality: modalidad,
    ageRange: edad,
    promo,
  });

  /**
   * Las respuestas de promo afirman un descuento, así que solo se arman cuando
   * el motor lo aplicó de verdad. El porcentaje sale de los valores base, nunca
   * del texto de la plantilla: si el motor no descontó, el mensaje mentiría.
   */
  const promoBloqueada: string | null =
    tipo === "escaparty" || !responseTemplateKey
      ? null
      : !cotiSocial.precioCargado
        ? "Ese tamaño de grupo no tiene precio cargado: el total todavía no es válido para enviar."
        : cotiSocial.bajoMinimo
          ? `${PROMO_LABELS[promo]} aplica desde ${cotiSocial.minimoRequerido} participantes: con ${nParticipantes} el total no lleva descuento.`
          : cotiSocial.descuentoAplicado === 0
            ? `${PROMO_LABELS[promo]} está cargada con 0% de descuento en los valores base.`
            : null;

  const sinSignoMoneda = (value: number) => formatARS(value).replace(/^\$\s?/, "");
  // Los importes salen del mismo cálculo que ya muestra el detalle de arriba.
  // No se espera a Supabase: si la config no cargó, el detalle y la respuesta
  // muestran lo mismo, y el panel nunca queda vacío por un error de red.
  const responseValues: QuoteResponseValues | null = tipo === "escaparty"
    ? {
        PRESUPUESTO_TOTAL: sinSignoMoneda(cotiEscaparty.totalEvento),
        VALOR_INVITADO: sinSignoMoneda(cotiEscaparty.precioPorInvitado),
        VALOR_ADULTO: sinSignoMoneda(cotiEscaparty.conGastronomia.precioUnitario),
        ANTICIPO: sinSignoMoneda(cotiEscaparty.anticipo),
        SALDO: sinSignoMoneda(cotiEscaparty.saldoEnLocal),
        CANTIDAD_INVITADOS: String(cotiEscaparty.facturable),
      }
    : promoBloqueada === null
      ? {
          CANTIDAD: String(cotiSocial.personas),
          TOTAL: sinSignoMoneda(cotiSocial.total),
        }
      : null;

  const guardarPlantilla = async (key: QuoteResponseTemplateKey, template: string) => {
    setSavingTemplate(true);
    try {
      const responseTemplates = await saveQuoteResponseTemplates({
        ...(config?.responseTemplates ?? {}),
        [key]: template,
      });
      setConfig((current) => current ? { ...current, responseTemplates } : current);
      toast("success", "Plantilla actualizada.");
    } catch (error: unknown) {
      toast("error", error instanceof Error ? error.message : "No se pudo guardar la plantilla");
      throw error;
    } finally {
      setSavingTemplate(false);
    }
  };

  return (
    <section className="eg-cotizador">
      <PageHeader
        title="Cotizador"
        subtitle="Herramientas de cotización comercial."
        action={
          puedeEditar ? (
            <Button variant="primary" icon="edit" onClick={() => setModalOpen(true)} disabled={!config}>
              Editar valores base
            </Button>
          ) : undefined
        }
      />

      {/* Banda permanente y sin botón de cerrar mientras los precios no estén
          confirmados. Es la única señal que impide cotizar con un cliente
          delante usando números de ejemplo. */}
      {config && !config.preciosConfirmados && (
        <div className="eg-cotizador__banda" role="alert">
          <strong>Precios de ejemplo — no cotizar en vivo</strong>
          <span>
            Los valores cargados son placeholders. El Admin General tiene que confirmarlos desde
            “Editar valores base”.
          </span>
        </div>
      )}

      {loadError && (
        <div className="eg-cotizador__banda" role="alert">
          <strong>No se pudo cargar la configuración</strong>
          <span>{loadError}</span>
        </div>
      )}

      <div className="eg-cotizador__columns">
      <Card padding="lg" className="eg-cotizador__panel">
        <div className="eg-cotizador__cabecera">
          <Select
            id="cot-tipo"
            label="Tipo de evento"
            hint="Define qué campos se cotizan abajo."
            value={tipo}
            onChange={(e) => setTipo(e.target.value === "social" ? "social" : "escaparty")}
          >
            <option value="escaparty">Escaparty</option>
            <option value="social">Juego social</option>
          </Select>

          <CartelSala tono={cartel.tono} texto={cartel.texto} />
        </div>

        <div className="eg-cotizador__sep" aria-hidden="true" />

        {tipo === "escaparty" ? (
          <div className="eg-cotizador__campos">
            <Select
              id="cot-modalidad"
              label="Modalidad"
              hint="Determina qué base de tarifa se usa."
              value={modalidad}
              onChange={(e) => setModalidad(e.target.value === "adulto" ? "adulto" : "infantil")}
            >
              <option value="infantil">Infantil</option>
              <option value="adulto">Adulto</option>
            </Select>

            {/* Se deshabilita, no se oculta: el asesor tiene que ver que el
                campo existe y por qué hoy no aplica. */}
            <Select
              id="cot-edad"
              label="Edad del cumpleañero"
              hint={esInfantil ? "Define el requisito de adulto en sala." : "Solo para modalidad infantil."}
              disabled={!esInfantil}
              value={edad}
              onChange={(e) => setEdad(e.target.value === "13-16" ? "13-16" : "10-12")}
            >
              <option value="10-12">10 a 12 años</option>
              <option value="13-16">13 a 16 años</option>
            </Select>

            <Input
              id="cot-invitados"
              label="Cantidad de invitados"
              hint={`Desde ${esc.minimoPersonas}, sin tope. Incluye al cumpleañero y a cualquier adulto que juegue.`}
              type="number"
              min={esc.minimoPersonas}
              value={invitados}
              onChange={(e) => setInvitados(e.target.value)}
              onBlur={() => setInvitados(String(nInvitados))}
            />

            <Input
              id="cot-sin-gastro"
              label="Acompañantes sin servicio gastronómico"
              hint={
                esc.pctAcompananteSinGastronomia === 0
                  ? "Sin cargo: no suman al total."
                  : `${esc.pctAcompananteSinGastronomia}% del precio de invitado: ${formatARS(cotiEscaparty.sinGastronomia.precioUnitario)} c/u.`
              }
              type="number"
              min={0}
              max={MAX_ACOMPANANTES}
              value={sinGastronomia}
              onChange={(e) => setSinGastronomia(e.target.value)}
              onBlur={() => setSinGastronomia(String(nSinGastro))}
            />

            <Input
              id="cot-con-gastro"
              label="Acompañantes con servicio gastronómico"
              hint={`${esc.pctAcompananteConGastronomia}% del precio de invitado: ${formatARS(cotiEscaparty.conGastronomia.precioUnitario)} c/u.`}
              type="number"
              min={0}
              max={MAX_ACOMPANANTES}
              value={conGastronomia}
              onChange={(e) => setConGastronomia(e.target.value)}
              onBlur={() => setConGastronomia(String(nConGastro))}
            />
          </div>
        ) : (
          <div className="eg-cotizador__campos">
            <Select
              id="cot-promo"
              label="Promoción"
              hint="Define el descuento y el mínimo de jugadores."
              value={promo}
              onChange={(e) => setPromo(e.target.value as PromoKey)}
            >
              <option value="pack_familiar">Pack familiar</option>
              <option value="promo_amigos">Promo amigos</option>
              <option value="sin_descuento">Sin descuento</option>
            </Select>

            {/* Solo lectura: lo fija la promoción, no el asesor. */}
            <Input
              id="cot-descuento"
              label="Descuento"
              hint="Lo define la promoción. No se edita a mano."
              className="eg-cotizador__readonly"
              readOnly
              value={descuentoTexto}
            />

            {/* Desplegable, no numérico: el precio sale de una tabla cerrada,
                así que solo existen los tamaños que tienen fila. */}
            <Select
              id="cot-participantes"
              label="Cantidad de participantes"
              hint={
                tamanos.length
                  ? "Cada tamaño tiene su precio de lista."
                  : "Sin precios cargados todavía."
              }
              disabled={!tamanos.length}
              value={String(nParticipantes)}
              onChange={(e) => setParticipantes(e.target.value)}
            >
              {tamanos.length ? (
                tamanos.map((n) => (
                  <option key={n} value={String(n)}>
                    {n} participantes
                  </option>
                ))
              ) : (
                <option value="0">—</option>
              )}
            </Select>
          </div>
        )}

        <Avisos avisos={avisos} />

        <div className="eg-cotizador__total">
          {tipo === "escaparty" ? (
            <>
              <ul className="eg-cotizador__detalle">
                <li>
                  <span>
                    Invitados ({cotiEscaparty.facturable} × {formatARS(cotiEscaparty.precioPorInvitado)})
                  </span>
                  <strong>{formatARS(cotiEscaparty.subtotalInvitados)}</strong>
                </li>
                <li>
                  <span>
                    Acompañantes sin gastronomía ({cotiEscaparty.sinGastronomia.cantidad} ×{" "}
                    {formatARS(cotiEscaparty.sinGastronomia.precioUnitario)} ·{" "}
                    {cotiEscaparty.sinGastronomia.pct}%)
                  </span>
                  <strong>{formatARS(cotiEscaparty.sinGastronomia.subtotal)}</strong>
                </li>
                <li>
                  <span>
                    Acompañantes con gastronomía ({cotiEscaparty.conGastronomia.cantidad} ×{" "}
                    {formatARS(cotiEscaparty.conGastronomia.precioUnitario)} ·{" "}
                    {cotiEscaparty.conGastronomia.pct}%)
                  </span>
                  <strong>{formatARS(cotiEscaparty.conGastronomia.subtotal)}</strong>
                </li>
              </ul>

              <div className="eg-cotizador__total-final">
                <span>Total del evento</span>
                <strong>{formatARS(cotiEscaparty.totalEvento)}</strong>
              </div>

              <ul className="eg-cotizador__detalle eg-cotizador__detalle--cierre">
                <li>
                  <span>Anticipo</span>
                  <strong>− {formatARS(cotiEscaparty.anticipo)}</strong>
                </li>
                <li>
                  <span>Saldo en el local</span>
                  <strong>{formatARS(cotiEscaparty.saldoEnLocal)}</strong>
                </li>
              </ul>
            </>
          ) : (
            <>
              <ul className="eg-cotizador__detalle">
                <li>
                  <span>
                    Grupo de {cotiSocial.personas} participantes (
                    {formatARS(cotiSocial.precioPorParticipante)} c/u)
                  </span>
                  <strong>{formatARS(cotiSocial.subtotal)}</strong>
                </li>
                <li>
                  <span>Descuento aplicado ({cotiSocial.descuentoAplicado}%)</span>
                  <strong>
                    {cotiSocial.montoDescuento
                      ? `− ${formatARS(cotiSocial.montoDescuento)}`
                      : formatARS(0)}
                  </strong>
                </li>
              </ul>

              <div className="eg-cotizador__total-final">
                <span>Total</span>
                <strong>{formatARS(cotiSocial.total)}</strong>
              </div>
            </>
          )}
        </div>
      </Card>

      <QuoteResponsePanel
        templateKey={responseTemplateKey}
        templates={config?.responseTemplates ?? {}}
        values={responseValues}
        emptyReason={promoBloqueada}
        canEdit={puedeEditar}
        saving={savingTemplate}
        onSave={guardarPlantilla}
      />
      </div>

      {puedeEditar && config && modalOpen && (
        <ValoresBaseModal
          config={config.cotizador}
          preciosConfirmados={config.preciosConfirmados}
          saving={saving}
          onClose={() => setModalOpen(false)}
          onSave={guardar}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </section>
  );
}
