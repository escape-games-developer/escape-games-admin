-- Dos cambios de modelo:
--
-- 1) `maximo_personas` deja de ser tope de cálculo y pasa a ser AFORO del
--    local. 0 = sin definir. El tope de descuento es `congela_desde_personas`
--    y son cosas distintas: el invitado 36 se cotiza al precio congelado.
--
-- 2) Los acompañantes se separan por servicio gastronómico en vez de por
--    dónde esperan. `pct_acompanante_sin_gastronomia` en 0 = no suman.
--
-- OJO: esta migración quedó mal y no surtió efecto sobre las claves de
-- porcentajes — el `||` final reconstruía `escaparty` desde la columna
-- original y descartaba los jsonb_set previos. La arregla la migración
-- 20260819234500. Se deja como registro de lo que efectivamente corrió.
update public.intranet_config
set cotizador = jsonb_set(
      jsonb_set(
        (cotizador #- '{escaparty,pct_adulto_acompanante}')
                  #- '{escaparty,pct_adulto_salon}',
        '{escaparty,pct_acompanante_con_gastronomia}', to_jsonb(50)
      ),
      '{escaparty,pct_acompanante_sin_gastronomia}', to_jsonb(0)
    )
    || jsonb_build_object('escaparty',
         (cotizador -> 'escaparty') || jsonb_build_object('maximo_personas', 0)
       ),
    updated_at = now()
where id = 'default';
