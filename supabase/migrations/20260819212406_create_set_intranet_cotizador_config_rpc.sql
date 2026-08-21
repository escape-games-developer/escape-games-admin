-- Escritura de la config del Cotizador.
-- La RLS de intranet_config ya bloquea al que no es is_super; esta RPC es el
-- segundo cinturón y además devuelve un error legible al panel en vez del
-- "0 filas afectadas" mudo que da un UPDATE rebotado por RLS.
create or replace function public.set_intranet_cotizador_config(
  p_cotizador jsonb default null,
  p_precios_confirmados boolean default null
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  updated public.intranet_config%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'Solo el Admin General puede editar la configuración del cotizador'
      using errcode = '42501';
  end if;

  update public.intranet_config set
    cotizador           = coalesce(p_cotizador, cotizador),
    precios_confirmados = coalesce(p_precios_confirmados, precios_confirmados),
    updated_at          = now(),
    updated_by          = auth.uid()
  where id = 'default'
  returning * into updated;

  if not found then
    raise exception 'No existe la fila de configuración (id = default)';
  end if;

  return json_build_object(
    'success', true,
    'cotizador', updated.cotizador,
    'precios_confirmados', updated.precios_confirmados,
    'updated_at', updated.updated_at
  );
end;
$function$;

revoke all on function public.set_intranet_cotizador_config(jsonb, boolean) from public, anon;
grant execute on function public.set_intranet_cotizador_config(jsonb, boolean) to authenticated;
