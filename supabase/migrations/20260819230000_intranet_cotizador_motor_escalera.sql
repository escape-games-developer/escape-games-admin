-- Reemplaza el jsonb del cotizador por el esquema del manual: escalera con
-- decremento plano, tope de congelamiento, piso, anticipo y porcentajes de
-- adultos. Las claves van en snake_case, como en el manual.
--
-- Se reemplaza entero (no jsonb_set) porque el shape anterior no tiene
-- equivalente campo a campo: `precioPorPersona` fijo pasa a ser una escalera.
-- Los dos bases se conservan: 45000 / 52000 son los de la tabla publicada.
--
-- juego_social.precio_por_jugador queda en 0 = todavía sin cargar; el
-- cotizador avisa en esa pestaña hasta que se cargue.
update public.intranet_config
set cotizador = jsonb_build_object(
      'escaparty', jsonb_build_object(
        'minimo_personas',         10,
        'maximo_personas',         35,
        'congela_desde_personas',  35,
        'base_menores',            45000,
        'base_adultos',            52000,
        'decremento_por_persona',  300,
        'piso_precio_por_persona', 20000,
        'anticipo',                100000,
        'pct_adulto_acompanante',  50,
        'pct_adulto_salon',        50,
        'edad_requiere_adulto',    14
      ),
      'juego_social', jsonb_build_object(
        'precio_por_jugador', 0,
        'promos', jsonb_build_object(
          'pack_familiar', jsonb_build_object('descuento', 25, 'minimo', 4),
          'promo_amigos',  jsonb_build_object('descuento', 20, 'minimo', 3),
          'sin_descuento', jsonb_build_object('descuento', 0,  'minimo', 0)
        )
      )
    ),
    -- Vuelve a false: el motor cambió y `congela_desde_personas` sigue
    -- pendiente de confirmar.
    precios_confirmados = false,
    updated_at = now()
where id = 'default';
