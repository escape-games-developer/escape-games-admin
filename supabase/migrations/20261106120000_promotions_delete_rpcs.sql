-- =====================================================================
-- Beneficios › Promociones: borrado de promociones y de beneficios de clientes
-- =====================================================================
--
-- Pensado para limpiar PRUEBAS desde el panel. Dos RPC:
--
--   · delete_promotion(p_promotion_id)          → borra la promoción entera:
--       sus beneficios otorgados (user_promotions), sus QR por sucursal /
--       punto / sala y cualquier otra fila que la referencie.
--   · delete_user_promotion(p_user_promotion_id) → borra UN beneficio otorgado
--       a un cliente (una fila de la tab "Clientes").
--
-- Mismo gate que el resto de las RPC de escritura: `is_promo_admin()`
-- (ADMIN_GENERAL o ADMIN). Un GM no puede borrar nada.
--
-- Las tablas que dependen de `promotions` y `user_promotions` no están
-- versionadas en este repo (se crearon directo en prod). Por eso las funciones
-- NO nombran tablas hijas a mano: leen las foreign keys de `pg_constraint` y
-- borran primero los nietos, después los hijos y al final la fila pedida.
-- Si una FK ya es ON DELETE CASCADE, el borrado explícito no cambia nada.
--
-- La imagen del bucket la borra el panel después de que esta RPC confirma.
-- =====================================================================

-- Helper interno: borra todo lo que referencia a las filas de `p_root` cuyo
-- `p_root_col` está en el conjunto que devuelve `p_root_filter` (SQL con $1).
-- Dos niveles: hijos y nietos. No se expone a la API.
create or replace function public._promo_delete_dependents(
  p_root regclass,
  p_root_filter text,
  p_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  child record;
  grandchild record;
begin
  for child in
    select c.conrelid::regclass as tbl, a.attname as col, af.attname as refcol
    from pg_constraint c
    join pg_attribute a  on a.attrelid  = c.conrelid  and a.attnum  = c.conkey[1]
    join pg_attribute af on af.attrelid = c.confrelid and af.attnum = c.confkey[1]
    where c.contype = 'f'
      and c.confrelid = p_root
      and c.conrelid <> p_root
      and array_length(c.conkey, 1) = 1
  loop
    -- Nietos: filas que referencian a las filas hijas que se van a borrar.
    for grandchild in
      select c.conrelid::regclass as tbl, a.attname as col, af.attname as refcol
      from pg_constraint c
      join pg_attribute a  on a.attrelid  = c.conrelid  and a.attnum  = c.conkey[1]
      join pg_attribute af on af.attrelid = c.confrelid and af.attnum = c.confkey[1]
      where c.contype = 'f'
        and c.confrelid = child.tbl
        and c.conrelid <> child.tbl
        and c.conrelid <> p_root
        and array_length(c.conkey, 1) = 1
    loop
      execute format(
        'delete from %s where %I in (select %I from %s where %I in (%s))',
        grandchild.tbl, grandchild.col, grandchild.refcol, child.tbl, child.col,
        format(p_root_filter, child.refcol)
      ) using p_id;
    end loop;

    execute format(
      'delete from %s where %I in (%s)',
      child.tbl, child.col, format(p_root_filter, child.refcol)
    ) using p_id;
  end loop;
end;
$$;

revoke all on function public._promo_delete_dependents(regclass, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- delete_promotion
-- ---------------------------------------------------------------------
create or replace function public.delete_promotion(p_promotion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_promo_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if not exists (select 1 from public.promotions where id = p_promotion_id) then
    raise exception 'PROMOTION_NOT_FOUND';
  end if;

  -- %I = columna de `promotions` referenciada por la FK (normalmente `id`).
  perform public._promo_delete_dependents(
    'public.promotions'::regclass,
    'select %I from public.promotions where id = $1',
    p_promotion_id
  );

  delete from public.promotions where id = p_promotion_id;
end;
$$;

revoke all on function public.delete_promotion(uuid) from public, anon;
grant execute on function public.delete_promotion(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- delete_user_promotion
-- ---------------------------------------------------------------------
create or replace function public.delete_user_promotion(p_user_promotion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_promo_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if not exists (select 1 from public.user_promotions where id = p_user_promotion_id) then
    raise exception 'USER_PROMOTION_NOT_FOUND';
  end if;

  perform public._promo_delete_dependents(
    'public.user_promotions'::regclass,
    'select %I from public.user_promotions where id = $1',
    p_user_promotion_id
  );

  delete from public.user_promotions where id = p_user_promotion_id;
end;
$$;

revoke all on function public.delete_user_promotion(uuid) from public, anon;
grant execute on function public.delete_user_promotion(uuid) to authenticated;

-- PostgREST: refrescar el caché de esquema para que las RPC nuevas aparezcan.
notify pgrst, 'reload schema';
