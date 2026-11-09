-- Calendario de reservas: reservas pagadas de un rango de días (vistas Mes,
-- Semana y Día de la sección Calendario).
--
-- Mismas reglas que admin_reservations_for_day: un GM solo ve su sucursal (lo
-- hace cumplir la base), el super admin elige una o ve todas. El día es el día
-- de trabajo, de 6:00 a 6:00: un turno de la 01:30 del domingo cuenta en el
-- sábado. Devuelve filas livianas (sin datos de contacto ni el cruce con la
-- app); el detalle completo y la validación siguen en "Reservas del día".
--
-- Volumen al 09/11/2026: ~42 reservas por día entre todas las sucursales
-- (pico 123) y ~5 por sucursal (pico 26). El rango se limita a 62 días: la
-- vista Mes pide 42 (6 semanas completas).

create index if not exists web_reservations_visit_at_idx on public.web_reservations (visit_at);

create or replace function public.admin_reservations_range(p_from date, p_to date, p_branch_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_super boolean;
  v_branch uuid;
  v_target uuid;
  v_tz constant text := 'America/Argentina/Buenos_Aires';
begin
  select c.is_super, c.branch_id into v_super, v_branch from public.eg_caller_branch() c;
  if v_super is null then raise exception 'no_autorizado' using errcode = '42501'; end if;
  v_target := case when v_super then p_branch_id else v_branch end;
  if not v_super and v_target is null then raise exception 'gm_sin_sucursal' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'rango_invalido'; end if;
  if p_to - p_from > 62 then raise exception 'rango_demasiado_largo'; end if;

  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.dia, x.visit_at nulls last, x.referencia)
    from (
      select
        w.reserva_id,
        w.referencia,
        coalesce(((w.visit_at at time zone v_tz) - interval '6 hours')::date, w.visit_date) as dia,
        w.visit_at,
        w.branch_id,
        coalesce(b.name, w.marca) as branch_name,
        w.room_id,
        coalesce(r.name, w.sala_texto) as sala,
        w.participantes,
        w.nombre,
        (select count(*) from public.room_completions rc where rc.reservation_ref = w.reserva_id)::int as validados
      from public.web_reservations w
      left join public.rooms_v2 r on r.id = w.room_id
      left join public.branches b on b.id = w.branch_id
      where w.estado in ('processing', 'completed')
        and (v_target is null or w.branch_id = v_target)
        and (
          (w.visit_at is not null
            and w.visit_at >= ((p_from::timestamp + interval '6 hours') at time zone v_tz)
            and w.visit_at <  (((p_to + 1)::timestamp + interval '6 hours') at time zone v_tz))
          or (w.visit_at is null and w.visit_date between p_from and p_to)
        )
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_reservations_range(date, date, uuid) from public, anon;
grant execute on function public.admin_reservations_range(date, date, uuid) to authenticated;
