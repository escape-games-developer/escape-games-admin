-- La migración anterior se pisó sola: el `||` final reconstruía `escaparty`
-- desde la columna original y descartaba los jsonb_set previos. Acá se
-- reescribe el objeto completo leyendo cada valor vigente, así lo que ya está
-- cargado se conserva y solo cambian las claves del modelo nuevo.
update public.intranet_config
set cotizador = jsonb_set(
      cotizador,
      '{escaparty}',
      jsonb_build_object(
        'minimo_personas',         coalesce(cotizador #> '{escaparty,minimo_personas}', to_jsonb(10)),
        'congela_desde_personas',  coalesce(cotizador #> '{escaparty,congela_desde_personas}', to_jsonb(35)),
        -- Aforo, no tope de descuento. 0 = sin definir.
        'maximo_personas',         to_jsonb(0),
        'base_menores',            coalesce(cotizador #> '{escaparty,base_menores}', to_jsonb(45000)),
        'base_adultos',            coalesce(cotizador #> '{escaparty,base_adultos}', to_jsonb(52000)),
        'decremento_por_persona',  coalesce(cotizador #> '{escaparty,decremento_por_persona}', to_jsonb(300)),
        'piso_precio_por_persona', coalesce(cotizador #> '{escaparty,piso_precio_por_persona}', to_jsonb(20000)),
        'anticipo',                coalesce(cotizador #> '{escaparty,anticipo}', to_jsonb(100000)),
        -- Acompañantes separados por servicio gastronómico. El "sin" en 0 no suma.
        'pct_acompanante_con_gastronomia', to_jsonb(50),
        'pct_acompanante_sin_gastronomia', to_jsonb(0),
        'edad_requiere_adulto',    coalesce(cotizador #> '{escaparty,edad_requiere_adulto}', to_jsonb(14))
      )
    ),
    updated_at = now()
where id = 'default';
