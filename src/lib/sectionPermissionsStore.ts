import { createContext, useContext } from "react";
import {
  canAccessSection,
  type SectionKey,
  type SectionPermissions,
  type SectionRole,
} from "./sectionPermissions";

/**
 * Contexto de habilitación de secciones.
 *
 * Se carga UNA sola vez, en el boot de AdminLayout (junto con la sesión y el
 * rol), y desde ahí lo consumen el guard de rutas y la pantalla de Ajustes.
 * Ninguna página consulta Supabase por su cuenta.
 */

export type SectionPermissionsStore = {
  role: SectionRole;
  permissions: SectionPermissions;
  /** true mientras el boot todavía no resolvió: no dibujar nada protegido. */
  loading: boolean;
  /** La lectura falló y se está usando caché o el mínimo conocido. */
  degraded: boolean;
  canAccessSection: (sectionKey: SectionKey) => boolean;
};

export const SectionPermissionsContext = createContext<SectionPermissionsStore | null>(null);

export function useSectionPermissions(): SectionPermissionsStore {
  const store = useContext(SectionPermissionsContext);
  if (!store) {
    throw new Error("useSectionPermissions necesita el provider de AdminLayout.");
  }
  return store;
}

/** Helper para construir el valor del contexto sin repetir la regla. */
export function buildSectionPermissionsStore(
  role: SectionRole,
  permissions: SectionPermissions,
  loading: boolean,
  degraded: boolean
): SectionPermissionsStore {
  return {
    role,
    permissions,
    loading,
    degraded,
    canAccessSection: (sectionKey) => canAccessSection(sectionKey, role, permissions),
  };
}
