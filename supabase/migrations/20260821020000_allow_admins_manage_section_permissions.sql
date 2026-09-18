-- Permite que los dos perfiles administrativos del panel configuren qué
-- secciones puede usar un GM.
--
-- En el frontend el rol se deriva así:
--   ADMIN_GENERAL: admins.is_super = true
--   GM:            admins.gm_code tiene valor
--   ADMIN:         no es super y admins.gm_code está vacío
--
-- La función replica esa regla del lado de la base. SECURITY DEFINER evita que
-- el resultado dependa de las policies de lectura de `admins`, y el
-- search_path fijo evita resoluciones de objetos controladas por el caller.
create or replace function public.can_manage_section_permissions()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.admins a
    where a.user_id = auth.uid()
      and (
        a.is_super is true
        or coalesce(btrim(a.gm_code), '') = ''
      )
  );
$$;

revoke all on function public.can_manage_section_permissions() from public;
grant execute on function public.can_manage_section_permissions() to authenticated;

drop policy if exists admin_section_permissions_insert_super on public.admin_section_permissions;
create policy admin_section_permissions_insert_admin
  on public.admin_section_permissions for insert to authenticated
  with check (public.can_manage_section_permissions());

drop policy if exists admin_section_permissions_update_super on public.admin_section_permissions;
create policy admin_section_permissions_update_admin
  on public.admin_section_permissions for update to authenticated
  using (public.can_manage_section_permissions())
  with check (public.can_manage_section_permissions());

drop policy if exists admin_section_permissions_delete_super on public.admin_section_permissions;
create policy admin_section_permissions_delete_admin
  on public.admin_section_permissions for delete to authenticated
  using (public.can_manage_section_permissions());
