-- Reservas web (WooCommerce) en Supabase + validación de salas por el GM.
--
-- Origen de los datos: hoja VENTAS ONLINE de "ORIGEN ESCAPE - Base de
-- Atribución". Las sube la edge function `reservas-sync` (Apps Script
-- SyncReservas.gs cada 15 minutos + una carga inicial).
--
-- Por qué: al 09/11/2026 solo 4 de cada 100 juegos web tenían la sala validada
-- en la app, porque validar dependía de que cada cliente escaneara el QR. Con
-- esto el GM ve las reservas del día de su sucursal y valida la sala de cada
-- jugador desde el panel.

-- ============================================================
-- 1) Tabla
-- ============================================================
create table if not exists public.web_reservations (
  referencia     text primary key,          -- REFERENCIA (WC-4702)
  recibido_at    timestamptz,               -- RECIBIDO
  pedido_at      timestamptz,               -- FECHA DEL PEDIDO
  estado         text,                      -- processing / completed / pending / cancelled ...
  marca          text,                      -- MARCA tal cual (EG Nunez)
  servicio       text,                      -- SERVICIO tal cual (3 Participantes · The Game)
  monto          numeric,
  cantidad       integer,                   -- CANTIDAD
  visita_texto   text,                      -- FECHA DE LA VISITA tal cual
  nombre         text,
  email          text,
  telefono       text,                      -- TELEFONO (normalizado por ORIGEN)
  cupon          text,
  origen         text,
  campana        text,
  medio          text,
  dispositivo    text,
  booknetic_id   text,
  -- Derivados (los calcula el trigger, no se mandan):
  branch_id      uuid references public.branches(id) on delete set null,
  sala_texto     text,
  room_id        uuid references public.rooms_v2(id) on delete set null,
  participantes  smallint,
  visit_date     date,
  visit_at       timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists web_reservations_branch_date_idx on public.web_reservations (branch_id, visit_date);
create index if not exists web_reservations_email_idx on public.web_reservations (lower(email));
create index if not exists web_reservations_tel8_idx on public.web_reservations (right(regexp_replace(coalesce(telefono, ''), '\D', '', 'g'), 8));

-- Normaliza para comparar nombres: minúsculas, sin acentos, sin "EG ", sin dobles espacios.
create or replace function public.eg_norm(p text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(p, '')), 'áéíóúüñ', 'aeiouun'),
    '\s+', ' ', 'g'))
$$;

-- ============================================================
-- 2) Derivados al insertar / actualizar
-- ============================================================
create or replace function public.web_reservations_derive()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_marca text := public.eg_norm(regexp_replace(coalesce(new.marca, ''), '^\s*EG\s+', '', 'i'));
  v_sala  text;
  v_m     text[];
begin
  new.updated_at := now();

  -- Sucursal
  select b.id into new.branch_id
  from public.branches b
  where public.eg_norm(b.name) = v_marca
  limit 1;

  -- Sala: lo que viene después del "·" del servicio
  if position('·' in coalesce(new.servicio, '')) > 0 then
    new.sala_texto := nullif(btrim(split_part(new.servicio, '·', 2)), '');
  else
    new.sala_texto := null;
  end if;

  new.room_id := null;
  if new.sala_texto is not null and new.branch_id is not null then
    v_sala := public.eg_norm(new.sala_texto);
    select r.id into new.room_id
    from public.rooms_v2 r
    where r.branch_id = new.branch_id
      and (
        public.eg_norm(r.name) = v_sala
        or public.eg_norm(r.name) like v_sala || '%'
        or v_sala like public.eg_norm(r.name) || '%'
      )
    order by (public.eg_norm(r.name) = v_sala) desc, r.active desc, length(r.name)
    limit 1;
  end if;

  -- Jugadores: "3 Participantes"
  v_m := regexp_match(coalesce(new.servicio, ''), '(\d+)\s*Participantes', 'i');
  new.participantes := case when v_m is null then null else least(v_m[1]::int, 99)::smallint end;

  -- Visita: "22/9/2026 18:15:00" o "16/9/2026" (hora de Argentina)
  v_m := regexp_match(coalesce(new.visita_texto, ''), '^(\d{1,2})/(\d{1,2})/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?');
  if v_m is null then
    new.visit_date := null;
    new.visit_at := null;
  else
    begin
      new.visit_date := make_date(v_m[3]::int, v_m[2]::int, v_m[1]::int);
      if v_m[4] is not null then
        new.visit_at := make_timestamptz(v_m[3]::int, v_m[2]::int, v_m[1]::int, v_m[4]::int, v_m[5]::int, 0, 'America/Argentina/Buenos_Aires');
      else
        new.visit_at := null;
      end if;
    exception when others then
      new.visit_date := null;
      new.visit_at := null;
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_web_reservations_derive on public.web_reservations;
create trigger trg_web_reservations_derive
  before insert or update on public.web_reservations
  for each row execute function public.web_reservations_derive();

-- ============================================================
-- 3) Seguridad: solo lectura para el panel, por sucursal
-- ============================================================
alter table public.web_reservations enable row level security;

drop policy if exists web_reservations_select_admin on public.web_reservations;
create policy web_reservations_select_admin on public.web_reservations
  for select using (
    exists (
      select 1 from public.admins a
      where a.user_id = auth.uid()
        and (a.is_super or a.branch_id = web_reservations.branch_id)
    )
  );
-- Sin políticas de escritura: solo escriben la edge function (service role)
-- y las funciones SECURITY DEFINER de abajo.

-- ============================================================
-- 4) Vínculo validación ↔ reserva
-- ============================================================
alter table public.room_completions
  add column if not exists reservation_ref text references public.web_reservations(referencia) on delete set null;

create index if not exists room_completions_reservation_ref_idx on public.room_completions (reservation_ref);

-- ============================================================
-- 5) Funciones para el panel
-- ============================================================

-- Sucursal del admin que llama. null = super (ve todas). Error si no es admin.
create or replace function public.eg_caller_branch()
returns table (is_super boolean, branch_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $$
  select a.is_super, a.branch_id from public.admins a where a.user_id = auth.uid() limit 1
$$;

-- Reservas de un día con lo ya validado y el comprador si tiene la app.
create or replace function public.admin_reservations_for_day(p_date date, p_branch_id uuid default null)
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
begin
  select c.is_super, c.branch_id into v_super, v_branch from public.eg_caller_branch() c;
  if v_super is null then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  v_target := case when v_super then p_branch_id else v_branch end;
  if not v_super and v_target is null then
    raise exception 'gm_sin_sucursal' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.visit_at nulls last, x.referencia)
    from (
      select
        w.referencia, w.estado, w.visit_date, w.visit_at, w.servicio, w.sala_texto,
        w.room_id, r.name as room_name, w.participantes, w.nombre, w.email, w.telefono, w.cupon,
        w.branch_id, b.name as branch_name,
        buyer.id as buyer_user_id, buyer.alias as buyer_alias,
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'user_id', rc.user_id, 'nombre', trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')),
            'alias', p.alias, 'room_id', rc.room_id, 'completed_at', rc.completed_at
          ) order by rc.completed_at)
          from public.room_completions rc
          join public.profiles p on p.id = rc.user_id
          where rc.reservation_ref = w.referencia
        ), '[]'::jsonb) as validados
      from public.web_reservations w
      left join public.rooms_v2 r on r.id = w.room_id
      left join public.branches b on b.id = w.branch_id
      left join lateral (
        select p.id, p.alias
        from public.profiles p
        where coalesce(p.role, 'CLIENT') = 'CLIENT'
          and (
            (w.email is not null and lower(p.mail) = lower(w.email))
            or (length(right(regexp_replace(coalesce(w.telefono, ''), '\D', '', 'g'), 8)) = 8
                and right(regexp_replace(coalesce(p.tel_cod_area, '') || coalesce(p.tel_numero, ''), '\D', '', 'g'), 8)
                    = right(regexp_replace(coalesce(w.telefono, ''), '\D', '', 'g'), 8))
          )
        order by coalesce(lower(p.mail) = lower(w.email), false) desc
        limit 1
      ) buyer on true
      where w.visit_date = p_date
        and w.estado in ('processing', 'completed')
        and (v_target is null or w.branch_id = v_target)
    ) x
  ), '[]'::jsonb);
end;
$$;

-- Buscador de clientes para validar (los GM no leen profiles directo).
create or replace function public.admin_search_clients(p_q text)
returns table (id uuid, nombre text, apellido text, alias text, mail text, photo_url text)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_q text := btrim(coalesce(p_q, ''));
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;
  if length(v_q) < 3 then
    return;
  end if;

  return query
  select p.id, p.nombre, p.apellido, p.alias, p.mail, p.photo_url
  from public.profiles p
  where coalesce(p.role, 'CLIENT') = 'CLIENT'
    and p.id not in (select a.user_id from public.admins a)
    and (
      p.mail ilike '%' || v_q || '%'
      or p.alias ilike '%' || v_q || '%'
      or (coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')) ilike '%' || v_q || '%'
    )
  order by coalesce(lower(p.mail) = lower(v_q) or lower(p.alias) = lower(v_q), false) desc, p.created_at desc
  limit 15;
end;
$$;

-- Valida la sala de un cliente: misma operación que hace la app al escanear
-- el QR (room_completions) + poner el código GM (room_runs con las llaves).
create or replace function public.admin_validate_room(
  p_user_id uuid,
  p_room_id uuid,
  p_keys integer,
  p_reservation_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_super boolean;
  v_branch uuid;
  v_room record;
  v_res record;
  v_role text;
  v_keys integer := greatest(0, least(10, coalesce(p_keys, 0)));
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_count integer;
  v_completion_id uuid;
begin
  select c.is_super, c.branch_id into v_super, v_branch from public.eg_caller_branch() c;
  if v_super is null then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  select r.id, r.branch_id, r.active, r.name into v_room from public.rooms_v2 r where r.id = p_room_id;
  if v_room.id is null or not v_room.active then
    raise exception 'sala_invalida';
  end if;
  if not v_super and v_room.branch_id is distinct from v_branch then
    raise exception 'sala_de_otra_sucursal' using errcode = '42501';
  end if;

  if p_reservation_ref is not null then
    select w.referencia, w.branch_id, w.estado, w.visit_date, w.participantes into v_res
    from public.web_reservations w where w.referencia = p_reservation_ref;
    if v_res.referencia is null then
      raise exception 'reserva_inexistente';
    end if;
    if v_res.estado not in ('processing', 'completed') then
      raise exception 'reserva_no_pagada';
    end if;
    if v_res.branch_id is distinct from v_room.branch_id then
      raise exception 'reserva_de_otra_sucursal';
    end if;
    if v_res.visit_date is null or v_res.visit_date > v_today or v_res.visit_date < v_today - 7 then
      raise exception 'reserva_fuera_de_fecha';
    end if;
    if v_res.participantes is not null then
      select count(*) into v_count from public.room_completions rc where rc.reservation_ref = p_reservation_ref;
      if v_count >= v_res.participantes then
        raise exception 'reserva_completa';
      end if;
    end if;
  end if;

  select coalesce(p.role, 'CLIENT') into v_role from public.profiles p where p.id = p_user_id;
  if v_role is null then
    raise exception 'cliente_inexistente';
  end if;
  if v_role <> 'CLIENT' or exists (select 1 from public.admins a where a.user_id = p_user_id) then
    raise exception 'no_es_cliente';
  end if;

  if exists (select 1 from public.room_completions rc where rc.user_id = p_user_id and rc.room_id = p_room_id) then
    raise exception 'sala_ya_validada';
  end if;

  insert into public.room_completions (user_id, room_id, verified, verified_at, verified_by, reservation_ref)
  values (p_user_id, p_room_id, true, now(), auth.uid(), p_reservation_ref)
  returning id into v_completion_id;

  insert into public.room_runs (user_id, room_id, gm_id, keys_awarded)
  values (p_user_id, p_room_id, auth.uid(), v_keys);

  return jsonb_build_object('ok', true, 'completion_id', v_completion_id, 'room', v_room.name, 'keys', v_keys);
end;
$$;

revoke all on function public.admin_reservations_for_day(date, uuid) from public, anon;
revoke all on function public.admin_search_clients(text) from public, anon;
revoke all on function public.admin_validate_room(uuid, uuid, integer, text) from public, anon;
revoke all on function public.eg_caller_branch() from public, anon;
grant execute on function public.admin_reservations_for_day(date, uuid) to authenticated;
grant execute on function public.admin_search_clients(text) to authenticated;
grant execute on function public.admin_validate_room(uuid, uuid, integer, text) to authenticated;
grant execute on function public.eg_caller_branch() to authenticated;

-- ============================================================
-- 6) Sección del panel habilitada para GM
-- ============================================================
insert into public.admin_section_permissions (role, section_key, enabled, updated_at)
values ('GM', 'reservations', true, now())
on conflict (role, section_key) do nothing;
