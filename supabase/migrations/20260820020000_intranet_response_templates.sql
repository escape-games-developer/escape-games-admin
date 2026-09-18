alter table public.intranet_config
  add column if not exists response_templates jsonb not null default '{}'::jsonb;

create or replace function public.set_intranet_response_templates(p_response_templates jsonb)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  updated public.intranet_config%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'Solo el Admin General puede editar las plantillas'
      using errcode = '42501';
  end if;

  if jsonb_typeof(p_response_templates) <> 'object' then
    raise exception 'Las plantillas deben ser un objeto JSON';
  end if;

  update public.intranet_config set
    response_templates = p_response_templates,
    updated_at = now(),
    updated_by = auth.uid()
  where id = 'default'
  returning * into updated;

  return json_build_object(
    'success', true,
    'response_templates', updated.response_templates,
    'updated_at', updated.updated_at
  );
end;
$function$;

revoke all on function public.set_intranet_response_templates(jsonb) from public, anon;
grant execute on function public.set_intranet_response_templates(jsonb) to authenticated;
