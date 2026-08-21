-- Habilitación de secciones del admin por rol.
--
-- Qué resuelve: hoy, qué ve un Game Master está clavado en el bundle (los
-- guards de routes.tsx y el armado del sidebar). Con esta tabla el Admin
-- General lo cambia desde Ajustes, sin publicar un dist nuevo.
--
-- Forma: una fila por (rol, sección). NO columnas por sección — así sumar
-- una sección o un rol futuro es un INSERT, no una migración de esquema.
--
-- El rol se guarda con el mismo código que ya usa el front (ADMIN_GENERAL,
-- ADMIN, GM). Ojo: `admins` no tiene columna `role`; el rol se deriva de
-- `is_super` y `gm_code` en AdminLayout. Acá sólo se guarda a qué rol aplica
-- cada fila, no se cambia cómo se determina el rol de nadie.
create table if not exists public.admin_section_permissions (
  role        text not null,
  section_key text not null,
  enabled     boolean not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id),
  primary key (role, section_key)
);

alter table public.admin_section_permissions enable row level security;

-- Lectura: cualquier admin autenticado. Un GM necesita leer su propia
-- configuración para saber qué secciones abrir. Misma política que
-- intranet_config: no es data pública, pero sí visible para el equipo.
drop policy if exists admin_section_permissions_select_admins on public.admin_section_permissions;
create policy admin_section_permissions_select_admins
  on public.admin_section_permissions for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

-- Escritura: solo Admin General. `is_super_admin()` es la misma función
-- SECURITY DEFINER con search_path fijo que ya usan las políticas de
-- intranet_config; no se crea ni se modifica ningún helper de rol.
--
-- Esto es lo que impide que un GM se habilite secciones a sí mismo: aunque
-- llame a la API directamente, el INSERT/UPDATE/DELETE lo frena la base.
drop policy if exists admin_section_permissions_insert_super on public.admin_section_permissions;
create policy admin_section_permissions_insert_super
  on public.admin_section_permissions for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists admin_section_permissions_update_super on public.admin_section_permissions;
create policy admin_section_permissions_update_super
  on public.admin_section_permissions for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists admin_section_permissions_delete_super on public.admin_section_permissions;
create policy admin_section_permissions_delete_super
  on public.admin_section_permissions for delete to authenticated
  using (public.is_super_admin());

-- Semilla para Game Master.
--
-- Criterio: NO cambiar el acceso que un GM tiene hoy. Se habilita todo lo que
-- hoy puede abrir realmente, así publicar esto no le saca nada a nadie; a
-- partir de ahí el Admin General apaga lo que quiera desde Ajustes.
--
--   · rooms                 hoy accesible (RequireRole incluye GM)
--   · news / users /
--     golden_ticket         hoy accesible SOLO si su permiso por usuario lo
--                           permite. Se deja en true para no pisar ese permiso:
--                           el gate por usuario sigue mandando aparte.
--   · user_progress         hoy NO accesible para GM (ruta solo ADMIN):
--                           arranca en false para reflejar la realidad.
--   · intranet + cotizador  pedido explícito de esta publicación.
--   · calendar / chat       hoy accesibles sin guard.
--
-- `on conflict do nothing`: si la migración se corre dos veces no pisa lo que
-- el Admin General haya configurado a mano.
insert into public.admin_section_permissions (role, section_key, enabled) values
  ('GM', 'rooms',                 true),
  ('GM', 'news',                  true),
  ('GM', 'users',                 true),
  ('GM', 'golden_ticket',         true),
  ('GM', 'user_progress',         false),
  ('GM', 'intranet',              true),
  ('GM', 'intranet_quote',        true),
  ('GM', 'intranet_messages',     true),
  ('GM', 'intranet_objections',   true),
  ('GM', 'intranet_respond_io',   true),
  ('GM', 'calendar',              true),
  ('GM', 'chat',                  true)
on conflict (role, section_key) do nothing;
