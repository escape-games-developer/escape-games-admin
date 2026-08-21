-- Config compartida de la Intranet (arranca con el Cotizador).
-- Fila única id = 'default', igual que app_config.
create table if not exists public.intranet_config (
  id                  text primary key default 'default',
  cotizador           jsonb not null default '{}'::jsonb,
  precios_confirmados boolean not null default false,
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users(id)
);

alter table public.intranet_config enable row level security;

-- Lectura: cualquier admin autenticado (GM incluido). No es data pública:
-- a diferencia de app_config, acá NO va USING (true).
drop policy if exists intranet_config_select_admins on public.intranet_config;
create policy intranet_config_select_admins
  on public.intranet_config for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

-- Escritura: solo is_super. is_super_admin() es SECURITY DEFINER con
-- search_path fijo, por eso se usa esa y no is_admin_general().
drop policy if exists intranet_config_insert_super on public.intranet_config;
create policy intranet_config_insert_super
  on public.intranet_config for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists intranet_config_update_super on public.intranet_config;
create policy intranet_config_update_super
  on public.intranet_config for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists intranet_config_delete_super on public.intranet_config;
create policy intranet_config_delete_super
  on public.intranet_config for delete to authenticated
  using (public.is_super_admin());

insert into public.intranet_config (id) values ('default') on conflict (id) do nothing;
