import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Modal, PageHeader, SearchInput } from "../../ui";
import "./RespondioGuide.css";

type Tone = "info" | "important" | "danger" | "success";
type Shot = { src: string; alt: string };

const indexItems = [
  ["pantalla", "1. Reconocer la pantalla", "vista general zonas"], ["buzones", "2. Buzones", "nueva consulta asesoramiento cumpleaños Metapark"],
  ["conversaciones", "3. Lista de conversaciones", "mensajes pendientes filtro"], ["cliente", "4. Información del cliente", "contacto etiquetas sucursal canales"],
  ["asignacion", "5. Quién tiene la conversación", "asesor IA"], ["asumir", "6. Asumir una conversación", "control IA"],
  ["responder", "7. Responder al cliente", "fragmentos respuestas rápidas asistente IA"], ["whatsapp", "8. Respond.io vs WhatsApp", "WhatsApp Business entrantes"],
  ["estado", "9. Cambiar estado", "asesoramiento no interesa presupuesto"], ["venta", "10. Cerrar una venta", "Vendido cumpleaños reservado juego social"],
  ["24-horas", "11. Ventana de 24 horas", "cierre automático"], ["recontactaciones", "12. Recontactaciones", "reconfirmaciones asignarse"],
] as const;

function Notice({ tone = "info", title, children }: { tone?: Tone; title: string; children: ReactNode }) {
  return <aside className={`rg-notice rg-notice--${tone}`}><strong>{title}</strong><div>{children}</div></aside>;
}

function Steps({ items }: { items: ReactNode[] }) {
  return <ol className="rg-steps">{items.map((item, index) => <li key={index}><span>PASO {index + 1}</span><div>{item}</div></li>)}</ol>;
}

function Screenshot({ shot, onOpen }: { shot: Shot; onOpen: (shot: Shot) => void }) {
  const [missing, setMissing] = useState(false);
  if (missing) return <div className="rg-shot-missing" role="status"><strong>Captura pendiente</strong><span>{shot.alt}</span><code>{shot.src}</code></div>;
  return <button className="rg-shot" type="button" onClick={() => onOpen(shot)} aria-label={`Ampliar: ${shot.alt}`}><img src={shot.src} alt={shot.alt} onError={() => setMissing(true)} /><span>Hacé clic para ampliar</span></button>;
}

function Section({ id, title, keywords = "", children }: { id: string; title: string; keywords?: string; children: ReactNode }) {
  return <section id={id} className="rg-section" data-search={`${title} ${keywords}`}><h2>{title}</h2>{children}</section>;
}

export default function RespondioGuide() {
  const [query, setQuery] = useState("");
  const [activeShot, setActiveShot] = useState<Shot | null>(null);
  const normalized = query.trim().toLocaleLowerCase("es");
  const matches = useCallback((text: string) => !normalized || text.toLocaleLowerCase("es").includes(normalized), [normalized]);
  const visibleIndex = useMemo(() => indexItems.filter(([, label, keywords]) => matches(`${label} ${keywords}`)), [matches]);
  const goTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const shot = (src: string, alt: string) => <Screenshot shot={{ src, alt }} onOpen={setActiveShot} />;

  return <section className="rg-page">
    <PageHeader title="Instructivo Respond.io" subtitle="Guía paso a paso para gestionar correctamente las conversaciones de Escape Games." />
    <Notice tone="important" title="⚠️ Regla principal">
      <p>Cuando un cliente nos escribe, la conversación debe gestionarse desde Respond.io.</p>
      <p>No responder directamente desde WhatsApp salvo cuando nosotros necesitemos iniciar una recontactación o reconfirmación.</p>
    </Notice>
    <div className="rg-search"><SearchInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar dentro del instructivo..." aria-label="Buscar dentro del instructivo" /></div>
    <div className="rg-layout">
      <main className="rg-content">
        <div className="rg-filter-note" hidden={!normalized}>Mostrando secciones que coinciden con <strong>“{query.trim()}”</strong>. <button type="button" onClick={() => setQuery("")}>Limpiar búsqueda</button></div>

        <div hidden={!matches("Reconocer la pantalla vista general buzones conversaciones información contacto")}>
          <Section id="pantalla" title="1. Reconocer la pantalla" keywords="vista general buzones conversaciones información contacto">
            <p>Cuando abrís Respond.io vas a ver mucha información junta. Para trabajar solamente necesitás reconocer estas cuatro zonas principales.</p>
            {shot("/instructivos/respondio/01-vista-general.png", "Vista general de Respond.io")}
            <div className="rg-points">
              <div><b>1 — Buzones</b><p>Están del lado izquierdo. Sirven para ordenar las conversaciones según la sucursal y la etapa.</p></div>
              <div><b>2 — Conversaciones</b><p>Es la columna siguiente. Ahí aparecen los clientes del buzón seleccionado.</p></div>
              <div><b>3 — Conversación</b><p>Es la parte central. Ahí vemos los mensajes del cliente y respondemos.</p></div>
              <div><b>4 — Información de contacto</b><p>Está del lado derecho. Ahí encontramos los datos del cliente y de su consulta.</p></div>
            </div>
          </Section>
        </div>

        <div hidden={!matches("Buzones todos nueva consulta JS informativo Metapark asesoramiento cumpleaños") }>
          <Section id="buzones" title="2. Elegir el buzón correcto" keywords="todos nueva consulta JS informativo Metapark asesoramiento cumpleaños">
            <p>Cada sucursal tiene sus propios buzones. Normalmente llevan primero las iniciales de la sucursal, por ejemplo: <code>STD Nueva Consulta</code>.</p>
            <div className="rg-media-row rg-media-row--narrow">
              {shot("/instructivos/respondio/05-buzones-equipo.png", "Buzones de equipo de una sucursal en Respond.io")}
              <div className="rg-definitions">
              <h3>Todos</h3><p>Muestra cualquier conversación ingresada por el canal de esa sucursal, aunque esté clasificada, no esté clasificada o luego haya sido derivada.</p>
              <h3>Nueva Consulta</h3><p>Conversaciones que todavía están siendo clasificadas antes de pasar a otra etapa.</p>
              <h3>JS Informativo</h3><p>Consultas sobre Juegos Sociales que ya fueron clasificadas por la IA.</p>
              <h3>Metapark Informativo</h3><p>Consultas sobre Metapark. Todas las sucursales tienen este buzón, tengan o no Metapark.</p>
              <h3>En Asesoramiento</h3><p>Consultas que necesitan una persona. Pueden venir de otra sucursal si la IA detecta que nos corresponden: un cumpleaños listo para verificar, un cierre o una consulta inconclusa.</p>
              <h3>Cumpleaños Reservado</h3><p>Cumpleaños reservados mediante nuestros canales de atención.</p>
              </div>
            </div>
            <div className="rg-media-row rg-media-row--narrow">
              {shot("/instructivos/respondio/07-filtro-conversaciones.png", "Configuración correcta del filtro de conversaciones")}
              <Notice tone="info" title="Configuración importante"><p>El filtro de conversaciones debe estar configurado de la misma manera para todos los asesores. Usá la captura como referencia para comprobar cada opción.</p></Notice>
            </div>
          </Section>
        </div>

        <div hidden={!matches("Lista conversaciones nombre estado mensajes pendientes asignación filtro") }>
          <Section id="conversaciones" title="3. Entender la lista de conversaciones" keywords="nombre estado mensajes pendientes asignación filtro">
            <p>Cada fila corresponde a una conversación.</p>
            <div className="rg-media-row rg-media-row--narrow">
              {shot("/instructivos/respondio/06-listado-conversaciones.png", "Listado de conversaciones en Respond.io")}
              <div className="rg-points"><div><b>Nombre</b><p>Nombre o alias del cliente.</p></div><div><b>Estado</b><p>Indica la etapa: Nueva Consulta, En Asesoramiento, JS Informativo o Cumpleaños Reservado.</p></div><div><b>Mensajes pendientes</b><p>Un círculo azul con <code>24</code> significa que hay 24 mensajes sin leer.</p></div><div><b>Asignación</b><p>El ícono de la derecha indica quién tiene tomada la conversación.</p></div></div>
            </div>
          </Section>
        </div>

        <div hidden={!matches("Información cliente contacto etiquetas sucursal canal consulta edad fecha cumpleaños invitados tipo operativo canales WhatsApp") }>
          <Section id="cliente" title="4. Revisar los datos del cliente" keywords="contacto etiquetas sucursal canal consulta edad fecha cumpleaños invitados operativo canales WhatsApp">
            <div className="rg-media-row">
              {shot("/instructivos/respondio/02-informacion-contacto.png", "Información de contacto del cliente")}
              <div className="rg-definitions">
              <h3>Nombre</h3><p>En WhatsApp suele ser el nombre y apellido. En Instagram o Facebook puede ser el alias de esa red.</p>
              <h3>Número de teléfono</h3><p>Sólo aparece cuando el cliente se comunicó por WhatsApp.</p>
              <h3>Sucursal Canal</h3><p>Es el canal donde se registró originalmente la consulta; actualmente puede mostrar el primer canal usado.</p>
              <Notice title="Aclaración"><p>Se está corrigiendo para que siempre muestre el último canal utilizado.</p></Notice>
              <h3>Sucursal Consulta</h3><p>Es la sucursal por la que el cliente consulta. Se completa automáticamente y la IA puede cambiarla si el cliente cambia de sucursal. Ejemplo: si primero pregunta por Caballito y luego prefiere Núñez, queda <code>Sucursal Consulta → Núñez</code>.</p>
              <Notice tone="important" title="Recordá"><p><strong>Sucursal Canal y Sucursal Consulta no significan lo mismo.</strong></p></Notice>
              <h3>Edad</h3><p>Edad del cumpleañero, registrada principalmente por IA EG Cumpleaños.</p>
              <h3>Fecha_cumpleaños</h3><p>Fecha solicitada para realizar el cumpleaños.</p>
              <h3>Cantidad de invitados</h3><p>Cantidad de personas de la experiencia. La usan IA EG Cumpleaños e IA EG Invitados.</p>
              <h3>Tipo de consulta</h3><p>Clasifica el motivo, por ejemplo <code>cumple</code>.</p>
              <h3>Estado Operativo</h3><p><code>Operativo</code> si escribió dentro del horario o <code>FueraHorario</code> si escribió fuera.</p>
              </div>
            </div>
            {shot("/instructivos/respondio/03-informacion-contacto-etiquetas.png", "Información de contacto y etiquetas del cliente")}
            <h3>Canales por los que habló el cliente</h3>
            <div className="rg-media-row">
              {shot("/instructivos/respondio/04-canales-cliente.png", "Canales utilizados por el cliente y tooltip identificador")}
              <p>Un cliente puede haber hablado por varios canales, por ejemplo WhatsApp Caballito, Studios y Núñez. Aparecerán varios íconos; apoyá el mouse sobre cada uno para ver el canal.</p>
            </div>
          </Section>
        </div>

        <div hidden={!matches("Quién tiene conversación IA asesor llave torta lupa droide asignación") }>
          <Section id="asignacion" title="5. Saber quién está atendiendo al cliente" keywords="IA asesor llave torta lupa droide asignación">
            <p>Una conversación puede estar siendo gestionada por una IA o por un asesor. Apoyá el mouse sobre el ícono para ver quién la tiene.</p>
            {shot("/instructivos/respondio/08-asignacion-asesor.png", "Asignación de asesor o IA en Respond.io")}
            <ul><li>🔑 Llave → <strong>IA EG Comercial</strong></li><li>🎂 Torta → <strong>IA EG Cumpleaños</strong></li><li>🔎 Lupa → <strong>IA EG Router</strong></li><li>🤖 Droide → <strong>IA EG Metapark</strong></li></ul>
            <p>Cualquier avatar o emoji diferente normalmente corresponde a un asesor.</p>
            <Notice title="Asignación automática"><p>Normalmente la IA asigna la conversación. Si falla o debemos derivarla, podemos reasignarla manualmente.</p></Notice>
          </Section>
        </div>

        <div hidden={!matches("Asumir conversación IA control antes responder") }>
          <Section id="asumir" title="6. Antes de responder: mirá si aparece “Asumir”" keywords="IA control antes responder">
            <p>Si dice <code>IA EG Cumpleaños está gestionando esta conversación</code> y aparece <code>Asumir</code>, la IA todavía tiene el control.</p>
            {shot("/instructivos/respondio/10-boton-asumir.png", "Botón Asumir cuando la IA controla la conversación")}
            <Steps items={[<>Buscá el botón <strong>Asumir</strong>.</>, <>Hacé clic una vez.</>, <>La IA deja de responder.</>, <>Ahora podés continuar vos.</>]} />
            <Notice tone="danger" title="⚠️ No respondas sin asumir la conversación"><p>Si la IA todavía tiene el control, puede continuar respondiendo al mismo tiempo que vos.</p></Notice>
          </Section>
        </div>

        <div hidden={!matches("Responder cliente mensajes fragmentos respuestas rápidas asistente IA") }>
          <Section id="responder" title="7. Cómo responder" keywords="mensajes fragmentos respuestas rápidas asistente IA">
            <p>Los mensajes del cliente están a la izquierda. Los nuestros o los de la IA, a la derecha. Cuando tenés el control, abajo aparece el campo para escribir.</p>
            {shot("/instructivos/respondio/11-fragmentos-respuestas-rapidas.png", "Campo de respuesta y fragmentos de respuestas rápidas")}
            <Steps items={["Hacé clic en el campo.", "Escribí tu respuesta.", "Revisala.", "Enviala."]} />
            <h3>Respuestas rápidas</h3><Steps items={["Hacé clic donde escribís el mensaje.", <>Escribí <code>/</code>.</>, "Respond.io mostrará los fragmentos disponibles.", "Elegí el que corresponda.", "Revisalo antes de enviarlo."]} />
            <h3>Asistente IA</h3>{shot("/instructivos/respondio/14-asistente-ia.png", "Botón Asistente IA dentro del campo de respuesta")}
            <p>El botón <strong>Asistente IA</strong> formulará una respuesta usando la conversación y la base de conocimiento.</p>
            <Notice tone="important" title="Herramienta en configuración"><p>Siempre revisá la respuesta generada antes de enviarla.</p></Notice>
          </Section>
        </div>

        <div hidden={!matches("Respond.io WhatsApp Business mensaje entrante paralelo") }>
          <Section id="whatsapp" title="8. Saber desde dónde se envió un mensaje" keywords="WhatsApp Business entrante paralelo">
            <div className="rg-shot-pair">{shot("/instructivos/respondio/13-mensaje-respondio.png", "Mensaje enviado correctamente desde Respond.io")}{shot("/instructivos/respondio/12-mensaje-whatsapp-business.png", "Mensaje enviado desde la aplicación WhatsApp Business")}</div>
            <h3>Mensaje enviado desde Respond.io</h3><p>Al apoyar el mouse sobre el avatar aparece la identificación de Escape Games o de la sucursal. Eso confirma que se gestionó desde Respond.io.</p>
            <h3>Mensaje enviado desde WhatsApp Business</h3><p>Si dice <code>Enviado a través de Aplicación WhatsApp Business</code>, fue enviado directamente desde WhatsApp y fuera del flujo normal.</p>
            <Notice tone="danger" title="⚠️ NO utilizar WhatsApp para responder comunicaciones entrantes"><p>Si no asumimos la conversación, la IA puede seguir respondiendo en paralelo.</p></Notice>
          </Section>
        </div>

        <div hidden={!matches("Cambiar estado asesoramiento cumpleaños reservado no interesa fuera presupuesto flechita") }>
          <Section id="estado" title="9. Cambiar el estado de una conversación" keywords="asesoramiento cumpleaños reservado no interesa fuera presupuesto flechita">
            <p>El estado está arriba, al lado del nombre del cliente.</p>{shot("/instructivos/respondio/09-estados-conversacion.png", "Selector de estado de una conversación")}
            <Steps items={["Hacé clic sobre el nombre del estado.", "Se abre el listado.", "Elegí manualmente la etapa correcta."]} />
            <Notice tone="danger" title="⚠️ No tocar la flechita"><p>Hacé clic sobre el estado y seleccioná la etapa.</p></Notice>
            <div className="rg-cases"><p><span>Necesita atención humana</span><code>En Asesoramiento</code></p><p><span>Cumpleaños concretado</span><code>Cumpleaños Reservado</code></p><p><span>Cliente no quiere continuar</span><code>No le interesa</code></p><p><span>Rechaza por precio</span><code>Fuera de presupuesto</code></p></div>
          </Section>
        </div>

        <div hidden={!matches("Cerrar venta vendido cumpleaños reservado juego social etiquetas") }>
          <Section id="venta" title="10. Cerré un cumpleaños: ¿qué hago?" keywords="venta vendido juego social etiquetas">
            <Steps items={[<>Cambiá el estado a <code>Cumpleaños Reservado</code>.</>, <>Andá a <strong>Información de contacto</strong>.</>, <>Bajá hasta <strong>Etiquetas</strong>.</>, <>Tocá <code>+</code>.</>, <>Seleccioná <code>Vendido</code>.</>]} />
            {shot("/instructivos/respondio/03-informacion-contacto-etiquetas.png", "Información de contacto y etiquetas del cliente")}
            <Notice tone="success" title="✅ Confirmación"><p><strong>Estado:</strong> Cumpleaños Reservado<br/><strong>Etiqueta:</strong> Vendido</p></Notice>
            <h3>¿Y si vendí un Juego Social?</h3><Steps items={["Andá a Etiquetas.", <>Tocá <code>+</code>.</>, <>Seleccioná <code>Vendido</code>.</>]} />
            <Notice tone="important" title="Importante"><p>No uses <code>Cumpleaños Reservado</code> para un Juego Social.</p></Notice>
          </Section>
        </div>

        <div hidden={!matches("24 horas desaparecen cierran automáticamente") }>
          <Section id="24-horas" title="11. ¿Por qué desaparecen o se cierran conversaciones?" keywords="24 horas automáticamente">
            <p>Las conversaciones tienen una ventana de <strong>24 horas</strong> desde que se iniciaron. Al cumplirse, se cierran automáticamente.</p><p>Así, si el cliente vuelve a escribir, la IA puede retomarla. No hace falta cerrarla manualmente por este motivo.</p>
          </Section>
        </div>

        <div hidden={!matches("Recontactaciones reconfirmaciones escribir primero WhatsApp asignarse usuario") }>
          <Section id="recontactaciones" title="12. Cuando nosotros necesitamos escribir primero" keywords="recontactar reconfirmar WhatsApp asignarse usuario">
            <p>Para recontactar un cliente o reconfirmar una reserva, sí comenzamos desde WhatsApp.</p>
            <Steps items={["Enviá el primer mensaje desde WhatsApp.", "Respond.io abrirá la conversación.", "Entrá a Respond.io.", "Buscá esa conversación.", "Abrí la asignación de asesor.", <>Asignala manualmente a <strong>tu propio usuario</strong>.</>]} />
            <Notice tone="danger" title="⚠️ Este paso es obligatorio"><p>Si iniciamos desde WhatsApp pero no nos asignamos la conversación en Respond.io, una IA puede tomarla y empezar a responder.</p></Notice>
          </Section>
        </div>
        {normalized && visibleIndex.length === 0 && <div className="rg-empty"><strong>No encontramos esa palabra.</strong><span>Probá con “Asumir”, “Vendido”, “Buzones”, “Fragmentos” o “24 horas”.</span></div>}
      </main>
      <aside className="rg-index"><strong>En esta guía</strong><nav aria-label="Índice del instructivo">{visibleIndex.map(([id, label]) => <button key={id} type="button" onClick={() => goTo(id)}>{label}</button>)}</nav></aside>
    </div>
    <Modal open={!!activeShot} title={activeShot?.alt ?? "Captura ampliada"} size="lg" panelClassName="rg-lightbox" onClose={() => setActiveShot(null)}>{activeShot && <img src={activeShot.src} alt={activeShot.alt} />}</Modal>
  </section>;
}
