import { Link } from "react-router-dom";

import { Card, EmptyState } from "../../ui";

type Props = {
  title: string;
  description: string;
  /** Qué va a poder responder la pantalla cuando exista. */
  bullets: Array<{ title: string; detail: string }>;
};

/**
 * Subsección de Métricas todavía no desarrollada.
 *
 * Existe para que el menú no tenga ítems que no llevan a ningún lado: la ruta
 * responde, se ve el encabezado de siempre y queda escrito qué va a mostrar.
 * Es deliberadamente sobria —`EmptyState` y `Card` del sistema, sin maqueta
 * falsa— para que nadie la confunda con una pantalla ya terminada.
 */
export default function MetricsSoon({ title, description, bullets }: Props) {
  return (
    <Card className="eg-metrics-soon">
      <EmptyState
        icon="metrics"
        title={title}
        description={description}
        action={<Link className="eg-btn eg-btn--secondary eg-btn--sm" to="/metricas/resumen">Ir al resumen</Link>}
      />

      <ul className="eg-metrics-soon__list">
        {bullets.map((bullet) => (
          <li className="eg-metrics-soon__item" key={bullet.title}>
            <strong>{bullet.title}</strong>
            <span>{bullet.detail}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
