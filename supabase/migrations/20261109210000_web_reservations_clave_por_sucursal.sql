-- Reservas web: la clave pasa a ser sucursal + número de pedido.
--
-- Cada sucursal tiene su propio WooCommerce y numera los pedidos por su
-- cuenta: "WC-4702" puede ser una compra en Palermo y otra en Almagro. Con
-- `referencia` como clave, la segunda pisaba a la primera. Al 09/11/2026 la
-- hoja VENTAS ONLINE tenía 2.684 reservas distintas y la tabla 1.896: 710
-- números de pedido se repetían entre sucursales. (ORIGEN ya lo resolvió en
-- la v183 deduplicando por MARCA + REFERENCIA; esto hace lo mismo acá.)
--
-- Clave nueva: `reserva_id` = sucursal normalizada + '|' + referencia
-- ("nunez|WC-4702"). "EG Nunez" y "EG Núñez" dan la misma sucursal.
-- `room_completions.reservation_ref` ahora guarda `reserva_id`.
-- Al aplicarla no había ninguna validación con reserva (reservation_ref en null).

-- ============================================================
-- 1) Columna clave
-- ============================================================
create or replace function public.eg_reserva_marca(p text)
returns text
language sql
immutable
as $$
  select public.eg_norm(regexp_replace(coalesce(p, ''), '^\s*EG\s+', '', 'i'))
$$;

alter table public.web_reservations
  add column if not exists reserva_id text
  generated always as (public.eg_reserva_marca(marca) || '|' || referencia) stored;

-- ============================================================
-- 2) Clave primaria y vínculo con las validaciones
-- ============================================================
alter table public.room_completions drop constraint if exists room_completions_reservation_ref_fkey;
alter table public.web_reservations drop constraint if exists web_reservations_pkey;
alter table public.web_reservations add constraint web_reservations_pkey primary key (reserva_id);
create index if not exists web_reservations_referencia_idx on public.web_reservations (referencia);

alter table public.room_completions
  add constraint room_completions_reservation_ref_fkey
  foreign key (reservation_ref) references public.web_reservations(reserva_id) on delete set null;

comment on column public.room_completions.reservation_ref is
  'web_reservations.reserva_id (sucursal|referencia) de la reserva con la que el GM validó la sala.';

-- ============================================================
-- 3) Funciones del panel: usan reserva_id
-- ============================================================
create or replace function public.admin_reservations_for_day(p_date date, p_branch_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_super boolean; v_branch uuid; v_target uuid;
begin
  select c.is_super, c.branch_id into v_super, v_branch from public.eg_caller_branch() c;
  if v_super is null then raise exception 'no_autorizado' using errcode = '42501'; end if;
  v_target := case when v_super then p_branch_id else v_branch end;
  if not v_super and v_target is null then raise exception 'gm_sin_sucursal' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.visit_at nulls last, x.referencia)
    from (
      select w.reserva_id, w.referencia, w.estado, w.visit_date, w.visit_at, w.servicio, w.sala_texto,
        w.room_id, r.name as room_name, w.participantes, w.nombre, w.email, w.telefono, w.cupon,
        w.branch_id, b.name as branch_name, buyer.id as buyer_user_id, buyer.alias as buyer_alias,
        coalesce((
          select jsonb_agg(jsonb_build_object('user_id', rc.user_id,
            'nombre', trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')),
            'alias', p.alias, 'room_id', rc.room_id, 'completed_at', rc.completed_at) order by rc.completed_at)
          from public.room_completions rc join public.profiles p on p.id = rc.user_id
          where rc.reservation_ref = w.reserva_id
        ), '[]'::jsonb) as validados
      from public.web_reservations w
      left join public.rooms_v2 r on r.id = w.room_id
      left join public.branches b on b.id = w.branch_id
      left join lateral (
        select p.id, p.alias from public.profiles p
        where coalesce(p.role, 'CLIENT') = 'CLIENT'
          and ((w.email is not null and lower(p.mail) = lower(w.email))
            or (length(right(regexp_replace(coalesce(w.telefono, ''), '\D', '', 'g'), 8)) = 8
                and right(regexp_replace(coalesce(p.tel_cod_area, '') || coalesce(p.tel_numero, ''), '\D', '', 'g'), 8)
                    = right(regexp_replace(coalesce(w.telefono, ''), '\D', '', 'g'), 8)))
        order by coalesce(lower(p.mail) = lower(w.email), false) desc limit 1
      ) buyer on true
      where w.estado in ('processing', 'completed')
        and (v_target is null or w.branch_id = v_target)
        and (
          (w.visit_at is not null and ((w.visit_at at time zone 'America/Argentina/Buenos_Aires') - interval '6 hours')::date = p_date)
          or (w.visit_at is null and w.visit_date = p_date)
        )
    ) x
  ), '[]'::jsonb);
end;
$$;

-- p_reservation_ref recibe reserva_id ("nunez|WC-4702"). Se mantiene el nombre
-- del parámetro para no cambiar la firma.
create or replace function public.admin_validate_room(p_user_id uuid, p_room_id uuid, p_keys integer, p_reservation_ref text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_super boolean; v_branch uuid; v_room record; v_res record; v_role text;
  v_keys integer := greatest(0, least(10, coalesce(p_keys, 0)));
  v_today date := ((now() at time zone 'America/Argentina/Buenos_Aires') - interval '6 hours')::date;
  v_day date;
  v_count integer; v_completion_id uuid;
begin
  select c.is_super, c.branch_id into v_super, v_branch from public.eg_caller_branch() c;
  if v_super is null then raise exception 'no_autorizado' using errcode = '42501'; end if;
  select r.id, r.branch_id, r.active, r.name into v_room from public.rooms_v2 r where r.id = p_room_id;
  if v_room.id is null or not v_room.active then raise exception 'sala_invalida'; end if;
  if not v_super and v_room.branch_id is distinct from v_branch then raise exception 'sala_de_otra_sucursal' using errcode = '42501'; end if;
  if p_reservation_ref is not null then
    select w.reserva_id, w.branch_id, w.estado, w.visit_date, w.visit_at, w.participantes into v_res
    from public.web_reservations w where w.reserva_id = p_reservation_ref;
    if v_res.reserva_id is null then raise exception 'reserva_inexistente'; end if;
    if v_res.estado not in ('processing', 'completed') then raise exception 'reserva_no_pagada'; end if;
    if v_res.branch_id is distinct from v_room.branch_id then raise exception 'reserva_de_otra_sucursal'; end if;
    v_day := coalesce(((v_res.visit_at at time zone 'America/Argentina/Buenos_Aires') - interval '6 hours')::date, v_res.visit_date);
    if v_day is null or v_day > v_today or v_day < v_today - 7 then raise exception 'reserva_fuera_de_fecha'; end if;
    if v_res.participantes is not null then
      select count(*) into v_count from public.room_completions rc where rc.reservation_ref = p_reservation_ref;
      if v_count >= v_res.participantes then raise exception 'reserva_completa'; end if;
    end if;
  end if;
  select coalesce(p.role, 'CLIENT') into v_role from public.profiles p where p.id = p_user_id;
  if v_role is null then raise exception 'cliente_inexistente'; end if;
  if v_role <> 'CLIENT' or exists (select 1 from public.admins a where a.user_id = p_user_id) then raise exception 'no_es_cliente'; end if;
  if exists (select 1 from public.room_completions rc where rc.user_id = p_user_id and rc.room_id = p_room_id) then raise exception 'sala_ya_validada'; end if;
  insert into public.room_completions (user_id, room_id, verified, verified_at, verified_by, reservation_ref)
  values (p_user_id, p_room_id, true, now(), auth.uid(), p_reservation_ref) returning id into v_completion_id;
  insert into public.room_runs (user_id, room_id, gm_id, keys_awarded) values (p_user_id, p_room_id, auth.uid(), v_keys);
  return jsonb_build_object('ok', true, 'completion_id', v_completion_id, 'room', v_room.name, 'keys', v_keys);
end;
$$;
