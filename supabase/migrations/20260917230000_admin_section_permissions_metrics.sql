-- Métricas entra al sistema de habilitación de secciones.
--
-- No cambia el esquema: `admin_section_permissions` ya es una fila por
-- (rol, sección) justamente para que sumar una sección sea un INSERT y no una
-- migración de estructura. Esto es solo la semilla de la fila nueva.
--
-- Tampoco toca las políticas de RLS ni los helpers de rol: siguen valiendo los
-- de 20260821010000 y 20260821020000. Escribir sigue siendo potestad de los
-- perfiles administrativos (`can_manage_section_permissions()`), leer lo puede
-- hacer cualquier admin autenticado.
--
-- ARRANCA EN false, a diferencia de casi todas las demás.
--
-- El criterio de la migración original fue "no cambiarle el acceso a nadie": se
-- sembró en true lo que un GM ya podía abrir. Acá pasa lo mismo leído al revés
-- — hasta esta versión la ruta de Métricas era solo para perfiles
-- administrativos, así que un GM NO tenía acceso. Sembrar en true se lo
-- estaría dando de regalo al aplicar la migración, que es exactamente lo que
-- ese criterio busca evitar. Queda apagada y el Admin General la enciende
-- desde Ajustes cuando quiera.
--
-- Los perfiles administrativos no dependen de esta fila: `canAccessSection()`
-- los deja pasar siempre (ver SECTION_UNRESTRICTED_ROLES). Por eso solo se
-- siembra el rol GM, igual que el resto del catálogo.
--
-- `on conflict do nothing`: si la migración se corre dos veces, o si el Admin
-- General ya la encendió a mano, no se pisa nada.
insert into public.admin_section_permissions (role, section_key, enabled) values
  ('GM', 'metrics', false)
on conflict (role, section_key) do nothing;
