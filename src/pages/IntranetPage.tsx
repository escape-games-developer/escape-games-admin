import { Card, EmptyState, PageHeader } from "../ui";
import CotizadorSection from "./intranet/CotizadorSection";
import RespondioGuide from "./intranet/RespondioGuide";

const sections = {
  cotizador: {
    title: "Cotizador",
    description: "Herramientas de cotización comercial.",
  },
  mensajes: {
    title: "Mensajes",
    description: "Biblioteca de mensajes y respuestas rápidas.",
  },
  objeciones: {
    title: "Menú de Objeciones",
    description: "Respuestas y recursos para resolver las principales objeciones comerciales.",
  },
  "respond-io": {
    title: "Instructivo Respond IO",
    description: "Guías y procedimientos para el uso de Respond IO.",
  },
} as const;

type Props = { section: keyof typeof sections };

export default function IntranetPage({ section }: Props) {
  // El Cotizador ya tiene contenido propio, con su encabezado incluido.
  // Las otras tres siguen siendo shells hasta que les toque.
  if (section === "cotizador") return <CotizadorSection />;
  if (section === "respond-io") return <RespondioGuide />;

  const content = sections[section];

  return (
    <section className="eg-placeholder">
      <PageHeader title={content.title} subtitle={content.description} />
      <Card padding="lg">
        <EmptyState
          icon="intranet"
          title="Contenido próximamente"
          description="Esta sección se encuentra preparada para incorporar nuevas herramientas."
        />
      </Card>
    </section>
  );
}
