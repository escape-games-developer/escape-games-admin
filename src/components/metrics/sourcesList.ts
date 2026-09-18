import type { MetricsSources } from "../../services/metrics/types";

export type SourceRow = {
  key: string;
  label: string;
  consultas: number;
  /** Porcentaje ya calculado por ORIGEN (28.6 = 28,6%). No se recalcula acá. */
  share: number | null;
  ventasOnlineAtribuidas: number | null;
  facturacionOnlineAtribuida: number | null;
  definicion: string;
};

/**
 * Los cinco orígenes que suman el total de consultas, en el orden en
 * que se leen: primero lo que vino de pauta, después lo que llegó solo.
 *
 * `repetidas` queda AFUERA a propósito: no entra en el total —es la
 * misma persona contada dos veces— y meterla en el donut haría que los
 * porcentajes no cerraran en 100%. Se muestra aparte.
 */
export function listaDeOrigenes(sources: MetricsSources): SourceRow[] {
  const fila = (
    key: keyof MetricsSources,
    label: string
  ): SourceRow => {
    const s = sources[key];
    return {
      key,
      label,
      consultas: s.consultas,
      share: s.share,
      ventasOnlineAtribuidas: s.ventas_online_atribuidas,
      facturacionOnlineAtribuida: s.facturacion_online_atribuida,
      definicion: s.definicion,
    };
  };

  return [
    fila("meta_ads", "Meta Ads"),
    fila("web", "Web"),
    fila("organico", "Orgánico"),
    fila("espontaneas", "Espontáneas"),
    fila("sin_atribuir", "Sin atribuir"),
  ];
}
