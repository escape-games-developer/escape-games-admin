import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button, Card, EmptyState } from "../ui";
import { useSectionPermissions } from "../lib/sectionPermissionsStore";
import { SECTION_DEFS, firstAccessiblePath, type SectionKey } from "../lib/sectionPermissions";

type Props = {
  section: SectionKey;
  children: ReactNode;
};

/**
 * Nivel 2 de la habilitación de secciones: la ruta.
 *
 * Ocultar el ítem del sidebar no alcanza — escribir la URL a mano tiene que
 * frenar igual. Por eso cada ruta protegida se envuelve acá.
 *
 * No redirige a propósito: con varias secciones apagadas, redirigir entre
 * ellas es la receta para un loop. Muestra una pantalla clara y deja volver.
 */
export default function SectionGuard({ section, children }: Props) {
  const { canAccessSection, loading, role, permissions } = useSectionPermissions();

  // Sin permisos resueltos no se dibuja nada protegido: evita el parpadeo de
  // ver la sección un instante y que después desaparezca.
  if (loading) return null;

  if (canAccessSection(section)) return <>{children}</>;

  const label = SECTION_DEFS.find((def) => def.key === section)?.label ?? "Esta sección";
  // Salida a la primera sección que sí puede abrir. Si no hay ninguna, no se
  // ofrece botón: mandarlo a otra pantalla bloqueada no ayuda a nadie.
  const salida = firstAccessiblePath(role, permissions);

  return (
    <section className="eg-placeholder">
      <Card padding="lg">
        <EmptyState
          icon="settings"
          title="Acceso restringido"
          description={`${label} no está habilitada para tu usuario. Si necesitás usarla, pedísela al Admin General.`}
          action={
            salida ? (
              <Link to={salida}>
                <Button variant="primary">Ir a una sección disponible</Button>
              </Link>
            ) : undefined
          }
        />
      </Card>
    </section>
  );
}
