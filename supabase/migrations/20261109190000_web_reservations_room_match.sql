-- Mejor reconocimiento de la sala en las reservas web.
--
-- WooCommerce escribe las salas distinto que la app: "Mi pobre Angelito - EG
-- BARILOCHE", "Monja" (La Monja), "Alien el 8vo Pasajero" (8vo.),
-- "Hospital Macabro (A)" (Hospital Macabro EG Studios). La clave compara sin
-- sufijo de sucursal, paréntesis, signos, artículo inicial ni "EG"/"en".

create or replace function public.eg_room_key(p text, p_branch text)
returns text
language plpgsql
immutable
as $$
declare
  s text := public.eg_norm(p);
  b text := public.eg_norm(p_branch);
begin
  s := regexp_replace(s, '\s+-\s+eg\s+.*$', '');          -- " - EG BARILOCHE"
  s := regexp_replace(s, '\([^)]*\)', ' ', 'g');           -- "(A)"
  s := regexp_replace(s, '[^a-z0-9 ]', ' ', 'g');          -- signos
  s := ' ' || regexp_replace(s, '\s+', ' ', 'g') || ' ';
  if b <> '' then
    s := replace(s, ' ' || b || ' ', ' ');                 -- nombre de la sucursal
  end if;
  s := regexp_replace(s, ' (eg|en) ', ' ', 'g');
  s := regexp_replace(s, ' (eg|en) ', ' ', 'g');
  s := btrim(regexp_replace(s, '\s+', ' ', 'g'));
  s := regexp_replace(s, '^(la|el|los|las) ', '');         -- artículo inicial
  return s;
end;
$$;

create or replace function public.web_reservations_derive() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_marca text := public.eg_norm(regexp_replace(coalesce(new.marca, ''), '^\s*EG\s+', '', 'i'));
  v_branch_name text;
  v_key text;
  v_m text[];
begin
  new.updated_at := now();
  select b.id, b.name into new.branch_id, v_branch_name from public.branches b where public.eg_norm(b.name) = v_marca limit 1;

  if position('·' in coalesce(new.servicio, '')) > 0 then
    new.sala_texto := nullif(btrim(split_part(new.servicio, '·', 2)), '');
  else
    new.sala_texto := null;
  end if;

  new.room_id := null;
  if new.sala_texto is not null and new.branch_id is not null then
    v_key := public.eg_room_key(new.sala_texto, v_branch_name);
    if v_key <> '' then
      select r.id into new.room_id from public.rooms_v2 r
      where r.branch_id = new.branch_id
        and (public.eg_room_key(r.name, v_branch_name) = v_key
          or public.eg_room_key(r.name, v_branch_name) like v_key || '%'
          or v_key like public.eg_room_key(r.name, v_branch_name) || '%')
      order by (public.eg_room_key(r.name, v_branch_name) = v_key) desc, r.active desc, length(r.name)
      limit 1;
    end if;
  end if;

  v_m := regexp_match(coalesce(new.servicio, ''), '(\d+)\s*Participantes', 'i');
  new.participantes := case when v_m is null then null else least(v_m[1]::int, 99)::smallint end;

  v_m := regexp_match(coalesce(new.visita_texto, ''), '^(\d{1,2})/(\d{1,2})/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?');
  if v_m is null then
    new.visit_date := null; new.visit_at := null;
  else
    begin
      new.visit_date := make_date(v_m[3]::int, v_m[2]::int, v_m[1]::int);
      if v_m[4] is not null then
        new.visit_at := make_timestamptz(v_m[3]::int, v_m[2]::int, v_m[1]::int, v_m[4]::int, v_m[5]::int, 0, 'America/Argentina/Buenos_Aires');
      else
        new.visit_at := null;
      end if;
    exception when others then
      new.visit_date := null; new.visit_at := null;
    end;
  end if;
  return new;
end;
$$;

-- Recalcular las reservas ya cargadas.
update public.web_reservations set updated_at = now();
