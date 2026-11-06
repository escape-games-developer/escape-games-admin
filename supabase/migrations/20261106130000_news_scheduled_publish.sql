-- =====================================================================
-- Novedades: publicación programada
-- =====================================================================
--
-- El panel guarda la novedad completa pero INACTIVA (la app no la muestra),
-- con la fecha y hora en `scheduled_at`. Un job de pg_cron corre cada minuto,
-- activa las novedades vencidas y, si `scheduled_push` está en true, manda la
-- push a todos los dispositivos.
--
-- La push sale DESDE LA BASE con pg_net (ya instalado), directo a Expo, con el
-- mismo formato de mensaje que la Edge Function `send-news-push`. Así no hace
-- falta desplegar otra función ni guardar secretos. Lo único que no replica es
-- la limpieza de tokens muertos (pg_net es asíncrono y no se lee la respuesta);
-- esa limpieza la sigue haciendo cada push manual desde el panel.
--
-- Requisito: la extensión pg_cron. Este script la habilita; si Supabase no lo
-- deja por SQL, se enciende en Database › Extensions › pg_cron y se vuelve a
-- correr el script.
-- =====================================================================

create extension if not exists pg_cron;

-- ---------------------------------------------------------------------
-- Columnas nuevas
-- ---------------------------------------------------------------------
alter table public.news_v1
  add column if not exists scheduled_at timestamptz,
  add column if not exists scheduled_push boolean not null default false;

comment on column public.news_v1.scheduled_at is
  'Fecha y hora en que se activa sola. NULL = sin programación.';
comment on column public.news_v1.scheduled_push is
  'Si al activarse por programación tiene que mandar la push.';

create index if not exists news_v1_scheduled_at_idx
  on public.news_v1 (scheduled_at)
  where scheduled_at is not null;

-- ---------------------------------------------------------------------
-- Push a todos los dispositivos (espejo de send-news-push)
-- ---------------------------------------------------------------------
create or replace function public._send_news_push_from_db(
  p_news_id text,
  p_title text,
  p_description text,
  p_type text,
  p_published_at text,
  p_image_url text,
  p_cta_link text
) returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_tokens text[];
  v_body text;
  v_batch text[];
  v_messages jsonb;
  v_total integer := 0;
  i integer;
begin
  -- Misma limpieza de texto que stripAndTrim() de la Edge Function (120 chars).
  v_body := coalesce(nullif(p_description, ''), p_title, '');
  v_body := regexp_replace(v_body, '\*\*|__|_', '', 'g');
  v_body := regexp_replace(v_body, '<[^>]*>', '', 'g');
  v_body := btrim(regexp_replace(v_body, '\s+', ' ', 'g'));
  if length(v_body) > 120 then
    v_body := left(v_body, 119) || '…';
  end if;
  if v_body = '' then
    v_body := p_title;
  end if;

  -- Tokens únicos: el mismo dispositivo puede estar en más de un perfil.
  select array_agg(distinct expo_push_token)
    into v_tokens
  from public.profiles
  where expo_push_token like 'ExponentPushToken[%';

  if v_tokens is null then
    return 0;
  end if;

  -- Expo acepta como máximo 100 mensajes por request.
  i := 1;
  while i <= array_length(v_tokens, 1) loop
    v_batch := v_tokens[i : i + 99];

    select jsonb_agg(jsonb_build_object(
      'to', t,
      'sound', 'default',
      'title', p_title,
      'body', v_body,
      'data', jsonb_build_object(
        'screen', 'index',
        'newsId', p_news_id,
        'type', p_type,
        'publishedAt', p_published_at,
        'imageUrl', nullif(p_image_url, ''),
        'ctaLink', nullif(p_cta_link, '')
      )
    ))
    into v_messages
    from unnest(v_batch) as t;

    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := v_messages,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Accept', 'application/json'
      ),
      timeout_milliseconds := 15000
    );

    v_total := v_total + array_length(v_batch, 1);
    i := i + 100;
  end loop;

  return v_total;
end;
$$;

revoke all on function public._send_news_push_from_db(text, text, text, text, text, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Publicar las novedades programadas vencidas
-- ---------------------------------------------------------------------
create or replace function public.publish_scheduled_news()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n record;
  v_count integer := 0;
begin
  -- SKIP LOCKED: si una corrida se pisa con la siguiente, ninguna novedad se
  -- publica (ni manda push) dos veces.
  for n in
    select id, title, description, type, published_at, image_url, cta_link, scheduled_push
    from public.news_v1
    where scheduled_at is not null
      and scheduled_at <= now()
    order by scheduled_at
    for update skip locked
  loop
    update public.news_v1
       set active = true,
           scheduled_at = null,
           scheduled_push = false,
           updated_at = now()
     where id = n.id;

    if n.scheduled_push then
      begin
        perform public._send_news_push_from_db(
          n.id::text, n.title, n.description, n.type::text, n.published_at::text, n.image_url, n.cta_link
        );
      exception when others then
        -- Una push caída no tiene que dejar la novedad sin publicar.
        raise warning 'publish_scheduled_news: push falló para %: %', n.id, sqlerrm;
      end;
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.publish_scheduled_news() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Job: cada minuto. Con el mismo nombre, re-correr el script lo actualiza.
-- ---------------------------------------------------------------------
select cron.schedule(
  'publish-scheduled-news',
  '* * * * *',
  $$select public.publish_scheduled_news();$$
);
