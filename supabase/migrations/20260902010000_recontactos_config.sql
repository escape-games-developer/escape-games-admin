-- Configuración central del módulo y relación sucursal -> Google Sheet.
-- Las credenciales de Google nunca se guardan acá: pertenecen al backend/Edge Function.
create table if not exists public.recontactos_config (
  id text primary key default 'default',
  enabled boolean not null default false,
  whatsapp_template text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.recontactos_config (id, enabled, whatsapp_template) values (
  'default', false,
  E'Hola [NOMBRE] 👋\nTe contactamos desde Escape Games [SUCURSAL].\nEl [FECHA_CONTACTO] nos consultaste por un festejo para el [FECHA_CUMPLE] para aproximadamente [INVITADOS] invitados.\nQueríamos saber si seguías evaluando la propuesta o si podemos ayudarte con alguna consulta.'
) on conflict (id) do nothing;

create table if not exists public.recontactos_branch_sheets (
  branch_id uuid primary key references public.branches(id) on delete cascade,
  google_connection_id uuid,
  spreadsheet_id text not null,
  spreadsheet_name text not null,
  sheet_tab text not null default 'Recontactos',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

-- Tabla deliberadamente privada: ninguna policy permite acceso desde el cliente.
-- Los tokens cifrados sólo son leídos por Edge Functions con service_role.
create table if not exists public.google_oauth_connections (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id),
  google_email text not null,
  refresh_token_ciphertext text not null,
  access_token_ciphertext text,
  access_token_expires_at timestamptz,
  scopes text[] not null default '{}',
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.google_oauth_states (
  state text primary key,
  owner_user_id uuid not null references auth.users(id),
  return_to text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.google_oauth_connections enable row level security;
alter table public.google_oauth_states enable row level security;
revoke all on public.google_oauth_connections from anon, authenticated;
revoke all on public.google_oauth_states from anon, authenticated;

alter table public.recontactos_branch_sheets
  add constraint recontactos_branch_google_connection_fk
  foreign key (google_connection_id) references public.google_oauth_connections(id) on delete set null;

alter table public.recontactos_config enable row level security;
alter table public.recontactos_branch_sheets enable row level security;

create policy recontactos_config_read on public.recontactos_config for select to authenticated
using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
create policy recontactos_sheets_read on public.recontactos_branch_sheets for select to authenticated
using (exists (
  select 1 from public.admins a where a.user_id = auth.uid()
  and (a.is_super is true or a.branch_id = recontactos_branch_sheets.branch_id)
));

create or replace function public.is_admin_general()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid() and a.is_super is true);
$$;
revoke all on function public.is_admin_general() from public;
grant execute on function public.is_admin_general() to authenticated;

create policy recontactos_config_insert_super on public.recontactos_config for insert to authenticated with check (public.is_admin_general());
create policy recontactos_config_update_super on public.recontactos_config for update to authenticated using (public.is_admin_general()) with check (public.is_admin_general());
create policy recontactos_sheets_insert_super on public.recontactos_branch_sheets for insert to authenticated with check (public.is_admin_general());
create policy recontactos_sheets_update_super on public.recontactos_branch_sheets for update to authenticated using (public.is_admin_general()) with check (public.is_admin_general());
create policy recontactos_sheets_delete_super on public.recontactos_branch_sheets for delete to authenticated using (public.is_admin_general());

insert into public.admin_section_permissions (role, section_key, enabled)
values ('GM', 'recontactos', false)
on conflict (role, section_key) do nothing;
